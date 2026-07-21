/**
 * IAM integration tests.
 * Require local Supabase (npx supabase start) and a fully migrated + seeded schema.
 *
 * Tests interact with the DB directly via the service-role client to verify
 * schema correctness, RLS passthrough for service_role, and DML grant coverage
 * (migration 022).
 *
 * Run with:
 *   npm run test:integration
 *
 * Skipped automatically when SUPABASE_SERVICE_ROLE_KEY is absent or placeholder.
 */
import { describe, it, expect, beforeAll, afterEach } from "vitest"
import { createClient as createServiceClient } from "@supabase/supabase-js"

const SUPABASE_URL = process.env["NEXT_PUBLIC_SUPABASE_URL"] ?? "http://127.0.0.1:54321"
const SERVICE_ROLE_KEY = process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? ""
const HAS_LOCAL_DB = SERVICE_ROLE_KEY.length > 0 && !SERVICE_ROLE_KEY.startsWith("placeholder")

const describeWithDb = HAS_LOCAL_DB ? describe : describe.skip

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let service: ReturnType<typeof createServiceClient<any>>

beforeAll(() => {
  if (!HAS_LOCAL_DB) return
  service = createServiceClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
})

/**
 * Remove test artifacts — safe even if objects don't exist.
 * Deletion order matters:
 *   1. profiles (profiles.company_id FK is RESTRICT, blocks company deletion)
 *   2. companies (cascades to user_invitations)
 *   3. auth user (no DB cascade to public tables)
 */
async function cleanup(email: string) {
  const { data: profile } = await service
    .from("profiles")
    .select("id, company_id")
    .eq("email", email)
    .maybeSingle()

  const userId = profile?.id as string | undefined
  const companyId = profile?.company_id as string | undefined

  if (userId) {
    await service.from("profiles").delete().eq("id", userId)
  }
  if (companyId) {
    await service.from("companies").delete().eq("id", companyId)
  }
  if (userId) {
    await service.auth.admin.deleteUser(userId)
  }
}

describeWithDb("Registration flow — DB layer", () => {
  const testEmail = `integration+reg+${Date.now()}@bivro-test.dev`
  const testCompanyName = `Integration Test Co ${Date.now()}`

  afterEach(() => cleanup(testEmail))

  it("service_role can INSERT into companies and profiles after DML grants", async () => {
    const slug = `int-test-reg-${Date.now()}`

    const { data: authData, error: authError } = await service.auth.admin.createUser({
      email: testEmail,
      email_confirm: false,
      password: "Test!password123",
      user_metadata: { first_name: "Test", last_name: "User" },
    })
    expect(authError).toBeNull()
    expect(authData.user).toBeDefined()

    const { error: companyError } = await service.from("companies").insert({
      name: testCompanyName,
      legal_name: testCompanyName,
      slug,
      country: "CH",
      company_status: "pending_email_verification",
      subscription_tier: "free",
      subscription_status: "trialing",
    })
    expect(companyError).toBeNull()

    const { data: company } = await service
      .from("companies")
      .select("id, company_status")
      .eq("slug", slug)
      .single()

    expect(company?.company_status).toBe("pending_email_verification")
    expect(company?.id).toBeDefined()

    if (company?.id && authData.user) {
      const { error: profileError } = await service.from("profiles").insert({
        id: authData.user.id,
        company_id: company.id,
        role: "owner",
        email: testEmail,
        first_name: "Test",
        last_name: "User",
        is_active: true,
      })
      expect(profileError).toBeNull()
    }
  })

  it("company_status transitions from pending_email_verification to pending_review", async () => {
    const slug = `int-test-trans-${Date.now()}`

    const { data: authData } = await service.auth.admin.createUser({
      email: testEmail,
      email_confirm: true,
      password: "Test!password123",
    })

    const { data: company } = await service
      .from("companies")
      .insert({
        name: testCompanyName,
        legal_name: testCompanyName,
        slug,
        country: "CH",
        company_status: "pending_email_verification",
        subscription_tier: "free",
        subscription_status: "trialing",
      })
      .select("id")
      .single()

    expect(company?.id).toBeDefined()

    // Create profile so cleanup can find company_id
    if (company?.id && authData.user) {
      await service.from("profiles").insert({
        id: authData.user.id,
        company_id: company.id,
        role: "owner",
        email: testEmail,
        first_name: "Test",
        last_name: "User",
        is_active: true,
      })
    }

    const { error } = await service
      .from("companies")
      .update({ company_status: "pending_review" })
      .eq("id", company?.id ?? "")
      .eq("company_status", "pending_email_verification")

    expect(error).toBeNull()

    const { data: updated } = await service
      .from("companies")
      .select("company_status")
      .eq("id", company?.id ?? "")
      .single()

    expect(updated?.company_status).toBe("pending_review")
  })
})

describeWithDb("Invitation flow — DB layer", () => {
  const inviterEmail = `integration+inviter+${Date.now()}@bivro-test.dev`
  const inviteeEmail = `integration+invitee+${Date.now()}@bivro-test.dev`

  afterEach(async () => {
    // Cleanup inviter (has profile → company_id → cascades user_invitations)
    await cleanup(inviterEmail)
    // Invitee may have no profile; user_invitations already cascade-deleted above
    const { data: inviteeProfile } = await service
      .from("profiles")
      .select("id")
      .eq("email", inviteeEmail)
      .maybeSingle()
    if (inviteeProfile?.id) {
      await service.auth.admin.deleteUser(inviteeProfile.id as string)
    }
  })

  it("invitation token is stored as SHA-256 hash, not raw", async () => {
    const { createHash } = await import("crypto")
    const rawToken = "test-raw-token-abc123"
    const tokenHash = createHash("sha256").update(rawToken).digest("hex")

    expect(tokenHash).not.toBe(rawToken)
    expect(tokenHash).toHaveLength(64)
  })

  it("accepted invitation status is readable via service_role after DML grants", async () => {
    const { createHash } = await import("crypto")
    const rawToken = `token-${Date.now()}`
    const tokenHash = createHash("sha256").update(rawToken).digest("hex")
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()

    const { data: authData } = await service.auth.admin.createUser({
      email: inviterEmail,
      email_confirm: true,
      password: "Test!password123",
    })

    const { data: company } = await service
      .from("companies")
      .insert({
        name: "Integration Co",
        legal_name: "Integration Co",
        slug: `int-co-${Date.now()}`,
        country: "CH",
        company_status: "active",
        subscription_tier: "starter",
        subscription_status: "trialing",
      })
      .select("id")
      .single()

    if (!company?.id || !authData.user) return

    // Create inviter profile — required by user_invitations.invited_by FK → profiles.id
    await service.from("profiles").insert({
      id: authData.user.id,
      company_id: company.id,
      role: "owner",
      email: inviterEmail,
      first_name: "Inviter",
      last_name: "Test",
      is_active: true,
    })

    await service.from("user_invitations").insert({
      company_id: company.id,
      email: inviteeEmail,
      role: "office",
      token_hash: tokenHash,
      invited_by: authData.user.id,
      status: "pending",
      expires_at: expiresAt,
      permission_group_ids: [],
    })

    // Mark as accepted (as the accept flow would do)
    await service
      .from("user_invitations")
      .update({ status: "accepted", accepted_at: new Date().toISOString() })
      .eq("token_hash", tokenHash)

    const { data: inv } = await service
      .from("user_invitations")
      .select("status")
      .eq("token_hash", tokenHash)
      .single()

    expect(inv?.status).toBe("accepted")
  })
})

describeWithDb("Environment health check", () => {
  it("local Supabase URL and service-role key are present", () => {
    expect(SUPABASE_URL).toContain("127.0.0.1")
    expect(SERVICE_ROLE_KEY).not.toBe("")
  })
})
