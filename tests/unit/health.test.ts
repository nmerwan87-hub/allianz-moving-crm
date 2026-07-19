import { describe, it, expect } from "vitest"
import { GET } from "../../app/api/health/route"

describe("GET /api/health", () => {
  it("returns status ok with ISO timestamp", async () => {
    const response = GET()
    const body = await response.json()

    expect(body.status).toBe("ok")
    expect(typeof body.timestamp).toBe("string")
    expect(new Date(body.timestamp as string).toISOString()).toBe(body.timestamp)
  })
})
