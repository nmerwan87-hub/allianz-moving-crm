import { z } from "zod"
import { moveTypeEnum } from "@/modules/leads/interface"

export const quoteStatusEnum = z.enum([
  "draft",
  "sent",
  "viewed",
  "accepted",
  "declined",
  "expired",
  "cancelled",
  "superseded",
])
export const quoteLanguageEnum = z.enum(["de", "fr", "it", "en"])
export const linePricingModeEnum = z.enum(["fixed", "hourly", "quantity", "distance", "manual"])
export const lineItemTypeEnum = z.enum([
  "labor",
  "truck",
  "packing",
  "fuel",
  "toll",
  "storage",
  "specialty",
  "surcharge",
  "discount",
  "other",
])

const cents = z.number().int().min(0).max(100_000_000)
const optionalText = (max: number) => z.string().max(max).nullable().or(z.literal("")).optional()
const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")

// ─── Lines ────────────────────────────────────────────────────────────────────

export const quoteLineInput = z
  .object({
    /** Existing line id — lets the server keep cost prices the user cannot see */
    id: z.string().uuid().optional(),
    serviceCatalogId: z.string().uuid().nullable().optional(),
    itemType: lineItemTypeEnum.default("other"),
    name: z.string().trim().min(1, "Service name is required").max(200),
    description: optionalText(1000),
    pricingMode: linePricingModeEnum,
    quantity: z.number().positive("Quantity must be greater than zero").max(100_000),
    unit: optionalText(30),
    unitPriceCents: cents,
    costPriceCents: cents.default(0),
    discountType: z.enum(["percent", "fixed"]).nullable().optional(),
    discountValue: z.number().min(0).nullable().optional(),
    vatRatePercent: z.number().min(0).max(100),
    internalNotes: optionalText(1000),
    customerNotes: optionalText(1000),
  })
  .superRefine((line, ctx) => {
    if (line.discountType === "percent" && (line.discountValue ?? 0) > 100) {
      ctx.addIssue({ code: "custom", path: ["discountValue"], message: "Max. 100 %" })
    }
  })
export type QuoteLineInput = z.infer<typeof quoteLineInput>

export const saveLinesInput = z.object({
  id: z.string().uuid(),
  lines: z.array(quoteLineInput).max(200),
})

// ─── Header ───────────────────────────────────────────────────────────────────

export const createQuoteInput = z.object({
  customerId: z.string().uuid(),
  leadId: z.string().uuid().nullable().optional(),
})

export const updateQuoteInput = z.object({
  id: z.string().uuid(),
  title: optionalText(200),
  language: quoteLanguageEnum,
  moveType: moveTypeEnum,
  scheduledDate: dateString.nullable().optional(),
  dateFlexible: z.boolean(),
  originAddress: optionalText(200),
  originPostalCode: optionalText(20),
  originCity: optionalText(100),
  originFloor: z.number().int().min(-5).max(60).nullable().optional(),
  originHasElevator: z.boolean(),
  destAddress: optionalText(200),
  destPostalCode: optionalText(20),
  destCity: optionalText(100),
  destFloor: z.number().int().min(-5).max(60).nullable().optional(),
  destHasElevator: z.boolean(),
  distanceKm: z.number().min(0).max(100_000).nullable().optional(),
  estimatedHours: z.number().min(0).max(99).nullable().optional(),
  depositPercent: z.number().min(0).max(100),
  costCapCents: z.number().int().positive().max(100_000_000).nullable().optional(),
  validUntil: dateString,
  customerNotes: optionalText(3000),
  internalNotes: optionalText(3000),
})
export type UpdateQuoteInput = z.infer<typeof updateQuoteInput>

export const listQuotesInput = z.object({
  search: z.string().max(200).optional(),
  status: quoteStatusEnum.optional(),
  customerId: z.string().uuid().optional(),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(25),
})

export const quoteIdInput = z.object({ id: z.string().uuid() })

export const sendQuoteInput = z.object({
  id: z.string().uuid(),
  sendEmail: z.boolean(),
  recipientEmail: z.string().trim().email().optional(),
  message: optionalText(2000),
})

export const declineQuoteInput = z.object({
  id: z.string().uuid(),
  reason: z.string().trim().min(1, "Reason is required").max(500),
})

// ─── Types ────────────────────────────────────────────────────────────────────

export interface QuoteLine {
  id: string
  serviceCatalogId: string | null
  itemType: z.infer<typeof lineItemTypeEnum>
  name: string
  description: string | null
  pricingMode: z.infer<typeof linePricingModeEnum>
  quantity: number
  unit: string | null
  unitPriceCents: number
  /** null when the user may not see cost prices */
  costPriceCents: number | null
  discountType: "percent" | "fixed" | null
  discountValue: number | null
  discountAmountCents: number
  netTotalCents: number
  vatRatePercent: number
  vatAmountCents: number
  grossTotalCents: number
  internalNotes: string | null
  customerNotes: string | null
}

export interface QuoteSummary {
  id: string
  quoteNumber: string
  version: number
  status: z.infer<typeof quoteStatusEnum>
  title: string | null
  customerId: string | null
  customerName: string | null
  scheduledDate: string | null
  totalAmountCents: number
  expiresAt: string | null
  sentAt: string | null
  createdAt: string
}

export interface Quote extends QuoteSummary {
  leadId: string | null
  language: z.infer<typeof quoteLanguageEnum>
  moveType: z.infer<typeof moveTypeEnum>
  dateFlexible: boolean
  originAddress: string | null
  originPostalCode: string | null
  originCity: string | null
  originFloor: number | null
  originHasElevator: boolean
  destAddress: string | null
  destPostalCode: string | null
  destCity: string | null
  destFloor: number | null
  destHasElevator: boolean
  distanceKm: number | null
  estimatedHours: number | null
  subtotalCents: number
  discountCents: number
  taxCents: number
  depositPercent: number
  depositAmountCents: number
  costCapCents: number | null
  customerNotes: string | null
  internalNotes: string | null
  acceptedAt: string | null
  declinedAt: string | null
  declinedReason: string | null
  customerEmail: string | null
  /** Sum of cost prices × quantity; null without quotes.view_cost_price */
  totalCostCents: number | null
}
