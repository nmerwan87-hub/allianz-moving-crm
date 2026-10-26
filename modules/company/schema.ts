import { z } from "zod"

const optionalText = (max: number) => z.string().max(max).nullable().or(z.literal("")).optional()

export const companyProfileInput = z.object({
  name: z.string().trim().min(1, "Display name is required").max(120),
  legalName: z.string().trim().min(1, "Legal name is required").max(200),
  vatNumber: optionalText(40),
  registrationNumber: optionalText(60),
  addressLine1: optionalText(200),
  addressLine2: optionalText(200),
  postalCode: optionalText(20),
  city: optionalText(100),
  country: z.string().length(2),
  email: z.string().trim().email("Invalid email").max(255).nullable().or(z.literal("")).optional(),
  phone: optionalText(50),
  website: optionalText(200),
  accentColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Use a colour like #1E40AF")
    .nullable()
    .optional(),
})
export type CompanyProfileInput = z.infer<typeof companyProfileInput>

export const companyBankInput = z.object({
  bankName: optionalText(120),
  bankIban: optionalText(40),
  bankBic: optionalText(20),
  bankPayeeName: optionalText(200),
})
export type CompanyBankInput = z.infer<typeof companyBankInput>

/** Data URL of a PNG, JPEG or WebP image (≤ 1 MB decoded). */
export const uploadLogoInput = z.object({
  dataUrl: z.string().max(1_500_000, "Logo must be 1 MB or smaller"),
})

export interface CompanyProfile {
  id: string
  name: string
  legalName: string | null
  vatNumber: string | null
  registrationNumber: string | null
  addressLine1: string | null
  addressLine2: string | null
  postalCode: string | null
  city: string | null
  country: string
  email: string | null
  phone: string | null
  website: string | null
  accentColor: string | null
  logoUrl: string | null
  currency: string
  bankName: string | null
  bankIban: string | null
  bankBic: string | null
  bankPayeeName: string | null
  isQrIban: boolean
}
