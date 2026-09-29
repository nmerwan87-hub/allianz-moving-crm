import { describe, it, expect } from "vitest"
import { buttonVariants } from "@/app/(dashboard)/_components/ui/button"
import { badgeVariants } from "@/app/(dashboard)/_components/ui/badge"

describe("Button variants", () => {
  it("returns classes for primary variant", () => {
    const classes = buttonVariants({ variant: "primary" })
    expect(classes).toContain("bg-ink-900")
    expect(classes).toContain("text-text-inverse")
  })

  it("returns classes for secondary variant", () => {
    const classes = buttonVariants({ variant: "secondary" })
    expect(classes).toContain("bg-surface-raised")
    expect(classes).toContain("border")
  })

  it("returns classes for danger variant", () => {
    const classes = buttonVariants({ variant: "danger" })
    expect(classes).toContain("bg-danger-700")
  })

  it("returns classes for ghost variant", () => {
    const classes = buttonVariants({ variant: "ghost" })
    expect(classes).toContain("text-text-secondary")
  })

  it("applies size variants", () => {
    const sm = buttonVariants({ size: "sm" })
    const md = buttonVariants({ size: "md" })
    const lg = buttonVariants({ size: "lg" })
    expect(sm).toContain("h-8")
    expect(md).toContain("h-9")
    expect(lg).toContain("h-10")
  })

  it("defaults to primary/md", () => {
    const classes = buttonVariants()
    expect(classes).toContain("bg-ink-900")
    expect(classes).toContain("h-9")
  })
})

describe("Badge variants", () => {
  it("returns classes for success variant", () => {
    const classes = badgeVariants({ variant: "success" })
    expect(classes).toContain("bg-success-100")
    expect(classes).toContain("text-success-700")
  })

  it("returns classes for danger variant", () => {
    const classes = badgeVariants({ variant: "danger" })
    expect(classes).toContain("bg-danger-100")
    expect(classes).toContain("text-danger-700")
  })

  it("returns classes for ai variant", () => {
    const classes = badgeVariants({ variant: "ai" })
    expect(classes).toContain("bg-ai-100")
    expect(classes).toContain("text-ai-600")
  })

  it("defaults to default variant", () => {
    const classes = badgeVariants()
    expect(classes).toContain("bg-ink-100")
  })
})
