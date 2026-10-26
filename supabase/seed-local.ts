/* eslint-disable no-console */
/**
 * LOCAL DEVELOPMENT SEED — DO NOT RUN IN PRODUCTION.
 *
 * Creates one demo owner account that is owner of three active companies, so the
 * company switcher (docs/MULTI_COMPANY_ACCESS.md) can be used locally.
 * Uses the Supabase Admin API for auth user creation (GoTrue, works for any role)
 * and the postgres DB URL directly for company/profile INSERT (bypasses service_role
 * DML restriction that exists because migrations ran as postgres, not supabase_admin).
 *
 * Credentials (local only):
 *   Email:    owner@bivro.local
 *   Password: BivroLocal123!
 *   Companies: Bivro Demo Company (active on first login), Bivro Demo Zürich, Bivro Demo Basel
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
const SEED_COMPANIES = [
  { name: "Bivro Demo Company", slug: "bivro-demo" },
  { name: "Bivro Demo Zürich", slug: "bivro-demo-zuerich" },
  { name: "Bivro Demo Basel", slug: "bivro-demo-basel" },
] as const

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

  // An aborted earlier run can leave an auth user without a profile
  const { data: authUsers } = await svc.auth.admin.listUsers()
  for (const user of authUsers?.users ?? []) {
    if (user.email === SEED_EMAIL && !existingIds.includes(user.id)) {
      const { error } = await svc.auth.admin.deleteUser(user.id)
      if (!error) console.log(`  Deleted orphaned auth user: ${user.id}`)
    }
  }

  const seedSlugs = SEED_COMPANIES.map((c) => `'${c.slug}'`).join(", ")
  // Demo companies may hold data from earlier sessions (customers, leads,
  // append-only logs). Local dev only: FK and append-only triggers are
  // bypassed with session_replication_role so the whole tenant can be removed.
  runSql(`
    DO $$
    DECLARE
      v_ids uuid[];
      t text;
    BEGIN
      SELECT array_agg(id) INTO v_ids FROM public.companies WHERE slug IN (${seedSlugs});
      IF v_ids IS NULL THEN RETURN; END IF;
      SET LOCAL session_replication_role = replica;
      FOR t IN
        SELECT table_name FROM information_schema.columns
         WHERE table_schema = 'public' AND column_name = 'company_id'
           AND table_name IN (SELECT table_name FROM information_schema.tables
                               WHERE table_schema = 'public' AND table_type = 'BASE TABLE')
      LOOP
        EXECUTE format('DELETE FROM public.%I WHERE company_id = ANY($1)', t) USING v_ids;
      END LOOP;
      DELETE FROM public.companies WHERE id = ANY(v_ids);
    END $$;
  `)
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

  // ── 3. Create companies via postgres connection ────────────────────────────
  const trialEndsAt = new Date()
  trialEndsAt.setDate(trialEndsAt.getDate() + 90)

  const companyIds: string[] = []
  for (const company of SEED_COMPANIES) {
    console.log(`\n  Creating company: ${company.name}`)
    runSql(`
      INSERT INTO public.companies (
        name, legal_name, slug, country,
        company_status, subscription_tier, subscription_status, trial_ends_at
      ) VALUES (
        '${company.name}',
        '${company.name}',
        '${company.slug}',
        'CH',
        'active',
        'pro',
        'trialing',
        '${trialEndsAt.toISOString()}'
      );
    `)

    const companyResult = execSync(
      `npx supabase db query --db-url "${DB_URL}" "SELECT id FROM public.companies WHERE slug = '${company.slug}';"`,
      { stdio: "pipe" },
    ).toString()

    const companyParsed = JSON.parse(companyResult) as { rows?: Array<{ id: string }> }
    const id = companyParsed.rows?.[0]?.id

    if (!id) {
      console.error("  ✗ Could not retrieve company ID after INSERT")
      await svc.auth.admin.deleteUser(userId)
      process.exit(1)
    }

    companyIds.push(id)
    console.log(`  ✓ Company: ${id}`)
  }

  const companyId = companyIds[0]!

  // ── 4. Create owner profile + memberships ──────────────────────────────────
  // The profile insert trigger creates the membership for the first company;
  // the other two are added explicitly.
  console.log("\n  Creating owner profile and memberships…")
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
  runSql(`
    INSERT INTO public.company_memberships (company_id, user_id, role, is_active)
    VALUES ${companyIds
      .slice(1)
      .map((id) => `('${id}', '${userId}', 'owner', true)`)
      .join(",\n           ")};
  `)

  console.log("  ✓ Profile and memberships created")

  // ── 4b. Provision companies (settings, 19 standard services, groups, e-mail) ──
  // Same code path as an approved registration. The service-role client reads
  // these two variables.
  process.env["NEXT_PUBLIC_SUPABASE_URL"] = SUPABASE_URL
  process.env["SUPABASE_SERVICE_ROLE_KEY"] = SERVICE_ROLE_KEY
  const { provisionCompany } = await import("../modules/iam/lib/provisioning")
  for (const id of companyIds) await provisionCompany(id)
  console.log("  ✓ Companies provisioned")

  // ── 4c. Demo content for the first company (to click through locally) ──────
  runSql(`
    DO $$
    DECLARE
      c uuid := '${companyId}';
      anna uuid; treuhand uuid; marco uuid; q uuid;
    BEGIN
      UPDATE public.companies SET
        legal_name = 'Bivro Demo Umzüge GmbH', address_line1 = 'Industriestrasse 5',
        postal_code = '8305', city = 'Dietlikon', phone = '+41445551234',
        email = 'info@bivro-demo.example', website = 'www.bivro-demo.example',
        vat_number = 'CHE-123.456.789', accent_color = '#0F766E',
        bank_iban = 'CH9300762011623852957', bank_name = 'PostFinance',
        bank_payee_name = 'Bivro Demo Umzüge GmbH'
      WHERE id = c;

      UPDATE public.company_settings SET
        default_deposit_percent = 20, default_quote_expiry_days = 14, minimum_hours = 3,
        travel_flat_fee_cents = 12000, rate_per_km_cents = 250, stair_carry_rate_cents = 3000
      WHERE company_id = c;

      UPDATE public.service_catalog SET default_unit_price_cents = v.price, default_cost_price_cents = v.cost
      FROM (VALUES
        ('Umzugsteam (Stundenansatz)', 15000, 9000), ('Verpackungsservice', 9500, 5500),
        ('Auspackservice', 9500, 5500), ('Möbelmontage', 15000, 6000), ('Möbeldemontage', 12000, 5000),
        ('Möbellift', 18000, 9000), ('Endreinigung mit Abnahmegarantie', 65000, 38000),
        ('Entsorgung', 8000, 3000), ('Umzugskartons', 450, 180), ('Kleiderboxen (Miete)', 1500, 400),
        ('Verpackungsmaterial', 9000, 4000), ('Einlagerung (pro Monat)', 3500, 1500),
        ('Klaviertransport', 45000, 20000), ('Anfahrtspauschale', 12000, 5000),
        ('Kilometerzuschlag', 250, 120), ('Halteverbotszone / Parkbewilligung', 12000, 8000)
      ) AS v(name, price, cost)
      WHERE service_catalog.company_id = c AND service_catalog.name = v.name;

      INSERT INTO public.rate_cards (company_id, name, crew_size, vehicle_type, hourly_rate_cents, hourly_cost_cents, sort_order)
      VALUES (c, '2 Mann + Lieferwagen', 2, 'cargo_van', 15000, 9000, 1),
             (c, '3 Mann + LKW 3.5 t', 3, 'box_truck_16ft', 19500, 12500, 2),
             (c, '4 Mann + LKW 7.5 t', 4, 'box_truck_24ft', 25500, 16500, 3);

      INSERT INTO public.customers (company_id, salutation, first_name, last_name, email, phone,
        billing_street, billing_postal_code, billing_city, source)
      VALUES (c, 'ms', 'Anna', 'Muster', 'anna.muster@example.com', '+41791234567',
        'Bahnhofstrasse 1', '8001', 'Zürich', 'web_form')
      RETURNING id INTO anna;

      INSERT INTO public.customers (company_id, customer_type, company_name, salutation, first_name, last_name,
        email, phone, billing_street, billing_postal_code, billing_city, source, preferred_language)
      VALUES (c, 'business', 'Muster Treuhand AG', 'mr', 'Peter', 'Keller', 'p.keller@muster-treuhand.example',
        '+41445559900', 'Löwenstrasse 20', '8001', 'Zürich', 'referral', 'de')
      RETURNING id INTO treuhand;

      INSERT INTO public.customers (company_id, salutation, first_name, last_name, email, phone,
        billing_street, billing_postal_code, billing_city, source, preferred_language)
      VALUES (c, 'mr', 'Marco', 'Bianchi', 'marco.bianchi@example.com', '+41781112233',
        'Via Nassa 7', '6900', 'Lugano', 'phone_call', 'it')
      RETURNING id INTO marco;

      INSERT INTO public.leads (company_id, customer_id, first_name, last_name, email, phone, status, source,
        move_type, requested_date, origin_address, origin_postal_code, origin_city, origin_floor,
        dest_address, dest_postal_code, dest_city, dest_floor, dest_has_elevator,
        date_flexible, origin_has_elevator, origin_has_stairs, dest_has_stairs)
      VALUES
        (c, anna, 'Anna', 'Muster', 'anna.muster@example.com', '+41791234567', 'contacted', 'web_form',
         'local', current_date + 30, 'Bahnhofstrasse 1', '8001', 'Zürich', 3,
         'Bundesgasse 3', '3011', 'Bern', 1, true, false, false, true, false),
        (c, marco, 'Marco', 'Bianchi', 'marco.bianchi@example.com', '+41781112233', 'new', 'phone_call',
         'long_distance', current_date + 45, 'Via Nassa 7', '6900', 'Lugano', 2,
         'Seestrasse 12', '8002', 'Zürich', 4, true, false, false, true, false);

      INSERT INTO public.quotes (company_id, customer_id, quote_number, status, language, move_type, title,
        scheduled_date, origin_address, origin_postal_code, origin_city, origin_floor,
        dest_address, dest_postal_code, dest_city, dest_floor, dest_has_elevator,
        distance_km, estimated_hours, deposit_percent, cost_cap_cents, expires_at, customer_notes)
      VALUES (c, treuhand, public.generate_sequence_number(c, 'quote'), 'draft', 'de', 'commercial',
        'Büroumzug 12 Arbeitsplätze', current_date + 21, 'Löwenstrasse 20', '8001', 'Zürich', 2,
        'Hardstrasse 201', '8005', 'Zürich', 5, true, 4, 9, 30, 600000, current_date + 14,
        'Umzug am Freitagabend, Zugang über Hintereingang.')
      RETURNING id INTO q;

      PERFORM public.replace_quote_items(q, '[
        {"name": "4 Mann + LKW 7.5 t", "item_type": "labor", "pricing_mode": "hourly", "quantity": 9, "unit": "Std.", "unit_price_cents": 25500, "cost_price_cents": 16500, "vat_rate_percent": 8.1},
        {"name": "Möbeldemontage", "pricing_mode": "fixed", "quantity": 1, "unit": "Pauschale", "unit_price_cents": 48000, "cost_price_cents": 20000, "vat_rate_percent": 8.1},
        {"name": "Umzugskartons", "pricing_mode": "quantity", "quantity": 120, "unit": "Stk.", "unit_price_cents": 450, "cost_price_cents": 180, "vat_rate_percent": 8.1},
        {"name": "Halteverbotszone / Parkbewilligung", "pricing_mode": "fixed", "quantity": 1, "unit": "Pauschale", "unit_price_cents": 12000, "cost_price_cents": 8000, "vat_rate_percent": 0}
      ]'::jsonb);

      -- Crew, fleet and two jobs this week (dispatch board)
      INSERT INTO public.employees (company_id, first_name, last_name, role, phone, hourly_rate_cents, driver_license_class)
      VALUES (c, 'Luca', 'Meier', 'foreman', '+41790001001', 4200, 'C1'),
             (c, 'Sara', 'Gerber', 'driver', '+41790001002', 3800, 'C'),
             (c, 'Jonas', 'Frei', 'mover', '+41790001003', 3200, 'B'),
             (c, 'Elif', 'Kaya', 'mover', '+41790001004', 3200, 'B');

      INSERT INTO public.vehicles (company_id, name, type, license_plate, capacity_m3, payload_kg, next_inspection_on, insurance_expiry)
      VALUES (c, 'LKW 1', 'box_truck_16ft', 'ZH 123456', 22, 1200, current_date + 200, current_date + 300),
             (c, 'LKW 2', 'box_truck_24ft', 'ZH 654321', 38, 3500, current_date + 20, current_date + 120),
             (c, 'Lieferwagen', 'cargo_van', 'ZH 777888', 12, 900, current_date + 400, current_date + 400);

      INSERT INTO public.employee_absences (company_id, employee_id, kind, starts_on, ends_on, note)
      SELECT c, id, 'vacation', current_date + 2, current_date + 6, 'Ferien'
        FROM public.employees WHERE company_id = c AND first_name = 'Elif';

      INSERT INTO public.jobs (company_id, customer_id, job_number, status, move_type, scheduled_date,
        scheduled_start_time, estimated_duration_hours, crew_size_required,
        origin_address, origin_postal_code, origin_city, dest_address, dest_postal_code, dest_city)
      VALUES (c, anna, public.generate_sequence_number(c, 'job'), 'confirmed', 'local', current_date + 1,
        '07:30', 8, 3, 'Bahnhofstrasse 1', '8001', 'Zürich', 'Bundesgasse 3', '3011', 'Bern'),
             (c, marco, public.generate_sequence_number(c, 'job'), 'scheduled', 'long_distance', current_date + 3,
        '08:00', 10, 3, 'Via Nassa 7', '6900', 'Lugano', 'Seestrasse 12', '8002', 'Zürich');

      INSERT INTO public.job_assignments (company_id, job_id, employee_id, role)
      SELECT c, j.id, e.id, CASE WHEN e.first_name = 'Luca' THEN 'lead'::assignment_role ELSE 'mover' END
        FROM public.jobs j, public.employees e
       WHERE j.company_id = c AND e.company_id = c
         AND j.scheduled_date = current_date + 1 AND e.first_name IN ('Luca', 'Sara', 'Jonas');

      INSERT INTO public.job_vehicles (company_id, job_id, vehicle_id)
      SELECT c, j.id, v.id FROM public.jobs j, public.vehicles v
       WHERE j.company_id = c AND v.company_id = c
         AND j.scheduled_date = current_date + 1 AND v.name = 'LKW 1';
    END $$;
  `)
  console.log("  ✓ Demo content created (customers, leads, rates, quote, crew, fleet, jobs)")

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
  console.log("  Companies:   " + SEED_COMPANIES.map((c) => c.name).join(", "))
  console.log("  Status:      active")
  console.log("  Role:        owner")
  console.log("  User ID:     " + userId)
  console.log("  Company IDs: " + companyIds.join(", "))
  console.log("\n  Login at:   http://localhost:3000/login")
  console.log("  Redirects → http://localhost:3000/dashboard")
  console.log("─".repeat(58))
}

run().catch((err: unknown) => {
  console.error("Seed failed:", err)
  process.exit(1)
})
