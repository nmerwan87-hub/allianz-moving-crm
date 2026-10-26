/**
 * Normalises phone numbers to E.164 (+41791234567) so duplicates can be
 * detected and numbers dialled reliably. Swiss numbers are the default:
 * "079 123 45 67", "0041 79 123 45 67" and "+41 (0)79 123 45 67" all become
 * "+41791234567". Numbers that cannot be interpreted are returned trimmed,
 * unchanged, so nothing the user typed is lost.
 */
export function normalizePhone(input: string | null | undefined): string | null {
  if (input === null || input === undefined) return null
  const trimmed = input.trim()
  if (trimmed === "") return null

  let digits = trimmed.replace(/\(0\)/g, "").replace(/[^\d+]/g, "")
  if (digits.startsWith("00")) digits = `+${digits.slice(2)}`

  if (digits.startsWith("+")) {
    const rest = digits.slice(1).replace(/\+/g, "")
    return /^\d{8,15}$/.test(rest) ? `+${rest}` : trimmed
  }

  // National Swiss format: 0 + 9 digits
  if (/^0\d{9}$/.test(digits)) return `+41${digits.slice(1)}`

  return trimmed
}

/** "+41791234567" → "+41 79 123 45 67" for display; other formats unchanged. */
export function formatPhone(value: string | null | undefined): string {
  if (!value) return ""
  const match = /^\+41(\d{2})(\d{3})(\d{2})(\d{2})$/.exec(value)
  return match ? `+41 ${match[1]} ${match[2]} ${match[3]} ${match[4]}` : value
}
