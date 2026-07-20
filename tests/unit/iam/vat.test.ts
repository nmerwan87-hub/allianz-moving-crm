import { describe, it, expect } from "vitest"
import { validateVat, getVatFieldConfig } from "@/modules/iam/lib/vat"

describe("validateVat", () => {
  describe("CH (Switzerland)", () => {
    it("accepts valid UID", () => {
      expect(validateVat("CH", "CHE-123.456.789")).toBeNull()
    })

    it("rejects wrong format", () => {
      expect(validateVat("CH", "CHE123456789")).not.toBeNull()
      expect(validateVat("CH", "CHE-1234.56.789")).not.toBeNull()
    })

    it("allows empty value", () => {
      expect(validateVat("CH", "")).toBeNull()
    })
  })

  describe("GB (United Kingdom)", () => {
    it("accepts 9-digit number", () => {
      expect(validateVat("GB", "GB123456789")).toBeNull()
    })

    it("accepts 12-digit number", () => {
      expect(validateVat("GB", "GB123456789012")).toBeNull()
    })

    it("rejects 8-digit number", () => {
      expect(validateVat("GB", "GB12345678")).not.toBeNull()
    })
  })

  describe("US (EIN)", () => {
    it("accepts valid EIN", () => {
      expect(validateVat("US", "12-3456789")).toBeNull()
    })

    it("rejects no-hyphen EIN", () => {
      expect(validateVat("US", "123456789")).not.toBeNull()
    })
  })

  describe("CA", () => {
    it("accepts 9-digit BN", () => {
      expect(validateVat("CA", "123456789")).toBeNull()
    })

    it("rejects 8-digit BN", () => {
      expect(validateVat("CA", "12345678")).not.toBeNull()
    })
  })

  describe("AU (ABN)", () => {
    it("accepts 11-digit ABN with spaces", () => {
      expect(validateVat("AU", "51 824 753 556")).toBeNull()
    })

    it("accepts 11 contiguous digits", () => {
      expect(validateVat("AU", "51824753556")).toBeNull()
    })

    it("rejects 10 digits", () => {
      expect(validateVat("AU", "1234567890")).not.toBeNull()
    })
  })

  describe("EU countries", () => {
    it("accepts valid German VAT", () => {
      expect(validateVat("DE", "DE123456789")).toBeNull()
    })

    it("rejects short German VAT", () => {
      expect(validateVat("DE", "DE12345678")).not.toBeNull()
    })

    it("accepts valid French VAT", () => {
      expect(validateVat("FR", "FRAA123456789")).toBeNull()
    })

    it("accepts valid Austrian VAT", () => {
      expect(validateVat("AT", "ATU12345678")).toBeNull()
    })

    it("rejects malformed Austrian VAT (no U)", () => {
      expect(validateVat("AT", "AT12345678")).not.toBeNull()
    })
  })

  describe("unknown country", () => {
    it("allows any value under 50 chars", () => {
      expect(validateVat("ZZ", "ABC-12345")).toBeNull()
    })

    it("rejects value over 50 chars", () => {
      expect(validateVat("ZZ", "A".repeat(51))).not.toBeNull()
    })

    it("allows empty value", () => {
      expect(validateVat("ZZ", "")).toBeNull()
    })
  })
})

describe("getVatFieldConfig", () => {
  it("returns UID config for CH", () => {
    const config = getVatFieldConfig("CH")
    expect(config.label).toContain("UID")
    expect(config.placeholder).toBe("CHE-123.456.789")
    expect(config.optional).toBe(true)
  })

  it("returns EIN config for US", () => {
    const config = getVatFieldConfig("US")
    expect(config.label).toContain("EIN")
  })

  it("returns VAT Number for EU DE", () => {
    const config = getVatFieldConfig("DE")
    expect(config.label).toBe("VAT Number")
    expect(config.placeholder).toBe("DE123456789")
  })

  it("returns generic config for unknown country", () => {
    const config = getVatFieldConfig("ZZ")
    expect(config.optional).toBe(true)
  })
})
