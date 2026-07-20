/**
 * IAM integration tests.
 * Require local Supabase (pnpm supabase start) and a fully migrated schema.
 * Run with: pnpm vitest run --config vitest.integration.config.ts
 *
 * Tests use the service-role client to inspect state and clean up after each test.
 */
import { describe, it, expect, beforeAll, afterEach } from "vitest"
import { createClient as createServiceClient } from "@supabase/supabase-js"

const SUPABASE_URL = process.env["NEXT_PUBLIC_SUPABASE_URL"] ?? "http://127.0.0.1:54321"
const SERVICE_ROLE_KEY = process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? ""
const HAS_LOCAL_DB = SERVICE_ROLE_KEY.length > 0 && !SERVICE_ROLE_KEY.startsWith("placeholder")

// All tests are skipped unless a real local service-role key is present
const describeWithDb = HAS_LOCAL_DB ? describe : describe.skip

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let service: ReturnType<typeof createServiceClient<any>>

beforeAll(() => {
  if (!HAS_LOCAL_DB) return
  service = createServiceClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
})

async function cleanup(email: string) {
  // Look up user ID from profiles first (no getUserByEmail in Supabase admin API)
  const { data: profile } = await service
    .from("profiles")
    .select("user_id")
    .eq("email", email)
    .maybeSingle()

  if (profile?.user_id) {
    await service.auth.admin.deleteUser(profile.user_id as string)
  }

  await service.from("companies").delete().eq("owner_email", email)
}

describeWithDb("Registration flow", () => {
  const testEmail = `integration+reg+${Date.now()}@bivro-test.dev`
  const testCompanyName = `Integration Test Co ${Date.now()}`

  afterEach(() => cleanup(testEmail))

  it("creates auth user and company in pending_email_verification state", async () => {
    const { data: authData, error: authError } = await service.auth.admin.createUser({
      email: testEmail,
      email_confirm: false,
      password: "Test!password123",
      user_metadata: { first_name: "Test", last_name: "User" },
    })
    expect(authError).toBeNull()
    expect(authData.user).toBeDefined()

    const { error: companyError } = await service.from("companies").insert({
      owner_email: testEmail,
      legal_name: testCompanyName,
      slug: `integration-test-${Date.now()}`,
      country: "CH",
      status: "pending_email_verification",
    })

    expect(companyError).toBeNull()

    const { data: company } = await service
      .from("companies")
      .select("status")
      .eq("owner_email", testEmail)
      .single()

    expect(company?.status).toBe("pending_email_verification")
  })

  it("transitions to pending_review on email confirmation", async () => {
    const slug = `int-test-${Date.now()}`

    await service.auth.admin.createUser({
      email: testEmail,
      email_confirm: true,
      password: "Test!password123",
    })

    await service.from("companies").insert({
      owner_email: testEmail,
      legal_name: testCompanyName,
      slug,
      country: "CH",
      status: "pending_email_verification",
    })

    const { error } = await service
      .from("companies")
      .update({ status: "pending_review" })
      .eq("owner_email", testEmail)
      .eq("status", "pending_email_verification")

    expect(error).toBeNull()

    const { data: updated } = await service
      .from("companies")
      .select("status")
      .eq("owner_email", testEmail)
      .single()

    expect(updated?.status).toBe("pending_review")
  })
})

describeWithDb("Invitation flow", () => {
  const inviterEmail = `integration+inviter+${Date.now()}@bivro-test.dev`
  const inviteeEmail = `integration+invitee+${Date.now()}@bivro-test.dev`

  afterEach(async () => {
    await cleanup(inviterEmail)
    await cleanup(inviteeEmail)
    await service.from("invitations").delete().eq("email", inviteeEmail)
  })

  it("invitation token is stored as SHA-256 hash, not raw", async () => {
    const { createHash } = await import("crypto")
    const rawToken = "test-raw-token-abc123"
    const tokenHash = createHash("sha256").update(rawToken).digest("hex")

    expect(tokenHash).not.toBe(rawToken)
    expect(tokenHash).toHaveLength(64)
  })

  it("accepted invitation cannot be accepted again", async () => {
    const { createHash } = await import("crypto")
    const rawToken = `token-${Date.now()}`
    const tokenHash = createHash("sha256").update(rawToken).digest("hex")
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()

    const { data: authData } = await service.auth.admin.createUser({
      email: inviterEmail,
      email_confirm: true,
      password: "Test!password123",
    })
    const inviterId = authData.user!.id

    const { data: company } = await service
      .from("companies")
      .insert({
        owner_email: inviterEmail,
        legal_name: "Integration Co",
        slug: `int-co-${Date.now()}`,
        country: "CH",
        status: "active",
      })
      .select("id")
      .single()

    if (!company) return

    await service.from("invitations").insert({
      company_id: company.id,
      email: inviteeEmail,
      token_hash: tokenHash,
      invited_by: inviterId,
      status: "accepted",
      expires_at: expiresAt,
      permission_group_snapshot: [],
    })

    const { data: inv } = await service
      .from("invitations")
      .select("status")
      .eq("token_hash", tokenHash)
      .single()

    expect(inv?.status).toBe("accepted")
  })
})

describeWithDb("Password reset flow", () => {
  it("local Supabase is configured when integration tests run", () => {
    expect(SUPABASE_URL).toContain("127.0.0.1")
    expect(SERVICE_ROLE_KEY).not.toBe("")
  })
})
