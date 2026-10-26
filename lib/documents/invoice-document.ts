import { formatCents } from "@/lib/format/money"
import { formatIban } from "@/lib/format/iban"
import { invoicePaymentReference } from "@/lib/format/payment-reference"
import { INVOICE_LABELS, INVOICE_TEXT, formatDocumentDate, type DocumentLanguage } from "./labels"
import { compileTemplate, escapeHtml, escapeMultiline } from "./template"
import { renderPdf } from "./renderer"
import { buildQrBillSvg } from "./qr-bill"
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

/**
 * Invoice and payment-reminder PDFs with the Swiss QR-bill payment part
 * (docs/INVOICES.md). Server-only: reads with the service role, so callers
 * must have checked the user's access first.
 *
 * Amount on the payment part:
 *   invoice  → total − deposits received − payments so far (at issue: total − deposits)
 *   reminder → open balance at the time of the reminder
 */

export type InvoiceDocumentKind = { kind: "invoice" } | { kind: "reminder"; level: 1 | 2 | 3 }

interface InvoiceRow {
  id: string
  company_id: string
  job_id: string
  customer_id: string
  invoice_number: string | null
  status: string
  title: string | null
  language: DocumentLanguage
  currency: "CHF" | "EUR"
  service_date: string | null
  payment_terms_days: number
  subtotal_cents: number
  discount_cents: number
  tax_cents: number
  total_amount_cents: number
  deposit_applied_cents: number
  amount_paid_cents: number
  balance_due_cents: number
  cost_cap_cents: number | null
  payment_reference: string | null
  notes: string | null
  issued_at: string | null
  due_at: string | null
}

interface ItemRow {
  name: string
  description: string | null
  customer_notes: string | null
  pricing_mode: string
  quantity: number
  quoted_quantity: number | null
  unit: string | null
  unit_price_cents: number
  discount_amount_cents: number
  net_total_cents: number
  vat_rate_percent: number
  vat_amount_cents: number
  gross_total_cents: number
}

export interface InvoiceDocumentContext {
  html: string
  language: DocumentLanguage
  invoice: InvoiceRow
  variant: InvoiceDocumentKind
  title: string
  footerText: string
  amountDueCents: number
  dueDate: string
  snapshots: {
    company: Record<string, unknown>
    customer: Record<string, unknown> | null
    financial: Record<string, unknown>
    lines: Array<Record<string, unknown>>
    payment: Record<string, unknown>
  }
  template: { id: string; version: string }
  recipientEmail: string | null
  recipientName: string
  companyName: string
  companyEmail: string | null
}

/** Today in Switzerland as YYYY-MM-DD. */
function swissToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Zurich" }).format(new Date())
}

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/** Due date (Swiss calendar day) of a stored due_at timestamp. */
function swissDate(timestamp: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Zurich" }).format(new Date(timestamp))
}

export async function buildInvoiceDocument(
  svc: ServiceClient,
  invoiceId: string,
  variant: InvoiceDocumentKind = { kind: "invoice" },
): Promise<InvoiceDocumentContext> {
  const { data: invoice, error } = await svc
    .from("invoices")
    .select(
      "id, company_id, job_id, customer_id, invoice_number, status, title, language, currency, service_date, payment_terms_days, subtotal_cents, discount_cents, tax_cents, total_amount_cents, deposit_applied_cents, amount_paid_cents, balance_due_cents, cost_cap_cents, payment_reference, notes, issued_at, due_at",
    )
    .eq("id", invoiceId)
    .single()
  if (error || !invoice) throw new Error(`Invoice ${invoiceId} not found`)
  const inv = invoice as unknown as InvoiceRow

  const [
    { data: items },
    { data: job },
    { data: company },
    { data: settings },
    { data: customer },
    { data: template },
  ] = await Promise.all([
    svc
      .from("invoice_items")
      .select(
        "name, description, customer_notes, pricing_mode, quantity, quoted_quantity, unit, unit_price_cents, discount_amount_cents, net_total_cents, vat_rate_percent, vat_amount_cents, gross_total_cents",
      )
      .eq("invoice_id", invoiceId)
      .order("sort_order", { ascending: true }),
    svc
      .from("jobs")
      .select(
        "job_number, scheduled_date, origin_address, origin_postal_code, origin_city, origin_floor, origin_has_elevator, dest_address, dest_postal_code, dest_city, dest_floor, dest_has_elevator",
      )
      .eq("id", inv.job_id)
      .single(),
    svc.from("companies").select(COMPANY_COLUMNS).eq("id", inv.company_id).single(),
    svc
      .from("company_settings")
      .select("tax_label, invoice_footer_text")
      .eq("company_id", inv.company_id)
      .maybeSingle(),
    svc.from("customers").select(CUSTOMER_COLUMNS).eq("id", inv.customer_id).single(),
    svc
      .from("document_templates")
      .select("id, version, template_html")
      .eq("document_type", "invoice_pdf")
      .eq("is_current", true)
      .in("language", [inv.language, "all"])
      .order("language", { ascending: true })
      .limit(1)
      .maybeSingle(),
  ])

  if (!company) throw new Error("Company not found")
  if (!job) throw new Error("Job not found")
  if (!template) throw new Error("No current invoice template")

  const language = inv.language
  const l = INVOICE_LABELS[language]
  const t = INVOICE_TEXT[language]
  const c = company as unknown as Row
  const cu = customer as unknown as Row | null
  const j = job as unknown as Row & {
    origin_floor: number | null
    origin_has_elevator: boolean
    dest_floor: number | null
    dest_has_elevator: boolean
  }
  const lines = (items ?? []) as unknown as ItemRow[]
  const accent = accentColor(c)
  const vatLabel = language === "de" ? ((settings?.tax_label as string | null) ?? l.vat) : l.vat
  const { companyName, logoHtml, companyBlockHtml, senderLine } = letterhead(c)
  const { recipientName, recipientHtml } = recipientBlock(cu, language)
  const isDraft = inv.status === "draft"
  const today = swissToday()

  // ── Dates and amount on the payment part ──
  const invoiceDate = inv.issued_at ? swissDate(inv.issued_at) : today
  const invoiceDueDate = inv.due_at
    ? swissDate(inv.due_at)
    : addDays(invoiceDate, inv.payment_terms_days)
  const reminder = variant.kind === "reminder" ? variant : null
  const dueDate = reminder ? addDays(today, 10) : invoiceDueDate
  const amountDueCents = reminder
    ? inv.balance_due_cents
    : inv.total_amount_cents - inv.deposit_applied_cents - inv.amount_paid_cents
  const number = inv.invoice_number ?? l.draft
  const reference =
    inv.payment_reference ??
    invoicePaymentReference(inv.invoice_number ?? "0", c["bank_iban"] ?? null)

  const title = reminder
    ? l[`reminder_${reminder.level}`]
    : isDraft
      ? `${l.document_title} (${l.draft})`
      : l.document_title

  // ── Meta block next to the address window ──
  const metaRows: Array<[string, string]> = reminder
    ? [
        [l.issue_date, formatDocumentDate(today, language)],
        [l.invoice_number, number],
        [l.invoice_date, formatDocumentDate(invoiceDate, language)],
        [l.due_date, formatDocumentDate(dueDate, language)],
      ]
    : [
        [l.invoice_number, number],
        [l.invoice_date, formatDocumentDate(invoiceDate, language)],
        [l.service_date, formatDocumentDate(inv.service_date, language)],
        [l.due_date, formatDocumentDate(dueDate, language)],
      ]
  metaRows.push([l.job_number, j["job_number"] ?? ""])
  const metaHtml = metaRows
    .filter(([, value]) => value)
    .map(([label, value]) => `<tr><td>${escapeHtml(label)}</td><td>${escapeHtml(value)}</td></tr>`)
    .join("")

  // ── Move details ──
  const detailRows: Array<[string, string]> = []
  if (j["scheduled_date"])
    detailRows.push([l.move_date, formatDocumentDate(j["scheduled_date"], language)])
  const from = addressLine(j["origin_address"], j["origin_postal_code"], j["origin_city"])
  const to = addressLine(j["dest_address"], j["dest_postal_code"], j["dest_city"])
  if (from)
    detailRows.push([
      l.from,
      [from, floorText(j.origin_floor, j.origin_has_elevator, l)].filter(Boolean).join(" · "),
    ])
  if (to)
    detailRows.push([
      l.to,
      [to, floorText(j.dest_floor, j.dest_has_elevator, l)].filter(Boolean).join(" · "),
    ])
  // Reminders refer to the invoice; the move details stay on the invoice only
  const moveDetailsHtml =
    reminder || detailRows.length === 0
      ? ""
      : `<h2>${escapeHtml(l.move_details)}</h2><table class="details">${detailRows
          .map(
            ([label, value]) =>
              `<tr><td>${escapeHtml(label)}</td><td>${escapeHtml(value)}</td></tr>`,
          )
          .join("")}</table>`

  // ── Lines: actual quantities; the quoted quantity where it differs ──
  const itemRows = lines
    .map((line, index) => {
      const unit = line.unit ? ` ${line.unit}` : ""
      const quantity =
        line.pricing_mode === "manual" ? "" : `${formatQuantity(line.quantity)}${unit}`
      const price = line.pricing_mode === "manual" ? "" : formatCents(line.unit_price_cents)
      const quoted =
        line.quoted_quantity !== null &&
        line.pricing_mode !== "manual" &&
        Number(line.quoted_quantity) !== Number(line.quantity)
          ? t.quotedQuantity(`${formatQuantity(line.quoted_quantity)}${unit}`)
          : ""
      const details = [line.description, line.customer_notes, quoted].filter(Boolean).join("\n")
      const discount =
        line.discount_amount_cents > 0
          ? `<div class="desc">${escapeHtml(l.discount)} −${escapeHtml(formatCents(line.discount_amount_cents))}</div>`
          : ""
      return `<tr>
        <td class="pos">${index + 1}</td>
        <td>${escapeHtml(line.name)}${details ? `<div class="desc">${escapeMultiline(details)}</div>` : ""}${discount}</td>
        <td class="num">${escapeHtml(quantity)}</td>
        <td class="num">${escapeHtml(price)}</td>
        <td class="num">${escapeHtml(formatCents(line.net_total_cents))}</td>
      </tr>`
    })
    .join("")

  // ── Totals: net, VAT, total, minus deposits and payments, amount due ──
  const chf = (cents: number) => `CHF ${escapeHtml(formatCents(cents))}`
  const totalsRows = [
    `<tr><td>${escapeHtml(l.subtotal)}</td><td class="num">${chf(inv.subtotal_cents - inv.discount_cents)}</td></tr>`,
    ...vatRows(lines, vatLabel),
    `<tr class="grand"><td>${escapeHtml(l.total)} ${inv.tax_cents > 0 ? escapeHtml(l.incl_vat) : ""}</td><td class="num">${chf(inv.total_amount_cents)}</td></tr>`,
    inv.deposit_applied_cents > 0
      ? `<tr class="muted"><td>${escapeHtml(l.deposit_received)}</td><td class="num">−${chf(inv.deposit_applied_cents)}</td></tr>`
      : "",
    inv.amount_paid_cents > 0
      ? `<tr class="muted"><td>${escapeHtml(l.already_paid)}</td><td class="num">−${chf(inv.amount_paid_cents)}</td></tr>`
      : "",
    inv.deposit_applied_cents > 0 || inv.amount_paid_cents > 0
      ? `<tr class="due"><td>${escapeHtml(l.amount_due)}</td><td class="num">${chf(amountDueCents)}</td></tr>`
      : "",
  ].join("")

  const costCapHtml =
    inv.cost_cap_cents && inv.total_amount_cents <= inv.cost_cap_cents
      ? `<div class="box"><strong>${escapeHtml(l.cost_cap)}: ${chf(inv.cost_cap_cents)} ${escapeHtml(l.incl_vat)}</strong>${escapeHtml(l.cost_cap_kept)}</div>`
      : ""
  const notesHtml =
    inv.notes && !reminder
      ? `<div class="box"><strong>${escapeHtml(l.notes)}</strong>${escapeMultiline(inv.notes)}</div>`
      : ""
  const introHtml = reminder
    ? `<p class="intro">${escapeHtml(l[`reminder_text_${reminder.level}`])}</p>`
    : ""

  const footerParts = [
    escapeHtml(companyName),
    c["vat_number"]
      ? `${escapeHtml(l.vat_number)} ${escapeHtml(c["vat_number"])} ${escapeHtml(vatLabel)}`
      : "",
    c["bank_iban"]
      ? `IBAN ${escapeHtml(formatIban(c["bank_iban"]))}${c["bank_name"] ? ` · ${escapeHtml(c["bank_name"])}` : ""}`
      : "",
    escapeMultiline(settings?.invoice_footer_text as string | null),
  ].filter(Boolean)

  const formattedDue = formatDocumentDate(dueDate, language)
  const qrBillSvg = buildQrBillSvg({
    iban: c["bank_iban"] ?? "",
    creditor: {
      name: c["bank_payee_name"] || companyName,
      street: c["address_line1"],
      postalCode: c["postal_code"],
      city: c["city"],
      country: c["country"],
    },
    debtor: cu
      ? {
          name:
            cu["customer_type"] === "business" && cu["company_name"]
              ? cu["company_name"]
              : recipientName,
          street: cu["billing_street"],
          postalCode: cu["billing_postal_code"],
          city: cu["billing_city"],
          country: cu["billing_country"],
        }
      : null,
    amountCents: amountDueCents > 0 ? amountDueCents : null,
    currency: inv.currency,
    reference,
    message: `${l.document_title} ${number}`,
    language,
  })

  const labelValues = Object.fromEntries(
    Object.entries(l).map(([key, value]) => [`label_${key}`, value]),
  )

  const html = compileTemplate(
    template.template_html as string,
    {
      ...labelValues,
      language,
      accent_color: accent,
      document_title: title,
      invoice_number: number,
      invoice_title: inv.title ?? "",
      sender_line: senderLine,
      payment_text: reminder
        ? t.reminderPayment(formattedDue)
        : t.paymentTerms(inv.payment_terms_days, formattedDue),
      closing_text: reminder ? "" : l.thanks,
      // Inside a CSS string in the template: no quotes or backslashes
      page_footer_text: `${title} ${number}`.replace(/["\\<>&']/g, ""),
      qr_head_text: t.slipHead(formatCents(Math.max(amountDueCents, 0)), formattedDue),
    },
    {
      logo_html: logoHtml,
      company_block_html: companyBlockHtml,
      recipient_html: recipientHtml,
      meta_rows: metaHtml,
      intro_html: introHtml,
      move_details_html: moveDetailsHtml,
      item_rows: itemRows,
      totals_rows: totalsRows,
      cost_cap_html: costCapHtml,
      notes_html: notesHtml,
      footer_html: footerParts.join(" · "),
      qr_bill_svg: qrBillSvg,
    },
  )

  return {
    html,
    language,
    invoice: inv,
    variant,
    title,
    footerText: `${title} ${number}`,
    amountDueCents,
    dueDate,
    template: { id: template.id as string, version: template.version as string },
    recipientEmail: cu?.["email"] ?? null,
    recipientName,
    companyName,
    companyEmail: c["email"] ?? null,
    snapshots: {
      company: companySnapshot(c, accent),
      customer: customerSnapshot(cu),
      financial: {
        subtotal_cents: inv.subtotal_cents,
        discount_cents: inv.discount_cents,
        tax_cents: inv.tax_cents,
        total_cents: inv.total_amount_cents,
        deposit_applied_cents: inv.deposit_applied_cents,
        amount_paid_cents: inv.amount_paid_cents,
        amount_due_cents: amountDueCents,
        cost_cap_cents: inv.cost_cap_cents,
        invoice_date: invoiceDate,
        due_date: dueDate,
        reminder_level: reminder?.level ?? 0,
        currency_code: inv.currency,
      },
      lines: lines.map((line) => ({
        name: line.name,
        quantity: line.quantity,
        quoted_quantity: line.quoted_quantity,
        unit: line.unit,
        unit_price_cents: line.unit_price_cents,
        net_total_cents: line.net_total_cents,
        vat_rate_percent: line.vat_rate_percent,
      })),
      payment: {
        iban: c["bank_iban"],
        payee: c["bank_payee_name"] || companyName,
        reference,
        amount_cents: amountDueCents,
        currency: inv.currency,
      },
    },
  }
}

export async function renderInvoicePdf(context: InvoiceDocumentContext): Promise<Buffer> {
  return renderPdf(context.html, { cssPages: true })
}

/** Generates the invoice (or reminder) PDF and stores it as an immutable document. */
export async function generateInvoiceDocument(
  svc: ServiceClient,
  invoiceId: string,
  actorId: string | null,
  variant: InvoiceDocumentKind = { kind: "invoice" },
): Promise<StoredDocument & { context: InvoiceDocumentContext }> {
  const context = await buildInvoiceDocument(svc, invoiceId, variant)
  const inv = context.invoice
  if (!inv.invoice_number) throw new Error("Only issued invoices are stored as documents")
  const stem = variant.kind === "reminder" ? `reminder-${variant.level}` : "invoice_pdf"
  const stored = await storeGeneratedDocument(svc, {
    companyId: inv.company_id,
    entityType: "invoice",
    entityId: inv.id,
    folder: "invoices",
    documentType: "invoice_pdf",
    storageStem: stem,
    fileName: `${context.title.replace(/\s+/g, "-")}-${inv.invoice_number}.pdf`,
    language: context.language,
    version: variant.kind === "reminder" ? variant.level + 1 : 1,
    actorId,
    template: context.template,
    snapshots: context.snapshots,
    notes: variant.kind === "reminder" ? `reminder_level=${variant.level}` : null,
    render: () => renderInvoicePdf(context),
  })
  return { ...stored, context }
}
