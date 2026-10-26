/**
 * Live preview of quote totals while editing. Mirrors the database functions
 * compute_quote_item() / compute_quote_totals() (migration 028) — the
 * database result is authoritative and replaces this preview after saving.
 * tests/unit/quotes/calc.test.ts and the quotes integration test pin both to
 * the same numbers.
 */

export interface CalcLine {
  pricingMode: "fixed" | "hourly" | "quantity" | "distance" | "manual"
  quantity: number
  unitPriceCents: number
  costPriceCents?: number | null
  /** percent, or CHF for "fixed" (as entered in the editor) */
  discountType?: "percent" | "fixed" | null
  discountValue?: number | null
  vatRatePercent: number
}

export interface CalcLineResult {
  subtotalCents: number
  discountCents: number
  netCents: number
  vatCents: number
  grossCents: number
}

export interface CalcTotals {
  subtotalCents: number
  discountCents: number
  netCents: number
  taxCents: number
  totalCents: number
  depositCents: number
  costCents: number
  vatByRate: Array<{ rate: number; baseCents: number; vatCents: number }>
}

/** Half away from zero — same as public.round_cents(). */
export function roundCents(value: number): number {
  return Math.sign(value) * Math.floor(Math.abs(value) + 0.5 + 1e-9)
}

export function calcLine(line: CalcLine): CalcLineResult {
  const quantity = line.pricingMode === "manual" ? 1 : line.quantity
  const subtotal = roundCents(quantity * line.unitPriceCents)
  const value = line.discountValue ?? 0
  const discount =
    line.discountType === "percent"
      ? roundCents((subtotal * value) / 100)
      : line.discountType === "fixed"
        ? roundCents(value * 100)
        : 0
  const net = subtotal - Math.min(discount, subtotal)
  const vat = roundCents((net * line.vatRatePercent) / 100)
  return {
    subtotalCents: subtotal,
    discountCents: subtotal - net,
    netCents: net,
    vatCents: vat,
    grossCents: net + vat,
  }
}

export function calcTotals(lines: CalcLine[], depositPercent: number): CalcTotals {
  const vat = new Map<number, { baseCents: number; vatCents: number }>()
  let subtotal = 0
  let discount = 0
  let tax = 0
  let cost = 0

  for (const line of lines) {
    const r = calcLine(line)
    subtotal += r.subtotalCents
    discount += r.discountCents
    tax += r.vatCents
    cost += roundCents(
      (line.pricingMode === "manual" ? 1 : line.quantity) * (line.costPriceCents ?? 0),
    )
    if (line.vatRatePercent > 0) {
      const entry = vat.get(line.vatRatePercent) ?? { baseCents: 0, vatCents: 0 }
      entry.baseCents += r.netCents
      entry.vatCents += r.vatCents
      vat.set(line.vatRatePercent, entry)
    }
  }

  const total = subtotal - discount + tax
  return {
    subtotalCents: subtotal,
    discountCents: discount,
    netCents: subtotal - discount,
    taxCents: tax,
    totalCents: total,
    depositCents: roundCents((total * depositPercent) / 100),
    costCents: cost,
    vatByRate: [...vat.entries()].sort(([a], [b]) => b - a).map(([rate, v]) => ({ rate, ...v })),
  }
}
