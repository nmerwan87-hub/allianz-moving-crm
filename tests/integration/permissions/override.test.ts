/**
 * Permission override resolution tests.
 *
 * Verifies:
 *   - 'grant' overrides add permissions not in any group
 *   - 'deny' overrides remove permissions granted by groups
 *   - deny takes precedence over group grants (deny is absolute)
 *
 * Requires: local Supabase with all migrations applied.
 * Run with: npm run test:integration
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { createClient as createServiceClient } from "@supabase/supabase-js"
import { loadOfficePermissions } from "@/modules/iam/lib/permissions"

const SUPABASE_URL = process.env["NEXT_PUBLIC_SUPABASE_URL"] ?? "http://127.0.0.1:54321"
const SERVICE_ROLE_KEY = process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? ""
const HAS_LOCAL_DB = SERVICE_ROLE_KEY.length > 0 && !SERVICE_ROLE_KEY.startsWith("placeholder")

const describeWithDb = HAS_LOCAL_DB ? describe : describe.skip

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let svc: ReturnType<typeof createServiceClient<any>>
let companyId: string
let userId: string
let groupId: string

const ts = Date.now()

beforeAll(async () => {
  if (!HAS_LOCAL_DB) return
  svc = createServiceClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const slug = `perm-override-${ts}`
  const { data: company, error: coErr } = await svc
    .from("companies")
    .insert({
      name: `Perm Test Override ${ts}`,
      legal_name: `Perm Test Override ${ts}`,
      slug,
      country: "CH",
      company_status: "active",
      subscription_tier: "starter",
      subscription_status: "trialing",
    })
    .select("id")
    .single()
  if (coErr ?? !company) throw new Error(`company insert: ${coErr?.message}`)
  companyId = company.id as string

  const email = `override-test-${ts}@test.bivro`
  const { data: authUser, error: userErr } = await svc.auth.admin.createUser({
    email,
    password: "Test!password123",
    email_confirm: true,
  })
  if (userErr ?? !authUser.user) throw new Error(`createUser: ${userErr?.message}`)
  userId = authUser.user.id

  const { error: profErr } = await svc.from("profiles").insert({
    id: userId,
    company_id: companyId,
    email,
    first_name: "Override",
    last_name: "Tester",
    role: "office",
    is_active: true,
  })
  if (profErr) throw new Error(`createProfile: ${profErr.message}`)

  const { data: group, error: grpErr } = await svc
    .from("permission_groups")
    .insert({ company_id: companyId, name: "Override Test Group", is_default: false })
    .select("id")
    .single()
  if (grpErr ?? !group) throw new Error(`createGroup: ${grpErr?.message}`)
  groupId = group.id as string

  const { error: assignErr } = await svc.from("permission_group_assignments").insert([
    { group_id: groupId, permission_key: "customers.view", company_id: companyId },
    { group_id: groupId, permission_key: "quotes.view", company_id: companyId },
  ])
  if (assignErr) throw new Error(`createAssignments: ${assignErr.message}`)

  const { error: memErr } = await svc
    .from("user_permission_groups")
    .insert({ user_id: userId, group_id: groupId, company_id: companyId })
  if (memErr) throw new Error(`createMembership: ${memErr.message}`)
})

afterAll(async () => {
  if (!HAS_LOCAL_DB || !companyId) return
  await svc.from("user_permission_overrides").delete().eq("company_id", companyId)
  await svc.from("user_permission_groups").delete().eq("company_id", companyId)
  await svc.from("permission_group_assignments").delete().eq("company_id", companyId)
  await svc.from("permission_groups").delete().eq("company_id", companyId)
  await svc.from("profiles").delete().eq("company_id", companyId)
  if (userId) await svc.auth.admin.deleteUser(userId)
  await svc.from("companies").delete().eq("id", companyId)
})

describeWithDb("Permission override resolution", () => {
  it("grant override adds a permission not in any group", async () => {
    await svc.from("user_permission_overrides").insert({
      user_id: userId,
      permission_key: "invoices.view",
      override_type: "grant",
      company_id: companyId,
    })

    const perms = await loadOfficePermissions(userId, companyId)
    expect(perms.keys.has("invoices.view")).toBe(true)
    expect(perms.keys.has("customers.view")).toBe(true)

    await svc
      .from("user_permission_overrides")
      .delete()
      .eq("user_id", userId)
      .eq("permission_key", "invoices.view")
      .eq("company_id", companyId)
  })

  it("deny override removes a permission granted by a group", async () => {
    await svc.from("user_permission_overrides").insert({
      user_id: userId,
      permission_key: "quotes.view",
      override_type: "deny",
      company_id: companyId,
    })

    const perms = await loadOfficePermissions(userId, companyId)
    expect(perms.keys.has("quotes.view")).toBe(false)
    expect(perms.keys.has("customers.view")).toBe(true)

    await svc
      .from("user_permission_overrides")
      .delete()
      .eq("user_id", userId)
      .eq("permission_key", "quotes.view")
      .eq("company_id", companyId)
  })

  it("deny override is absolute — wins even when group grants", async () => {
    await svc.from("user_permission_overrides").insert({
      user_id: userId,
      permission_key: "customers.view",
      override_type: "deny",
      company_id: companyId,
    })

    const perms = await loadOfficePermissions(userId, companyId)
    expect(perms.keys.has("customers.view")).toBe(false)

    await svc
      .from("user_permission_overrides")
      .delete()
      .eq("user_id", userId)
      .eq("permission_key", "customers.view")
      .eq("company_id", companyId)
  })

  it("grant override for user with no groups adds only that permission", async () => {
    const email2 = `grant-only-${ts}@test.bivro`
    const { data: authUser2, error: u2Err } = await svc.auth.admin.createUser({
      email: email2,
      password: "Test!password123",
      email_confirm: true,
    })
    if (u2Err ?? !authUser2.user) throw new Error(`createUser2: ${u2Err?.message}`)
    const userId2 = authUser2.user.id

    await svc.from("profiles").insert({
      id: userId2,
      company_id: companyId,
      email: email2,
      first_name: "Grant",
      last_name: "Only",
      role: "office",
      is_active: true,
    })

    await svc.from("user_permission_overrides").insert({
      user_id: userId2,
      permission_key: "leads.view",
      override_type: "grant",
      company_id: companyId,
    })

    const perms = await loadOfficePermissions(userId2, companyId)
    expect(perms.keys.size).toBe(1)
    expect(perms.keys.has("leads.view")).toBe(true)

    await svc.from("user_permission_overrides").delete().eq("user_id", userId2)
    await svc.from("profiles").delete().eq("id", userId2)
    await svc.auth.admin.deleteUser(userId2)
  })
})
