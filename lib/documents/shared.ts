import { createHash } from "crypto"
import type { createServiceRoleClient } from "@/lib/supabase/service-role"
import { formatCents } from "@/lib/format/money"
import { formatPhone } from "@/lib/format/phone"
import type { QUOTE_LABELS, DocumentLanguage } from "./labels"
import { escapeHtml } from "./template"
import { RENDERER_VERSION } from "./renderer"

/**
 * Building blocks shared by all customer documents (quote, invoice,
 * reminder): letterhead, window-envelope recipient, move details, VAT
 * breakdown and immutable storage (PDF_ENGINE.md §11.3).
 */

export type ServiceClient = ReturnType<typeof createServiceRoleClient>

export const DEFAULT_ACCENT = "#1f2937"

export const COMPANY_COLUMNS =
  "name, legal_name, vat_number, address_line1, address_line2, postal_code, city, country, email, phone, website, logo_url, accent_color, bank_iban, bank_name, bank_payee_name"

export const CUSTOMER_COLUMNS =
  "customer_type, salutation, first_name, last_name, company_name, email, billing_street, billing_postal_code, billing_city, billing_country"

const SALUTATIONS: Record<DocumentLanguage, Record<"mr" | "ms", string>> = {
  de: { mr: "Herr", ms: "Frau" },
  fr: { mr: "Monsieur", ms: "Madame" },
  it: { mr: "Signor", ms: "Signora" },
  en: { mr: "Mr", ms: "Ms" },
}

export type Row = Record<string, string | null>

type MoveLabels = Pick<
  (typeof QUOTE_LABELS)[DocumentLanguage],
  "floor" | "ground_floor" | "lift" | "no_lift"
>

export function formatQuantity(value: number): string {
  return Number(value)
    .toFixed(2)
    .replace(/\.?0+$/, "")
}

export function floorText(floor: number | null, lift: boolean, l: MoveLabels): string {
  const parts: string[] = []
  if (floor !== null) parts.push(floor === 0 ? l.ground_floor : `${floor}. ${l.floor}`)
  if (floor !== null && floor !== 0) parts.push(lift ? l.lift : l.no_lift)
  return parts.join(", ")
}

export function addressLine(
  street: string | null | undefined,
  postal: string | null | undefined,
  city: string | null | undefined,
): string {
  return [street, [postal, city].filter(Boolean).join(" ")].filter((p) => p && p.trim()).join(", ")
}

export function accentColor(company: Row): string {
  return /^#[0-9a-fA-F]{6}$/.test(company["accent_color"] ?? "")
    ? company["accent_color"]!
    : DEFAULT_ACCENT
}

/** Logo (or name), company block on the right, sender line above the window. */
export function letterhead(company: Row) {
  const companyName = company["legal_name"] || company["name"] || ""
  const logoHtml = company["logo_url"]
    ? `<img src="${escapeHtml(company["logo_url"])}" alt="${escapeHtml(companyName)}">`
    : `<div class="name accent">${escapeHtml(company["name"])}</div>`
  const companyBlockHtml = [
    `<strong>${escapeHtml(companyName)}</strong>`,
    escapeHtml(company["address_line1"]),
    escapeHtml(company["address_line2"]),
    escapeHtml([company["postal_code"], company["city"]].filter(Boolean).join(" ")),
    escapeHtml(formatPhone(company["phone"])),
    escapeHtml(company["email"]),
    escapeHtml(company["website"]),
  ]
    .filter((line) => line && line !== "<strong></strong>")
    .join("<br>")
  const senderLine = [
    companyName,
    company["address_line1"],
    [company["postal_code"], company["city"]].filter(Boolean).join(" "),
  ]
    .filter(Boolean)
    .join(" · ")
  return { companyName, logoHtml, companyBlockHtml, senderLine }
}

/** Recipient in the envelope window (SN 010130), billing address. */
export function recipientBlock(customer: Row | null, language: DocumentLanguage) {
  if (!customer) return { recipientName: "", recipientHtml: "" }
  const recipientName = `${customer["first_name"]} ${customer["last_name"]}`
  const lines = [
    customer["customer_type"] === "business" ? escapeHtml(customer["company_name"]) : "",
    escapeHtml(
      [
        customer["salutation"] ? SALUTATIONS[language][customer["salutation"] as "mr" | "ms"] : "",
        recipientName,
      ]
        .filter(Boolean)
        .join(" "),
    ),
    escapeHtml(customer["billing_street"]),
    escapeHtml(
      [customer["billing_postal_code"], customer["billing_city"]].filter(Boolean).join(" "),
    ),
    customer["billing_country"] && customer["billing_country"] !== "CH"
      ? escapeHtml(customer["billing_country"])
      : "",
  ].filter(Boolean)
  return { recipientName, recipientHtml: lines.join("<br>") }
}

export interface VatLine {
  net_total_cents: number
  vat_rate_percent: number
  vat_amount_cents: number
}

/** Rows "MWST 8.1% (CHF base) … CHF vat", highest rate first. */
export function vatRows(lines: VatLine[], vatLabel: string): string[] {
  const byRate = new Map<number, { base: number; vat: number }>()
  for (const line of lines) {
    const rate = Number(line.vat_rate_percent)
    if (rate === 0) continue
    const entry = byRate.get(rate) ?? { base: 0, vat: 0 }
    entry.base += line.net_total_cents
    entry.vat += line.vat_amount_cents
    byRate.set(rate, entry)
  }
  return [...byRate.entries()]
    .sort(([a], [b]) => b - a)
    .map(
      ([rate, { base, vat }]) =>
        `<tr><td>${escapeHtml(vatLabel)} ${escapeHtml(formatQuantity(rate))}% <span class="small">(CHF ${escapeHtml(formatCents(base))})</span></td><td class="num">CHF ${escapeHtml(formatCents(vat))}</td></tr>`,
    )
}

export function companySnapshot(company: Row, accent: string): Record<string, unknown> {
  return {
    name: company["name"],
    legal_name: company["legal_name"],
    vat_number: company["vat_number"],
    address: [
      company["address_line1"],
      company["address_line2"],
      company["postal_code"],
      company["city"],
      company["country"],
    ],
    email: company["email"],
    phone: company["phone"],
    logo_url: company["logo_url"],
    accent_color: accent,
    bank_iban: company["bank_iban"],
  }
}

export function customerSnapshot(customer: Row | null): Record<string, unknown> | null {
  if (!customer) return null
  return {
    name: `${customer["first_name"]} ${customer["last_name"]}`,
    company_name: customer["company_name"],
    email: customer["email"],
    billing_address: [
      customer["billing_street"],
      customer["billing_postal_code"],
      customer["billing_city"],
      customer["billing_country"],
    ],
  }
}

export interface StoredDocument {
  documentId: string
  storagePath: string
  fileName: string
  pdf: Buffer
}

export interface StoreDocumentInput {
  companyId: string
  entityType: "quote" | "invoice"
  entityId: string
  /** Storage folder, e.g. "quotes" or "invoices" */
  folder: string
  documentType: "quote_pdf" | "invoice_pdf"
  /** File-name stem inside storage, e.g. "quote_pdf-v2" or "reminder-1" */
  storageStem: string
  fileName: string
  language: DocumentLanguage
  version: number
  actorId: string | null
  template: { id: string; version: string }
  snapshots: {
    company: Record<string, unknown>
    customer: Record<string, unknown> | null
    financial: Record<string, unknown>
    lines: Array<Record<string, unknown>>
    payment?: Record<string, unknown> | null
  }
  notes?: string | null
  render: () => Promise<Buffer>
}

/**
 * Stores a generated PDF as an immutable document: documents row with
 * snapshots → upload under a path containing the document id → row
 * finalised. Never overwrites a file; failures are recorded on the row.
 */
export async function storeGeneratedDocument(
  svc: ServiceClient,
  input: StoreDocumentInput,
): Promise<StoredDocument> {
  const { data: doc, error: docError } = await svc
    .from("documents")
    .insert({
      company_id: input.companyId,
      entity_type: input.entityType,
      entity_id: input.entityId,
      document_type: input.documentType,
      name: input.fileName,
      language: input.language,
      jurisdiction_profile: "CH",
      version: input.version,
      generation_status: "generating",
      generation_started_at: new Date().toISOString(),
      generated_by: input.actorId,
      template_id: input.template.id,
      template_version: input.template.version,
      renderer_version: RENDERER_VERSION,
      company_snapshot: input.snapshots.company,
      customer_snapshot: input.snapshots.customer,
      financial_snapshot: input.snapshots.financial,
      service_line_snapshot: input.snapshots.lines,
      payment_details_snapshot: input.snapshots.payment ?? null,
      is_customer_visible: true,
      notes: input.notes ?? null,
    })
    .select("id")
    .single()
  if (docError || !doc) throw new Error(`Failed to create document: ${docError?.message}`)
  const documentId = doc.id as string

  try {
    const pdf = await input.render()
    const storagePath = `${input.companyId}/${input.folder}/${input.entityId}/${input.storageStem}-${documentId}.pdf`

    const { error: uploadError } = await svc.storage
      .from("documents")
      .upload(storagePath, pdf, { contentType: "application/pdf", upsert: false })
    if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`)

    const now = new Date().toISOString()
    const { error: finalizeError } = await svc
      .from("documents")
      .update({
        generation_status: "generated",
        storage_path: storagePath,
        file_size_bytes: pdf.length,
        content_hash: createHash("sha256").update(pdf).digest("hex"),
        generated_at: now,
        generation_completed_at: now,
      })
      .eq("id", documentId)
    if (finalizeError) throw new Error(`Finalize failed: ${finalizeError.message}`)

    return { documentId, storagePath, fileName: input.fileName, pdf }
  } catch (err) {
    await svc
      .from("documents")
      .update({
        generation_status: "failed",
        generation_error: err instanceof Error ? err.message.slice(0, 1000) : String(err),
      })
      .eq("id", documentId)
    throw err
  }
}
