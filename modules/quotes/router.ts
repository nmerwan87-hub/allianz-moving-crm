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
import { getCachedPermissions } from "@/modules/iam/lib/permissions"
import { transitionStatus, toWorkflowError } from "@/modules/workflow/transitions"
import { generateQuoteDocument } from "@/lib/documents/quote-document"
import { QUOTE_EMAIL_TEXT, formatDocumentDate, type DocumentLanguage } from "@/lib/documents/labels"
import { sendTenantEmail } from "@/lib/email/tenant"
import { QuoteEmail } from "@/emails/tenant/quote-email"
import {
  createQuoteInput,
  updateQuoteInput,
  saveLinesInput,
  listQuotesInput,
  quoteIdInput,
  sendQuoteInput,
  declineQuoteInput,
  type Quote,
  type QuoteLine,
  type QuoteSummary,
} from "./schema"

// ─── Helpers ──────────────────────────────────────────────────────────────────

const QUOTE_COLUMNS =
  "id, quote_number, version, status, title, customer_id, lead_id, language, move_type, scheduled_date, date_flexible, origin_address, origin_postal_code, origin_city, origin_floor, origin_has_elevator, dest_address, dest_postal_code, dest_city, dest_floor, dest_has_elevator, distance_km, estimated_hours, subtotal_cents, discount_cents, tax_cents, total_amount_cents, deposit_percent, deposit_amount_cents, cost_cap_cents, customer_notes, internal_notes, expires_at, sent_at, accepted_at, declined_at, declined_reason, created_at, customers(first_name, last_name, company_name, customer_type, email)"

const LINE_COLUMNS =
  "id, service_catalog_id, item_type, name, description, pricing_mode, quantity, unit, unit_price_cents, cost_price_cents, discount_type, discount_value, discount_amount_cents, net_total_cents, vat_rate_percent, vat_amount_cents, gross_total_cents, internal_notes, customer_notes, sort_order"

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

function customerName(c: Record<string, unknown> | null): string | null {
  if (!c) return null
  const person = `${c["first_name"] as string} ${c["last_name"] as string}`
  return c["customer_type"] === "business" && c["company_name"]
    ? `${c["company_name"] as string} (${person})`
    : person
}

function mapSummary(r: Record<string, unknown>): QuoteSummary {
  return {
    id: r["id"] as string,
    quoteNumber: r["quote_number"] as string,
    version: r["version"] as number,
    status: r["status"] as QuoteSummary["status"],
    title: r["title"] as string | null,
    customerId: r["customer_id"] as string | null,
    customerName: customerName(r["customers"] as Record<string, unknown> | null),
    scheduledDate: r["scheduled_date"] as string | null,
    totalAmountCents: r["total_amount_cents"] as number,
    expiresAt: r["expires_at"] as string | null,
    sentAt: r["sent_at"] as string | null,
    createdAt: r["created_at"] as string,
  }
}

function mapQuote(r: Record<string, unknown>, totalCostCents: number | null): Quote {
  const n = (key: string) => (r[key] === null || r[key] === undefined ? null : Number(r[key]))
  return {
    ...mapSummary(r),
    leadId: r["lead_id"] as string | null,
    language: r["language"] as Quote["language"],
    moveType: r["move_type"] as Quote["moveType"],
    dateFlexible: r["date_flexible"] as boolean,
    originAddress: r["origin_address"] as string | null,
    originPostalCode: r["origin_postal_code"] as string | null,
    originCity: r["origin_city"] as string | null,
    originFloor: r["origin_floor"] as number | null,
    originHasElevator: r["origin_has_elevator"] as boolean,
    destAddress: r["dest_address"] as string | null,
    destPostalCode: r["dest_postal_code"] as string | null,
    destCity: r["dest_city"] as string | null,
    destFloor: r["dest_floor"] as number | null,
    destHasElevator: r["dest_has_elevator"] as boolean,
    distanceKm: n("distance_km"),
    estimatedHours: n("estimated_hours"),
    subtotalCents: r["subtotal_cents"] as number,
    discountCents: r["discount_cents"] as number,
    taxCents: r["tax_cents"] as number,
    depositPercent: Number(r["deposit_percent"]),
    depositAmountCents: r["deposit_amount_cents"] as number,
    costCapCents: r["cost_cap_cents"] as number | null,
    customerNotes: r["customer_notes"] as string | null,
    internalNotes: r["internal_notes"] as string | null,
    acceptedAt: r["accepted_at"] as string | null,
    declinedAt: r["declined_at"] as string | null,
    declinedReason: r["declined_reason"] as string | null,
    customerEmail:
      ((r["customers"] as Record<string, unknown> | null)?.["email"] as string | null) ?? null,
    totalCostCents,
  }
}

function mapLine(r: Record<string, unknown>, showCost: boolean): QuoteLine {
  return {
    id: r["id"] as string,
    serviceCatalogId: r["service_catalog_id"] as string | null,
    itemType: r["item_type"] as QuoteLine["itemType"],
    name: r["name"] as string,
    description: r["description"] as string | null,
    pricingMode: r["pricing_mode"] as QuoteLine["pricingMode"],
    quantity: Number(r["quantity"]),
    unit: r["unit"] as string | null,
    unitPriceCents: r["unit_price_cents"] as number,
    costPriceCents: showCost ? (r["cost_price_cents"] as number) : null,
    discountType: r["discount_type"] as QuoteLine["discountType"],
    discountValue: r["discount_value"] === null ? null : Number(r["discount_value"]),
    discountAmountCents: r["discount_amount_cents"] as number,
    netTotalCents: r["net_total_cents"] as number,
    vatRatePercent: Number(r["vat_rate_percent"]),
    vatAmountCents: r["vat_amount_cents"] as number,
    grossTotalCents: r["gross_total_cents"] as number,
    internalNotes: r["internal_notes"] as string | null,
    customerNotes: r["customer_notes"] as string | null,
  }
}

async function loadQuoteRow(sb: SupabaseClient, id: string): Promise<Record<string, unknown>> {
  const { data, error } = await sb.from("quotes").select(QUOTE_COLUMNS).eq("id", id).maybeSingle()
  if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to load quote" })
  if (!data) throw new TRPCError({ code: "NOT_FOUND", message: "Quote not found" })
  return data as unknown as Record<string, unknown>
}

function requireDraft(row: Record<string, unknown>) {
  if (row["status"] !== "draft") {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "This quote was already sent and cannot be changed. Create a new version instead.",
    })
  }
}

function addDays(date: Date, days: number): string {
  const d = new Date(date)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

// ─── Procedures ───────────────────────────────────────────────────────────────

export const quotesRouter = createTRPCRouter({
  /** Current versions only — superseded versions appear on the quote itself. */
  list: permissionProcedure("quotes.view")
    .input(listQuotesInput)
    .query(async ({ ctx, input }) => {
      const offset = (input.page - 1) * input.pageSize
      let query = ctx.supabase
        .from("quotes")
        .select(QUOTE_COLUMNS, { count: "exact" })
        .is("deleted_at", null)
        .neq("status", "superseded")

      if (input.status) query = query.eq("status", input.status)
      if (input.customerId) query = query.eq("customer_id", input.customerId)
      const s = sanitizeSearch(input.search)
      if (s) query = query.or(`quote_number.ilike.%${s}%,title.ilike.%${s}%`)

      const { data, error, count } = await query
        .order("created_at", { ascending: false })
        .range(offset, offset + input.pageSize - 1)
      if (error)
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to fetch quotes" })

      const total = count ?? 0
      return {
        items: (data ?? []).map((r) => mapSummary(r as unknown as Record<string, unknown>)),
        total,
        page: input.page,
        pageSize: input.pageSize,
        totalPages: Math.ceil(total / input.pageSize) || 1,
      }
    }),

  get: permissionProcedure("quotes.view")
    .input(quoteIdInput)
    .query(async ({ ctx, input }) => {
      const row = await loadQuoteRow(ctx.supabase, input.id)
      const showCost = await hasPermission(ctx, "quotes.view_cost_price")

      const [{ data: lines }, { data: versions }, { data: documents }, { data: emails }] =
        await Promise.all([
          ctx.supabase
            .from("quote_items")
            .select(LINE_COLUMNS)
            .eq("quote_id", input.id)
            .order("sort_order"),
          ctx.supabase
            .from("quotes")
            .select("id, version, status, sent_at, created_at")
            .eq("quote_number", row["quote_number"] as string)
            .is("deleted_at", null)
            .order("version", { ascending: false }),
          ctx.supabase
            .from("documents")
            .select("id, name, version, generated_at, generation_status")
            .eq("entity_type", "quote")
            .eq("entity_id", input.id)
            .eq("generation_status", "generated")
            .is("deleted_at", null)
            .order("created_at", { ascending: false }),
          ctx.supabase
            .from("email_logs")
            .select("id, to_email, status, error_message, created_at")
            .eq("entity_type", "quote")
            .eq("entity_id", input.id)
            .order("created_at", { ascending: false }),
        ])

      const mappedLines = (lines ?? []).map((l) => mapLine(l as Record<string, unknown>, showCost))
      const totalCost = showCost
        ? (lines ?? []).reduce(
            (sum, l) => sum + Math.round(Number(l.quantity) * (l.cost_price_cents as number)),
            0,
          )
        : null

      return {
        quote: mapQuote(row, totalCost),
        lines: mappedLines,
        versions: (versions ?? []).map((v) => ({
          id: v.id as string,
          version: v.version as number,
          status: v.status as string,
          sentAt: v.sent_at as string | null,
          createdAt: v.created_at as string,
        })),
        documents: (documents ?? []).map((d) => ({
          id: d.id as string,
          name: d.name as string,
          version: d.version as number,
          generatedAt: d.generated_at as string | null,
        })),
        emails: (emails ?? []).map((e) => ({
          id: e.id as string,
          to: e.to_email as string,
          status: e.status as string,
          error: e.error_message as string | null,
          createdAt: e.created_at as string,
        })),
        permissions: {
          viewCost: showCost,
          applyDiscount: await hasPermission(ctx, "quotes.apply_discount"),
          send: await hasPermission(ctx, "quotes.send"),
          edit: await hasPermission(ctx, "quotes.edit"),
        },
      }
    }),

  /** New draft for a customer, prefilled from the lead and the company's terms. */
  create: permissionProcedure("quotes.create")
    .input(createQuoteInput)
    .mutation(async ({ ctx, input }): Promise<{ id: string }> => {
      if (!ctx.companyId) throw new TRPCError({ code: "UNAUTHORIZED" })
      const sb = ctx.supabase

      const { data: customer } = await sb
        .from("customers")
        .select("id, preferred_language, billing_street, billing_postal_code, billing_city")
        .eq("id", input.customerId)
        .is("deleted_at", null)
        .maybeSingle()
      if (!customer) throw new TRPCError({ code: "NOT_FOUND", message: "Customer not found" })

      const lead = input.leadId
        ? (
            await sb
              .from("leads")
              .select(
                "id, move_type, requested_date, date_flexible, origin_address, origin_postal_code, origin_city, origin_floor, origin_has_elevator, dest_address, dest_postal_code, dest_city, dest_floor, dest_has_elevator",
              )
              .eq("id", input.leadId)
              .is("deleted_at", null)
              .maybeSingle()
          ).data
        : null
      if (input.leadId && !lead)
        throw new TRPCError({ code: "NOT_FOUND", message: "Lead not found" })

      const { data: settings } = await sb
        .from("company_settings")
        .select("default_deposit_percent, default_quote_expiry_days, tax_rate_percent, tax_enabled")
        .maybeSingle()

      const svc = createServiceRoleClient()
      const { data: number, error: numberError } = await svc.rpc("generate_sequence_number", {
        p_company_id: ctx.companyId,
        p_sequence_type: "quote",
      })
      if (numberError || !number) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" })

      const { data, error } = await sb
        .from("quotes")
        .insert({
          company_id: ctx.companyId,
          customer_id: input.customerId,
          lead_id: lead?.id ?? null,
          created_by: ctx.user.id,
          quote_number: number,
          status: "draft",
          language: customer.preferred_language,
          move_type: lead?.move_type ?? "local",
          scheduled_date: lead?.requested_date ?? null,
          date_flexible: lead?.date_flexible ?? false,
          origin_address: lead?.origin_address ?? customer.billing_street ?? null,
          origin_postal_code: lead?.origin_postal_code ?? customer.billing_postal_code ?? null,
          origin_city: lead?.origin_city ?? customer.billing_city ?? null,
          origin_floor: lead?.origin_floor ?? null,
          origin_has_elevator: lead?.origin_has_elevator ?? false,
          dest_address: lead?.dest_address ?? null,
          dest_postal_code: lead?.dest_postal_code ?? null,
          dest_city: lead?.dest_city ?? null,
          dest_floor: lead?.dest_floor ?? null,
          dest_has_elevator: lead?.dest_has_elevator ?? false,
          deposit_percent: Number(settings?.default_deposit_percent ?? 0),
          tax_rate_percent: settings?.tax_enabled ? Number(settings.tax_rate_percent ?? 0) : 0,
          expires_at: addDays(new Date(), Number(settings?.default_quote_expiry_days ?? 30)),
        })
        .select("id")
        .single()
      if (error || !data)
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to create quote" })

      await writeActivityLog(ctx, {
        action: "quote.created",
        entityType: "quote",
        entityId: data.id as string,
        entityLabel: number as string,
      })
      return { id: data.id as string }
    }),

  update: permissionProcedure("quotes.edit")
    .input(updateQuoteInput)
    .mutation(async ({ ctx, input }) => {
      requireDraft(await loadQuoteRow(ctx.supabase, input.id))

      const { error } = await ctx.supabase
        .from("quotes")
        .update({
          title: textOrNull(input.title),
          language: input.language,
          move_type: input.moveType,
          scheduled_date: input.scheduledDate ?? null,
          date_flexible: input.dateFlexible,
          origin_address: textOrNull(input.originAddress),
          origin_postal_code: textOrNull(input.originPostalCode),
          origin_city: textOrNull(input.originCity),
          origin_floor: input.originFloor ?? null,
          origin_has_elevator: input.originHasElevator,
          dest_address: textOrNull(input.destAddress),
          dest_postal_code: textOrNull(input.destPostalCode),
          dest_city: textOrNull(input.destCity),
          dest_floor: input.destFloor ?? null,
          dest_has_elevator: input.destHasElevator,
          distance_km: input.distanceKm ?? null,
          estimated_hours: input.estimatedHours ?? null,
          deposit_percent: input.depositPercent,
          cost_cap_cents: input.costCapCents ?? null,
          expires_at: input.validUntil,
          customer_notes: textOrNull(input.customerNotes),
          internal_notes: textOrNull(input.internalNotes),
        })
        .eq("id", input.id)
      if (error) throw toWorkflowError(error)
      return { id: input.id }
    }),

  /**
   * Replaces all lines in one database call; the database computes every line
   * and quote total. Users without quotes.view_cost_price keep the existing
   * cost prices (matched by line id); new lines take the catalog cost.
   */
  saveLines: permissionProcedure("quotes.edit")
    .input(saveLinesInput)
    .mutation(async ({ ctx, input }) => {
      requireDraft(await loadQuoteRow(ctx.supabase, input.id))

      const discounted = input.lines.some((l) => l.discountType && (l.discountValue ?? 0) > 0)
      if (discounted && !(await hasPermission(ctx, "quotes.apply_discount"))) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Missing permission: quotes.apply_discount",
        })
      }

      let costById = new Map<string, number>()
      let costByService = new Map<string, number>()
      const showCost = await hasPermission(ctx, "quotes.view_cost_price")
      if (!showCost) {
        const [{ data: existing }, { data: services }] = await Promise.all([
          ctx.supabase.from("quote_items").select("id, cost_price_cents").eq("quote_id", input.id),
          ctx.supabase.from("service_catalog").select("id, default_cost_price_cents"),
        ])
        costById = new Map(
          (existing ?? []).map((e) => [e.id as string, e.cost_price_cents as number]),
        )
        costByService = new Map(
          (services ?? []).map((s) => [
            s.id as string,
            (s.default_cost_price_cents as number) ?? 0,
          ]),
        )
      }

      const items = input.lines.map((l) => ({
        service_catalog_id: l.serviceCatalogId ?? null,
        item_type: l.itemType,
        name: l.name,
        description: textOrNull(l.description),
        pricing_mode: l.pricingMode,
        quantity: l.quantity,
        unit: textOrNull(l.unit),
        unit_price_cents: l.unitPriceCents,
        cost_price_cents: showCost
          ? l.costPriceCents
          : ((l.id ? costById.get(l.id) : undefined) ??
            (l.serviceCatalogId ? costByService.get(l.serviceCatalogId) : undefined) ??
            0),
        discount_type: l.discountType && (l.discountValue ?? 0) > 0 ? l.discountType : null,
        discount_value:
          l.discountType && (l.discountValue ?? 0) > 0
            ? l.discountType === "fixed"
              ? Math.round((l.discountValue ?? 0) * 100)
              : l.discountValue
            : null,
        vat_rate_percent: l.vatRatePercent,
        internal_notes: textOrNull(l.internalNotes),
        customer_notes: textOrNull(l.customerNotes),
      }))

      const { error } = await ctx.supabase.rpc("replace_quote_items", {
        p_quote_id: input.id,
        p_items: items,
      })
      if (error) {
        const message = error.message.match(/invalid_line: (.*)/)?.[1]
        if (message) throw new TRPCError({ code: "BAD_REQUEST", message })
        throw toWorkflowError(error)
      }
      return { id: input.id }
    }),

  /**
   * Freezes the quote: PDF generated and stored (immutable), status → sent,
   * optionally e-mailed with the PDF attached. The PDF is generated before the
   * status change so a rendering problem never leaves a "sent" quote without
   * a document.
   */
  send: permissionProcedure("quotes.send")
    .input(sendQuoteInput)
    .mutation(async ({ ctx, input }) => {
      const row = await loadQuoteRow(ctx.supabase, input.id)
      requireDraft(row)
      const quote = mapQuote(row, null)

      const problems: string[] = []
      if (!quote.customerId) problems.push("Choose a customer.")
      if (quote.totalAmountCents <= 0) problems.push("Add at least one priced line.")
      if (quote.costCapCents !== null && quote.totalAmountCents > quote.costCapCents)
        problems.push("The total exceeds the cost cap. Lower the prices or raise the cap.")
      if (!quote.expiresAt || quote.expiresAt.slice(0, 10) <= new Date().toISOString().slice(0, 10))
        problems.push("Set a validity date in the future.")
      const recipient = input.recipientEmail ?? quote.customerEmail
      if (input.sendEmail && !recipient) problems.push("The customer has no e-mail address.")
      if (problems.length)
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: problems.join(" ") })

      const svc = createServiceRoleClient()
      const document = await generateQuoteDocument(svc, input.id, ctx.user.id)

      try {
        await transitionStatus(ctx.supabase, "quote", input.id, "sent")
      } catch (err) {
        await svc
          .from("documents")
          .update({ voided_at: new Date().toISOString(), void_reason: "Quote could not be sent" })
          .eq("id", document.documentId)
        throw err
      }

      await writeActivityLog(ctx, {
        action: "quote.sent",
        entityType: "quote",
        entityId: input.id,
        entityLabel: quote.quoteNumber,
        metadata: { document_id: document.documentId, email: input.sendEmail ? recipient : null },
      })

      if (!input.sendEmail) return { emailDelivered: null, documentId: document.documentId }

      const email = await emailQuote(ctx, input.id, recipient!, input.message ?? null, document)
      return {
        emailDelivered: email.delivered,
        emailError: email.reason ?? null,
        documentId: document.documentId,
      }
    }),

  /** Sends the stored PDF of a sent quote again (e.g. new address, lost e-mail). */
  resendEmail: permissionProcedure("quotes.send")
    .input(sendQuoteInput.omit({ sendEmail: true }))
    .mutation(async ({ ctx, input }) => {
      const row = await loadQuoteRow(ctx.supabase, input.id)
      if (!["sent", "viewed"].includes(row["status"] as string)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Only sent quotes can be e-mailed again.",
        })
      }
      const quote = mapQuote(row, null)
      const recipient = input.recipientEmail ?? quote.customerEmail
      if (!recipient)
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "No e-mail address." })

      const svc = createServiceRoleClient()
      const { data: doc } = await svc
        .from("documents")
        .select("id, name, storage_path")
        .eq("entity_type", "quote")
        .eq("entity_id", input.id)
        .eq("generation_status", "generated")
        .is("voided_at", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle()
      if (!doc) throw new TRPCError({ code: "NOT_FOUND", message: "Quote document not found." })

      const { data: file, error } = await svc.storage
        .from("documents")
        .download(doc.storage_path as string)
      if (error || !file)
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "PDF not available." })

      const result = await emailQuote(ctx, input.id, recipient, input.message ?? null, {
        documentId: doc.id as string,
        fileName: doc.name as string,
        pdf: Buffer.from(await file.arrayBuffer()),
      })
      return { emailDelivered: result.delivered, emailError: result.reason ?? null }
    }),

  /** Customer accepted by phone, letter or e-mail. */
  markAccepted: permissionProcedure("quotes.edit")
    .input(quoteIdInput)
    .mutation(async ({ ctx, input }) => {
      await transitionStatus(ctx.supabase, "quote", input.id, "accepted")
      await writeActivityLog(ctx, {
        action: "quote.accepted",
        entityType: "quote",
        entityId: input.id,
      })
      return { id: input.id }
    }),

  markDeclined: permissionProcedure("quotes.edit")
    .input(declineQuoteInput)
    .mutation(async ({ ctx, input }) => {
      await transitionStatus(ctx.supabase, "quote", input.id, "declined", input.reason)
      await writeActivityLog(ctx, {
        action: "quote.declined",
        entityType: "quote",
        entityId: input.id,
        metadata: { reason: input.reason },
      })
      return { id: input.id }
    }),

  cancel: permissionProcedure("quotes.delete")
    .input(quoteIdInput)
    .mutation(async ({ ctx, input }) => {
      await transitionStatus(ctx.supabase, "quote", input.id, "cancelled")
      await writeActivityLog(ctx, {
        action: "quote.cancelled",
        entityType: "quote",
        entityId: input.id,
      })
      return { id: input.id }
    }),

  /** New editable version; a sent/viewed predecessor becomes superseded. */
  createRevision: permissionProcedure("quotes.edit")
    .input(quoteIdInput)
    .mutation(async ({ ctx, input }): Promise<{ id: string }> => {
      const { data, error } = await ctx.supabase.rpc("create_quote_revision", {
        p_quote_id: input.id,
      })
      if (error) {
        if (error.code === "23505") {
          throw new TRPCError({
            code: "CONFLICT",
            message: "A new version of this quote is already in progress.",
          })
        }
        throw toWorkflowError(error)
      }
      await writeActivityLog(ctx, {
        action: "quote.revised",
        entityType: "quote",
        entityId: data as string,
        metadata: { previous_quote_id: input.id },
      })
      return { id: data as string }
    }),

  /** Short-lived link to a stored quote PDF (PDF_ENGINE.md §12.3). */
  documentUrl: permissionProcedure("quotes.view")
    .input(quoteIdInput.extend({ documentId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      // Visibility through the user's own client (RLS) before the signed URL
      const { data: doc } = await ctx.supabase
        .from("documents")
        .select("storage_path")
        .eq("id", input.documentId)
        .eq("entity_type", "quote")
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
})

// ─── E-mail ───────────────────────────────────────────────────────────────────

async function emailQuote(
  ctx: Ctx,
  quoteId: string,
  recipient: string,
  message: string | null,
  document: { documentId: string; fileName: string; pdf: Buffer },
) {
  const svc = createServiceRoleClient()
  const { data: q } = await svc
    .from("quotes")
    .select(
      "company_id, quote_number, language, expires_at, customers(first_name, last_name, salutation), companies(name, legal_name, email, phone, website, accent_color)",
    )
    .eq("id", quoteId)
    .single()
  if (!q) throw new TRPCError({ code: "NOT_FOUND" })

  const row = q as unknown as {
    company_id: string
    quote_number: string
    language: DocumentLanguage
    expires_at: string | null
    customers: { first_name: string; last_name: string } | null
    companies: Record<string, string | null>
  }
  const text = QUOTE_EMAIL_TEXT[row.language]
  const company = row.companies
  const companyName = company["name"] ?? company["legal_name"] ?? "Bivro"
  const customer = row.customers ? `${row.customers.first_name} ${row.customers.last_name}` : ""

  const result = await sendTenantEmail({
    companyId: row.company_id,
    companyName,
    replyTo: company["email"] ?? null,
    to: recipient,
    toName: customer || null,
    subject: text.subject(companyName, row.quote_number),
    language: row.language,
    triggerEvent: "quote.sent",
    entityType: "quote",
    entityId: quoteId,
    attachment: {
      fileName: document.fileName,
      content: document.pdf,
      documentId: document.documentId,
    },
    react: createElement(QuoteEmail, {
      greeting: text.greeting(customer),
      body: text.body,
      validity: text.valid(formatDocumentDate(row.expires_at, row.language)),
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
    action: result.delivered ? "quote.emailed" : "quote.email_failed",
    entityType: "quote",
    entityId: quoteId,
    metadata: { to: recipient, email_log_id: result.emailLogId, reason: result.reason ?? null },
  })
  return result
}
