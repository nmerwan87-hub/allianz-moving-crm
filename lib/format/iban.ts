/**
 * IBAN normalisation and validation (ISO 13616, mod-97 check digits).
 * Swiss and Liechtenstein IBANs have 21 characters. QR-IBANs (institution
 * id 30000–31999) are valid IBANs and are reported separately, because
 * QR-bills with a QR-IBAN need a QR reference.
 */

const LENGTHS: Record<string, number> = { CH: 21, LI: 21, DE: 22, AT: 20, FR: 27, IT: 27 }

export function normalizeIban(input: string | null | undefined): string | null {
  const compact = (input ?? "").replace(/\s+/g, "").toUpperCase()
  return compact === "" ? null : compact
}

/** "CH9300762011623852957" → "CH93 0076 2011 6238 5295 7" */
export function formatIban(iban: string | null | undefined): string {
  const compact = normalizeIban(iban)
  return compact ? compact.replace(/(.{4})/g, "$1 ").trim() : ""
}

export function isValidIban(input: string | null | undefined): boolean {
  const iban = normalizeIban(input)
  if (!iban || !/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban)) return false
  const expected = LENGTHS[iban.slice(0, 2)]
  if (expected !== undefined && iban.length !== expected) return false

  const rearranged = iban.slice(4) + iban.slice(0, 4)
  let remainder = 0
  for (const char of rearranged) {
    const digits = /\d/.test(char) ? char : String(char.charCodeAt(0) - 55)
    for (const digit of digits) remainder = (remainder * 10 + Number(digit)) % 97
  }
  return remainder === 1
}

export function isQrIban(input: string | null | undefined): boolean {
  const iban = normalizeIban(input)
  if (!iban || !isValidIban(iban) || !/^(CH|LI)/.test(iban)) return false
  const institutionId = Number(iban.slice(4, 9))
  return institutionId >= 30000 && institutionId <= 31999
}
