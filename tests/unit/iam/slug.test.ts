import { describe, it, expect, vi } from "vitest"
import { generateBaseSlug, uniqueSlug } from "@/modules/iam/lib/slug"

describe("generateBaseSlug", () => {
  it("lowercases and replaces spaces with hyphens", () => {
    expect(generateBaseSlug("Acme Movers")).toBe("acme-movers")
  })

  it("strips diacritics", () => {
    expect(generateBaseSlug("Déménagements Müller")).toBe("demenagements-muller")
  })

  it("collapses consecutive non-alphanumeric chars into one hyphen", () => {
    expect(generateBaseSlug("A & B -- Movers!")).toBe("a-b-movers")
  })

  it("trims leading and trailing hyphens", () => {
    expect(generateBaseSlug("  !!Moving Co!!  ")).toBe("moving-co")
  })

  it("truncates to 63 characters", () => {
    const long = "a".repeat(100)
    expect(generateBaseSlug(long)).toHaveLength(63)
  })

  it("handles numbers in company name", () => {
    expect(generateBaseSlug("123 Transport SA")).toBe("123-transport-sa")
  })

  it("handles already clean input", () => {
    expect(generateBaseSlug("fastmove")).toBe("fastmove")
  })
})

describe("uniqueSlug", () => {
  it("returns base slug when not taken", async () => {
    const existsFn = vi.fn().mockResolvedValue(false)
    expect(await uniqueSlug("acme", existsFn)).toBe("acme")
    expect(existsFn).toHaveBeenCalledWith("acme")
  })

  it("appends -2 on first collision", async () => {
    const existsFn = vi
      .fn()
      .mockResolvedValueOnce(true) // "acme" taken
      .mockResolvedValueOnce(false) // "acme-2" free
    expect(await uniqueSlug("acme", existsFn)).toBe("acme-2")
  })

  it("skips to -3 on double collision", async () => {
    const existsFn = vi
      .fn()
      .mockResolvedValueOnce(true) // "acme" taken
      .mockResolvedValueOnce(true) // "acme-2" taken
      .mockResolvedValueOnce(false) // "acme-3" free
    expect(await uniqueSlug("acme", existsFn)).toBe("acme-3")
  })

  it("throws after 999 attempts", async () => {
    const existsFn = vi.fn().mockResolvedValue(true)
    await expect(uniqueSlug("acme", existsFn)).rejects.toThrow(
      "Unable to generate a unique slug after 999 attempts",
    )
  })
})
