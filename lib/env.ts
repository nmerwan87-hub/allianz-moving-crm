import { z } from "zod"

const serverSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  SUPABASE_DB_URL: z.string().url(),
  SUPABASE_JWT_SECRET: z.string().min(1),
  CRON_SECRET: z.string().min(1),
  ANTHROPIC_API_KEY: z.string().min(1),
  RESEND_API_KEY: z.string().min(1),
  RESEND_WEBHOOK_SECRET: z.string().min(1),
  STRIPE_SECRET_KEY: z.string().min(1),
  STRIPE_WEBHOOK_SECRET: z.string().min(1),
  STRIPE_PRICE_ID_STARTER: z.string().min(1),
  STRIPE_PRICE_ID_STARTER_ANNUAL: z.string().min(1),
  STRIPE_PRICE_ID_PRO: z.string().min(1),
  STRIPE_PRICE_ID_PRO_ANNUAL: z.string().min(1),
  STRIPE_PRICE_ID_BUSINESS: z.string().min(1),
  STRIPE_PRICE_ID_BUSINESS_ANNUAL: z.string().min(1),
  PLATFORM_GOOGLE_CLIENT_ID: z.string().min(1),
  PLATFORM_GOOGLE_CLIENT_SECRET: z.string().min(1),
  PLATFORM_SESSION_SECRET: z.string().min(1),
  SENTRY_DSN: z.string().url().optional(),
})

const clientSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  NEXT_PUBLIC_APP_URL: z.string().url(),
  NEXT_PUBLIC_ADMIN_URL: z.string().url(),
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: z.string().min(1),
})

function validateClientEnv() {
  const result = clientSchema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: process.env["NEXT_PUBLIC_SUPABASE_URL"],
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env["NEXT_PUBLIC_SUPABASE_ANON_KEY"],
    NEXT_PUBLIC_APP_URL: process.env["NEXT_PUBLIC_APP_URL"],
    NEXT_PUBLIC_ADMIN_URL: process.env["NEXT_PUBLIC_ADMIN_URL"],
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: process.env["NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY"],
  })

  if (!result.success) {
    throw new Error(
      `Missing or invalid client environment variables:\n${
        result.error.flatten().fieldErrors
          ? JSON.stringify(result.error.flatten().fieldErrors, null, 2)
          : result.error.message
      }`,
    )
  }

  return result.data
}

function validateServerEnv() {
  if (typeof window !== "undefined") {
    throw new Error("validateServerEnv must not be called in the browser")
  }

  const result = serverSchema.safeParse({
    SUPABASE_SERVICE_ROLE_KEY: process.env["SUPABASE_SERVICE_ROLE_KEY"],
    SUPABASE_DB_URL: process.env["SUPABASE_DB_URL"],
    SUPABASE_JWT_SECRET: process.env["SUPABASE_JWT_SECRET"],
    CRON_SECRET: process.env["CRON_SECRET"],
    ANTHROPIC_API_KEY: process.env["ANTHROPIC_API_KEY"],
    RESEND_API_KEY: process.env["RESEND_API_KEY"],
    RESEND_WEBHOOK_SECRET: process.env["RESEND_WEBHOOK_SECRET"],
    STRIPE_SECRET_KEY: process.env["STRIPE_SECRET_KEY"],
    STRIPE_WEBHOOK_SECRET: process.env["STRIPE_WEBHOOK_SECRET"],
    STRIPE_PRICE_ID_STARTER: process.env["STRIPE_PRICE_ID_STARTER"],
    STRIPE_PRICE_ID_STARTER_ANNUAL: process.env["STRIPE_PRICE_ID_STARTER_ANNUAL"],
    STRIPE_PRICE_ID_PRO: process.env["STRIPE_PRICE_ID_PRO"],
    STRIPE_PRICE_ID_PRO_ANNUAL: process.env["STRIPE_PRICE_ID_PRO_ANNUAL"],
    STRIPE_PRICE_ID_BUSINESS: process.env["STRIPE_PRICE_ID_BUSINESS"],
    STRIPE_PRICE_ID_BUSINESS_ANNUAL: process.env["STRIPE_PRICE_ID_BUSINESS_ANNUAL"],
    PLATFORM_GOOGLE_CLIENT_ID: process.env["PLATFORM_GOOGLE_CLIENT_ID"],
    PLATFORM_GOOGLE_CLIENT_SECRET: process.env["PLATFORM_GOOGLE_CLIENT_SECRET"],
    PLATFORM_SESSION_SECRET: process.env["PLATFORM_SESSION_SECRET"],
    SENTRY_DSN: process.env["SENTRY_DSN"],
  })

  if (!result.success) {
    throw new Error(
      `Missing or invalid server environment variables:\n${JSON.stringify(
        result.error.flatten().fieldErrors,
        null,
        2,
      )}`,
    )
  }

  return result.data
}

export { validateClientEnv, validateServerEnv }

export type ClientEnv = z.infer<typeof clientSchema>
export type ServerEnv = z.infer<typeof serverSchema>
