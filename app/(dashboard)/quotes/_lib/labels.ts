export const QUOTE_STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  sent: "Sent",
  viewed: "Viewed",
  accepted: "Accepted",
  declined: "Declined",
  expired: "Expired",
  cancelled: "Cancelled",
  superseded: "Replaced",
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
  fixed: "Fixed",
  hourly: "Per hour",
  quantity: "Per unit",
  distance: "Per km",
  manual: "Amount",
}

export const LANGUAGE_LABELS: Record<string, string> = {
  de: "German",
  fr: "French",
  it: "Italian",
  en: "English",
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "—"
  const [y, m, d] = value.slice(0, 10).split("-")
  return `${d}.${m}.${y}`
}
