import { TRPCError } from "@trpc/server"
import { createTRPCRouter, permissionProcedure, protectedProcedure } from "@/lib/trpc/init"
import { createServiceRoleClient } from "@/lib/supabase/service-role"
import { writeActivityLog } from "@/lib/audit/activity"
import { normalizePhone } from "@/lib/format/phone"
import { isQrIban, isValidIban, normalizeIban } from "@/lib/format/iban"
import { validateVat } from "@/modules/iam/lib/vat"
import {
  companyProfileInput,
  companyBankInput,
  uploadLogoInput,
  type CompanyProfile,
} from "./schema"

const LOGO_BUCKET = "company-logos"
const MAX_LOGO_BYTES = 1024 * 1024

const COLUMNS =
  "id, name, legal_name, vat_number, registration_number, address_line1, address_line2, postal_code, city, country, email, phone, website, accent_color, logo_url, currency, bank_name, bank_iban, bank_bic, bank_payee_name"

function textOrNull(v: string | null | undefined): string | null {
  const trimmed = v?.trim()
  return trimmed ? trimmed : null
}

function requireCompany(companyId: string | undefined): string {
  if (!companyId) throw new TRPCError({ code: "UNAUTHORIZED" })
  return companyId
}

function mapProfile(r: Record<string, unknown>): CompanyProfile {
  const iban = r["bank_iban"] as string | null
  return {
    id: r["id"] as string,
    name: r["name"] as string,
    legalName: r["legal_name"] as string | null,
    vatNumber: r["vat_number"] as string | null,
    registrationNumber: r["registration_number"] as string | null,
    addressLine1: r["address_line1"] as string | null,
    addressLine2: r["address_line2"] as string | null,
    postalCode: r["postal_code"] as string | null,
    city: r["city"] as string | null,
    country: r["country"] as string,
    email: r["email"] as string | null,
    phone: r["phone"] as string | null,
    website: r["website"] as string | null,
    accentColor: r["accent_color"] as string | null,
    logoUrl: r["logo_url"] as string | null,
    currency: r["currency"] as string,
    bankName: r["bank_name"] as string | null,
    bankIban: iban,
    bankBic: r["bank_bic"] as string | null,
    bankPayeeName: r["bank_payee_name"] as string | null,
    isQrIban: isQrIban(iban),
  }
}

/** Detects the image type from its first bytes — the declared MIME type is not trusted. */
function detectImage(bytes: Buffer): { mime: string; ext: string } | null {
  if (
    bytes.length >= 8 &&
    bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  )
    return { mime: "image/png", ext: "png" }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)
    return { mime: "image/jpeg", ext: "jpg" }
  if (
    bytes.length >= 12 &&
    bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
    bytes.subarray(8, 12).toString("ascii") === "WEBP"
  )
    return { mime: "image/webp", ext: "webp" }
  return null
}

/** Storage path of a logo URL in our bucket, or null for foreign URLs. */
function logoPath(url: string | null): string | null {
  if (!url) return null
  const marker = `/storage/v1/object/public/${LOGO_BUCKET}/`
  const index = url.indexOf(marker)
  return index === -1 ? null : decodeURIComponent(url.slice(index + marker.length))
}

// Writes use the service role after the permission check: the companies RLS
// update policy allows owners only, while office users with settings.company
// (or settings.banking) may edit too.

export const companyRouter = createTRPCRouter({
  profile: protectedProcedure.query(async ({ ctx }): Promise<CompanyProfile> => {
    const companyId = requireCompany(ctx.companyId)
    const { data, error } = await ctx.supabase
      .from("companies")
      .select(COLUMNS)
      .eq("id", companyId)
      .maybeSingle()
    if (error || !data) throw new TRPCError({ code: "NOT_FOUND", message: "Company not found." })
    return mapProfile(data as unknown as Record<string, unknown>)
  }),

  updateProfile: permissionProcedure("settings.company")
    .input(companyProfileInput)
    .mutation(async ({ ctx, input }) => {
      const companyId = requireCompany(ctx.companyId)
      const country = input.country.toUpperCase()

      const vat = textOrNull(input.vatNumber)
      if (vat) {
        const vatError = validateVat(country, vat)
        if (vatError) throw new TRPCError({ code: "BAD_REQUEST", message: vatError })
      }

      const row = {
        name: input.name,
        legal_name: input.legalName,
        vat_number: vat,
        registration_number: textOrNull(input.registrationNumber),
        address_line1: textOrNull(input.addressLine1),
        address_line2: textOrNull(input.addressLine2),
        postal_code: textOrNull(input.postalCode),
        city: textOrNull(input.city),
        country,
        email: textOrNull(input.email)?.toLowerCase() ?? null,
        phone: normalizePhone(input.phone),
        website: textOrNull(input.website),
        accent_color: input.accentColor ?? null,
      }

      const { error } = await createServiceRoleClient()
        .from("companies")
        .update(row)
        .eq("id", companyId)
      if (error)
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to save profile." })

      await writeActivityLog(ctx, {
        action: "company.profile_updated",
        entityType: "company",
        entityId: companyId,
        entityLabel: input.name,
        afterState: row,
      })
      return { ok: true }
    }),

  /** Bank details for QR-bills. Separate permission: changing them redirects payments. */
  updateBank: permissionProcedure("settings.banking")
    .input(companyBankInput)
    .mutation(async ({ ctx, input }) => {
      const companyId = requireCompany(ctx.companyId)
      const iban = normalizeIban(input.bankIban)
      if (iban && !isValidIban(iban)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This IBAN is not valid. Please check it.",
        })
      }

      const svc = createServiceRoleClient()
      const { data: before } = await svc
        .from("companies")
        .select("bank_iban")
        .eq("id", companyId)
        .single()

      const row = {
        bank_name: textOrNull(input.bankName),
        bank_iban: iban,
        bank_bic: textOrNull(input.bankBic)?.toUpperCase() ?? null,
        bank_payee_name: textOrNull(input.bankPayeeName),
      }
      const { error } = await svc.from("companies").update(row).eq("id", companyId)
      if (error)
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to save bank details.",
        })

      await writeActivityLog(ctx, {
        action: "company.bank_updated",
        entityType: "company",
        entityId: companyId,
        beforeState: { bank_iban: before?.bank_iban ?? null },
        afterState: { bank_iban: iban },
      })
      return { ok: true, isQrIban: isQrIban(iban) }
    }),

  uploadLogo: permissionProcedure("settings.company")
    .input(uploadLogoInput)
    .mutation(async ({ ctx, input }) => {
      const companyId = requireCompany(ctx.companyId)
      const match = /^data:[^;,]+;base64,([A-Za-z0-9+/=]+)$/.exec(input.dataUrl)
      if (!match) throw new TRPCError({ code: "BAD_REQUEST", message: "Unsupported file." })

      const bytes = Buffer.from(match[1]!, "base64")
      if (bytes.length > MAX_LOGO_BYTES) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Logo must be 1 MB or smaller." })
      }
      const image = detectImage(bytes)
      if (!image) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Use a PNG, JPEG or WebP image." })
      }

      const svc = createServiceRoleClient()
      const { data: current } = await svc
        .from("companies")
        .select("logo_url")
        .eq("id", companyId)
        .single()

      const path = `${companyId}/logo-${Date.now()}.${image.ext}`
      const { error: uploadError } = await svc.storage
        .from(LOGO_BUCKET)
        .upload(path, bytes, { contentType: image.mime, upsert: false })
      if (uploadError)
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Upload failed." })

      const logoUrl = svc.storage.from(LOGO_BUCKET).getPublicUrl(path).data.publicUrl
      const { error } = await svc
        .from("companies")
        .update({ logo_url: logoUrl })
        .eq("id", companyId)
      if (error) {
        await svc.storage.from(LOGO_BUCKET).remove([path])
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to save logo." })
      }

      const previous = logoPath(current?.logo_url as string | null)
      if (previous?.startsWith(`${companyId}/`))
        await svc.storage.from(LOGO_BUCKET).remove([previous])

      await writeActivityLog(ctx, {
        action: "company.logo_updated",
        entityType: "company",
        entityId: companyId,
      })
      return { logoUrl }
    }),

  removeLogo: permissionProcedure("settings.company").mutation(async ({ ctx }) => {
    const companyId = requireCompany(ctx.companyId)
    const svc = createServiceRoleClient()
    const { data: current } = await svc
      .from("companies")
      .select("logo_url")
      .eq("id", companyId)
      .single()

    const { error } = await svc.from("companies").update({ logo_url: null }).eq("id", companyId)
    if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" })

    const previous = logoPath(current?.logo_url as string | null)
    if (previous?.startsWith(`${companyId}/`))
      await svc.storage.from(LOGO_BUCKET).remove([previous])

    await writeActivityLog(ctx, {
      action: "company.logo_removed",
      entityType: "company",
      entityId: companyId,
    })
    return { ok: true }
  }),
})
