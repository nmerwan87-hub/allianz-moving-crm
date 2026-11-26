/* eslint-disable no-console */
/**
 * Sets up one of your own moving companies in a (production) project:
 * company (active), standard setup (services, groups, e-mails) and the owner
 * account. Run it once per company; with the same owner e-mail the existing
 * account becomes owner of the next company too (company switcher).
 *
 * Usage:
 *   npx tsx --env-file=.env.production.local scripts/create-company.ts \
 *     --name "Allianz Umzüge" --legal-name "Allianz Umzüge GmbH" \
 *     --owner-email inhaber@firma.ch --first-name Marwan --last-name Nassan
 *
 * Needs NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and
 * NEXT_PUBLIC_APP_URL. For a new owner account it prints a one-time link to
 * set the password (valid about one hour; otherwise use «Passwort vergessen»).
 */

import { randomBytes } from "crypto"
import { createClient } from "@supabase/supabase-js"

function arg(name: string, required = true): string {
  const i = process.argv.indexOf(`--${name}`)
  const value = i >= 0 ? process.argv[i + 1] : undefined
  if (!value && required) {
    console.error(`Fehlt: --${name}`)
    process.exit(1)
  }
  return value ?? ""
}

function slugify(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 50)
}

async function main() {
  const url = process.env["NEXT_PUBLIC_SUPABASE_URL"]
  const key = process.env["SUPABASE_SERVICE_ROLE_KEY"]
  const appUrl = process.env["NEXT_PUBLIC_APP_URL"]
  if (!url || !key || !appUrl) {
    console.error(
      "NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY und NEXT_PUBLIC_APP_URL setzen.",
    )
    process.exit(1)
  }

  const name = arg("name")
  const legalName = arg("legal-name", false) || name
  const email = arg("owner-email").trim().toLowerCase()
  const firstName = arg("first-name")
  const lastName = arg("last-name")

  const svc = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
  console.log(`\nProjekt: ${url}`)

  // ── Company ────────────────────────────────────────────────────────────────
  let slug = slugify(name)
  const { data: taken } = await svc.from("companies").select("id").eq("slug", slug).maybeSingle()
  if (taken) slug = `${slug}-${randomBytes(2).toString("hex")}`

  const { data: company, error: companyError } = await svc
    .from("companies")
    .insert({
      name,
      legal_name: legalName,
      slug,
      country: "CH",
      company_status: "active",
      subscription_tier: "pro",
      subscription_status: "active",
    })
    .select("id")
    .single()
  if (companyError || !company) throw new Error(`Firma: ${companyError?.message}`)
  const companyId = company.id as string
  console.log(`✓ Firma «${name}» (${companyId})`)

  // ── Owner account ──────────────────────────────────────────────────────────
  const { data: existing } = await svc
    .from("profiles")
    .select("id")
    .ilike("email", email)
    .is("deleted_at", null)
    .maybeSingle()

  let newAccount = false
  if (existing) {
    const { error } = await svc.from("company_memberships").insert({
      company_id: companyId,
      user_id: existing.id,
      role: "owner",
      is_active: true,
    })
    if (error) throw new Error(`Mitgliedschaft: ${error.message}`)
    console.log(`✓ ${email} ist jetzt auch Inhaber dieser Firma`)
  } else {
    const { data: auth, error: authError } = await svc.auth.admin.createUser({
      email,
      email_confirm: true,
      // Never used: the owner sets a password with the link below
      password: randomBytes(24).toString("base64url"),
    })
    if (authError || !auth.user) throw new Error(`Konto: ${authError?.message}`)
    // The profile trigger creates the membership for this first company
    const { error } = await svc.from("profiles").insert({
      id: auth.user.id,
      company_id: companyId,
      role: "owner",
      email,
      first_name: firstName,
      last_name: lastName,
      is_active: true,
    })
    if (error) throw new Error(`Profil: ${error.message}`)
    newAccount = true
    console.log(`✓ Inhaber-Konto ${email}`)
  }

  // ── Standard setup ─────────────────────────────────────────────────────────
  const { provisionCompany } = await import("../modules/iam/lib/provisioning")
  await provisionCompany(companyId)
  console.log("✓ Einstellungen, 19 Standard-Leistungen, Rechtegruppen und E-Mails eingerichtet")

  if (newAccount) {
    const { data: link, error } = await svc.auth.admin.generateLink({
      type: "recovery",
      email,
      options: { redirectTo: `${appUrl.replace(/\/$/, "")}/reset-password` },
    })
    if (error) throw new Error(`Link: ${error.message}`)
    console.log("\nPasswort festlegen (einmal gültig, ca. 1 Stunde):")
    console.log(link.properties.action_link)
  }

  console.log(
    "\nNächste Schritte in Bivro: Einstellungen → Firmendaten (Adresse, UID, Logo), Bankverbindung (IBAN), Ansätze und Leistungen.\n",
  )
}

main().catch((err: unknown) => {
  console.error("✗", err instanceof Error ? err.message : err)
  process.exit(1)
})
