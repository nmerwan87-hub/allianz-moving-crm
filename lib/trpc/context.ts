import { createClient } from "@/lib/supabase/server"
import { getJwtAppMetadata } from "@/lib/supabase/jwt"

export async function createContext() {
  const supabase = await createClient()

  // getUser() validates the token against GoTrue (network call — required for security).
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // getSession() returns the session from the cookie (no network call).
  // The custom_access_token_hook injects company_id, role, and company_status into
  // the JWT payload only — not into auth.users.raw_app_meta_data.
  // Decoding the JWT is the only way to read these hook-injected claims server-side.
  const {
    data: { session },
  } = await supabase.auth.getSession()

  const jwtMeta = getJwtAppMetadata(session?.access_token)
  const companyId = jwtMeta["company_id"] as string | undefined
  const role = jwtMeta["role"] as "owner" | "office" | undefined
  const companyStatus = jwtMeta["company_status"] as string | undefined

  return {
    supabase,
    user,
    companyId,
    role,
    companyStatus,
  }
}

export type Context = Awaited<ReturnType<typeof createContext>>
