import { describe, it, expect } from "vitest"
import { navSections } from "@/app/(dashboard)/_lib/nav-config"
import type { NavItem } from "@/app/(dashboard)/_lib/nav-config"

describe("navigation config", () => {
  it("has all required sections", () => {
    const labels = navSections.map((s) => s.label)
    expect(labels).toEqual(["Main", "Operations", "Finance", "Workspace", "Settings"])
  })

  it("includes Dashboard as the first item in Main", () => {
    const main = navSections[0]!
    expect(main.items[0]!.label).toBe("Dashboard")
    expect(main.items[0]!.href).toBe("/dashboard")
    expect(main.items[0]!.permission).toBeUndefined()
  })

  it("includes all required navigation items", () => {
    const allItems = navSections.flatMap((s) => s.items)
    const labels = allItems.map((i) => i.label)
    expect(labels).toContain("Leads")
    expect(labels).toContain("Customers")
    expect(labels).toContain("Calendar")
    expect(labels).toContain("Quotes")
    expect(labels).toContain("Jobs")
    expect(labels).toContain("Employees")
    expect(labels).toContain("Vehicles")
    expect(labels).toContain("Invoices")
    expect(labels).toContain("Documents")
    expect(labels).toContain("Tasks")
    expect(labels).toContain("Communications")
    expect(labels).toContain("Settings")
    expect(labels).toContain("Team & Permissions")
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

  it("marks future modules correctly", () => {
    const allItems = navSections.flatMap((s) => s.items)
    const leads = allItems.find((i) => i.label === "Leads") as NavItem
    const dashboard = allItems.find((i) => i.label === "Dashboard") as NavItem
    const team = allItems.find((i) => i.label === "Team & Permissions") as NavItem

    expect(leads.future).toBeUndefined()
    expect(dashboard.future).toBeUndefined()
    expect(team.future).toBeUndefined()
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
