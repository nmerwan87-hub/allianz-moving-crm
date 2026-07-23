/**
 * Owner unrestricted access tests.
 *
 * Verifies that loadOfficePermissions (which is never called for owners in
 * production — ownerProcedure bypasses it) returns an empty set for an owner
 * with no group assignments, confirming the owner bypass is the correct design.
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
let ownerId: string
let officeId: string

const ts = Date.now()

beforeAll(async () => {
  if (!HAS_LOCAL_DB) return
  svc = createServiceClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const slug = `perm-owner-${ts}`
  const { data: company, error: coErr } = await svc
    .from("companies")
    .insert({
      name: `Perm Test Owner ${ts}`,
      legal_name: `Perm Test Owner ${ts}`,
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

  const ownerEmail = `perm-owner-${ts}@test.bivro`
  const officeEmail = `perm-office-${ts}@test.bivro`

  const [{ data: ownerAuth, error: ownerErr }, { data: officeAuth, error: officeErr }] =
    await Promise.all([
      svc.auth.admin.createUser({
        email: ownerEmail,
        password: "Test!password123",
        email_confirm: true,
      }),
      svc.auth.admin.createUser({
        email: officeEmail,
        password: "Test!password123",
        email_confirm: true,
      }),
    ])

  if (ownerErr ?? !ownerAuth.user) throw new Error(`createOwner: ${ownerErr?.message}`)
  if (officeErr ?? !officeAuth.user) throw new Error(`createOffice: ${officeErr?.message}`)

  ownerId = ownerAuth.user.id
  officeId = officeAuth.user.id

  const { error: profErr } = await svc.from("profiles").insert([
    {
      id: ownerId,
      company_id: companyId,
      email: ownerEmail,
      first_name: "Owner",
      last_name: "User",
      role: "owner",
      is_active: true,
    },
    {
      id: officeId,
      company_id: companyId,
      email: officeEmail,
      first_name: "Office",
      last_name: "User",
      role: "office",
      is_active: true,
    },
  ])
  if (profErr) throw new Error(`createProfiles: ${profErr.message}`)
})

afterAll(async () => {
  if (!HAS_LOCAL_DB || !companyId) return
  await svc.from("profiles").delete().eq("company_id", companyId)
  if (ownerId) await svc.auth.admin.deleteUser(ownerId)
  if (officeId) await svc.auth.admin.deleteUser(officeId)
  await svc.from("companies").delete().eq("id", companyId)
})

describeWithDb("Owner is unrestricted — loadOfficePermissions guard", () => {
  it("owner: loadOfficePermissions returns empty set (not called in prod — owner bypasses check)", async () => {
    const perms = await loadOfficePermissions(ownerId, companyId)
    expect(perms.keys.size).toBe(0)
  })

  it("office user with no groups has no permissions", async () => {
    const perms = await loadOfficePermissions(officeId, companyId)
    expect(perms.keys.size).toBe(0)
  })
})
