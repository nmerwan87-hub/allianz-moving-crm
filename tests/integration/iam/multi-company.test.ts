/**
 * Multi-company access integration tests (docs/MULTI_COMPANY_ACCESS.md §7).
 *
 * Setup:
 *   - Person P: owner of Company A, office member of Company B
 *   - Owner B:  owner of Company B
 *   - Owner C:  owner of Company C (P has no membership there)
 *   - One lead in A, one lead in B
 *
 * Tests cover:
 *   - profile insert creates the first membership
 *   - JWT carries the active company and the membership role
 *   - switching changes the visible tenant; the old one becomes invisible
 *   - switching to a company without membership is rejected
 *   - deactivated membership → token falls back to another membership
 *   - no self-promotion via profiles.role, no self-service memberships
 *   - colleagues stay visible while working in another company
 *   - a company always keeps an active owner
 *
 * Uses real JWT-based authentication through PostgREST — the same path as production.
 * Requires local Supabase running with all migrations applied.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { createClient } from "@supabase/supabase-js"
import type { SupabaseClient } from "@supabase/supabase-js"
import { getJwtAppMetadata } from "@/lib/supabase/jwt"

const SUPABASE_URL = process.env["NEXT_PUBLIC_SUPABASE_URL"] ?? "http://127.0.0.1:54321"
const ANON_KEY = process.env["NEXT_PUBLIC_SUPABASE_ANON_KEY"] ?? ""
const SERVICE_ROLE_KEY = process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? ""
const HAS_LOCAL_DB =
  SERVICE_ROLE_KEY.length > 0 && !SERVICE_ROLE_KEY.startsWith("placeholder") && ANON_KEY.length > 0

const describeWithDb = HAS_LOCAL_DB ? describe : describe.skip

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Svc = SupabaseClient<any>

const ts = Date.now()
const TEST_PASSWORD = "SecureTest99!"

const PERSON_EMAIL = `mc-person-${ts}@bivro-test.dev`
const OWNER_B_EMAIL = `mc-owner-b-${ts}@bivro-test.dev`
const OWNER_C_EMAIL = `mc-owner-c-${ts}@bivro-test.dev`

let service: Svc
let personId: string
let ownerBId: string
let ownerCId: string
let companyAId: string
let companyBId: string
let companyCId: string
let leadAId: string
let leadBId: string

/** Signed-in client that keeps its session, so rpc() and refreshSession() use the user's JWT. */
async function signIn(email: string): Promise<Svc> {
  const client = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { error } = await client.auth.signInWithPassword({ email, password: TEST_PASSWORD })
  if (error) throw new Error(`Sign-in failed for ${email}: ${error.message}`)
  return client
}

async function claims(client: Svc): Promise<{ companyId?: string; role?: string }> {
  const {
    data: { session },
  } = await client.auth.getSession()
  const meta = getJwtAppMetadata(session?.access_token)
  return { companyId: meta["company_id"] as string, role: meta["role"] as string }
}

async function refresh(client: Svc): Promise<void> {
  const { error } = await client.auth.refreshSession()
  if (error) throw new Error(`refreshSession: ${error.message}`)
}

async function createCompany(slug: string): Promise<string> {
  const { data, error } = await service
    .from("companies")
    .insert({
      name: `MC ${slug}`,
      legal_name: `MC ${slug}`,
      slug,
      country: "CH",
      company_status: "active",
      subscription_tier: "starter",
      subscription_status: "trialing",
    })
    .select("id")
    .single()
  if (error || !data) throw new Error(`createCompany: ${error?.message}`)
  return data.id as string
}

async function createPerson(
  email: string,
  companyId: string,
  role: "owner" | "office",
): Promise<string> {
  const { data, error } = await service.auth.admin.createUser({
    email,
    email_confirm: true,
    password: TEST_PASSWORD,
  })
  if (error || !data.user) throw new Error(`createUser: ${error?.message}`)

  const { error: profErr } = await service.from("profiles").insert({
    id: data.user.id,
    company_id: companyId,
    role,
    email,
    first_name: "Multi",
    last_name: "Company",
    is_active: true,
  })
  if (profErr) throw new Error(`createProfile: ${profErr.message}`)
  return data.user.id
}

async function createLead(companyId: string, firstName: string): Promise<string> {
  const { data, error } = await service
    .from("leads")
    .insert({
      company_id: companyId,
      first_name: firstName,
      last_name: "Lead",
      email: `${firstName.toLowerCase()}-${ts}@example.com`,
      status: "new",
      source: "manual",
      origin_city: "Zurich",
      origin_country: "CH",
      dest_city: "Basel",
      dest_country: "CH",
      date_flexible: false,
      origin_has_elevator: false,
      origin_has_stairs: false,
      dest_has_elevator: false,
      dest_has_stairs: false,
    })
    .select("id")
    .single()
  if (error || !data) throw new Error(`createLead: ${error?.message}`)
  return data.id as string
}

async function visibleLeadIds(client: Svc): Promise<string[]> {
  const { data, error } = await client.from("leads").select("id").in("id", [leadAId, leadBId])
  if (error) throw new Error(`select leads: ${error.message}`)
  return (data ?? []).map((r) => r.id as string)
}

describeWithDb("Multi-company access", () => {
  beforeAll(async () => {
    service = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    companyAId = await createCompany(`mc-a-${ts}`)
    companyBId = await createCompany(`mc-b-${ts}`)
    companyCId = await createCompany(`mc-c-${ts}`)

    personId = await createPerson(PERSON_EMAIL, companyAId, "owner")
    ownerBId = await createPerson(OWNER_B_EMAIL, companyBId, "owner")
    ownerCId = await createPerson(OWNER_C_EMAIL, companyCId, "owner")

    const { error } = await service
      .from("company_memberships")
      .insert({ company_id: companyBId, user_id: personId, role: "office", is_active: true })
    if (error) throw new Error(`membership B: ${error.message}`)

    leadAId = await createLead(companyAId, "Alpha")
    leadBId = await createLead(companyBId, "Beta")
  })

  afterAll(async () => {
    const companies = [companyAId, companyBId, companyCId].filter(Boolean)
    await service.from("leads").delete().in("id", [leadAId, leadBId].filter(Boolean))
    await service.from("activity_logs").delete().in("company_id", companies)
    // Deleting profiles cascades to memberships (owner guard allows cascades)
    await service.from("profiles").delete().in("id", [personId, ownerBId, ownerCId].filter(Boolean))
    await service.from("companies").delete().in("id", companies)
    for (const id of [personId, ownerBId, ownerCId]) {
      if (id) await service.auth.admin.deleteUser(id)
    }
  })

  it("creates the first membership when a profile is inserted", async () => {
    const { data } = await service
      .from("company_memberships")
      .select("company_id, role, is_active")
      .eq("user_id", ownerBId)

    expect(data).toEqual([{ company_id: companyBId, role: "owner", is_active: true }])
  })

  it("issues a token for the active company with the membership role", async () => {
    const person = await signIn(PERSON_EMAIL)
    expect(await claims(person)).toEqual({ companyId: companyAId, role: "owner" })
    expect(await visibleLeadIds(person)).toEqual([leadAId])
  })

  it("switches to another member company and isolates the previous one", async () => {
    const person = await signIn(PERSON_EMAIL)

    const { error } = await person.rpc("switch_active_company", { p_company_id: companyBId })
    expect(error).toBeNull()
    await refresh(person)

    expect(await claims(person)).toEqual({ companyId: companyBId, role: "office" })
    expect(await visibleLeadIds(person)).toEqual([leadBId])

    // Switch back for the following tests
    await person.rpc("switch_active_company", { p_company_id: companyAId })
    await refresh(person)
    expect(await claims(person)).toEqual({ companyId: companyAId, role: "owner" })
    expect(await visibleLeadIds(person)).toEqual([leadAId])
  })

  it("rejects switching to a company without membership", async () => {
    const person = await signIn(PERSON_EMAIL)

    const { error } = await person.rpc("switch_active_company", { p_company_id: companyCId })
    expect(error).not.toBeNull()

    await refresh(person)
    expect((await claims(person)).companyId).toBe(companyAId)
  })

  it("rejects switching when not signed in", async () => {
    const anon = createClient(SUPABASE_URL, ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const { error } = await anon.rpc("switch_active_company", { p_company_id: companyAId })
    expect(error).not.toBeNull()
  })

  it("does not let a user promote itself via profiles.role", async () => {
    // Person is office in B; make B active, then try to become owner
    const person = await signIn(PERSON_EMAIL)
    await person.rpc("switch_active_company", { p_company_id: companyBId })
    await refresh(person)

    const { error } = await person.from("profiles").update({ role: "owner" }).eq("id", personId)
    expect(error).not.toBeNull()

    await refresh(person)
    expect(await claims(person)).toEqual({ companyId: companyBId, role: "office" })

    await person.rpc("switch_active_company", { p_company_id: companyAId })
  })

  it("still allows updating personal profile fields", async () => {
    const person = await signIn(PERSON_EMAIL)
    const { error } = await person
      .from("profiles")
      .update({ phone: "+41 44 000 00 00" })
      .eq("id", personId)
    expect(error).toBeNull()
  })

  it("does not let a user create or change memberships", async () => {
    const person = await signIn(PERSON_EMAIL)

    const { error: insertError } = await person
      .from("company_memberships")
      .insert({ company_id: companyCId, user_id: personId, role: "owner" })
    expect(insertError).not.toBeNull()

    await person
      .from("company_memberships")
      .update({ role: "owner" })
      .eq("company_id", companyBId)
      .eq("user_id", personId)

    const { data } = await service
      .from("company_memberships")
      .select("role")
      .eq("company_id", companyBId)
      .eq("user_id", personId)
      .single()
    expect(data?.role).toBe("office")
  })

  it("shows a member's own memberships but only the active company's team", async () => {
    const person = await signIn(PERSON_EMAIL)
    const { data: own } = await person.from("company_memberships").select("company_id")
    const ownCompanies = (own ?? []).map((r) => r.company_id as string).sort()
    // Own memberships (A, B) plus the other members of the active company A (none)
    expect(ownCompanies).toEqual([companyAId, companyBId].sort())

    const ownerB = await signIn(OWNER_B_EMAIL)
    const { data: teamB } = await ownerB.from("company_memberships").select("company_id, user_id")
    expect((teamB ?? []).every((r) => r.company_id === companyBId)).toBe(true)
    expect((teamB ?? []).map((r) => r.user_id as string).sort()).toEqual(
      [ownerBId, personId].sort(),
    )
  })

  it("keeps colleagues visible while they work in another company", async () => {
    // Person is active in A; Owner B must still see Person's profile in B's team
    const ownerB = await signIn(OWNER_B_EMAIL)
    const { data } = await ownerB.from("profiles").select("id").eq("id", personId)
    expect(data).toHaveLength(1)

    // Owner C has no shared company with Person
    const ownerC = await signIn(OWNER_C_EMAIL)
    const { data: hidden } = await ownerC.from("profiles").select("id").eq("id", personId)
    expect(hidden).toHaveLength(0)
  })

  it("falls back to another membership when the active one is deactivated", async () => {
    const person = await signIn(PERSON_EMAIL)
    await person.rpc("switch_active_company", { p_company_id: companyBId })
    await refresh(person)
    expect((await claims(person)).companyId).toBe(companyBId)

    await service
      .from("company_memberships")
      .update({ is_active: false })
      .eq("company_id", companyBId)
      .eq("user_id", personId)

    await refresh(person)
    expect(await claims(person)).toEqual({ companyId: companyAId, role: "owner" })
    expect(await visibleLeadIds(person)).toEqual([leadAId])

    const { error } = await person.rpc("switch_active_company", { p_company_id: companyBId })
    expect(error).not.toBeNull()

    await service
      .from("company_memberships")
      .update({ is_active: true })
      .eq("company_id", companyBId)
      .eq("user_id", personId)
  })

  it("keeps at least one active owner per company", async () => {
    const demote = await service
      .from("company_memberships")
      .update({ role: "office" })
      .eq("company_id", companyCId)
      .eq("user_id", ownerCId)
    expect(demote.error).not.toBeNull()

    const remove = await service
      .from("company_memberships")
      .delete()
      .eq("company_id", companyCId)
      .eq("user_id", ownerCId)
    expect(remove.error).not.toBeNull()

    // With a second owner, demoting the first one is allowed
    await service
      .from("company_memberships")
      .insert({ company_id: companyCId, user_id: personId, role: "owner", is_active: true })
    const demoteWithSecondOwner = await service
      .from("company_memberships")
      .update({ role: "office" })
      .eq("company_id", companyCId)
      .eq("user_id", ownerCId)
    expect(demoteWithSecondOwner.error).toBeNull()
  })
})
