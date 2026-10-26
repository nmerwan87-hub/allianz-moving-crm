import { transitionStatus } from "@/modules/workflow/transitions"
import type { EventHandler, ServiceClient } from "./types"

const PRE_QUOTE_LEAD_STATUSES = ["new", "contacted", "surveyed"]

async function loadLeadStatus(svc: ServiceClient, leadId: string): Promise<string | null> {
  const { data } = await svc
    .from("leads")
    .select("status")
    .eq("id", leadId)
    .is("deleted_at", null)
    .maybeSingle()
  return (data?.status as string | undefined) ?? null
}

async function loadQuoteLeadId(svc: ServiceClient, quoteId: string): Promise<string | null> {
  const { data } = await svc.from("quotes").select("lead_id").eq("id", quoteId).maybeSingle()
  return (data?.lead_id as string | null | undefined) ?? null
}

/** quote.sent → the lead behind it is now "quoted". */
const markLeadQuoted: EventHandler = {
  name: "leads.mark_quoted",
  events: ["quote.sent"],
  async handle(event, svc) {
    const leadId = await loadQuoteLeadId(svc, event.aggregate_id)
    if (!leadId) return
    const status = await loadLeadStatus(svc, leadId)
    if (status && PRE_QUOTE_LEAD_STATUSES.includes(status)) {
      await transitionStatus(svc, "lead", leadId, "quoted")
    }
  },
}

/** quote.accepted → the lead is won ("booked"); the database stamps converted_at. */
const markLeadBooked: EventHandler = {
  name: "leads.mark_booked",
  events: ["quote.accepted"],
  async handle(event, svc) {
    const leadId = await loadQuoteLeadId(svc, event.aggregate_id)
    if (!leadId) return
    const status = await loadLeadStatus(svc, leadId)
    if (status && PRE_QUOTE_LEAD_STATUSES.includes(status)) {
      await transitionStatus(svc, "lead", leadId, "quoted")
      await transitionStatus(svc, "lead", leadId, "booked")
    } else if (status === "quoted") {
      await transitionStatus(svc, "lead", leadId, "booked")
    }
  },
}

const JOB_COPY_COLUMNS = [
  "customer_id",
  "move_type",
  "scheduled_date",
  "origin_address",
  "origin_city",
  "origin_state",
  "origin_postal_code",
  "origin_country",
  "origin_floor",
  "origin_has_elevator",
  "origin_has_stairs",
  "dest_address",
  "dest_city",
  "dest_state",
  "dest_postal_code",
  "dest_country",
  "dest_floor",
  "dest_has_elevator",
  "dest_has_stairs",
  "distance_miles",
  "total_amount_cents",
  "deposit_amount_cents",
  "customer_notes",
] as const

const JOB_REQUIRED_COLUMNS = [
  "customer_id",
  "scheduled_date",
  "origin_address",
  "origin_city",
  "dest_address",
  "dest_city",
] as const

/**
 * quote.accepted → create the job from the quote snapshot (F015).
 * A quote without date or addresses cannot become a job automatically; the
 * system task "quote.accepted_without_job" then asks a person to do it.
 */
const createJobFromQuote: EventHandler = {
  name: "jobs.create_from_quote",
  events: ["quote.accepted"],
  async handle(event, svc) {
    const { data: quote, error } = await svc
      .from("quotes")
      .select(
        ["id", "company_id", "status", "created_by", "estimated_hours", ...JOB_COPY_COLUMNS].join(
          ", ",
        ),
      )
      .eq("id", event.aggregate_id)
      .is("deleted_at", null)
      .maybeSingle()

    if (error) throw new Error(`load quote: ${error.message}`)
    if (!quote) return

    const q = quote as unknown as Record<string, unknown>
    if (q["status"] !== "accepted") return
    if (JOB_REQUIRED_COLUMNS.some((column) => q[column] === null || q[column] === undefined)) return

    const { data: existing } = await svc
      .from("jobs")
      .select("id")
      .eq("quote_id", event.aggregate_id)
      .is("deleted_at", null)
      .maybeSingle()
    if (existing) return

    const { data: jobNumber, error: numberError } = await svc.rpc("generate_sequence_number", {
      p_company_id: event.company_id,
      p_sequence_type: "job",
    })
    if (numberError || !jobNumber) throw new Error(`job number: ${numberError?.message}`)

    const job: Record<string, unknown> = {
      company_id: event.company_id,
      quote_id: event.aggregate_id,
      created_by: q["created_by"] ?? null,
      job_number: jobNumber,
      status: "scheduled",
      estimated_duration_hours: q["estimated_hours"] ?? null,
    }
    for (const column of JOB_COPY_COLUMNS) job[column] = q[column] ?? null

    // Quotes may leave the country empty; jobs require it → the company's country
    if (!job["origin_country"] || !job["dest_country"]) {
      const { data: company } = await svc
        .from("companies")
        .select("country")
        .eq("id", event.company_id)
        .single()
      job["origin_country"] ??= company?.country ?? "CH"
      job["dest_country"] ??= company?.country ?? "CH"
    }

    const { error: insertError } = await svc.from("jobs").insert(job)
    // 23505: the unique index on jobs.quote_id — another run created it first
    if (insertError && insertError.code !== "23505") {
      throw new Error(`create job: ${insertError.message}`)
    }
  },
}

export const EVENT_HANDLERS: readonly EventHandler[] = [
  markLeadQuoted,
  markLeadBooked,
  createJobFromQuote,
]
