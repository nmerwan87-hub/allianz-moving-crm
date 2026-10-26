/**
 * Money is stored as integer cents (Rappen). These helpers convert between
 * cents and what people type and read in Switzerland ("1'250.50", "1250,5").
 */

/**
 * 125050 → "1'250.50" (no currency). Formatted by hand instead of
 * toLocaleString: the de-CH grouping character differs between ICU versions
 * (' vs ’), and server, browser and PDFs must render the same text.
 */
export function formatCents(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return ""
  const sign = cents < 0 ? "-" : ""
  const abs = Math.abs(Math.round(cents))
  const francs = Math.floor(abs / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, "'")
  const rappen = (abs % 100).toString().padStart(2, "0")
  return `${sign}${francs}.${rappen}`
}

/** 125050 → "CHF 1'250.50". */
export function formatChf(cents: number | null | undefined): string {
  return cents === null || cents === undefined ? "—" : `CHF ${formatCents(cents)}`
}

/**
 * "1'250.50", "1 250,5", "CHF 80", "80.-" → cents. Returns null for empty or
 * unparseable input and for negative amounts.
 */
export function parseToCents(input: string | null | undefined): number | null {
  if (input === null || input === undefined) return null
  const cleaned = input
    .replace(/chf/i, "")
    .replace(/\.-$/, "")
    .replace(/['’\s]/g, "")
    .replace(",", ".")
    .trim()
  if (cleaned === "" || !/^\d+(\.\d{0,2})?$/.test(cleaned)) return null
  return Math.round(Number(cleaned) * 100)
}
