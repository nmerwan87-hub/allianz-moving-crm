import type { createServiceRoleClient } from "@/lib/supabase/service-role"

export type ServiceClient = ReturnType<typeof createServiceRoleClient>

/** A row of public.domain_events as returned by claim_domain_events(). */
export interface DomainEvent {
  id: string
  company_id: string
  event_type: string
  aggregate_type: string
  aggregate_id: string
  payload: Record<string, unknown>
  attempts: number
  created_at: string
}

/**
 * A side effect of a domain event. Each handler runs at most once per event
 * (tracked in domain_event_handler_runs), so it may be retried after a crash
 * but never repeats once it succeeded. Handlers must still tolerate seeing
 * a state that moved on in the meantime and skip quietly in that case.
 */
export interface EventHandler {
  name: string
  events: readonly string[]
  handle: (event: DomainEvent, svc: ServiceClient) => Promise<void>
}
