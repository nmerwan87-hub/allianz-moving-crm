import { SwissQRBill } from "swissqrbill/svg"
import type { Data } from "swissqrbill/types"
import { normalizeIban } from "@/lib/format/iban"
import type { DocumentLanguage } from "./labels"

/**
 * Swiss QR-bill payment part (Swiss Payment Standards / SIX Implementation
 * Guidelines) as SVG, rendered by `swissqrbill`. The library validates the
 * account, reference and addresses and throws on invalid data, so a broken
 * payment slip can never be issued.
 *
 * The payment reference itself is created by the database when the invoice is
 * issued (public.invoice_payment_reference, migration 031): a QR reference for
 * a QR-IBAN, an ISO 11649 creditor reference (RF…) otherwise.
 */

export interface QrParty {
  name: string
  /** Street with house number, e.g. "Bahnhofstrasse 1" */
  street: string | null | undefined
  postalCode: string | null | undefined
  city: string | null | undefined
  country: string | null | undefined
}

export interface QrBillInput {
  iban: string
  creditor: QrParty
  debtor: QrParty | null
  /** null → amount left blank for the payer */
  amountCents: number | null
  currency: "CHF" | "EUR"
  reference: string | null
  /** Unstructured message, e.g. "Rechnung INV-2026-0001" */
  message: string | null
  language: DocumentLanguage
}

/** "Bahnhofstrasse 12a" → { address: "Bahnhofstrasse", buildingNumber: "12a" } */
export function splitStreet(street: string | null | undefined): {
  address: string
  buildingNumber?: string
} {
  const value = (street ?? "").trim().replace(/\s+/g, " ")
  const match = value.match(/^(.*\D)\s+(\d+\s?[a-zA-Z]?(?:[-/]\d+[a-zA-Z]?)?)$/)
  if (!match) return { address: value }
  return { address: match[1]!.trim(), buildingNumber: match[2]!.replace(/\s/g, "") }
}

function party(p: QrParty) {
  const street = splitStreet(p.street)
  return {
    name: p.name.slice(0, 70),
    address: street.address.slice(0, 70),
    ...(street.buildingNumber ? { buildingNumber: street.buildingNumber.slice(0, 16) } : {}),
    zip: (p.postalCode ?? "").trim().slice(0, 16),
    city: (p.city ?? "").trim().slice(0, 35),
    country: (p.country ?? "CH").trim().toUpperCase() || "CH",
  }
}

/** Debtor is optional on a QR-bill; only complete addresses are printed. */
function isComplete(p: QrParty | null): p is QrParty {
  return Boolean(p?.name.trim() && p.street?.trim() && p.postalCode?.trim() && p.city?.trim())
}

export function missingQrBillData(input: Pick<QrBillInput, "iban" | "creditor">): string[] {
  const missing: string[] = []
  if (!normalizeIban(input.iban)) missing.push("IBAN")
  if (!input.creditor.name.trim()) missing.push("company name")
  if (!input.creditor.street?.trim()) missing.push("company street")
  if (!input.creditor.postalCode?.trim()) missing.push("company postal code")
  if (!input.creditor.city?.trim()) missing.push("company city")
  return missing
}

export function buildQrBillSvg(input: QrBillInput): string {
  const missing = missingQrBillData(input)
  if (missing.length) throw new Error(`QR-bill data missing: ${missing.join(", ")}`)

  const data: Data = {
    currency: input.currency,
    creditor: { account: normalizeIban(input.iban)!, ...party(input.creditor) },
    ...(input.amountCents !== null && input.amountCents > 0
      ? { amount: input.amountCents / 100 }
      : {}),
    ...(input.reference ? { reference: input.reference } : {}),
    ...(isComplete(input.debtor) ? { debtor: party(input.debtor) } : {}),
    ...(input.message ? { message: input.message.slice(0, 140) } : {}),
  }

  return new SwissQRBill(data, {
    language: input.language.toUpperCase() as "DE" | "FR" | "IT" | "EN",
    scissors: true,
    outlines: true,
  }).toString()
}
