import { processDomainEvents } from "./processor"
import { createServiceRoleClient } from "@/lib/supabase/service-role"

/**
 * Local development only: does what Vercel Cron does in production
 * (process-events every minute, sync-tasks every 15 minutes), but every few
 * seconds, so effects like "quote accepted → job created" show up right away.
 * Disable with DEV_EVENT_LOOP=off.
 */

const EVENTS_EVERY_MS = 3_000
const TASKS_EVERY_MS = 60_000

const state = globalThis as unknown as { __bivroDevLoop?: boolean }

export function startDevEventLoop(): void {
  // Hot reload re-runs instrumentation; keep a single loop per process
  if (state.__bivroDevLoop) return
  state.__bivroDevLoop = true

  let busy = false
  let lastError = 0

  const report = (scope: string, err: unknown) => {
    if (Date.now() - lastError < 60_000) return
    lastError = Date.now()
    console.error(`[dev-loop] ${scope}:`, err instanceof Error ? err.message : err)
  }

  setInterval(async () => {
    if (busy) return
    busy = true
    try {
      const result = await processDomainEvents({ maxBatches: 2 })
      if (result.processed || result.failed) {
        console.warn(`[dev-loop] events processed=${result.processed} failed=${result.failed}`)
      }
    } catch (err) {
      report("events", err)
    } finally {
      busy = false
    }
  }, EVENTS_EVERY_MS)

  setInterval(async () => {
    try {
      const svc = createServiceRoleClient()
      await svc.rpc("apply_time_based_transitions")
      await svc.rpc("sync_system_tasks", { p_company_id: null })
    } catch (err) {
      report("tasks", err)
    }
  }, TASKS_EVERY_MS)

  console.warn("[dev-loop] processing domain events every 3 s (DEV_EVENT_LOOP=off to disable)")
}
