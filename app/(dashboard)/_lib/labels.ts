/**
 * German names for database enum values shown in the app (statuses, sources,
 * sizes). Unknown values fall back to a readable form of the raw value.
 */
const LABELS: Record<string, string> = {
  // lead status
  new: "Neu",
  contacted: "Kontaktiert",
  surveyed: "Besichtigt",
  quoted: "Offeriert",
  booked: "Gebucht",
  lost: "Verloren",
  duplicate: "Duplikat",
  // acquisition source
  web_form: "Website-Formular",
  phone_call: "Telefon",
  referral: "Empfehlung",
  marketplace: "Marktplatz (z. B. MOVU)",
  repeat_customer: "Stammkunde",
  social_media: "Social Media",
  google_ads: "Google Ads",
  organic_search: "Google-Suche",
  manual: "Manuell erfasst",
  other: "Andere",
  // move type
  local: "Privatumzug",
  long_distance: "Fernumzug",
  commercial: "Firmenumzug",
  international: "Auslandumzug",
  junk_removal: "Räumung / Entsorgung",
  // property size
  studio: "Studio",
  one_bedroom: "1.5 Zimmer",
  two_bedroom: "2.5 Zimmer",
  three_bedroom: "3.5 Zimmer",
  four_bedroom: "4.5 Zimmer",
  five_plus_bedroom: "5.5+ Zimmer",
  commercial_small: "Büro klein",
  commercial_medium: "Büro mittel",
  commercial_large: "Büro gross",
}

export function labelOf(value: string | null | undefined): string {
  if (!value) return "—"
  return LABELS[value] ?? value.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase())
}
