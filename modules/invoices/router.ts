import { createElement } from "react"
import { z } from "zod"
import { TRPCError } from "@trpc/server"
import type { SupabaseClient } from "@supabase/supabase-js"
import { createTRPCRouter, permissionProcedure } from "@/lib/trpc/init"
import type { Context } from "@/lib/trpc/context"
import { createServiceRoleClient } from "@/lib/supabase/service-role"
import { writeActivityLog } from "@/lib/audit/activity"
import { sanitizeSearch } from "@/lib/format/search"
import { formatPhone } from "@/lib/format/phone"
import { formatCents } from "@/lib/format/money"
import { getCachedPermissions } from "@/modules/iam/lib/permissions"
import { transitionStatus, toWorkflowError } from "@/modules/workflow/transitions"
import {
  buildInvoiceDocument,
  generateInvoiceDocument,
  type InvoiceDocumentKind,
} from "@/lib/documents/invoice-document"
import { missingQrBillData } from "@/lib/documents/qr-bill"
import {
  INVOICE_EMAIL_TEXT,
  INVOICE_LABELS,
  formatDocumentDate,
  type DocumentLanguage,
} from "@/lib/documents/labels"
import { sendTenantEmail } from "@/lib/email/tenant"
import { DocumentEmail } from "@/emails/tenant/document-email"
import {
  invoiceIdInput,
  issueInvoiceInput,
  jobIdInput,
  listInvoicesInput,
  reasonInput,
  recordDepositInput,
  recordPaymentInput,
  saveInvoiceLinesInput,
  updateInvoiceInput,
  type Invoice,
  type InvoiceLine,
  type InvoiceSummary,
  type Payment,
} from "./schema"

// ─── Helpers ──────────────────────────────────────────────────────────────────

const OPEN_STATUSES = ["sent", "viewed", "partially_paid", "overdue"] as const

const INVOICE_COLUMNS =
  "id, invoice_number, status, title, customer_id, job_id, quote_id, language, service_date, payment_terms_days, subtotal_cents, discount_cents, tax_cents, total_amount_cents, deposit_applied_cents, amount_paid_cents, balance_due_cents, cost_cap_cents, cost_cap_override_reason, payment_reference, notes, internal_notes, issued_at, due_at, paid_at, reminder_level, last_reminder_at, voided_at, void_reason, write_off_reason, created_at, customers(first_name, last_name, company_name, customer_type, email), jobs(job_number)"

const LINE_COLUMNS =
  "id, quote_item_id, service_catalog_id, item_type, name, description, pricing_mode, quantity, quoted_quantity, unit, unit_price_cents, discount_type, discount_value, discount_amount_cents, net_total_cents, vat_rate_percent, vat_amount_cents, gross_total_cents, customer_notes, sort_order"

const PAYMENT_COLUMNS =
  "id, invoice_id, payment_type, method, status, amount_cents, reference_number, notes, paid_at, cancellation_reason, created_at"

type Ctx = Context & { user: NonNullable<Context["user"]> }

async function hasPermission(ctx: Ctx, key: string): Promise<boolean> {
  if (ctx.role === "owner") return true
  if (!ctx.companyId) return false
  return (await getCachedPermissions(ctx.user.id, ctx.companyId)).keys.has(key)
}

function textOrNull(v: string | null | undefined): string | null {
  const trimmed = v?.trim()
  return trimmed ? trimmed : null
}

function customerName(c: Record<string, unknown> | null): string {
  if (!c) return ""
  const person = `${c["first_name"] as string} ${c["last_name"] as string}`
  return c["customer_type"] === "business" && c["company_name"]
    ? `${c["company_name"] as string} (${person})`
    : person
}

function mapSummary(r: Record<string, unknown>): InvoiceSummary {
  return {
    id: r["id"] as string,
    invoiceNumber: r["invoice_number"] as string | null,
    status: r["status"] as InvoiceSummary["status"],
    title: r["title"] as string | null,
    customerId: r["customer_id"] as string,
    customerName: customerName(r["customers"] as Record<string, unknown> | null),
    jobId: r["job_id"] as string,
    jobNumber: ((r["jobs"] as Record<string, unknown> | null)?.["job_number"] as string) ?? null,
    totalAmountCents: r["total_amount_cents"] as number,
    balanceDueCents: r["balance_due_cents"] as number,
    issuedAt: r["issued_at"] as string | null,
    dueAt: r["due_at"] as string | null,
    reminderLevel: r["reminder_level"] as number,
    createdAt: r["created_at"] as string,
  }
}

function mapInvoice(r: Record<string, unknown>): Invoice {
  return {
    ...mapSummary(r),
    quoteId: r["quote_id"] as string | null,
    language: r["language"] as Invoice["language"],
    serviceDate: r["service_date"] as string | null,
    paymentTermsDays: r["payment_terms_days"] as number,
    subtotalCents: r["subtotal_cents"] as number,
    discountCents: r["discount_cents"] as number,
    taxCents: r["tax_cents"] as number,
    depositAppliedCents: r["deposit_applied_cents"] as number,
    amountPaidCents: r["amount_paid_cents"] as number,
    costCapCents: r["cost_cap_cents"] as number | null,
    costCapOverrideReason: r["cost_cap_override_reason"] as string | null,
    paymentReference: r["payment_reference"] as string | null,
    notes: r["notes"] as string | null,
    internalNotes: r["internal_notes"] as string | null,
    customerEmail:
      ((r["customers"] as Record<string, unknown> | null)?.["email"] as string | null) ?? null,
    paidAt: r["paid_at"] as string | null,
    lastReminderAt: r["last_reminder_at"] as string | null,
    voidedAt: r["voided_at"] as string | null,
    voidReason: r["void_reason"] as string | null,
    writeOffReason: r["write_off_reason"] as string | null,
  }
}

function mapLine(r: Record<string, unknown>): InvoiceLine {
  return {
    id: r["id"] as string,
    quoteItemId: r["quote_item_id"] as string | null,
    serviceCatalogId: r["service_catalog_id"] as string | null,
    itemType: r["item_type"] as InvoiceLine["itemType"],
    name: r["name"] as string,
    description: r["description"] as string | null,
    pricingMode: r["pricing_mode"] as InvoiceLine["pricingMode"],
    quantity: Number(r["quantity"]),
    quotedQuantity: r["quoted_quantity"] === null ? null : Number(r["quoted_quantity"]),
    unit: r["unit"] as string | null,
    unitPriceCents: r["unit_price_cents"] as number,
    discountType: r["discount_type"] as InvoiceLine["discountType"],
    discountValue: r["discount_value"] === null ? null : Number(r["discount_value"]),
    discountAmountCents: r["discount_amount_cents"] as number,
    netTotalCents: r["net_total_cents"] as number,
    vatRatePercent: Number(r["vat_rate_percent"]),
    vatAmountCents: r["vat_amount_cents"] as number,
    grossTotalCents: r["gross_total_cents"] as number,
    customerNotes: r["customer_notes"] as string | null,
  }
}

function mapPayment(r: Record<string, unknown>): Payment {
  return {
    id: r["id"] as string,
    invoiceId: r["invoice_id"] as string | null,
    paymentType: r["payment_type"] as Payment["paymentType"],
    method: r["method"] as Payment["method"],
    status: r["status"] as Payment["status"],
    amountCents: r["amount_cents"] as number,
    reference: r["reference_number"] as string | null,
    notes: r["notes"] as string | null,
    paidAt: r["paid_at"] as string | null,
    cancellationReason: r["cancellation_reason"] as string | null,
    createdAt: r["created_at"] as string,
  }
}

async function loadInvoiceRow(sb: SupabaseClient, id: string): Promise<Record<string, unknown>> {
  const { data, error } = await sb
    .from("invoices")
    .select(INVOICE_COLUMNS)
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle()
  if (error)
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to load invoice" })
  if (!data) throw new TRPCError({ code: "NOT_FOUND", message: "Invoice not found" })
  return data as unknown as Record<string, unknown>
}

function requireDraft(row: Record<string, unknown>) {
  if (row["status"] !== "draft") {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "This invoice was already issued and cannot be changed. Void it and settle again.",
    })
  }
}

/** Company data the QR-bill needs; empty when complete. */
async function missingPaymentData(companyId: string): Promise<string[]> {
  const { data: c } = await createServiceRoleClient()
    .from("companies")
    .select("name, legal_name, bank_payee_name, bank_iban, address_line1, postal_code, city")
    .eq("id", companyId)
    .single()
  if (!c) return ["company"]
  return missingQrBillData({
    iban: (c.bank_iban as string | null) ?? "",
    creditor: {
      name: ((c.bank_payee_name ?? c.legal_name ?? c.name) as string | null) ?? "",
      street: c.address_line1 as string | null,
      postalCode: c.postal_code as string | null,
      city: c.city as string | null,
      country: "CH",
    },
  })
}

/** Swiss calendar day of a timestamp, e.g. the due date of due_at. */
function swissDate(timestamp: string | null): string {
  if (!timestamp) return ""
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Zurich" }).format(new Date(timestamp))
}

function paidAtFrom(date: string): string {
  return `${date}T12:00:00Z`
}

function paymentError(error: { message?: string; code?: string }): TRPCError {
  if (error.code === "42501")
    return new TRPCError({ code: "FORBIDDEN", message: "Not allowed to record this payment." })
  return toWorkflowError(error)
}

// ─── Procedures ───────────────────────────────────────────────────────────────

export const invoicesRouter = createTRPCRouter({
  list: permissionProcedure("invoices.view")
    .input(listInvoicesInput)
    .query(async ({ ctx, input }) => {
      const offset = (input.page - 1) * input.pageSize
      let query = ctx.supabase
        .from("invoices")
        .select(INVOICE_COLUMNS, { count: "exact" })
        .is("deleted_at", null)

      if (input.status === "open") query = query.in("status", [...OPEN_STATUSES])
      else if (input.status) query = query.eq("status", input.status)
      if (input.customerId) query = query.eq("customer_id", input.customerId)
      const s = sanitizeSearch(input.search)
      if (s) query = query.or(`invoice_number.ilike.%${s}%,title.ilike.%${s}%`)

      const [{ data, error, count }, { data: open }] = await Promise.all([
        query
          .order("issued_at", { ascending: false, nullsFirst: true })
          .order("created_at", { ascending: false })
          .range(offset, offset + input.pageSize - 1),
        ctx.supabase
          .from("invoices")
          .select("status, balance_due_cents")
          .is("deleted_at", null)
          .in("status", [...OPEN_STATUSES]),
      ])
      if (error)
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to fetch invoices" })

      const total = count ?? 0
      return {
        items: (data ?? []).map((r) => mapSummary(r as unknown as Record<string, unknown>)),
        total,
        page: input.page,
        pageSize: input.pageSize,
        totalPages: Math.ceil(total / input.pageSize) || 1,
        openBalanceCents: (open ?? []).reduce((sum, r) => sum + (r.balance_due_cents as number), 0),
        overdueBalanceCents: (open ?? [])
          .filter((r) => r.status === "overdue")
          .reduce((sum, r) => sum + (r.balance_due_cents as number), 0),
      }
    }),

  get: permissionProcedure("invoices.view")
    .input(invoiceIdInput)
    .query(async ({ ctx, input }) => {
      const row = await loadInvoiceRow(ctx.supabase, input.id)
      const canViewPayments = await hasPermission(ctx, "payments.view")

      const [{ data: lines }, { data: payments }, { data: documents }, { data: emails }] =
        await Promise.all([
          ctx.supabase
            .from("invoice_items")
            .select(LINE_COLUMNS)
            .eq("invoice_id", input.id)
            .order("sort_order"),
          canViewPayments
            ? ctx.supabase
                .from("payments")
                .select(PAYMENT_COLUMNS)
                .eq("job_id", row["job_id"] as string)
                .is("deleted_at", null)
                .or(`invoice_id.eq.${input.id},and(invoice_id.is.null,payment_type.eq.deposit)`)
                .order("paid_at", { ascending: true })
            : Promise.resolve({ data: [] }),
          ctx.supabase
            .from("documents")
            .select("id, name, version, generated_at, notes")
            .eq("entity_type", "invoice")
            .eq("entity_id", input.id)
            .eq("generation_status", "generated")
            .is("deleted_at", null)
            .order("created_at", { ascending: false }),
          ctx.supabase
            .from("email_logs")
            .select("id, to_email, status, error_message, created_at")
            .eq("entity_type", "invoice")
            .eq("entity_id", input.id)
            .order("created_at", { ascending: false }),
        ])

      return {
        invoice: mapInvoice(row),
        lines: (lines ?? []).map((l) => mapLine(l as Record<string, unknown>)),
        payments: (payments ?? []).map((p) => mapPayment(p as Record<string, unknown>)),
        documents: (documents ?? []).map((d) => ({
          id: d.id as string,
          name: d.name as string,
          kind: (d.notes as string | null)?.startsWith("reminder_level=")
            ? ("reminder" as const)
            : ("invoice" as const),
          generatedAt: d.generated_at as string | null,
        })),
        emails: (emails ?? []).map((e) => ({
          id: e.id as string,
          to: e.to_email as string,
          status: e.status as string,
          error: e.error_message as string | null,
          createdAt: e.created_at as string,
        })),
        missingPaymentData: ctx.companyId ? await missingPaymentData(ctx.companyId) : [],
        permissions: {
          edit: await hasPermission(ctx, "invoices.edit"),
          cancel: await hasPermission(ctx, "invoices.cancel"),
          applyDiscount: await hasPermission(ctx, "quotes.apply_discount"),
          viewPayments: canViewPayments,
          recordPayments: await hasPermission(ctx, "payments.record_manual"),
        },
      }
    }),

  /** Billing state of a job: deposits, its invoice, whether it can be settled. */
  forJob: permissionProcedure("invoices.view")
    .input(jobIdInput)
    .query(async ({ ctx, input }) => {
      const { data: job } = await ctx.supabase
        .from("jobs")
        .select("id, status, deposit_amount_cents, deposit_paid_at")
        .eq("id", input.jobId)
        .is("deleted_at", null)
        .maybeSingle()
      if (!job) throw new TRPCError({ code: "NOT_FOUND", message: "Job not found" })

      const canViewPayments = await hasPermission(ctx, "payments.view")
      const [{ data: invoices }, { data: deposits }] = await Promise.all([
        ctx.supabase
          .from("invoices")
          .select(
            "id, invoice_number, status, total_amount_cents, balance_due_cents, due_at, created_at",
          )
          .eq("job_id", input.jobId)
          .is("deleted_at", null)
          .order("created_at", { ascending: false }),
        canViewPayments
          ? ctx.supabase
              .from("payments")
              .select(PAYMENT_COLUMNS)
              .eq("job_id", input.jobId)
              .is("invoice_id", null)
              .eq("payment_type", "deposit")
              .is("deleted_at", null)
              .order("paid_at", { ascending: true })
          : Promise.resolve({ data: [] }),
      ])

      const active = (invoices ?? []).find((i) => i.status !== "void") ?? null
      return {
        depositExpectedCents: job.deposit_amount_cents as number,
        depositPaidAt: job.deposit_paid_at as string | null,
        deposits: (deposits ?? []).map((p) => mapPayment(p as Record<string, unknown>)),
        invoice: active
          ? {
              id: active.id as string,
              invoiceNumber: active.invoice_number as string | null,
              status: active.status as Invoice["status"],
              totalAmountCents: active.total_amount_cents as number,
              balanceDueCents: active.balance_due_cents as number,
              dueAt: active.due_at as string | null,
            }
          : null,
        voidedInvoices: (invoices ?? [])
          .filter((i) => i.status === "void")
          .map((i) => ({ id: i.id as string, invoiceNumber: i.invoice_number as string | null })),
        canSettle: !active && ["in_progress", "completed"].includes(job.status as string),
        canRecordDeposit: !active || active.status === "draft",
        permissions: {
          create: await hasPermission(ctx, "invoices.create"),
          viewPayments: canViewPayments,
          recordPayments: await hasPermission(ctx, "payments.record_manual"),
        },
      }
    }),

  /** Final settlement: draft invoice from the job's accepted quote. */
  createFromJob: permissionProcedure("invoices.create")
    .input(jobIdInput)
    .mutation(async ({ ctx, input }): Promise<{ id: string }> => {
      const { data, error } = await ctx.supabase.rpc("create_invoice_from_job", {
        p_job_id: input.jobId,
      })
      if (error) {
        if (error.code === "23505")
          throw new TRPCError({ code: "CONFLICT", message: "This job already has an invoice." })
        throw toWorkflowError(error)
      }
      await writeActivityLog(ctx, {
        action: "invoice.created",
        entityType: "invoice",
        entityId: data as string,
        metadata: { job_id: input.jobId },
      })
      return { id: data as string }
    }),

  update: permissionProcedure("invoices.edit")
    .input(updateInvoiceInput)
    .mutation(async ({ ctx, input }) => {
      requireDraft(await loadInvoiceRow(ctx.supabase, input.id))
      const { error } = await ctx.supabase
        .from("invoices")
        .update({
          title: textOrNull(input.title),
          language: input.language,
          service_date: input.serviceDate ?? null,
          payment_terms_days: input.paymentTermsDays,
          cost_cap_override_reason: textOrNull(input.costCapOverrideReason),
          notes: textOrNull(input.notes),
          internal_notes: textOrNull(input.internalNotes),
        })
        .eq("id", input.id)
      if (error) throw toWorkflowError(error)
      return { id: input.id }
    }),

  /** Replaces all lines in one database call; the database computes every total. */
  saveLines: permissionProcedure("invoices.edit")
    .input(saveInvoiceLinesInput)
    .mutation(async ({ ctx, input }) => {
      requireDraft(await loadInvoiceRow(ctx.supabase, input.id))

      const discounted = input.lines.some((l) => l.discountType && (l.discountValue ?? 0) > 0)
      if (discounted && !(await hasPermission(ctx, "quotes.apply_discount"))) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Missing permission: quotes.apply_discount",
        })
      }

      const items = input.lines.map((l) => ({
        quote_item_id: l.quoteItemId ?? null,
        service_catalog_id: l.serviceCatalogId ?? null,
        item_type: l.itemType,
        name: l.name,
        description: textOrNull(l.description),
        pricing_mode: l.pricingMode,
        quantity: l.quantity,
        quoted_quantity: l.quotedQuantity ?? null,
        unit: textOrNull(l.unit),
        unit_price_cents: l.unitPriceCents,
        discount_type: l.discountType && (l.discountValue ?? 0) > 0 ? l.discountType : null,
        discount_value:
          l.discountType && (l.discountValue ?? 0) > 0
            ? l.discountType === "fixed"
              ? Math.round((l.discountValue ?? 0) * 100)
              : l.discountValue
            : null,
        vat_rate_percent: l.vatRatePercent,
        customer_notes: textOrNull(l.customerNotes),
      }))

      const { error } = await ctx.supabase.rpc("replace_invoice_items", {
        p_invoice_id: input.id,
        p_items: items,
      })
      if (error) throw toWorkflowError(error)
      return { id: input.id }
    }),

  /** Deletes a draft settlement (issued invoices are voided instead). */
  discardDraft: permissionProcedure("invoices.edit")
    .input(invoiceIdInput)
    .mutation(async ({ ctx, input }) => {
      requireDraft(await loadInvoiceRow(ctx.supabase, input.id))
      const { error } = await ctx.supabase
        .from("invoices")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", input.id)
      if (error) throw toWorkflowError(error)
      await writeActivityLog(ctx, {
        action: "invoice.draft_discarded",
        entityType: "invoice",
        entityId: input.id,
      })
      return { id: input.id }
    }),

  /**
   * Issues the invoice: the database assigns the number, invoice and due date
   * and the payment reference in one transaction; then the PDF with QR-bill is
   * stored and optionally e-mailed. All QR-bill data is validated before the
   * status changes, so a rendering problem leaves an issued invoice whose PDF
   * can be created again (regenerateDocument).
   */
  issue: permissionProcedure("invoices.edit")
    .input(issueInvoiceInput)
    .mutation(async ({ ctx, input }) => {
      const row = await loadInvoiceRow(ctx.supabase, input.id)
      requireDraft(row)
      const invoice = mapInvoice(row)

      const problems: string[] = []
      if (invoice.totalAmountCents <= 0) problems.push("Add at least one priced line.")
      if (
        invoice.costCapCents !== null &&
        invoice.totalAmountCents > invoice.costCapCents &&
        !invoice.costCapOverrideReason
      )
        problems.push("The total exceeds the cost cap. Lower the lines or give a reason.")
      if (invoice.totalAmountCents - invoice.depositAppliedCents < 0)
        problems.push("The deposits exceed the invoice total.")
      const missing = ctx.companyId ? await missingPaymentData(ctx.companyId) : []
      if (missing.length)
        problems.push(`Complete the company details for the QR-bill: ${missing.join(", ")}.`)
      const recipient = input.recipientEmail ?? invoice.customerEmail
      if (input.sendEmail && !recipient) problems.push("The customer has no e-mail address.")
      if (problems.length)
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: problems.join(" ") })

      const svc = createServiceRoleClient()
      // Dry run: builds the document incl. QR-bill validation, no rendering
      try {
        await buildInvoiceDocument(svc, input.id)
      } catch (err) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: `The invoice cannot be created: ${err instanceof Error ? err.message : "invalid data"}`,
        })
      }

      await transitionStatus(ctx.supabase, "invoice", input.id, "sent")
      const issued = mapInvoice(await loadInvoiceRow(ctx.supabase, input.id))

      await writeActivityLog(ctx, {
        action: "invoice.issued",
        entityType: "invoice",
        entityId: input.id,
        ...(issued.invoiceNumber ? { entityLabel: issued.invoiceNumber } : {}),
        metadata: {
          total_cents: issued.totalAmountCents,
          cost_cap_override: issued.costCapOverrideReason,
        },
      })

      let document: Awaited<ReturnType<typeof generateInvoiceDocument>>
      try {
        document = await generateInvoiceDocument(svc, input.id, ctx.user.id)
      } catch (err) {
        console.error("[invoices:issue] PDF failed", err)
        return {
          invoiceNumber: issued.invoiceNumber,
          documentId: null,
          documentError: "The invoice was issued, but its PDF could not be created. Try again.",
          emailDelivered: null,
          emailError: null,
        }
      }

      if (!input.sendEmail)
        return {
          invoiceNumber: issued.invoiceNumber,
          documentId: document.documentId,
          documentError: null,
          emailDelivered: null,
          emailError: null,
        }

      const email = await emailInvoice(
        ctx,
        input.id,
        recipient!,
        input.message ?? null,
        document,
        { kind: "invoice" },
        document.context.dueDate,
      )
      return {
        invoiceNumber: issued.invoiceNumber,
        documentId: document.documentId,
        documentError: null,
        emailDelivered: email.delivered,
        emailError: email.reason ?? null,
      }
    }),

  /** Creates the invoice PDF again when it failed at issuing. */
  regenerateDocument: permissionProcedure("invoices.edit")
    .input(invoiceIdInput)
    .mutation(async ({ ctx, input }) => {
      const row = await loadInvoiceRow(ctx.supabase, input.id)
      if (row["status"] === "draft")
        throw new TRPCError({ code: "BAD_REQUEST", message: "Issue the invoice first." })
      const svc = createServiceRoleClient()
      const { data: existing } = await svc
        .from("documents")
        .select("id")
        .eq("entity_type", "invoice")
        .eq("entity_id", input.id)
        .eq("generation_status", "generated")
        .is("notes", null)
        .limit(1)
        .maybeSingle()
      if (existing)
        throw new TRPCError({ code: "BAD_REQUEST", message: "The invoice PDF already exists." })
      const document = await generateInvoiceDocument(svc, input.id, ctx.user.id)
      return { documentId: document.documentId }
    }),

  /** Sends the stored invoice PDF again. */
  resendEmail: permissionProcedure("invoices.edit")
    .input(issueInvoiceInput.omit({ sendEmail: true }))
    .mutation(async ({ ctx, input }) => {
      const invoice = mapInvoice(await loadInvoiceRow(ctx.supabase, input.id))
      if (invoice.status === "draft" || invoice.status === "void")
        throw new TRPCError({ code: "BAD_REQUEST", message: "Only issued invoices can be sent." })
      const recipient = input.recipientEmail ?? invoice.customerEmail
      if (!recipient)
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "No e-mail address." })

      const document = await loadStoredDocument(input.id, null)
      const result = await emailInvoice(
        ctx,
        input.id,
        recipient,
        input.message ?? null,
        document,
        { kind: "invoice" },
        swissDate(invoice.dueAt),
      )
      return { emailDelivered: result.delivered, emailError: result.reason ?? null }
    }),

  /**
   * Next payment reminder (1 → 2 → 3) with the open balance on a new QR-bill.
   * Possible once the invoice is past its due date.
   */
  sendReminder: permissionProcedure("invoices.edit")
    .input(issueInvoiceInput)
    .mutation(async ({ ctx, input }) => {
      const invoice = mapInvoice(await loadInvoiceRow(ctx.supabase, input.id))
      if (!(OPEN_STATUSES as readonly string[]).includes(invoice.status) || !invoice.dueAt)
        throw new TRPCError({ code: "BAD_REQUEST", message: "Only open invoices get reminders." })
      if (new Date(invoice.dueAt) > new Date())
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "The invoice is not due yet.",
        })
      if (invoice.reminderLevel >= 3)
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "The third reminder was already sent. Decide on debt collection.",
        })
      const recipient = input.recipientEmail ?? invoice.customerEmail
      if (input.sendEmail && !recipient)
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "The customer has no e-mail address.",
        })

      const level = (invoice.reminderLevel + 1) as 1 | 2 | 3
      const svc = createServiceRoleClient()
      const document = await generateInvoiceDocument(svc, input.id, ctx.user.id, {
        kind: "reminder",
        level,
      })
      const { error } = await ctx.supabase
        .from("invoices")
        .update({ reminder_level: level, last_reminder_at: new Date().toISOString() })
        .eq("id", input.id)
      if (error) throw toWorkflowError(error)

      await writeActivityLog(ctx, {
        action: "invoice.reminder_created",
        entityType: "invoice",
        entityId: input.id,
        ...(invoice.invoiceNumber ? { entityLabel: invoice.invoiceNumber } : {}),
        metadata: {
          level,
          document_id: document.documentId,
          balance_cents: invoice.balanceDueCents,
        },
      })

      // Task "send reminder" resolves right away
      await svc.rpc("sync_system_tasks", { p_company_id: ctx.companyId })

      if (!input.sendEmail)
        return { level, documentId: document.documentId, emailDelivered: null, emailError: null }
      const email = await emailInvoice(
        ctx,
        input.id,
        recipient!,
        input.message ?? null,
        document,
        { kind: "reminder", level },
        document.context.dueDate,
      )
      return {
        level,
        documentId: document.documentId,
        emailDelivered: email.delivered,
        emailError: email.reason ?? null,
      }
    }),

  void: permissionProcedure("invoices.cancel")
    .input(reasonInput)
    .mutation(async ({ ctx, input }) => {
      await transitionStatus(ctx.supabase, "invoice", input.id, "void", input.reason)
      await writeActivityLog(ctx, {
        action: "invoice.voided",
        entityType: "invoice",
        entityId: input.id,
        metadata: { reason: input.reason },
      })
      return { id: input.id }
    }),

  writeOff: permissionProcedure("invoices.cancel")
    .input(reasonInput)
    .mutation(async ({ ctx, input }) => {
      await transitionStatus(ctx.supabase, "invoice", input.id, "write_off", input.reason)
      await writeActivityLog(ctx, {
        action: "invoice.written_off",
        entityType: "invoice",
        entityId: input.id,
        metadata: { reason: input.reason },
      })
      return { id: input.id }
    }),

  /** Short-lived link to a stored invoice or reminder PDF. */
  documentUrl: permissionProcedure("invoices.view")
    .input(invoiceIdInput.extend({ documentId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { data: doc } = await ctx.supabase
        .from("documents")
        .select("storage_path")
        .eq("id", input.documentId)
        .eq("entity_type", "invoice")
        .eq("entity_id", input.id)
        .maybeSingle()
      if (!doc?.storage_path)
        throw new TRPCError({ code: "NOT_FOUND", message: "Document not found" })

      const { data, error } = await createServiceRoleClient()
        .storage.from("documents")
        .createSignedUrl(doc.storage_path as string, 3600)
      if (error || !data) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" })
      return { url: data.signedUrl }
    }),

  // ─── Payments ───────────────────────────────────────────────────────────────

  /** Bank transfer, cash or card payment on an issued invoice (partial or full). */
  recordPayment: permissionProcedure("payments.record_manual")
    .input(recordPaymentInput)
    .mutation(async ({ ctx, input }) => {
      if (!ctx.companyId) throw new TRPCError({ code: "UNAUTHORIZED" })
      const invoice = mapInvoice(await loadInvoiceRow(ctx.supabase, input.invoiceId))
      const { data, error } = await ctx.supabase
        .from("payments")
        .insert({
          company_id: ctx.companyId,
          job_id: invoice.jobId,
          invoice_id: invoice.id,
          customer_id: invoice.customerId,
          recorded_by: ctx.user.id,
          payment_type: input.amountCents >= invoice.balanceDueCents ? "balance" : "partial",
          method: input.method,
          status: "completed",
          amount_cents: input.amountCents,
          currency: "CHF",
          reference_number: textOrNull(input.reference),
          notes: textOrNull(input.notes),
          paid_at: paidAtFrom(input.paidOn),
        })
        .select("id")
        .single()
      if (error || !data) throw paymentError(error ?? {})

      await writeActivityLog(ctx, {
        action: "payment.recorded",
        entityType: "invoice",
        entityId: invoice.id,
        ...(invoice.invoiceNumber ? { entityLabel: invoice.invoiceNumber } : {}),
        metadata: { payment_id: data.id, amount_cents: input.amountCents, method: input.method },
      })
      const after = mapInvoice(await loadInvoiceRow(ctx.supabase, invoice.id))
      return { id: data.id as string, status: after.status, balanceDueCents: after.balanceDueCents }
    }),

  /** Deposit (Anzahlung) on a job before it is invoiced. */
  recordDeposit: permissionProcedure("payments.record_manual")
    .input(recordDepositInput)
    .mutation(async ({ ctx, input }) => {
      if (!ctx.companyId) throw new TRPCError({ code: "UNAUTHORIZED" })
      const { data: job } = await ctx.supabase
        .from("jobs")
        .select("id, customer_id, job_number")
        .eq("id", input.jobId)
        .is("deleted_at", null)
        .maybeSingle()
      if (!job) throw new TRPCError({ code: "NOT_FOUND", message: "Job not found" })

      const { data, error } = await ctx.supabase
        .from("payments")
        .insert({
          company_id: ctx.companyId,
          job_id: job.id,
          invoice_id: null,
          customer_id: job.customer_id,
          recorded_by: ctx.user.id,
          payment_type: "deposit",
          method: input.method,
          status: "completed",
          amount_cents: input.amountCents,
          currency: "CHF",
          reference_number: textOrNull(input.reference),
          notes: textOrNull(input.notes),
          paid_at: paidAtFrom(input.paidOn),
        })
        .select("id")
        .single()
      if (error || !data) throw paymentError(error ?? {})

      await writeActivityLog(ctx, {
        action: "payment.deposit_recorded",
        entityType: "job",
        entityId: job.id as string,
        entityLabel: job.job_number as string,
        metadata: { payment_id: data.id, amount_cents: input.amountCents, method: input.method },
      })
      return { id: data.id as string }
    }),

  /** A wrongly recorded payment is cancelled with a reason (kept for the audit trail). */
  cancelPayment: permissionProcedure("payments.record_manual")
    .input(reasonInput)
    .mutation(async ({ ctx, input }) => {
      const { data: payment } = await ctx.supabase
        .from("payments")
        .select("id, invoice_id, job_id, amount_cents")
        .eq("id", input.id)
        .is("deleted_at", null)
        .maybeSingle()
      if (!payment) throw new TRPCError({ code: "NOT_FOUND", message: "Payment not found" })

      await transitionStatus(ctx.supabase, "payment", input.id, "cancelled", input.reason)
      await writeActivityLog(ctx, {
        action: "payment.cancelled",
        entityType: payment.invoice_id ? "invoice" : "job",
        entityId: (payment.invoice_id ?? payment.job_id) as string,
        metadata: {
          payment_id: input.id,
          amount_cents: payment.amount_cents,
          reason: input.reason,
        },
      })
      return { id: input.id }
    }),
})

// ─── Documents and e-mail ─────────────────────────────────────────────────────

/** Latest stored invoice PDF (reminderLevel null) or reminder PDF. */
async function loadStoredDocument(invoiceId: string, reminderLevel: number | null) {
  const svc = createServiceRoleClient()
  let query = svc
    .from("documents")
    .select("id, name, storage_path")
    .eq("entity_type", "invoice")
    .eq("entity_id", invoiceId)
    .eq("generation_status", "generated")
    .is("voided_at", null)
  query =
    reminderLevel === null
      ? query.is("notes", null)
      : query.eq("notes", `reminder_level=${reminderLevel}`)
  const { data: doc } = await query.order("created_at", { ascending: false }).limit(1).maybeSingle()
  if (!doc) throw new TRPCError({ code: "NOT_FOUND", message: "Invoice document not found." })

  const { data: file, error } = await svc.storage
    .from("documents")
    .download(doc.storage_path as string)
  if (error || !file)
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "PDF not available." })
  return {
    documentId: doc.id as string,
    fileName: doc.name as string,
    pdf: Buffer.from(await file.arrayBuffer()),
  }
}

async function emailInvoice(
  ctx: Ctx,
  invoiceId: string,
  recipient: string,
  message: string | null,
  document: { documentId: string; fileName: string; pdf: Buffer },
  variant: InvoiceDocumentKind,
  /** Pay-by date printed on the document (Swiss calendar day) */
  dueDate: string,
) {
  const svc = createServiceRoleClient()
  const { data: inv } = await svc
    .from("invoices")
    .select(
      "company_id, invoice_number, language, balance_due_cents, customers(first_name, last_name), companies(name, legal_name, email, phone, website, accent_color)",
    )
    .eq("id", invoiceId)
    .single()
  if (!inv) throw new TRPCError({ code: "NOT_FOUND" })

  const row = inv as unknown as {
    company_id: string
    invoice_number: string
    language: DocumentLanguage
    balance_due_cents: number
    customers: { first_name: string; last_name: string } | null
    companies: Record<string, string | null>
  }
  const text = INVOICE_EMAIL_TEXT[row.language]
  const labels = INVOICE_LABELS[row.language]
  const company = row.companies
  const companyName = company["name"] ?? company["legal_name"] ?? "Bivro"
  const customer = row.customers ? `${row.customers.first_name} ${row.customers.last_name}` : ""
  const reminder = variant.kind === "reminder" ? variant : null

  const result = await sendTenantEmail({
    companyId: row.company_id,
    companyName,
    replyTo: company["email"] ?? null,
    to: recipient,
    toName: customer || null,
    subject: reminder
      ? text.reminderSubject(labels[`reminder_${reminder.level}`], row.invoice_number)
      : text.subject(companyName, row.invoice_number),
    language: row.language,
    triggerEvent: reminder ? "invoice.reminder" : "invoice.sent",
    entityType: "invoice",
    entityId: invoiceId,
    attachment: {
      fileName: document.fileName,
      content: document.pdf,
      documentId: document.documentId,
    },
    react: createElement(DocumentEmail, {
      greeting: text.greeting(customer),
      body: reminder ? text.reminderBody : text.body,
      note: text.due(formatCents(row.balance_due_cents), formatDocumentDate(dueDate, row.language)),
      personalMessage: textOrNull(message),
      closing: text.closing,
      companyName,
      companyContact: [
        company["legal_name"],
        formatPhone(company["phone"]),
        company["email"],
        company["website"],
      ]
        .filter(Boolean)
        .join(" · "),
      accentColor: /^#[0-9a-fA-F]{6}$/.test(company["accent_color"] ?? "")
        ? company["accent_color"]!
        : "#1f2937",
    }),
  })

  await writeActivityLog(ctx, {
    action: result.delivered ? "invoice.emailed" : "invoice.email_failed",
    entityType: "invoice",
    entityId: invoiceId,
    metadata: {
      to: recipient,
      reminder_level: reminder?.level ?? 0,
      email_log_id: result.emailLogId,
      reason: result.reason ?? null,
    },
  })
  return result
}
