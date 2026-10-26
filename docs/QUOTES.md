# Bivro — Phase 2: Manual Quotes, PDF, E-mail

Status: **Implemented** (migrations 028, 029) · 2026-10-26

Features F007–F009, F034–F039 without AI (see project decision "no AI in V1"). Builds on the workflow engine (`WORKFLOW_ENGINE.md`) and the document architecture (`PDF_ENGINE.md`).

---

## 1. Flow

```
Customer / lead ──▶ Draft (editable) ──Send──▶ Sent (frozen, PDF stored, e-mail optional)
                                                  │
                         Customer accepted ◀──────┤──▶ Customer declined (reason required)
                                │                 ├──▶ Expired (validity date, cron)
                    job created automatically     ├──▶ Withdrawn (cancelled)
                    lead marked booked            └──▶ New version → old one "Replaced" (superseded)
```

## 2. Calculation — only in the database

| Rule | Where |
|---|---|
| Line: `subtotal = round(qty × unit price)`; manual lines: quantity 1, price = amount | `compute_quote_item()` |
| Discount per line: percent, or fixed amount (cents); never above the line amount | same |
| VAT per line: `round(net × rate)`; rounding half away from zero to the Rappen | same |
| Quote totals = sum of lines; deposit = `round(total × deposit %)` | `compute_quote_totals()` on every quote write |
| Totals sent by a client are ignored (recomputed) | same |
| Cost cap (Kostendach, incl. VAT): sending refused while the total exceeds it | `enforce_quote_send_rules()` |
| Validity date must lie in the future when sending | same |

The editor shows a live preview with the same rules (`lib/quotes/calc.ts`); the database result replaces it after saving. Unit and integration tests pin both to identical numbers.

Bixin weaknesses fixed: quantities always multiply, the cost cap is enforced, VAT appears per rate, extra costs are priced lines instead of comment text.

## 3. Locking and Versions

- A sent quote is a commercial record: lines and content columns cannot change (`quote_locked` from the database, also for direct API writes). Lifecycle fields (status, viewed/accepted timestamps, internal notes) may still change.
- Changes after sending: **New version** (`create_quote_revision()`) copies the quote and its lines into a new draft with the same number and version + 1, a fresh validity date; a sent/viewed predecessor becomes `superseded`. Only one draft per quote number at a time.
- Quote numbers stay unique per company per version (`company_id, quote_number, version`).

## 4. PDF

- HTML template v1 in `document_templates` (migration 029), one template for DE/FR/IT/EN; fixed texts from `lib/documents/labels.ts`. Values are HTML-escaped; only server-built fragments are inserted raw; unresolved tokens abort generation.
- Swiss layout: recipient in the right window position, sender line, logo and brand colour, move details, priced lines (estimated hourly lines marked "~"), subtotal, VAT per rate with base, total, deposit, cost cap, notes, acceptance text, footer with UID and IBAN, page numbers.
- Rendering: Puppeteer with headless Chrome. JavaScript disabled; requests other than our storage are blocked. Browser from `BROWSERLESS_WS_ENDPOINT` (production), `CHROME_EXECUTABLE_PATH`, or local Google Chrome.
  - Deviation from PDF_ENGINE.md §11.1: rendering runs in the Next.js server (Node runtime) instead of a Supabase Edge Function. Same engine and templates; moving it later only changes where `renderPdf()` runs.
- Sending stores the PDF immutably: `documents` row with company/customer/financial/line snapshots (never cost prices), private `documents` bucket, path `{company}/quotes/{quote}/quote_pdf-v{n}-{document}.pdf`, SHA-256 hash. Downloads use signed URLs valid for one hour.
- Drafts can be previewed (`/api/quotes/{id}/preview`) without storing anything.

## 5. E-mail

- Sent in the name of the company (display name = company, reply-to = company e-mail), text in the customer's language, optional personal message, PDF attached.
- Every attempt is written to `email_logs`. Without `RESEND_API_KEY` nothing leaves the machine: the attempt is logged as *not delivered — no e-mail provider configured* and the user is told to send the PDF manually. Sending (freezing) the quote is independent of delivery; "E-mail again" re-sends the stored PDF.
- Required for production: Resend account, verified sender domain (`EMAIL_SENDER_DOMAIN`, default `mail.bivro.io`).

## 6. Permissions

| Action | Permission |
|---|---|
| View quotes | `quotes.view` |
| Create | `quotes.create` |
| Edit draft, new version, accepted/declined | `quotes.edit` |
| Discounts | `quotes.apply_discount` |
| See and edit cost prices and margin | `quotes.view_cost_price` (without it, saving keeps the existing cost prices) |
| Send / e-mail again | `quotes.send` |
| Withdraw / cancel | `quotes.delete` |

## 7. Local Development

- Domain events (job creation on acceptance) are processed by `GET /api/cron/process-events`; locally call it with the `CRON_SECRET`, in production Vercel Cron runs it every minute.
- PDF rendering needs Google Chrome installed (or `CHROME_EXECUTABLE_PATH`).
