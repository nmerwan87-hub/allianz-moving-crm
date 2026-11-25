export const INVOICE_STATUS_LABELS: Record<string, string> = {
  draft: "Entwurf",
  sent: "Offen",
  viewed: "Offen",
  partially_paid: "Teilbezahlt",
  paid: "Bezahlt",
  overdue: "Überfällig",
  void: "Storniert",
  write_off: "Abgeschrieben",
}

export const INVOICE_STATUS_BADGE: Record<
  string,
  "default" | "success" | "warning" | "danger" | "info" | "neutral"
> = {
  draft: "neutral",
  sent: "info",
  viewed: "info",
  partially_paid: "warning",
  paid: "success",
  overdue: "danger",
  void: "neutral",
  write_off: "neutral",
}

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  bank_transfer: "Überweisung",
  cash: "Bar",
  card: "Karte / TWINT",
  other: "Andere",
  ach: "Überweisung",
  check: "Check",
}

export const PAYMENT_TYPE_LABELS: Record<string, string> = {
  deposit: "Anzahlung",
  partial: "Teilzahlung",
  balance: "Zahlung",
  refund: "Rückerstattung",
  adjustment: "Korrektur",
}

export const REMINDER_LABELS = ["", "Zahlungserinnerung", "2. Mahnung", "3. Mahnung"]

/** Swiss calendar day of a timestamp (due dates end at 23:59:59 Swiss time). */
export function swissDay(timestamp: string | null | undefined): string | null {
  if (!timestamp) return null
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Zurich" }).format(new Date(timestamp))
}

export function todaySwiss(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Zurich" }).format(new Date())
}
