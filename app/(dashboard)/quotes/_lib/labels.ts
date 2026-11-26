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

/** "2026-11-26" or a timestamp → "26.11.2026"; timestamps count in Swiss time. */
export function formatDate(value: string | null | undefined): string {
  if (!value) return "—"
  const day =
    value.length > 10
      ? new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Zurich" }).format(new Date(value))
      : value
  const [y, m, d] = day.split("-")
  return `${d}.${m}.${y}`
}
