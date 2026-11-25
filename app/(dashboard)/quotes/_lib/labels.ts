export const QUOTE_STATUS_LABELS: Record<string, string> = {
  draft: "Entwurf",
  sent: "Gesendet",
  viewed: "Angesehen",
  accepted: "Angenommen",
  declined: "Abgelehnt",
  expired: "Abgelaufen",
  cancelled: "Verworfen",
  superseded: "Ersetzt",
}

export const QUOTE_STATUS_BADGE: Record<
  string,
  "default" | "success" | "warning" | "danger" | "info" | "neutral"
> = {
  draft: "neutral",
  sent: "info",
  viewed: "info",
  accepted: "success",
  declined: "danger",
  expired: "warning",
  cancelled: "neutral",
  superseded: "neutral",
}

export const PRICING_MODE_LABELS: Record<string, string> = {
  fixed: "Pauschal",
  hourly: "Pro Stunde",
  quantity: "Pro Stück",
  distance: "Pro km",
  manual: "Betrag",
}

export const LANGUAGE_LABELS: Record<string, string> = {
  de: "Deutsch",
  fr: "Französisch",
  it: "Italienisch",
  en: "Englisch",
}

export const MOVE_TYPE_LABELS: Record<string, string> = {
  local: "Privatumzug",
  long_distance: "Fernumzug",
  commercial: "Firmenumzug",
  international: "Auslandumzug",
  junk_removal: "Räumung / Entsorgung",
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "—"
  const [y, m, d] = value.slice(0, 10).split("-")
  return `${d}.${m}.${y}`
}
