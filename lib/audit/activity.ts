import { createServiceRoleClient } from "@/lib/supabase/service-role"

interface ActorContext {
  user: { id: string } | null
  companyId: string | undefined
}

interface WriteActivityLogOptions {
  action: string
  entityType: string
  entityId: string
  entityLabel?: string
  beforeState?: Record<string, unknown>
  afterState?: Record<string, unknown>
  metadata?: Record<string, unknown>
}

/**
 * Append one row to activity_logs via the service role client.
 *
 * Non-blocking: errors are logged to console but never thrown.
 * A failed audit write does not roll back the primary operation.
 */
export async function writeActivityLog(
  ctx: ActorContext,
  opts: WriteActivityLogOptions,
): Promise<void> {
  if (!ctx.companyId) return
  const svc = createServiceRoleClient()
  try {
    await svc.from("activity_logs").insert({
      company_id: ctx.companyId,
      actor_id: ctx.user?.id ?? null,
      actor_type: ctx.user ? "user" : "system",
      action: opts.action,
      entity_type: opts.entityType,
      entity_id: opts.entityId,
      entity_label: opts.entityLabel ?? null,
      before_state: opts.beforeState ?? null,
      after_state: opts.afterState ?? null,
      metadata: opts.metadata ?? {},
    })
  } catch (err) {
    console.error("[audit] writeActivityLog failed:", err)
  }
}
