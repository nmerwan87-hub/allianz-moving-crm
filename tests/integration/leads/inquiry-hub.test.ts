/**
 * Inquiry hub integration tests — real tRPC procedures, RLS and storage.
 *
 * Tests cover:
 *   - inquiry details: questionnaire, inventory and wished services are stored and validated
 *   - calendar: home visits linked to an inquiry, Swiss local times, confirmation, soft delete
 *   - calendar: jobs and appointments only for users with the matching view permission
 *   - attachments: two-step upload, list, signed download URL, removal
 *   - attachments: foreign paths and missing files are refused, other tenants see nothing
 *   - overview statistics: inquiries in the period, tenant-scoped, invalid ranges refused
 *
 * Requires local Supabase.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { provisionCompany } from "@/modules/iam/lib/provisioning"
import { isoToZurich } from "@/lib/format/zurich-time"
import {
  HAS_LOCAL_DB,
  serviceClient,
  signIn,
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
let jobsOnlyA: TestUser
let ownerB: TestUser
let owner: Awaited<ReturnType<typeof callerFor>>
let leadId: string

/** Swiss calendar date n days from today (the app counts days in Europe/Zurich). */
function inDays(n: number): string {
  const today = isoToZurich(new Date().toISOString()).date
  const d = new Date(`${today}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

describeWithDb("Inquiry hub", () => {
  beforeAll(async () => {
    svc = serviceClient()
    companyA = await createTestCompany(svc, `hub-a-${ts}`)
    companyB = await createTestCompany(svc, `hub-b-${ts}`)
    await provisionCompany(companyA)
    await provisionCompany(companyB)
    ownerA = await createTestUser(svc, {
      email: `hub-owner-a-${ts}@bivro-test.dev`,
      companyId: companyA,
      role: "owner",
    })
    jobsOnlyA = await createTestUser(svc, {
      email: `hub-jobs-a-${ts}@bivro-test.dev`,
      companyId: companyA,
      role: "office",
      permissions: ["jobs.view"],
    })
    ownerB = await createTestUser(svc, {
      email: `hub-owner-b-${ts}@bivro-test.dev`,
      companyId: companyB,
      role: "owner",
    })
    owner = await callerFor(ownerA)
    ;({ id: leadId } = await owner.leads.create({
      firstName: "Anna",
      lastName: "Muster",
      email: "anna.muster@example.com",
      rooms: 3.5,
      dateFlexible: false,
      originCity: "Zürich",
      destCity: "Bern",
    }))
  })

  afterAll(async () => {
    await cleanupCompany(svc, companyA, [ownerA.id, jobsOnlyA.id])
    await cleanupCompany(svc, companyB, [ownerB.id])
  })

  describe("inquiry details", () => {
    it("stores questionnaire, inventory and wished services", async () => {
      await owner.leads.updateDetails({
        id: leadId,
        rooms: 4.5,
        questionnaire: {
          origin: { dwelling: "flat", liftSize: "none", parkingDistanceM: 20, outsideSteps: 4 },
          dest: { dwelling: "maisonette", liftSize: "medium" },
          boxes: 40,
        },
        inventory: [
          { room: "Wohnzimmer", item: "Sofa", quantity: 1, note: "3-Sitzer" },
          { room: "Küche", item: "Kühlschrank", quantity: 1, note: "" },
        ],
        wishedServices: [{ name: "Endreinigung", quantity: null }],
      })
      const lead = await owner.leads.getById({ id: leadId })
      expect(lead.rooms).toBe(4.5)
      expect(lead.questionnaire.origin?.liftSize).toBe("none")
      expect(lead.questionnaire.boxes).toBe(40)
      expect(lead.inventory).toHaveLength(2)
      expect(lead.inventory[0]?.item).toBe("Sofa")
      expect(lead.wishedServices.map((s) => s.name)).toEqual(["Endreinigung"])
    })

    it("rejects an inventory row without an item", async () => {
      await expect(
        owner.leads.updateDetails({
          id: leadId,
          inventory: [{ room: "Keller", item: "", quantity: 1, note: "" }],
        }),
      ).rejects.toThrow(/Gegenstand fehlt/)
    })
  })

  describe("calendar", () => {
    let visitId: string

    it("creates a home visit for the inquiry in Swiss local time", async () => {
      ;({ id: visitId } = await owner.calendar.create({
        title: "Hausbesuch Muster",
        kind: "site_visit",
        date: inDays(3),
        startTime: "14:30",
        durationMinutes: 90,
        leadId,
        confirmed: false,
      }))
      const events = await owner.calendar.events({ from: inDays(0), to: inDays(7) })
      const visit = events.find((e) => e.id === visitId)
      expect(visit).toMatchObject({
        kind: "site_visit",
        date: inDays(3),
        startTime: "14:30",
        endTime: "16:00",
        confirmed: false,
        leadId,
      })
      const forLead = await owner.calendar.forLead({ leadId })
      expect(forLead.map((e) => e.id)).toContain(visitId)
    })

    it("allows own appointments without an inquiry", async () => {
      const { id } = await owner.calendar.create({
        title: "Fahrzeugservice",
        kind: "other",
        date: inDays(5),
        startTime: "08:00",
        durationMinutes: 60,
        confirmed: true,
      })
      const events = await owner.calendar.events({ from: inDays(5), to: inDays(5) })
      expect(events.find((e) => e.id === id)).toMatchObject({ kind: "other", confirmed: true })
    })

    it("confirms and un-confirms an appointment", async () => {
      await owner.calendar.setConfirmed({ id: visitId, confirmed: true })
      let events = await owner.calendar.events({ from: inDays(3), to: inDays(3) })
      expect(events.find((e) => e.id === visitId)?.confirmed).toBe(true)
      await owner.calendar.setConfirmed({ id: visitId, confirmed: false })
      events = await owner.calendar.events({ from: inDays(3), to: inDays(3) })
      expect(events.find((e) => e.id === visitId)?.confirmed).toBe(false)
    })

    it("hides appointments from users without leads.view", async () => {
      const jobsOnly = await callerFor(jobsOnlyA)
      const events = await jobsOnly.calendar.events({ from: inDays(0), to: inDays(7) })
      expect(events.some((e) => e.source === "appointment")).toBe(false)
      await expect(jobsOnly.calendar.forLead({ leadId })).rejects.toThrow(/leads.view/)
    })

    it("keeps other companies out", async () => {
      const b = await callerFor(ownerB)
      const events = await b.calendar.events({ from: inDays(0), to: inDays(7) })
      expect(events.some((e) => e.id === visitId)).toBe(false)
      await expect(b.calendar.setConfirmed({ id: visitId, confirmed: true })).rejects.toThrow()
    })

    it("removes an appointment", async () => {
      await owner.calendar.remove({ id: visitId })
      const events = await owner.calendar.events({ from: inDays(3), to: inDays(3) })
      expect(events.some((e) => e.id === visitId)).toBe(false)
    })
  })

  describe("attachments", () => {
    const file = new Blob(["%PDF-1.4\n% test\n"], { type: "application/pdf" })
    const meta = () => ({
      entityType: "lead" as const,
      entityId: leadId,
      fileName: "Grundriss Wohnung.pdf",
      mimeType: "application/pdf" as const,
      sizeBytes: file.size,
    })
    let attachmentId: string

    it("uploads in two steps and lists the file", async () => {
      const { path, token } = await owner.attachments.createUpload(meta())
      expect(path.startsWith(`${companyA}/lead/${leadId}/`)).toBe(true)
      const client = await signIn(ownerA.email)
      const { error } = await client.storage
        .from("attachments")
        .uploadToSignedUrl(path, token, file, { contentType: "application/pdf" })
      expect(error).toBeNull()
      ;({ id: attachmentId } = await owner.attachments.confirmUpload({ ...meta(), path }))

      const list = await owner.attachments.list({ entityType: "lead", entityId: leadId })
      expect(list.map((a) => a.fileName)).toEqual(["Grundriss Wohnung.pdf"])

      const { url } = await owner.attachments.url({ id: attachmentId })
      const res = await fetch(url)
      expect(res.ok).toBe(true)
      expect(await res.text()).toContain("%PDF-1.4")
    })

    it("refuses a confirm for a file that was never uploaded", async () => {
      const { path } = await owner.attachments.createUpload(meta())
      await expect(owner.attachments.confirmUpload({ ...meta(), path })).rejects.toThrow(
        /nicht hochgeladen/,
      )
    })

    it("refuses a path outside the record's folder", async () => {
      await expect(
        owner.attachments.confirmUpload({ ...meta(), path: `${companyB}/lead/${leadId}/x.pdf` }),
      ).rejects.toThrow(/Ungültiger Dateipfad/)
    })

    it("refuses file types other than photos, videos and PDF", async () => {
      await expect(
        owner.attachments.createUpload({
          ...meta(),
          fileName: "script.exe",
          mimeType: "application/x-msdownload" as "application/pdf",
        }),
      ).rejects.toThrow(/Fotos, Videos und PDF/)
    })

    it("keeps other companies out", async () => {
      const b = await callerFor(ownerB)
      expect(await b.attachments.list({ entityType: "lead", entityId: leadId })).toEqual([])
      await expect(b.attachments.url({ id: attachmentId })).rejects.toThrow(/nicht gefunden/)
      await expect(b.attachments.createUpload(meta())).rejects.toThrow(/nicht gefunden/)
    })

    it("removes a file", async () => {
      await owner.attachments.remove({ id: attachmentId })
      expect(await owner.attachments.list({ entityType: "lead", entityId: leadId })).toEqual([])
    })
  })

  describe("overview statistics", () => {
    it("counts inquiries in the period for the own company only", async () => {
      const stats = await owner.dashboard.stats({ from: inDays(-1), to: inDays(0) })
      expect(stats.inquiries).toBe(1)
      const past = await owner.dashboard.stats({ from: inDays(-30), to: inDays(-10) })
      expect(past.inquiries).toBe(0)
      const b = await callerFor(ownerB)
      expect((await b.dashboard.stats({ from: inDays(-1), to: inDays(0) })).inquiries).toBe(0)
    })

    it("refuses a range that ends before it starts", async () => {
      await expect(owner.dashboard.stats({ from: inDays(0), to: inDays(-3) })).rejects.toThrow(
        /Von/,
      )
    })
  })
})
