import { randomUUID } from "crypto"
import { TRPCError } from "@trpc/server"
import type { z } from "zod"
import { createTRPCRouter, protectedProcedure } from "@/lib/trpc/init"
import type { Context } from "@/lib/trpc/context"
import { createServiceRoleClient } from "@/lib/supabase/service-role"
import { writeActivityLog } from "@/lib/audit/activity"
import { getCachedPermissions } from "@/modules/iam/lib/permissions"
import {
  attachmentIdInput,
  confirmUploadInput,
  createUploadInput,
  listAttachmentsInput,
  type attachmentEntityEnum,
  type Attachment,
} from "./schema"

/**
 * Files on inquiries, customers, quotes and jobs (Bixin: "Medien").
 * Uploads go straight from the browser to the private bucket with a signed
 * upload URL issued after the access check; downloads use signed URLs.
 */

const BUCKET = "attachments"
type Entity = z.infer<typeof attachmentEntityEnum>
type Ctx = Context & { user: NonNullable<Context["user"]> }

const ENTITY: Record<Entity, { table: string; view: string; edit: string }> = {
  lead: { table: "leads", view: "leads.view", edit: "leads.edit" },
  customer: { table: "customers", view: "customers.view", edit: "customers.edit" },
  quote: { table: "quotes", view: "quotes.view", edit: "quotes.edit" },
  job: { table: "jobs", view: "jobs.view", edit: "jobs.edit" },
}

async function requirePermission(ctx: Ctx, key: string) {
  if (ctx.role === "owner") return
  if (!ctx.companyId) throw new TRPCError({ code: "UNAUTHORIZED" })
  const perms = await getCachedPermissions(ctx.user.id, ctx.companyId)
  if (!perms.keys.has(key))
    throw new TRPCError({ code: "FORBIDDEN", message: `Fehlendes Recht: ${key}` })
}

/** The record must exist in the user's active company (RLS on the user's client). */
async function requireRecord(ctx: Ctx, entityType: Entity, entityId: string) {
  const { data } = await ctx.supabase
    .from(ENTITY[entityType].table)
    .select("id")
    .eq("id", entityId)
    .maybeSingle()
  if (!data) throw new TRPCError({ code: "NOT_FOUND", message: "Eintrag nicht gefunden." })
}

function safeName(name: string): string {
  return (
    name
      .normalize("NFKD")
      .replace(/[^\w.-]+/g, "_")
      .slice(-80) || "datei"
  )
}

export const attachmentsRouter = createTRPCRouter({
  list: protectedProcedure
    .input(listAttachmentsInput)
    .query(async ({ ctx, input }): Promise<Attachment[]> => {
      await requirePermission(ctx, ENTITY[input.entityType].view)
      const { data, error } = await ctx.supabase
        .from("attachments")
        .select("id, file_name, mime_type, size_bytes, created_at")
        .eq("entity_type", input.entityType)
        .eq("entity_id", input.entityId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" })
      return (data ?? []).map((a) => ({
        id: a.id as string,
        fileName: a.file_name as string,
        mimeType: a.mime_type as string,
        sizeBytes: a.size_bytes as number,
        createdAt: a.created_at as string,
      }))
    }),

  /** Step 1: signed upload URL for one file. */
  createUpload: protectedProcedure.input(createUploadInput).mutation(async ({ ctx, input }) => {
    await requirePermission(ctx, ENTITY[input.entityType].edit)
    await requireRecord(ctx, input.entityType, input.entityId)
    const path = `${ctx.companyId}/${input.entityType}/${input.entityId}/${randomUUID()}-${safeName(input.fileName)}`
    const { data, error } = await createServiceRoleClient()
      .storage.from(BUCKET)
      .createSignedUploadUrl(path)
    if (error || !data)
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Hochladen fehlgeschlagen." })
    return { path, token: data.token }
  }),

  /** Step 2: after the browser uploaded the file, register it. */
  confirmUpload: protectedProcedure.input(confirmUploadInput).mutation(async ({ ctx, input }) => {
    await requirePermission(ctx, ENTITY[input.entityType].edit)
    await requireRecord(ctx, input.entityType, input.entityId)
    if (!input.path.startsWith(`${ctx.companyId}/${input.entityType}/${input.entityId}/`))
      throw new TRPCError({ code: "BAD_REQUEST", message: "Ungültiger Dateipfad." })

    const svc = createServiceRoleClient()
    const folder = input.path.slice(0, input.path.lastIndexOf("/"))
    const name = input.path.slice(input.path.lastIndexOf("/") + 1)
    const { data: found } = await svc.storage.from(BUCKET).list(folder, { search: name })
    if (!found?.some((f) => f.name === name))
      throw new TRPCError({ code: "BAD_REQUEST", message: "Datei wurde nicht hochgeladen." })

    const { data, error } = await ctx.supabase
      .from("attachments")
      .insert({
        company_id: ctx.companyId,
        entity_type: input.entityType,
        entity_id: input.entityId,
        file_name: input.fileName,
        storage_path: input.path,
        mime_type: input.mimeType,
        size_bytes: input.sizeBytes,
        uploaded_by: ctx.user.id,
      })
      .select("id")
      .single()
    if (error || !data)
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Speichern fehlgeschlagen." })
    await writeActivityLog(ctx, {
      action: "attachment.added",
      entityType: input.entityType,
      entityId: input.entityId,
      metadata: { attachment_id: data.id, file_name: input.fileName },
    })
    return { id: data.id as string }
  }),

  url: protectedProcedure.input(attachmentIdInput).query(async ({ ctx, input }) => {
    const { data: a } = await ctx.supabase
      .from("attachments")
      .select("entity_type, storage_path")
      .eq("id", input.id)
      .is("deleted_at", null)
      .maybeSingle()
    if (!a) throw new TRPCError({ code: "NOT_FOUND", message: "Datei nicht gefunden." })
    await requirePermission(ctx, ENTITY[a.entity_type as Entity].view)
    const { data, error } = await createServiceRoleClient()
      .storage.from(BUCKET)
      .createSignedUrl(a.storage_path as string, 3600)
    if (error || !data) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" })
    return { url: data.signedUrl }
  }),

  remove: protectedProcedure.input(attachmentIdInput).mutation(async ({ ctx, input }) => {
    const { data: a } = await ctx.supabase
      .from("attachments")
      .select("entity_type, entity_id, file_name")
      .eq("id", input.id)
      .is("deleted_at", null)
      .maybeSingle()
    if (!a) throw new TRPCError({ code: "NOT_FOUND", message: "Datei nicht gefunden." })
    await requirePermission(ctx, ENTITY[a.entity_type as Entity].edit)
    const { error } = await ctx.supabase
      .from("attachments")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", input.id)
    if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" })
    await writeActivityLog(ctx, {
      action: "attachment.removed",
      entityType: a.entity_type as string,
      entityId: a.entity_id as string,
      metadata: { attachment_id: input.id, file_name: a.file_name },
    })
    return { id: input.id }
  }),
})
