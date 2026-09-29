import { z } from "zod"

// ─── Enums matching the database ──────────────────────────────────────────────

export const leadStatusEnum = z.enum([
  "new",
  "contacted",
  "surveyed",
  "quoted",
  "booked",
  "lost",
  "duplicate",
])

export const acquisitionSourceEnum = z.enum([
  "web_form",
  "phone_call",
  "referral",
  "marketplace",
  "repeat_customer",
  "social_media",
  "google_ads",
  "organic_search",
  "manual",
  "other",
])

export const moveTypeEnum = z.enum([
  "local",
  "long_distance",
  "commercial",
  "international",
  "junk_removal",
])

export const propertySizeEnum = z.enum([
  "studio",
  "one_bedroom",
  "two_bedroom",
  "three_bedroom",
  "four_bedroom",
  "five_plus_bedroom",
  "commercial_small",
  "commercial_medium",
  "commercial_large",
])

// ─── Create input ─────────────────────────────────────────────────────────────

export const createLeadInput = z.object({
  firstName: z.string().min(1, "First name is required").max(100),
  lastName: z.string().min(1, "Last name is required").max(100),
  email: z.string().email("Invalid email").max(255).nullable().or(z.literal("")).optional(),
  phone: z.string().max(50).nullable().or(z.literal("")).optional(),

  moveType: moveTypeEnum.nullable().optional(),
  requestedDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
    .nullable()
    .or(z.literal(""))
    .optional(),
  dateFlexible: z.boolean().default(false),
  propertySize: propertySizeEnum.nullable().optional(),

  originAddress: z.string().max(500).nullable().or(z.literal("")).optional(),
  originCity: z.string().max(200).nullable().or(z.literal("")).optional(),
  originState: z.string().max(100).nullable().or(z.literal("")).optional(),
  originPostalCode: z.string().max(20).nullable().or(z.literal("")).optional(),
  originCountry: z.string().max(2).nullable().or(z.literal("")).optional().default("US"),
  originFloor: z.number().int().min(0).max(200).nullable().optional(),
  originHasElevator: z.boolean().default(false),
  originHasStairs: z.boolean().default(false),
  originParkingNotes: z.string().max(500).nullable().or(z.literal("")).optional(),

  destAddress: z.string().max(500).nullable().or(z.literal("")).optional(),
  destCity: z.string().max(200).nullable().or(z.literal("")).optional(),
  destState: z.string().max(100).nullable().or(z.literal("")).optional(),
  destPostalCode: z.string().max(20).nullable().or(z.literal("")).optional(),
  destCountry: z.string().max(2).nullable().or(z.literal("")).optional().default("US"),
  destFloor: z.number().int().min(0).max(200).nullable().optional(),
  destHasElevator: z.boolean().default(false),
  destHasStairs: z.boolean().default(false),
  destParkingNotes: z.string().max(500).nullable().or(z.literal("")).optional(),

  estimatedVolumeCuft: z.number().positive().nullable().optional(),
  estimatedDistanceMiles: z.number().positive().nullable().optional(),

  source: acquisitionSourceEnum.nullable().optional(),
  utmSource: z.string().max(200).nullable().or(z.literal("")).optional(),
  utmMedium: z.string().max(200).nullable().or(z.literal("")).optional(),
  utmCampaign: z.string().max(200).nullable().or(z.literal("")).optional(),
  referrerUrl: z.string().max(2000).nullable().or(z.literal("")).optional(),

  internalNotes: z.string().max(5000).nullable().or(z.literal("")).optional(),
})

export type CreateLeadInput = z.infer<typeof createLeadInput>

// ─── Update input (all fields optional, company_id excluded) ──────────────────

export const updateLeadInput = z.object({
  id: z.string().uuid(),
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
  email: z.string().email().max(255).nullable().or(z.literal("")).optional(),
  phone: z.string().max(50).nullable().or(z.literal("")).optional(),

  moveType: moveTypeEnum.nullable().optional(),
  requestedDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .or(z.literal(""))
    .optional(),
  dateFlexible: z.boolean().optional(),
  propertySize: propertySizeEnum.nullable().optional(),

  originAddress: z.string().max(500).nullable().or(z.literal("")).optional(),
  originCity: z.string().max(200).nullable().or(z.literal("")).optional(),
  originState: z.string().max(100).nullable().or(z.literal("")).optional(),
  originPostalCode: z.string().max(20).nullable().or(z.literal("")).optional(),
  originCountry: z.string().max(2).nullable().or(z.literal("")).optional(),
  originFloor: z.number().int().min(0).max(200).nullable().optional(),
  originHasElevator: z.boolean().optional(),
  originHasStairs: z.boolean().optional(),
  originParkingNotes: z.string().max(500).nullable().or(z.literal("")).optional(),

  destAddress: z.string().max(500).nullable().or(z.literal("")).optional(),
  destCity: z.string().max(200).nullable().or(z.literal("")).optional(),
  destState: z.string().max(100).nullable().or(z.literal("")).optional(),
  destPostalCode: z.string().max(20).nullable().or(z.literal("")).optional(),
  destCountry: z.string().max(2).nullable().or(z.literal("")).optional(),
  destFloor: z.number().int().min(0).max(200).nullable().optional(),
  destHasElevator: z.boolean().optional(),
  destHasStairs: z.boolean().optional(),
  destParkingNotes: z.string().max(500).nullable().or(z.literal("")).optional(),

  estimatedVolumeCuft: z.number().positive().nullable().optional(),
  estimatedDistanceMiles: z.number().positive().nullable().optional(),

  source: acquisitionSourceEnum.nullable().optional(),
  utmSource: z.string().max(200).nullable().or(z.literal("")).optional(),
  utmMedium: z.string().max(200).nullable().or(z.literal("")).optional(),
  utmCampaign: z.string().max(200).nullable().or(z.literal("")).optional(),
  referrerUrl: z.string().max(2000).nullable().or(z.literal("")).optional(),

  internalNotes: z.string().max(5000).nullable().or(z.literal("")).optional(),

  assignedTo: z.string().uuid().nullable().optional(),
})

export type UpdateLeadInput = z.infer<typeof updateLeadInput>

// ─── Status change input ──────────────────────────────────────────────────────

export const updateLeadStatusInput = z.object({
  id: z.string().uuid(),
  status: leadStatusEnum,
  lostReason: z.string().max(500).nullable().or(z.literal("")).optional(),
})

export type UpdateLeadStatusInput = z.infer<typeof updateLeadStatusInput>

// ─── List input ───────────────────────────────────────────────────────────────

export const listLeadsInput = z.object({
  search: z.string().max(200).optional(),
  status: leadStatusEnum.optional(),
  source: acquisitionSourceEnum.optional(),
  sortBy: z.enum(["created_at", "requested_date", "first_name", "status"]).default("created_at"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(25),
})

export type ListLeadsInput = z.infer<typeof listLeadsInput>

// ─── Delete input (soft-delete) ───────────────────────────────────────────────

export const deleteLeadInput = z.object({
  id: z.string().uuid(),
})

export type DeleteLeadInput = z.infer<typeof deleteLeadInput>

// ─── Lead type (shared) ───────────────────────────────────────────────────────

export interface Lead {
  id: string
  companyId: string
  customerId: string | null
  assignedTo: string | null
  firstName: string
  lastName: string
  email: string | null
  phone: string | null
  moveType: string | null
  requestedDate: string | null
  dateFlexible: boolean
  propertySize: string | null
  originAddress: string | null
  originCity: string | null
  originState: string | null
  originPostalCode: string | null
  originCountry: string | null
  originFloor: number | null
  originHasElevator: boolean
  originHasStairs: boolean
  originParkingNotes: string | null
  destAddress: string | null
  destCity: string | null
  destState: string | null
  destPostalCode: string | null
  destCountry: string | null
  destFloor: number | null
  destHasElevator: boolean
  destHasStairs: boolean
  destParkingNotes: string | null
  estimatedVolumeCuft: number | null
  estimatedDistanceMiles: number | null
  status: string
  lostReason: string | null
  convertedAt: string | null
  source: string | null
  utmSource: string | null
  utmMedium: string | null
  utmCampaign: string | null
  referrerUrl: string | null
  internalNotes: string | null
  createdAt: string
  updatedAt: string
  assignedToName: string | null
}

export interface LeadListResult {
  items: Lead[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}
