import { describe, it, expect } from "vitest"
import { normalizePhone, formatPhone } from "@/lib/format/phone"
import { sanitizeSearch } from "@/lib/format/search"
import { formatCents, formatChf, parseToCents } from "@/lib/format/money"
import { formatIban, isQrIban, isValidIban } from "@/lib/format/iban"

describe("normalizePhone", () => {
  it.each([
    ["079 123 45 67", "+41791234567"],
    ["0791234567", "+41791234567"],
    ["0041 79 123 45 67", "+41791234567"],
    ["+41 (0)79 123 45 67", "+41791234567"],
    ["+41 79 123 45 67", "+41791234567"],
    ["044 555 12 34", "+41445551234"],
    ["+49 30 1234567", "+49301234567"],
  ])("%s → %s", (input, expected) => {
    expect(normalizePhone(input)).toBe(expected)
  })

  it("returns null for empty input", () => {
    expect(normalizePhone("")).toBeNull()
    expect(normalizePhone("   ")).toBeNull()
    expect(normalizePhone(null)).toBeNull()
    expect(normalizePhone(undefined)).toBeNull()
  })

  it("keeps input it cannot interpret", () => {
    expect(normalizePhone("ext. 12")).toBe("ext. 12")
    expect(normalizePhone("12345")).toBe("12345")
  })
})

describe("formatPhone", () => {
  it("groups Swiss numbers", () => {
    expect(formatPhone("+41791234567")).toBe("+41 79 123 45 67")
  })

  it("leaves other numbers unchanged", () => {
    expect(formatPhone("+49301234567")).toBe("+49301234567")
    expect(formatPhone(null)).toBe("")
  })
})

describe("sanitizeSearch", () => {
  it("removes characters that would change a PostgREST filter", () => {
    expect(sanitizeSearch("muster,company_id.neq.x")).toBe("muster company id.neq.x")
    expect(sanitizeSearch("a(b)c")).toBe("a b c")
    expect(sanitizeSearch("100%_off")).toBe("100 off")
  })

  it("keeps normal names, e-mails and phone numbers", () => {
    expect(sanitizeSearch("Müller")).toBe("Müller")
    expect(sanitizeSearch("anna@example.com")).toBe("anna@example.com")
    expect(sanitizeSearch("+41 79 123")).toBe("+41 79 123")
  })

  it("returns null when nothing is left", () => {
    expect(sanitizeSearch("")).toBeNull()
    expect(sanitizeSearch(" ,(), ")).toBeNull()
    expect(sanitizeSearch(undefined)).toBeNull()
  })
})

describe("money", () => {
  it("formats cents Swiss style", () => {
    expect(formatCents(125050)).toBe("1'250.50")
    expect(formatCents(123456789)).toBe("1'234'567.89")
    expect(formatCents(5)).toBe("0.05")
    expect(formatChf(8000)).toBe("CHF 80.00")
    expect(formatChf(null)).toBe("—")
  })

  it.each([
    ["1'250.50", 125050],
    ["1’250.50", 125050],
    ["1 250,5", 125050],
    ["CHF 80", 8000],
    ["80.-", 8000],
    ["0.05", 5],
    ["150", 15000],
  ])("parses %s → %d", (input, cents) => {
    expect(parseToCents(input)).toBe(cents)
  })

  it("rejects empty, negative and malformed amounts", () => {
    expect(parseToCents("")).toBeNull()
    expect(parseToCents("-5")).toBeNull()
    expect(parseToCents("12.345")).toBeNull()
    expect(parseToCents("abc")).toBeNull()
  })
})

describe("iban", () => {
  it("validates Swiss IBANs with check digits", () => {
    expect(isValidIban("CH93 0076 2011 6238 5295 7")).toBe(true)
    expect(isValidIban("CH9300762011623852957")).toBe(true)
    expect(isValidIban("CH9400762011623852957")).toBe(false)
    expect(isValidIban("CH930076201162385295")).toBe(false)
    expect(isValidIban("")).toBe(false)
  })

  it("validates other countries", () => {
    expect(isValidIban("DE89 3704 0044 0532 0130 00")).toBe(true)
  })

  it("detects QR-IBANs", () => {
    expect(isQrIban("CH44 3199 9123 0008 8901 2")).toBe(true)
    expect(isQrIban("CH93 0076 2011 6238 5295 7")).toBe(false)
  })

  it("formats in groups of four", () => {
    expect(formatIban("ch9300762011623852957")).toBe("CH93 0076 2011 6238 5295 7")
  })
})
