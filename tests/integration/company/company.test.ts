/**
 * Company module integration tests — profile, bank details, logo.
 *
 * Tests cover:
 *   - office users with settings.company may edit the profile; others may not
 *   - Swiss UID format is enforced, phone normalised
 *   - bank details need settings.banking; invalid IBANs are rejected; QR-IBAN detected
 *   - logo upload: real PNG stored and linked, previous file removed, disguised files rejected
 *
 * Requires local Supabase running with all migrations applied.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest"
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

// 1×1 transparent PNG
const PNG_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="

let svc: Svc
let companyId: string
let owner: TestUser
let profileEditor: TestUser
let reader: TestUser

const PROFILE = {
  name: "Muster Umzüge",
  legalName: "Muster Umzüge GmbH",
  vatNumber: "CHE-123.456.789",
  registrationNumber: "",
  addressLine1: "Industriestrasse 5",
  addressLine2: "",
  postalCode: "8305",
  city: "Dietlikon",
  country: "CH",
  email: "Info@Muster-Umzuege.example",
  phone: "044 555 12 34",
  website: "www.muster-umzuege.example",
  accentColor: "#1E40AF",
}

async function logoFiles(): Promise<string[]> {
  const { data } = await svc.storage.from("company-logos").list(companyId)
  return (data ?? []).map((f) => f.name)
}

describeWithDb("Company module", () => {
  beforeAll(async () => {
    svc = serviceClient()
    companyId = await createTestCompany(svc, `comp-${ts}`)
    owner = await createTestUser(svc, {
      email: `comp-owner-${ts}@bivro-test.dev`,
      companyId,
      role: "owner",
    })
    profileEditor = await createTestUser(svc, {
      email: `comp-editor-${ts}@bivro-test.dev`,
      companyId,
      role: "office",
      permissions: ["settings.company"],
    })
    reader = await createTestUser(svc, {
      email: `comp-reader-${ts}@bivro-test.dev`,
      companyId,
      role: "office",
      permissions: ["customers.view"],
    })
  })

  afterAll(async () => {
    const files = await logoFiles()
    if (files.length) {
      await svc.storage.from("company-logos").remove(files.map((f) => `${companyId}/${f}`))
    }
    await cleanupCompany(svc, companyId, [owner.id, profileEditor.id, reader.id])
  })

  it("lets users with settings.company edit the profile and normalises it", async () => {
    const editor = await callerFor(profileEditor)
    await editor.company.updateProfile(PROFILE)

    const profile = await editor.company.profile()
    expect(profile).toMatchObject({
      name: "Muster Umzüge",
      legalName: "Muster Umzüge GmbH",
      vatNumber: "CHE-123.456.789",
      email: "info@muster-umzuege.example",
      phone: "+41445551234",
      accentColor: "#1E40AF",
      registrationNumber: null,
    })
  })

  it("refuses profile changes without settings.company", async () => {
    const plain = await callerFor(reader)
    expect((await plain.company.profile()).name).toBe("Muster Umzüge")
    await expect(plain.company.updateProfile(PROFILE)).rejects.toThrow(
      /Missing permission: settings.company/,
    )
  })

  it("enforces the Swiss UID format", async () => {
    const caller = await callerFor(owner)
    await expect(
      caller.company.updateProfile({ ...PROFILE, vatNumber: "123456789" }),
    ).rejects.toThrow(/CHE-123.456.789/)
  })

  it("requires settings.banking and a valid IBAN for bank details", async () => {
    const editor = await callerFor(profileEditor)
    await expect(
      editor.company.updateBank({ bankIban: "CH93 0076 2011 6238 5295 7" }),
    ).rejects.toThrow(/Missing permission: settings.banking/)

    const caller = await callerFor(owner)
    await expect(
      caller.company.updateBank({ bankIban: "CH94 0076 2011 6238 5295 7" }),
    ).rejects.toThrow(/not valid/)

    const result = await caller.company.updateBank({
      bankIban: "ch44 3199 9123 0008 8901 2",
      bankBic: "posofichbexx",
      bankPayeeName: "Muster Umzüge GmbH",
    })
    expect(result.isQrIban).toBe(true)

    const profile = await caller.company.profile()
    expect(profile).toMatchObject({
      bankIban: "CH4431999123000889012",
      bankBic: "POSOFICHBEXX",
      isQrIban: true,
    })
  })

  it("stores a real image as logo and replaces the previous file", async () => {
    const caller = await callerFor(owner)
    const first = await caller.company.uploadLogo({ dataUrl: PNG_DATA_URL })
    expect(first.logoUrl).toContain(`/company-logos/${companyId}/logo-`)
    expect(await logoFiles()).toHaveLength(1)

    const response = await fetch(first.logoUrl)
    expect(response.status).toBe(200)
    expect(response.headers.get("content-type")).toBe("image/png")

    const second = await caller.company.uploadLogo({ dataUrl: PNG_DATA_URL })
    expect(second.logoUrl).not.toBe(first.logoUrl)
    expect(await logoFiles()).toHaveLength(1)
    expect((await caller.company.profile()).logoUrl).toBe(second.logoUrl)
  })

  it("rejects files that are not images, whatever their declared type", async () => {
    const caller = await callerFor(owner)
    const svgAsPng = `data:image/png;base64,${Buffer.from("<svg onload=alert(1)>").toString("base64")}`
    await expect(caller.company.uploadLogo({ dataUrl: svgAsPng })).rejects.toThrow(
      /PNG, JPEG or WebP/,
    )
  })

  it("removes the logo", async () => {
    const caller = await callerFor(owner)
    await caller.company.removeLogo()
    expect((await caller.company.profile()).logoUrl).toBeNull()
    expect(await logoFiles()).toHaveLength(0)
  })
})
