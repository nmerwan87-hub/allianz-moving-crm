/**
 * Office user permission resolution tests.
 *
 * Verifies that `loadOfficePermissions` correctly computes the effective
 * permission set for an office user by unioning group permissions.
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

  const slug = `perm-office-${ts}`
  const { data: company, error: coErr } = await svc
    .from("companies")
    .insert({
      name: `Perm Test Office ${ts}`,
      legal_name: `Perm Test Office ${ts}`,
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

  const email = `office-test-${ts}@test.bivro`
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
    first_name: "Office",
    last_name: "Tester",
    role: "office",
    is_active: true,
  })
  if (profErr) throw new Error(`createProfile: ${profErr.message}`)

  const { data: group, error: grpErr } = await svc
    .from("permission_groups")
    .insert({ company_id: companyId, name: "Test Group", is_default: false })
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
  await svc.from("user_permission_groups").delete().eq("company_id", companyId)
  await svc.from("permission_group_assignments").delete().eq("company_id", companyId)
  await svc.from("permission_groups").delete().eq("company_id", companyId)
  await svc.from("profiles").delete().eq("company_id", companyId)
  if (userId) await svc.auth.admin.deleteUser(userId)
  await svc.from("companies").delete().eq("id", companyId)
})

describeWithDb("loadOfficePermissions — office user group membership", () => {
  it("returns only the permissions assigned to the user's group", async () => {
    const perms = await loadOfficePermissions(userId, companyId)
    expect(perms.keys.has("customers.view")).toBe(true)
    expect(perms.keys.has("quotes.view")).toBe(true)
    expect(perms.keys.has("invoices.view")).toBe(false)
  })

  it("returns an empty set for a user with no groups and no overrides", async () => {
    const email2 = `office-nogroup-${ts}@test.bivro`
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
      first_name: "No",
      last_name: "Group",
      role: "office",
      is_active: true,
    })

    const perms = await loadOfficePermissions(userId2, companyId)
    expect(perms.keys.size).toBe(0)

    await svc.from("profiles").delete().eq("id", userId2)
    await svc.auth.admin.deleteUser(userId2)
  })
})
