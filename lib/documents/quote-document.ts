import { formatCents } from "@/lib/format/money"
import { formatIban } from "@/lib/format/iban"
import { QUOTE_LABELS, formatDocumentDate, type DocumentLanguage } from "./labels"
import { compileTemplate, escapeHtml, escapeMultiline } from "./template"
import { renderPdf } from "./renderer"
import {
  COMPANY_COLUMNS,
  CUSTOMER_COLUMNS,
  accentColor,
  addressLine,
  companySnapshot,
  customerSnapshot,
  floorText,
  formatQuantity,
  letterhead,
  recipientBlock,
  storeGeneratedDocument,
  vatRows,
  type Row,
  type ServiceClient,
  type StoredDocument,
} from "./shared"

export type { StoredDocument } from "./shared"

/**
 * Quote PDF generation (PDF_ENGINE.md §4, §10, §11). Server-only: reads with
 * the service role, so callers must have checked the user's access first.
 */

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
    svc.from("companies").select(COMPANY_COLUMNS).eq("id", q.company_id).single(),
    svc
      .from("company_settings")
      .select("tax_label, quote_footer_text")
      .eq("company_id", q.company_id)
      .maybeSingle(),
    q.customer_id
      ? svc.from("customers").select(CUSTOMER_COLUMNS).eq("id", q.customer_id).single()
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
  const c = company as unknown as Row
  const cu = customer as unknown as Row | null
  const lines = (items ?? []) as unknown as ItemRow[]
  const accent = accentColor(c)
  const vatLabel = language === "de" ? ((settings?.tax_label as string | null) ?? l.vat) : l.vat
  const { companyName, logoHtml, companyBlockHtml, senderLine } = letterhead(c)
  const { recipientName, recipientHtml } = recipientBlock(cu, language)

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
  const totalsRows = [
    `<tr><td>${escapeHtml(l.subtotal)}</td><td class="num">CHF ${escapeHtml(formatCents(netTotal))}</td></tr>`,
    ...vatRows(lines, vatLabel),
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
      sender_line: senderLine,
    },
    {
      logo_html: logoHtml,
      company_block_html: companyBlockHtml,
      recipient_html: recipientHtml,
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
      company: companySnapshot(c, accent),
      customer: customerSnapshot(cu),
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

/** Generates the quote PDF and stores it as an immutable document. */
export async function generateQuoteDocument(
  svc: ServiceClient,
  quoteId: string,
  actorId: string | null,
): Promise<StoredDocument> {
  const context = await buildQuoteDocument(svc, quoteId)
  const q = context.quote
  const l = QUOTE_LABELS[context.language]
  return storeGeneratedDocument(svc, {
    companyId: q.company_id,
    entityType: "quote",
    entityId: q.id,
    folder: "quotes",
    documentType: "quote_pdf",
    storageStem: `quote_pdf-v${q.version}`,
    fileName: `${l.document_title}-${q.quote_number}-v${q.version}.pdf`,
    language: context.language,
    version: q.version,
    actorId,
    template: context.template,
    snapshots: context.snapshots,
    render: () => renderQuotePdf(context),
  })
}
