/* eslint-disable no-console */
/**
 * LOCAL DEVELOPMENT SEED — DO NOT RUN IN PRODUCTION.
 *
 * Creates a demo owner account and active company for local development.
 * Uses the Supabase Admin API for auth user creation (GoTrue, works for any role)
 * and the postgres DB URL directly for company/profile INSERT (bypasses service_role
 * DML restriction that exists because migrations ran as postgres, not supabase_admin).
 *
 * Credentials (local only):
 *   Email:    owner@bivro.local
 *   Password: BivroLocal123!
 *   Company:  Bivro Demo Company
 *
 * Usage:
 *   npx tsx supabase/seed-local.ts
 *
 * Requires: local Supabase running (npx supabase start)
 */

import { createClient } from "@supabase/supabase-js"
import { execSync } from "child_process"
import { writeFileSync, unlinkSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"

const SUPABASE_URL = "http://127.0.0.1:54321"
// Local dev service role key — standard Supabase local JWT, not a production credential
const SERVICE_ROLE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU"
const DB_URL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres"

const SEED_EMAIL = "owner@bivro.local"
const SEED_PASSWORD = "BivroLocal123!"
const SEED_COMPANY_NAME = "Bivro Demo Company"
const SEED_COMPANY_SLUG = "bivro-demo"

// Service role client — used only for GoTrue Admin API (auth user creation)
// GoTrue API calls go through port 54321 auth service, NOT through PostgREST
const svc = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

/** Run SQL as the postgres superuser (bypasses PostgREST / service_role restrictions) */
function runSql(sql: string): void {
  const tmpFile = join(tmpdir(), `bivro-seed-${Date.now()}.sql`)
  writeFileSync(tmpFile, sql, "utf8")
  try {
    execSync(`npx supabase db query --db-url "${DB_URL}" --file "${tmpFile}"`, {
      stdio: "pipe",
    })
  } finally {
    try {
      unlinkSync(tmpFile)
    } catch {
      /* ignore */
    }
  }
}

async function run() {
  console.log("🌱 Seeding local development data…\n")

  // ── 1. Clean up stale seed data ────────────────────────────────────────────
  console.log("  Removing stale seed data…")

  // Even if service_role can't INSERT, SELECT works via the hook (BYPASSRLS)
  // Actually SELECT also fails without explicit GRANT. Use db query instead.
  const existingProfilesResult = execSync(
    `npx supabase db query --db-url "${DB_URL}" "SELECT id FROM public.profiles WHERE email = '${SEED_EMAIL}';"`,
    { stdio: "pipe" },
  ).toString()

  // Parse existing user IDs
  let existingIds: string[] = []
  try {
    const parsed = JSON.parse(existingProfilesResult) as { rows?: Array<{ id: string }> }
    existingIds = parsed.rows?.map((r) => r.id) ?? []
  } catch {
    existingIds = []
  }

  for (const userId of existingIds) {
    const { error } = await svc.auth.admin.deleteUser(userId)
    if (!error) console.log(`  Deleted auth user: ${userId}`)
  }

  runSql(`DELETE FROM public.companies WHERE slug = '${SEED_COMPANY_SLUG}';`)
  console.log("  Cleaned stale data.")

  // ── 2. Create auth user via GoTrue Admin API ───────────────────────────────
  console.log(`\n  Creating auth user: ${SEED_EMAIL}`)
  const { data: authData, error: authError } = await svc.auth.admin.createUser({
    email: SEED_EMAIL,
    password: SEED_PASSWORD,
    email_confirm: true,
    user_metadata: { first_name: "Demo", last_name: "Owner" },
  })

  if (authError ?? !authData.user) {
    console.error("  ✗ Failed to create auth user:", authError?.message)
    process.exit(1)
  }

  const userId = authData.user!.id
  console.log(`  ✓ Auth user: ${userId}`)

  // ── 3. Create company via postgres connection ──────────────────────────────
  console.log(`\n  Creating company: ${SEED_COMPANY_NAME}`)
  const trialEndsAt = new Date()
  trialEndsAt.setDate(trialEndsAt.getDate() + 90)

  runSql(`
    INSERT INTO public.companies (
      name, legal_name, slug, country,
      company_status, subscription_tier, subscription_status, trial_ends_at
    ) VALUES (
      '${SEED_COMPANY_NAME}',
      '${SEED_COMPANY_NAME}',
      '${SEED_COMPANY_SLUG}',
      'CH',
      'active',
      'pro',
      'trialing',
      '${trialEndsAt.toISOString()}'
    );
  `)

  const companyResult = execSync(
    `npx supabase db query --db-url "${DB_URL}" "SELECT id FROM public.companies WHERE slug = '${SEED_COMPANY_SLUG}';"`,
    { stdio: "pipe" },
  ).toString()

  const companyParsed = JSON.parse(companyResult) as { rows?: Array<{ id: string }> }
  const companyId = companyParsed.rows?.[0]?.id

  if (!companyId) {
    console.error("  ✗ Could not retrieve company ID after INSERT")
    await svc.auth.admin.deleteUser(userId)
    process.exit(1)
  }

  console.log(`  ✓ Company: ${companyId}`)

  // ── 4. Create owner profile via postgres connection ────────────────────────
  console.log("\n  Creating owner profile…")
  runSql(`
    INSERT INTO public.profiles (
      id, company_id, role, first_name, last_name, email, is_active
    ) VALUES (
      '${userId}',
      '${companyId}',
      'owner',
      'Demo',
      'Owner',
      '${SEED_EMAIL}',
      true
    );
  `)

  console.log("  ✓ Profile created")

  // ── 5. Verify ──────────────────────────────────────────────────────────────
  console.log("\n  Verifying seed data…")

  const profileVerify = JSON.parse(
    execSync(
      `npx supabase db query --db-url "${DB_URL}" "SELECT company_id, role, is_active FROM public.profiles WHERE id = '${userId}';"`,
      { stdio: "pipe" },
    ).toString(),
  ) as { rows?: Array<{ company_id: string; role: string; is_active: boolean }> }

  const companyVerify = JSON.parse(
    execSync(
      `npx supabase db query --db-url "${DB_URL}" "SELECT company_status, subscription_tier FROM public.companies WHERE id = '${companyId}';"`,
      { stdio: "pipe" },
    ).toString(),
  ) as { rows?: Array<{ company_status: string; subscription_tier: string }> }

  const pRow = profileVerify.rows?.[0]
  const cRow = companyVerify.rows?.[0]

  console.log(
    `  ✓ Profile: role=${pRow?.role}, is_active=${pRow?.is_active}, company_id=${pRow?.company_id}`,
  )
  console.log(`  ✓ Company: status=${cRow?.company_status}, tier=${cRow?.subscription_tier}`)

  const { data: authVerify } = await svc.auth.admin.getUserById(userId)
  console.log(`  ✓ Auth: email_confirmed=${authVerify.user?.email_confirmed_at ? "yes" : "no"}`)
  console.log(
    "  ✓ JWT hook: pg-functions://postgres/public/custom_access_token_hook (registered in config.toml)",
  )

  // ── 6. Summary ─────────────────────────────────────────────────────────────
  console.log("\n" + "─".repeat(58))
  console.log("✅  Local seed complete\n")
  console.log("  Email:       owner@bivro.local")
  console.log("  Password:    BivroLocal123!")
  console.log("  Company:     Bivro Demo Company")
  console.log("  Status:      active")
  console.log("  Role:        owner")
  console.log("  User ID:     " + userId)
  console.log("  Company ID:  " + companyId)
  console.log("\n  Login at:   http://localhost:3000/login")
  console.log("  Redirects → http://localhost:3000/dashboard")
  console.log("─".repeat(58))
}

run().catch((err: unknown) => {
  console.error("Seed failed:", err)
  process.exit(1)
})
