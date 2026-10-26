import { z } from "zod"
import {
  lineItemTypeEnum,
  linePricingModeEnum,
  quoteLanguageEnum,
} from "@/modules/quotes/interface"

export const invoiceStatusEnum = z.enum([
  "draft",
  "sent",
  "viewed",
  "partially_paid",
  "paid",
  "overdue",
  "void",
  "write_off",
])
export const paymentMethodEnum = z.enum(["bank_transfer", "cash", "card", "other"])

const cents = z.number().int().min(0).max(100_000_000)
const optionalText = (max: number) => z.string().max(max).nullable().or(z.literal("")).optional()
const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")

// ─── Lines ────────────────────────────────────────────────────────────────────

export const invoiceLineInput = z
  .object({
    quoteItemId: z.string().uuid().nullable().optional(),
    serviceCatalogId: z.string().uuid().nullable().optional(),
    itemType: lineItemTypeEnum.default("other"),
    name: z.string().trim().min(1, "Service name is required").max(200),
    description: optionalText(1000),
    pricingMode: linePricingModeEnum,
    quantity: z.number().positive("Quantity must be greater than zero").max(100_000),
    quotedQuantity: z.number().min(0).max(100_000).nullable().optional(),
    unit: optionalText(30),
    unitPriceCents: cents,
    discountType: z.enum(["percent", "fixed"]).nullable().optional(),
    discountValue: z.number().min(0).nullable().optional(),
    vatRatePercent: z.number().min(0).max(100),
    customerNotes: optionalText(1000),
  })
  .superRefine((line, ctx) => {
    if (line.discountType === "percent" && (line.discountValue ?? 0) > 100) {
      ctx.addIssue({ code: "custom", path: ["discountValue"], message: "Max. 100 %" })
    }
  })
export type InvoiceLineInput = z.infer<typeof invoiceLineInput>

export const saveInvoiceLinesInput = z.object({
  id: z.string().uuid(),
  lines: z.array(invoiceLineInput).max(200),
})

// ─── Header and actions ───────────────────────────────────────────────────────

export const invoiceIdInput = z.object({ id: z.string().uuid() })
export const jobIdInput = z.object({ jobId: z.string().uuid() })

export const updateInvoiceInput = z.object({
  id: z.string().uuid(),
  title: optionalText(200),
  language: quoteLanguageEnum,
  serviceDate: dateString.nullable().optional(),
  paymentTermsDays: z.number().int().min(0).max(365),
  costCapOverrideReason: optionalText(500),
  notes: optionalText(3000),
  internalNotes: optionalText(3000),
})
export type UpdateInvoiceInput = z.infer<typeof updateInvoiceInput>

export const listInvoicesInput = z.object({
  search: z.string().max(200).optional(),
  /** "open" = issued and not fully paid */
  status: z.union([invoiceStatusEnum, z.literal("open")]).optional(),
  customerId: z.string().uuid().optional(),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(25),
})

export const issueInvoiceInput = z.object({
  id: z.string().uuid(),
  sendEmail: z.boolean(),
  recipientEmail: z.string().trim().email().optional(),
  message: optionalText(2000),
})

export const reasonInput = z.object({
  id: z.string().uuid(),
  reason: z.string().trim().min(1, "Reason is required").max(500),
})

const paymentFields = {
  amountCents: z.number().int().positive("Amount must be greater than zero").max(100_000_000),
  method: paymentMethodEnum,
  paidOn: dateString,
  reference: optionalText(100),
  notes: optionalText(1000),
}

export const recordPaymentInput = z.object({ invoiceId: z.string().uuid(), ...paymentFields })
export const recordDepositInput = z.object({ jobId: z.string().uuid(), ...paymentFields })

// ─── Types ────────────────────────────────────────────────────────────────────

export type InvoiceStatus = z.infer<typeof invoiceStatusEnum>
export type PaymentMethod = z.infer<typeof paymentMethodEnum>

export interface InvoiceSummary {
  id: string
  invoiceNumber: string | null
  status: InvoiceStatus
  title: string | null
  customerId: string
  customerName: string
  jobId: string
  jobNumber: string | null
  totalAmountCents: number
  balanceDueCents: number
  issuedAt: string | null
  dueAt: string | null
  reminderLevel: number
  createdAt: string
}

export interface Invoice extends InvoiceSummary {
  quoteId: string | null
  language: z.infer<typeof quoteLanguageEnum>
  serviceDate: string | null
  paymentTermsDays: number
  subtotalCents: number
  discountCents: number
  taxCents: number
  depositAppliedCents: number
  amountPaidCents: number
  costCapCents: number | null
  costCapOverrideReason: string | null
  paymentReference: string | null
  notes: string | null
  internalNotes: string | null
  customerEmail: string | null
  paidAt: string | null
  lastReminderAt: string | null
  voidedAt: string | null
  voidReason: string | null
  writeOffReason: string | null
}

export interface InvoiceLine {
  id: string
  quoteItemId: string | null
  serviceCatalogId: string | null
  itemType: z.infer<typeof lineItemTypeEnum>
  name: string
  description: string | null
  pricingMode: z.infer<typeof linePricingModeEnum>
  quantity: number
  quotedQuantity: number | null
  unit: string | null
  unitPriceCents: number
  discountType: "percent" | "fixed" | null
  discountValue: number | null
  discountAmountCents: number
  netTotalCents: number
  vatRatePercent: number
  vatAmountCents: number
  grossTotalCents: number
  customerNotes: string | null
}

export interface Payment {
  id: string
  invoiceId: string | null
  paymentType: "deposit" | "balance" | "partial" | "refund" | "adjustment"
  method: PaymentMethod | "ach" | "check"
  status: "pending" | "completed" | "failed" | "refunded" | "cancelled"
  amountCents: number
  reference: string | null
  notes: string | null
  paidAt: string | null
  cancellationReason: string | null
  createdAt: string
}
