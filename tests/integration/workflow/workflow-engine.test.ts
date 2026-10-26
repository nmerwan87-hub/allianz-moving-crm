/**
 * Workflow engine integration tests (docs/WORKFLOW_ENGINE.md).
 *
 * Tests cover:
 *   - creation and every status change write status_history + domain events
 *   - transitions outside workflow_transitions are rejected, also for direct UPDATEs
 *   - system-only transitions are rejected for user requests
 *   - required reasons and entity guards
 *   - lifecycle timestamps are stamped by the database
 *   - quote.accepted → job created from the quote, lead booked (exactly once)
 *   - failed handlers are retried with backoff; succeeded handlers do not rerun
 *   - system tasks open, auto-resolve, and stay closed when a person closed them
 *   - time-based transitions (quote expiry)
 *
 * Uses real JWT-based authentication through PostgREST.
 * Requires local Supabase running with all migrations applied.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { createClient } from "@supabase/supabase-js"
import type { SupabaseClient } from "@supabase/supabase-js"
import { processDomainEvents } from "@/lib/events/processor"
import type { EventHandler } from "@/lib/events/types"

const SUPABASE_URL = process.env["NEXT_PUBLIC_SUPABASE_URL"] ?? "http://127.0.0.1:54321"
const ANON_KEY = process.env["NEXT_PUBLIC_SUPABASE_ANON_KEY"] ?? ""
const SERVICE_ROLE_KEY = process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? ""
const HAS_LOCAL_DB =
  SERVICE_ROLE_KEY.length > 0 && !SERVICE_ROLE_KEY.startsWith("placeholder") && ANON_KEY.length > 0

const describeWithDb = HAS_LOCAL_DB ? describe : describe.skip

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Svc = SupabaseClient<any>

const ts = Date.now()
const TEST_PASSWORD = "SecureTest99!"
const OWNER_EMAIL = `wf-owner-${ts}@bivro-test.dev`

let service: Svc
let owner: Svc
let companyId: string
let ownerId: string
let customerId: string
let counter = 0

async function signIn(email: string): Promise<Svc> {
  const client = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { error } = await client.auth.signInWithPassword({ email, password: TEST_PASSWORD })
  if (error) throw new Error(`Sign-in failed: ${error.message}`)
  return client
}

const ADDRESSES = {
  origin_address: "Teststrasse 1",
  origin_city: "Zürich",
  origin_country: "CH",
  dest_address: "Testweg 2",
  dest_city: "Bern",
  dest_country: "CH",
}

async function createLead(overrides: Record<string, unknown> = {}): Promise<string> {
  const { data, error } = await service
    .from("leads")
    .insert({
      company_id: companyId,
      customer_id: customerId,
      first_name: "Workflow",
      last_name: `Lead ${++counter}`,
      status: "new",
      source: "manual",
      date_flexible: false,
      origin_has_elevator: false,
      origin_has_stairs: false,
      dest_has_elevator: false,
      dest_has_stairs: false,
      ...overrides,
    })
    .select("id")
    .single()
  if (error || !data) throw new Error(`createLead: ${error?.message}`)
  return data.id as string
}

async function createQuote(overrides: Record<string, unknown> = {}): Promise<string> {
  const { data, error } = await service
    .from("quotes")
    .insert({
      company_id: companyId,
      customer_id: customerId,
      created_by: ownerId,
      quote_number: `QT-WF-${ts}-${++counter}`,
      move_type: "local",
      status: "draft",
      scheduled_date: "2026-12-15",
      total_amount_cents: 148000,
      ...ADDRESSES,
      ...overrides,
    })
    .select("id")
    .single()
  if (error || !data) throw new Error(`createQuote: ${error?.message}`)
  return data.id as string
}

async function transition(
  client: Svc,
  entity: string,
  id: string,
  to: string,
  reason?: string,
): Promise<{ message: string } | null> {
  const { error } = await client.rpc("transition_status", {
    p_entity: entity,
    p_id: id,
    p_to_status: to,
    p_reason: reason ?? null,
  })
  return error
}

async function eventsFor(id: string): Promise<string[]> {
  const { data } = await service
    .from("domain_events")
    .select("event_type")
    .eq("aggregate_id", id)
    .order("created_at", { ascending: true })
  return (data ?? []).map((r) => r.event_type as string)
}

async function openTasks(entityId: string): Promise<Array<{ rule_key: string; status: string }>> {
  const { data } = await service
    .from("tasks")
    .select("rule_key, status")
    .eq("entity_id", entityId)
    .eq("source", "system")
    .order("created_at", { ascending: true })
  return (data ?? []) as Array<{ rule_key: string; status: string }>
}

async function syncTasks(): Promise<void> {
  const { error } = await service.rpc("sync_system_tasks", { p_company_id: companyId })
  if (error) throw new Error(`sync_system_tasks: ${error.message}`)
}

describeWithDb("Workflow engine", () => {
  beforeAll(async () => {
    service = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const { data: company, error: coErr } = await service
      .from("companies")
      .insert({
        name: `WF ${ts}`,
        legal_name: `WF ${ts}`,
        slug: `wf-${ts}`,
        country: "CH",
        company_status: "active",
        subscription_tier: "starter",
        subscription_status: "trialing",
      })
      .select("id")
      .single()
    if (coErr || !company) throw new Error(`createCompany: ${coErr?.message}`)
    companyId = company.id as string

    const { data: auth, error: authErr } = await service.auth.admin.createUser({
      email: OWNER_EMAIL,
      email_confirm: true,
      password: TEST_PASSWORD,
    })
    if (authErr || !auth.user) throw new Error(`createUser: ${authErr?.message}`)
    ownerId = auth.user.id

    const { error: profErr } = await service.from("profiles").insert({
      id: ownerId,
      company_id: companyId,
      role: "owner",
      email: OWNER_EMAIL,
      first_name: "Workflow",
      last_name: "Owner",
      is_active: true,
    })
    if (profErr) throw new Error(`createProfile: ${profErr.message}`)

    const { data: customer, error: custErr } = await service
      .from("customers")
      .insert({ company_id: companyId, first_name: "Test", last_name: "Kunde" })
      .select("id")
      .single()
    if (custErr || !customer) throw new Error(`createCustomer: ${custErr?.message}`)
    customerId = customer.id as string

    owner = await signIn(OWNER_EMAIL)
  })

  afterAll(async () => {
    await service.from("tasks").delete().eq("company_id", companyId)
    await service.from("job_assignments").delete().eq("company_id", companyId)
    await service.from("jobs").delete().eq("company_id", companyId)
    await service.from("quotes").delete().eq("company_id", companyId)
    await service.from("leads").delete().eq("company_id", companyId)
    await service.from("customers").delete().eq("company_id", companyId)
    await service.from("activity_logs").delete().eq("company_id", companyId)
    await service.from("profiles").delete().eq("id", ownerId)
    await service.from("companies").delete().eq("id", companyId)
    await service.auth.admin.deleteUser(ownerId)
  })

  // ── State machine ────────────────────────────────────────────────────────

  describe("state machine", () => {
    it("records creation in status_history and emits <entity>.created", async () => {
      const quoteId = await createQuote()

      const { data: history } = await service
        .from("status_history")
        .select("from_status, to_status, actor_type")
        .eq("entity_id", quoteId)
      expect(history).toEqual([{ from_status: null, to_status: "draft", actor_type: "system" }])
      expect(await eventsFor(quoteId)).toEqual(["quote.created"])
    })

    it("rejects transitions that are not configured", async () => {
      const quoteId = await createQuote()
      const error = await transition(owner, "quote", quoteId, "accepted")
      expect(error?.message).toContain("invalid_transition: quote draft -> accepted")
    })

    it("enforces the rules for direct UPDATEs, not only through transition_status", async () => {
      const quoteId = await createQuote()
      const { error } = await owner.from("quotes").update({ status: "accepted" }).eq("id", quoteId)
      expect(error?.message).toContain("invalid_transition")
    })

    it("checks guards, stamps timestamps and records the user as actor", async () => {
      const quoteId = await createQuote({ total_amount_cents: 0 })

      const guard = await transition(owner, "quote", quoteId, "sent")
      expect(guard?.message).toContain("guard_failed: quote total must be greater than zero")

      await service.from("quotes").update({ total_amount_cents: 50000 }).eq("id", quoteId)
      expect(await transition(owner, "quote", quoteId, "sent")).toBeNull()

      const { data: quote } = await service
        .from("quotes")
        .select("status, sent_at")
        .eq("id", quoteId)
        .single()
      expect(quote?.status).toBe("sent")
      expect(quote?.sent_at).not.toBeNull()

      const { data: history } = await service
        .from("status_history")
        .select("from_status, to_status, actor_type, actor_id")
        .eq("entity_id", quoteId)
        .order("created_at", { ascending: true })
      expect(history?.[1]).toEqual({
        from_status: "draft",
        to_status: "sent",
        actor_type: "user",
        actor_id: ownerId,
      })
      expect(await eventsFor(quoteId)).toEqual([
        "quote.created",
        "quote.status_changed",
        "quote.sent",
      ])
    })

    it("rejects system-only transitions for users but allows them for the system", async () => {
      const quoteId = await createQuote()
      await transition(owner, "quote", quoteId, "sent")

      const userAttempt = await transition(owner, "quote", quoteId, "viewed")
      expect(userAttempt?.message).toContain("system_only_transition")

      expect(await transition(service, "quote", quoteId, "viewed")).toBeNull()
    })

    it("requires a reason where configured and stores it", async () => {
      const leadId = await createLead()

      const missing = await transition(owner, "lead", leadId, "lost")
      expect(missing?.message).toContain("reason_required")

      expect(await transition(owner, "lead", leadId, "lost", "Chose a competitor")).toBeNull()

      const { data: lead } = await service
        .from("leads")
        .select("status, lost_reason")
        .eq("id", leadId)
        .single()
      expect(lead).toEqual({ status: "lost", lost_reason: "Chose a competitor" })

      const { data: history } = await service
        .from("status_history")
        .select("reason")
        .eq("entity_id", leadId)
        .eq("to_status", "lost")
        .single()
      expect(history?.reason).toBe("Chose a competitor")
    })

    it("keeps status_history append-only", async () => {
      const quoteId = await createQuote()
      const { error } = await service.from("status_history").delete().eq("entity_id", quoteId)
      expect(error).not.toBeNull()
    })

    it("does not start a job without crew", async () => {
      const quoteId = await createQuote()
      const { data: job, error } = await service
        .from("jobs")
        .insert({
          company_id: companyId,
          customer_id: customerId,
          quote_id: quoteId,
          job_number: `JB-WF-${ts}-${++counter}`,
          move_type: "local",
          scheduled_date: "2026-12-15",
          status: "confirmed",
          ...ADDRESSES,
        })
        .select("id")
        .single()
      if (error || !job) throw new Error(`createJob: ${error?.message}`)

      const result = await transition(owner, "job", job.id as string, "in_progress")
      expect(result?.message).toContain("guard_failed: job needs at least one crew assignment")
    })
  })

  // ── Domain events ────────────────────────────────────────────────────────

  describe("domain events", () => {
    it("creates the job and books the lead when a quote is accepted — exactly once", async () => {
      const leadId = await createLead()
      const quoteId = await createQuote({ lead_id: leadId })

      await transition(owner, "quote", quoteId, "sent")
      await transition(owner, "quote", quoteId, "accepted")

      await processDomainEvents()

      const { data: jobs } = await service
        .from("jobs")
        .select("status, job_number, scheduled_date, origin_city, dest_city, total_amount_cents")
        .eq("quote_id", quoteId)
      expect(jobs).toHaveLength(1)
      expect(jobs?.[0]).toMatchObject({
        status: "scheduled",
        scheduled_date: "2026-12-15",
        origin_city: "Zürich",
        dest_city: "Bern",
        total_amount_cents: 148000,
      })
      expect(jobs?.[0]?.job_number).toMatch(/^JB-\d{4}-\d{4}$/)

      const { data: lead } = await service
        .from("leads")
        .select("status, converted_at")
        .eq("id", leadId)
        .single()
      expect(lead?.status).toBe("booked")
      expect(lead?.converted_at).not.toBeNull()

      // Reprocessing the same events must not create a second job
      const { data: accepted } = await service
        .from("domain_events")
        .select("id")
        .eq("aggregate_id", quoteId)
        .eq("event_type", "quote.accepted")
        .single()
      await service
        .from("domain_events")
        .update({ processed_at: null, next_attempt_at: new Date().toISOString() })
        .eq("id", accepted!.id)
      await processDomainEvents()

      const { data: jobsAfter } = await service.from("jobs").select("id").eq("quote_id", quoteId)
      expect(jobsAfter).toHaveLength(1)
    })

    it("retries a failed handler with backoff without rerunning handlers that succeeded", async () => {
      const eventType = `test.retry_${ts}`
      const { data: event } = await service
        .from("domain_events")
        .insert({
          company_id: companyId,
          event_type: eventType,
          aggregate_type: "test",
          aggregate_id: customerId,
          payload: {},
        })
        .select("id")
        .single()

      let okRuns = 0
      let failing = true
      const handlers: EventHandler[] = [
        {
          name: `test.ok_${ts}`,
          events: [eventType],
          handle: async () => {
            okRuns++
          },
        },
        {
          name: `test.flaky_${ts}`,
          events: [eventType],
          handle: async () => {
            if (failing) throw new Error("temporary outage")
          },
        },
      ]

      await processDomainEvents({ handlers })

      const { data: failed } = await service
        .from("domain_events")
        .select("attempts, processed_at, processing_error, next_attempt_at")
        .eq("id", event!.id)
        .single()
      expect(failed?.attempts).toBe(1)
      expect(failed?.processed_at).toBeNull()
      expect(failed?.processing_error).toBe("temporary outage")
      expect(new Date(failed!.next_attempt_at as string).getTime()).toBeGreaterThan(Date.now())

      // Not due yet → not picked up again
      await processDomainEvents({ handlers })
      expect(okRuns).toBe(1)

      failing = false
      await service
        .from("domain_events")
        .update({ next_attempt_at: new Date().toISOString() })
        .eq("id", event!.id)
      await processDomainEvents({ handlers })

      const { data: done } = await service
        .from("domain_events")
        .select("attempts, processed_at, processing_error")
        .eq("id", event!.id)
        .single()
      expect(done?.attempts).toBe(2)
      expect(done?.processed_at).not.toBeNull()
      expect(done?.processing_error).toBeNull()
      expect(okRuns).toBe(1)
    })
  })

  // ── System tasks ─────────────────────────────────────────────────────────

  describe("system tasks", () => {
    it("opens a task when a rule applies and resolves it when the condition is gone", async () => {
      const twoDaysAgo = new Date(Date.now() - 2 * 24 * 3600 * 1000).toISOString()
      const leadId = await createLead({ created_at: twoDaysAgo })

      await syncTasks()
      expect(await openTasks(leadId)).toEqual([{ rule_key: "lead.uncontacted", status: "open" }])

      // Running again does not duplicate
      await syncTasks()
      expect(await openTasks(leadId)).toHaveLength(1)

      await transition(owner, "lead", leadId, "contacted")
      await syncTasks()

      const { data: resolved } = await service
        .from("tasks")
        .select("status, auto_resolved_at")
        .eq("entity_id", leadId)
        .single()
      expect(resolved?.status).toBe("completed")
      expect(resolved?.auto_resolved_at).not.toBeNull()
    })

    it("does not reopen a system task a person closed", async () => {
      const twoDaysAgo = new Date(Date.now() - 2 * 24 * 3600 * 1000).toISOString()
      const quoteId = await createQuote({ created_at: twoDaysAgo })

      await syncTasks()
      const [task] = await openTasks(quoteId)
      expect(task).toEqual({ rule_key: "quote.draft_not_sent", status: "open" })

      await service
        .from("tasks")
        .update({ status: "cancelled", completed_by: ownerId })
        .eq("entity_id", quoteId)
        .eq("source", "system")

      await syncTasks()
      expect(await openTasks(quoteId)).toEqual([
        { rule_key: "quote.draft_not_sent", status: "cancelled" },
      ])
    })

    it("asks for a job when an accepted quote could not become one automatically", async () => {
      const quoteId = await createQuote({ scheduled_date: null })
      await transition(owner, "quote", quoteId, "sent")
      await transition(owner, "quote", quoteId, "accepted")

      await processDomainEvents()

      const { data: jobs } = await service.from("jobs").select("id").eq("quote_id", quoteId)
      expect(jobs).toHaveLength(0)
      expect(await openTasks(quoteId)).toEqual([
        { rule_key: "quote.accepted_without_job", status: "open" },
      ])
    })
  })

  // ── Time-based transitions ───────────────────────────────────────────────

  describe("time-based transitions", () => {
    it("expires sent quotes past their expiry date", async () => {
      const quoteId = await createQuote()
      await transition(owner, "quote", quoteId, "sent")
      await service
        .from("quotes")
        .update({ expires_at: new Date(Date.now() - 60_000).toISOString() })
        .eq("id", quoteId)

      const { error } = await service.rpc("apply_time_based_transitions")
      expect(error).toBeNull()

      const { data: quote } = await service
        .from("quotes")
        .select("status")
        .eq("id", quoteId)
        .single()
      expect(quote?.status).toBe("expired")
      expect(await eventsFor(quoteId)).toContain("quote.expired")
    })

    it("is not callable by users", async () => {
      const { error } = await owner.rpc("apply_time_based_transitions")
      expect(error).not.toBeNull()
    })
  })
})
