export const LANGUAGE_LABELS: Record<string, string> = {
  de: "Deutsch",
  fr: "Französisch",
  it: "Italienisch",
  en: "Englisch",
}

export const SALUTATION_LABELS: Record<string, string> = {
  mr: "Herr",
  ms: "Frau",
}

export const CUSTOMER_TYPE_LABELS: Record<string, string> = {
  private: "Privat",
  business: "Firma",
}

export function formatAddress(parts: {
  billingStreet: string | null
  billingPostalCode: string | null
  billingCity: string | null
  billingCountry: string
}): string | null {
  const cityLine = [parts.billingPostalCode, parts.billingCity].filter(Boolean).join(" ")
  const lines = [parts.billingStreet, cityLine].filter((line) => line && line.trim())
  if (lines.length === 0) return null
  if (parts.billingCountry !== "CH") lines.push(parts.billingCountry)
  return lines.join(", ")
}
