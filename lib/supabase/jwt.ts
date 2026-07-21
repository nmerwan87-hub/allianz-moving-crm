/**
 * Decode the payload of a Supabase JWT (access_token) and return the claims.
 *
 * WHY this exists:
 *   supabase.auth.getSession() returns session.user from the GoTrue RESPONSE BODY,
 *   which contains raw_app_meta_data from the database — no hook-injected fields.
 *   The custom_access_token_hook injects company_id, role, and company_status into
 *   the JWT payload only. To read those fields on the server, the access_token must
 *   be decoded directly.
 *
 *   Safe usage pattern (server-side):
 *     1. Call getUser() — validates the token against GoTrue (network call).
 *     2. Call getSession() — reads the access_token from the cookie (no network call).
 *     3. Call getJwtClaims(session?.access_token) — decode the verified token locally.
 *
 *   This is safe because getUser() has already proven the token authentic. Local
 *   decoding only extracts the payload without re-verifying the signature.
 *
 * Works in both Edge Runtime (middleware) and Node.js (server components).
 * atob is available globally in Node.js 16+ and in all Edge Runtimes.
 */
export function getJwtClaims(accessToken: string | undefined): Record<string, unknown> {
  if (!accessToken) return {}
  try {
    const [, payload] = accessToken.split(".")
    if (!payload) return {}
    // base64url → base64 (pad to multiple of 4)
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/")
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=")
    return JSON.parse(atob(padded)) as Record<string, unknown>
  } catch {
    return {}
  }
}

/** Extract app_metadata from the JWT, e.g. hook-injected company_id / role / company_status. */
export function getJwtAppMetadata(accessToken: string | undefined): Record<string, unknown> {
  const claims = getJwtClaims(accessToken)
  return (claims["app_metadata"] as Record<string, unknown>) ?? {}
}
