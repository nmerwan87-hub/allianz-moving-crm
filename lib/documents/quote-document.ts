import { createHash } from "crypto"
import type { createServiceRoleClient } from "@/lib/supabase/service-role"
import { formatCents } from "@/lib/format/money"
import { formatIban } from "@/lib/format/iban"
import { formatPhone } from "@/lib/format/phone"
import { QUOTE_LABELS, formatDocumentDate, type DocumentLanguage } from "./labels"
import { compileTemplate, escapeHtml, escapeMultiline } from "./template"
import { renderPdf, RENDERER_VERSION } from "./renderer"

type ServiceClient = ReturnType<typeof createServiceRoleClient>

/**
 * Quote PDF generation (PDF_ENGINE.md §4, §10, §11). Server-only: reads with
 * the service role, so callers must have checked the user's access first.
 */

const DEFAULT_ACCENT = "#1f2937"

const SALUTATIONS: Record<DocumentLanguage, Record<"mr" | "ms", string>> = {
  de: { mr: "Herr", ms: "Frau" },
  fr: { mr: "Monsieur", ms: "Madame" },
  it: { mr: "Signor", ms: "Signora" },
  en: { mr: "Mr", ms: "Ms" },
}

interface QuoteRow {
  id: string
  company_id: string
  customer_id: string | null
  quote_number: string
  version: number
  status: string
  title: string | null
  language: DocumentLanguage
  scheduled_date: string | null
  date_flexible: boolean
  origin_address: string | null
  origin_postal_code: string | null
  origin_city: string | null
  origin_floor: number | null
  origin_has_elevator: boolean
  dest_address: string | null
  dest_postal_code: string | null
  dest_city: string | null
  dest_floor: number | null
  dest_has_elevator: boolean
  distance_km: number | null
  estimated_hours: number | null
  subtotal_cents: number
  discount_cents: number
  tax_cents: number
  total_amount_cents: number
  deposit_percent: number
  deposit_amount_cents: number
  cost_cap_cents: number | null
  customer_notes: string | null
  expires_at: string | null
  sent_at: string | null
  created_at: string
}

interface ItemRow {
  name: string
  description: string | null
  customer_notes: string | null
  pricing_mode: string
  quantity: number
  unit: string | null
  unit_price_cents: number
  discount_amount_cents: number
  net_total_cents: number
  vat_rate_percent: number
  vat_amount_cents: number
  gross_total_cents: number
}

export interface QuoteDocumentContext {
  html: string
  language: DocumentLanguage
  quote: QuoteRow
  footerText: string
  snapshots: {
    company: Record<string, unknown>
    customer: Record<string, unknown> | null
    financial: Record<string, unknown>
    lines: Array<Record<string, unknown>>
  }
  template: { id: string; version: string }
  recipientEmail: string | null
  recipientName: string
  companyName: string
  companyEmail: string | null
}

function formatQuantity(value: number): string {
  return Number(value)
    .toFixed(2)
    .replace(/\.?0+$/, "")
}

function floorText(
  floor: number | null,
  lift: boolean,
  l: (typeof QUOTE_LABELS)[DocumentLanguage],
): string {
  const parts: string[] = []
  if (floor !== null) parts.push(floor === 0 ? l.ground_floor : `${floor}. ${l.floor}`)
  if (floor !== null && floor !== 0) parts.push(lift ? l.lift : l.no_lift)
  return parts.join(", ")
}

function addressLine(street: string | null, postal: string | null, city: string | null): string {
  return [street, [postal, city].filter(Boolean).join(" ")].filter((p) => p && p.trim()).join(", ")
}

export async function buildQuoteDocument(
  svc: ServiceClient,
  quoteId: string,
): Promise<QuoteDocumentContext> {
  const { data: quote, error } = await svc
    .from("quotes")
    .select(
      "id, company_id, customer_id, quote_number, version, status, title, language, scheduled_date, date_flexible, origin_address, origin_postal_code, origin_city, origin_floor, origin_has_elevator, dest_address, dest_postal_code, dest_city, dest_floor, dest_has_elevator, distance_km, estimated_hours, subtotal_cents, discount_cents, tax_cents, total_amount_cents, deposit_percent, deposit_amount_cents, cost_cap_cents, customer_notes, expires_at, sent_at, created_at",
    )
    .eq("id", quoteId)
    .single()
  if (error || !quote) throw new Error(`Quote ${quoteId} not found`)
  const q = quote as unknown as QuoteRow

  const [
    { data: items },
    { data: company },
    { data: settings },
    { data: customer },
    { data: template },
  ] = await Promise.all([
    svc
      .from("quote_items")
      .select(
        "name, description, customer_notes, pricing_mode, quantity, unit, unit_price_cents, discount_amount_cents, net_total_cents, vat_rate_percent, vat_amount_cents, gross_total_cents",
      )
      .eq("quote_id", quoteId)
      .order("sort_order", { ascending: true }),
    svc
      .from("companies")
      .select(
        "name, legal_name, vat_number, address_line1, address_line2, postal_code, city, country, email, phone, website, logo_url, accent_color, bank_iban, bank_name, bank_payee_name",
      )
      .eq("id", q.company_id)
      .single(),
    svc
      .from("company_settings")
      .select("tax_label, quote_footer_text")
      .eq("company_id", q.company_id)
      .maybeSingle(),
    q.customer_id
      ? svc
          .from("customers")
          .select(
            "customer_type, salutation, first_name, last_name, company_name, email, billing_street, billing_postal_code, billing_city, billing_country",
          )
          .eq("id", q.customer_id)
          .single()
      : Promise.resolve({ data: null }),
    svc
      .from("document_templates")
      .select("id, version, template_html")
      .eq("document_type", "quote_pdf")
      .eq("is_current", true)
      .in("language", [q.language, "all"])
      .order("language", { ascending: true })
      .limit(1)
      .maybeSingle(),
  ])

  if (!company) throw new Error("Company not found")
  if (!template) throw new Error("No current quote template")

  const language = q.language
  const l = QUOTE_LABELS[language]
  const c = company as Record<string, string | null>
  const cu = customer as Record<string, string | null> | null
  const lines = (items ?? []) as unknown as ItemRow[]
  const accent = /^#[0-9a-fA-F]{6}$/.test(c["accent_color"] ?? "")
    ? c["accent_color"]!
    : DEFAULT_ACCENT
  const vatLabel = language === "de" ? ((settings?.tax_label as string | null) ?? l.vat) : l.vat
  const companyName = c["legal_name"] || c["name"] || ""

  // ── Header fragments (all values escaped) ──
  const logoHtml = c["logo_url"]
    ? `<img src="${escapeHtml(c["logo_url"])}" alt="${escapeHtml(companyName)}">`
    : `<div class="name accent">${escapeHtml(c["name"])}</div>`

  const companyLines = [
    `<strong>${escapeHtml(companyName)}</strong>`,
    escapeHtml(c["address_line1"]),
    escapeHtml(c["address_line2"]),
    escapeHtml([c["postal_code"], c["city"]].filter(Boolean).join(" ")),
    escapeHtml(formatPhone(c["phone"])),
    escapeHtml(c["email"]),
    escapeHtml(c["website"]),
  ].filter((line) => line && line !== "<strong></strong>")

  const recipientName = cu ? `${cu["first_name"]} ${cu["last_name"]}` : ""
  const recipientLines = cu
    ? [
        cu["customer_type"] === "business" ? escapeHtml(cu["company_name"]) : "",
        escapeHtml(
          [
            cu["salutation"] ? SALUTATIONS[language][cu["salutation"] as "mr" | "ms"] : "",
            recipientName,
          ]
            .filter(Boolean)
            .join(" "),
        ),
        escapeHtml(cu["billing_street"]),
        escapeHtml([cu["billing_postal_code"], cu["billing_city"]].filter(Boolean).join(" ")),
        cu["billing_country"] && cu["billing_country"] !== "CH"
          ? escapeHtml(cu["billing_country"])
          : "",
      ].filter(Boolean)
    : []

  // ── Move details ──
  const detailRows: Array<[string, string]> = []
  detailRows.push([
    l.move_date,
    q.scheduled_date
      ? formatDocumentDate(q.scheduled_date, language) +
        (q.date_flexible ? ` (${l.date_flexible})` : "")
      : l.date_open,
  ])
  const from = addressLine(q.origin_address, q.origin_postal_code, q.origin_city)
  const to = addressLine(q.dest_address, q.dest_postal_code, q.dest_city)
  if (from)
    detailRows.push([
      l.from,
      [from, floorText(q.origin_floor, q.origin_has_elevator, l)].filter(Boolean).join(" · "),
    ])
  if (to)
    detailRows.push([
      l.to,
      [to, floorText(q.dest_floor, q.dest_has_elevator, l)].filter(Boolean).join(" · "),
    ])
  if (q.distance_km) detailRows.push([l.distance, `${formatQuantity(q.distance_km)} ${l.km}`])
  if (q.estimated_hours)
    detailRows.push([l.estimated_hours, `${formatQuantity(q.estimated_hours)} ${l.hours}`])
  const moveDetailsRows = detailRows
    .map(([label, value]) => `<tr><td>${escapeHtml(label)}</td><td>${escapeHtml(value)}</td></tr>`)
    .join("")

  // ── Lines ──
  const hasEstimates = lines.some((line) => line.pricing_mode === "hourly")
  const itemRows = lines
    .map((line, index) => {
      const estimated = line.pricing_mode === "hourly"
      const quantity =
        line.pricing_mode === "manual"
          ? ""
          : `${estimated ? "~ " : ""}${formatQuantity(line.quantity)}${line.unit ? ` ${line.unit}` : ""}`
      const price = line.pricing_mode === "manual" ? "" : formatCents(line.unit_price_cents)
      const details = [line.description, line.customer_notes].filter(Boolean).join("\n")
      const discount =
        line.discount_amount_cents > 0
          ? `<div class="desc">${escapeHtml(l.discount)} −${escapeHtml(formatCents(line.discount_amount_cents))}</div>`
          : ""
      return `<tr>
        <td class="pos">${index + 1}</td>
        <td>${escapeHtml(line.name)}${details ? `<div class="desc">${escapeMultiline(details)}</div>` : ""}${discount}</td>
        <td class="num${estimated ? " estimate" : ""}">${escapeHtml(quantity)}</td>
        <td class="num">${escapeHtml(price)}</td>
        <td class="num">${escapeHtml(formatCents(line.net_total_cents))}</td>
      </tr>`
    })
    .join("")

  // ── Totals: net, VAT per rate, total, deposit ──
  const netTotal = q.subtotal_cents - q.discount_cents
  const vatByRate = new Map<number, { base: number; vat: number }>()
  for (const line of lines) {
    const rate = Number(line.vat_rate_percent)
    if (rate === 0) continue
    const entry = vatByRate.get(rate) ?? { base: 0, vat: 0 }
    entry.base += line.net_total_cents
    entry.vat += line.vat_amount_cents
    vatByRate.set(rate, entry)
  }
  const totalsRows = [
    `<tr><td>${escapeHtml(l.subtotal)}</td><td class="num">CHF ${escapeHtml(formatCents(netTotal))}</td></tr>`,
    ...[...vatByRate.entries()]
      .sort(([a], [b]) => b - a)
      .map(
        ([rate, { base, vat }]) =>
          `<tr><td>${escapeHtml(vatLabel)} ${escapeHtml(formatQuantity(rate))}% <span class="small">(CHF ${escapeHtml(formatCents(base))})</span></td><td class="num">CHF ${escapeHtml(formatCents(vat))}</td></tr>`,
      ),
    `<tr class="grand"><td>${escapeHtml(l.total)} ${q.tax_cents > 0 ? escapeHtml(l.incl_vat) : ""}</td><td class="num">CHF ${escapeHtml(formatCents(q.total_amount_cents))}</td></tr>`,
    q.deposit_amount_cents > 0
      ? `<tr class="muted"><td>${escapeHtml(l.deposit)} ${escapeHtml(formatQuantity(q.deposit_percent))}%</td><td class="num">CHF ${escapeHtml(formatCents(q.deposit_amount_cents))}</td></tr>`
      : "",
  ].join("")

  const costCapHtml = q.cost_cap_cents
    ? `<div class="box"><strong>${escapeHtml(l.cost_cap)}: CHF ${escapeHtml(formatCents(q.cost_cap_cents))} ${escapeHtml(l.incl_vat)}</strong>${escapeHtml(l.cost_cap_note)}</div>`
    : ""
  const notesHtml = q.customer_notes
    ? `<div class="box"><strong>${escapeHtml(l.notes)}</strong>${escapeMultiline(q.customer_notes)}</div>`
    : ""
  const estimateNoteHtml = hasEstimates
    ? `<p class="small">~ ${escapeHtml(l.estimated_note)}</p>`
    : ""

  const footerParts = [
    escapeHtml(companyName),
    c["vat_number"]
      ? `${escapeHtml(l.vat_number)} ${escapeHtml(c["vat_number"])} ${escapeHtml(vatLabel)}`
      : "",
    c["bank_iban"]
      ? `IBAN ${escapeHtml(formatIban(c["bank_iban"]))}${c["bank_name"] ? ` · ${escapeHtml(c["bank_name"])}` : ""}`
      : "",
    escapeMultiline(settings?.quote_footer_text as string | null),
  ].filter(Boolean)

  const issueDate = (q.sent_at ?? new Date().toISOString()).slice(0, 10)
  const labelValues = Object.fromEntries(
    Object.entries(l).map(([key, value]) => [`label_${key}`, value]),
  )

  const html = compileTemplate(
    template.template_html as string,
    {
      ...labelValues,
      language,
      accent_color: accent,
      quote_number: q.quote_number,
      quote_version: q.version,
      quote_title: q.title ?? "",
      issue_date: formatDocumentDate(issueDate, language),
      valid_until: formatDocumentDate(q.expires_at, language),
      sender_line: [
        companyName,
        c["address_line1"],
        [c["postal_code"], c["city"]].filter(Boolean).join(" "),
      ]
        .filter(Boolean)
        .join(" · "),
    },
    {
      logo_html: logoHtml,
      company_block_html: companyLines.join("<br>"),
      recipient_html: recipientLines.join("<br>"),
      move_details_rows: moveDetailsRows,
      item_rows: itemRows,
      totals_rows: totalsRows,
      estimate_note_html: estimateNoteHtml,
      cost_cap_html: costCapHtml,
      notes_html: notesHtml,
      footer_html: footerParts.join(" · "),
    },
  )

  return {
    html,
    language,
    quote: q,
    footerText: `${l.document_title} ${q.quote_number} · ${l.version} ${q.version}`,
    template: { id: template.id as string, version: template.version as string },
    recipientEmail: cu?.["email"] ?? null,
    recipientName,
    companyName,
    companyEmail: c["email"] ?? null,
    snapshots: {
      company: {
        name: c["name"],
        legal_name: c["legal_name"],
        vat_number: c["vat_number"],
        address: [
          c["address_line1"],
          c["address_line2"],
          c["postal_code"],
          c["city"],
          c["country"],
        ],
        email: c["email"],
        phone: c["phone"],
        logo_url: c["logo_url"],
        accent_color: accent,
        bank_iban: c["bank_iban"],
      },
      customer: cu
        ? {
            name: recipientName,
            company_name: cu["company_name"],
            email: cu["email"],
            billing_address: [
              cu["billing_street"],
              cu["billing_postal_code"],
              cu["billing_city"],
              cu["billing_country"],
            ],
          }
        : null,
      financial: {
        subtotal_cents: q.subtotal_cents,
        discount_cents: q.discount_cents,
        tax_cents: q.tax_cents,
        total_cents: q.total_amount_cents,
        deposit_cents: q.deposit_amount_cents,
        cost_cap_cents: q.cost_cap_cents,
        currency_code: "CHF",
      },
      // Customer-facing values only — never cost prices (PDF_ENGINE.md §10.3)
      lines: lines.map((line) => ({
        name: line.name,
        quantity: line.quantity,
        unit: line.unit,
        unit_price_cents: line.unit_price_cents,
        net_total_cents: line.net_total_cents,
        vat_rate_percent: line.vat_rate_percent,
      })),
    },
  }
}

export async function renderQuotePdf(context: QuoteDocumentContext): Promise<Buffer> {
  const l = QUOTE_LABELS[context.language]
  return renderPdf(context.html, {
    footerText: context.footerText,
    pageLabel: l.page,
    ofLabel: l.of,
  })
}

export interface StoredDocument {
  documentId: string
  storagePath: string
  fileName: string
  pdf: Buffer
}

/**
 * Generates the quote PDF and stores it as an immutable document
 * (PDF_ENGINE.md §11.3): documents row with snapshots → upload under a path
 * containing the document id → row finalised. Never overwrites a file.
 */
export async function generateQuoteDocument(
  svc: ServiceClient,
  quoteId: string,
  actorId: string | null,
): Promise<StoredDocument> {
  const context = await buildQuoteDocument(svc, quoteId)
  const q = context.quote
  const l = QUOTE_LABELS[context.language]
  const fileName = `${l.document_title}-${q.quote_number}-v${q.version}.pdf`

  const { data: doc, error: docError } = await svc
    .from("documents")
    .insert({
      company_id: q.company_id,
      entity_type: "quote",
      entity_id: q.id,
      document_type: "quote_pdf",
      name: fileName,
      language: context.language,
      jurisdiction_profile: "CH",
      version: q.version,
      generation_status: "generating",
      generation_started_at: new Date().toISOString(),
      generated_by: actorId,
      template_id: context.template.id,
      template_version: context.template.version,
      renderer_version: RENDERER_VERSION,
      company_snapshot: context.snapshots.company,
      customer_snapshot: context.snapshots.customer,
      financial_snapshot: context.snapshots.financial,
      service_line_snapshot: context.snapshots.lines,
      is_customer_visible: true,
    })
    .select("id")
    .single()
  if (docError || !doc) throw new Error(`Failed to create document: ${docError?.message}`)
  const documentId = doc.id as string

  try {
    const pdf = await renderQuotePdf(context)
    const storagePath = `${q.company_id}/quotes/${q.id}/quote_pdf-v${q.version}-${documentId}.pdf`

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

    return { documentId, storagePath, fileName, pdf }
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
