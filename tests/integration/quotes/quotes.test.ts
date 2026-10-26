/**
 * Quotes integration tests — real tRPC procedures, database triggers, PDF
 * rendering (headless Chrome) and storage.
 *
 * Tests cover:
 *   - draft prefilled from lead, customer language and company terms
 *   - line and quote totals computed by the database (per-line VAT, discounts, deposit)
 *   - totals cannot be written by clients
 *   - discounts need quotes.apply_discount; cost prices hidden and preserved without view_cost_price
 *   - sending: refused above the cost cap / without lines; stores an immutable PDF;
 *     e-mail attempt logged (not delivered without RESEND_API_KEY)
 *   - sent quotes are locked (header, lines, direct DB writes)
 *   - signed URL serves the stored PDF
 *   - revisions: new draft version, predecessor superseded, one draft at a time
 *   - acceptance creates the job through the workflow engine; declining needs a reason
 *   - tenant isolation
 *
 * Requires local Supabase and Google Chrome (or CHROME_EXECUTABLE_PATH).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { provisionCompany } from "@/modules/iam/lib/provisioning"
import { processDomainEvents } from "@/lib/events/processor"
import {
  HAS_LOCAL_DB,
  serviceClient,
  signIn,
  createTestCompany,
  createTestUser,
  callerFor,
  type Svc,
  type TestUser,
} from "../_helpers"

const describeWithDb = HAS_LOCAL_DB ? describe : describe.skip
const ts = Date.now()

let svc: Svc
let companyA: string
let companyB: string
let ownerA: TestUser
let clerkA: TestUser
let ownerB: TestUser
let owner: Awaited<ReturnType<typeof callerFor>>
let customerId: string
let leadId: string
let quoteId: string

const LINES = [
  {
    name: "Umzugsteam 3 Mann + LKW 3.5 t",
    itemType: "labor" as const,
    pricingMode: "hourly" as const,
    quantity: 8,
    unit: "Std.",
    unitPriceCents: 19500,
    costPriceCents: 12000,
    vatRatePercent: 8.1,
  },
  {
    name: "Möbelmontage",
    pricingMode: "fixed" as const,
    quantity: 1,
    unit: "Pauschale",
    unitPriceCents: 20000,
    costPriceCents: 8000,
    vatRatePercent: 8.1,
  },
  {
    name: "Entsorgung",
    pricingMode: "quantity" as const,
    quantity: 2,
    unit: "m³",
    unitPriceCents: 8000,
    costPriceCents: 3000,
    discountType: "percent" as const,
    discountValue: 10,
    vatRatePercent: 8.1,
  },
  {
    name: "Halteverbotszone",
    pricingMode: "fixed" as const,
    quantity: 1,
    unitPriceCents: 12000,
    vatRatePercent: 0,
  },
]

function inDays(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10)
}

async function header(id: string, overrides: Record<string, unknown> = {}) {
  return owner.quotes.update({
    id,
    title: "Privatumzug 3.5 Zimmer",
    language: "de",
    moveType: "local",
    scheduledDate: inDays(30),
    dateFlexible: false,
    originAddress: "Bahnhofstrasse 1",
    originPostalCode: "8001",
    originCity: "Zürich",
    originFloor: 3,
    originHasElevator: false,
    destAddress: "Bundesgasse 3",
    destPostalCode: "3011",
    destCity: "Bern",
    destFloor: 1,
    destHasElevator: true,
    distanceKm: 125,
    estimatedHours: 8,
    depositPercent: 20,
    costCapCents: null,
    validUntil: inDays(14),
    customerNotes: "Parkplatz ist reserviert.",
    internalNotes: "Kunde will schnell Bescheid",
    ...overrides,
  })
}

describeWithDb("Quotes", () => {
  beforeAll(async () => {
    svc = serviceClient()
    companyA = await createTestCompany(svc, `qt-a-${ts}`)
    companyB = await createTestCompany(svc, `qt-b-${ts}`)
    await provisionCompany(companyA)
    await provisionCompany(companyB)
    await svc
      .from("company_settings")
      .update({ default_deposit_percent: 20, default_quote_expiry_days: 14 })
      .eq("company_id", companyA)

    ownerA = await createTestUser(svc, {
      email: `qt-owner-a-${ts}@bivro-test.dev`,
      companyId: companyA,
      role: "owner",
    })
    clerkA = await createTestUser(svc, {
      email: `qt-clerk-a-${ts}@bivro-test.dev`,
      companyId: companyA,
      role: "office",
      permissions: ["quotes.view", "quotes.edit"],
    })
    ownerB = await createTestUser(svc, {
      email: `qt-owner-b-${ts}@bivro-test.dev`,
      companyId: companyB,
      role: "owner",
    })
    owner = await callerFor(ownerA)

    customerId = (
      await owner.customers.create({
        firstName: "Anna",
        lastName: "Muster",
        salutation: "ms",
        email: "anna.muster@example.com",
        preferredLanguage: "fr",
        billingStreet: "Bahnhofstrasse 1",
        billingPostalCode: "8001",
        billingCity: "Zürich",
      })
    ).id

    const { data: lead } = await svc
      .from("leads")
      .insert({
        company_id: companyA,
        customer_id: customerId,
        first_name: "Anna",
        last_name: "Muster",
        status: "contacted",
        source: "manual",
        move_type: "local",
        requested_date: inDays(30),
        origin_city: "Zürich",
        dest_city: "Bern",
        date_flexible: false,
        origin_has_elevator: false,
        origin_has_stairs: false,
        dest_has_elevator: false,
        dest_has_stairs: false,
      })
      .select("id")
      .single()
    leadId = lead!.id as string
  })

  afterAll(async () => {
    // Local test data only: remove the tenants including append-only rows and stored PDFs
    for (const companyId of [companyA, companyB]) {
      const { data: files } = await svc.storage.from("documents").list(`${companyId}/quotes`)
      for (const folder of files ?? []) {
        const { data: pdfs } = await svc.storage
          .from("documents")
          .list(`${companyId}/quotes/${folder.name}`)
        await svc.storage
          .from("documents")
          .remove((pdfs ?? []).map((f) => `${companyId}/quotes/${folder.name}/${f.name}`))
      }
    }
    await svc.rpc("sync_system_tasks", { p_company_id: companyA })
    for (const userId of [ownerA.id, clerkA.id, ownerB.id]) await svc.auth.admin.deleteUser(userId)
  })

  it("creates a draft from the lead with customer language and company terms", async () => {
    quoteId = (await owner.quotes.create({ customerId, leadId })).id
    const { quote, lines } = await owner.quotes.get({ id: quoteId })

    expect(quote).toMatchObject({
      status: "draft",
      version: 1,
      language: "fr",
      depositPercent: 20,
      originCity: "Zürich",
      destCity: "Bern",
      leadId,
      totalAmountCents: 0,
    })
    expect(quote.quoteNumber).toMatch(/^QT-\d{4}-\d{4}$/)
    expect(quote.expiresAt?.slice(0, 10)).toBe(inDays(14))
    expect(lines).toEqual([])
  })

  it("computes every total in the database", async () => {
    await header(quoteId)
    await owner.quotes.saveLines({ id: quoteId, lines: LINES })

    const { quote, lines } = await owner.quotes.get({ id: quoteId })
    expect(lines.map((l) => l.netTotalCents)).toEqual([156000, 20000, 14400, 12000])
    expect(lines.map((l) => l.vatAmountCents)).toEqual([12636, 1620, 1166, 0])
    expect(quote).toMatchObject({
      subtotalCents: 204000,
      discountCents: 1600,
      taxCents: 15422,
      totalAmountCents: 217822,
      depositAmountCents: 43564,
      totalCostCents: 96000 + 8000 + 6000,
    })
  })

  it("ignores totals written by a client", async () => {
    const client = await signIn(ownerA.email)
    await client.from("quotes").update({ total_amount_cents: 1, tax_cents: 0 }).eq("id", quoteId)
    const { quote } = await owner.quotes.get({ id: quoteId })
    expect(quote.totalAmountCents).toBe(217822)
  })

  it("requires quotes.apply_discount for discounts and hides cost prices", async () => {
    const clerk = await callerFor(clerkA)
    const view = await clerk.quotes.get({ id: quoteId })
    expect(view.lines.every((l) => l.costPriceCents === null)).toBe(true)
    expect(view.quote.totalCostCents).toBeNull()

    await expect(clerk.quotes.saveLines({ id: quoteId, lines: LINES })).rejects.toThrow(
      /quotes.apply_discount/,
    )

    // Saving without discounts keeps the cost prices the clerk cannot see
    const withoutDiscount = view.lines.map((l) => ({
      id: l.id,
      name: l.name,
      itemType: l.itemType,
      pricingMode: l.pricingMode,
      quantity: l.quantity,
      unit: l.unit,
      unitPriceCents: l.unitPriceCents,
      vatRatePercent: l.vatRatePercent,
    }))
    await clerk.quotes.saveLines({ id: quoteId, lines: withoutDiscount })
    const { quote } = await owner.quotes.get({ id: quoteId })
    expect(quote.totalCostCents).toBe(110000)

    await owner.quotes.saveLines({ id: quoteId, lines: LINES })
  })

  it("refuses to send above the cost cap", async () => {
    await header(quoteId, { costCapCents: 200000 })
    await expect(owner.quotes.send({ id: quoteId, sendEmail: false })).rejects.toThrow(/cost cap/)
    await header(quoteId, { costCapCents: 250000 })
  })

  it("refuses to send without lines", async () => {
    const empty = (await owner.quotes.create({ customerId })).id
    await expect(owner.quotes.send({ id: empty, sendEmail: false })).rejects.toThrow(/priced line/)
    await owner.quotes.cancel({ id: empty })
  })

  it("sends: stores the PDF, freezes the quote and logs the e-mail attempt", async () => {
    const result = await owner.quotes.send({ id: quoteId, sendEmail: true, message: "Bis bald!" })
    expect(result.emailDelivered).toBe(false)

    const { quote, documents, emails } = await owner.quotes.get({ id: quoteId })
    expect(quote.status).toBe("sent")
    expect(quote.sentAt).not.toBeNull()
    expect(documents).toHaveLength(1)
    expect(documents[0]!.name).toBe(`Offerte-${quote.quoteNumber}-v1.pdf`)
    expect(emails[0]).toMatchObject({ to: "anna.muster@example.com", status: "failed" })

    const { data: doc } = await svc
      .from("documents")
      .select(
        "storage_path, file_size_bytes, content_hash, financial_snapshot, service_line_snapshot",
      )
      .eq("id", documents[0]!.id)
      .single()
    expect(doc?.storage_path).toMatch(new RegExp(`^${companyA}/quotes/${quoteId}/quote_pdf-v1-`))
    expect(doc?.financial_snapshot).toMatchObject({ total_cents: 217822, cost_cap_cents: 250000 })
    expect(JSON.stringify(doc?.service_line_snapshot)).not.toContain("cost_price")

    const { url } = await owner.quotes.documentUrl({ id: quoteId, documentId: documents[0]!.id })
    const pdf = Buffer.from(await (await fetch(url)).arrayBuffer())
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-")
    expect(pdf.length).toBe(doc?.file_size_bytes)
  })

  it("locks a sent quote", async () => {
    await expect(header(quoteId)).rejects.toThrow(/already sent/)
    await expect(owner.quotes.saveLines({ id: quoteId, lines: LINES })).rejects.toThrow(
      /already sent/,
    )

    const client = await signIn(ownerA.email)
    const { error } = await client
      .from("quotes")
      .update({ customer_notes: "changed" })
      .eq("id", quoteId)
    expect(error?.message).toContain("quote_locked")

    const { error: lineError } = await client
      .from("quote_items")
      .update({ unit_price_cents: 1 })
      .eq("quote_id", quoteId)
    expect(lineError?.message).toContain("quote_locked")
  })

  it("creates a revision and supersedes the sent version", async () => {
    const { id: v2 } = await owner.quotes.createRevision({ id: quoteId })
    const { quote, lines, versions } = await owner.quotes.get({ id: v2 })

    expect(quote).toMatchObject({ status: "draft", version: 2, totalAmountCents: 217822 })
    expect(lines).toHaveLength(4)
    expect(versions.map((v) => [v.version, v.status])).toEqual([
      [2, "draft"],
      [1, "superseded"],
    ])
    await expect(owner.quotes.createRevision({ id: quoteId })).rejects.toThrow()

    const list = await owner.quotes.list({ customerId })
    expect(list.items.map((q) => q.id)).toContain(v2)
    expect(list.items.map((q) => q.id)).not.toContain(quoteId)
    quoteId = v2
  })

  it("acceptance books the lead and creates the job", async () => {
    await owner.quotes.send({ id: quoteId, sendEmail: false })
    await expect(owner.quotes.markDeclined({ id: quoteId, reason: " " })).rejects.toThrow()
    await owner.quotes.markAccepted({ id: quoteId })
    await processDomainEvents()

    const { data: job } = await svc
      .from("jobs")
      .select("status, total_amount_cents, origin_city")
      .eq("quote_id", quoteId)
      .single()
    expect(job).toMatchObject({
      status: "scheduled",
      total_amount_cents: 217822,
      origin_city: "Zürich",
    })

    const { data: lead } = await svc.from("leads").select("status").eq("id", leadId).single()
    expect(lead?.status).toBe("booked")
  })

  it("isolates companies", async () => {
    const other = await callerFor(ownerB)
    await expect(other.quotes.get({ id: quoteId })).rejects.toThrow(/Quote not found/)
    await expect(other.quotes.send({ id: quoteId, sendEmail: false })).rejects.toThrow(
      /Quote not found/,
    )
    await expect(other.quotes.createRevision({ id: quoteId })).rejects.toThrow()
    expect((await other.quotes.list({})).items).toEqual([])
  })
})
