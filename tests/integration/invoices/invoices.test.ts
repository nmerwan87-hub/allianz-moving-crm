/**
 * Final settlement, invoices with QR-bill, payments and reminders — real tRPC
 * procedures, database triggers, PDF rendering (headless Chrome) and storage.
 *
 * Tests cover:
 *   - deposit on the job before invoicing; job deposit flag
 *   - settlement draft from the accepted quote: lines copied, hourly lines take
 *     the actual hours (rounded up to the quarter hour), quoted quantity kept,
 *     deposit deducted; one settlement per job
 *   - issuing: refused without QR-bill company data / above the cost cap
 *     without a reason; number, due date and payment reference assigned by the
 *     database; PDF with QR-bill stored
 *   - issued invoices are frozen (lines, header, deletion)
 *   - payments: permission, over-payment refused, partial → paid, deposits after
 *     invoicing refused, cancelling a payment reopens the balance
 *   - void needs a reason and no payments; the job can be settled again;
 *     invoice numbers stay gap-free
 *   - overdue, reminder task, reminder PDF and level, task resolved
 *   - payment references: database and TypeScript agree and pass swissqrbill
 *   - tenant isolation
 *
 * Requires local Supabase and Google Chrome (or CHROME_EXECUTABLE_PATH).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { isQRReferenceValid, isSCORReferenceValid } from "swissqrbill/utils"
import { provisionCompany } from "@/modules/iam/lib/provisioning"
import { processDomainEvents } from "@/lib/events/processor"
import { invoicePaymentReference } from "@/lib/format/payment-reference"
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
let companyA: string
let companyB: string
let ownerA: TestUser
let clerkA: TestUser
let ownerB: TestUser
let owner: Awaited<ReturnType<typeof callerFor>>
let clerk: Awaited<ReturnType<typeof callerFor>>
let jobId: string
let firstInvoice: string
let secondInvoice: string

function inDays(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10)
}

async function invoiceRow(id: string) {
  const { data } = await svc
    .from("invoices")
    .select(
      "status, invoice_number, total_amount_cents, deposit_applied_cents, amount_paid_cents, balance_due_cents, issued_at, due_at, paid_at, payment_reference, reminder_level, voided_at",
    )
    .eq("id", id)
    .single()
  return data!
}

describeWithDb("Invoices, payments and reminders", () => {
  beforeAll(async () => {
    svc = serviceClient()
    companyA = await createTestCompany(svc, `inv-a-${ts}`)
    companyB = await createTestCompany(svc, `inv-b-${ts}`)
    await provisionCompany(companyA)
    await provisionCompany(companyB)
    await svc
      .from("company_settings")
      .update({ default_deposit_percent: 20, default_payment_terms_days: 30 })
      .eq("company_id", companyA)

    ownerA = await createTestUser(svc, {
      email: `inv-owner-a-${ts}@bivro-test.dev`,
      companyId: companyA,
      role: "owner",
    })
    clerkA = await createTestUser(svc, {
      email: `inv-clerk-a-${ts}@bivro-test.dev`,
      companyId: companyA,
      role: "office",
      permissions: ["invoices.view", "invoices.create", "invoices.edit", "payments.view"],
    })
    ownerB = await createTestUser(svc, {
      email: `inv-owner-b-${ts}@bivro-test.dev`,
      companyId: companyB,
      role: "owner",
    })
    owner = await callerFor(ownerA)
    clerk = await callerFor(clerkA)

    // Accepted quote → job (through the workflow engine)
    const customerId = (
      await owner.customers.create({
        firstName: "Anna",
        lastName: "Muster",
        salutation: "ms",
        email: "anna.muster@example.com",
        preferredLanguage: "de",
        billingStreet: "Bahnhofstrasse 1",
        billingPostalCode: "8001",
        billingCity: "Zürich",
      })
    ).id
    const quoteId = (await owner.quotes.create({ customerId })).id
    await owner.quotes.update({
      id: quoteId,
      title: "Privatumzug 3.5 Zimmer",
      language: "de",
      moveType: "local",
      scheduledDate: inDays(-1),
      dateFlexible: false,
      originAddress: "Bahnhofstrasse 1",
      originPostalCode: "8001",
      originCity: "Zürich",
      originHasElevator: false,
      destAddress: "Bundesgasse 3",
      destPostalCode: "3011",
      destCity: "Bern",
      destHasElevator: true,
      depositPercent: 20,
      costCapCents: 250000,
      validUntil: inDays(14),
    })
    await owner.quotes.saveLines({
      id: quoteId,
      lines: [
        {
          name: "3 Mann + LKW",
          itemType: "labor",
          pricingMode: "hourly",
          quantity: 8,
          unit: "Std.",
          unitPriceCents: 19500,
          costPriceCents: 12000,
          vatRatePercent: 8.1,
        },
        {
          name: "Anfahrt",
          pricingMode: "fixed",
          quantity: 1,
          unit: "Pauschale",
          unitPriceCents: 18000,
          costPriceCents: 0,
          vatRatePercent: 8.1,
        },
      ],
    })
    await owner.quotes.send({ id: quoteId, sendEmail: false })
    await owner.quotes.markAccepted({ id: quoteId })
    await processDomainEvents()
    const { data: job } = await svc.from("jobs").select("id").eq("quote_id", quoteId).single()
    jobId = job!.id as string

    const employeeId = (
      await owner.crew.employees.create({
        firstName: "Luca",
        lastName: "Meier",
        role: "foreman",
        skills: [],
      })
    ).id
    await owner.jobs.assign({
      id: jobId,
      employeeIds: [employeeId],
      leadEmployeeId: employeeId,
      vehicleIds: [],
      force: true,
    })
    await owner.jobs.transition({ id: jobId, to: "confirmed" })
    await owner.jobs.transition({ id: jobId, to: "in_progress" })
  })

  afterAll(async () => {
    for (const companyId of [companyA, companyB]) {
      for (const folder of ["quotes", "invoices"]) {
        const { data: entries } = await svc.storage.from("documents").list(`${companyId}/${folder}`)
        for (const entry of entries ?? []) {
          const { data: pdfs } = await svc.storage
            .from("documents")
            .list(`${companyId}/${folder}/${entry.name}`)
          await svc.storage
            .from("documents")
            .remove((pdfs ?? []).map((f) => `${companyId}/${folder}/${entry.name}/${f.name}`))
        }
      }
    }
    for (const userId of [ownerA.id, clerkA.id, ownerB.id]) await svc.auth.admin.deleteUser(userId)
  })

  it("records a deposit before invoicing and flags the job", async () => {
    const { data: job } = await svc
      .from("jobs")
      .select("deposit_amount_cents")
      .eq("id", jobId)
      .single()
    expect(job?.deposit_amount_cents).toBeGreaterThan(0)

    await expect(
      clerk.invoices.recordDeposit({
        jobId,
        amountCents: 10000,
        method: "cash",
        paidOn: inDays(0),
      }),
    ).rejects.toThrow(/payments.record_manual/)

    await owner.invoices.recordDeposit({
      jobId,
      amountCents: job!.deposit_amount_cents as number,
      method: "bank_transfer",
      paidOn: inDays(-5),
      reference: "Anzahlung",
    })
    const billing = await owner.invoices.forJob({ jobId })
    expect(billing.deposits).toHaveLength(1)
    expect(billing.depositPaidAt).not.toBeNull()
    expect(billing.canSettle).toBe(true)
  })

  it("creates the settlement draft from the quote with the actual hours", async () => {
    await owner.jobs.transition({ id: jobId, to: "completed", completionNotes: "Alles gut" })
    // 07:30 → 12:40 = 5 h 10 min → 5.25 h
    await svc
      .from("jobs")
      .update({
        actual_start_at: `${inDays(-1)}T05:30:00Z`,
        actual_end_at: `${inDays(-1)}T10:40:00Z`,
      })
      .eq("id", jobId)

    firstInvoice = (await clerk.invoices.createFromJob({ jobId })).id
    const detail = await owner.invoices.get({ id: firstInvoice })
    expect(detail.invoice.status).toBe("draft")
    expect(detail.invoice.invoiceNumber).toBeNull()
    expect(detail.invoice.costCapCents).toBe(250000)
    expect(detail.lines.map((l) => [l.name, l.quantity, l.quotedQuantity])).toEqual([
      ["3 Mann + LKW", 5.25, 8],
      ["Anfahrt", 1, 1],
    ])
    // VAT per line: 1'023.75 + 82.92 and 180.00 + 14.58 = 1'301.25
    expect(detail.invoice.totalAmountCents).toBe(130125)
    expect(detail.invoice.depositAppliedCents).toBeGreaterThan(0)

    await expect(owner.invoices.createFromJob({ jobId })).rejects.toThrow(/already has an invoice/)
  })

  it("refuses to issue without QR-bill data or above the cost cap without a reason", async () => {
    await expect(owner.invoices.issue({ id: firstInvoice, sendEmail: false })).rejects.toThrow(
      /QR-bill: IBAN/,
    )
    await svc
      .from("companies")
      .update({
        legal_name: "Test Umzüge GmbH",
        address_line1: "Industriestrasse 5",
        postal_code: "8305",
        city: "Dietlikon",
        bank_iban: "CH9300762011623852957",
      })
      .eq("id", companyA)

    const lines = (await owner.invoices.get({ id: firstInvoice })).lines.map((l) => ({
      quoteItemId: l.quoteItemId,
      itemType: l.itemType,
      name: l.name,
      pricingMode: l.pricingMode,
      quantity: l.name === "3 Mann + LKW" ? 12 : l.quantity,
      quotedQuantity: l.quotedQuantity,
      unit: l.unit,
      unitPriceCents: l.unitPriceCents,
      vatRatePercent: l.vatRatePercent,
    }))
    await clerk.invoices.saveLines({ id: firstInvoice, lines })
    await expect(owner.invoices.issue({ id: firstInvoice, sendEmail: false })).rejects.toThrow(
      /cost cap/,
    )
    // Even past the API, the database refuses
    await expect(
      svc.from("invoices").update({ status: "sent" }).eq("id", firstInvoice).throwOnError(),
    ).rejects.toThrow(/cost cap/)

    await clerk.invoices.update({
      id: firstInvoice,
      language: "de",
      paymentTermsDays: 30,
      costCapOverrideReason: "Zusätzliche Stunden auf Wunsch der Kundin",
    })
  })

  it("issues: number, due date, payment reference and the stored PDF with QR-bill", async () => {
    const result = await clerk.invoices.issue({ id: firstInvoice, sendEmail: false })
    expect(result.documentError).toBeNull()
    expect(result.invoiceNumber).toMatch(/^INV-\d{4}-0001$/)

    const row = await invoiceRow(firstInvoice)
    expect(row.status).toBe("sent")
    expect(row.payment_reference).toBe(
      invoicePaymentReference(row.invoice_number as string, "CH9300762011623852957"),
    )
    expect(isSCORReferenceValid(row.payment_reference as string)).toBe(true)
    const days = Math.round(
      (new Date(row.due_at as string).getTime() - new Date(row.issued_at as string).getTime()) /
        86_400_000,
    )
    expect(days).toBeGreaterThanOrEqual(30)
    expect(days).toBeLessThanOrEqual(31)

    const { data: doc } = await svc
      .from("documents")
      .select("storage_path, document_type, financial_snapshot, payment_details_snapshot")
      .eq("id", result.documentId!)
      .single()
    expect(doc?.document_type).toBe("invoice_pdf")
    expect(doc?.payment_details_snapshot).toMatchObject({ reference: row.payment_reference })
    const { data: file } = await svc.storage.from("documents").download(doc!.storage_path as string)
    const pdf = Buffer.from(await file!.arrayBuffer())
    expect(pdf.subarray(0, 5).toString("ascii")).toBe("%PDF-")
  })

  it("freezes an issued invoice", async () => {
    await expect(owner.invoices.saveLines({ id: firstInvoice, lines: [] })).rejects.toThrow(
      /already issued/,
    )
    await expect(
      svc.from("invoices").update({ title: "Changed" }).eq("id", firstInvoice).throwOnError(),
    ).rejects.toThrow(/invoice_locked/)
    await expect(
      svc.from("invoice_items").delete().eq("invoice_id", firstInvoice).throwOnError(),
    ).rejects.toThrow(/invoice_locked/)
    await expect(
      svc.from("invoices").delete().eq("id", firstInvoice).throwOnError(),
    ).rejects.toThrow(/invoice_locked/)
  })

  it("records payments: permission, over-payment, partial, cancellation", async () => {
    const before = await invoiceRow(firstInvoice)
    await expect(
      clerk.invoices.recordPayment({
        invoiceId: firstInvoice,
        amountCents: 1000,
        method: "cash",
        paidOn: inDays(0),
      }),
    ).rejects.toThrow(/payments.record_manual/)
    await expect(
      owner.invoices.recordPayment({
        invoiceId: firstInvoice,
        amountCents: (before.balance_due_cents as number) + 1,
        method: "bank_transfer",
        paidOn: inDays(0),
      }),
    ).rejects.toThrow(/exceeds the open balance/)

    const partial = await owner.invoices.recordPayment({
      invoiceId: firstInvoice,
      amountCents: 50000,
      method: "bank_transfer",
      paidOn: inDays(0),
    })
    expect(partial.status).toBe("partially_paid")
    expect(partial.balanceDueCents).toBe((before.balance_due_cents as number) - 50000)

    await expect(
      owner.invoices.recordDeposit({
        jobId,
        amountCents: 1000,
        method: "cash",
        paidOn: inDays(0),
      }),
    ).rejects.toThrow(/already invoiced/)
    // A partly paid invoice cannot be voided (payments first)
    await expect(owner.invoices.void({ id: firstInvoice, reason: "Fehler" })).rejects.toThrow(
      /not allowed/,
    )

    await owner.invoices.cancelPayment({ id: partial.id, reason: "Falsch erfasst" })
    const after = await invoiceRow(firstInvoice)
    expect(after.status).toBe("sent")
    expect(after.amount_paid_cents).toBe(0)
  })

  it("voids with a reason and settles the job again with the next number", async () => {
    await expect(clerk.invoices.void({ id: firstInvoice, reason: "x" })).rejects.toThrow(
      /invoices.cancel/,
    )
    await expect(owner.invoices.void({ id: firstInvoice, reason: " " })).rejects.toThrow()
    await owner.invoices.void({ id: firstInvoice, reason: "Falsche Stunden" })
    const voided = await invoiceRow(firstInvoice)
    expect(voided.status).toBe("void")
    expect(voided.voided_at).not.toBeNull()

    const billing = await owner.invoices.forJob({ jobId })
    expect(billing.canSettle).toBe(true)
    expect(billing.voidedInvoices).toHaveLength(1)

    secondInvoice = (await owner.invoices.createFromJob({ jobId })).id
    const draft = await owner.invoices.get({ id: secondInvoice })
    expect(draft.invoice.depositAppliedCents).toBe(voided.deposit_applied_cents)

    // A discarded draft does not use up a number
    await owner.invoices.discardDraft({ id: secondInvoice })
    secondInvoice = (await owner.invoices.createFromJob({ jobId })).id
    const issued = await owner.invoices.issue({ id: secondInvoice, sendEmail: false })
    expect(issued.invoiceNumber).toMatch(/^INV-\d{4}-0002$/)
  })

  it("turns overdue, asks for a reminder and creates reminder letters", async () => {
    await expect(
      owner.invoices.sendReminder({ id: secondInvoice, sendEmail: false }),
    ).rejects.toThrow(/not due yet/)

    await svc
      .from("invoices")
      .update({ due_at: new Date(Date.now() - 2 * 86_400_000).toISOString() })
      .eq("id", secondInvoice)
      .throwOnError()
    await svc.rpc("apply_time_based_transitions")
    expect((await invoiceRow(secondInvoice)).status).toBe("overdue")

    await svc.rpc("sync_system_tasks", { p_company_id: companyA })
    const { data: tasks } = await svc
      .from("tasks")
      .select("title, status")
      .eq("entity_id", secondInvoice)
      .eq("rule_key", "invoice.overdue")
    expect(tasks).toEqual([expect.objectContaining({ status: "open" })])
    expect(tasks?.[0]?.title).toMatch(/send reminder 1/)

    const reminder = await owner.invoices.sendReminder({
      id: secondInvoice,
      sendEmail: true,
      message: "Bitte um Überweisung",
    })
    expect(reminder.level).toBe(1)
    expect(reminder.emailDelivered).toBe(false) // no RESEND_API_KEY in tests

    const row = await invoiceRow(secondInvoice)
    expect(row.reminder_level).toBe(1)
    const { data: openTasks } = await svc
      .from("tasks")
      .select("status")
      .eq("entity_id", secondInvoice)
      .eq("rule_key", "invoice.overdue")
      .eq("status", "open")
    expect(openTasks).toHaveLength(0)

    const detail = await owner.invoices.get({ id: secondInvoice })
    expect(detail.documents.map((d) => d.kind).sort()).toEqual(["invoice", "reminder"])
  })

  it("stays overdue on a partial payment and is paid with the rest", async () => {
    const balance = (await invoiceRow(secondInvoice)).balance_due_cents as number
    const partial = await owner.invoices.recordPayment({
      invoiceId: secondInvoice,
      amountCents: 20000,
      method: "cash",
      paidOn: inDays(0),
    })
    expect(partial.status).toBe("overdue")
    const rest = await owner.invoices.recordPayment({
      invoiceId: secondInvoice,
      amountCents: balance - 20000,
      method: "bank_transfer",
      paidOn: inDays(0),
    })
    expect(rest.status).toBe("paid")
    expect(rest.balanceDueCents).toBe(0)
    const row = await invoiceRow(secondInvoice)
    expect(row.paid_at).not.toBeNull()

    await expect(
      owner.invoices.sendReminder({ id: secondInvoice, sendEmail: false }),
    ).rejects.toThrow(/Only open invoices/)
  })

  it("creates the same payment references in the database and in TypeScript", async () => {
    const cases: Array<[string, string]> = [
      ["INV-2026-0001", "CH9300762011623852957"],
      ["INV-2026-0042", "CH4431999123000889012"],
      ["INV-2031-9999", "CH4431999123000889012"],
      ["RE 7/2026", "CH9300762011623852957"],
    ]
    for (const [number, iban] of cases) {
      const { data } = await svc.rpc("invoice_payment_reference", {
        p_invoice_number: number,
        p_iban: iban,
      })
      const reference = invoicePaymentReference(number, iban)
      expect(data).toBe(reference)
      const valid = reference!.startsWith("RF")
        ? isSCORReferenceValid(reference!)
        : isQRReferenceValid(reference!)
      expect(valid).toBe(true)
    }
  })

  it("isolates companies", async () => {
    const other = await callerFor(ownerB)
    await expect(other.invoices.get({ id: secondInvoice })).rejects.toThrow(/Invoice not found/)
    await expect(
      other.invoices.recordPayment({
        invoiceId: secondInvoice,
        amountCents: 100,
        method: "cash",
        paidOn: inDays(0),
      }),
    ).rejects.toThrow(/Invoice not found/)
    await expect(other.invoices.createFromJob({ jobId })).rejects.toThrow(/not found/i)
    const list = await other.invoices.list({})
    expect(list.items).toHaveLength(0)
  })
})
