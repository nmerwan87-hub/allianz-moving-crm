/**
 * E-mail automation integration tests — real procedures, scheduler and
 * e-mail log (no provider locally: e-mails are logged, not delivered).
 *
 * Tests cover:
 *   - the six automations per company, off by default, with German names
 *   - switching on sets the start; records from before are ignored
 *   - due records get exactly one run, also when the scheduler runs again
 *   - opted-out customers are skipped; approval mode waits, approve sends
 *   - own text replaces the built-in one, placeholders are filled
 *   - other companies cannot see or approve runs
 *
 * Requires local Supabase and Google Chrome (or CHROME_EXECUTABLE_PATH).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { provisionCompany } from "@/modules/iam/lib/provisioning"
import { processDomainEvents } from "@/lib/events/processor"
import { runAutomations } from "@/lib/automations/engine"
import {
  HAS_LOCAL_DB,
  serviceClient,
  createTestCompany,
  createTestUser,
  callerFor,
  type Svc,
  type TestUser,
} from "../_helpers"

const describeWithDb = HAS_LOCAL_DB ? describe : describe.skip
const ts = Date.now()
const DAY = 86_400_000

let svc: Svc
let companyA: string
let companyB: string
let ownerA: TestUser
let ownerB: TestUser
let owner: Awaited<ReturnType<typeof callerFor>>
let customerId: string
let optedOutId: string

function inDays(days: number): string {
  return new Date(Date.now() + days * DAY).toISOString().slice(0, 10)
}

async function sentQuote(forCustomer: string): Promise<string> {
  const { id } = await owner.quotes.create({ customerId: forCustomer })
  await owner.quotes.update({
    id,
    title: "Privatumzug",
    language: "de",
    moveType: "local",
    scheduledDate: inDays(30),
    dateFlexible: false,
    originAddress: "Bahnhofstrasse 1",
    originPostalCode: "8001",
    originCity: "Zürich",
    originFloor: 1,
    originHasElevator: true,
    destAddress: "Bundesgasse 3",
    destPostalCode: "3011",
    destCity: "Bern",
    destFloor: 0,
    destHasElevator: false,
    depositPercent: 0,
    costCapCents: null,
    validUntil: inDays(14),
  })
  await owner.quotes.saveLines({
    id,
    lines: [
      {
        name: "Umzug pauschal",
        itemType: "labor",
        pricingMode: "manual",
        quantity: 1,
        unitPriceCents: 150000,
        vatRatePercent: 8.1,
      },
    ],
  })
  await owner.quotes.send({ id, sendEmail: false })
  return id
}

async function automation(slug: string) {
  const list = await owner.automations.list()
  return list.find((a) => a.slug === slug)!
}

async function switchOn(
  slug: string,
  patch: Partial<{ mode: "auto_send" | "approval"; delayDays: number }> = {},
) {
  const a = await automation(slug)
  await owner.automations.update({
    id: a.id,
    enabled: true,
    delayDays: patch.delayDays ?? a.delayDays,
    mode: patch.mode ?? a.mode,
    subject: a.subject,
    body: a.body,
  })
}

async function runsFor(entityId: string) {
  const { data } = await svc
    .from("email_automation_runs")
    .select("status, to_email, cancellation_reason, email_log_id")
    .eq("entity_id", entityId)
  return data ?? []
}

describeWithDb("E-mail automation", () => {
  beforeAll(async () => {
    svc = serviceClient()
    companyA = await createTestCompany(svc, `auto-a-${ts}`)
    companyB = await createTestCompany(svc, `auto-b-${ts}`)
    await provisionCompany(companyA)
    await provisionCompany(companyB)
    ownerA = await createTestUser(svc, {
      email: `auto-owner-a-${ts}@bivro-test.dev`,
      companyId: companyA,
      role: "owner",
    })
    ownerB = await createTestUser(svc, {
      email: `auto-owner-b-${ts}@bivro-test.dev`,
      companyId: companyB,
      role: "owner",
    })
    owner = await callerFor(ownerA)
    customerId = (
      await owner.customers.create({
        firstName: "Anna",
        lastName: "Muster",
        email: "anna.muster@example.com",
      })
    ).id
    optedOutId = (
      await owner.customers.create({
        firstName: "Beat",
        lastName: "Ruhig",
        email: "beat.ruhig@example.com",
      })
    ).id
    await svc.from("communication_preferences").insert({
      company_id: companyA,
      customer_id: optedOutId,
      opted_out_automated: true,
    })
  })

  afterAll(async () => {
    const { data: folders } = await svc.storage.from("documents").list(`${companyA}/quotes`)
    for (const folder of folders ?? []) {
      const { data: pdfs } = await svc.storage
        .from("documents")
        .list(`${companyA}/quotes/${folder.name}`)
      await svc.storage
        .from("documents")
        .remove((pdfs ?? []).map((f) => `${companyA}/quotes/${folder.name}/${f.name}`))
    }
    for (const id of [ownerA.id, ownerB.id]) await svc.auth.admin.deleteUser(id)
  })

  it("lists the six automations, all off, in German", async () => {
    const list = await owner.automations.list()
    expect(list.map((a) => a.slug)).toEqual([
      "quote-follow-up-1",
      "quote-expiry-warning",
      "booking-confirmed",
      "move-reminder",
      "post-move-thank-you",
      "payment-confirmed",
    ])
    expect(list.every((a) => !a.enabled)).toBe(true)
    expect(list[0]).toMatchObject({ name: "Offerte nachfassen", delayDays: 3, timing: "after" })
    expect(list[3]).toMatchObject({ timing: "before", delayDays: 2 })
  })

  let early: string
  let quote: string

  it("ignores records from before switching on, then sends exactly once", async () => {
    early = await sentQuote(customerId)
    await switchOn("quote-follow-up-1", { delayDays: 1 })
    quote = await sentQuote(customerId)

    // Not yet due
    await runAutomations(svc, { companyId: companyA })
    expect(await runsFor(quote)).toEqual([])

    const later = new Date(Date.now() + 2 * DAY)
    const first = await runAutomations(svc, { companyId: companyA, now: later })
    expect(first.sent + first.failed).toBe(1)
    const runs = await runsFor(quote)
    expect(runs).toHaveLength(1)
    expect(runs[0]?.to_email).toBe("anna.muster@example.com")
    expect(await runsFor(early)).toEqual([])

    const { data: log } = await svc
      .from("email_logs")
      .select("trigger_event, subject, to_email")
      .eq("id", runs[0]!.email_log_id as string)
      .single()
    expect(log).toMatchObject({
      trigger_event: "automation.quote-follow-up-1",
      to_email: "anna.muster@example.com",
    })
    expect(log?.subject).toMatch(/^Ihre Offerte QT-\d{4}-\d{4} — haben Sie noch Fragen\?$/)

    const again = await runAutomations(svc, { companyId: companyA, now: later })
    expect(again).toEqual({ sent: 0, failed: 0, awaitingApproval: 0, skipped: 0 })
    expect(await runsFor(quote)).toHaveLength(1)
  })

  it("skips customers who do not want automatic e-mails", async () => {
    const quiet = await sentQuote(optedOutId)
    await runAutomations(svc, { companyId: companyA, now: new Date(Date.now() + 2 * DAY) })
    expect(await runsFor(quiet)).toEqual([
      expect.objectContaining({
        status: "skipped",
        cancellation_reason: "Kunde möchte keine automatischen E-Mails",
        email_log_id: null,
      }),
    ])
  })

  it("waits for approval and sends when approved", async () => {
    await switchOn("booking-confirmed", { mode: "approval" })
    await owner.quotes.markAccepted({ id: quote })
    await processDomainEvents()

    const result = await runAutomations(svc, { companyId: companyA })
    expect(result.awaitingApproval).toBe(1)
    const [pending] = await owner.automations.runs({ status: "approval_pending" })
    expect(pending).toMatchObject({ automationName: "Buchungsbestätigung", entityId: quote })

    const other = await callerFor(ownerB)
    await expect(other.automations.approve({ id: pending!.id })).rejects.toThrow(/nicht gefunden/)
    expect(await other.automations.runs({})).toEqual([])

    await owner.automations.approve({ id: pending!.id })
    const [run] = await runsFor(quote).then((r) =>
      r.filter((x) => x.email_log_id !== null && x.status !== "skipped"),
    )
    expect(run).toBeDefined()
    await expect(owner.automations.approve({ id: pending!.id })).rejects.toThrow(/schon bearbeitet/)
  })

  it("uses the company's own text with filled placeholders", async () => {
    const a = await automation("quote-follow-up-1")
    await owner.automations.update({
      id: a.id,
      enabled: true,
      delayDays: 1,
      mode: "auto_send",
      subject: "Kurze Frage zu {offerte}",
      body: "Hallo {kunde}, passt die Offerte über {betrag} von {firma}?",
    })
    const updated = await automation("quote-follow-up-1")
    expect(updated).toMatchObject({ customText: true, subject: "Kurze Frage zu {offerte}" })

    const preview = await owner.automations.preview({ id: a.id })
    expect(preview.subject).toMatch(/^Kurze Frage zu QT-\d{4}-\d{4}$/)
    expect(preview.body).toMatch(
      /^Hallo (Anna Muster|Beat Ruhig), passt die Offerte über CHF .+ von Test auto-a-/,
    )
    expect(preview.action).toBe("Offerte ansehen")
  })

  it("refuses changes without the right", async () => {
    const clerk = await createTestUser(svc, {
      email: `auto-clerk-${ts}@bivro-test.dev`,
      companyId: companyA,
      role: "office",
      permissions: ["communications.view"],
    })
    const caller = await callerFor(clerk)
    const a = await automation("move-reminder")
    expect((await caller.automations.list()).length).toBe(6)
    await expect(
      caller.automations.update({ ...a, enabled: true, delayDays: 2, mode: "auto_send" }),
    ).rejects.toThrow(/communications.manage_automations/)
    await svc.auth.admin.deleteUser(clerk.id)
  })
})
