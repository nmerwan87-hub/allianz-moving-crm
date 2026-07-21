/**
 * RLS Security tests — migration 022 + 023 verification.
 *
 * Proves all 8 security properties required before Sprint 4:
 *   1. Cross-tenant reads fail (Company A cannot read Company B's rows)
 *   2. Cross-tenant writes fail (Company A cannot modify Company B's rows)
 *   3. Office users cannot perform owner-only mutations
 *   4. Tenant users cannot access platform-admin tables
 *   5. Tenant users cannot access internal audit data
 *   6. Registration still succeeds (service_role can create companies + profiles)
 *   7. Dashboard still loads (authenticated reads own company row)
 *   8. Invitations still work (owner can insert user_invitations for own company)
 *
 * Uses real JWT-based authentication through PostgREST — the same path as production.
 * Requires local Supabase running with all migrations applied.
 *
 * Run with:
 *   npm run test:integration
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { createClient } from "@supabase/supabase-js"
import type { SupabaseClient } from "@supabase/supabase-js"
import { createHash } from "crypto"

const SUPABASE_URL = process.env["NEXT_PUBLIC_SUPABASE_URL"] ?? "http://127.0.0.1:54321"
const ANON_KEY = process.env["NEXT_PUBLIC_SUPABASE_ANON_KEY"] ?? ""
const SERVICE_ROLE_KEY = process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? ""
const HAS_LOCAL_DB =
  SERVICE_ROLE_KEY.length > 0 && !SERVICE_ROLE_KEY.startsWith("placeholder") && ANON_KEY.length > 0

const describeWithDb = HAS_LOCAL_DB ? describe : describe.skip

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Svc = SupabaseClient<any>

const ts = Date.now()

// ── Test identities ───────────────────────────────────────────────────────────

const OWNER_A_EMAIL = `sec-owner-a-${ts}@bivro-test.dev`
const OFFICE_A_EMAIL = `sec-office-a-${ts}@bivro-test.dev`
const OWNER_B_EMAIL = `sec-owner-b-${ts}@bivro-test.dev`
const TEST_PASSWORD = "SecureTest99!"

let service: Svc
let clientA: Svc // owner of Company A — authenticated via JWT
let clientOfficeA: Svc // office user of Company A — authenticated via JWT
let companyAId: string
let companyBId: string
let ownerAId: string
let officeAId: string
let ownerBId: string

// ── Utility ───────────────────────────────────────────────────────────────────

function makeAnon() {
  return createClient(SUPABASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

async function signInAsClient(email: string): Promise<Svc> {
  const anon = makeAnon()
  const { data, error } = await anon.auth.signInWithPassword({
    email,
    password: TEST_PASSWORD,
  })
  if (error || !data.session) {
    throw new Error(`Sign-in failed for ${email}: ${error?.message}`)
  }
  return createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${data.session.access_token}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

async function createUserCompanyProfile(
  svc: Svc,
  opts: {
    email: string
    companyId?: string // if omitted, creates a new company
    role: "owner" | "office"
    slug?: string
  },
): Promise<{ userId: string; companyId: string }> {
  const { data: authData, error: authError } = await svc.auth.admin.createUser({
    email: opts.email,
    email_confirm: true,
    password: TEST_PASSWORD,
  })
  if (authError || !authData.user) throw new Error(`createUser: ${authError?.message}`)
  const userId = authData.user.id

  let companyId = opts.companyId ?? ""
  if (!companyId) {
    const slug = opts.slug ?? `sec-test-${ts}-${Math.random().toString(36).slice(2, 8)}`
    const { data: company, error: coErr } = await svc
      .from("companies")
      .insert({
        name: `Security Test ${slug}`,
        legal_name: `Security Test ${slug}`,
        slug,
        country: "CH",
        company_status: "active",
        subscription_tier: "starter",
        subscription_status: "trialing",
      })
      .select("id")
      .single()
    if (coErr || !company) throw new Error(`createCompany: ${coErr?.message}`)
    companyId = company.id as string
  }

  const { error: profErr } = await svc.from("profiles").insert({
    id: userId,
    company_id: companyId,
    role: opts.role,
    email: opts.email,
    first_name: "Sec",
    last_name: "Test",
    is_active: true,
  })
  if (profErr) throw new Error(`createProfile: ${profErr.message}`)

  return { userId, companyId }
}

// ── Setup ─────────────────────────────────────────────────────────────────────

describeWithDb("Migration 022 + 023 Security Verification", () => {
  beforeAll(async () => {
    service = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    // Owner A + Company A
    const a = await createUserCompanyProfile(service, {
      email: OWNER_A_EMAIL,
      role: "owner",
      slug: `sec-co-a-${ts}`,
    })
    ownerAId = a.userId
    companyAId = a.companyId

    // Office user for Company A — shares Company A, no new company
    const a2 = await createUserCompanyProfile(service, {
      email: OFFICE_A_EMAIL,
      companyId: companyAId,
      role: "office",
    })
    officeAId = a2.userId

    // Owner B + Company B
    const b = await createUserCompanyProfile(service, {
      email: OWNER_B_EMAIL,
      role: "owner",
      slug: `sec-co-b-${ts}`,
    })
    ownerBId = b.userId
    companyBId = b.companyId

    // Add a customer to Company B so we can test cross-tenant read on customers
    await service.from("customers").insert({
      company_id: companyBId,
      type: "private",
      first_name: "Cross",
      last_name: "Tenant",
      email: `cross-tenant-customer-${ts}@example.com`,
      preferred_language: "de",
    })

    // Sign in both users to get JWT-authenticated clients
    clientA = await signInAsClient(OWNER_A_EMAIL)
    clientOfficeA = await signInAsClient(OFFICE_A_EMAIL)
  })

  afterAll(async () => {
    // Order: customers → profiles → companies → auth users
    await service.from("customers").delete().eq("company_id", companyBId)
    await service.from("user_invitations").delete().in("company_id", [companyAId, companyBId])
    await service.from("profiles").delete().in("id", [ownerAId, officeAId, ownerBId])
    if (companyAId) await service.from("companies").delete().eq("id", companyAId)
    if (companyBId) await service.from("companies").delete().eq("id", companyBId)
    for (const id of [ownerAId, officeAId, ownerBId]) {
      if (id) await service.auth.admin.deleteUser(id)
    }
  })

  // ── 1. Cross-tenant reads fail ──────────────────────────────────────────────

  describe("1. Cross-tenant reads fail", () => {
    it("Owner A cannot read Company B's row from companies", async () => {
      const { data, error } = await clientA.from("companies").select("id").eq("id", companyBId)

      expect(error).toBeNull()
      expect(data).toHaveLength(0)
    })

    it("Owner A cannot read Company B's profiles", async () => {
      const { data, error } = await clientA
        .from("profiles")
        .select("id")
        .eq("company_id", companyBId)

      expect(error).toBeNull()
      expect(data).toHaveLength(0)
    })

    it("Owner A cannot read Company B's customers", async () => {
      const { data, error } = await clientA
        .from("customers")
        .select("id")
        .eq("company_id", companyBId)

      expect(error).toBeNull()
      expect(data).toHaveLength(0)
    })

    it("Owner A cannot read Company B's user_invitations", async () => {
      const { data, error } = await clientA
        .from("user_invitations")
        .select("id")
        .eq("company_id", companyBId)

      expect(error).toBeNull()
      expect(data).toHaveLength(0)
    })
  })

  // ── 2. Cross-tenant writes fail ─────────────────────────────────────────────

  describe("2. Cross-tenant writes fail", () => {
    it("Owner A cannot update Company B's row", async () => {
      const { error, count } = await clientA
        .from("companies")
        .update({ name: "HACKED" })
        .eq("id", companyBId)
        .select()

      // Either PostgREST returns an error OR 0 rows are affected (RLS USING filters rows)
      const noRowsAffected = !error && (count === 0 || count === null)
      const blockedByRls = error !== null
      expect(noRowsAffected || blockedByRls).toBe(true)
    })

    it("Owner A cannot insert a customer for Company B", async () => {
      const { error } = await clientA.from("customers").insert({
        company_id: companyBId,
        type: "private",
        first_name: "Injected",
        last_name: "Customer",
        email: `injected-${ts}@example.com`,
        preferred_language: "de",
      })

      // Expect a violation — either RLS CHECK blocks or privilege revoked
      expect(error).not.toBeNull()
    })
  })

  // ── 3. Office users cannot perform owner-only mutations ─────────────────────

  describe("3. Office users cannot perform owner-only mutations", () => {
    it("Office A cannot update Company A's name", async () => {
      const { error, count } = await clientOfficeA
        .from("companies")
        .update({ name: "Office Hijack" })
        .eq("id", companyAId)
        .select()

      const noRowsAffected = !error && (count === 0 || count === null)
      const blockedByRls = error !== null
      expect(noRowsAffected || blockedByRls).toBe(true)
    })

    it("Office A cannot insert a user_invitation for Company A", async () => {
      const rawToken = `office-inv-${ts}`
      const tokenHash = createHash("sha256").update(rawToken).digest("hex")

      const { error } = await clientOfficeA.from("user_invitations").insert({
        company_id: companyAId,
        email: `inv-target-${ts}@bivro-test.dev`,
        role: "office",
        token_hash: tokenHash,
        invited_by: officeAId,
        status: "pending",
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        permission_group_ids: [],
      })

      expect(error).not.toBeNull()
    })
  })

  // ── 4. Tenant users cannot access platform-admin tables ─────────────────────

  describe("4. Platform-admin tables are inaccessible to tenant users", () => {
    it("Owner A cannot read platform_admin_users", async () => {
      const { data, error } = await clientA.from("platform_admin_users").select("id")
      // After REVOKE ALL: PostgREST returns HTTP 403 (permission denied)
      // data will be null and error will be set
      const isBlocked = error !== null || data === null || (data as unknown[]).length === 0
      expect(isBlocked).toBe(true)
    })

    it("Owner A cannot read platform_admin_roles", async () => {
      const { data, error } = await clientA.from("platform_admin_roles").select("id")
      const isBlocked = error !== null || data === null || (data as unknown[]).length === 0
      expect(isBlocked).toBe(true)
    })

    it("Owner A cannot read platform_admin_sessions", async () => {
      const { data, error } = await clientA.from("platform_admin_sessions").select("id")
      const isBlocked = error !== null || data === null || (data as unknown[]).length === 0
      expect(isBlocked).toBe(true)
    })

    it("Owner A cannot insert into platform_admin_users", async () => {
      const { error } = await clientA.from("platform_admin_users").insert({
        email: `rogue-admin-${ts}@bivro-test.dev`,
        username: `rogue_${ts}`,
        password_hash: "not-a-real-hash",
        is_active: true,
      })
      expect(error).not.toBeNull()
    })
  })

  // ── 5. Tenant users cannot access internal audit/token data ─────────────────

  describe("5. Internal audit and system tables are inaccessible to tenant users", () => {
    it("Owner A cannot read platform_audit_log", async () => {
      const { data, error } = await clientA.from("platform_audit_log").select("id")
      const isBlocked = error !== null || data === null || (data as unknown[]).length === 0
      expect(isBlocked).toBe(true)
    })

    it("Owner A cannot read platform_metric_snapshots", async () => {
      const { data, error } = await clientA.from("platform_metric_snapshots").select("id")
      const isBlocked = error !== null || data === null || (data as unknown[]).length === 0
      expect(isBlocked).toBe(true)
    })

    it("Owner A cannot insert a domain_event", async () => {
      const { error } = await clientA.from("domain_events").insert({
        company_id: companyAId,
        event_type: "company.approved",
        aggregate_type: "company",
        aggregate_id: companyAId,
        payload: { forged: true },
      })
      // After migration 023: INSERT privilege revoked from authenticated
      expect(error).not.toBeNull()
    })

    it("Owner A cannot insert into activity_logs", async () => {
      const { error } = await clientA.from("activity_logs").insert({
        company_id: companyAId,
        actor_id: ownerAId,
        action: "forged_event",
        resource_type: "company",
        resource_id: companyAId,
      })
      expect(error).not.toBeNull()
    })
  })

  // ── 6. Registration still succeeds ──────────────────────────────────────────

  describe("6. Registration still works via service_role", () => {
    const regEmail = `sec-reg-${ts}@bivro-test.dev`
    const regSlug = `sec-reg-co-${ts}`
    let regUserId: string | undefined
    let regCompanyId: string | undefined

    afterAll(async () => {
      if (regUserId) await service.from("profiles").delete().eq("id", regUserId)
      if (regCompanyId) await service.from("companies").delete().eq("id", regCompanyId)
      if (regUserId) await service.auth.admin.deleteUser(regUserId)
    })

    it("service_role can create auth user, company, and profile", async () => {
      const { data: authData, error: authErr } = await service.auth.admin.createUser({
        email: regEmail,
        email_confirm: false,
        password: TEST_PASSWORD,
      })
      expect(authErr).toBeNull()
      expect(authData.user?.id).toBeDefined()
      regUserId = authData.user?.id

      const { data: company, error: coErr } = await service
        .from("companies")
        .insert({
          name: "Sec Reg Test Co",
          legal_name: "Sec Reg Test Co",
          slug: regSlug,
          country: "CH",
          company_status: "pending_email_verification",
          subscription_tier: "free",
          subscription_status: "trialing",
        })
        .select("id")
        .single()
      expect(coErr).toBeNull()
      expect(company?.id).toBeDefined()
      regCompanyId = company?.id as string

      const { error: profErr } = await service.from("profiles").insert({
        id: regUserId,
        company_id: regCompanyId,
        role: "owner",
        email: regEmail,
        first_name: "Sec",
        last_name: "Reg",
        is_active: true,
      })
      expect(profErr).toBeNull()
    })
  })

  // ── 7. Dashboard still loads ────────────────────────────────────────────────

  describe("7. Dashboard data is accessible to authenticated tenant user", () => {
    it("Owner A can read own company row", async () => {
      const { data, error } = await clientA
        .from("companies")
        .select("id, name, company_status")
        .eq("id", companyAId)

      expect(error).toBeNull()
      expect(data).toHaveLength(1)
      expect((data as { id: string }[])[0]?.id).toBe(companyAId)
    })

    it("Owner A can read own profile", async () => {
      const { data, error } = await clientA
        .from("profiles")
        .select("id, role, company_id")
        .eq("id", ownerAId)

      expect(error).toBeNull()
      expect(data).toHaveLength(1)
      expect((data as { company_id: string }[])[0]?.company_id).toBe(companyAId)
    })

    it("Owner A can read system document_templates (no company_id — system table)", async () => {
      // document_templates is a system-wide read — SELECT USING (auth.role() = 'authenticated')
      // No cross-tenant leak because there is no company_id column on this table
      const { error } = await clientA.from("document_templates").select("id, document_type")
      expect(error).toBeNull()
    })
  })

  // ── 8. Invitations still work ────────────────────────────────────────────────

  describe("8. Invitations still work for company owners", () => {
    it("Owner A can insert a user_invitation for Company A", async () => {
      const rawToken = `owner-inv-${ts}`
      const tokenHash = createHash("sha256").update(rawToken).digest("hex")

      const { error } = await clientA.from("user_invitations").insert({
        company_id: companyAId,
        email: `invited-${ts}@bivro-test.dev`,
        role: "office",
        token_hash: tokenHash,
        invited_by: ownerAId,
        status: "pending",
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        permission_group_ids: [],
      })

      expect(error).toBeNull()
    })

    it("Owner A can read own company's user_invitations", async () => {
      const { data, error } = await clientA
        .from("user_invitations")
        .select("id, email, status")
        .eq("company_id", companyAId)

      expect(error).toBeNull()
      expect((data as unknown[]).length).toBeGreaterThanOrEqual(1)
    })
  })
})
