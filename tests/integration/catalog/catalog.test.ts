/**
 * Catalog module integration tests — services, rate cards, pricing settings.
 *
 * Tests cover:
 *   - provisioning seeds 19 valid standard services and Swiss settings (MWST 8.1 %)
 *   - office users without settings.services can read but not change anything
 *   - unique service names per company (case-insensitive)
 *   - deactivate, reorder (must contain the whole category)
 *   - removal rules: standard → refused, unused custom → deleted, used custom → archived
 *   - rate cards CRUD and tenant isolation
 *   - pricing settings round-trip
 *
 * Requires local Supabase running with all migrations applied.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { provisionCompany } from "@/modules/iam/lib/provisioning"
import {
  HAS_LOCAL_DB,
  serviceClient,
  createTestCompany,
  createTestUser,
  callerFor,
  cleanupCompany,
  type Svc,
  type TestUser,
} from "../_helpers"

const describeWithDb = HAS_LOCAL_DB ? describe : describe.skip
const ts = Date.now()

let svc: Svc
let companyA: string
let companyB: string
let ownerA: TestUser
let viewerA: TestUser
let ownerB: TestUser
let owner: Awaited<ReturnType<typeof callerFor>>

const SERVICE = {
  category: "Spezialleistungen",
  description: "Internal",
  customerDescription: "Für den Kunden",
  defaultPricingMode: "fixed" as const,
  defaultUnitLabel: "Pauschale",
  defaultUnitPriceCents: 35000,
  defaultCostPriceCents: 20000,
  defaultVatRatePercent: 8.1,
}

describeWithDb("Catalog module", () => {
  beforeAll(async () => {
    svc = serviceClient()
    companyA = await createTestCompany(svc, `cat-a-${ts}`)
    companyB = await createTestCompany(svc, `cat-b-${ts}`)
    await provisionCompany(companyA)
    await provisionCompany(companyB)

    ownerA = await createTestUser(svc, {
      email: `cat-owner-a-${ts}@bivro-test.dev`,
      companyId: companyA,
      role: "owner",
    })
    viewerA = await createTestUser(svc, {
      email: `cat-viewer-a-${ts}@bivro-test.dev`,
      companyId: companyA,
      role: "office",
      permissions: ["customers.view"],
    })
    ownerB = await createTestUser(svc, {
      email: `cat-owner-b-${ts}@bivro-test.dev`,
      companyId: companyB,
      role: "owner",
    })
    owner = await callerFor(ownerA)
  })

  afterAll(async () => {
    for (const companyId of [companyA, companyB]) {
      for (const table of [
        "permission_group_assignments",
        "user_permission_groups",
        "permission_groups",
        "email_automations",
        "email_template_versions",
        "email_templates",
        "email_sender_identities",
        "company_settings",
      ]) {
        await svc.from(table).delete().eq("company_id", companyId)
      }
    }
    await cleanupCompany(svc, companyA, [ownerA.id, viewerA.id])
    await cleanupCompany(svc, companyB, [ownerB.id])
  })

  describe("provisioning", () => {
    it("seeds 19 valid standard services and Swiss pricing settings", async () => {
      const services = await owner.catalog.services.list()
      expect(services).toHaveLength(19)
      expect(services.every((s) => s.isSystemDefault && s.isActive)).toBe(true)
      expect(services.every((s) => s.defaultVatRatePercent === 8.1)).toBe(true)
      expect(services.find((s) => s.name === "Entsorgung")).toMatchObject({
        defaultPricingMode: "quantity",
        defaultUnitLabel: "m³",
      })

      const settings = await owner.catalog.pricingSettings.get()
      expect(settings).toMatchObject({
        taxEnabled: true,
        taxRatePercent: 8.1,
        taxLabel: "MWST",
        defaultPaymentTermsDays: 30,
      })
    })

    it("is idempotent", async () => {
      await provisionCompany(companyA)
      expect(await owner.catalog.services.list()).toHaveLength(19)
    })
  })

  describe("services", () => {
    let customId: string

    it("lets office users without settings.services read but not write", async () => {
      const viewer = await callerFor(viewerA)
      expect(await viewer.catalog.services.list()).toHaveLength(19)
      await expect(viewer.catalog.services.create({ ...SERVICE, name: "Nope" })).rejects.toThrow(
        /Missing permission: settings.services/,
      )
    })

    it("creates custom services with unique names", async () => {
      const { id } = await owner.catalog.services.create({ ...SERVICE, name: "Aquarium-Transport" })
      customId = id

      await expect(
        owner.catalog.services.create({ ...SERVICE, name: "aquarium-transport" }),
      ).rejects.toThrow(/already exists/)

      const created = (await owner.catalog.services.list()).find((s) => s.id === id)
      expect(created).toMatchObject({
        isSystemDefault: false,
        defaultUnitPriceCents: 35000,
        customerDescription: "Für den Kunden",
      })
    })

    it("deactivates and reactivates", async () => {
      await owner.catalog.services.setActive({ id: customId, isActive: false })
      let service = (await owner.catalog.services.list()).find((s) => s.id === customId)
      expect(service?.isActive).toBe(false)

      await owner.catalog.services.setActive({ id: customId, isActive: true })
      service = (await owner.catalog.services.list()).find((s) => s.id === customId)
      expect(service?.isActive).toBe(true)
    })

    it("reorders a whole category only", async () => {
      const inCategory = (await owner.catalog.services.list()).filter(
        (s) => s.category === "Spezialleistungen",
      )
      const reversed = inCategory.map((s) => s.id).reverse()

      await expect(
        owner.catalog.services.reorder({ category: "Spezialleistungen", orderedIds: [customId] }),
      ).rejects.toThrow(/every service of the category/)

      await owner.catalog.services.reorder({ category: "Spezialleistungen", orderedIds: reversed })
      const after = (await owner.catalog.services.list())
        .filter((s) => s.category === "Spezialleistungen")
        .map((s) => s.id)
      expect(after).toEqual(reversed)
    })

    it("refuses to remove standard services", async () => {
      const standard = (await owner.catalog.services.list()).find((s) => s.isSystemDefault)!
      await expect(owner.catalog.services.remove({ id: standard.id })).rejects.toThrow(
        /cannot be removed/,
      )
    })

    it("deletes unused custom services and archives used ones", async () => {
      const { id: unused } = await owner.catalog.services.create({ ...SERVICE, name: "Unused" })
      expect(await owner.catalog.services.remove({ id: unused })).toEqual({ result: "deleted" })
      const { data: gone } = await svc.from("service_catalog").select("id").eq("id", unused)
      expect(gone).toEqual([])

      const { data: quote } = await svc
        .from("quotes")
        .insert({ company_id: companyA, quote_number: `QT-CAT-${ts}`, move_type: "local" })
        .select("id")
        .single()
      await svc.from("quote_items").insert({
        company_id: companyA,
        quote_id: quote!.id,
        service_catalog_id: customId,
        item_type: "specialty",
        name: "Aquarium-Transport",
        unit_price_cents: 35000,
      })

      expect(await owner.catalog.services.remove({ id: customId })).toEqual({ result: "archived" })
      expect((await owner.catalog.services.list()).map((s) => s.id)).not.toContain(customId)
      const { data: archived } = await svc
        .from("service_catalog")
        .select("deleted_at")
        .eq("id", customId)
        .single()
      expect(archived?.deleted_at).not.toBeNull()
    })
  })

  describe("rate cards", () => {
    it("creates, updates, lists and removes rate cards", async () => {
      const { id } = await owner.catalog.rateCards.create({
        name: "2 Mann + Lieferwagen",
        crewSize: 2,
        vehicleType: "cargo_van",
        hourlyRateCents: 15000,
        hourlyCostCents: 9000,
        isActive: true,
      })

      await owner.catalog.rateCards.update({
        id,
        name: "2 Mann + Lieferwagen",
        crewSize: 2,
        vehicleType: "cargo_van",
        hourlyRateCents: 16000,
        hourlyCostCents: 9000,
        isActive: true,
      })
      expect(await owner.catalog.rateCards.list()).toEqual([
        expect.objectContaining({ id, hourlyRateCents: 16000, crewSize: 2 }),
      ])

      const other = await callerFor(ownerB)
      expect(await other.catalog.rateCards.list()).toEqual([])
      await expect(
        other.catalog.rateCards.update({
          id,
          name: "Hijack",
          crewSize: 2,
          vehicleType: null,
          hourlyRateCents: 1,
          hourlyCostCents: 0,
          isActive: true,
        }),
      ).rejects.toThrow(/Rate not found/)

      await owner.catalog.rateCards.remove({ id })
      expect(await owner.catalog.rateCards.list()).toEqual([])
    })
  })

  describe("pricing settings", () => {
    it("round-trips all fields", async () => {
      const settings = {
        minimumHours: 3,
        minimumChargeCents: 45000,
        travelFlatFeeCents: 12000,
        ratePerKmCents: 250,
        stairCarryRateCents: 3000,
        longCarryRateCents: 5000,
        elevatorWaitRateCents: 4000,
        weekendSurchargePercent: 25,
        fuelSurchargePercent: 0,
        defaultDepositPercent: 30,
        defaultQuoteExpiryDays: 14,
        defaultPaymentTermsDays: 30,
        taxEnabled: true,
        taxRatePercent: 8.1,
        taxLabel: "MWST",
      }
      await owner.catalog.pricingSettings.update(settings)
      expect(await owner.catalog.pricingSettings.get()).toEqual(settings)

      const viewer = await callerFor(viewerA)
      await expect(viewer.catalog.pricingSettings.update(settings)).rejects.toThrow(
        /Missing permission/,
      )
    })
  })
})
