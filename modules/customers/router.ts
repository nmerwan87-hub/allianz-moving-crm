import { TRPCError } from "@trpc/server"
import type { SupabaseClient } from "@supabase/supabase-js"
import { createTRPCRouter, permissionProcedure } from "@/lib/trpc/init"
import { writeActivityLog } from "@/lib/audit/activity"
import { normalizePhone } from "@/lib/format/phone"
import { sanitizeSearch } from "@/lib/format/search"
import {
  createCustomerInput,
  updateCustomerInput,
  listCustomersInput,
  findDuplicatesInput,
  customerIdInput,
  type CreateCustomerInput,
  type Customer,
  type CustomerListResult,
  type CustomerDuplicate,
} from "./schema"

// ─── Helpers ──────────────────────────────────────────────────────────────────

const CUSTOMER_COLUMNS =
  "id, customer_type, salutation, first_name, last_name, company_name, email, phone, secondary_phone, preferred_language, billing_street, billing_postal_code, billing_city, billing_country, source, referral_source, internal_notes, total_jobs_count, total_revenue_cents, last_job_at, deleted_at, created_at, updated_at"

function textOrNull(v: string | null | undefined): string | null {
  if (v === undefined || v === null) return null
  const trimmed = v.trim()
  return trimmed === "" ? null : trimmed
}

function displayName(row: Record<string, unknown>): string {
  const person = `${row["first_name"] as string} ${row["last_name"] as string}`
  const company = row["company_name"] as string | null
  return row["customer_type"] === "business" && company ? `${company} (${person})` : person
}

function mapCustomer(row: Record<string, unknown>): Customer {
  return {
    id: row["id"] as string,
    customerType: row["customer_type"] as Customer["customerType"],
    salutation: row["salutation"] as Customer["salutation"],
    firstName: row["first_name"] as string,
    lastName: row["last_name"] as string,
    companyName: row["company_name"] as string | null,
    displayName: displayName(row),
    email: row["email"] as string | null,
    phone: row["phone"] as string | null,
    secondaryPhone: row["secondary_phone"] as string | null,
    preferredLanguage: row["preferred_language"] as Customer["preferredLanguage"],
    billingStreet: row["billing_street"] as string | null,
    billingPostalCode: row["billing_postal_code"] as string | null,
    billingCity: row["billing_city"] as string | null,
    billingCountry: row["billing_country"] as string,
    source: row["source"] as string | null,
    referralSource: row["referral_source"] as string | null,
    internalNotes: row["internal_notes"] as string | null,
    totalJobsCount: row["total_jobs_count"] as number,
    totalRevenueCents: row["total_revenue_cents"] as number,
    lastJobAt: row["last_job_at"] as string | null,
    archivedAt: row["deleted_at"] as string | null,
    createdAt: row["created_at"] as string,
    updatedAt: row["updated_at"] as string,
  }
}

/** Input → database row. Business-only fields are cleared for private customers. */
function toRow(input: CreateCustomerInput): Record<string, unknown> {
  return {
    customer_type: input.customerType,
    salutation: input.salutation ?? null,
    first_name: input.firstName.trim(),
    last_name: input.lastName.trim(),
    company_name: input.customerType === "business" ? textOrNull(input.companyName) : null,
    email: textOrNull(input.email)?.toLowerCase() ?? null,
    phone: normalizePhone(input.phone),
    secondary_phone: normalizePhone(input.secondaryPhone),
    preferred_language: input.preferredLanguage,
    billing_street: textOrNull(input.billingStreet),
    billing_postal_code: textOrNull(input.billingPostalCode),
    billing_city: textOrNull(input.billingCity),
    billing_country: input.billingCountry.toUpperCase(),
    source: input.source ?? null,
    referral_source: textOrNull(input.referralSource),
    internal_notes: textOrNull(input.internalNotes),
  }
}

async function loadCustomer(sb: SupabaseClient, id: string): Promise<Record<string, unknown>> {
  const { data, error } = await sb
    .from("customers")
    .select(CUSTOMER_COLUMNS)
    .eq("id", id)
    .maybeSingle()
  if (error)
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to load customer" })
  if (!data) throw new TRPCError({ code: "NOT_FOUND", message: "Customer not found" })
  return data as Record<string, unknown>
}

// ─── Procedures ───────────────────────────────────────────────────────────────

export const customersRouter = createTRPCRouter({
  /** Paginated, searchable customer list of the active company. */
  list: permissionProcedure("customers.view")
    .input(listCustomersInput)
    .query(async ({ ctx, input }): Promise<CustomerListResult> => {
      const offset = (input.page - 1) * input.pageSize

      let query = ctx.supabase.from("customers").select(CUSTOMER_COLUMNS, { count: "exact" })
      query = input.archived ? query.not("deleted_at", "is", null) : query.is("deleted_at", null)

      const s = sanitizeSearch(input.search)
      if (s) {
        const phone = normalizePhone(s)
        const phoneFilter = phone && phone !== s ? `,phone.ilike.%${phone}%` : ""
        query = query.or(
          `first_name.ilike.%${s}%,last_name.ilike.%${s}%,company_name.ilike.%${s}%,email.ilike.%${s}%,phone.ilike.%${s}%${phoneFilter}`,
        )
      }
      if (input.customerType) query = query.eq("customer_type", input.customerType)

      query = query
        .order(input.sortBy, { ascending: input.sortOrder === "asc", nullsFirst: false })
        .order("id", { ascending: true })
        .range(offset, offset + input.pageSize - 1)

      const { data, error, count } = await query
      if (error)
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to fetch customers" })

      const total = count ?? 0
      return {
        items: (data ?? []).map((row) => mapCustomer(row as Record<string, unknown>)),
        total,
        page: input.page,
        pageSize: input.pageSize,
        totalPages: Math.ceil(total / input.pageSize) || 1,
      }
    }),

  /** One customer with the leads that belong to them. Archived customers stay readable. */
  getById: permissionProcedure("customers.view")
    .input(customerIdInput)
    .query(async ({ ctx, input }) => {
      const customer = mapCustomer(await loadCustomer(ctx.supabase, input.id))

      const { data: leads } = await ctx.supabase
        .from("leads")
        .select("id, first_name, last_name, status, move_type, requested_date, created_at")
        .eq("customer_id", input.id)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })

      return {
        customer,
        leads: (leads ?? []).map((l) => ({
          id: l.id as string,
          name: `${l.first_name as string} ${l.last_name as string}`,
          status: l.status as string,
          moveType: l.move_type as string | null,
          requestedDate: l.requested_date as string | null,
          createdAt: l.created_at as string,
        })),
      }
    }),

  /**
   * Existing customers with the same e-mail or phone. Used by the form to warn
   * before a duplicate is created — a duplicate is allowed (shared family
   * e-mail, company switchboard), but never by accident.
   */
  findDuplicates: permissionProcedure("customers.view")
    .input(findDuplicatesInput)
    .query(async ({ ctx, input }): Promise<CustomerDuplicate[]> => {
      const email = textOrNull(input.email)?.toLowerCase() ?? null
      const phone = normalizePhone(input.phone)
      const filters = [
        email && /^[^,()\s]+@[^,()\s]+$/.test(email) ? `email.eq.${email}` : null,
        phone && /^\+\d{8,15}$/.test(phone) ? `phone.eq.${phone}` : null,
      ].filter((f): f is string => f !== null)
      if (filters.length === 0) return []

      let query = ctx.supabase
        .from("customers")
        .select("id, customer_type, first_name, last_name, company_name, email, phone")
        .is("deleted_at", null)
        .or(filters.join(","))
        .limit(5)
      if (input.excludeId) query = query.neq("id", input.excludeId)

      const { data, error } = await query
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" })

      return (data ?? []).map((row) => {
        const r = row as Record<string, unknown>
        const matchedOn: CustomerDuplicate["matchedOn"] = []
        if (email && r["email"] === email) matchedOn.push("email")
        if (phone && r["phone"] === phone) matchedOn.push("phone")
        return {
          id: r["id"] as string,
          displayName: displayName(r),
          email: r["email"] as string | null,
          phone: r["phone"] as string | null,
          matchedOn,
        }
      })
    }),

  create: permissionProcedure("customers.create")
    .input(createCustomerInput)
    .mutation(async ({ ctx, input }): Promise<{ id: string }> => {
      if (!ctx.companyId) throw new TRPCError({ code: "UNAUTHORIZED" })

      const { data, error } = await ctx.supabase
        .from("customers")
        .insert({ ...toRow(input), company_id: ctx.companyId })
        .select("id")
        .single()

      if (error || !data) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to create customer" })
      }

      await writeActivityLog(ctx, {
        action: "customer.created",
        entityType: "customer",
        entityId: data.id as string,
        entityLabel: `${input.firstName} ${input.lastName}`,
      })

      return { id: data.id as string }
    }),

  update: permissionProcedure("customers.edit")
    .input(updateCustomerInput)
    .mutation(async ({ ctx, input }): Promise<{ id: string }> => {
      const { id, ...fields } = input
      const before = await loadCustomer(ctx.supabase, id)
      if (before["deleted_at"]) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Restore the customer before editing" })
      }

      const row = toRow(fields)
      const { error } = await ctx.supabase.from("customers").update(row).eq("id", id)
      if (error)
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to update customer" })

      const changed = Object.keys(row).filter((key) => before[key] !== row[key])
      await writeActivityLog(ctx, {
        action: "customer.updated",
        entityType: "customer",
        entityId: id,
        entityLabel: `${fields.firstName} ${fields.lastName}`,
        beforeState: Object.fromEntries(changed.map((k) => [k, before[k]])),
        afterState: Object.fromEntries(changed.map((k) => [k, row[k]])),
      })

      return { id }
    }),

  /** Soft-delete. Leads, quotes and jobs keep their reference. */
  archive: permissionProcedure("customers.delete")
    .input(customerIdInput)
    .mutation(async ({ ctx, input }): Promise<{ id: string }> => {
      const customer = await loadCustomer(ctx.supabase, input.id)
      if (customer["deleted_at"]) return { id: input.id }

      const { error } = await ctx.supabase
        .from("customers")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", input.id)
      if (error)
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to archive customer",
        })

      await writeActivityLog(ctx, {
        action: "customer.archived",
        entityType: "customer",
        entityId: input.id,
        entityLabel: displayName(customer),
      })
      return { id: input.id }
    }),

  restore: permissionProcedure("customers.delete")
    .input(customerIdInput)
    .mutation(async ({ ctx, input }): Promise<{ id: string }> => {
      const customer = await loadCustomer(ctx.supabase, input.id)
      if (!customer["deleted_at"]) return { id: input.id }

      const { error } = await ctx.supabase
        .from("customers")
        .update({ deleted_at: null })
        .eq("id", input.id)
      if (error)
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to restore customer",
        })

      await writeActivityLog(ctx, {
        action: "customer.restored",
        entityType: "customer",
        entityId: input.id,
        entityLabel: displayName(customer),
      })
      return { id: input.id }
    }),
})
