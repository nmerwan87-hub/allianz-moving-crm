import { createElement } from "react"
import type { SupabaseClient } from "@supabase/supabase-js"
import { DocumentEmail } from "@/emails/tenant/document-email"
import { sendTenantEmail } from "@/lib/email/tenant"
import { formatChf } from "@/lib/format/money"
import { formatPhone } from "@/lib/format/phone"
import { issuePortalLink } from "@/lib/portal/service"
import { portalUrl } from "@/lib/portal/token"
import {
  AUTOMATION_SLUGS,
  DEFAULT_TEXTS,
  fillPlaceholders,
  type AutomationLanguage,
  type AutomationSlug,
  type AutomationText,
} from "./defaults"

/**
 * Automatic customer e-mails. A scheduler (cron, every 15 minutes) looks for
 * records that are due, records one run per automation and record, and either
 * sends the e-mail or leaves it waiting for approval. Nothing is sent twice,
 * nothing for records from before the automation was switched on, nothing to
 * customers who opted out of automatic e-mails.
 */

const DAY = 86_400_000

export interface Automation {
  id: string
  companyId: string
  slug: AutomationSlug
  delaySeconds: number
  mode: "auto_send" | "approval" | "draft"
  activatedAt: string | null
  templateId: string
}

interface Candidate {
  entityType: "quote" | "job" | "invoice"
  entityId: string
  customerId: string | null
  email: string | null
  name: string
  language: AutomationLanguage
  values: Record<string, string>
  /** Customer portal link shown as button, if the e-mail has one */
  link: { kind: "quote"; id: string; validUntil: string | null } | null
}

type Row = Record<string, unknown>

const CUSTOMER =
  "customers(first_name, last_name, company_name, customer_type, email, preferred_language)"

function swissDay(value: unknown): string {
  if (!value) return ""
  const s = String(value)
  const day =
    s.length > 10
      ? new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Zurich" }).format(new Date(s))
      : s
  const [y, m, d] = day.split("-")
  return `${d}.${m}.${y}`
}

function todaySwiss(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Zurich" }).format(now)
}

function addDaysIso(day: string, days: number): string {
  const d = new Date(`${day}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

function place(street: unknown, postal: unknown, city: unknown): string {
  return [street, [postal, city].filter(Boolean).join(" ")].filter(Boolean).join(", ")
}

function language(value: unknown): AutomationLanguage {
  return value === "fr" || value === "it" || value === "en" ? value : "de"
}

function person(row: Row) {
  const c = row["customers"] as Row | null
  const name = !c
    ? ""
    : c["customer_type"] === "business" && c["company_name"]
      ? String(c["company_name"])
      : `${c["first_name"]} ${c["last_name"]}`.trim()
  return {
    customerId: (row["customer_id"] as string | null) ?? null,
    email: (c?.["email"] as string | null) ?? null,
    name,
    language: language(row["language"] ?? c?.["preferred_language"]),
  }
}

// ─── What each automation looks at ──────────────────────────────────────────

const QUOTE_COLUMNS = `id, customer_id, language, quote_number, expires_at, sent_at, accepted_at,
  total_amount_cents, scheduled_date, origin_address, origin_postal_code, origin_city,
  dest_address, dest_postal_code, dest_city, ${CUSTOMER}`

function quoteCandidate(row: Row): Candidate {
  return {
    entityType: "quote",
    entityId: row["id"] as string,
    ...person(row),
    values: {
      offerte: String(row["quote_number"] ?? ""),
      gueltig_bis: swissDay(row["expires_at"]),
      betrag: formatChf(row["total_amount_cents"] as number),
      umzugsdatum: swissDay(row["scheduled_date"]) || "—",
      von: place(row["origin_address"], row["origin_postal_code"], row["origin_city"]) || "—",
      nach: place(row["dest_address"], row["dest_postal_code"], row["dest_city"]) || "—",
    },
    link: {
      kind: "quote",
      id: row["id"] as string,
      validUntil: (row["expires_at"] as string | null) ?? null,
    },
  }
}

const JOB_COLUMNS = `id, customer_id, status, scheduled_date, scheduled_start_time, actual_end_at,
  updated_at, origin_address, origin_postal_code, origin_city, dest_address, dest_postal_code,
  dest_city, quotes(language), ${CUSTOMER}`

function jobCandidate(row: Row): Candidate {
  const quote = row["quotes"] as Row | null
  return {
    entityType: "job",
    entityId: row["id"] as string,
    ...person({ ...row, language: quote?.["language"] }),
    values: {
      umzugsdatum: swissDay(row["scheduled_date"]) || "—",
      startzeit: String(row["scheduled_start_time"] ?? "").slice(0, 5) || "—",
      von: place(row["origin_address"], row["origin_postal_code"], row["origin_city"]) || "—",
      nach: place(row["dest_address"], row["dest_postal_code"], row["dest_city"]) || "—",
    },
    link: null,
  }
}

const INVOICE_COLUMNS = `id, customer_id, language, invoice_number, total_amount_cents, paid_at, ${CUSTOMER}`

function invoiceCandidate(row: Row): Candidate {
  return {
    entityType: "invoice",
    entityId: row["id"] as string,
    ...person(row),
    values: {
      rechnung: String(row["invoice_number"] ?? ""),
      betrag: formatChf(row["total_amount_cents"] as number),
    },
    link: null,
  }
}

interface Rule {
  table: "quotes" | "jobs" | "invoices"
  columns: string
  map: (row: Row) => Candidate
  /** Due records; `since` is when the automation was switched on */
  due: (svc: SupabaseClient, a: Automation, now: Date, since: string) => Promise<Row[]>
}

const LIMIT = 200

const RULES: Record<AutomationSlug, Rule> = {
  "quote-follow-up-1": {
    table: "quotes",
    columns: QUOTE_COLUMNS,
    map: quoteCandidate,
    due: async (svc, a, now, since) => {
      const { data } = await svc
        .from("quotes")
        .select(QUOTE_COLUMNS)
        .eq("company_id", a.companyId)
        .in("status", ["sent", "viewed"])
        .is("deleted_at", null)
        .gte("sent_at", since)
        .lte("sent_at", new Date(now.getTime() - a.delaySeconds * 1000).toISOString())
        .gt("expires_at", now.toISOString())
        .limit(LIMIT)
      return (data ?? []) as Row[]
    },
  },
  "quote-expiry-warning": {
    table: "quotes",
    columns: QUOTE_COLUMNS,
    map: quoteCandidate,
    due: async (svc, a, now) => {
      const before = Math.abs(a.delaySeconds) * 1000
      const { data } = await svc
        .from("quotes")
        .select(QUOTE_COLUMNS)
        .eq("company_id", a.companyId)
        .in("status", ["sent", "viewed"])
        .is("deleted_at", null)
        .gt("expires_at", now.toISOString())
        .lte("expires_at", new Date(now.getTime() + before).toISOString())
        // Not for quotes sent so late that the warning would come right away
        .lte("sent_at", new Date(now.getTime() - DAY).toISOString())
        .limit(LIMIT)
      return (data ?? []) as Row[]
    },
  },
  "booking-confirmed": {
    table: "quotes",
    columns: QUOTE_COLUMNS,
    map: quoteCandidate,
    due: async (svc, a, now, since) => {
      const { data } = await svc
        .from("quotes")
        .select(QUOTE_COLUMNS)
        .eq("company_id", a.companyId)
        .eq("status", "accepted")
        .is("deleted_at", null)
        .gte("accepted_at", since)
        .lte("accepted_at", new Date(now.getTime() - a.delaySeconds * 1000).toISOString())
        .limit(LIMIT)
      return (data ?? []) as Row[]
    },
  },
  "move-reminder": {
    table: "jobs",
    columns: JOB_COLUMNS,
    map: jobCandidate,
    due: async (svc, a, now) => {
      const today = todaySwiss(now)
      const days = Math.max(1, Math.round(Math.abs(a.delaySeconds) / 86_400))
      const { data } = await svc
        .from("jobs")
        .select(JOB_COLUMNS)
        .eq("company_id", a.companyId)
        .in("status", ["scheduled", "confirmed"])
        .is("deleted_at", null)
        .gte("scheduled_date", addDaysIso(today, 1))
        .lte("scheduled_date", addDaysIso(today, days))
        .limit(LIMIT)
      return (data ?? []) as Row[]
    },
  },
  "post-move-thank-you": {
    table: "jobs",
    columns: JOB_COLUMNS,
    map: jobCandidate,
    due: async (svc, a, now, since) => {
      const { data } = await svc
        .from("jobs")
        .select(JOB_COLUMNS)
        .eq("company_id", a.companyId)
        .eq("status", "completed")
        .is("deleted_at", null)
        .gte("updated_at", since)
        .limit(LIMIT)
      const cutoff = now.getTime() - a.delaySeconds * 1000
      return ((data ?? []) as Row[]).filter((j) => {
        const done = new Date(String(j["actual_end_at"] ?? j["updated_at"])).getTime()
        return done <= cutoff && done >= new Date(since).getTime()
      })
    },
  },
  "payment-confirmed": {
    table: "invoices",
    columns: INVOICE_COLUMNS,
    map: invoiceCandidate,
    due: async (svc, a, now, since) => {
      const { data } = await svc
        .from("invoices")
        .select(INVOICE_COLUMNS)
        .eq("company_id", a.companyId)
        .eq("status", "paid")
        .is("deleted_at", null)
        .gte("paid_at", since)
        .lte("paid_at", new Date(now.getTime() - a.delaySeconds * 1000).toISOString())
        .limit(LIMIT)
      return (data ?? []) as Row[]
    },
  },
}

// ─── Texts ──────────────────────────────────────────────────────────────────

/** Placeholder text the original provisioning stored; never sent. */
export function isUnconfiguredTemplate(body: string | null | undefined): boolean {
  return !body || /has not been configured yet/.test(body)
}

/** The company's own text for the language, else the built-in one. */
export async function automationText(
  svc: SupabaseClient,
  a: Pick<Automation, "templateId" | "slug">,
  lang: AutomationLanguage,
): Promise<AutomationText> {
  const fallback = DEFAULT_TEXTS[a.slug][lang]
  const { data } = await svc
    .from("email_template_versions")
    .select("subject, body_text")
    .eq("template_id", a.templateId)
    .eq("language", lang)
    .eq("is_current", true)
    .maybeSingle()
  if (!data || isUnconfiguredTemplate(data["body_text"] as string | null)) return fallback
  return {
    subject: (data["subject"] as string) || fallback.subject,
    body: data["body_text"] as string,
    action: fallback.action,
  }
}

const GREETING: Record<AutomationLanguage, (name: string) => string> = {
  de: (n) => `Guten Tag ${n}`.trim(),
  fr: (n) => `Bonjour ${n}`.trim(),
  it: (n) => `Buongiorno ${n}`.trim(),
  en: (n) => `Hello ${n}`.trim(),
}
const CLOSING: Record<AutomationLanguage, string> = {
  de: "Freundliche Grüsse",
  fr: "Meilleures salutations",
  it: "Cordiali saluti",
  en: "Kind regards",
}

async function company(svc: SupabaseClient, companyId: string) {
  const { data } = await svc
    .from("companies")
    .select("name, legal_name, email, phone, website, accent_color")
    .eq("id", companyId)
    .single()
  return (data ?? {}) as Record<string, string | null>
}

export interface RenderedEmail {
  to: string | null
  toName: string
  subject: string
  body: string
  action: { url: string; label: string } | null
  language: AutomationLanguage
}

/** Subject and text with every placeholder filled, as the customer would get it. */
export async function renderAutomation(
  svc: SupabaseClient,
  a: Automation,
  candidate: Candidate,
  companyRow?: Record<string, string | null>,
): Promise<RenderedEmail> {
  const c = companyRow ?? (await company(svc, a.companyId))
  const companyName = c["name"] ?? c["legal_name"] ?? ""
  const text = await automationText(svc, a, candidate.language)
  const url = candidate.link ? portalUrl(candidate.link.kind, candidate.link.id) : ""
  const values = { ...candidate.values, kunde: candidate.name, firma: companyName, link: url }
  return {
    to: candidate.email,
    toName: candidate.name,
    subject: fillPlaceholders(text.subject, values),
    body: fillPlaceholders(text.body, values),
    action: url && text.action ? { url, label: text.action } : null,
    language: candidate.language,
  }
}

// ─── Running ────────────────────────────────────────────────────────────────

export interface AutomationSummary {
  sent: number
  failed: number
  awaitingApproval: number
  skipped: number
}

function mapAutomation(row: Row): Automation | null {
  const template = row["email_templates"] as Row | null
  const slug = template?.["slug"] as string | undefined
  if (!slug || !(AUTOMATION_SLUGS as readonly string[]).includes(slug)) return null
  return {
    id: row["id"] as string,
    companyId: row["company_id"] as string,
    slug: slug as AutomationSlug,
    delaySeconds: row["trigger_delay_seconds"] as number,
    mode: row["mode"] as Automation["mode"],
    activatedAt: (row["activated_at"] as string | null) ?? null,
    templateId: row["template_id"] as string,
  }
}

const AUTOMATION_COLUMNS =
  "id, company_id, trigger_delay_seconds, mode, activated_at, template_id, email_templates(slug)"

async function optedOut(svc: SupabaseClient, customerId: string | null): Promise<boolean> {
  if (!customerId) return false
  const { data } = await svc
    .from("communication_preferences")
    .select("opted_out_all, opted_out_automated")
    .eq("customer_id", customerId)
    .maybeSingle()
  return Boolean(data?.["opted_out_all"] || data?.["opted_out_automated"])
}

async function deliver(
  svc: SupabaseClient,
  a: Automation,
  candidate: Candidate,
  runId: string,
): Promise<boolean> {
  const c = await company(svc, a.companyId)
  if (candidate.link)
    await issuePortalLink(svc, candidate.link.kind, candidate.link.id, candidate.link.validUntil)
  const email = await renderAutomation(svc, a, candidate, c)
  const companyName = c["name"] ?? c["legal_name"] ?? "Bivro"
  const result = await sendTenantEmail({
    companyId: a.companyId,
    companyName,
    replyTo: c["email"] ?? null,
    to: email.to!,
    toName: email.toName || null,
    subject: email.subject,
    language: email.language,
    triggerEvent: `automation.${a.slug}`,
    entityType: candidate.entityType,
    entityId: candidate.entityId,
    react: createElement(DocumentEmail, {
      greeting: GREETING[email.language](email.toName),
      body: email.body,
      personalMessage: null,
      closing: CLOSING[email.language],
      companyName,
      companyContact: [c["legal_name"], formatPhone(c["phone"]), c["email"], c["website"]]
        .filter(Boolean)
        .join(" · "),
      accentColor: /^#[0-9a-fA-F]{6}$/.test(c["accent_color"] ?? "")
        ? c["accent_color"]!
        : "#1f2937",
      action: email.action,
    }),
  })
  await svc
    .from("email_automation_runs")
    .update({
      status: result.delivered ? "sent" : "failed",
      email_log_id: result.emailLogId,
      error_message: result.delivered ? null : (result.reason ?? "Nicht zugestellt"),
    })
    .eq("id", runId)
  return result.delivered
}

/** Records and handles one due record; returns what happened. */
async function handle(
  svc: SupabaseClient,
  a: Automation,
  candidate: Candidate,
): Promise<keyof AutomationSummary | null> {
  const blocked = !candidate.email
    ? "Keine E-Mail-Adresse"
    : (await optedOut(svc, candidate.customerId))
      ? "Kunde möchte keine automatischen E-Mails"
      : null
  const status = blocked ? "skipped" : a.mode === "auto_send" ? "pending" : "approval_pending"

  // The unique index makes this the "only once" guarantee, also with parallel runs
  const { data: run } = await svc
    .from("email_automation_runs")
    .upsert(
      {
        company_id: a.companyId,
        automation_id: a.id,
        template_id: a.templateId,
        trigger_event: `automation.${a.slug}`,
        entity_type: candidate.entityType,
        entity_id: candidate.entityId,
        to_email: candidate.email ?? "",
        to_name: candidate.name || null,
        status,
        cancellation_reason: blocked,
        scheduled_for: new Date().toISOString(),
      },
      { onConflict: "automation_id,entity_id", ignoreDuplicates: true },
    )
    .select("id")
    .maybeSingle()
  if (!run) return null // already handled earlier
  if (status === "skipped") return "skipped"
  if (status === "approval_pending") return "awaitingApproval"
  try {
    return (await deliver(svc, a, candidate, run["id"] as string)) ? "sent" : "failed"
  } catch (err) {
    await svc
      .from("email_automation_runs")
      .update({ status: "failed", error_message: err instanceof Error ? err.message : "Fehler" })
      .eq("id", run["id"] as string)
    return "failed"
  }
}

/** One pass over every active automation (optionally of one company). */
export async function runAutomations(
  svc: SupabaseClient,
  opts: { now?: Date; companyId?: string } = {},
): Promise<AutomationSummary> {
  const now = opts.now ?? new Date()
  const summary: AutomationSummary = { sent: 0, failed: 0, awaitingApproval: 0, skipped: 0 }
  let query = svc.from("email_automations").select(AUTOMATION_COLUMNS).eq("is_active", true)
  if (opts.companyId) query = query.eq("company_id", opts.companyId)
  const { data } = await query
  for (const row of (data ?? []) as Row[]) {
    const a = mapAutomation(row)
    if (!a?.activatedAt) continue
    const rule = RULES[a.slug]
    const rows = await rule.due(svc, a, now, a.activatedAt)
    for (const r of rows) {
      const outcome = await handle(svc, a, rule.map(r))
      if (outcome) summary[outcome]++
    }
  }
  return summary
}

/** Sends a run that waited for approval (data as of now). */
export async function approveRun(svc: SupabaseClient, runId: string): Promise<boolean> {
  const { data: run } = await svc
    .from("email_automation_runs")
    .select(`id, status, entity_id, automation_id, email_automations(${AUTOMATION_COLUMNS})`)
    .eq("id", runId)
    .single()
  if (!run || run["status"] !== "approval_pending") return false
  const a = mapAutomation(run["email_automations"] as unknown as Row)
  if (!a) return false
  const rule = RULES[a.slug]
  const { data: row } = await svc
    .from(rule.table)
    .select(rule.columns)
    .eq("id", run["entity_id"] as string)
    .single()
  if (!row) return false
  await svc
    .from("email_automation_runs")
    .update({ status: "approved", approved_at: new Date().toISOString() })
    .eq("id", runId)
  return deliver(svc, a, rule.map(row as unknown as Row), runId)
}

/** Preview with a real record of the company, or sample values. */
export async function previewAutomation(
  svc: SupabaseClient,
  a: Automation,
): Promise<RenderedEmail> {
  const rule = RULES[a.slug]
  const { data } = await svc
    .from(rule.table)
    .select(rule.columns)
    .eq("company_id", a.companyId)
    .is("deleted_at", null)
    .not("customer_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()
  const candidate: Candidate = data
    ? rule.map(data as unknown as Row)
    : {
        entityType: "quote",
        entityId: "00000000-0000-0000-0000-000000000000",
        customerId: null,
        email: "kunde@example.com",
        name: "Anna Muster",
        language: "de",
        values: {
          offerte: "QT-2026-0001",
          gueltig_bis: "31.12.2026",
          betrag: "CHF 1'850.00",
          umzugsdatum: "15.12.2026",
          startzeit: "08:00",
          von: "Bahnhofstrasse 1, 8001 Zürich",
          nach: "Bundesgasse 3, 3011 Bern",
          rechnung: "INV-2026-0001",
        },
        link: null,
      }
  return renderAutomation(svc, a, { ...candidate, language: "de" })
}

export { RULES as AUTOMATION_RULES }
