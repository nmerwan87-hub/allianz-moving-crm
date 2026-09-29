/**
 * resendVerification integration tests.
 * Require local Supabase (npx supabase start) and a fully migrated schema.
 *
 * Exercises the real tRPC procedure against the local DB + GoTrue. Only the
 * outbound email transport is stubbed so we can observe whether the flow
 * reached the send step.
 *
 * Regression: the procedure previously selected profiles.user_id (nonexistent
 * column — profiles is keyed by id). The query errored, profile was null, and
 * the procedure silently returned success without ever sending an email.
 *
 * Skipped automatically when SUPABASE_SERVICE_ROLE_KEY is absent or placeholder.
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest"
import { createClient as createServiceClient } from "@supabase/supabase-js"
import { createCallerFactory, createTRPCRouter } from "@/lib/trpc/init"
import type { Context } from "@/lib/trpc/context"
import { resendVerification } from "@/modules/iam/router/registration"
import { sendPlatformEmail } from "@/lib/email/send"

vi.mock("@/lib/email/send", () => ({
  sendPlatformEmail: vi.fn().mockResolvedValue(undefined),
}))

const SUPABASE_URL = process.env["NEXT_PUBLIC_SUPABASE_URL"] ?? "http://127.0.0.1:54321"
const SERVICE_ROLE_KEY = process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? ""
const HAS_LOCAL_DB = SERVICE_ROLE_KEY.length > 0 && !SERVICE_ROLE_KEY.startsWith("placeholder")

const describeWithDb = HAS_LOCAL_DB ? describe : describe.skip

// resendVerification is a public procedure and never reads ctx.
const caller = createCallerFactory(createTRPCRouter({ resendVerification }))({} as Context)
const sendMock = vi.mocked(sendPlatformEmail)

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let service: ReturnType<typeof createServiceClient<any>>

describeWithDb("resendVerification — profiles.id lookup", () => {
  const ts = Date.now()
  const knownEmail = `integration+resend+${ts}@bivro-test.dev`
  const unknownEmail = `integration+resend-unknown+${ts}@bivro-test.dev`
  let userId: string | undefined
  let companyId: string | undefined

  beforeAll(async () => {
    service = createServiceClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    // Unverified owner, as left behind by the registration flow
    const { data: authData, error: authError } = await service.auth.admin.createUser({
      email: knownEmail,
      email_confirm: false,
      password: "Test!password123",
    })
    if (authError || !authData.user) throw new Error(`createUser: ${authError?.message}`)
    userId = authData.user.id

    const { data: company, error: coErr } = await service
      .from("companies")
      .insert({
        name: `Resend Test Co ${ts}`,
        legal_name: `Resend Test Co ${ts}`,
        slug: `int-test-resend-${ts}`,
        country: "CH",
        company_status: "pending_email_verification",
        subscription_tier: "free",
        subscription_status: "trialing",
      })
      .select("id")
      .single()
    if (coErr ?? !company) throw new Error(`company insert: ${coErr?.message}`)
    companyId = company.id as string

    const { error: profileError } = await service.from("profiles").insert({
      id: userId,
      company_id: companyId,
      role: "owner",
      email: knownEmail,
      first_name: "Resend",
      last_name: "Test",
      is_active: true,
    })
    if (profileError) throw new Error(`profile insert: ${profileError.message}`)
  })

  afterAll(async () => {
    if (userId) await service.from("profiles").delete().eq("id", userId)
    if (companyId) await service.from("companies").delete().eq("id", companyId)
    if (userId) await service.auth.admin.deleteUser(userId)
  })

  beforeEach(() => {
    sendMock.mockClear()
  })

  it("profiles has no user_id column (lookup must use id)", async () => {
    const { error: badColumn } = await service
      .from("profiles")
      .select("user_id")
      .eq("email", knownEmail)
      .maybeSingle()
    expect(badColumn).not.toBeNull()

    const { data, error } = await service
      .from("profiles")
      .select("id")
      .eq("email", knownEmail)
      .maybeSingle()
    expect(error).toBeNull()
    expect(data?.id).toBe(userId)
  })

  it("sends a verification email with a magic link for an existing profile", async () => {
    const result = await caller.resendVerification({ email: knownEmail })

    expect(result).toEqual({ success: true })
    expect(sendMock).toHaveBeenCalledTimes(1)

    const opts = sendMock.mock.calls[0]![0]
    expect(opts.to).toBe(knownEmail)
    expect(opts.subject).toBe("Confirm your email to complete registration")

    const props = opts.react.props as { confirmationUrl?: string }
    expect(props.confirmationUrl).toMatch(/\/auth\/v1\/verify\?token=/)
    expect(props.confirmationUrl).toContain("type=magiclink")
  })

  it("returns the same generic success for an unknown email without sending", async () => {
    const result = await caller.resendVerification({ email: unknownEmail })

    expect(result).toEqual({ success: true })
    expect(sendMock).not.toHaveBeenCalled()
  })
})
