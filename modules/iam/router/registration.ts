import { z } from "zod"
import { TRPCError } from "@trpc/server"
import { createHash, randomBytes } from "crypto"
import { publicProcedure } from "@/lib/trpc/init"
import { createServiceRoleClient } from "@/lib/supabase/service-role"
import { generateBaseSlug, uniqueSlug } from "../lib/slug"
import { validateVat } from "../lib/vat"
import { sendPlatformEmail } from "@/lib/email/send"
import { createElement } from "react"

const PASSWORD_REGEX = /^(?=.*\d)(?=.*[!@#$%^&*()_+\-=[\]{}|;':",.<>?/]).{12,128}$/

export const registrationInput = z.object({
  companyLegalName: z.string().min(2).max(200),
  country: z.string().length(2),
  ownerFirstName: z.string().min(1).max(100),
  ownerLastName: z.string().min(1).max(100),
  email: z.string().email(),
  password: z.string().min(12).max(128),
  tradingName: z.string().max(200).optional(),
  phone: z.string().max(50).optional(),
  website: z.string().url().optional().or(z.literal("")),
  vatNumber: z.string().max(50).optional(),
  termsAccepted: z.literal(true, {
    errorMap: () => ({ message: "You must accept the Terms of Service" }),
  }),
  privacyAccepted: z.literal(true, {
    errorMap: () => ({ message: "You must accept the Privacy Policy" }),
  }),
  registrationIp: z.string().optional(),
})

export type RegistrationInput = z.infer<typeof registrationInput>

const TERMS_VERSION = "2026-07-20"
const PRIVACY_VERSION = "2026-07-20"

export const register = publicProcedure.input(registrationInput).mutation(async ({ input }) => {
  const svc = createServiceRoleClient()

  // 1. Password policy check
  if (!PASSWORD_REGEX.test(input.password)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message:
        "Password must be at least 12 characters and contain at least one number and one special character.",
    })
  }

  // 2. VAT format check
  if (input.vatNumber) {
    const vatError = validateVat(input.country, input.vatNumber)
    if (vatError) {
      throw new TRPCError({ code: "BAD_REQUEST", message: vatError })
    }
  }

  // 3. Duplicate email check (query profiles — source of truth for app-layer users)
  const { data: existingProfile } = await svc
    .from("profiles")
    .select("company_id")
    .eq("email", input.email)
    .maybeSingle()

  if (existingProfile) {
    if (existingProfile.company_id) {
      const { data: company } = await svc
        .from("companies")
        .select("company_status")
        .eq("id", existingProfile.company_id)
        .maybeSingle()

      const status = company?.company_status as string | undefined
      if (status === "rejected") {
        throw new TRPCError({
          code: "CONFLICT",
          message:
            "This email is associated with a previous application. Please contact support@bivro.io.",
        })
      }
    }

    throw new TRPCError({
      code: "CONFLICT",
      message: "An account already exists for this email. Please sign in.",
    })
  }

  // 4. Generate unique slug
  const baseSlug = generateBaseSlug(input.companyLegalName)
  const slug = await uniqueSlug(baseSlug, async (candidate) => {
    const { data } = await svc.from("companies").select("id").eq("slug", candidate).maybeSingle()
    return data !== null
  })

  // 5. Create auth user (does NOT send email automatically via admin API)
  const { data: authData, error: authError } = await svc.auth.admin.createUser({
    email: input.email,
    password: input.password,
    email_confirm: false,
  })

  if (authError ?? !authData.user) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: authError?.message ?? "Failed to create account",
    })
  }

  const authUserId = authData.user.id
  const now = new Date().toISOString()

  // 6. Create company row
  const { data: company, error: companyError } = await svc
    .from("companies")
    .insert({
      name: input.companyLegalName,
      legal_name: input.companyLegalName,
      trading_name: input.tradingName ?? null,
      slug,
      country: input.country,
      vat_number: input.vatNumber ?? null,
      subscription_tier: "free",
      subscription_status: "trialing",
      company_status: "pending_email_verification",
      terms_accepted_at: now,
      terms_version: TERMS_VERSION,
      privacy_policy_accepted_at: now,
      privacy_policy_version: PRIVACY_VERSION,
      registration_ip: input.registrationIp ?? null,
    })
    .select("id")
    .single()

  if (companyError ?? !company) {
    // Roll back auth user creation
    await svc.auth.admin.deleteUser(authUserId)
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Failed to create company record",
    })
  }

  // 7. Create owner profile
  const { error: profileError } = await svc.from("profiles").insert({
    id: authUserId,
    company_id: company.id,
    role: "owner",
    first_name: input.ownerFirstName,
    last_name: input.ownerLastName,
    email: input.email,
    is_active: true,
  })

  if (profileError) {
    await svc.auth.admin.deleteUser(authUserId)
    await svc.from("companies").delete().eq("id", company.id)
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Failed to create user profile",
    })
  }

  // 8. Generate email verification link (pass password per Supabase signup link type requirement)
  const appUrl = process.env["NEXT_PUBLIC_APP_URL"] ?? "http://localhost:3000"
  const { data: linkData } = await svc.auth.admin.generateLink({
    type: "signup",
    email: input.email,
    password: input.password,
    options: {
      redirectTo: `${appUrl}/auth/confirm`,
    },
  })

  // 9. Send verification email (falls back to console in dev)
  const confirmationUrl = linkData?.properties?.action_link ?? `${appUrl}/register/check-email`

  try {
    // Dynamic import to avoid SSR issues with React Email
    const { PlatformEmailVerification } =
      await import("@/emails/platform/platform-email-verification")
    await sendPlatformEmail({
      to: input.email,
      subject: "Confirm your email to complete registration",
      react: createElement(PlatformEmailVerification, {
        companyName: input.companyLegalName,
        ownerName: input.ownerFirstName,
        confirmationUrl,
      }),
    })
  } catch {
    // Non-fatal: email send failure does not block registration
    console.error("[registration] Failed to send verification email")
  }

  // 10. Write activity log
  await svc.from("activity_logs").insert({
    company_id: company.id,
    actor_id: authUserId,
    actor_type: "user",
    actor_email: input.email,
    actor_name: `${input.ownerFirstName} ${input.ownerLastName}`,
    action: "company.registered",
    entity_type: "company",
    entity_id: company.id,
  })

  return { success: true, email: input.email }
})

// ─── Resend email verification ────────────────────────────────────────────────

export const resendVerification = publicProcedure
  .input(z.object({ email: z.string().email() }))
  .mutation(async ({ input }) => {
    const svc = createServiceRoleClient()

    const { data: profile } = await svc
      .from("profiles")
      .select("id")
      .eq("email", input.email)
      .maybeSingle()

    if (!profile?.id) {
      // Don't reveal whether email exists
      return { success: true }
    }

    // Use magiclink type for resend — no password required, works for unverified users
    const appUrl = process.env["NEXT_PUBLIC_APP_URL"] ?? "http://localhost:3000"
    const { data: linkData } = await svc.auth.admin.generateLink({
      type: "magiclink",
      email: input.email,
      options: { redirectTo: `${appUrl}/auth/confirm` },
    })

    if (linkData?.properties?.action_link) {
      try {
        const { PlatformEmailVerification } =
          await import("@/emails/platform/platform-email-verification")
        await sendPlatformEmail({
          to: input.email,
          subject: "Confirm your email to complete registration",
          react: createElement(PlatformEmailVerification, {
            companyName: "your company",
            ownerName: "",
            confirmationUrl: linkData.properties.action_link,
          }),
        })
      } catch {
        console.error("[registration] Failed to resend verification email")
      }
    }

    return { success: true }
  })

// ─── Duplicate company name check (non-blocking) ─────────────────────────────

export const checkCompanyName = publicProcedure
  .input(z.object({ legalName: z.string().min(2), country: z.string().length(2) }))
  .query(async ({ input }) => {
    const svc = createServiceRoleClient()
    const normalised = input.legalName.trim().toLowerCase()

    const { data } = await svc
      .from("companies")
      .select("id")
      .ilike("legal_name", normalised)
      .eq("country", input.country)
      .not("company_status", "eq", "archived")
      .limit(1)

    return { similarExists: (data?.length ?? 0) > 0 }
  })

// Hash utility exported for invitation module use
export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex")
}

export function generateRawToken(): string {
  return randomBytes(32).toString("base64url")
}
