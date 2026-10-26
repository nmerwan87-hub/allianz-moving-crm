import { describe, it, expect } from "vitest"
import { isQRReferenceValid, isSCORReferenceValid } from "swissqrbill/utils"
import {
  creditorReference,
  formatPaymentReference,
  invoicePaymentReference,
  qrReference,
  qrReferenceCheckDigit,
} from "@/lib/format/payment-reference"
import { buildQrBillSvg, missingQrBillData, splitStreet } from "@/lib/documents/qr-bill"
import { INVOICE_EMAIL_TEXT, INVOICE_LABELS, INVOICE_TEXT } from "@/lib/documents/labels"

const IBAN = "CH9300762011623852957"
const QR_IBAN = "CH4431999123000889012"

describe("payment references", () => {
  it("computes the QR reference check digit (SIX example)", () => {
    // Swiss Implementation Guidelines QR-bill: 21 00000 00003 13947 14300 0901 + 7
    expect(qrReferenceCheckDigit("21000000000313947143000901")).toBe("7")
    expect(isQRReferenceValid("210000000003139471430009017")).toBe(true)
  })

  it("builds 27-digit QR references from invoice numbers", () => {
    const reference = qrReference("INV-2026-0042")
    expect(reference).toHaveLength(27)
    expect(reference.startsWith("0".repeat(18))).toBe(true)
    expect(isQRReferenceValid(reference)).toBe(true)
  })

  it("builds ISO 11649 creditor references (RF)", () => {
    // ISO 11649 example: RF18 5390 0754 7034
    expect(creditorReference("539007547034")).toBe("RF18539007547034")
    const reference = creditorReference("INV-2026-0001")
    expect(reference).toBe("RF16INV20260001")
    expect(isSCORReferenceValid(reference)).toBe(true)
  })

  it("chooses the reference type by IBAN", () => {
    expect(invoicePaymentReference("INV-2026-0001", IBAN)).toMatch(/^RF/)
    expect(invoicePaymentReference("INV-2026-0001", QR_IBAN)).toMatch(/^\d{27}$/)
    expect(invoicePaymentReference("INV-2026-0001", null)).toBeNull()
    expect(invoicePaymentReference(null, IBAN)).toBeNull()
  })

  it("formats references for reading", () => {
    expect(formatPaymentReference("RF16INV20260001")).toBe("RF16 INV2 0260 001")
    expect(formatPaymentReference("210000000003139471430009017")).toBe(
      "21 00000 00003 13947 14300 09017",
    )
  })
})

describe("QR-bill", () => {
  const creditor = {
    name: "Test Umzüge GmbH",
    street: "Industriestrasse 5",
    postalCode: "8305",
    city: "Dietlikon",
    country: "CH",
  }

  it("splits street and house number", () => {
    expect(splitStreet("Bahnhofstrasse 12a")).toEqual({
      address: "Bahnhofstrasse",
      buildingNumber: "12a",
    })
    expect(splitStreet("Rue du Rhône 4-6")).toEqual({
      address: "Rue du Rhône",
      buildingNumber: "4-6",
    })
    expect(splitStreet("Postfach")).toEqual({ address: "Postfach" })
    expect(splitStreet("Strasse 1. August 3")).toEqual({
      address: "Strasse 1. August",
      buildingNumber: "3",
    })
  })

  it("lists missing company data", () => {
    expect(missingQrBillData({ iban: "", creditor: { ...creditor, street: null } })).toEqual([
      "IBAN",
      "company street",
    ])
    expect(missingQrBillData({ iban: IBAN, creditor })).toEqual([])
  })

  it("renders the payment part with amount, reference and debtor", () => {
    const svg = buildQrBillSvg({
      iban: IBAN,
      creditor,
      debtor: {
        name: "Anna Muster",
        street: "Bahnhofstrasse 1",
        postalCode: "8001",
        city: "Zürich",
        country: "CH",
      },
      amountCents: 180419,
      currency: "CHF",
      reference: "RF16INV20260001",
      message: "Rechnung INV-2026-0001",
      language: "de",
    })
    expect(svg.startsWith("<svg")).toBe(true)
    expect(svg).toContain("Zahlteil")
    expect(svg).toContain("1 804.19")
    expect(svg).toContain("RF16 INV2 0260 001")
  })

  it("refuses a QR-IBAN without a QR reference", () => {
    expect(() =>
      buildQrBillSvg({
        iban: QR_IBAN,
        creditor,
        debtor: null,
        amountCents: 1000,
        currency: "CHF",
        reference: "RF16INV20260001",
        message: null,
        language: "de",
      }),
    ).toThrow()
  })
})

describe("invoice texts", () => {
  it("has every text in all four languages", () => {
    const keys = Object.keys(INVOICE_LABELS.de).sort()
    for (const language of ["fr", "it", "en"] as const) {
      expect(Object.keys(INVOICE_LABELS[language]).sort()).toEqual(keys)
      expect(Object.keys(INVOICE_TEXT[language]).sort()).toEqual(
        Object.keys(INVOICE_TEXT.de).sort(),
      )
      expect(Object.keys(INVOICE_EMAIL_TEXT[language]).sort()).toEqual(
        Object.keys(INVOICE_EMAIL_TEXT.de).sort(),
      )
    }
  })
})
