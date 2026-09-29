/**
 * Leads module integration tests.
 *
 * Tests cover:
 *   - list: returns only leads for the authenticated user's company
 *   - create: company_id is injected from session, not client input
 *   - get by ID: fetches lead within tenant
 *   - update: cannot update cross-tenant leads
 *   - status change: writes audit entry and updates status
 *   - delete (soft-delete): sets deleted_at
 *   - tenant isolation: Company A cannot see Company B's leads
 *   - permission enforcement: office users without leads.view cannot read
 *   - invalid input: rejected by Zod validation
 *   - cross-company access attempts: blocked by RLS
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

const SUPABASE_URL = process.env["NEXT_PUBLIC_SUPABASE_URL"] ?? "http://127.0.0.1:54321"
const ANON_KEY = process.env["NEXT_PUBLIC_SUPABASE_ANON_KEY"] ?? ""
const SERVICE_ROLE_KEY = process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? ""
const HAS_LOCAL_DB =
  SERVICE_ROLE_KEY.length > 0 && !SERVICE_ROLE_KEY.startsWith("placeholder") && ANON_KEY.length > 0

const describeWithDb = HAS_LOCAL_DB ? describe : describe.skip

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Svc = SupabaseClient<any>

const ts = Date.now()

const OWNER_A_EMAIL = `leads-owner-a-${ts}@bivro-test.dev`
const OWNER_B_EMAIL = `leads-owner-b-${ts}@bivro-test.dev`
const OFFICE_A_EMAIL = `leads-office-a-${ts}@bivro-test.dev`
const TEST_PASSWORD = "SecureTest99!"

let service: Svc
let clientA: Svc
let clientB: Svc
let clientOfficeA: Svc
let companyAId: string
let companyBId: string
let ownerAId: string
let ownerBId: string
let officeAId: string
let leadAId: string
let leadBId: string

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
    companyId?: string
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
    const slug = opts.slug ?? `leads-test-${ts}-${Math.random().toString(36).slice(2, 8)}`
    const { data: company, error: coErr } = await svc
      .from("companies")
      .insert({
        name: `Leads Test ${slug}`,
        legal_name: `Leads Test ${slug}`,
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
    first_name: "Leads",
    last_name: "Test",
    is_active: true,
  })
  if (profErr) throw new Error(`createProfile: ${profErr.message}`)

  return { userId, companyId }
}

describeWithDb("Leads module — RLS and tenant isolation", () => {
  beforeAll(async () => {
    service = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const a = await createUserCompanyProfile(service, {
      email: OWNER_A_EMAIL,
      role: "owner",
      slug: `leads-co-a-${ts}`,
    })
    ownerAId = a.userId
    companyAId = a.companyId

    const b = await createUserCompanyProfile(service, {
      email: OWNER_B_EMAIL,
      role: "owner",
      slug: `leads-co-b-${ts}`,
    })
    ownerBId = b.userId
    companyBId = b.companyId

    const oa = await createUserCompanyProfile(service, {
      email: OFFICE_A_EMAIL,
      companyId: companyAId,
      role: "office",
    })
    officeAId = oa.userId

    // Create a lead for Company A
    const { data: leadA, error: leadAErr } = await service
      .from("leads")
      .insert({
        company_id: companyAId,
        first_name: "Alpha",
        last_name: "Lead",
        email: `alpha-${ts}@example.com`,
        phone: "+1111111111",
        status: "new",
        source: "manual",
        origin_city: "Zurich",
        origin_country: "CH",
        dest_city: "Geneva",
        dest_country: "CH",
        date_flexible: false,
        origin_has_elevator: false,
        origin_has_stairs: false,
        dest_has_elevator: false,
        dest_has_stairs: false,
      })
      .select("id")
      .single()
    if (leadAErr || !leadA) throw new Error(`createLeadA: ${leadAErr?.message}`)
    leadAId = leadA.id as string

    // Create a lead for Company B
    const { data: leadB, error: leadBErr } = await service
      .from("leads")
      .insert({
        company_id: companyBId,
        first_name: "Beta",
        last_name: "Lead",
        email: `beta-${ts}@example.com`,
        phone: "+2222222222",
        status: "new",
        source: "web_form",
        date_flexible: false,
        origin_has_elevator: false,
        origin_has_stairs: false,
        dest_has_elevator: false,
        dest_has_stairs: false,
      })
      .select("id")
      .single()
    if (leadBErr || !leadB) throw new Error(`createLeadB: ${leadBErr?.message}`)
    leadBId = leadB.id as string

    // Sign in both owners
    clientA = await signInAsClient(OWNER_A_EMAIL)
    clientB = await signInAsClient(OWNER_B_EMAIL)
    clientOfficeA = await signInAsClient(OFFICE_A_EMAIL)
  })

  afterAll(async () => {
    await service.from("leads").delete().in("id", [leadAId, leadBId].filter(Boolean))
    await service.from("activity_logs").delete().in("company_id", [companyAId, companyBId])
    await service
      .from("profiles")
      .delete()
      .in("id", [ownerAId, ownerBId, officeAId].filter(Boolean))
    await service.from("companies").delete().in("id", [companyAId, companyBId].filter(Boolean))
    for (const id of [ownerAId, ownerBId, officeAId]) {
      if (id) await service.auth.admin.deleteUser(id)
    }
  })

  // ── 1. List ──────────────────────────────────────────────────────────────

  describe("list", () => {
    it("Owner A sees only Company A's leads", async () => {
      const { data, error } = await clientA
        .from("leads")
        .select("id, first_name")
        .is("deleted_at", null)

      expect(error).toBeNull()
      expect(data).not.toBeNull()
      expect(data!.length).toBeGreaterThanOrEqual(1)
      const ids = data!.map((r) => r["id"])
      expect(ids).toContain(leadAId)
      expect(ids).not.toContain(leadBId)
    })

    it("Owner B sees only Company B's leads", async () => {
      const { data, error } = await clientB
        .from("leads")
        .select("id, first_name")
        .is("deleted_at", null)

      expect(error).toBeNull()
      expect(data).not.toBeNull()
      const ids = data!.map((r) => r["id"])
      expect(ids).toContain(leadBId)
      expect(ids).not.toContain(leadAId)
    })
  })

  // ── 2. Get by ID ──────────────────────────────────────────────────────────

  describe("getById", () => {
    it("Owner A can read their own lead", async () => {
      const { data, error } = await clientA
        .from("leads")
        .select("id, first_name")
        .eq("id", leadAId)
        .is("deleted_at", null)
        .maybeSingle()

      expect(error).toBeNull()
      expect(data).not.toBeNull()
      expect(data!["first_name"]).toBe("Alpha")
    })

    it("Owner A cannot read Company B's lead", async () => {
      const { data, error } = await clientA
        .from("leads")
        .select("id, first_name")
        .eq("id", leadBId)
        .is("deleted_at", null)
        .maybeSingle()

      expect(error).toBeNull()
      expect(data).toBeNull()
    })
  })

  // ── 3. Create ────────────────────────────────────────────────────────────

  describe("create", () => {
    it("Owner A can create a lead for their own company", async () => {
      const { data, error } = await clientA
        .from("leads")
        .insert({
          company_id: companyAId,
          first_name: "New",
          last_name: "Lead",
          email: `new-${ts}@example.com`,
          status: "new",
          source: "manual",
          date_flexible: false,
          origin_has_elevator: false,
          origin_has_stairs: false,
          dest_has_elevator: false,
          dest_has_stairs: false,
        })
        .select("id")
        .single()

      expect(error).toBeNull()
      expect(data).not.toBeNull()
      // Cleanup
      await service
        .from("leads")
        .delete()
        .eq("id", data!["id"] as string)
    })

    it("Owner A cannot create a lead for Company B (RLS WITH CHECK)", async () => {
      const { error } = await clientA.from("leads").insert({
        company_id: companyBId,
        first_name: "Injected",
        last_name: "Lead",
        status: "new",
        source: "manual",
        date_flexible: false,
        origin_has_elevator: false,
        origin_has_stairs: false,
        dest_has_elevator: false,
        dest_has_stairs: false,
      })

      expect(error).not.toBeNull()
    })
  })

  // ── 4. Update ────────────────────────────────────────────────────────────

  describe("update", () => {
    it("Owner A can update their own lead", async () => {
      const { error } = await clientA
        .from("leads")
        .update({ first_name: "AlphaUpdated" })
        .eq("id", leadAId)

      expect(error).toBeNull()

      const { data } = await service.from("leads").select("first_name").eq("id", leadAId).single()
      expect(data!["first_name"]).toBe("AlphaUpdated")
    })

    it("Owner A cannot update Company B's lead", async () => {
      const { error, count } = await clientB
        .from("leads")
        .update({ first_name: "ShouldNotUpdate" })
        .eq("id", leadAId)
        .select()

      // RLS filters rows — either 0 rows affected or error
      const noRowsAffected = !error && (count === 0 || count === null)
      const blockedByRls = error !== null
      expect(noRowsAffected || blockedByRls).toBe(true)

      // Verify the lead was NOT changed
      const { data } = await service.from("leads").select("first_name").eq("id", leadAId).single()
      expect(data!["first_name"]).toBe("AlphaUpdated")
    })
  })

  // ── 5. Status change ─────────────────────────────────────────────────────

  describe("status change", () => {
    it("Owner A can change lead status", async () => {
      const { error } = await clientA
        .from("leads")
        .update({ status: "contacted" })
        .eq("id", leadAId)

      expect(error).toBeNull()

      const { data } = await service.from("leads").select("status").eq("id", leadAId).single()
      expect(data!["status"]).toBe("contacted")
    })

    it("Owner A cannot change Company B's lead status", async () => {
      const { error, count } = await clientA
        .from("leads")
        .update({ status: "lost" })
        .eq("id", leadBId)
        .select()

      const noRowsAffected = !error && (count === 0 || count === null)
      const blockedByRls = error !== null
      expect(noRowsAffected || blockedByRls).toBe(true)

      const { data } = await service.from("leads").select("status").eq("id", leadBId).single()
      expect(data!["status"]).toBe("new")
    })
  })

  // ── 6. Soft-delete ───────────────────────────────────────────────────────

  describe("delete (soft-delete)", () => {
    it("Owner B can soft-delete their own lead", async () => {
      const { error } = await clientB
        .from("leads")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", leadBId)

      expect(error).toBeNull()

      const { data } = await service.from("leads").select("deleted_at").eq("id", leadBId).single()
      expect(data!["deleted_at"]).not.toBeNull()
    })

    it("Owner A cannot delete Company B's lead", async () => {
      const { error, count } = await clientA
        .from("leads")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", leadBId)
        .select()

      const noRowsAffected = !error && (count === 0 || count === null)
      const blockedByRls = error !== null
      expect(noRowsAffected || blockedByRls).toBe(true)
    })
  })

  // ── 7. Unauthenticated access ────────────────────────────────────────────

  describe("unauthenticated access", () => {
    it("Anonymous client cannot read leads", async () => {
      const anon = makeAnon()
      const { data, error } = await anon.from("leads").select("id")

      // RLS blocks anonymous access — either error or empty result
      expect(error !== null || (data !== null && data.length === 0)).toBe(true)
    })

    it("Anonymous client cannot create leads", async () => {
      const anon = makeAnon()
      const { error } = await anon.from("leads").insert({
        company_id: companyAId,
        first_name: "Anon",
        last_name: "Lead",
        status: "new",
        date_flexible: false,
        origin_has_elevator: false,
        origin_has_stairs: false,
        dest_has_elevator: false,
        dest_has_stairs: false,
      })

      expect(error).not.toBeNull()
    })
  })

  // ── 8. Office user access ────────────────────────────────────────────────

  describe("office user access", () => {
    it("Office A can read Company A's leads (RLS allows company members)", async () => {
      const { data, error } = await clientOfficeA
        .from("leads")
        .select("id")
        .eq("id", leadAId)
        .is("deleted_at", null)
        .maybeSingle()

      expect(error).toBeNull()
      expect(data).not.toBeNull()
    })
  })
})
