import { isQrIban, normalizeIban } from "./iban"

/**
 * Payment references for Swiss QR-bills. Mirrors the database function
 * public.invoice_payment_reference() (migration 031), which sets the stored
 * reference when an invoice is issued; this copy is used for previews of
 * drafts and pinned to the database by the invoices integration test.
 *
 *   QR-IBAN    → QR reference: 26 digits + recursive mod-10 check digit
 *   other IBAN → ISO 11649 creditor reference: "RF" + 2 check digits + reference
 */

const MOD10_TABLE = [0, 9, 4, 6, 8, 2, 7, 1, 3, 5]

export function qrReferenceCheckDigit(digits: string): string {
  let carry = 0
  for (const digit of digits) carry = MOD10_TABLE[(carry + Number(digit)) % 10]!
  return String((10 - carry) % 10)
}

export function qrReference(source: string): string {
  const payload = source.replace(/\D/g, "").slice(-26).padStart(26, "0")
  return payload + qrReferenceCheckDigit(payload)
}

export function creditorReference(source: string): string {
  const reference = source
    .replace(/[^A-Za-z0-9]/g, "")
    .toUpperCase()
    .slice(0, 21)
  let remainder = 0
  for (const char of `${reference}RF00`) {
    const digits = /\d/.test(char) ? char : String(char.charCodeAt(0) - 55)
    for (const digit of digits) remainder = (remainder * 10 + Number(digit)) % 97
  }
  return `RF${String(98 - remainder).padStart(2, "0")}${reference}`
}

export function invoicePaymentReference(
  invoiceNumber: string | null,
  iban: string | null,
): string | null {
  if (!invoiceNumber || !normalizeIban(iban)) return null
  return isQrIban(iban) ? qrReference(invoiceNumber) : creditorReference(invoiceNumber)
}

/** "RF16INV20260001" → "RF16 INV2 0260 001"; QR reference in groups of 5 from the right. */
export function formatPaymentReference(reference: string | null): string {
  if (!reference) return ""
  if (reference.startsWith("RF")) return reference.replace(/(.{4})/g, "$1 ").trim()
  const head = reference.length % 5
  return [reference.slice(0, head), ...(reference.slice(head).match(/.{5}/g) ?? [])]
    .filter(Boolean)
    .join(" ")
}
