# Bivro — Phase 4: Final Settlement, Invoices with Swiss QR-bill, Payments, Reminders

Status: **Implemented** (migrations 031, 032) · 2026-10-26

From the finished move to the money in the bank: the final settlement (Schlussabrechnung) with the actual effort, the invoice with Swiss QR-bill, deposits and payments, overdue invoices and payment reminders (Mahnwesen).

---

## 1. Flow

```
Quote accepted ─▶ Job ─▶ (deposit received) ─▶ move started / completed
                                                   │
                                   "Create final settlement" (job page)
                                                   ▼
                    Settlement draft  ── edit actual quantities, extras ──▶ Issue
                                                   ▼
        Invoice INV-YYYY-NNNN (frozen, PDF with QR-bill, optional e-mail)
                 │                 │                     │
          payments (partial)   due date passes      void (reason) → settle again
                 ▼                 ▼
               Paid         Overdue → reminder 1 → 2 → 3 → debt collection / write-off
```

## 2. Final Settlement (draft invoice)

- Created from a job that is **in progress or completed** (`create_invoice_from_job`). One active invoice per job (unique index; a voided invoice can be replaced).
- Lines are copied from the job's accepted quote. **Hourly lines take the actual hours** of the job (actual start → end, rounded up to the quarter hour); the quoted quantity is kept and shown next to the actual one (editor and PDF: "offeriert: 6 Std.").
- Extras: from the catalog or as a custom line. Discounts need `quotes.apply_discount`.
- The database computes every line and total (same functions as quotes: VAT per line, half away from zero to the Rappen).
- **Deposits** recorded on the job are deducted (`deposit_applied_cents`); the editor shows total, deposit and amount due.
- **Cost cap (Kostendach)** from the quote: the editor shows the remaining room; above the cap the invoice can only be issued with a written reason (stored on the invoice, in the activity log, and enforced by the database).
- Drafts have **no number**. A draft can be discarded; the job can then be settled again.

## 3. Issuing

`invoices.issue` — checks lines, cost cap, deposits ≤ total and the company data the QR-bill needs (IBAN, name, street, postal code, city; settings → company). It builds the document as a dry run (QR-bill validation) **before** the status changes. Then, in one database transaction (`enforce_invoice_rules`):

| Set by the database | Rule |
|---|---|
| `invoice_number` | `INV-YYYY-NNNN` from the company counter — assigned only now, so discarded drafts leave **no gaps** |
| `issued_at`, `due_at` | due at 23:59:59 Swiss time, `payment_terms_days` after the invoice date (default 30, company settings) |
| `payment_reference` | QR-IBAN → 27-digit **QR reference** (recursive mod 10); other IBAN → ISO 11649 **creditor reference** `RF..` |

Afterwards the PDF is stored as an immutable document (snapshots incl. payment details) and optionally e-mailed. If rendering fails after issuing, the invoice page offers "Create PDF".

**Frozen after issuing:** lines and content columns cannot change (API and database triggers); issued invoices cannot be deleted. Only lifecycle, payment and internal fields change — and `due_at` (payment extension). Corrections: void and settle again.

## 4. PDF with QR-bill

- Template `invoice_pdf` v1 (migration 032), all four languages (`INVOICE_LABELS`, `INVOICE_TEXT`), same letterhead and window-envelope layout as the quote.
- Content: invoice no., invoice date, date of service (Leistungsdatum, VAT), due date, job no.; move details; lines with actual and quoted quantity; subtotal, VAT per rate, total, deposit received, already paid, **amount due**; cost cap note; payment terms.
- Last page: the **Swiss QR-bill** (receipt + payment part, 210 × 105 mm at the bottom edge, perforation line and scissors) generated with `swissqrbill` (PDF_ENGINE.md §7.4). Amount = amount due; reference; message "Rechnung INV-…"; debtor = billing address (omitted when incomplete).
- Creditor name: bank payee name, else legal name. Addresses are sent structured (street and house number split).
- Draft preview: `/api/invoices/{id}/preview` (marked "Entwurf", provisional reference).

## 5. Payments

| Action | Rule |
|---|---|
| Record deposit (job page) | before the job is invoiced; flags `jobs.deposit_paid_at` once the quoted deposit is reached |
| Record payment (invoice) | on open invoices; **never more than the open balance**; partial payments allowed |
| Cancel payment | with a reason; stays visible as cancelled; balance reopens |

The database keeps the invoice consistent (`apply_payment_change`, `sync_invoice_payment_status`): `amount_paid_cents`, `balance_due_cents` and the status (partially paid / paid / back to open) follow every payment change. An overdue invoice stays overdue until fully paid. Methods: bank transfer, cash, card/TWINT, other. Refunds and camt.054 bank import are not in this phase.

## 6. Overdue and Reminders (Mahnwesen)

- `apply_time_based_transitions()` (cron every 15 min, dev loop every minute) sets open invoices past their due date to **overdue**.
- System task `invoice.overdue`: "send reminder 1" right away, then 10 days after each reminder "send reminder N"; after the third: "decide on debt collection". The task resolves when the reminder is created.
- `invoices.sendReminder` (from the due date on): Zahlungserinnerung → 2. Mahnung → 3. Mahnung (with debt-collection notice). Each is a stored PDF with a new QR-bill for the **open balance** and 10 days to pay; optional e-mail. Reminder fees and interest are not charged.
- **Write off** (from the due date on) closes an unpaid balance with a reason.

## 7. Void

`invoices.void` with a required reason, only without payments (cancel them first). The number is not reused; the job can be settled again (new invoice, next number).

## 8. Permissions

| Action | Permission |
|---|---|
| See invoices, billing on the job | `invoices.view` |
| Create settlement | `invoices.create` |
| Edit draft, issue, e-mail, reminders | `invoices.edit` |
| Discount on lines | `quotes.apply_discount` |
| Void, write off | `invoices.cancel` |
| See payments | `payments.view` |
| Record / cancel payments and deposits | `payments.record_manual` |

## 9. Pages

- `/invoices` — list with open and overdue totals; filters (open, overdue, drafts, paid, void, written off).
- `/invoices/{id}` — settlement editor (draft) or invoice view (amounts, payments, documents, e-mails, reminders, void/write-off).
- Job page → **Billing** card: deposit received / expected, record deposit, create final settlement, link to the invoice.

## 10. Not in this phase

Customer portal and online payment (Stripe), bank statement import (camt.054) with automatic matching of QR references, refunds and credit notes, reminder fees and default interest, deposit invoices (Anzahlungsrechnung with QR-bill), accounting export.
