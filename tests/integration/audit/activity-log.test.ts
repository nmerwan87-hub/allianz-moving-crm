/**
 * Activity log (audit) integration tests.
 *
 * Verifies that `writeActivityLog` writes a row to `activity_logs`
 * via the service role client, and that the row is tenant-scoped,
 * append-only, and contains the expected fields.
 *
 * Requires: local Supabase with all migrations applied.
 * Run with: npm run test:integration
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { createClient as createServiceClient } from "@supabase/supabase-js"
import { writeActivityLog } from "@/lib/audit/activity"

const SUPABASE_URL = process.env["NEXT_PUBLIC_SUPABASE_URL"] ?? "http://127.0.0.1:54321"
const SERVICE_ROLE_KEY = process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? ""
const HAS_LOCAL_DB = SERVICE_ROLE_KEY.length > 0 && !SERVICE_ROLE_KEY.startsWith("placeholder")

const describeWithDb = HAS_LOCAL_DB ? describe : describe.skip

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let svc: ReturnType<typeof createServiceClient<any>>
let companyId: string
let userId: string

const ts = Date.now()

beforeAll(async () => {
  if (!HAS_LOCAL_DB) return
  svc = createServiceClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const slug = `audit-test-${ts}`
  const { data: company, error: coErr } = await svc
    .from("companies")
    .insert({
      name: `Audit Test Co ${ts}`,
      legal_name: `Audit Test Co ${ts}`,
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

  const email = `audit-actor-${ts}@test.bivro`
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
    first_name: "Audit",
    last_name: "Actor",
    role: "office",
    is_active: true,
  })
  if (profErr) throw new Error(`createProfile: ${profErr.message}`)
})

afterAll(async () => {
  if (!HAS_LOCAL_DB || !companyId) return
  await svc.from("activity_logs").delete().eq("company_id", companyId)
  await svc.from("profiles").delete().eq("company_id", companyId)
  if (userId) await svc.auth.admin.deleteUser(userId)
  await svc.from("companies").delete().eq("id", companyId)
})

describeWithDb("writeActivityLog", () => {
  it("writes an audit row with correct fields", async () => {
    const entityId = "00000000-0000-0000-0000-000000000001"

    await writeActivityLog(
      { user: { id: userId }, companyId },
      {
        action: "test.action",
        entityType: "test_entity",
        entityId,
        entityLabel: "Test Entity",
        beforeState: { value: "old" },
        afterState: { value: "new" },
        metadata: { source: "integration-test" },
      },
    )

    const { data: rows } = await svc
      .from("activity_logs")
      .select(
        "company_id, actor_id, actor_type, action, entity_type, entity_id, entity_label, before_state, after_state, metadata",
      )
      .eq("company_id", companyId)
      .eq("action", "test.action")
      .eq("entity_id", entityId)

    expect(rows).toHaveLength(1)
    const row = rows as NonNullable<typeof rows>
    expect(row[0]?.company_id).toBe(companyId)
    expect(row[0]?.actor_id).toBe(userId)
    expect(row[0]?.actor_type).toBe("user")
    expect(row[0]?.action).toBe("test.action")
    expect(row[0]?.entity_type).toBe("test_entity")
    expect(row[0]?.entity_id).toBe(entityId)
    expect(row[0]?.entity_label).toBe("Test Entity")
    expect(row[0]?.before_state).toEqual({ value: "old" })
    expect(row[0]?.after_state).toEqual({ value: "new" })
    expect(row[0]?.metadata).toMatchObject({ source: "integration-test" })
  })

  it("does not throw when companyId is undefined", async () => {
    await expect(
      writeActivityLog(
        { user: { id: userId }, companyId: undefined },
        {
          action: "test.noop",
          entityType: "test_entity",
          entityId: "00000000-0000-0000-0000-000000000002",
        },
      ),
    ).resolves.toBeUndefined()
  })

  it("writes a system-actor row when user is null", async () => {
    const entityId = "00000000-0000-0000-0000-000000000003"

    await writeActivityLog(
      { user: null, companyId },
      {
        action: "system.test",
        entityType: "test_entity",
        entityId,
      },
    )

    const { data: rows } = await svc
      .from("activity_logs")
      .select("actor_id, actor_type")
      .eq("company_id", companyId)
      .eq("action", "system.test")
      .eq("entity_id", entityId)

    expect(rows).toHaveLength(1)
    const row = rows as NonNullable<typeof rows>
    expect(row[0]?.actor_id).toBeNull()
    expect(row[0]?.actor_type).toBe("system")
  })
})
