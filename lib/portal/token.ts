import { createHash, createHmac } from "crypto"

/**
 * Customer portal links (no login). The link token is an HMAC of the record
 * id, so the same link can be sent again without storing the token; the
 * database keeps only its SHA-256 hash (quotes/invoices.portal_token) and an
 * expiry. Rotating PORTAL_TOKEN_SECRET invalidates every link.
 */

export type PortalKind = "quote" | "invoice"

const PATH: Record<PortalKind, string> = { quote: "o", invoice: "r" }

function secret(): string {
  const value = process.env["PORTAL_TOKEN_SECRET"]
  if (value && value.length >= 32) return value
  if (process.env["NODE_ENV"] === "production")
    throw new Error("PORTAL_TOKEN_SECRET (min. 32 characters) is required in production")
  // Local development and tests: derive from the service role key
  return `dev-portal:${process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? "local"}`
}

export function portalToken(kind: PortalKind, id: string): string {
  return createHmac("sha256", secret()).update(`${kind}:${id}`).digest("base64url")
}

export function hashPortalToken(token: string): string {
  return createHash("sha256").update(token).digest("hex")
}

/** Rejects anything that cannot be a token before it reaches the database. */
export function isPortalTokenShape(token: string): boolean {
  return /^[A-Za-z0-9_-]{43}$/.test(token)
}

export function portalUrl(kind: PortalKind, id: string): string {
  const base = (process.env["NEXT_PUBLIC_APP_URL"] ?? "http://localhost:3000").replace(/\/$/, "")
  return `${base}/p/${PATH[kind]}/${portalToken(kind, id)}`
}
