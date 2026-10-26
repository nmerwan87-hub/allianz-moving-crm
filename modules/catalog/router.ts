import { TRPCError } from "@trpc/server"
import { createTRPCRouter, permissionProcedure, protectedProcedure } from "@/lib/trpc/init"
import { createServiceRoleClient } from "@/lib/supabase/service-role"
import { writeActivityLog } from "@/lib/audit/activity"
import {
  createServiceInput,
  updateServiceInput,
  setServiceActiveInput,
  reorderServicesInput,
  idInput,
  createRateCardInput,
  updateRateCardInput,
  pricingSettingsInput,
  type CreateServiceInput,
  type CreateRateCardInput,
  type Service,
  type RateCard,
  type PricingSettings,
} from "./schema"

// Reads go through the user's client (RLS: own company). Writes go through the
// service role after the permission check, always filtered by company_id —
// the RLS write policies on these tables allow owners only, while office users
// with settings.services may manage the catalog too.

const SERVICE_COLUMNS =
  "id, name, category, description, customer_description, default_pricing_mode, default_unit_label, default_unit_price_cents, default_cost_price_cents, default_vat_rate_percent, is_active, is_system_default, sort_order"

const RATE_CARD_COLUMNS =
  "id, name, crew_size, vehicle_type, hourly_rate_cents, hourly_cost_cents, is_active, sort_order"

function textOrNull(v: string | null | undefined): string | null {
  const trimmed = v?.trim()
  return trimmed ? trimmed : null
}

function mapService(r: Record<string, unknown>): Service {
  return {
    id: r["id"] as string,
    name: r["name"] as string,
    category: (r["category"] as string | null) ?? "Other",
    description: r["description"] as string | null,
    customerDescription: r["customer_description"] as string | null,
    defaultPricingMode: r["default_pricing_mode"] as Service["defaultPricingMode"],
    defaultUnitLabel: r["default_unit_label"] as string | null,
    defaultUnitPriceCents: (r["default_unit_price_cents"] as number | null) ?? 0,
    defaultCostPriceCents: (r["default_cost_price_cents"] as number | null) ?? 0,
    defaultVatRatePercent: Number(r["default_vat_rate_percent"] ?? 0),
    isActive: r["is_active"] as boolean,
    isSystemDefault: r["is_system_default"] as boolean,
    sortOrder: r["sort_order"] as number,
  }
}

function serviceRow(input: CreateServiceInput): Record<string, unknown> {
  return {
    name: input.name,
    category: input.category,
    description: textOrNull(input.description),
    customer_description: textOrNull(input.customerDescription),
    default_pricing_mode: input.defaultPricingMode,
    default_unit_label: textOrNull(input.defaultUnitLabel),
    default_unit_price_cents: input.defaultUnitPriceCents,
    default_cost_price_cents: input.defaultCostPriceCents,
    default_vat_rate_percent: input.defaultVatRatePercent,
  }
}

function mapRateCard(r: Record<string, unknown>): RateCard {
  return {
    id: r["id"] as string,
    name: r["name"] as string,
    crewSize: r["crew_size"] as number,
    vehicleType: r["vehicle_type"] as RateCard["vehicleType"],
    hourlyRateCents: r["hourly_rate_cents"] as number,
    hourlyCostCents: r["hourly_cost_cents"] as number,
    isActive: r["is_active"] as boolean,
    sortOrder: r["sort_order"] as number,
  }
}

function rateCardRow(input: CreateRateCardInput): Record<string, unknown> {
  return {
    name: input.name,
    crew_size: input.crewSize,
    vehicle_type: input.vehicleType,
    hourly_rate_cents: input.hourlyRateCents,
    hourly_cost_cents: input.hourlyCostCents,
    is_active: input.isActive,
  }
}

function requireCompany(companyId: string | undefined): string {
  if (!companyId) throw new TRPCError({ code: "UNAUTHORIZED" })
  return companyId
}

/** Postgres unique violation on (company_id, lower(name)) → readable message. */
function duplicateNameError(error: { code?: string } | null): TRPCError | null {
  return error?.code === "23505"
    ? new TRPCError({ code: "CONFLICT", message: "A service with this name already exists." })
    : null
}

async function loadOwnService(companyId: string, id: string): Promise<Service> {
  const svc = createServiceRoleClient()
  const { data } = await svc
    .from("service_catalog")
    .select(SERVICE_COLUMNS)
    .eq("id", id)
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .maybeSingle()
  if (!data) throw new TRPCError({ code: "NOT_FOUND", message: "Service not found." })
  return mapService(data as Record<string, unknown>)
}

// ─── Services ─────────────────────────────────────────────────────────────────

const servicesRouter = createTRPCRouter({
  /**
   * The company's catalog. Everyone in the company may read it (the quote
   * builder needs it); inactive services are included only on request.
   */
  list: protectedProcedure.query(async ({ ctx }): Promise<Service[]> => {
    const { data, error } = await ctx.supabase
      .from("service_catalog")
      .select(SERVICE_COLUMNS)
      .is("deleted_at", null)
      .order("category", { ascending: true })
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true })
    if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" })
    return (data ?? []).map((r) => mapService(r as Record<string, unknown>))
  }),

  create: permissionProcedure("settings.services")
    .input(createServiceInput)
    .mutation(async ({ ctx, input }) => {
      const companyId = requireCompany(ctx.companyId)
      const svc = createServiceRoleClient()

      const { data: last } = await svc
        .from("service_catalog")
        .select("sort_order")
        .eq("company_id", companyId)
        .eq("category", input.category)
        .is("deleted_at", null)
        .order("sort_order", { ascending: false })
        .limit(1)
        .maybeSingle()

      const { data, error } = await svc
        .from("service_catalog")
        .insert({
          ...serviceRow(input),
          company_id: companyId,
          is_active: true,
          is_system_default: false,
          sort_order: ((last?.sort_order as number | undefined) ?? 0) + 1,
        })
        .select("id")
        .single()
      const conflict = duplicateNameError(error)
      if (conflict) throw conflict
      if (error || !data) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" })

      await writeActivityLog(ctx, {
        action: "service.created",
        entityType: "service",
        entityId: data.id as string,
        entityLabel: input.name,
      })
      return { id: data.id as string }
    }),

  update: permissionProcedure("settings.services")
    .input(updateServiceInput)
    .mutation(async ({ ctx, input }) => {
      const companyId = requireCompany(ctx.companyId)
      const { id, ...fields } = input
      const before = await loadOwnService(companyId, id)

      const { error } = await createServiceRoleClient()
        .from("service_catalog")
        .update(serviceRow(fields))
        .eq("id", id)
        .eq("company_id", companyId)
      const conflict = duplicateNameError(error)
      if (conflict) throw conflict
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" })

      await writeActivityLog(ctx, {
        action: "service.updated",
        entityType: "service",
        entityId: id,
        entityLabel: fields.name,
        beforeState: { ...before },
        afterState: { ...fields },
      })
      return { id }
    }),

  /** Inactive services are hidden in the quote builder but kept for history. */
  setActive: permissionProcedure("settings.services")
    .input(setServiceActiveInput)
    .mutation(async ({ ctx, input }) => {
      const companyId = requireCompany(ctx.companyId)
      const service = await loadOwnService(companyId, input.id)

      const { error } = await createServiceRoleClient()
        .from("service_catalog")
        .update({ is_active: input.isActive })
        .eq("id", input.id)
        .eq("company_id", companyId)
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" })

      await writeActivityLog(ctx, {
        action: input.isActive ? "service.activated" : "service.deactivated",
        entityType: "service",
        entityId: input.id,
        entityLabel: service.name,
      })
      return { id: input.id }
    }),

  reorder: permissionProcedure("settings.services")
    .input(reorderServicesInput)
    .mutation(async ({ ctx, input }) => {
      const companyId = requireCompany(ctx.companyId)
      const svc = createServiceRoleClient()

      const { data: rows } = await svc
        .from("service_catalog")
        .select("id")
        .eq("company_id", companyId)
        .eq("category", input.category)
        .is("deleted_at", null)
      const existing = new Set((rows ?? []).map((r) => r.id as string))
      if (
        existing.size !== input.orderedIds.length ||
        input.orderedIds.some((id) => !existing.has(id))
      ) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "The order must contain every service of the category exactly once.",
        })
      }

      for (const [index, id] of input.orderedIds.entries()) {
        const { error } = await svc
          .from("service_catalog")
          .update({ sort_order: index + 1 })
          .eq("id", id)
          .eq("company_id", companyId)
        if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" })
      }
      return { ok: true }
    }),

  /**
   * Removes a custom service. Standard services can only be deactivated. A
   * service used on a quote is archived instead of deleted, so historical
   * line items keep their reference (snapshot rule, PRODUCT_REQUIREMENTS §2.2).
   */
  remove: permissionProcedure("settings.services")
    .input(idInput)
    .mutation(async ({ ctx, input }): Promise<{ result: "deleted" | "archived" }> => {
      const companyId = requireCompany(ctx.companyId)
      const service = await loadOwnService(companyId, input.id)
      if (service.isSystemDefault) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Standard services cannot be removed. Deactivate it instead.",
        })
      }

      const svc = createServiceRoleClient()
      const { count } = await svc
        .from("quote_items")
        .select("id", { count: "exact", head: true })
        .eq("service_catalog_id", input.id)

      const used = (count ?? 0) > 0
      const { error } = used
        ? await svc
            .from("service_catalog")
            .update({ deleted_at: new Date().toISOString(), is_active: false })
            .eq("id", input.id)
            .eq("company_id", companyId)
        : await svc.from("service_catalog").delete().eq("id", input.id).eq("company_id", companyId)
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" })

      await writeActivityLog(ctx, {
        action: used ? "service.archived" : "service.deleted",
        entityType: "service",
        entityId: input.id,
        entityLabel: service.name,
      })
      return { result: used ? "archived" : "deleted" }
    }),
})

// ─── Rate cards ───────────────────────────────────────────────────────────────

const rateCardsRouter = createTRPCRouter({
  list: protectedProcedure.query(async ({ ctx }): Promise<RateCard[]> => {
    const { data, error } = await ctx.supabase
      .from("rate_cards")
      .select(RATE_CARD_COLUMNS)
      .is("deleted_at", null)
      .order("sort_order", { ascending: true })
      .order("crew_size", { ascending: true })
    if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" })
    return (data ?? []).map((r) => mapRateCard(r as Record<string, unknown>))
  }),

  create: permissionProcedure("settings.services")
    .input(createRateCardInput)
    .mutation(async ({ ctx, input }) => {
      const companyId = requireCompany(ctx.companyId)
      const svc = createServiceRoleClient()
      const { count } = await svc
        .from("rate_cards")
        .select("id", { count: "exact", head: true })
        .eq("company_id", companyId)
        .is("deleted_at", null)

      const { data, error } = await svc
        .from("rate_cards")
        .insert({ ...rateCardRow(input), company_id: companyId, sort_order: (count ?? 0) + 1 })
        .select("id")
        .single()
      if (error || !data) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" })

      await writeActivityLog(ctx, {
        action: "rate_card.created",
        entityType: "rate_card",
        entityId: data.id as string,
        entityLabel: input.name,
      })
      return { id: data.id as string }
    }),

  update: permissionProcedure("settings.services")
    .input(updateRateCardInput)
    .mutation(async ({ ctx, input }) => {
      const companyId = requireCompany(ctx.companyId)
      const { id, ...fields } = input
      const { data, error } = await createServiceRoleClient()
        .from("rate_cards")
        .update(rateCardRow(fields))
        .eq("id", id)
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .select("id")
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" })
      if (!data?.length) throw new TRPCError({ code: "NOT_FOUND", message: "Rate not found." })

      await writeActivityLog(ctx, {
        action: "rate_card.updated",
        entityType: "rate_card",
        entityId: id,
        entityLabel: fields.name,
        afterState: { ...fields },
      })
      return { id }
    }),

  remove: permissionProcedure("settings.services")
    .input(idInput)
    .mutation(async ({ ctx, input }) => {
      const companyId = requireCompany(ctx.companyId)
      const { data, error } = await createServiceRoleClient()
        .from("rate_cards")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", input.id)
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .select("name")
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" })
      if (!data?.length) throw new TRPCError({ code: "NOT_FOUND", message: "Rate not found." })

      await writeActivityLog(ctx, {
        action: "rate_card.archived",
        entityType: "rate_card",
        entityId: input.id,
        entityLabel: data[0]!.name as string,
      })
      return { id: input.id }
    }),
})

// ─── Pricing settings ─────────────────────────────────────────────────────────

const SETTINGS_MAP: Record<keyof PricingSettings, string> = {
  minimumHours: "minimum_hours",
  minimumChargeCents: "minimum_charge_cents",
  travelFlatFeeCents: "travel_flat_fee_cents",
  ratePerKmCents: "rate_per_km_cents",
  stairCarryRateCents: "stair_carry_rate_cents",
  longCarryRateCents: "long_carry_rate_cents",
  elevatorWaitRateCents: "elevator_wait_rate_cents",
  weekendSurchargePercent: "weekend_surcharge_percent",
  fuelSurchargePercent: "fuel_surcharge_percent",
  defaultDepositPercent: "default_deposit_percent",
  defaultQuoteExpiryDays: "default_quote_expiry_days",
  defaultPaymentTermsDays: "default_payment_terms_days",
  taxEnabled: "tax_enabled",
  taxRatePercent: "tax_rate_percent",
  taxLabel: "tax_label",
}

const pricingSettingsRouter = createTRPCRouter({
  get: protectedProcedure.query(async ({ ctx }): Promise<PricingSettings> => {
    const { data, error } = await ctx.supabase
      .from("company_settings")
      .select(Object.values(SETTINGS_MAP).join(", "))
      .maybeSingle()
    if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" })
    if (!data) throw new TRPCError({ code: "NOT_FOUND", message: "Company settings missing." })

    const row = data as unknown as Record<string, unknown>
    const result = {} as Record<string, unknown>
    for (const [key, column] of Object.entries(SETTINGS_MAP)) {
      const value = row[column]
      result[key] = typeof value === "string" && key !== "taxLabel" ? Number(value) : value
    }
    return pricingSettingsInput.parse(result)
  }),

  update: permissionProcedure("settings.services")
    .input(pricingSettingsInput)
    .mutation(async ({ ctx, input }) => {
      const companyId = requireCompany(ctx.companyId)
      const row = Object.fromEntries(
        Object.entries(SETTINGS_MAP).map(([key, column]) => [
          column,
          input[key as keyof PricingSettings],
        ]),
      )
      const { error } = await createServiceRoleClient()
        .from("company_settings")
        .update(row)
        .eq("company_id", companyId)
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" })

      await writeActivityLog(ctx, {
        action: "pricing_settings.updated",
        entityType: "company_settings",
        entityId: companyId,
        afterState: row,
      })
      return { ok: true }
    }),
})

export const catalogRouter = createTRPCRouter({
  services: servicesRouter,
  rateCards: rateCardsRouter,
  pricingSettings: pricingSettingsRouter,
})
