import { z } from "zod"
import { acquisitionSourceEnum } from "@/modules/leads/interface"

// ─── Enums matching the database ──────────────────────────────────────────────

export const customerTypeEnum = z.enum(["private", "business"])
export const salutationEnum = z.enum(["mr", "ms"])
export const customerLanguageEnum = z.enum(["de", "fr", "it", "en"])

const optionalText = (max: number) => z.string().max(max).nullable().or(z.literal("")).optional()

// ─── Create / update input ────────────────────────────────────────────────────

const customerFields = {
  customerType: customerTypeEnum.default("private"),
  salutation: salutationEnum.nullable().optional(),
  firstName: z.string().trim().min(1, "First name is required").max(100),
  lastName: z.string().trim().min(1, "Last name is required").max(100),
  companyName: optionalText(200),
  email: z.string().trim().email("Invalid email").max(255).nullable().or(z.literal("")).optional(),
  phone: optionalText(50),
  secondaryPhone: optionalText(50),
  preferredLanguage: customerLanguageEnum.default("de"),
  billingStreet: optionalText(200),
  billingPostalCode: optionalText(20),
  billingCity: optionalText(100),
  billingCountry: z.string().length(2).default("CH"),
  source: acquisitionSourceEnum.nullable().optional(),
  referralSource: optionalText(200),
  internalNotes: optionalText(5000),
}

function requireCompanyForBusiness(
  value: { customerType?: string | undefined; companyName?: string | null | undefined },
  ctx: z.RefinementCtx,
) {
  if (value.customerType === "business" && !value.companyName?.trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["companyName"],
      message: "Company name is required for business customers",
    })
  }
}

export const createCustomerInput = z.object(customerFields).superRefine(requireCompanyForBusiness)
export type CreateCustomerInput = z.infer<typeof createCustomerInput>

export const updateCustomerInput = z
  .object({ id: z.string().uuid(), ...customerFields })
  .superRefine(requireCompanyForBusiness)
export type UpdateCustomerInput = z.infer<typeof updateCustomerInput>

// ─── List / lookup input ──────────────────────────────────────────────────────

export const listCustomersInput = z.object({
  search: z.string().max(200).optional(),
  customerType: customerTypeEnum.optional(),
  archived: z.boolean().default(false),
  sortBy: z.enum(["created_at", "last_name", "last_job_at"]).default("created_at"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(25),
})
export type ListCustomersInput = z.infer<typeof listCustomersInput>

export const findDuplicatesInput = z.object({
  email: z.string().max(255).nullable().optional(),
  phone: z.string().max(50).nullable().optional(),
  excludeId: z.string().uuid().optional(),
})

export const customerIdInput = z.object({ id: z.string().uuid() })

// ─── Shared types ─────────────────────────────────────────────────────────────

export interface Customer {
  id: string
  customerType: "private" | "business"
  salutation: "mr" | "ms" | null
  firstName: string
  lastName: string
  companyName: string | null
  displayName: string
  email: string | null
  phone: string | null
  secondaryPhone: string | null
  preferredLanguage: "de" | "fr" | "it" | "en"
  billingStreet: string | null
  billingPostalCode: string | null
  billingCity: string | null
  billingCountry: string
  source: string | null
  referralSource: string | null
  internalNotes: string | null
  totalJobsCount: number
  totalRevenueCents: number
  lastJobAt: string | null
  archivedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface CustomerListResult {
  items: Customer[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export interface CustomerDuplicate {
  id: string
  displayName: string
  email: string | null
  phone: string | null
  matchedOn: Array<"email" | "phone">
}
