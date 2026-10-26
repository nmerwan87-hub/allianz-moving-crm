/**
 * Customers module integration tests — through the real tRPC procedures.
 *
 * Tests cover:
 *   - create normalises phone and e-mail, defaults (language de, country CH)
 *   - business customers require a company name (API and database)
 *   - duplicate detection by e-mail and phone (any phone format)
 *   - search, including formatted phone numbers and filter-breaking input
 *   - update writes an audit entry with the changed fields only
 *   - archive hides from the list, archived list shows it, restore brings it back
 *   - office permissions: view-only users cannot create; users without view see nothing
 *   - tenant isolation: another company can neither read nor change the customer
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

let svc: Svc
let companyA: string
let companyB: string
let ownerA: TestUser
let viewerA: TestUser
let noAccessA: TestUser
let ownerB: TestUser
let owner: Awaited<ReturnType<typeof callerFor>>
let customerId: string

describeWithDb("Customers module", () => {
  beforeAll(async () => {
    svc = serviceClient()
    companyA = await createTestCompany(svc, `cust-a-${ts}`)
    companyB = await createTestCompany(svc, `cust-b-${ts}`)
    ownerA = await createTestUser(svc, {
      email: `cust-owner-a-${ts}@bivro-test.dev`,
      companyId: companyA,
      role: "owner",
    })
    viewerA = await createTestUser(svc, {
      email: `cust-viewer-a-${ts}@bivro-test.dev`,
      companyId: companyA,
      role: "office",
      permissions: ["customers.view"],
    })
    noAccessA = await createTestUser(svc, {
      email: `cust-none-a-${ts}@bivro-test.dev`,
      companyId: companyA,
      role: "office",
    })
    ownerB = await createTestUser(svc, {
      email: `cust-owner-b-${ts}@bivro-test.dev`,
      companyId: companyB,
      role: "owner",
    })
    owner = await callerFor(ownerA)
  })

  afterAll(async () => {
    await cleanupCompany(svc, companyA, [ownerA.id, viewerA.id, noAccessA.id])
    await cleanupCompany(svc, companyB, [ownerB.id])
  })

  it("creates a customer with normalised contact data and Swiss defaults", async () => {
    const { id } = await owner.customers.create({
      customerType: "private",
      salutation: "ms",
      firstName: " Anna ",
      lastName: "Muster",
      email: "Anna.Muster@Example.com",
      phone: "079 123 45 67",
      billingStreet: "Bahnhofstrasse 1",
      billingPostalCode: "8001",
      billingCity: "Zürich",
    })
    customerId = id

    const { customer } = await owner.customers.getById({ id })
    expect(customer).toMatchObject({
      firstName: "Anna",
      lastName: "Muster",
      email: "anna.muster@example.com",
      phone: "+41791234567",
      preferredLanguage: "de",
      billingCountry: "CH",
      salutation: "ms",
      archivedAt: null,
    })
  })

  it("requires a company name for business customers", async () => {
    await expect(
      owner.customers.create({ customerType: "business", firstName: "Max", lastName: "Firma" }),
    ).rejects.toThrow(/Company name is required/)

    const { error } = await svc.from("customers").insert({
      company_id: companyA,
      customer_type: "business",
      first_name: "Max",
      last_name: "Firma",
    })
    expect(error?.message).toContain("customers_business_has_company")
  })

  it("finds duplicates by e-mail and by phone in any format", async () => {
    const byEmail = await owner.customers.findDuplicates({ email: "ANNA.MUSTER@example.com" })
    expect(byEmail.map((d) => d.id)).toEqual([customerId])
    expect(byEmail[0]?.matchedOn).toEqual(["email"])

    const byPhone = await owner.customers.findDuplicates({ phone: "+41 79 123 45 67" })
    expect(byPhone[0]?.matchedOn).toEqual(["phone"])

    const excluded = await owner.customers.findDuplicates({
      email: "anna.muster@example.com",
      excludeId: customerId,
    })
    expect(excluded).toEqual([])
  })

  it("searches by name, e-mail and formatted phone, and survives filter syntax", async () => {
    const byName = await owner.customers.list({ search: "muster" })
    expect(byName.items.map((c) => c.id)).toContain(customerId)

    const byPhone = await owner.customers.list({ search: "079 123 45 67" })
    expect(byPhone.items.map((c) => c.id)).toContain(customerId)

    const hostile = await owner.customers.list({ search: "x,company_id.neq.00000000" })
    expect(hostile.items).toEqual([])
  })

  it("updates and audits only the changed fields", async () => {
    await owner.customers.update({
      id: customerId,
      customerType: "private",
      salutation: "ms",
      firstName: "Anna",
      lastName: "Muster",
      email: "anna.muster@example.com",
      phone: "079 123 45 67",
      billingStreet: "Bahnhofstrasse 1",
      billingPostalCode: "8001",
      billingCity: "Winterthur",
      preferredLanguage: "fr",
    })

    const { data: log } = await svc
      .from("activity_logs")
      .select("before_state, after_state")
      .eq("entity_id", customerId)
      .eq("action", "customer.updated")
      .single()
    expect(log?.before_state).toEqual({ billing_city: "Zürich", preferred_language: "de" })
    expect(log?.after_state).toEqual({ billing_city: "Winterthur", preferred_language: "fr" })
  })

  it("archives and restores", async () => {
    await owner.customers.archive({ id: customerId })

    const active = await owner.customers.list({})
    expect(active.items.map((c) => c.id)).not.toContain(customerId)

    const archived = await owner.customers.list({ archived: true })
    expect(archived.items.map((c) => c.id)).toContain(customerId)

    await expect(
      owner.customers.update({ id: customerId, firstName: "A", lastName: "B" } as never),
    ).rejects.toThrow(/Restore the customer/)

    await owner.customers.restore({ id: customerId })
    const restored = await owner.customers.list({})
    expect(restored.items.map((c) => c.id)).toContain(customerId)
  })

  it("enforces office permissions", async () => {
    const viewer = await callerFor(viewerA)
    const list = await viewer.customers.list({})
    expect(list.items.map((c) => c.id)).toContain(customerId)
    await expect(
      viewer.customers.create({ firstName: "No", lastName: "Access" } as never),
    ).rejects.toThrow(/Missing permission: customers.create/)

    const none = await callerFor(noAccessA)
    await expect(none.customers.list({})).rejects.toThrow(/Missing permission: customers.view/)
  })

  it("isolates companies", async () => {
    const other = await callerFor(ownerB)
    await expect(other.customers.getById({ id: customerId })).rejects.toThrow(/Customer not found/)
    await expect(other.customers.archive({ id: customerId })).rejects.toThrow(/Customer not found/)

    const list = await other.customers.list({ search: "muster" })
    expect(list.items).toEqual([])
  })
})
