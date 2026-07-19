import { describe, it, expect, beforeEach, vi } from "vitest"

describe("env validation", () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it("validateClientEnv throws when required NEXT_PUBLIC vars are missing", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "")
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "")
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "")
    vi.stubEnv("NEXT_PUBLIC_ADMIN_URL", "")
    vi.stubEnv("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY", "")

    const { validateClientEnv } = await import("../../lib/env")
    expect(() => validateClientEnv()).toThrow()

    vi.unstubAllEnvs()
  })

  it("validateClientEnv succeeds with valid values", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://test.supabase.co")
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "test-anon-key")
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.bivro.io")
    vi.stubEnv("NEXT_PUBLIC_ADMIN_URL", "https://admin.bivro.io")
    vi.stubEnv("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY", "pk_test_key")

    const { validateClientEnv } = await import("../../lib/env")
    const env = validateClientEnv()

    expect(env.NEXT_PUBLIC_SUPABASE_URL).toBe("https://test.supabase.co")
    expect(env.NEXT_PUBLIC_APP_URL).toBe("https://app.bivro.io")

    vi.unstubAllEnvs()
  })
})
