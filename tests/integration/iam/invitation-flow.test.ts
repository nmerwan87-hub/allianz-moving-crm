/**
 * Team invitation end to end — what the owner does in «Team und Rechte».
 *
 * Tests cover:
 *   - the owner gets the invite link back (to pass on when no e-mail goes out)
 *   - open invitations are listed for the owner only
 *   - the link works once: the invited person sets name and password and
 *     becomes an office member of exactly this company with the chosen group
 *   - revoked invitations stop working
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { createClient } from "@supabase/supabase-js"
import { provisionCompany } from "@/modules/iam/lib/provisioning"
import { createCallerFactory } from "@/lib/trpc/init"
import { appRouter } from "@/lib/trpc/router"
import type { Context } from "@/lib/trpc/context"
import {
  HAS_LOCAL_DB,
  SUPABASE_URL,
  ANON_KEY,
  serviceClient,
  createTestCompany,
  createTestUser,
  callerFor,
  cleanupCompany,
  type Svc,
  type TestUser,
} from "../_helpers"

const describeWithDb = HAS_LOCAL_DB ? describe : describe.skip
const ts = Date.now()

let svc: Svc
let companyId: string
let owner: TestUser
let groupId: string
const invitedEmail = `invited-${ts}@bivro-test.dev`
let invitedUserId: string | null = null

function anonymousCaller() {
  const supabase = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  return createCallerFactory(appRouter)({ supabase, user: null } as unknown as Context)
}

describeWithDb("Team invitation", () => {
  beforeAll(async () => {
    svc = serviceClient()
    companyId = await createTestCompany(svc, `invite-${ts}`)
    await provisionCompany(companyId)
    owner = await createTestUser(svc, {
      email: `invite-owner-${ts}@bivro-test.dev`,
      companyId,
      role: "owner",
    })
    const groups = await (await callerFor(owner)).iam.permissionGroups.list()
    groupId = groups[0]!.id
  })

  afterAll(async () => {
    await cleanupCompany(svc, companyId, [owner.id, ...(invitedUserId ? [invitedUserId] : [])])
  })

  let token: string

  it("returns the link to the owner and lists the open invitation", async () => {
    const caller = await callerFor(owner)
    const result = await caller.iam.inviteUser({
      email: invitedEmail,
      permissionGroupIds: [groupId],
    })
    expect(result.inviteUrl).toMatch(/\/invite\/[A-Za-z0-9_-]+$/)
    expect(typeof result.emailSent).toBe("boolean")
    token = result.inviteUrl.split("/invite/")[1]!

    const open = await caller.iam.listInvitations()
    expect(open.map((i) => i.email)).toContain(invitedEmail)
  })

  it("lets the invited person join with name and password", async () => {
    const lookup = await anonymousCaller().iam.lookupInvitation({ rawToken: token })
    expect(lookup).toMatchObject({ valid: true })

    await anonymousCaller().iam.acceptInvitation({
      rawToken: token,
      firstName: "Lea",
      lastName: "Büro",
      password: "Sicher-Passwort-2026!",
    })

    const { data: profile } = await svc
      .from("profiles")
      .select("id, company_id, role, first_name")
      .ilike("email", invitedEmail)
      .single()
    invitedUserId = profile!.id as string
    expect(profile).toMatchObject({ company_id: companyId, role: "office", first_name: "Lea" })

    const { data: groups } = await svc
      .from("user_permission_groups")
      .select("group_id")
      .eq("user_id", invitedUserId)
    expect(groups?.map((g) => g.group_id)).toContain(groupId)

    expect(await (await callerFor(owner)).iam.listInvitations()).toEqual([])
    await expect(
      anonymousCaller().iam.acceptInvitation({
        rawToken: token,
        firstName: "Lea",
        lastName: "Büro",
        password: "Sicher-Passwort-2026!",
      }),
    ).rejects.toThrow()
  })

  it("stops a revoked invitation", async () => {
    const caller = await callerFor(owner)
    const { inviteUrl, invitationId } = await caller.iam.inviteUser({
      email: `revoked-${ts}@bivro-test.dev`,
      permissionGroupIds: [],
    })
    await caller.iam.revokeInvitation({ invitationId })
    const lookup = await anonymousCaller().iam.lookupInvitation({
      rawToken: inviteUrl.split("/invite/")[1]!,
    })
    expect(lookup.valid).toBe(false)
  })
})
