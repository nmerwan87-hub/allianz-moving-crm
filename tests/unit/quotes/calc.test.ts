import { describe, it, expect } from "vitest"
import { calcLine, calcTotals, roundCents } from "@/lib/quotes/calc"

// Same lines as tests/integration/quotes — the database must produce identical numbers
const LINES = [
  {
    pricingMode: "hourly" as const,
    quantity: 8,
    unitPriceCents: 19500,
    costPriceCents: 12000,
    vatRatePercent: 8.1,
  },
  {
    pricingMode: "fixed" as const,
    quantity: 1,
    unitPriceCents: 20000,
    costPriceCents: 8000,
    vatRatePercent: 8.1,
  },
  {
    pricingMode: "quantity" as const,
    quantity: 2,
    unitPriceCents: 8000,
    costPriceCents: 3000,
    discountType: "percent" as const,
    discountValue: 10,
    vatRatePercent: 8.1,
  },
  { pricingMode: "fixed" as const, quantity: 1, unitPriceCents: 12000, vatRatePercent: 0 },
]

describe("quote calculation preview", () => {
  it("rounds half away from zero to the Rappen", () => {
    expect(roundCents(1166.4)).toBe(1166)
    expect(roundCents(1166.5)).toBe(1167)
    expect(roundCents(-2.5)).toBe(-3)
  })

  it("matches the database totals", () => {
    const totals = calcTotals(LINES, 20)
    expect(totals).toMatchObject({
      subtotalCents: 204000,
      discountCents: 1600,
      taxCents: 15422,
      totalCents: 217822,
      depositCents: 43564,
      costCents: 110000,
    })
    expect(totals.vatByRate).toEqual([{ rate: 8.1, baseCents: 190400, vatCents: 15422 }])
  })

  it("treats fixed discounts as CHF and manual lines as one unit", () => {
    expect(
      calcLine({
        pricingMode: "fixed",
        quantity: 1,
        unitPriceCents: 50000,
        discountType: "fixed",
        discountValue: 50,
        vatRatePercent: 0,
      }),
    ).toMatchObject({ discountCents: 5000, netCents: 45000 })
    expect(
      calcLine({ pricingMode: "manual", quantity: 7, unitPriceCents: 1000, vatRatePercent: 0 })
        .netCents,
    ).toBe(1000)
  })

  it("never discounts more than the line amount", () => {
    expect(
      calcLine({
        pricingMode: "fixed",
        quantity: 1,
        unitPriceCents: 1000,
        discountType: "fixed",
        discountValue: 50,
        vatRatePercent: 0,
      }).netCents,
    ).toBe(0)
  })
})
