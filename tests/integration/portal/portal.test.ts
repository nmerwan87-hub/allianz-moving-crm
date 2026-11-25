/**
 * Customer portal integration tests — link tokens, views, accepting and
 * declining online, through the same service functions the portal pages use.
 *
 * Tests cover:
 *   - sending a quote stores only the hash of the link token; the link works
 *   - wrong, malformed and expired tokens find nothing
 *   - opening marks the quote as viewed and counts views
 *   - accepting needs a name and the confirmation; records who accepted,
 *     logs the customer action and creates the job
 *   - a closed quote cannot be answered again; declining needs a reason
 *   - a replaced version is shown but cannot be accepted
 *
 * Requires local Supabase and Google Chrome (or CHROME_EXECUTABLE_PATH).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { provisionCompany } from "@/modules/iam/lib/provisioning"
import { processDomainEvents } from "@/lib/events/processor"
import {
  acceptPortalQuote,
  declinePortalQuote,
  loadPortalQuote,
  recordQuoteView,
} from "@/lib/portal/service"
import { hashPortalToken } from "@/lib/portal/token"
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

let svc: Svc
let companyId: string
let ownerUser: TestUser
let owner: Awaited<ReturnType<typeof callerFor>>
let customerId: string

function inDays(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10)
}

async function sentQuote(): Promise<{ id: string; token: string }> {
  const { id } = await owner.quotes.create({ customerId })
  await owner.quotes.update({
    id,
    title: "Privatumzug 3.5 Zimmer",
    language: "de",
    moveType: "local",
    scheduledDate: inDays(30),
    dateFlexible: false,
    originAddress: "Bahnhofstrasse 1",
    originPostalCode: "8001",
    originCity: "Zürich",
    originFloor: 2,
    originHasElevator: false,
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
        name: "Umzugsteam 3 Mann",
        itemType: "labor",
        pricingMode: "hourly",
        quantity: 6,
        unit: "Std.",
        unitPriceCents: 19500,
        vatRatePercent: 8.1,
      },
    ],
  })
  await owner.quotes.send({ id, sendEmail: false })
  const { url } = await owner.quotes.portalLink({ id })
  return { id, token: url.split("/").pop()! }
}

describeWithDb("Customer portal", () => {
  beforeAll(async () => {
    svc = serviceClient()
    companyId = await createTestCompany(svc, `portal-${ts}`)
    await provisionCompany(companyId)
    ownerUser = await createTestUser(svc, {
      email: `portal-owner-${ts}@bivro-test.dev`,
      companyId,
      role: "owner",
    })
    owner = await callerFor(ownerUser)
    customerId = (
      await owner.customers.create({
        firstName: "Anna",
        lastName: "Muster",
        email: "anna.muster@example.com",
      })
    ).id
  })

  afterAll(async () => {
    // Local test data only: remove stored PDFs and the test user
    const { data: folders } = await svc.storage.from("documents").list(`${companyId}/quotes`)
    for (const folder of folders ?? []) {
      const { data: pdfs } = await svc.storage
        .from("documents")
        .list(`${companyId}/quotes/${folder.name}`)
      await svc.storage
        .from("documents")
        .remove((pdfs ?? []).map((f) => `${companyId}/quotes/${folder.name}/${f.name}`))
    }
    await svc.auth.admin.deleteUser(ownerUser.id)
  })

  let quote: { id: string; token: string }

  it("stores only the hash of the link and finds the quote by it", async () => {
    quote = await sentQuote()
    const { data } = await svc
      .from("quotes")
      .select("portal_token, portal_token_expires_at")
      .eq("id", quote.id)
      .single()
    expect(data?.["portal_token"]).toBe(hashPortalToken(quote.token))
    expect(data?.["portal_token"]).not.toContain(quote.token)
    expect(new Date(data?.["portal_token_expires_at"] as string).getTime()).toBeGreaterThan(
      Date.now() + 14 * 86_400_000,
    )

    const loaded = await loadPortalQuote(svc, quote.token)
    expect(loaded).toMatchObject({
      id: quote.id,
      status: "sent",
      open: true,
      customerName: "Anna Muster",
      totalCents: 126477,
    })
    expect(loaded?.lines.map((l) => l.name)).toEqual(["Umzugsteam 3 Mann"])
  })

  it("finds nothing for wrong or malformed tokens", async () => {
    const wrong = quote.token.slice(0, -1) + (quote.token.endsWith("A") ? "B" : "A")
    expect(await loadPortalQuote(svc, wrong)).toBeNull()
    expect(await loadPortalQuote(svc, "abc")).toBeNull()
    expect(await loadPortalQuote(svc, "' or 1=1 --")).toBeNull()
  })

  it("marks the quote as viewed and counts views", async () => {
    await recordQuoteView(svc, (await loadPortalQuote(svc, quote.token))!)
    await recordQuoteView(svc, (await loadPortalQuote(svc, quote.token))!)
    const { quote: q } = await owner.quotes.get({ id: quote.id })
    expect(q.status).toBe("viewed")
    const { data } = await svc.from("quotes").select("view_count").eq("id", quote.id).single()
    expect(data?.["view_count"]).toBe(2)
  })

  it("needs a name and the confirmation to accept", async () => {
    expect(await acceptPortalQuote(svc, quote.token, { name: "A", termsAccepted: true })).toEqual({
      ok: false,
      message: "Bitte Vor- und Nachname eingeben.",
    })
    expect(
      await acceptPortalQuote(svc, quote.token, { name: "Anna Muster", termsAccepted: false }),
    ).toMatchObject({ ok: false })
    expect((await owner.quotes.get({ id: quote.id })).quote.status).toBe("viewed")
  })

  it("accepts online: records the name, logs the customer and creates the job", async () => {
    const result = await acceptPortalQuote(svc, quote.token, {
      name: "Anna Muster",
      termsAccepted: true,
      ip: "203.0.113.7",
      userAgent: "vitest",
    })
    expect(result).toEqual({ ok: true })

    const { quote: q } = await owner.quotes.get({ id: quote.id })
    expect(q).toMatchObject({ status: "accepted", acceptedByName: "Anna Muster" })

    const { data: log } = await svc
      .from("activity_logs")
      .select("actor_type, actor_name, ip_address")
      .eq("entity_id", quote.id)
      .eq("action", "quote.accepted_online")
      .single()
    expect(log).toMatchObject({ actor_type: "customer", actor_name: "Anna Muster" })

    await processDomainEvents()
    const { data: job } = await svc.from("jobs").select("status").eq("quote_id", quote.id).single()
    expect(job?.["status"]).toBe("scheduled")

    const reopened = await loadPortalQuote(svc, quote.token)
    expect(reopened).toMatchObject({ status: "accepted", open: false })
  })

  it("cannot answer a closed quote again", async () => {
    expect(
      await acceptPortalQuote(svc, quote.token, { name: "Anna Muster", termsAccepted: true }),
    ).toMatchObject({ ok: false })
    expect(await declinePortalQuote(svc, quote.token, { reason: "zu teuer" })).toMatchObject({
      ok: false,
    })
  })

  it("declines with a reason", async () => {
    const other = await sentQuote()
    expect(await declinePortalQuote(svc, other.token, { reason: " " })).toMatchObject({
      ok: false,
    })
    expect(await declinePortalQuote(svc, other.token, { reason: "Zu teuer" })).toEqual({
      ok: true,
    })
    const { quote: q } = await owner.quotes.get({ id: other.id })
    expect(q).toMatchObject({ status: "declined", declinedReason: "Online: Zu teuer" })
  })

  it("shows a replaced version but does not accept it", async () => {
    const old = await sentQuote()
    await owner.quotes.createRevision({ id: old.id })
    const loaded = await loadPortalQuote(svc, old.token)
    expect(loaded).toMatchObject({ status: "superseded", open: false })
    expect(
      await acceptPortalQuote(svc, old.token, { name: "Anna Muster", termsAccepted: true }),
    ).toMatchObject({ ok: false })
  })

  it("stops working after the link expires", async () => {
    const expiring = await sentQuote()
    await svc
      .from("quotes")
      .update({ portal_token_expires_at: new Date(Date.now() - 1000).toISOString() })
      .eq("id", expiring.id)
    expect(await loadPortalQuote(svc, expiring.token)).toBeNull()
  })
})
