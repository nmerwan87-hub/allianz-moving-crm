import { createClient } from "@supabase/supabase-js"

/**
 * Service role client — bypasses RLS. Server-only.
 * Never import this file in browser code or expose the key to the client.
 * Use only for: background jobs, migrations, admin operations, test setup fixtures.
 */
export function createServiceRoleClient() {
  const url = process.env["NEXT_PUBLIC_SUPABASE_URL"]
  const key = process.env["SUPABASE_SERVICE_ROLE_KEY"]

  if (!url || !key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY — server environment required",
    )
  }

  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}
