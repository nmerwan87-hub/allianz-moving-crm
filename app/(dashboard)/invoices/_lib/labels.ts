export const INVOICE_STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  sent: "Open",
  viewed: "Open",
  partially_paid: "Partially paid",
  paid: "Paid",
  overdue: "Overdue",
  void: "Void",
  write_off: "Written off",
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
  bank_transfer: "Bank transfer",
  cash: "Cash",
  card: "Card / TWINT",
  other: "Other",
  ach: "Bank transfer",
  check: "Cheque",
}

export const PAYMENT_TYPE_LABELS: Record<string, string> = {
  deposit: "Deposit",
  partial: "Partial payment",
  balance: "Payment",
  refund: "Refund",
  adjustment: "Adjustment",
}

export const REMINDER_LABELS = ["", "Payment reminder", "Second reminder", "Final reminder"]

/** Swiss calendar day of a timestamp (due dates end at 23:59:59 Swiss time). */
export function swissDay(timestamp: string | null | undefined): string | null {
  if (!timestamp) return null
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Zurich" }).format(new Date(timestamp))
}

export function todaySwiss(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Zurich" }).format(new Date())
}
