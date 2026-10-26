import { z } from "zod"

export const pricingModeEnum = z.enum(["fixed", "hourly", "quantity", "distance", "manual"])
export const vehicleTypeEnum = z.enum([
  "cargo_van",
  "box_truck_16ft",
  "box_truck_24ft",
  "box_truck_26ft",
  "semi_truck",
  "pickup_truck",
])

const cents = z.number().int().min(0).max(100_000_000)
const optionalText = (max: number) => z.string().max(max).nullable().or(z.literal("")).optional()

// ─── Services ─────────────────────────────────────────────────────────────────

const serviceFields = {
  name: z.string().trim().min(1, "Name is required").max(120),
  category: z.string().trim().min(1, "Category is required").max(60),
  description: optionalText(1000),
  customerDescription: optionalText(1000),
  defaultPricingMode: pricingModeEnum,
  defaultUnitLabel: optionalText(30),
  defaultUnitPriceCents: cents,
  defaultCostPriceCents: cents,
  defaultVatRatePercent: z.number().min(0).max(100),
}

export const createServiceInput = z.object(serviceFields)
export type CreateServiceInput = z.infer<typeof createServiceInput>

export const updateServiceInput = z.object({ id: z.string().uuid(), ...serviceFields })
export type UpdateServiceInput = z.infer<typeof updateServiceInput>

export const setServiceActiveInput = z.object({ id: z.string().uuid(), isActive: z.boolean() })

/** New order of all services in one category, first to last. */
export const reorderServicesInput = z.object({
  category: z.string().min(1).max(60),
  orderedIds: z.array(z.string().uuid()).min(1).max(200),
})

export const idInput = z.object({ id: z.string().uuid() })

export interface Service {
  id: string
  name: string
  category: string
  description: string | null
  customerDescription: string | null
  defaultPricingMode: z.infer<typeof pricingModeEnum>
  defaultUnitLabel: string | null
  defaultUnitPriceCents: number
  defaultCostPriceCents: number
  defaultVatRatePercent: number
  isActive: boolean
  isSystemDefault: boolean
  sortOrder: number
}

// ─── Rate cards ───────────────────────────────────────────────────────────────

const rateCardFields = {
  name: z.string().trim().min(1, "Name is required").max(120),
  crewSize: z.number().int().min(1).max(20),
  vehicleType: vehicleTypeEnum.nullable(),
  hourlyRateCents: cents,
  hourlyCostCents: cents,
  isActive: z.boolean().default(true),
}

export const createRateCardInput = z.object(rateCardFields)
export const updateRateCardInput = z.object({ id: z.string().uuid(), ...rateCardFields })
export type CreateRateCardInput = z.infer<typeof createRateCardInput>

export interface RateCard {
  id: string
  name: string
  crewSize: number
  vehicleType: z.infer<typeof vehicleTypeEnum> | null
  hourlyRateCents: number
  hourlyCostCents: number
  isActive: boolean
  sortOrder: number
}

// ─── Pricing settings ─────────────────────────────────────────────────────────

export const pricingSettingsInput = z.object({
  minimumHours: z.number().min(0).max(24),
  minimumChargeCents: cents,
  travelFlatFeeCents: cents,
  ratePerKmCents: cents,
  stairCarryRateCents: cents,
  longCarryRateCents: cents,
  elevatorWaitRateCents: cents,
  weekendSurchargePercent: z.number().min(0).max(100),
  fuelSurchargePercent: z.number().min(0).max(100),
  defaultDepositPercent: z.number().min(0).max(100),
  defaultQuoteExpiryDays: z.number().int().min(1).max(365),
  defaultPaymentTermsDays: z.number().int().min(0).max(365),
  taxEnabled: z.boolean(),
  taxRatePercent: z.number().min(0).max(100),
  taxLabel: z.string().trim().min(1).max(20),
})
export type PricingSettings = z.infer<typeof pricingSettingsInput>
