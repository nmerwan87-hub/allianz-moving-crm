import { createServiceRoleClient } from "@/lib/supabase/service-role"
import { EVENT_HANDLERS } from "./handlers"
import type { DomainEvent, EventHandler, ServiceClient } from "./types"

export interface ProcessResult {
  processed: number
  failed: number
  tasksSynced: number
}

async function hasRun(svc: ServiceClient, eventId: string, handler: string): Promise<boolean> {
  const { data } = await svc
    .from("domain_event_handler_runs")
    .select("event_id")
    .eq("event_id", eventId)
    .eq("handler", handler)
    .maybeSingle()
  return data !== null
}

async function runHandler(svc: ServiceClient, event: DomainEvent, handler: EventHandler) {
  if (await hasRun(svc, event.id, handler.name)) return
  await handler.handle(event, svc)
  const { error } = await svc
    .from("domain_event_handler_runs")
    .insert({ event_id: event.id, handler: handler.name })
  // 23505: recorded concurrently — the handler result stands either way
  if (error && error.code !== "23505") throw new Error(`record handler run: ${error.message}`)
}

/**
 * Processes due domain events (docs/WORKFLOW_ENGINE.md §2).
 *
 * Every matching handler runs at most once per event. If one fails, the event
 * is retried later with backoff and only the handlers that did not finish run
 * again. After each batch, system tasks are re-evaluated for the companies the
 * batch touched, so tasks follow status changes within one processing cycle.
 */
export async function processDomainEvents(
  options: { batchSize?: number; maxBatches?: number; handlers?: readonly EventHandler[] } = {},
): Promise<ProcessResult> {
  const { batchSize = 50, maxBatches = 10, handlers = EVENT_HANDLERS } = options
  const svc = createServiceRoleClient()
  const result: ProcessResult = { processed: 0, failed: 0, tasksSynced: 0 }

  for (let batch = 0; batch < maxBatches; batch++) {
    const { data, error } = await svc.rpc("claim_domain_events", { p_limit: batchSize })
    if (error) throw new Error(`claim_domain_events: ${error.message}`)

    const events = (data ?? []) as DomainEvent[]
    if (events.length === 0) break

    const companies = new Set<string>()

    for (const event of events) {
      companies.add(event.company_id)
      try {
        for (const handler of handlers) {
          if (handler.events.includes(event.event_type)) await runHandler(svc, event, handler)
        }
        await svc.rpc("complete_domain_event", { p_id: event.id })
        result.processed++
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        console.error(`[events] ${event.event_type} ${event.id} failed:`, message)
        await svc.rpc("fail_domain_event", { p_id: event.id, p_error: message })
        result.failed++
      }
    }

    for (const companyId of companies) {
      const { error: syncError } = await svc.rpc("sync_system_tasks", { p_company_id: companyId })
      if (syncError) console.error("[events] sync_system_tasks failed:", syncError.message)
      else result.tasksSynced++
    }

    if (events.length < batchSize) break
  }

  return result
}
