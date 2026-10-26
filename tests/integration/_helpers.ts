/**
 * Shared fixtures for integration tests: companies, users with a role and
 * explicit permissions, signed-in clients and tRPC callers that run the real
 * procedures (permission checks included) with a user's JWT.
 */
import { createClient } from "@supabase/supabase-js"
import type { SupabaseClient } from "@supabase/supabase-js"
import { appRouter } from "@/lib/trpc/router"
import { createCallerFactory } from "@/lib/trpc/init"
import type { Context } from "@/lib/trpc/context"
import { getJwtAppMetadata } from "@/lib/supabase/jwt"
import { invalidatePermissionCache } from "@/modules/iam/lib/permissions"

export const SUPABASE_URL = process.env["NEXT_PUBLIC_SUPABASE_URL"] ?? "http://127.0.0.1:54321"
export const ANON_KEY = process.env["NEXT_PUBLIC_SUPABASE_ANON_KEY"] ?? ""
export const SERVICE_ROLE_KEY = process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? ""
export const HAS_LOCAL_DB =
  SERVICE_ROLE_KEY.length > 0 && !SERVICE_ROLE_KEY.startsWith("placeholder") && ANON_KEY.length > 0

export const TEST_PASSWORD = "SecureTest99!"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Svc = SupabaseClient<any>

export function serviceClient(): Svc {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

export async function createTestCompany(svc: Svc, slug: string): Promise<string> {
  const { data, error } = await svc
    .from("companies")
    .insert({
      name: `Test ${slug}`,
      legal_name: `Test ${slug} GmbH`,
      slug,
      country: "CH",
      company_status: "active",
      subscription_tier: "starter",
      subscription_status: "trialing",
    })
    .select("id")
    .single()
  if (error || !data) throw new Error(`createTestCompany: ${error?.message}`)
  return data.id as string
}

export interface TestUser {
  id: string
  email: string
  companyId: string
  role: "owner" | "office"
}

/** Creates an auth user + profile. Office users get exactly `permissions` (as grant overrides). */
export async function createTestUser(
  svc: Svc,
  opts: { email: string; companyId: string; role: "owner" | "office"; permissions?: string[] },
): Promise<TestUser> {
  const { data, error } = await svc.auth.admin.createUser({
    email: opts.email,
    email_confirm: true,
    password: TEST_PASSWORD,
  })
  if (error || !data.user) throw new Error(`createUser: ${error?.message}`)
  const id = data.user.id

  const { error: profErr } = await svc.from("profiles").insert({
    id,
    company_id: opts.companyId,
    role: opts.role,
    email: opts.email,
    first_name: "Test",
    last_name: opts.role === "owner" ? "Owner" : "Office",
    is_active: true,
  })
  if (profErr) throw new Error(`createProfile: ${profErr.message}`)

  if (opts.role === "office" && opts.permissions?.length) {
    const { error: permErr } = await svc.from("user_permission_overrides").insert(
      opts.permissions.map((key) => ({
        company_id: opts.companyId,
        user_id: id,
        permission_key: key,
        override_type: "grant",
      })),
    )
    if (permErr) throw new Error(`grant permissions: ${permErr.message}`)
  }
  invalidatePermissionCache(id, opts.companyId)

  return { id, email: opts.email, companyId: opts.companyId, role: opts.role }
}

export async function signIn(email: string): Promise<Svc> {
  const client = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { error } = await client.auth.signInWithPassword({ email, password: TEST_PASSWORD })
  if (error) throw new Error(`Sign-in failed for ${email}: ${error.message}`)
  return client
}

/** A tRPC caller acting as `user` — the same procedures, permission checks and RLS as the app. */
export async function callerFor(user: TestUser) {
  const supabase = await signIn(user.email)
  const {
    data: { session },
  } = await supabase.auth.getSession()
  const meta = getJwtAppMetadata(session?.access_token)
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser()

  const ctx = {
    supabase,
    user: authUser,
    companyId: meta["company_id"] as string | undefined,
    role: meta["role"] as "owner" | "office" | undefined,
    companyStatus: meta["company_status"] as string | undefined,
  } as unknown as Context

  return createCallerFactory(appRouter)(ctx)
}

/** Removes a test company and everything the tests created in it. */
export async function cleanupCompany(svc: Svc, companyId: string, userIds: string[]) {
  for (const table of [
    "tasks",
    "job_assignments",
    "jobs",
    "quote_items",
    "quotes",
    "leads",
    "customers",
    "rate_cards",
    "service_catalog",
    "activity_logs",
    "user_permission_overrides",
  ]) {
    await svc.from(table).delete().eq("company_id", companyId)
  }
  await svc.from("profiles").delete().in("id", userIds)
  await svc.from("companies").delete().eq("id", companyId)
  for (const id of userIds) await svc.auth.admin.deleteUser(id)
}
