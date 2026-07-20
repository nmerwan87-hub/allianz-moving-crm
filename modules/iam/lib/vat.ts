/**
 * V1 VAT/UID format validation — regex only; no live government API calls.
 * Returns null on valid (or empty string when field is optional).
 * Returns an error string on format failure.
 */

const EU_PATTERNS: Record<string, RegExp> = {
  AT: /^ATU\d{8}$/,
  BE: /^BE\d{10}$/,
  BG: /^BG\d{9,10}$/,
  CY: /^CY\d{8}[A-Z]$/,
  CZ: /^CZ\d{8,10}$/,
  DE: /^DE\d{9}$/,
  DK: /^DK\d{8}$/,
  EE: /^EE\d{9}$/,
  EL: /^EL\d{9}$/,
  ES: /^ES[A-Z0-9]\d{7}[A-Z0-9]$/,
  FI: /^FI\d{8}$/,
  FR: /^FR[A-Z0-9]{2}\d{9}$/,
  HR: /^HR\d{11}$/,
  HU: /^HU\d{8}$/,
  IE: /^IE\d[A-Z0-9+*]\d{5}[A-Z]{1,2}$/,
  IT: /^IT\d{11}$/,
  LT: /^LT(\d{9}|\d{12})$/,
  LU: /^LU\d{8}$/,
  LV: /^LV\d{11}$/,
  MT: /^MT\d{8}$/,
  NL: /^NL\d{9}B\d{2}$/,
  PL: /^PL\d{10}$/,
  PT: /^PT\d{9}$/,
  RO: /^RO\d{2,10}$/,
  SE: /^SE\d{12}$/,
  SI: /^SI\d{8}$/,
  SK: /^SK\d{10}$/,
}

const EU_COUNTRY_CODES = new Set(Object.keys(EU_PATTERNS))

export type VatCountry = "CH" | "GB" | "US" | "CA" | "AU" | (string & {})

export interface VatFieldConfig {
  label: string
  placeholder: string
  optional: boolean
}

export function getVatFieldConfig(country: string): VatFieldConfig {
  switch (country) {
    case "CH":
      return { label: "UID (MwSt-Nr.)", placeholder: "CHE-123.456.789", optional: true }
    case "GB":
      return { label: "VAT Number", placeholder: "GB123456789", optional: true }
    case "US":
      return {
        label: "EIN (Employer Identification Number)",
        placeholder: "12-3456789",
        optional: true,
      }
    case "CA":
      return { label: "Business Number", placeholder: "123456789", optional: true }
    case "AU":
      return { label: "ABN", placeholder: "51 824 753 556", optional: true }
    default:
      if (EU_COUNTRY_CODES.has(country)) {
        return { label: "VAT Number", placeholder: `${country}123456789`, optional: true }
      }
      return { label: "Tax / VAT Number", placeholder: "Optional", optional: true }
  }
}

export function validateVat(country: string, value: string): string | null {
  if (!value) return null

  const normalised = value.trim().replace(/\s+/g, "")

  switch (country) {
    case "CH": {
      if (!/^CHE-\d{3}\.\d{3}\.\d{3}$/.test(normalised)) {
        return "Swiss UID must follow the format CHE-123.456.789"
      }
      return null
    }
    case "GB": {
      if (!/^GB(\d{9}|\d{12})$/.test(normalised)) {
        return "UK VAT number must be GB followed by 9 or 12 digits"
      }
      return null
    }
    case "US": {
      if (!/^\d{2}-\d{7}$/.test(normalised)) {
        return "EIN must follow the format 12-3456789"
      }
      return null
    }
    case "CA": {
      if (!/^\d{9}$/.test(normalised)) {
        return "Canadian Business Number must be 9 digits"
      }
      return null
    }
    case "AU": {
      const digits = normalised.replace(/\D/g, "")
      if (digits.length !== 11) {
        return "ABN must be 11 digits"
      }
      return null
    }
    default: {
      const euPattern = EU_PATTERNS[country]
      if (euPattern) {
        if (!euPattern.test(normalised)) {
          return `Invalid ${country} VAT number format`
        }
        return null
      }
      if (normalised.length > 50) {
        return "Tax / VAT number must be 50 characters or fewer"
      }
      return null
    }
  }
}
