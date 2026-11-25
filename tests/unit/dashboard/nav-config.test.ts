import { describe, it, expect } from "vitest"
import { navSections } from "@/app/(dashboard)/_lib/nav-config"

describe("navigation config", () => {
  it("has all required sections", () => {
    const labels = navSections.map((s) => s.label)
    expect(labels).toEqual(["", "Betrieb", "Account"])
  })

  it("starts with the overview", () => {
    const main = navSections[0]!
    expect(main.items[0]!.label).toBe("Übersicht")
    expect(main.items[0]!.href).toBe("/dashboard")
    expect(main.items[0]!.permission).toBeUndefined()
  })

  it("includes all required navigation items", () => {
    const allItems = navSections.flatMap((s) => s.items)
    const labels = allItems.map((i) => i.label)
    for (const label of [
      "Anfragen",
      "Kunden",
      "Kalender",
      "Offerten",
      "Aufträge",
      "Zahlungsübersicht",
      "Mitarbeitende",
      "Fahrzeuge",
      "Profil & Einstellungen",
      "Team und Rechte",
    ]) {
      expect(labels).toContain(label)
    }
  })

  it("assigns permission keys to permission-gated items", () => {
    const allItems = navSections.flatMap((s) => s.items)
    const withPermission = allItems.filter((i) => i.permission !== undefined)

    expect(withPermission.length).toBeGreaterThan(0)

    const permKeys = withPermission.map((i) => i.permission)
    expect(permKeys).toContain("leads.view")
    expect(permKeys).toContain("customers.view")
    expect(permKeys).toContain("quotes.view")
    expect(permKeys).toContain("jobs.view")
    expect(permKeys).toContain("invoices.view")
    expect(permKeys).toContain("employees.view")
    expect(permKeys).toContain("vehicles.view")
  })

  it("shows only pages that exist", () => {
    const allItems = navSections.flatMap((s) => s.items)
    expect(allItems.filter((i) => i.future)).toHaveLength(0)
  })

  it("Dashboard has no permission gate (always visible)", () => {
    const dashboard = navSections[0]!.items[0]!
    expect(dashboard.permission).toBeUndefined()
  })

  it("every item has an icon", () => {
    const allItems = navSections.flatMap((s) => s.items)
    for (const item of allItems) {
      expect(item.icon).toBeDefined()
    }
  })

  it("every item has a unique href", () => {
    const allItems = navSections.flatMap((s) => s.items)
    const hrefs = allItems.map((i) => i.href)
    expect(new Set(hrefs).size).toBe(hrefs.length)
  })
})
