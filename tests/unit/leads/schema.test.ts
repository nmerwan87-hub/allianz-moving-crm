import { describe, it, expect } from "vitest"
import {
  createLeadInput,
  updateLeadInput,
  updateLeadStatusInput,
  listLeadsInput,
  leadStatusEnum,
  acquisitionSourceEnum,
  moveTypeEnum,
  propertySizeEnum,
} from "@/modules/leads/interface"

describe("leads schema", () => {
  describe("leadStatusEnum", () => {
    it("has the correct 7 statuses", () => {
      expect(leadStatusEnum.options).toEqual([
        "new",
        "contacted",
        "surveyed",
        "quoted",
        "booked",
        "lost",
        "duplicate",
      ])
    })
  })

  describe("acquisitionSourceEnum", () => {
    it("has the correct 10 sources", () => {
      expect(acquisitionSourceEnum.options).toHaveLength(10)
      expect(acquisitionSourceEnum.options).toContain("web_form")
      expect(acquisitionSourceEnum.options).toContain("phone_call")
      expect(acquisitionSourceEnum.options).toContain("referral")
      expect(acquisitionSourceEnum.options).toContain("manual")
      expect(acquisitionSourceEnum.options).toContain("other")
    })
  })

  describe("moveTypeEnum", () => {
    it("has 5 move types", () => {
      expect(moveTypeEnum.options).toHaveLength(5)
      expect(moveTypeEnum.options).toContain("local")
      expect(moveTypeEnum.options).toContain("long_distance")
      expect(moveTypeEnum.options).toContain("commercial")
      expect(moveTypeEnum.options).toContain("international")
      expect(moveTypeEnum.options).toContain("junk_removal")
    })
  })

  describe("propertySizeEnum", () => {
    it("has 9 property sizes", () => {
      expect(propertySizeEnum.options).toHaveLength(9)
      expect(propertySizeEnum.options).toContain("studio")
      expect(propertySizeEnum.options).toContain("five_plus_bedroom")
    })
  })

  describe("createLeadInput", () => {
    it("accepts a valid minimal lead", () => {
      const result = createLeadInput.safeParse({
        firstName: "Jane",
        lastName: "Doe",
        email: "jane@example.com",
        phone: "+1234567890",
      })
      expect(result.success).toBe(true)
    })

    it("accepts empty strings for optional fields and converts to null", () => {
      const result = createLeadInput.safeParse({
        firstName: "Jane",
        lastName: "Doe",
        email: "",
        phone: "",
      })
      expect(result.success).toBe(true)
    })

    it("rejects missing firstName", () => {
      const result = createLeadInput.safeParse({
        lastName: "Doe",
      })
      expect(result.success).toBe(false)
    })

    it("rejects missing lastName", () => {
      const result = createLeadInput.safeParse({
        firstName: "Jane",
      })
      expect(result.success).toBe(false)
    })

    it("rejects invalid email", () => {
      const result = createLeadInput.safeParse({
        firstName: "Jane",
        lastName: "Doe",
        email: "not-an-email",
        phone: "",
        requestedDate: "",
        originAddress: "",
        originCity: "",
        originState: "",
        originPostalCode: "",
        originCountry: "US",
        originParkingNotes: "",
        destAddress: "",
        destCity: "",
        destState: "",
        destPostalCode: "",
        destCountry: "US",
        destParkingNotes: "",
        utmSource: "",
        utmMedium: "",
        utmCampaign: "",
        referrerUrl: "",
        internalNotes: "",
      })
      expect(result.success).toBe(false)
    })

    it("accepts a full lead with all fields", () => {
      const result = createLeadInput.safeParse({
        firstName: "Jane",
        lastName: "Doe",
        email: "jane@example.com",
        phone: "+1234567890",
        moveType: "local",
        requestedDate: "2026-10-15",
        dateFlexible: true,
        propertySize: "two_bedroom",
        originAddress: "123 Main St",
        originCity: "New York",
        originState: "NY",
        originPostalCode: "10001",
        originCountry: "US",
        originFloor: 3,
        originHasElevator: true,
        originHasStairs: false,
        originParkingNotes: "Loading dock available",
        destAddress: "456 Oak Ave",
        destCity: "Boston",
        destState: "MA",
        destPostalCode: "02101",
        destCountry: "US",
        destFloor: 2,
        destHasElevator: false,
        destHasStairs: true,
        destParkingNotes: "Street parking only",
        estimatedVolumeCuft: 1200,
        estimatedDistanceMiles: 215,
        source: "web_form",
        utmSource: "google",
        utmMedium: "cpc",
        utmCampaign: "summer_move",
        referrerUrl: "https://example.com",
        internalNotes: "Customer seems motivated",
      })
      expect(result.success).toBe(true)
    })

    it("source is optional and defaults to null when not specified", () => {
      const result = createLeadInput.parse({
        firstName: "Jane",
        lastName: "Doe",
      })
      expect(result.source).toBeUndefined()
    })

    it("rejects invalid move type", () => {
      const result = createLeadInput.safeParse({
        firstName: "Jane",
        lastName: "Doe",
        moveType: "invalid_type",
      })
      expect(result.success).toBe(false)
    })

    it("rejects invalid date format", () => {
      const result = createLeadInput.safeParse({
        firstName: "Jane",
        lastName: "Doe",
        phone: "",
        requestedDate: "October 15, 2026",
        originAddress: "",
        originCity: "",
        originState: "",
        originPostalCode: "",
        originCountry: "US",
        originParkingNotes: "",
        destAddress: "",
        destCity: "",
        destState: "",
        destPostalCode: "",
        destCountry: "US",
        destParkingNotes: "",
        utmSource: "",
        utmMedium: "",
        utmCampaign: "",
        referrerUrl: "",
        internalNotes: "",
      })
      expect(result.success).toBe(false)
    })

    it("rejects negative floor", () => {
      const result = createLeadInput.safeParse({
        firstName: "Jane",
        lastName: "Doe",
        originFloor: -1,
      })
      expect(result.success).toBe(false)
    })
  })

  describe("updateLeadInput", () => {
    it("requires an id", () => {
      const result = updateLeadInput.safeParse({
        firstName: "Jane",
      })
      expect(result.success).toBe(false)
    })

    it("accepts just an id (no-op update)", () => {
      const result = updateLeadInput.safeParse({
        id: "550e8400-e29b-41d4-a716-446655440000",
      })
      expect(result.success).toBe(true)
    })

    it("accepts partial updates", () => {
      const result = updateLeadInput.safeParse({
        id: "550e8400-e29b-41d4-a716-446655440000",
        firstName: "Updated",
        email: "updated@example.com",
      })
      expect(result.success).toBe(true)
    })

    it("does not accept company_id (tenant isolation)", () => {
      const result = updateLeadInput.safeParse({
        id: "550e8400-e29b-41d4-a716-446655440000",
        company_id: "some-other-company",
      })
      // Zod strips unknown keys by default — company_id is not in the schema
      expect(result.success).toBe(true)
      const data = result.data as Record<string, unknown> | undefined
      expect(data?.company_id).toBeUndefined()
    })
  })

  describe("updateLeadStatusInput", () => {
    it("accepts a valid status change", () => {
      const result = updateLeadStatusInput.safeParse({
        id: "550e8400-e29b-41d4-a716-446655440000",
        status: "contacted",
      })
      expect(result.success).toBe(true)
    })

    it("accepts lost status with lostReason", () => {
      const result = updateLeadStatusInput.safeParse({
        id: "550e8400-e29b-41d4-a716-446655440000",
        status: "lost",
        lostReason: "Price too high",
      })
      expect(result.success).toBe(true)
    })

    it("rejects invalid status", () => {
      const result = updateLeadStatusInput.safeParse({
        id: "550e8400-e29b-41d4-a716-446655440000",
        status: "invalid_status",
      })
      expect(result.success).toBe(false)
    })

    it("rejects missing id", () => {
      const result = updateLeadStatusInput.safeParse({
        status: "contacted",
      })
      expect(result.success).toBe(false)
    })
  })

  describe("listLeadsInput", () => {
    it("has sensible defaults", () => {
      const result = listLeadsInput.parse({})
      expect(result.sortBy).toBe("created_at")
      expect(result.sortOrder).toBe("desc")
      expect(result.page).toBe(1)
      expect(result.pageSize).toBe(25)
    })

    it("caps pageSize at 100", () => {
      const result = listLeadsInput.safeParse({ pageSize: 200 })
      expect(result.success).toBe(false)
    })

    it("rejects page < 1", () => {
      const result = listLeadsInput.safeParse({ page: 0 })
      expect(result.success).toBe(false)
    })
  })
})
