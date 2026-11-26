import type { SupabaseClient } from "@supabase/supabase-js"
import { transitionStatus } from "@/modules/workflow/transitions"
import { hashPortalToken, isPortalTokenShape, portalToken, type PortalKind } from "./token"

/**
 * Everything the customer portal does, on the service role client: find a
 * quote or invoice by its link token, record views, accept or decline a
 * quote. Kept free of Next.js so it can be tested directly.
 */

const TABLE: Record<PortalKind, "quotes" | "invoices"> = { quote: "quotes", invoice: "invoices" }

/** Quotes stay reachable 60 days after their validity; invoices for a year after the due date. */
const LINK_DAYS: Record<PortalKind, number> = { quote: 60, invoice: 365 }

/**
 * Stores the link hash and its expiry. Called whenever a quote or invoice is
 * sent (again); returns nothing because the URL is derived from the id.
 */
export async function issuePortalLink(
  svc: SupabaseClient,
  kind: PortalKind,
  id: string,
  validUntil: string | null,
): Promise<void> {
  const base = validUntil ? new Date(validUntil) : new Date()
  const expires = new Date(Math.max(base.getTime(), Date.now()) + LINK_DAYS[kind] * 86_400_000)
  const { error } = await svc
    .from(TABLE[kind])
    .update({
      portal_token: hashPortalToken(portalToken(kind, id)),
      portal_token_expires_at: expires.toISOString(),
    })
    .eq("id", id)
  if (error) throw new Error(`issuePortalLink: ${error.message}`)
}

const COMPANY =
  "name, legal_name, address_line1, address_line2, postal_code, city, email, phone, website, logo_url, accent_color"

export interface PortalCompany {
  name: string
  addressLines: string[]
  email: string | null
  phone: string | null
  website: string | null
  logoUrl: string | null
  accentColor: string
}

function mapCompany(c: Record<string, string | null> | null): PortalCompany {
  const row = c ?? {}
  return {
    name: row["name"] || row["legal_name"] || "",
    addressLines: [
      row["address_line1"],
      row["address_line2"],
      [row["postal_code"], row["city"]].filter(Boolean).join(" "),
    ].filter((l): l is string => Boolean(l)),
    email: row["email"] ?? null,
    phone: row["phone"] ?? null,
    website: row["website"] ?? null,
    logoUrl: row["logo_url"] ?? null,
    accentColor: /^#[0-9a-fA-F]{6}$/.test(row["accent_color"] ?? "")
      ? row["accent_color"]!
      : "#2b80c5",
  }
}

export interface PortalLine {
  name: string
  description: string | null
  pricingMode: string
  quantity: number
  unit: string | null
  unitPriceCents: number
  discountCents: number
  netCents: number
}

function mapLines(rows: Array<Record<string, unknown>> | null): PortalLine[] {
  return (rows ?? []).map((l) => ({
    name: l["name"] as string,
    description: (l["description"] as string | null) ?? null,
    pricingMode: l["pricing_mode"] as string,
    quantity: Number(l["quantity"]),
    unit: (l["unit"] as string | null) ?? null,
    unitPriceCents: l["unit_price_cents"] as number,
    discountCents: (l["discount_amount_cents"] as number | null) ?? 0,
    netCents: l["net_total_cents"] as number,
  }))
}

const LINE_COLUMNS =
  "name, description, pricing_mode, quantity, unit, unit_price_cents, discount_amount_cents, net_total_cents, sort_order"

async function findByToken(
  svc: SupabaseClient,
  kind: PortalKind,
  token: string,
  columns: string,
): Promise<Record<string, unknown> | null> {
  if (!isPortalTokenShape(token)) return null
  const { data } = await svc
    .from(TABLE[kind])
    .select(columns)
    .eq("portal_token", hashPortalToken(token))
    .gt("portal_token_expires_at", new Date().toISOString())
    .is("deleted_at", null)
    .maybeSingle()
  return (data as Record<string, unknown> | null) ?? null
}

// ─── Quote ──────────────────────────────────────────────────────────────────

export interface PortalQuote {
  id: string
  companyId: string
  quoteNumber: string
  title: string | null
  status: string
  language: string
  customerName: string
  scheduledDate: string | null
  rooms: number | null
  origin: { address: string; floor: number | null; lift: boolean }
  dest: { address: string; floor: number | null; lift: boolean }
  pricingKind: string
  subtotalCents: number
  discountCents: number
  taxCents: number
  totalCents: number
  costCapCents: number | null
  depositPercent: number
  depositCents: number
  expiresAt: string | null
  customerNotes: string | null
  acceptedAt: string | null
  acceptedByName: string | null
  declinedAt: string | null
  lines: PortalLine[]
  company: PortalCompany
  /** Accept / decline possible right now */
  open: boolean
}

const QUOTE_COLUMNS = `id, company_id, quote_number, title, status, language, scheduled_date, rooms,
  origin_address, origin_postal_code, origin_city, origin_floor, origin_has_elevator,
  dest_address, dest_postal_code, dest_city, dest_floor, dest_has_elevator, pricing_kind,
  subtotal_cents, discount_cents, tax_cents, total_amount_cents, cost_cap_cents,
  deposit_percent, deposit_amount_cents, expires_at, customer_notes, accepted_at,
  accepted_by_name, declined_at, customers(first_name, last_name, company_name, customer_type),
  companies(${COMPANY})`

function joinAddress(street: unknown, postal: unknown, city: unknown): string {
  return [street, [postal, city].filter(Boolean).join(" ")].filter(Boolean).join(", ")
}

export async function loadPortalQuote(
  svc: SupabaseClient,
  token: string,
): Promise<PortalQuote | null> {
  const q = await findByToken(svc, "quote", token, QUOTE_COLUMNS)
  if (!q) return null
  const { data: lines } = await svc
    .from("quote_items")
    .select(LINE_COLUMNS)
    .eq("quote_id", q["id"] as string)
    .order("sort_order")
  const c = q["customers"] as Record<string, string | null> | null
  const expired =
    q["expires_at"] !== null && new Date(q["expires_at"] as string).getTime() < Date.now()
  const status = q["status"] as string
  return {
    id: q["id"] as string,
    companyId: q["company_id"] as string,
    quoteNumber: q["quote_number"] as string,
    title: (q["title"] as string | null) ?? null,
    status,
    language: q["language"] as string,
    customerName: c
      ? c["customer_type"] === "business" && c["company_name"]
        ? c["company_name"]
        : `${c["first_name"]} ${c["last_name"]}`
      : "",
    scheduledDate: (q["scheduled_date"] as string | null) ?? null,
    rooms: q["rooms"] === null ? null : Number(q["rooms"]),
    origin: {
      address: joinAddress(q["origin_address"], q["origin_postal_code"], q["origin_city"]),
      floor: (q["origin_floor"] as number | null) ?? null,
      lift: Boolean(q["origin_has_elevator"]),
    },
    dest: {
      address: joinAddress(q["dest_address"], q["dest_postal_code"], q["dest_city"]),
      floor: (q["dest_floor"] as number | null) ?? null,
      lift: Boolean(q["dest_has_elevator"]),
    },
    pricingKind: q["pricing_kind"] as string,
    subtotalCents: q["subtotal_cents"] as number,
    discountCents: q["discount_cents"] as number,
    taxCents: q["tax_cents"] as number,
    totalCents: q["total_amount_cents"] as number,
    costCapCents: (q["cost_cap_cents"] as number | null) ?? null,
    depositPercent: Number(q["deposit_percent"]),
    depositCents: q["deposit_amount_cents"] as number,
    expiresAt: (q["expires_at"] as string | null) ?? null,
    customerNotes: (q["customer_notes"] as string | null) ?? null,
    acceptedAt: (q["accepted_at"] as string | null) ?? null,
    acceptedByName: (q["accepted_by_name"] as string | null) ?? null,
    declinedAt: (q["declined_at"] as string | null) ?? null,
    lines: mapLines(lines as Array<Record<string, unknown>> | null),
    company: mapCompany(q["companies"] as Record<string, string | null> | null),
    open: (status === "sent" || status === "viewed") && !expired,
  }
}

async function logCustomerAction(
  svc: SupabaseClient,
  opts: {
    companyId: string
    action: string
    entityType: PortalKind
    entityId: string
    label: string
    actorName?: string | null
    metadata?: Record<string, unknown>
    ip?: string | null
    userAgent?: string | null
  },
) {
  const { error } = await svc.from("activity_logs").insert({
    company_id: opts.companyId,
    actor_id: null,
    actor_type: "customer",
    actor_name: opts.actorName ?? null,
    action: opts.action,
    entity_type: opts.entityType,
    entity_id: opts.entityId,
    entity_label: opts.label,
    metadata: opts.metadata ?? {},
    ip_address: opts.ip && /^[0-9a-fA-F:.]+$/.test(opts.ip) ? opts.ip : null,
    user_agent: opts.userAgent?.slice(0, 500) ?? null,
  })
  if (error) console.error("[portal] activity log failed:", error.message)
}

/** First open of a sent quote marks it as viewed; every open counts. */
export async function recordQuoteView(svc: SupabaseClient, quote: PortalQuote): Promise<void> {
  if (quote.status === "sent") {
    try {
      await transitionStatus(svc, "quote", quote.id, "viewed")
    } catch (err) {
      console.error("[portal] quote viewed transition failed:", err)
    }
  }
  const { data } = await svc.from("quotes").select("view_count").eq("id", quote.id).single()
  await svc
    .from("quotes")
    .update({ view_count: ((data?.["view_count"] as number | undefined) ?? 0) + 1 })
    .eq("id", quote.id)
}

export type PortalResult = { ok: true } | { ok: false; message: string }

interface RequestInfo {
  ip?: string | null
  userAgent?: string | null
}

export async function acceptPortalQuote(
  svc: SupabaseClient,
  token: string,
  input: { name: string; termsAccepted: boolean } & RequestInfo,
): Promise<PortalResult> {
  const name = input.name.trim()
  if (name.length < 3 || name.length > 200)
    return { ok: false, message: "Bitte Vor- und Nachname eingeben." }
  if (!input.termsAccepted)
    return { ok: false, message: "Bitte bestätigen Sie die Offerte und die AGB." }

  const quote = await loadPortalQuote(svc, token)
  if (!quote) return { ok: false, message: "Dieser Link ist nicht mehr gültig." }
  if (!quote.open) return { ok: false, message: "Diese Offerte kann nicht mehr angenommen werden." }

  const now = new Date().toISOString()
  // Name and terms first: the accepted status starts the job creation
  const { error } = await svc
    .from("quotes")
    .update({ accepted_by_name: name, terms_accepted: true, terms_accepted_at: now })
    .eq("id", quote.id)
  if (error) return { ok: false, message: "Speichern fehlgeschlagen. Bitte nochmals versuchen." }
  try {
    await transitionStatus(svc, "quote", quote.id, "accepted")
  } catch {
    return { ok: false, message: "Diese Offerte kann nicht mehr angenommen werden." }
  }
  await logCustomerAction(svc, {
    companyId: quote.companyId,
    action: "quote.accepted_online",
    entityType: "quote",
    entityId: quote.id,
    label: quote.quoteNumber,
    actorName: name,
    metadata: { total_cents: quote.totalCents },
    ip: input.ip ?? null,
    userAgent: input.userAgent ?? null,
  })
  return { ok: true }
}

export async function declinePortalQuote(
  svc: SupabaseClient,
  token: string,
  input: { reason: string } & RequestInfo,
): Promise<PortalResult> {
  const reason = input.reason.trim()
  if (reason.length < 2 || reason.length > 1000)
    return { ok: false, message: "Bitte einen kurzen Grund angeben." }

  const quote = await loadPortalQuote(svc, token)
  if (!quote) return { ok: false, message: "Dieser Link ist nicht mehr gültig." }
  if (!quote.open) return { ok: false, message: "Diese Offerte ist bereits abgeschlossen." }

  try {
    await transitionStatus(svc, "quote", quote.id, "declined", `Online: ${reason}`)
  } catch {
    return { ok: false, message: "Diese Offerte ist bereits abgeschlossen." }
  }
  await logCustomerAction(svc, {
    companyId: quote.companyId,
    action: "quote.declined_online",
    entityType: "quote",
    entityId: quote.id,
    label: quote.quoteNumber,
    metadata: { reason },
    ip: input.ip ?? null,
    userAgent: input.userAgent ?? null,
  })
  return { ok: true }
}

// ─── Invoice ────────────────────────────────────────────────────────────────

export interface PortalInvoice {
  id: string
  companyId: string
  invoiceNumber: string
  title: string | null
  status: string
  customerName: string
  issuedAt: string | null
  dueAt: string | null
  serviceDate: string | null
  subtotalCents: number
  discountCents: number
  taxCents: number
  totalCents: number
  depositAppliedCents: number
  amountPaidCents: number
  balanceCents: number
  paidAt: string | null
  paymentReference: string | null
  notes: string | null
  /** Past the due date and still open */
  overdue: boolean
  lines: PortalLine[]
  company: PortalCompany & { iban: string | null; payee: string | null }
}

const INVOICE_COLUMNS = `id, company_id, invoice_number, title, status, issued_at, due_at, service_date,
  subtotal_cents, discount_cents, tax_cents, total_amount_cents, deposit_applied_cents,
  amount_paid_cents, balance_due_cents, paid_at, payment_reference, notes,
  customers(first_name, last_name, company_name, customer_type),
  companies(${COMPANY}, bank_iban, bank_payee_name)`

export async function loadPortalInvoice(
  svc: SupabaseClient,
  token: string,
): Promise<PortalInvoice | null> {
  const inv = await findByToken(svc, "invoice", token, INVOICE_COLUMNS)
  // Drafts are never shown; voided invoices show their status
  if (!inv || inv["status"] === "draft") return null
  const { data: lines } = await svc
    .from("invoice_items")
    .select(LINE_COLUMNS)
    .eq("invoice_id", inv["id"] as string)
    .order("sort_order")
  const c = inv["customers"] as Record<string, string | null> | null
  const company = inv["companies"] as Record<string, string | null> | null
  return {
    id: inv["id"] as string,
    companyId: inv["company_id"] as string,
    invoiceNumber: inv["invoice_number"] as string,
    title: (inv["title"] as string | null) ?? null,
    status: inv["status"] as string,
    customerName: c
      ? c["customer_type"] === "business" && c["company_name"]
        ? c["company_name"]
        : `${c["first_name"]} ${c["last_name"]}`
      : "",
    issuedAt: (inv["issued_at"] as string | null) ?? null,
    dueAt: (inv["due_at"] as string | null) ?? null,
    serviceDate: (inv["service_date"] as string | null) ?? null,
    subtotalCents: inv["subtotal_cents"] as number,
    discountCents: inv["discount_cents"] as number,
    taxCents: inv["tax_cents"] as number,
    totalCents: inv["total_amount_cents"] as number,
    depositAppliedCents: inv["deposit_applied_cents"] as number,
    amountPaidCents: inv["amount_paid_cents"] as number,
    balanceCents: inv["balance_due_cents"] as number,
    paidAt: (inv["paid_at"] as string | null) ?? null,
    paymentReference: (inv["payment_reference"] as string | null) ?? null,
    notes: (inv["notes"] as string | null) ?? null,
    overdue:
      ["sent", "viewed", "partially_paid", "overdue"].includes(inv["status"] as string) &&
      inv["due_at"] !== null &&
      new Date(inv["due_at"] as string).getTime() < Date.now(),
    lines: mapLines(lines as Array<Record<string, unknown>> | null),
    company: {
      ...mapCompany(company),
      iban: company?.["bank_iban"] ?? null,
      payee: company?.["bank_payee_name"] ?? null,
    },
  }
}

export async function recordInvoiceView(
  svc: SupabaseClient,
  invoice: PortalInvoice,
): Promise<void> {
  if (invoice.status === "sent") {
    try {
      await transitionStatus(svc, "invoice", invoice.id, "viewed")
    } catch (err) {
      console.error("[portal] invoice viewed transition failed:", err)
    }
  }
  const { data } = await svc.from("invoices").select("view_count").eq("id", invoice.id).single()
  await svc
    .from("invoices")
    .update({ view_count: ((data?.["view_count"] as number | undefined) ?? 0) + 1 })
    .eq("id", invoice.id)
}

// ─── Documents ──────────────────────────────────────────────────────────────

/** The current PDF of the record behind a valid link (never a voided one). */
export async function portalDocument(
  svc: SupabaseClient,
  kind: PortalKind,
  token: string,
): Promise<{ fileName: string; pdf: ArrayBuffer } | null> {
  const row = await findByToken(svc, kind, token, "id, status")
  if (!row || row["status"] === "draft") return null
  const { data: doc } = await svc
    .from("documents")
    .select("name, storage_bucket, storage_path")
    .eq("entity_type", kind)
    .eq("entity_id", row["id"] as string)
    .eq("document_type", `${kind}_pdf`)
    .eq("generation_status", "generated")
    .is("voided_at", null)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!doc) return null
  const { data: file } = await svc.storage
    .from((doc["storage_bucket"] as string | null) ?? "documents")
    .download(doc["storage_path"] as string)
  if (!file) return null
  return { fileName: doc["name"] as string, pdf: await file.arrayBuffer() }
}
