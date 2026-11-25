import { TRPCError } from "@trpc/server"
import { createTRPCRouter, permissionProcedure } from "@/lib/trpc/init"
import { createServiceRoleClient } from "@/lib/supabase/service-role"
import { writeActivityLog } from "@/lib/audit/activity"
import { escapeHtml } from "@/lib/documents/template"
import {
  AUTOMATION_SLUGS,
  DEFAULT_TEXTS,
  PLACEHOLDERS,
  type AutomationSlug,
} from "@/lib/automations/defaults"
import {
  approveRun,
  isUnconfiguredTemplate,
  previewAutomation,
  runAutomations,
  type Automation,
} from "@/lib/automations/engine"
import {
  automationIdInput,
  listRunsInput,
  runIdInput,
  updateAutomationInput,
  type AutomationItem,
  type AutomationRun,
} from "./schema"

/** Automations that count days before an event (move date, quote expiry). */
const BEFORE: AutomationSlug[] = ["quote-expiry-warning", "move-reminder"]
/** Sent right when it happens; no delay setting. */
const IMMEDIATE: AutomationSlug[] = ["booking-confirmed", "payment-confirmed"]

const COLUMNS =
  "id, company_id, name, description, is_active, trigger_delay_seconds, mode, activated_at, template_id, email_templates(slug)"

type Row = Record<string, unknown>

function slugOf(row: Row): AutomationSlug | null {
  const slug = (row["email_templates"] as Row | null)?.["slug"] as string | undefined
  return slug && (AUTOMATION_SLUGS as readonly string[]).includes(slug)
    ? (slug as AutomationSlug)
    : null
}

function toAutomation(row: Row, slug: AutomationSlug): Automation {
  return {
    id: row["id"] as string,
    companyId: row["company_id"] as string,
    slug,
    delaySeconds: row["trigger_delay_seconds"] as number,
    mode: row["mode"] as Automation["mode"],
    activatedAt: (row["activated_at"] as string | null) ?? null,
    templateId: row["template_id"] as string,
  }
}

async function loadAutomation(
  supabase: Parameters<typeof runAutomations>[0],
  id: string,
): Promise<{ row: Row; slug: AutomationSlug }> {
  const { data } = await supabase
    .from("email_automations")
    .select(COLUMNS)
    .eq("id", id)
    .maybeSingle()
  const row = data as Row | null
  const slug = row ? slugOf(row) : null
  if (!row || !slug)
    throw new TRPCError({ code: "NOT_FOUND", message: "Automatik nicht gefunden." })
  return { row, slug }
}

export const automationsRouter = createTRPCRouter({
  /** The six automatic e-mails of the active company, in a fixed order. */
  list: permissionProcedure("communications.view").query(
    async ({ ctx }): Promise<AutomationItem[]> => {
      const { data } = await ctx.supabase.from("email_automations").select(COLUMNS)
      const rows = ((data ?? []) as Row[])
        .map((row) => ({ row, slug: slugOf(row) }))
        .filter((r): r is { row: Row; slug: AutomationSlug } => r.slug !== null)
        .sort((a, b) => AUTOMATION_SLUGS.indexOf(a.slug) - AUTOMATION_SLUGS.indexOf(b.slug))

      const templateIds = rows.map((r) => r.row["template_id"] as string)
      const { data: versions } = templateIds.length
        ? await ctx.supabase
            .from("email_template_versions")
            .select("template_id, subject, body_text")
            .in("template_id", templateIds)
            .eq("language", "de")
            .eq("is_current", true)
        : { data: [] }
      const custom = new Map(
        ((versions ?? []) as Row[])
          .filter((v) => !isUnconfiguredTemplate(v["body_text"] as string | null))
          .map((v) => [v["template_id"] as string, v]),
      )

      return rows.map(({ row, slug }) => {
        const own = custom.get(row["template_id"] as string)
        const text = DEFAULT_TEXTS[slug].de
        const seconds = row["trigger_delay_seconds"] as number
        return {
          id: row["id"] as string,
          slug,
          name: row["name"] as string,
          description: (row["description"] as string | null) ?? null,
          enabled: row["is_active"] as boolean,
          delayDays: Math.round(Math.abs(seconds) / 86_400),
          timing: IMMEDIATE.includes(slug) ? "now" : BEFORE.includes(slug) ? "before" : "after",
          mode: row["mode"] === "approval" ? "approval" : "auto_send",
          subject: (own?.["subject"] as string | undefined) ?? text.subject,
          body: (own?.["body_text"] as string | undefined) ?? text.body,
          customText: Boolean(own),
          placeholders: PLACEHOLDERS[slug],
          activatedAt: (row["activated_at"] as string | null) ?? null,
        }
      })
    },
  ),

  /** On/off, timing, send mode and the German text. Switching on starts from now. */
  update: permissionProcedure("communications.manage_automations")
    .input(updateAutomationInput)
    .mutation(async ({ ctx, input }) => {
      const { row, slug } = await loadAutomation(ctx.supabase, input.id)
      const seconds = IMMEDIATE.includes(slug)
        ? 0
        : (BEFORE.includes(slug) ? -1 : 1) * Math.max(1, input.delayDays) * 86_400
      const switchedOn = input.enabled && !(row["is_active"] as boolean)

      const { error } = await ctx.supabase
        .from("email_automations")
        .update({
          is_active: input.enabled,
          trigger_delay_seconds: seconds,
          mode: input.mode,
          updated_by: ctx.user.id,
          ...(switchedOn ? { activated_at: new Date().toISOString() } : {}),
        })
        .eq("id", input.id)
      if (error)
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Speichern fehlgeschlagen." })

      // A new text version only when the text changed
      const svc = createServiceRoleClient()
      const templateId = row["template_id"] as string
      const { data: current } = await svc
        .from("email_template_versions")
        .select("version_number, subject, body_text")
        .eq("template_id", templateId)
        .eq("language", "de")
        .eq("is_current", true)
        .maybeSingle()
      const before =
        current && !isUnconfiguredTemplate(current["body_text"] as string | null)
          ? { subject: current["subject"] as string, body: current["body_text"] as string }
          : DEFAULT_TEXTS[slug].de
      if (before.subject !== input.subject || before.body !== input.body) {
        const { data: last } = await svc
          .from("email_template_versions")
          .select("version_number")
          .eq("template_id", templateId)
          .order("version_number", { ascending: false })
          .limit(1)
          .maybeSingle()
        await svc
          .from("email_template_versions")
          .update({ is_current: false })
          .eq("template_id", templateId)
          .eq("language", "de")
        const { error: vError } = await svc.from("email_template_versions").insert({
          template_id: templateId,
          company_id: ctx.companyId,
          version_number: ((last?.["version_number"] as number | undefined) ?? 0) + 1,
          is_current: true,
          language: "de",
          subject: input.subject,
          body_text: input.body,
          body_html: input.body
            .split(/\n\s*\n/)
            .map((p) => `<p>${escapeHtml(p).replace(/\n/g, "<br>")}</p>`)
            .join(""),
          variables_used: PLACEHOLDERS[slug].filter((p) =>
            `${input.subject} ${input.body}`.includes(`{${p}}`),
          ),
          created_by: ctx.user.id,
        })
        if (vError)
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Text nicht gespeichert." })
      }

      await writeActivityLog(ctx, {
        action: "automation.updated",
        entityType: "email_automation",
        entityId: input.id,
        entityLabel: row["name"] as string,
        metadata: { enabled: input.enabled, delay_days: input.delayDays, mode: input.mode },
      })
      return { id: input.id }
    }),

  /** The e-mail as a customer would get it (latest record of the company or sample values). */
  preview: permissionProcedure("communications.view")
    .input(automationIdInput)
    .query(async ({ ctx, input }) => {
      const { row, slug } = await loadAutomation(ctx.supabase, input.id)
      const email = await previewAutomation(createServiceRoleClient(), toAutomation(row, slug))
      return { subject: email.subject, body: email.body, action: email.action?.label ?? null }
    }),

  runs: permissionProcedure("communications.view")
    .input(listRunsInput)
    .query(async ({ ctx, input }): Promise<AutomationRun[]> => {
      let query = ctx.supabase
        .from("email_automation_runs")
        .select(
          "id, status, to_email, to_name, entity_type, entity_id, cancellation_reason, error_message, created_at, email_automations(name)",
        )
        .order("created_at", { ascending: false })
        .limit(50)
      if (input.status) query = query.eq("status", input.status)
      const { data } = await query
      return ((data ?? []) as Row[]).map((r) => ({
        id: r["id"] as string,
        automationName: ((r["email_automations"] as Row | null)?.["name"] as string) ?? "",
        status: r["status"] as string,
        toEmail: r["to_email"] as string,
        toName: (r["to_name"] as string | null) ?? null,
        entityType: (r["entity_type"] as string | null) ?? null,
        entityId: (r["entity_id"] as string | null) ?? null,
        reason:
          (r["error_message"] as string | null) ??
          (r["cancellation_reason"] as string | null) ??
          null,
        createdAt: r["created_at"] as string,
      }))
    }),

  /** Sends an e-mail that waited for approval. */
  approve: permissionProcedure("communications.send")
    .input(runIdInput)
    .mutation(async ({ ctx, input }) => {
      // Visible to the user (RLS) = belongs to the active company
      const { data } = await ctx.supabase
        .from("email_automation_runs")
        .select("id, status")
        .eq("id", input.id)
        .maybeSingle()
      if (!data) throw new TRPCError({ code: "NOT_FOUND", message: "E-Mail nicht gefunden." })
      if (data["status"] !== "approval_pending")
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Diese E-Mail wurde schon bearbeitet.",
        })
      const delivered = await approveRun(createServiceRoleClient(), input.id)
      return { delivered }
    }),

  /** Discards an e-mail that waited for approval. */
  discard: permissionProcedure("communications.send")
    .input(runIdInput)
    .mutation(async ({ ctx, input }) => {
      const { data } = await ctx.supabase
        .from("email_automation_runs")
        .select("id, status")
        .eq("id", input.id)
        .maybeSingle()
      if (!data || data["status"] !== "approval_pending")
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Diese E-Mail wurde schon bearbeitet.",
        })
      await createServiceRoleClient()
        .from("email_automation_runs")
        .update({ status: "cancelled", cancellation_reason: "Verworfen" })
        .eq("id", input.id)
      return { id: input.id }
    }),

  /** Checks right away instead of waiting for the next scheduled run. */
  runNow: permissionProcedure("communications.manage_automations").mutation(async ({ ctx }) => {
    if (!ctx.companyId) throw new TRPCError({ code: "UNAUTHORIZED" })
    return runAutomations(createServiceRoleClient(), { companyId: ctx.companyId })
  }),
})
