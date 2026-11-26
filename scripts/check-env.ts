/* eslint-disable no-console */
/**
 * Checks the environment for going live (own companies, no billing, no AI).
 * Prints only OK / missing / wrong, never a value.
 *
 *   npx tsx --env-file=.env.production.local scripts/check-env.ts
 */

type Check = { name: string; required: boolean; test: (v: string) => string | null; hint: string }

const url = (v: string) => (/^https:\/\/[^/]+/.test(v) ? null : "muss mit https:// beginnen")
const minLength = (n: number) => (v: string) => (v.length >= n ? null : `mindestens ${n} Zeichen`)

const CHECKS: Check[] = [
  {
    name: "NEXT_PUBLIC_SUPABASE_URL",
    required: true,
    test: url,
    hint: "Supabase → Project Settings → API",
  },
  {
    name: "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    required: true,
    test: minLength(100),
    hint: "Supabase → API → anon public",
  },
  {
    name: "SUPABASE_SERVICE_ROLE_KEY",
    required: true,
    test: minLength(100),
    hint: "Supabase → API → service_role (geheim)",
  },
  {
    name: "NEXT_PUBLIC_APP_URL",
    required: true,
    test: url,
    hint: "z. B. https://app.ihre-domain.ch",
  },
  { name: "CRON_SECRET", required: true, test: minLength(32), hint: "openssl rand -base64 48" },
  {
    name: "PORTAL_TOKEN_SECRET",
    required: true,
    test: minLength(32),
    hint: "openssl rand -base64 48 — nie mehr ändern",
  },
  {
    name: "RESEND_API_KEY",
    required: true,
    test: (v) =>
      v.startsWith("re_placeholder")
        ? "ist noch ein Platzhalter"
        : v.startsWith("re_")
          ? null
          : "beginnt nicht mit re_",
    hint: "Resend → API Keys",
  },
  {
    name: "EMAIL_SENDER_DOMAIN",
    required: true,
    test: (v) =>
      /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(v) ? null : "nur die Domain, z. B. mail.ihre-domain.ch",
    hint: "in Resend verifizierte Absender-Domain",
  },
  {
    name: "BROWSERLESS_WS_ENDPOINT",
    required: true,
    test: (v) => (v.startsWith("wss://") ? null : "muss mit wss:// beginnen"),
    hint: "für PDFs (Offerten, Rechnungen) — browserless.io",
  },
  { name: "SENTRY_DSN", required: false, test: url, hint: "optional: Fehlermeldungen per Sentry" },
]

let failed = 0
console.log("\nBivro — Umgebung für den Live-Betrieb\n")
for (const c of CHECKS) {
  const value = process.env[c.name]?.trim() ?? ""
  const problem = value ? c.test(value) : c.required ? "fehlt" : null
  if (!value && !c.required) {
    console.log(`  ·  ${c.name.padEnd(28)} nicht gesetzt (optional) — ${c.hint}`)
    continue
  }
  if (problem) {
    failed++
    console.log(`  ✗  ${c.name.padEnd(28)} ${problem} — ${c.hint}`)
  } else {
    console.log(`  ✓  ${c.name}`)
  }
}
if (process.env["NEXT_PUBLIC_APP_URL"]?.includes("localhost")) {
  failed++
  console.log("  ✗  NEXT_PUBLIC_APP_URL zeigt auf localhost")
}
console.log(failed ? `\n${failed} Punkt(e) offen.\n` : "\nAlles bereit.\n")
process.exit(failed ? 1 : 0)
