import { z } from "zod"
import { TRPCError } from "@trpc/server"
import { createTRPCRouter, ownerProcedure, protectedProcedure } from "@/lib/trpc/init"
import { createServiceRoleClient } from "@/lib/supabase/service-role"
import { writeActivityLog } from "@/lib/audit/activity"
import { invalidatePermissionCache } from "../lib/permissions"

// ─── Permission group management (owner only) ─────────────────────────────────

export const permissionGroupsRouter = createTRPCRouter({
  list: ownerProcedure.query(async ({ ctx }) => {
    if (!ctx.companyId) throw new TRPCError({ code: "UNAUTHORIZED" })
    const svc = createServiceRoleClient()

    const { data: groups, error } = await svc
      .from("permission_groups")
      .select("id, name, description, color, is_default, created_at")
      .eq("company_id", ctx.companyId)
      .is("deleted_at", null)
      .order("created_at", { ascending: true })

    if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" })

    const groupIds = (groups ?? []).map((g) => g.id)

    const [{ data: assignments }, { data: memberships }] = await Promise.all([
      groupIds.length
        ? svc
            .from("permission_group_assignments")
            .select("group_id, permission_key")
            .eq("company_id", ctx.companyId)
            .in("group_id", groupIds)
        : Promise.resolve({ data: [] }),
      groupIds.length
        ? svc
            .from("user_permission_groups")
            .select("group_id")
            .eq("company_id", ctx.companyId)
            .in("group_id", groupIds)
        : Promise.resolve({ data: [] }),
    ])

    const permsByGroup = new Map<string, string[]>()
    for (const a of assignments ?? []) {
      if (!permsByGroup.has(a.group_id)) permsByGroup.set(a.group_id, [])
      permsByGroup.get(a.group_id)!.push(a.permission_key)
    }

    const memberCountByGroup = new Map<string, number>()
    for (const m of memberships ?? []) {
      memberCountByGroup.set(m.group_id, (memberCountByGroup.get(m.group_id) ?? 0) + 1)
    }

    return (groups ?? []).map((g) => ({
      id: g.id,
      name: g.name,
      description: g.description,
      color: g.color,
      isDefault: g.is_default,
      createdAt: g.created_at as string,
      permissions: permsByGroup.get(g.id) ?? [],
      memberCount: memberCountByGroup.get(g.id) ?? 0,
    }))
  }),

  create: ownerProcedure
    .input(
      z.object({
        name: z.string().min(1).max(100),
        description: z.string().max(500).optional(),
        color: z
          .string()
          .regex(/^#[0-9a-fA-F]{6}$/)
          .optional(),
        permissions: z.array(z.string()).default([]),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      if (!ctx.companyId) throw new TRPCError({ code: "UNAUTHORIZED" })
      const svc = createServiceRoleClient()

      const { data: group, error } = await svc
        .from("permission_groups")
        .insert({
          company_id: ctx.companyId,
          name: input.name,
          description: input.description ?? null,
          color: input.color ?? null,
          is_default: false,
        })
        .select("id, name")
        .single()

      if (error ?? !group) {
        if (error?.code === "23505") {
          throw new TRPCError({
            code: "CONFLICT",
            message: "A group with this name already exists.",
          })
        }
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" })
      }

      if (input.permissions.length > 0) {
        await svc.from("permission_group_assignments").insert(
          input.permissions.map((key) => ({
            group_id: group.id,
            permission_key: key,
            company_id: ctx.companyId!,
            created_by: ctx.user.id,
          })),
        )
      }

      await writeActivityLog(ctx, {
        action: "permission_group.created",
        entityType: "permission_group",
        entityId: group.id,
        entityLabel: group.name,
        afterState: { name: group.name, permissions: input.permissions },
      })

      return { id: group.id }
    }),

  update: ownerProcedure
    .input(
      z.object({
        groupId: z.string().uuid(),
        name: z.string().min(1).max(100).optional(),
        description: z.string().max(500).nullable().optional(),
        color: z
          .string()
          .regex(/^#[0-9a-fA-F]{6}$/)
          .nullable()
          .optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      if (!ctx.companyId) throw new TRPCError({ code: "UNAUTHORIZED" })
      const svc = createServiceRoleClient()

      const { data: before } = await svc
        .from("permission_groups")
        .select("id, name, description, color")
        .eq("id", input.groupId)
        .eq("company_id", ctx.companyId)
        .is("deleted_at", null)
        .maybeSingle()

      if (!before) throw new TRPCError({ code: "NOT_FOUND" })

      const updates: Record<string, unknown> = {}
      if (input.name !== undefined) updates["name"] = input.name
      if (input.description !== undefined) updates["description"] = input.description
      if (input.color !== undefined) updates["color"] = input.color

      const { error } = await svc
        .from("permission_groups")
        .update(updates)
        .eq("id", input.groupId)
        .eq("company_id", ctx.companyId)

      if (error) {
        if (error.code === "23505") {
          throw new TRPCError({
            code: "CONFLICT",
            message: "A group with this name already exists.",
          })
        }
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" })
      }

      await writeActivityLog(ctx, {
        action: "permission_group.updated",
        entityType: "permission_group",
        entityId: input.groupId,
        entityLabel: input.name ?? before.name,
        beforeState: { name: before.name, description: before.description, color: before.color },
        afterState: updates,
      })

      return { success: true }
    }),

  softDelete: ownerProcedure
    .input(z.object({ groupId: z.string().uuid() }))
    .mutation(async ({ input, ctx }) => {
      if (!ctx.companyId) throw new TRPCError({ code: "UNAUTHORIZED" })
      const svc = createServiceRoleClient()

      const { data: group } = await svc
        .from("permission_groups")
        .select("id, name")
        .eq("id", input.groupId)
        .eq("company_id", ctx.companyId)
        .is("deleted_at", null)
        .maybeSingle()

      if (!group) throw new TRPCError({ code: "NOT_FOUND" })

      // Load affected users before deletion to invalidate their caches
      const { data: members } = await svc
        .from("user_permission_groups")
        .select("user_id")
        .eq("group_id", input.groupId)
        .eq("company_id", ctx.companyId)

      await svc
        .from("permission_groups")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", input.groupId)
        .eq("company_id", ctx.companyId)

      for (const m of members ?? []) {
        invalidatePermissionCache(m.user_id, ctx.companyId)
      }

      await writeActivityLog(ctx, {
        action: "permission_group.deleted",
        entityType: "permission_group",
        entityId: input.groupId,
        entityLabel: group.name,
        beforeState: { name: group.name },
      })

      return { success: true }
    }),

  setPermissions: ownerProcedure
    .input(
      z.object({
        groupId: z.string().uuid(),
        permissions: z.array(z.string()),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      if (!ctx.companyId) throw new TRPCError({ code: "UNAUTHORIZED" })
      const svc = createServiceRoleClient()

      const { data: group } = await svc
        .from("permission_groups")
        .select("id, name")
        .eq("id", input.groupId)
        .eq("company_id", ctx.companyId)
        .is("deleted_at", null)
        .maybeSingle()

      if (!group) throw new TRPCError({ code: "NOT_FOUND" })

      // Snapshot before state
      const { data: currentAssignments } = await svc
        .from("permission_group_assignments")
        .select("permission_key")
        .eq("group_id", input.groupId)
        .eq("company_id", ctx.companyId)

      const beforePerms = (currentAssignments ?? []).map((a) => a.permission_key)

      // Delete all existing assignments for this group, then insert new ones
      await svc
        .from("permission_group_assignments")
        .delete()
        .eq("group_id", input.groupId)
        .eq("company_id", ctx.companyId)

      if (input.permissions.length > 0) {
        await svc.from("permission_group_assignments").insert(
          input.permissions.map((key) => ({
            group_id: input.groupId,
            permission_key: key,
            company_id: ctx.companyId!,
            created_by: ctx.user.id,
          })),
        )
      }

      // Invalidate cache for all users currently in this group
      const { data: members } = await svc
        .from("user_permission_groups")
        .select("user_id")
        .eq("group_id", input.groupId)
        .eq("company_id", ctx.companyId)

      for (const m of members ?? []) {
        invalidatePermissionCache(m.user_id, ctx.companyId)
      }

      await writeActivityLog(ctx, {
        action: "permission_group.permissions_updated",
        entityType: "permission_group",
        entityId: input.groupId,
        entityLabel: group.name,
        beforeState: { permissions: beforePerms },
        afterState: { permissions: input.permissions },
      })

      return { success: true }
    }),
})

// ─── Permission definitions (all authenticated users) ─────────────────────────

export const permissionDefinitionsRouter = createTRPCRouter({
  list: protectedProcedure.query(async ({ ctx }) => {
    if (!ctx.companyId) throw new TRPCError({ code: "UNAUTHORIZED" })
    const svc = createServiceRoleClient()

    const { data, error } = await svc
      .from("permission_definitions")
      .select("key, resource, action, description, is_sensitive")
      .order("resource", { ascending: true })
      .order("action", { ascending: true })

    if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" })

    return (data ?? []).map((d) => ({
      key: d.key,
      resource: d.resource,
      action: d.action,
      description: d.description,
      isSensitive: d.is_sensitive,
    }))
  }),
})
