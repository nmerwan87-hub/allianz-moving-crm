# Bivro PDF Engine Architecture

**Document status:** Architecture specification — no implementation code, no migrations, no React components.
**Version:** V1
**Cross-references:** ARCHITECTURE.md §13 §14, DATABASE_ARCHITECTURE.md §6.16 §14 §15, EMAIL_SYSTEM.md, AI_ENGINE.md, UI_UX_SYSTEM.md, PRODUCT_REQUIREMENTS.md §3.3

---

## Table of Contents

1. [Document Philosophy](#1-document-philosophy)
2. [Tenant Document Identity](#2-tenant-document-identity)
3. [Document Type Catalogue](#3-document-type-catalogue)
4. [Quote PDF Architecture](#4-quote-pdf-architecture)
5. [Quote Versioning Rules](#5-quote-versioning-rules)
6. [Invoice Architecture](#6-invoice-architecture)
7. [Jurisdiction-Aware Document Profiles](#7-jurisdiction-aware-document-profiles)
8. [Document Design System](#8-document-design-system)
9. [Tenant Document Theme System](#9-tenant-document-theme-system)
10. [Document Snapshot Architecture](#10-document-snapshot-architecture)
11. [Document Generation Lifecycle](#11-document-generation-lifecycle)
12. [Document Storage Architecture](#12-document-storage-architecture)
13. [Document Security](#13-document-security)
14. [Permissions](#14-permissions)
15. [AI Document Assistance](#15-ai-document-assistance)
16. [Multilingual Documents](#16-multilingual-documents)
17. [Document Preview UX](#17-document-preview-ux)
18. [Email System Integration](#18-email-system-integration)
19. [Customer Portal Integration](#19-customer-portal-integration)
20. [Audit Requirements](#20-audit-requirements)
21. [V1 vs V1.5 vs V2+ Scope](#21-v1-vs-v15-vs-v2-scope)
22. [Cross-Document Consistency](#22-cross-document-consistency)
23. [Final Report](#23-final-report)

---

## 1. Document Philosophy

### 1.1 The Core Thesis

PDFs and business documents in Bivro are not print exports. They are legally and commercially significant representations of a company's professional relationship with its customer. A poorly formatted quote undermines trust before the crew arrives. An invoice that cannot be reconciled with a payment costs time and creates disputes. A damage report that omits key information creates liability.

Every generated document is a moment of truth. Bivro's document infrastructure makes that moment professional, accurate, and trustworthy — every time, for every company.

### 1.2 Five Document Principles

**P1 — Company First**
The customer sees the moving company's identity. Logo, colors, name, address, contact — all company-owned. Bivro's role is invisible in the delivered document.

**P2 — Immutability Is Non-Negotiable**
Every generated document is a permanent, unchangeable artifact. Changing a template, a company logo, a service name, or a bank account never retroactively alters a generated document. The file in storage is the record.

**P3 — Structured Data, Not AI Fabrication**
Every business fact in a document — prices, totals, VAT, addresses, dates, bank details — originates from structured Bivro records. The AI may assist with prose and notes. It never sources or invents numbers.

**P4 — Graceful Completeness**
A document that cannot be fully generated because required data is missing must not be silently sent with gaps. Generation must fail visibly and specifically so the operator can correct the record before the document reaches the customer.

**P5 — Print-Ready, Screen-Legible**
Documents are designed to be read on screen and printed. They must be legible in black-and-white print. Color is an enhancement, not a dependency. Grayscale printing must never produce confusion.

### 1.3 What Documents Are Not

- Not real-time HTML views. Documents are frozen PDFs — snapshots, not live data.
- Not internal dashboards. Information visible in internal analytics (cost, margin) may be excluded from customer-facing documents per permission rules.
- Not marketing materials. These are operational and commercial documents. Clean, professional, functional.

---

## 2. Tenant Document Identity

Every company has its own isolated document identity. No branding, legal text, financial details, or contact information from one company ever appears in another company's documents.

### 2.1 Company Identity Fields on Documents

The following fields constitute the canonical company document identity. All are sourced from the `companies` and `company_settings` tables at document generation time and captured in the generation snapshot:

**Visual identity:**
- Company legal name (`companies.name`)
- Trading name / DBA if different (configurable in company settings)
- Company logo — Supabase Storage path (`companies.logo_url`)
- Document accent color — hex value (company theme setting)

**Contact and location:**
- Primary address (street, city, postal code, country)
- Phone number
- Email address
- Website URL

**Legal and commercial identity:**
- VAT / tax number (formatted per jurisdiction)
- Commercial registration number (where applicable)
- Bank name
- IBAN / account number
- Bank sort code / routing number (where applicable)
- Payment reference prefix
- BIC / SWIFT code

**Document configuration:**
- Document footer text (freetext; can include legal disclaimers)
- Terms and conditions reference (URL or abbreviated text)
- Service agreement text (`company_settings.service_agreement_text`)
- Signature block information (signatory name, title)
- Review / acceptance instructions

### 2.2 Fallback Behavior for Incomplete Identity

Generation is blocked or degraded gracefully when required fields are missing:

| Missing field | Behavior |
|--------------|----------|
| Logo | Document renders without logo; logo zone shows company name in text |
| Accent color | Falls back to Bivro neutral palette (dark navy / white) |
| VAT number | Omitted from document; no placeholder rendered |
| Bank details (on invoice) | Generation blocked with specific error: "Bank details required for invoice generation — complete in Settings → Banking" |
| Company address | Generation blocked: "Company address required — complete in Settings → Company" |
| Terms reference | Footer renders without terms link; no placeholder rendered |

**Rule:** Required fields for financial documents (invoice, payment receipt) block generation. Missing non-required fields are omitted cleanly — no `{{variable}}` tokens ever reach a customer document.

---

## 3. Document Type Catalogue

### 3.1 V1 Document Types

The following document types are generated in Bivro V1. Each entry maps to a value in the `document_type` ENUM in DATABASE_ARCHITECTURE.md.

| # | Document type | ENUM value | Audience | Customer-facing | V1 status |
|---|--------------|-----------|----------|----------------|-----------|
| 1 | Quote / Offer | `quote_pdf` | Customer | Yes | ✅ V1 |
| 2 | Service Agreement | `contract` | Customer | Yes | ✅ V1 |
| 3 | Signed Service Agreement | `signed_contract` | Internal + Customer | Yes | ✅ V1 |
| 4 | Invoice | `invoice_pdf` | Customer | Yes | ✅ V1 |
| 5 | Payment Receipt | `payment_receipt` | Customer | Yes | ✅ V1 — **ENUM addition required** |
| 6 | Damage Report | `damage_report` | Internal + Customer | Conditional | ✅ V1 |
| 7 | Work Order / Internal Job Sheet | `work_order` | Crew / Internal | No | ✅ V1 — **ENUM addition required** |

### 3.2 V1.5 Document Types

| # | Document type | ENUM value | Notes |
|---|--------------|-----------|-------|
| 8 | Completion / Delivery Confirmation | `delivery_receipt` | Signed completion confirmation |
| 9 | Bill of Lading | `bill_of_lading` | Long-distance / international moves |
| 10 | Credit Note | `credit_note` | Partial or full credit against an invoice — **ENUM addition required** |
| 11 | Cancellation Confirmation | `cancellation_confirmation` | Written record of job cancellation — **ENUM addition required** |
| 12 | Booking Confirmation | `booking_confirmation` | Distinct from service agreement; simpler summary — **ENUM addition required** |

### 3.3 V2+ Document Types

| # | Document type | ENUM value | Notes |
|---|--------------|-----------|-------|
| 13 | Survey Summary | `survey_summary` | Post-survey report for customer — **ENUM addition required** |
| 14 | Inventory Summary | `inventory_summary` | Detailed inventory as a customer document — **ENUM addition required** |
| 15 | Insurance Certificate | `insurance_certificate` | Already in ENUM; complex compliance document |

### 3.4 Per-Document Type Specification

---

**Document 1 — Quote PDF**
- Purpose: Present the formal price offer to the customer
- Audience: Customer
- Customer-facing: Yes
- Source data: `quotes`, `quote_items`, `service_catalog`, `customers`, `companies`, `company_settings`
- Generation trigger: Operator explicitly sends quote (`quotes.send` permission required) OR manual "Generate PDF" action
- Approval requirement: None (operator's send action is the approval)
- Versioning: Each quote revision (new `quotes` row with incremented `version`) generates a new Quote PDF. All versions retained.
- Immutability: Absolute. Once generated and stored, never overwritten or replaced.
- Regeneration: Only when a new quote version is created. Never regenerates silently using updated data.
- Delivery: Email attachment (EMAIL_SYSTEM.md Stage 7) or customer portal link
- Retention: Permanent — all versions
- Full architecture: See §4

---

**Document 2 — Service Agreement**
- Purpose: The legal contract between company and customer for the confirmed move
- Audience: Customer
- Customer-facing: Yes
- Source data: Accepted quote, `company_settings.service_agreement_text`, `customers`, `companies`, job details
- Generation trigger: Quote accepted (`quoting.quote.accepted` domain event)
- Approval requirement: Auto-generated on acceptance; operator may review before delivering
- Versioning: One per accepted quote. Replaced only if terms are amended (creates new version).
- Immutability: Absolute once signed. Pre-signature versions may be superseded.
- Regeneration: Never for a signed agreement. A new version may be generated for unsigned agreement amendments.
- Delivery: Email with booking confirmation (EMAIL_SYSTEM.md Stage 11); customer portal
- Retention: Permanent — all versions

---

**Document 3 — Signed Service Agreement**
- Purpose: The countersigned agreement with customer signature captured
- Audience: Customer + Internal
- Customer-facing: Yes (customer receives their copy)
- Source data: `signed_contract` document + signature data (`quotes.signature_url`, `quotes.terms_accepted_at`, `quotes.signed_by_name`)
- Generation trigger: Customer digitally signs via portal OR operator uploads physical signature scan
- Approval requirement: None; signature event is the trigger
- Versioning: One per accepted quote. The signed version supersedes the unsigned agreement.
- Immutability: Absolute. A signed agreement is a legal document.
- Regeneration: Never.
- Delivery: Emailed to customer automatically on signing; stored in portal
- Retention: Permanent — legal record

---

**Document 4 — Invoice**
- Purpose: Formal billing document requesting payment
- Audience: Customer
- Customer-facing: Yes
- Source data: `invoices`, `invoice_items`, `customers`, `companies`, `company_settings`, `jobs`
- Generation trigger: Operator creates invoice (`invoices.create` permission) OR automation (`operations.job.completed` domain event if auto-invoice is configured)
- Approval requirement: Operator review before send (or Owner-configured auto-send)
- Versioning: All versions retained. A corrected invoice is a new version; the old version is marked superseded but retained.
- Immutability: Absolute for sent invoices. Draft invoices may be edited before send.
- Regeneration: Only when a corrected invoice is issued (new version; old version retained with status `superseded`).
- Delivery: Email attachment (EMAIL_SYSTEM.md Stage 20); customer portal
- Retention: Permanent — financial record
- Full architecture: See §6

---

**Document 5 — Payment Receipt**
- Purpose: Confirm that payment was received
- Audience: Customer
- Customer-facing: Yes
- Source data: `payments`, `invoices`, `customers`, `companies`
- Generation trigger: Payment recorded and invoice status transitions to `paid`
- Approval requirement: Auto-generated; may be auto-sent (EMAIL_SYSTEM.md Stage 21)
- Versioning: One per payment. Receipts are not revised; if a payment is reversed, a separate credit note is issued.
- Immutability: Absolute.
- Regeneration: Never. A receipt is a permanent record of a payment event.
- Delivery: Email attachment (EMAIL_SYSTEM.md Stage 21)
- Retention: Permanent — financial record

---

**Document 6 — Damage Report**
- Purpose: Document any damage that occurred during the move
- Audience: Internal + Customer (conditional)
- Customer-facing: Conditional — operator decides whether to share with customer
- Source data: `damage_reports` (V1.5 table) or job notes; `jobs`, `customers`, `companies`; photos attached separately
- Generation trigger: Operator manually triggers during or after job
- Approval requirement: Owner or authorized user must review before customer delivery
- Versioning: All versions retained — each update creates a new version; previous versions preserved as evidence
- Immutability: Absolute for each version.
- Regeneration: New version created when updates are made; previous version retained.
- Delivery: Manual; operator decision
- Retention: Permanent — legal / insurance record

---

**Document 7 — Work Order / Internal Job Sheet**
- Purpose: Crew-facing operational brief for the move day
- Audience: Crew / Internal only
- Customer-facing: No — never delivered to customer
- Source data: `jobs`, `job_crew_assignments`, `vehicles`, `quotes` (snapshot), `customers` (name + origin/dest only)
- Generation trigger: Job preparation complete; operator triggers generation
- Approval requirement: None — internal document
- Versioning: Latest version only (supersedes prior). Prior versions accessible in history.
- Immutability: Not strictly required — internal document; however, the version delivered to crew must be preserved.
- Regeneration: Permitted when job details change (new version created; old version marked superseded but retained for audit)
- Delivery: Internal; printed by office or shared with crew (no customer portal)
- Retention: Per operational audit requirements

---

## 4. Quote PDF Architecture

### 4.1 Information Architecture

The Quote PDF is Bivro's flagship customer-facing document. It is the primary commercial artifact of the sales process. Its structure is canonical — companies may customize content through their document theme but may not reorder the mandatory sections.

**Page 1 — Header and Customer Block**

```
┌──────────────────────────────────────────────────────────┐
│ [COMPANY LOGO]           QUOTE / OFFER                   │
│                          Quote No: QT-2026-0042          │
│ [Company Legal Name]     Version:  2                     │
│ [Address Line 1]         Issue Date: 15. Juli 2026       │
│ [City, Postal Code]      Valid Until: 14. Aug 2026       │
│ [Phone] [Email]                                          │
│ [VAT No. / Reg. No.]                                     │
├──────────────────────────────────────────────────────────┤
│ PREPARED FOR                                             │
│ [Customer Full Name]                                     │
│ [Customer Address]                                       │
│ [Customer Email] · [Customer Phone]                      │
├──────────────────────────────────────────────────────────┤
│ MOVE DETAILS                                             │
│ Move Type:       [Local / Long-Distance / International] │
│ Scheduled Date:  [Date or "Flexible — to be confirmed"]  │
│ From:            [Origin Address, Floor, Elevator Y/N]   │
│ To:              [Destination Address, Floor, Elevator]  │
│ Estimated Scope: [X hours estimated] / [X km distance]   │
└──────────────────────────────────────────────────────────┘
```

**Page 1 continued — Services and Pricing**

```
┌──────────────────────────────────────────────────────────┐
│ SERVICES                                                 │
├──────┬────────────────────┬────────────┬────────┬────────┤
│  #   │ Service            │ Qty / Unit │  Rate  │ Amount │
├──────┼────────────────────┼────────────┼────────┼────────┤
│  1   │ Moving Labor       │ est. 4 h   │ CHF 95 │ ~380 * │
│  2   │ Packing Service    │ est. 2 h   │ CHF 75 │ ~150 * │
│  3   │ Packing Materials  │ 10 boxes   │ CHF  8 │  CHF 80│
│  4   │ Furniture Lift     │ Fixed      │        │ CHF 250│
│  5   │ Stair Surcharge    │ Fixed      │        │  CHF 60│
├──────┴────────────────────┴────────────┴────────┴────────┤
│                                    * Estimated — see note│
│                                                          │
│ Subtotal                                       CHF 920   │
│ Discount (Spring Offer)                       -CHF  50   │
│ VAT 8.1%                                       CHF  70   │
│                                          ──────────────  │
│ Total                                        CHF 940     │
│                                                          │
│ Deposit Required (20%)                         CHF 188   │
└──────────────────────────────────────────────────────────┘
```

**Page 1 continued or Page 2 — Notes, Assumptions, Terms**

```
┌──────────────────────────────────────────────────────────┐
│ NOTES TO CUSTOMER                                        │
│ [company_notes — customer-visible; AI-assisted text]     │
│                                                          │
│ ASSUMPTIONS                                              │
│ This quote is based on the following assumptions:        │
│ · The inventory described by the customer                │
│ · Ground floor access at origin                         │
│ · [Additional assumptions per operator entry]            │
│                                                          │
│ EXCLUSIONS                                               │
│ · Items not listed above                                 │
│ · [Additional exclusions per operator entry]             │
│                                                          │
│ ESTIMATED ITEMS (*)                                      │
│ Items marked with * are billed on actual time/quantity.  │
│ Estimated figures are for planning purposes only.        │
│ The final invoice reflects actual time/quantity used.    │
│                                                          │
│ ACCEPTANCE                                               │
│ To confirm this quote, please visit:                     │
│ [portal.company.com/quote/QT-2026-0042]                 │
│                                                          │
│ TERMS AND CONDITIONS                                     │
│ Full terms available at [company website / T&C URL]      │
└──────────────────────────────────────────────────────────┘
```

**Footer (all pages):**
```
[Company Name] · [Address] · [Phone] · [Email]
Quote QT-2026-0042 · Version 2 · Page {n} of {total}
[Optional legal footer line from company_settings.quote_footer_text]
```

### 4.2 Line Item Pricing Mode Presentation

The presentation of each line item depends on its pricing mode. Misrepresenting an estimate as a fixed price is a critical error — the document must never do this.

| Pricing mode | Qty / Unit column | Rate column | Amount column | Visual indicator |
|-------------|------------------|------------|--------------|-----------------|
| `fixed` | — | — | CHF 250 | None — amount is confirmed |
| `hourly` | est. 4 h | CHF 95/h | ~CHF 380 | `~` prefix + asterisk note |
| `quantity` | 10 boxes | CHF 8/box | CHF 80 | None if quantity confirmed |
| `distance` | 320 km | CHF 1.50/km | ~CHF 480 | `~` prefix (distance may vary) |
| `manual` | — | — | [See notes] | Explicit note required |

**Non-negotiable rule:** Any line item billed on actual usage (hourly, quantity if unconfirmed, distance) must be visually distinguished from fixed prices. The document must include the disclaimer: "Items marked with * are billed on actual time or quantity. Estimated figures are for planning purposes only."

This rule is enforced at the template level — it cannot be removed by company customization.

### 4.3 Inventory Summary Section

If an inventory list exists for the quote (from lead survey or AI parsing), a summarized inventory block appears between Move Details and Services:

```
INVENTORY SUMMARY
Living room: Sofa (3-seat), Coffee table, TV unit, 3 armchairs
Bedroom 1: Double bed (disassembly included), 2 bedside tables, Wardrobe
Kitchen: Refrigerator, Washing machine, Dishwasher
Boxes: approx. 35–40 medium boxes (estimate)
Special items: Grand piano [see specialty items above]
[Total items: 47 · Estimated weight: 1,800 kg]
```

The inventory summary is optional (not all quotes have detailed inventories in V1) and omitted when no inventory data exists. Never renders with placeholder text.

### 4.4 Multi-Page Handling

Long service lists or detailed inventories may require page 2. The template handles this automatically:
- Section headers repeat at the top of continuation pages
- "Continued from previous page" label on page 2+
- Pricing summary block always starts on a fresh half-page minimum (no page break mid-summary)
- Footer with quote number, version, and page count appears on every page

---

## 5. Quote Versioning Rules

### 5.1 The Versioning Model

A quote in Bivro is identified by its `quote_number` (e.g., `QT-2026-0042`) and versioned by its `quotes.version` integer. Each revision of a quote creates a new `quotes` row in the database. The revised row has:
- The same `quote_number`
- A higher `version` number (version + 1)
- `parent_quote_id` referencing the original quote (version 1's UUID)
- A new UUID (new `quotes.id`)
- Status starting as `draft` until the revision is sent

This means every quote version is an independent, fully-formed quote record — not a diff or delta. Each revision contains all the data for that version of the quote.

### 5.2 Version Lifecycle States

Each quote version has one of the following `quote_status` values:

| Status | Description |
|--------|-------------|
| `draft` | Being edited; no PDF generated yet |
| `pending_review` | Awaiting operator review before send |
| `sent` | Sent to customer; PDF exists and is immutable |
| `viewed` | Customer has opened the quote at least once |
| `accepted` | Customer confirmed this version |
| `declined` | Customer rejected this version |
| `expired` | Valid-until date passed with no response |
| `superseded` | A newer version exists; this version is no longer current |
| `lost` | Operator marked as lost (no customer response) |

**State transition rule:** When a new version is created from an existing `sent` or `viewed` quote, the prior version transitions to `superseded`. It is never deleted. The prior PDF remains stored and accessible.

### 5.3 PDF Generation and Version Binding

A Quote PDF is generated and permanently bound to a specific `quotes.id`. This means:
- QT-2026-0042 Version 1 → `documents` row with `entity_id = quotes_v1.id`
- QT-2026-0042 Version 2 → `documents` row with `entity_id = quotes_v2.id`

Both PDF files exist permanently in Supabase Storage. Neither is ever overwritten.

**Storage path convention (DATABASE_ARCHITECTURE.md §14):**
```
{company_id}/quotes/{quote_id}/quote-v{version}.pdf
```

Where `{quote_id}` is the specific `quotes.id` UUID and `{version}` is `quotes.version`. Since each version is a distinct UUID, the path uniquely identifies each version.

### 5.4 The Accepted Version Is a Commercial Record

The quote version a customer accepts becomes the authoritative commercial record of the agreed scope and price. It must:
- Never be deleted
- Never be regenerated or replaced
- Survive template changes, service name changes, company branding changes
- Be linked to the resulting job and invoice as the pricing authority
- Be permanently accessible in the quote detail page version history

The `quotes.accepted_at` timestamp on the accepted version and the PDF file in Supabase Storage together form the immutable commercial commitment record.

### 5.5 Version History UI

Displayed in Quote Detail → Version History:

```
QT-2026-0042 — Thompson Family Move

● Version 3 (Current)   Sent 14 Jul 2026    CHF 940
                         [View PDF] [Download]

○ Version 2             Sent 10 Jul 2026    CHF 980   [Superseded]
                         Opened 3×          [View PDF] [Download]

○ Version 1             Sent 7 Jul 2026     CHF 1,050 [Superseded]
                         Not opened         [View PDF] [Download]
```

All versions are permanently visible and downloadable to authorized users. This history cannot be deleted.

---

## 6. Invoice Architecture

### 6.1 Information Architecture

The Invoice is a legally significant financial document. Its information architecture is defined to accommodate jurisdiction-specific requirements through the document profile system (§7) while maintaining a canonical structure.

**Invoice header block:**

```
┌──────────────────────────────────────────────────────────┐
│ [COMPANY LOGO]           INVOICE / RECHNUNG / FACTURE    │
│                          [Document title per language]   │
│ [Company Legal Name]     Invoice No: INV-2026-0088       │
│ [Company Address]        Invoice Date: 15. Juli 2026     │
│ [City, Postal Code]      Due Date: 22. Juli 2026         │
│ [Phone · Email]          Reference: Job JB-2026-0041     │
│ [VAT No: CHE-xxx.xxx.xxx MWST]                           │
│ [Company Reg. No.]                                       │
└──────────────────────────────────────────────────────────┘
```

**Customer billing block:**

```
BILL TO
[Customer Full Name / Company Name]
[Billing Address Line 1]
[City, Postal Code, Country]
[Customer VAT number if applicable]
```

**Line items:**

```
┌──────┬────────────────────────┬───────┬──────────┬──────────┐
│  #   │ Description            │  Qty  │  Unit    │  Amount  │
├──────┼────────────────────────┼───────┼──────────┼──────────┤
│  1   │ Moving Labor           │ 4.5 h │ CHF 95/h │ CHF 427.50│
│  2   │ Packing Service        │ 1.5 h │ CHF 75/h │ CHF 112.50│
│  3   │ Packing Materials      │ 8 pcs │ CHF  8/pc│ CHF  64.00│
│  4   │ Stair Surcharge        │     1 │  fixed   │ CHF  60.00│
├──────┴────────────────────────┴───────┴──────────┴──────────┤
│                                   Subtotal:    CHF 664.00   │
│                                   Discount:   -CHF  50.00   │
│                                   Net:         CHF 614.00   │
│                                   VAT 8.1%:    CHF  49.73   │
│                                   ──────────────────────    │
│                                   TOTAL:       CHF 663.73   │
│                                                             │
│                                   Deposit paid: CHF 188.00  │
│                                   OUTSTANDING:  CHF 475.73  │
└─────────────────────────────────────────────────────────────┘
```

**Payment information block:**

```
PAYMENT INFORMATION
Please transfer the outstanding amount to:
Bank:    [Bank Name]
IBAN:    CH56 0483 5012 3456 7800 9
BIC:     [SWIFT/BIC code]
Payee:   [Company Legal Name]
Reference: INV-2026-0088

[QR-Bill zone — V1.5, CH jurisdiction only]

Payment Terms: Due within 7 days of invoice date.

[Optional legal footer from company_settings.invoice_footer_text]
```

### 6.2 Invoice Line Items Are Actuals, Not Estimates

Unlike quote line items (which may be estimated), invoice line items reflect actual hours, quantities, and distances used. The invoice must not carry the `~` estimated indicator from the quote. If an item is billed as actual time, the actual time must be recorded in `invoice_items` before the invoice is generated.

**Rule:** Invoice generation is blocked if any line item has a null quantity for an hourly or quantity-priced service. The operator must confirm actuals before generating the invoice.

### 6.3 Invoice and Quote Reconciliation

When an invoice is generated from a completed job, the invoice line items correspond to the services in the accepted quote. Where actuals differ from estimates:
- The invoice shows the actual amount charged
- An optional "Quote reference" note can be included: "This invoice reflects actual time used. Original quote estimated [X hours]."
- This note is operator-configurable and never fabricated by AI

---

## 7. Jurisdiction-Aware Document Profiles

### 7.1 The Problem

No single invoice format is legally valid or culturally appropriate in every country. Date formats, currency notation, VAT label, bank payment format, legal disclosure requirements, and decimal separators all vary by jurisdiction.

Bivro does not claim to produce legally compliant documents for every jurisdiction without configuration. The company operator is responsible for understanding their local requirements. Bivro provides a configurable document profile system that makes correct formatting straightforward for supported jurisdictions.

### 7.2 Document Profile Fields

Each company is assigned a document profile based on their country of operation. The profile controls:

| Field | Purpose |
|-------|---------|
| `currency_code` | ISO 4217 (CHF, EUR, USD, GBP, AUD, etc.) |
| `currency_symbol` | CHF, €, $, £, A$ |
| `currency_position` | Before or after amount |
| `decimal_separator` | `.` (US/UK) or `,` (DE/CH/FR) |
| `thousands_separator` | `,` (US/UK) or `.` (DE/CH) or space (FR/CH) |
| `date_format` | `DD.MM.YYYY` (CH/DE) vs `DD/MM/YYYY` (UK) vs `MM/DD/YYYY` (US) |
| `vat_label` | MWST (CH-DE), TVA (CH-FR), IVA (CH-IT/IT), MwSt (DE/AT), VAT (UK), TVA (FR), Tax (US) |
| `vat_number_label` | CHE-xxx.xxx.xxx MWST (CH) vs USt-IdNr. (DE) vs VAT (UK) |
| `bank_format` | IBAN-based (EU/CH/UK) vs routing+account (US) vs BSB (AU) |
| `qr_bill_enabled` | true / false — CH-specific payment slip |
| `invoice_title` | "Invoice" / "Rechnung" / "Facture" / "Fattura" |
| `quote_title` | "Quote" / "Offerte" / "Devis" / "Preventivo" |
| `page_size` | A4 (default, ISO) vs US Letter |

### 7.3 V1 Jurisdiction Profiles

The following profiles are available in V1:

| Country | Currency | VAT label | Date format | Bank format | QR-bill |
|---------|---------|-----------|------------|------------|---------|
| Switzerland (CH) | CHF | MWST / TVA / IVA | dd.mm.yyyy | IBAN + BIC | V1.5 |
| Germany (DE) | EUR | MwSt | dd.mm.yyyy | IBAN + BIC | — |
| Austria (AT) | EUR | MwSt | dd.mm.yyyy | IBAN + BIC | — |
| France (FR) | EUR | TVA | dd/mm/yyyy | IBAN + BIC | — |
| Italy (IT) | EUR | IVA | dd/mm/yyyy | IBAN + BIC | — |
| United Kingdom (GB) | GBP | VAT | dd/mm/yyyy | Sort Code + Account | — |
| United States (US) | USD | Tax (state-specific) | mm/dd/yyyy | ABA Routing + Account | — |
| Canada (CA) | CAD | GST/HST/PST | yyyy-mm-dd | Transit + Account | — |
| Australia (AU) | AUD | GST | dd/mm/yyyy | BSB + Account | — |
| UAE (AE) | AED | VAT | dd/mm/yyyy | IBAN + BIC | — |

**Default profile:** Switzerland (CH) — aligned with Bivro's primary initial market.

**Profile extensibility:** Adding a new profile requires adding the profile configuration to the system (no code change — data migration), not a new template. The template rendering engine reads the profile at generation time.

### 7.4 Swiss-Specific Architecture (V1 + V1.5)

**V1 — Swiss invoice:**
- CHF currency, formatted per Swiss convention (e.g., CHF 1'234.50 using apostrophe as thousands separator)
- Three official language variants: German (MWST), French (TVA), Italian (IVA) — selected per company or customer language
- Swiss company format: CHE-xxx.xxx.xxx MWST
- IBAN printed in standard grouped format: CH56 0483 5012 3456 7800 9

**V1.5 — QR-Bill (Swiss ISO 20022 Payment Slip):**
The QR-bill is the Swiss standard payment slip, replacing legacy orange/red payment slips. It encodes payment information in a QR code printed at the bottom of the invoice.

QR-bill contains (encoded + human-readable):
- Creditor IBAN
- Creditor name and address
- Amount and currency (CHF)
- Reference number (QR-IBAN reference or creditor reference)
- Additional payment information

**V1.5 scope decision:** QR-bill generation is architecturally prepared but not built in V1. Reasons: QR-bill has strict formatting requirements validated by SIX Group. Implementing it incorrectly produces invoices that cannot be scanned by Swiss banking apps. A dedicated Swiss QR-bill library with SIX Group validation is required. This adds dependency and testing complexity that is deferred to V1.5.

**V1.5 upgrade path:** Add a QR-bill rendering zone to the CH invoice template HTML (reserved whitespace at bottom of last page). Generate QR code via a dedicated library (e.g., `swiss-qr-bill` npm package — requires explicit architectural decision per CODING_STANDARDS.md). No schema changes required.

---

## 8. Document Design System

This design system governs the visual design of all generated PDFs. It is separate from the Compass application UI design system (UI_UX_SYSTEM.md §3) but shares typeface and spacing foundations.

### 8.1 Core Design Principles for Documents

- **Operational, not decorative.** These are commercial documents, not SaaS marketing materials. Clean lines, clear hierarchy, no visual noise.
- **Grayscale-safe.** Every document must be fully legible and unambiguous when printed in black-and-white. Color communicates emphasis, never exclusive meaning.
- **Print-ready.** PDF is generated for print output (300 DPI equivalent via Puppeteer, `@media print` CSS). Screen and print versions are identical.
- **Consistent across companies.** The layout grid is fixed. Company customization is limited to logo, accent color, and contact content. Companies cannot move sections or break the grid.

### 8.2 Page Layout

```
Page size:       A4 (210mm × 297mm) — default
                 US Letter (8.5" × 11") — for US/CA profile
Top margin:      18mm
Bottom margin:   20mm (footer zone included)
Left margin:     20mm
Right margin:    18mm
Content width:   172mm (A4) / 178mm (Letter)
Header zone:     Top 55mm (company identity + document identity)
Footer zone:     Bottom 12mm (company contact, doc number, page)
```

### 8.3 Typography

Puppeteer renders HTML to PDF. Fonts are loaded via system-safe web fonts embedded in the template HTML.

```
Font stack:      'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif
                 Inter is loaded from a self-hosted or CDN source embedded in the template
                 (no runtime HTTP request from Puppeteer — font is inlined at build time)

Document title:  20pt / Bold / dark primary color
Section heading: 11pt / SemiBold / dark primary color / uppercase / letter-spacing 0.08em
Table header:    9pt / SemiBold / uppercase / background: light gray or accent light
Body text:       9.5pt / Regular / color: dark gray (#1A1A1A)
Table body:      9pt / Regular
Amount cells:    9pt / Monospace / tabular numerals (font-variant-numeric: tabular-nums)
Footer text:     7.5pt / Regular / color: medium gray
Caption / note:  8pt / Italic / color: medium gray
```

**Tabular numerals:** Amount columns must use tabular-width numerals so decimal points align vertically. This is enforced via CSS `font-variant-numeric: tabular-nums` on amount cells.

### 8.4 Color Usage in Documents

```
Primary color:   #1A2744  (dark navy — headings, borders, document title)
Body text:       #1A1A1A  (near-black)
Secondary text:  #555555  (labels, notes, captions)
Subtle border:   #E0E0E0  (table row dividers, section dividers)
Header bg:       #F5F5F5  (table header row background)
Accent:          [company-configured hex color] — used for:
                 • Document title bar or accent stripe
                 • Table header row background (alternative)
                 • Section heading underline
                 • Primary button zone (acceptance instructions)
```

**Grayscale rule:** Company accent color is only used for structural decoration (borders, backgrounds), never to differentiate data meaning. A red amount is never used to indicate a negative/credit — text labels are used instead.

### 8.5 Table Design

```
Table width:     100% of content zone
Column alignment:
  Description:   Left-aligned
  Quantity:      Right-aligned
  Rate:          Right-aligned
  Amount:        Right-aligned
Row height:      Minimum 7mm (ensures legibility when printed)
Header row:      Distinct background (light gray or accent-light)
Alternating rows: Optional — subtle alternate row tint (#FAFAFA)
Row borders:     Hairline (0.25pt) horizontal rules between rows
Column borders:  None (prevents visual noise)
```

**Long table behavior:** If a service list exceeds the page, the table continues on the next page with the column header row repeated. "Continued" label in the header of the continuation section.

### 8.6 Logo Placement

```
Position:        Top-left of header zone
Max dimensions:  55mm wide × 25mm tall
Scaling:         Proportional fit within bounding box
Fallback:        Company legal name in bold 14pt in logo zone
Format:          PNG or SVG (SVG preferred for print quality)
Background:      White — logo must be visible on white background
                 Dark logos: rendered as-is (dark on white works)
                 Light logos: rendered on a light gray (#F0F0F0) tile
```

### 8.7 Spacing System

Base unit: 4px (aligning with Compass UI spacing).
```
Section gap:     16px (4 × 4px) — between major document sections
Row gap:         6px — between table rows and inline elements
Content padding: 12px — inside bordered boxes (notes, disclaimer zones)
Page number:     Right-aligned in footer zone
```

### 8.8 Orphan and Widow Prevention

CSS `page-break-inside: avoid` is applied to:
- Pricing summary blocks (subtotal → total must never be separated from the line items above)
- Section headers (header never appears alone at bottom of page)
- Customer and company identity blocks
- Payment information blocks
- Signature areas

The template applies `orphans: 3` and `widows: 3` globally.

---

## 9. Tenant Document Theme System

### 9.1 Safe Customization Boundary

Companies customize their document identity through Bivro's structured settings form — not by editing HTML or CSS directly.

**V1 customizable fields:**

| Field | Where configured | Notes |
|-------|-----------------|-------|
| Company logo | Settings → Company → Branding | Uploaded; validated and stored in Supabase Storage |
| Document accent color | Settings → Company → Branding | Hex color picker with contrast validation |
| Company legal name | Settings → Company | Used in document header |
| Trading name / DBA | Settings → Company | Optional; shown as "Trading as" below legal name |
| Address, phone, email, website | Settings → Company | Contact block in header/footer |
| VAT / registration numbers | Settings → Company → Legal | Rendered in document header |
| Bank details | Settings → Banking | IBAN, BIC, bank name, payee name |
| Quote footer text | Settings → Documents → Quote | Optional legal or marketing note in footer |
| Invoice footer text | Settings → Documents → Invoice | Optional legal or payment instruction note |
| Payment terms | `company_settings.default_payment_terms_days` | Rendered as "Due within X days" |
| Service agreement text | `company_settings.service_agreement_text` | Used in Service Agreement document |
| Terms reference URL | Settings → Documents | Linked in quote acceptance section |
| Review platform URL | Settings → Company | Linked in thank-you communications |

**Not customizable in V1 (Bivro controls):**
- Document layout structure and section order
- Typography, type sizes, line height
- Table structure and column definitions
- Page size (follows jurisdiction profile)
- Core legal disclaimers (e.g., estimated vs. fixed note) — cannot be removed
- Footer page numbering

### 9.2 Logo Upload Validation

Logos are business-critical assets. Uploads are validated before storage:

```
Accepted formats:    PNG, JPG, SVG
Maximum file size:   2MB
Minimum dimensions: 100px × 100px
Maximum dimensions: 2000px × 2000px
SVG content safety:  SVG files are sanitized to remove <script>, event handlers,
                     external resource references (href, src, xlink:href), and
                     foreign objects before storage. Unsanitizable SVGs are rejected.
MIME type check:     Server-side MIME validation (not extension only)
```

**Risk:** A malicious SVG can contain JavaScript or external resource requests. The application must sanitize SVGs server-side before storing and before using in template rendering.

### 9.3 Accent Color Validation

Before a company accent color is used in documents:
- Minimum contrast ratio 4.5:1 against white background (WCAG AA) — ensures text on accent backgrounds is legible
- Colors that fail contrast validation are accepted for color picker saving but flagged with a visible warning: "This color may be difficult to read on printed documents"
- Very light colors (luminance > 0.9) trigger a warning; very dark colors are always accepted

### 9.4 V2+ Enterprise Document Themes

Enterprise customers may require fully custom document layouts (custom header design, non-standard section arrangement, bespoke branding). This is a V2+ feature.

**V2+ architecture preparation:**
- Document themes are stored as versioned template sets (HTML + CSS) in the database per company
- Template rendering engine is already designed to accept a template version per document type
- Enterprise theme customization: HTML/CSS editing is restricted to Bivro-managed template deployment (company operators do not get raw HTML access even in Enterprise)
- Custom theme deployment requires Bivro design review to prevent rendering regressions

---

## 10. Document Snapshot Architecture

### 10.1 The Immutability Guarantee

A generated business document must be a permanent, unalterable record. "Permanent" means: changing anything in Bivro — company logo, service names, pricing, bank account, template HTML, VAT rate, or address — must not alter any previously generated document.

This guarantee is achieved through two complementary mechanisms:

**Mechanism 1 — File immutability in storage**
The PDF file in Supabase Storage is the canonical document. Once written, it is never overwritten at the same storage path. New versions use new paths. The file is what was sent; the file is what remains.

**Mechanism 2 — Generation provenance metadata**
The `documents` table row captures what was used to generate the PDF, creating a queryable audit trail even without re-parsing the PDF.

### 10.2 Generation Snapshot Fields

The `documents` table must be extended with the following snapshot fields (additions to DATABASE_ARCHITECTURE.md §6.16):

```
-- Add to documents table:

-- Generation provenance
template_id             text            -- identifier of the HTML template used
template_version        text            -- version/hash of the HTML template at generation
renderer_version        text            -- version of the Puppeteer/generation system
generated_by            uuid            REFERENCES profiles(id) ON DELETE SET NULL
                                        -- null for system-triggered generation

-- Company identity snapshot (captures company settings at generation time)
company_snapshot        jsonb           -- {name, address, vat_number, logo_url, accent_color,
                                        --  bank_iban, bank_bic, bank_name, footer_text, ...}
-- Customer identity snapshot
customer_snapshot       jsonb           -- {name, email, phone, billing_address}

-- Financial snapshot (for invoices and quotes)
financial_snapshot      jsonb           -- {subtotal_cents, discount_cents, tax_cents,
                                        --  total_cents, currency_code, tax_rate_percent}

-- Language used for this document
document_language       text            DEFAULT 'en'

-- Jurisdiction profile used
jurisdiction_profile    text            -- e.g., 'CH', 'DE', 'GB'

-- Generation status
generation_status       text            NOT NULL DEFAULT 'pending'
-- 'pending' | 'generating' | 'generated' | 'failed' | 'superseded'

generation_error        text            -- populated on failure
generation_started_at   timestamptz
generation_completed_at timestamptz
generation_attempt      smallint        NOT NULL DEFAULT 1
```

### 10.3 What Is Never Stored in the Snapshot

The snapshot does not store:
- Internal cost prices or margin data (even for quote documents — the snapshot is a business record, not a financial analysis tool; cost data is in the `quote_items` table)
- Raw HTML template content (the template is versioned in the template store; the `template_version` reference is sufficient)
- Full inventory details (the `quote_items` or `job_items` records are the authoritative inventory; the snapshot captures financial summary only)

### 10.4 Immutability Enforcement Rules

**Rule 1 — No overwrite at existing path**
Generation always writes to a new storage path incorporating a version identifier or UUID. The same storage path is never written twice. Path uniqueness is enforced by including the `documents.id` UUID in the path where necessary.

**Rule 2 — No retroactive regeneration**
The application must never silently regenerate a historical document. Regeneration is only permitted for:
- A new quote version (creates new `quotes` row + new `documents` row)
- A corrected invoice (creates new `documents` row with `version + 1` and `supersedes_id` pointing to old row)
- A failed generation retry (same `documents.id`, same generation attempt context, `generation_attempt` incremented)

**Rule 3 — Superseded, not deleted**
When a new document version is generated, the prior version's `documents` row has `generation_status` updated to `superseded`. The file in Supabase Storage is NOT deleted. The old row's `storage_path` remains valid and accessible.

**Rule 4 — Sent document is locked**
Once a document has been sent to a customer (recorded in `email_logs` as an attachment), it is permanently locked. The system must reject any attempt to supersede or delete a sent document row. If a correction is needed, a new version must be created and sent explicitly.

---

## 11. Document Generation Lifecycle

### 11.1 Generation Technology (Frozen Decision)

**V1:** Puppeteer (headless Chrome) running in a Supabase Edge Function.
**V2+:** Railway persistent worker when PDF volume exceeds Edge Function capacity; optionally Browserless.io for managed Chrome infrastructure.

This decision is frozen in ARCHITECTURE.md §14. `@react-pdf/renderer` has been explicitly evaluated and rejected.

### 11.2 Template Architecture (Frozen Decision)

PDF templates are stored as HTML strings in the database. Template variables use `{{ variable }}` syntax. Templates are versioned. This decision is frozen in ARCHITECTURE.md §14.

**Template structure:**
```
[Full HTML document with embedded CSS]
  → Compiled at generation time: {{ variable }} tokens resolved
  → Passed to Puppeteer
  → Rendered to in-memory page
  → @media print CSS applied
  → Chrome print-to-PDF
  → PDF buffer returned
```

**Template isolation:** The template HTML is stored in a `document_templates` table (see §11.5). Companies do not edit template HTML directly. Template HTML is updated by Bivro developers via migrations or admin tooling. The rendering engine is not exposed to company-owned arbitrary HTML.

### 11.3 The Generation Lifecycle

```
Step 1 — VALIDATE SOURCE RECORD
  → Verify the entity (quote/invoice/job) exists and belongs to this company
  → Verify the entity has all required data for this document type
  → Verify company identity is complete (required fields per §2.2)
  → Verify bank details are present (for invoice/receipt documents)
  → Verify no duplicate pending generation for same entity + document_type + version
  → If any validation fails: abort with specific error; do not create documents row

Step 2 — RESOLVE DOCUMENT PROFILE
  → Load jurisdiction profile from company settings
  → Resolve document language (operator selection → customer preference → company default → English)
  → Resolve currency, date format, VAT label, page size
  → Load company identity fields (snapshot candidates)

Step 3 — RESOLVE TEMPLATE
  → Select template for document_type + language
  → Load current template version from document_templates table
  → Record template_id and template_version in snapshot

Step 4 — CREATE DOCUMENTS ROW (status: 'pending')
  → Insert into documents with generation_status = 'pending'
  → Assign idempotency key (UUID v7)
  → This row is the generation job record

Step 5 — CREATE SNAPSHOT
  → Capture company_snapshot from current companies + company_settings
  → Capture customer_snapshot from current customers row
  → Capture financial_snapshot from entity (quotes / invoices / payments)
  → Store snapshots in documents row

Step 6 — COMPILE TEMPLATE
  → Resolve all {{ variable }} tokens from entity data + snapshots
  → Validate: no unresolved {{ variable }} tokens remain in output HTML
  → If any variable unresolved: fail generation with specific token name in error

Step 7 — RENDER (update status: 'generating')
  → Trigger Supabase Edge Function with generation job ID
  → Edge Function loads compiled HTML
  → Puppeteer renders HTML to PDF
  → Chrome @media print applied
  → PDF buffer produced

Step 8 — VALIDATE OUTPUT
  → Verify PDF buffer is non-empty
  → Verify PDF magic bytes (PDF starts with "%PDF-")
  → Verify file size within acceptable range (> 10KB; < 10MB for normal documents)

Step 9 — STORE PDF
  → Generate storage path: {company_id}/{entity_path}/document-v{version}.pdf
  → Upload to Supabase Storage private bucket
  → Verify upload success (storage confirms write)

Step 10 — FINALIZE DOCUMENTS ROW (status: 'generated')
  → Update documents.storage_path
  → Update documents.file_size_bytes
  → Update documents.generation_status = 'generated'
  → Update documents.generated_at
  → Update documents.generation_completed_at

Step 11 — EMIT DOMAIN EVENT
  → Write 'document.generated' event to domain_events
  → Event payload: { documentId, entityType, entityId, documentType, version, tenantId }
  → Downstream: email attachment availability; portal availability; notification
```

### 11.4 Idempotency

Every generation job is idempotent:
- The `documents` row is created first with status `pending` and a unique `idempotency_key`
- If the Edge Function is triggered twice for the same `idempotency_key`, the second invocation detects the existing `pending` or `generated` row and either awaits or returns the existing result
- Retries after failure increment `documents.generation_attempt` and re-run from Step 7 (the snapshot is preserved from Step 5)
- Maximum 3 attempts; after 3 failures, `generation_status = 'failed'` and an alert is surfaced to the operator

### 11.5 `document_templates` Table (New — Pending DATABASE_ARCHITECTURE.md Addition)

The HTML template store for PDF rendering. This table is managed by Bivro developers, not by company operators.

```
document_templates
─────────────────────────────────────────────────────────────────
id                      uuid            PRIMARY KEY DEFAULT gen_uuid_v7()
─────────────────────────────────────────────────────────────────
-- Identity
document_type           document_type   NOT NULL
language                text            NOT NULL DEFAULT 'en'
jurisdiction_profile    text            -- null = applies to all; 'CH' = CH-specific variant
name                    text            NOT NULL  -- human-readable
version                 text            NOT NULL  -- e.g., '1.0.0', '1.1.0'
is_current              boolean         NOT NULL DEFAULT false
-- UNIQUE (document_type, language, jurisdiction_profile) WHERE is_current = true

-- Template content
template_html           text            NOT NULL  -- Full HTML document with {{ variable }} tokens
variables_required      text[]          NOT NULL DEFAULT '{}'  -- variables that MUST resolve
variables_optional      text[]          NOT NULL DEFAULT '{}'  -- variables that may be absent

-- Change tracking
released_at             timestamptz
released_by             text            -- developer identifier

-- Append-only
created_at              timestamptz     NOT NULL DEFAULT now()
─────────────────────────────────────────────────────────────────
RLS: No tenant RLS — this is a system table. Read access for generation service; no write access for company operators.
```

### 11.6 Generation Failure Handling

| Failure type | Behavior |
|-------------|---------|
| Validation failure (missing data) | `generation_status = 'failed'`; specific field error surfaced to operator |
| Template compilation failure (unresolved variable) | `generation_status = 'failed'`; specific token identified in error |
| Puppeteer render failure | Retry up to 3 times; alert Sentry; surface to operator after 3 failures |
| Storage write failure | Retry up to 3 times; document row cleaned up if no storage write succeeds |
| Edge Function timeout | Sentry alert; `generation_status = 'failed'`; operator notified |

**No silent failure:** A document generation failure is always surfaced as an in-app alert to the operator. A failed generation never produces an empty-looking document row.

---

## 12. Document Storage Architecture

### 12.1 Provider (Frozen Decision)

**V1:** Supabase Storage (backed by S3). Tenant-isolated via RLS on storage objects. No public buckets. All access via signed URLs.

**V2+:** Cloudflare R2 when egress costs exceed $200–500/month. File path structure is identical; only the client changes. Defined in ARCHITECTURE.md §13.

### 12.2 Storage Bucket Structure

**Single bucket:** `documents` — all generated PDFs and business files. No public access. All file access via signed URLs generated by the application after authorization checks.

**Canonical storage path convention** (DATABASE_ARCHITECTURE.md §14 is the single authoritative definition):

```
{company_id}/{entity_folder}/{entity_id}/{document_type}-v{version}-{document_id}.pdf

Entity folder mapping:
  entity_type 'quote'    → quotes/
  entity_type 'invoice'  → invoices/
  entity_type 'job'      → jobs/
  entity_type 'employee' → employees/
  entity_type 'company'  → company/

Generated document examples:
  {cid}/quotes/{quote_id}/quote_pdf-v1-{doc_id}.pdf
  {cid}/quotes/{quote_id}/contract-v1-{doc_id}.pdf
  {cid}/quotes/{quote_id}/signed_contract-v1-{doc_id}.pdf
  {cid}/invoices/{invoice_id}/invoice_pdf-v1-{doc_id}.pdf
  {cid}/invoices/{invoice_id}/invoice_pdf-v2-{doc_id}.pdf    ← corrected version
  {cid}/invoices/{invoice_id}/payment_receipt-v1-{doc_id}.pdf
  {cid}/invoices/{invoice_id}/credit_note-v1-{doc_id}.pdf
  {cid}/jobs/{job_id}/work_order-v1-{doc_id}.pdf
  {cid}/jobs/{job_id}/damage_report-v1-{doc_id}.pdf
  {cid}/jobs/{job_id}/photos/{doc_id}.jpg
  {cid}/employees/{employee_id}/license-{doc_id}.pdf

Company identity assets (not business documents; may be replaced on update):
  {company_id}/company/logo.png
  {company_id}/company/email-header.png
```

**Path uniqueness guarantee:** Every generated document path includes the `documents.id` UUID (UUID v7), making it globally unique. No two generation runs ever produce the same path. This structurally prevents any overwrite of a prior document version.

### 12.3 Signed URL Policy

All document access uses Supabase signed URLs. URLs are generated by the application after verifying the requester's authorization.

| Context | Signed URL expiry | Notes |
|---------|-----------------|-------|
| Internal web app (desktop/laptop) | 1 hour | Standard session; ARCHITECTURE.md §13 |
| Internal web app (mobile) | 1 hour | Same policy |
| Customer portal | 15 minutes | ARCHITECTURE.md §13; shorter for lower-trust context |
| Email attachment | Not applicable | PDF is attached directly as binary; no URL access |
| Download action | 1 hour | Fresh URL generated at download click time |
| Support access (platform) | 15 minutes | Logged; PLATFORM_ADMIN.md §5 |

**Rule:** Signed URLs are never stored in the database. They are generated ephemerally by the application when access is needed. The `documents.storage_path` stores only the path, not a signed URL.

**Rule:** Security is never delegated solely to URL unguessability. Every signed URL generation request is preceded by an authorization check against the requester's tenant identity and effective permissions.

### 12.4 Archived Tenant Behavior

When a company account is archived or closed:
- Documents remain in storage for the retention period (see §20)
- New signed URL generation is blocked (the application rejects access)
- Platform Owner may access archived documents with break-glass procedure (PLATFORM_ADMIN.md §5)
- Storage files are not immediately deleted; a separate retention-enforcement job handles scheduled deletion after the retention period

---

## 13. Document Security

### 13.1 Cross-Tenant Document Isolation

**Database layer:** RLS on the `documents` table enforces `public.auth_company_id() = company_id` (where `public.auth_company_id()` reads `(auth.jwt() -> 'app_metadata' ->> 'company_id')::uuid`). A query for `documents` never returns rows from another company regardless of whether the correct entity IDs are guessed.

**Storage layer:** Supabase Storage RLS policies enforce that a company's signed URL generation only succeeds for objects under `{company_id}/` prefix. A company cannot generate a signed URL for another company's path.

**Application layer:** Before generating a signed URL, the application verifies:
1. The requesting user belongs to the company that owns the document
2. The user has the required permission to access this document type
3. The `documents.company_id` matches the request context

### 13.2 Predictable URL Prevention

Storage paths include entity UUIDs (UUID v7 — 128-bit entropy). They are not guessable. Additionally, signed URLs are short-lived. No document is accessible without both a valid signed URL and a successful RLS check.

**Never rely on URL obscurity alone.** RLS + application authorization + short-lived URLs is the defense-in-depth model.

### 13.3 Permission Bypass Prevention

Document download in the application is gated by the same permission checks as document view. A user who can view a quote PDF via the UI cannot bypass this by constructing a direct storage request — the storage RLS blocks unsigned access, and signed URL generation requires application-layer auth.

### 13.4 Financial Data Leakage Prevention

- Invoice and quote PDFs include only sell-price financial data (the customer's number). Cost price and margin data is never included in any customer-facing document, even when accessible to the generating user.
- The document template system does not expose cost/margin variables. They do not exist in the template variable catalogue.
- AI-assisted notes in documents (assumptions, exclusions) are reviewed by the operator before the document is generated. AI never autonomously appends financial data.

### 13.5 Document Replacement Prevention

- Generated documents in Supabase Storage are write-once per path (path uniqueness guaranteed by design — see §12.2)
- The application never issues a storage PUT to an existing document path
- If a path collision is detected (defensive check at Step 9 of generation), generation aborts with an error

### 13.6 Upload Validation for Logos and Assets

All logo and asset uploads pass through the application server, not directly to Supabase Storage:

```
Validation steps:
1. MIME type check (server-side; not extension-only)
   Accepted: image/png, image/jpeg, image/svg+xml
   Rejected: everything else, including image/gif, application/pdf
2. File size: maximum 2MB
3. Dimension check (for PNG/JPG): minimum 100×100px; maximum 2000×2000px
4. SVG sanitization (for image/svg+xml):
   - Parse SVG as XML
   - Remove: <script>, event handlers (on*), <foreignObject>
   - Remove: external references (href to non-data: URLs, xlink:href)
   - Remove: <use> elements referencing external resources
   - If sanitization fails: reject with specific error
5. Virus/malware scan: Not in V1 (file types restricted to images; low risk accepted)
                       V2+: ClamAV or equivalent for uploaded documents
```

---

## 14. Permissions

### 14.1 Extending the Permission Architecture

The canonical permission catalogue is in PRODUCT_REQUIREMENTS.md §3.3. The following document-related permissions extend the existing catalogue.

**Already in the catalogue (no change):**
- `quotes.view` — implicitly covers viewing quote PDF in the context of a quote
- `quotes.send` — covers generating and sending quote PDFs
- `invoices.view` — covers viewing invoice PDFs
- `invoices.create` — covers generating invoice PDFs
- `settings.company` — covers logo, branding, contact info
- `settings.templates` — covers email templates (and by extension document templates in V1)

**New permissions to add to Settings resource group:**

| Permission | Description |
|-----------|-------------|
| `settings.legal_text` | Edit service agreement text, terms reference, and document legal footer content |
| `settings.banking` | Edit bank details shown on invoices and payment receipts (IBAN, BIC, bank name) |

These are distinct from `settings.company` because:
- `settings.legal_text`: Editing legal text has legal implications. This permission should require deliberate grant — not bundled with general company settings.
- `settings.banking`: Bank detail changes are a fraud vector (social engineering attacks change bank accounts to redirect customer payments). This requires explicit Owner-level control or a specifically trusted Office user.

### 14.2 Document Access by Permission

| Action | Required permission | Notes |
|--------|-------------------|-------|
| View quote PDF | `quotes.view` | |
| Download quote PDF | `quotes.view` | Same as view — download is not separately gated in V1 |
| Send quote PDF | `quotes.send` | |
| View invoice PDF | `invoices.view` | |
| Download invoice PDF | `invoices.view` | |
| Send invoice PDF | `invoices.create` | |
| View payment receipt | `payments.view` | |
| View work order | `jobs.view` | Internal document |
| View damage report | `jobs.view` | |
| Edit company branding (logo, color) | `settings.company` | |
| Edit legal text (agreement, footer) | `settings.legal_text` | New permission |
| Edit banking details | `settings.banking` | New permission — sensitive |
| Manage document templates | `settings.templates` | Existing permission — covers template content |

### 14.3 Financial Information Leakage Prevention in Documents

The permission system for documents ensures:
- Users without `quotes.view_cost_price` never see cost price or margin in any document, preview, PDF download, or AI-assisted content
- Invoice amounts are visible to users with `invoices.view` — these are sell-price figures only
- Financial summary data in document preview respects the same permissions as the underlying entity

### 14.4 Owner Document Access

The Owner has unrestricted access to all document types, download, generation, sending, and configuration. No permission check ever restricts the Owner in document contexts.

---

## 15. AI Document Assistance

### 15.1 What AI May Assist With

AI assistance in document contexts is limited to prose and structural suggestions. Structured Bivro data is the authority for all business facts.

**AI may:**
- Draft `customer_notes` (quote notes visible to customer): "Our team will arrive in the morning between 8:00–10:00. We recommend having your elevator reserved."
- Suggest assumptions and exclusions for quote PDFs: "Based on the job details, consider noting that piano moving requires specialist equipment not included in standard labor."
- Improve clarity and professionalism of operator-written notes before they enter the document
- Identify missing information: "The destination floor is not specified — the document cannot accurately describe stair/elevator requirements without it."
- Summarize the quote for the cover email (EMAIL_SYSTEM.md §4) — this is separate from the PDF but related to the document context
- Check document consistency: "The quote includes 'Packing Service' but no packing materials line item — is this intentional?"
- Suggest language appropriate to the customer's preferred language (translation assistance — see §16)
- Surface risk warnings: "This quote does not include a stair surcharge despite the destination floor being listed as floor 4 with no elevator."

**AI must not:**
- Generate, suggest, or modify prices, totals, VAT amounts, or any financial number
- Generate bank details, IBAN, or payment information
- Insert or modify company registration or VAT numbers
- Invent service exclusions or inclusions not based on the actual job record
- Suggest discounts, promotions, or price reductions
- Make insurance, warranty, or legal commitments
- Generate a service agreement or legal text (AI may assist with cover letter prose; legal text is operator-owned)
- Modify any content of a generated (finalized) document — AI operates pre-generation only

### 15.2 AI Influence Logging for Documents

When AI assistance is used in the document preparation flow:
- `ai_logs` entry created with `task_type = 'document_assist'`
- The `documents` row records whether AI assistance was used: `ai_assisted boolean`
- The specific AI-generated content is reviewable and editable by the operator before document generation
- Once the document is generated, the content is frozen — AI cannot modify it

**Pre-generation review gate:** Any document that includes AI-assisted text in operator-reviewable fields must be reviewed and confirmed by the operator before generation is triggered. There is no path for AI to autonomously finalize and generate a document.

### 15.3 AI Document Consistency Check

Before document generation is triggered, the AI may perform an optional consistency pass:

- "The hourly rate on the invoice ($95/h) differs from the quote ($95/h) — consistent. No action needed."
- "Line item 3 on the invoice (4.5 hours) differs from the quote estimate (4 hours). This is expected for hourly billing — flagging for your awareness."
- "The customer's billing address on the invoice is empty — this field is required for invoice generation."

The consistency check is surfaced to the operator as a pre-generation review card. It is not a blocker (except for missing required fields, which are hard blockers regardless of AI involvement).

---

## 16. Multilingual Documents

### 16.1 V1 Document Languages

Documents are generated in one of four supported languages:

| Language | Code | Primary use |
|----------|------|------------|
| German | `de` | CH-DE, DE, AT |
| English | `en` | Default fallback; UK, US, AU |
| French | `fr` | CH-FR, FR |
| Italian | `it` | CH-IT, IT |

### 16.2 Language Determination for Documents

Document language is resolved at generation time using this priority hierarchy:

1. **Operator explicitly selects** a language in the document generation/send flow
2. **Customer preferred language** from `communication_preferences.preferred_language`
3. **Company default language** from `company_settings.default_language`
4. **English** — final fallback

**Swiss multi-language rule:** Swiss companies may operate in German, French, or Italian depending on their canton. A Swiss company should set `company_settings.default_language` to their primary operating language. If a customer's preferred language differs, the document is generated in the customer's language.

### 16.3 What Is Translated by Bivro

| Element | Translated by Bivro | Notes |
|---------|-------------------|-------|
| Document title ("Invoice" / "Rechnung") | ✅ Yes | Per jurisdiction profile + language |
| Column headers ("Description", "Amount") | ✅ Yes | System labels |
| Section labels ("Bill To", "Payment Information") | ✅ Yes | System labels |
| Footer system text ("Page 1 of 3") | ✅ Yes | |
| VAT label ("VAT", "MWST", "TVA", "IVA") | ✅ Yes | Per jurisdiction profile |
| Date format | ✅ Yes | Per jurisdiction profile |
| Currency formatting | ✅ Yes | Per jurisdiction profile |
| Company name, address, contact | ❌ No — company data | Used as-is from company settings |
| Customer name, address | ❌ No — customer data | Used as-is from customer record |
| Service names | ❌ No — company data | Companies translate their own service catalog |
| Customer-visible notes | ❌ No — operator-written | AI may assist translation (see §16.4) |
| Service agreement text | ❌ No — legal text | Never machine-translated silently |
| Invoice footer text | ❌ No — company-owned | |

### 16.4 Legal Text Translation Rules

**Legal text must never be silently machine-translated.**

The service agreement text (`company_settings.service_agreement_text`) is a legal document. If a company generates a document in German for a German-speaking customer but their service agreement text is only available in English, the behavior is:

1. **Generation proceeds** with the English legal text — the system does not block generation
2. **A prominent warning is shown** to the operator before generation: "Your service agreement text is only available in English. The document will be generated in German with an English service agreement. Consider providing a German-language agreement text in Settings → Documents → Legal Text."
3. **No automatic translation is performed.** A machine-translated service agreement is a legal risk.

If the company wants German legal text, they must provide it in Settings → Documents → Legal Text (requires `settings.legal_text` permission).

### 16.5 Service Name Localization

Service names in documents come from `service_catalog.name` (the company's catalog entry). Companies that serve multilingual customers may want service names in different languages.

**V1 approach:** Service catalog entries have a single name. Companies operating multilingually should use the language of their primary market for service names. Operator notes (`customer_notes`) may be written in the customer's language.

**V2+ approach:** Service catalog entries gain `name_translations` (JSONB with language keys). Document generation resolves the service name in the document language.

---

## 17. Document Preview UX

### 17.1 Purpose of Document Preview

Operators preview documents before sending to customers. The preview shows an accurate representation of the final PDF — what the customer will receive. Preview must not differ from the generated PDF.

**Implementation note:** The preview is the actual PDF rendered in an embedded PDF viewer (`<iframe>` or PDF.js). Bivro does not maintain a separate HTML preview mode — the Puppeteer-generated PDF is the preview. This prevents any divergence between "what you see" and "what is sent."

### 17.2 Desktop / Laptop Preview (Primary)

```
Quote Detail page → Preview panel (right column or full-screen modal)

Controls:
[Download PDF]  [Send]  [Generate New Version]  [Version History ▾]

PDF viewer:
  - Full page rendering in iframe
  - Zoom: + / - / Fit-to-width / Fit-to-page
  - Page navigation: < Page 1 of 3 >
  - Scroll to navigate multi-page documents

Version selector:
  - Version badge showing current version
  - [▾] dropdown: "Version 3 (current)", "Version 2 — Superseded", "Version 1 — Superseded"
  - Each past version is downloadable

Snapshot metadata (collapsible panel below preview):
  - Generated: [timestamp]
  - Template version: [identifier]
  - Language: [English / Deutsch / Français / Italiano]
  - Status: Generated / Sent / Accepted / Superseded
```

### 17.3 Tablet Preview

- PDF viewer in full-width panel below document details
- Pinch-to-zoom supported
- Page swipe navigation
- Approve and Send accessible from a bottom action bar
- Version history accessible from a bottom sheet

### 17.4 Mobile Preview

Mobile is optimized for review, not for complex document management.

```
Mobile document view:
  - PDF thumbnail preview (first page, fit-to-screen)
  - [View Full Document] — opens PDF viewer in full-screen
  - Status badge (Draft / Sent / Accepted)
  - [Send] [Download] buttons (if permissions allow)
  - Version badge: "Version 2"
  - [More Versions] — opens bottom sheet with version list

Full-screen PDF viewer on mobile:
  - Scroll-to-read (continuous scroll mode)
  - Pinch-to-zoom
  - [× Close] to return
```

Complex actions (generate new version, configure branding, manage templates) are not optimized for mobile. The UX directs mobile users to desktop for these operations.

### 17.5 Document Preview and Permission Awareness

- Users without `quotes.view_cost_price` do not see cost/margin data in any document preview (this data is not in the PDF — it is structurally excluded)
- Users without `invoices.view` cannot open invoice PDF previews
- A missing-permission gate shows the document name and status but replaces the preview with "You don't have permission to view this document"

---

## 18. Email System Integration

### 18.1 Documents as Email Attachments

When an operator sends a quote, invoice, or receipt email, the attachment is the exact generated PDF from the `documents` table — not a freshly generated version. The specific `documents.id` being attached is recorded in `email_logs.attached_document_id` (EMAIL_SYSTEM.md §18.8).

**Immutability rule:** `email_logs.attached_document_id` is set at send time and never updated. It permanently records which exact immutable document snapshot was delivered to the customer. If a new document version is created after the email is sent, the sent email's attachment reference is unaffected.

**Resolution rule:** The attachment is resolved at compose/send time, not at template selection time. The most recent `generated` and non-voided version of the document is offered as the default attachment. The operator may select a different version explicitly.

**Pre-send validation rule:** Before any email with a document attachment is sent or auto-sent, the system verifies that the referenced `documents` row has `generation_status = 'generated'` and `voided_at IS NULL`. If the document has been voided or superseded, the send is blocked.

### 18.2 EMAIL_SYSTEM.md Stage ↔ Document Type Mapping

| Email lifecycle stage | Document attached | Document type | `attached_document_id` recorded |
|----------------------|------------------|--------------|-------------------------------|
| Stage 7 — Quote Sent | Quote PDF (current version) | `quote_pdf` | ✅ Yes |
| Stage 11 — Quote Accepted | Service Agreement PDF | `contract` | ✅ Yes |
| Stage 13 — Booking Confirmation | Service Agreement PDF | `contract` | ✅ Yes |
| Stage 20 — Invoice Sent | Invoice PDF | `invoice_pdf` | ✅ Yes |
| Stage 21 — Payment Confirmation | Payment Receipt PDF | `payment_receipt` | ✅ Yes |

All other email lifecycle stages (stages 1–6, 8–10, 12, 14–19, 22–27) do not attach business documents. `email_logs.attached_document_id` is null for those sends.

### 18.3 Cancellation Behavior for Scheduled Emails with Document Attachments

If an email is scheduled with a document attachment and, before the send time, the document's `generation_status` changes to `superseded` or `voided_at` is populated:
- The scheduled email is blocked from auto-sending
- It is escalated to Approval mode with the notice: "The document attached to this scheduled email has been superseded or voided — review before sending"
- The operator can: confirm the original version / update the attachment to the new version / cancel the scheduled send
- Regardless of operator choice, `email_logs.attached_document_id` records the actual document sent

---

## 19. Customer Portal Integration

### 19.1 V1 Customer Portal Architecture

The customer portal is accessed via a signed token URL embedded in quote/booking emails. No customer login is required in V1 (confirmed in DATABASE_ARCHITECTURE.md §239 and ARCHITECTURE.md §7).

**Token architecture (quotes.portal_token):**
- HMAC-signed token stored in `quotes.portal_token`; only the hash is stored in the DB
- Token expiry: `quotes.portal_token_expires_at`
- Tokens expire after 72 hours (configurable per company) and are regenerated on each email send

### 19.2 Documents Available in Customer Portal (V1)

| Document | Portal access | Notes |
|---------|--------------|-------|
| Quote PDF | ✅ Yes | The specific version sent to the customer |
| Service Agreement | ✅ Yes | On acceptance; accessible to sign |
| Signed Agreement | ✅ Yes | After signing; customer copy |
| Invoice PDF | ✅ Yes | With invoice-specific portal token |
| Payment Receipt | ✅ Yes | After payment recorded |

**Documents never accessible in customer portal:**
- Work Order / Internal Job Sheet (internal only)
- Damage Report (operator decision required before sharing)
- Prior superseded quote versions (customer sees only the version most recently sent to them)
- Internal notes (`quotes.internal_notes`)
- Cost/margin data

### 19.3 Portal Document Security

- `documents.is_customer_visible` flag controls portal visibility
- Only documents explicitly marked `is_customer_visible = true` are accessible via portal token
- Portal token is scoped to a specific entity (quote or invoice) — it does not grant access to all of that company's documents
- A leaked portal token grants access only to the documents for that one entity

---

## 20. Audit Requirements

Every document-related action creates an audit record. Sent documents are permanent commercial records.

| Action | Audit table | Detail |
|--------|------------|--------|
| Document generated | `documents` row + `activity_logs` | Snapshot captured; generation provenance recorded |
| Document generation failed | `documents` row (status: `failed`) + Sentry alert | Error captured |
| Document downloaded (operator) | `activity_logs` | User, document ID, timestamp |
| Document downloaded (customer portal) | `activity_logs` | Portal token reference, document ID, timestamp |
| Document sent (email attachment) | `email_logs` | document_id linked |
| Document superseded | `documents.generation_status` updated | `supersedes_id` chain preserved |
| Document voided (invoice) | `activity_logs` | Who voided, reason, timestamp |
| Branding changed (logo, color) | `activity_logs` | Before/after reference |
| Legal text changed | `activity_logs` | Before/after content snapshot |
| Banking details changed | `activity_logs` | Who changed, timestamp (no IBAN logged in plaintext in activity_logs — masked) |
| Template updated | `document_templates` versioned row | New version record; old version preserved |
| AI assistance used in document | `ai_logs` (task_type = 'document_assist') | Prompt context, output, model |

### 20.1 Immutable Evidence

`documents`, `email_logs`, `activity_logs`, `ai_logs` are append-only tables. No UPDATE permissions for company operators. Corrections are new records. This is consistent with DATABASE_ARCHITECTURE.md §3 (log tables are insert-only).

### 20.2 Banking Details Audit

Changes to banking details (`settings.banking`) receive heightened audit treatment:
- `activity_logs` entry includes: changed_by, changed_at, previous_iban_last_4, new_iban_last_4 (not full IBAN)
- The Owner receives an in-app notification when banking details are changed by any user (including another Owner)
- If a platform support session is active when banking details are changed, the platform audit log captures the session reference

### 20.3 GDPR and Data Retention

**Document retention:** Financial documents (invoices, payment receipts, service agreements) are retained permanently or per local statutory minimum. GDPR erasure does not extend to financial records required by law.

**GDPR erasure scope for documents:**
- Customer personal data in `documents.customer_snapshot` (JSONB): name and address fields replaced with `[erased]`
- The PDF file itself in Supabase Storage is NOT deleted (financial records)
- `documents.storage_path` remains valid — the PDF on disk predates the erasure request and constitutes a business record

Bivro does not make legal compliance guarantees. The above architectural provisions support common GDPR interpretations for B2B invoicing records. Companies are responsible for understanding their own jurisdiction's requirements.

---

## 21. V1 vs V1.5 vs V2+ Scope

### 21.1 V1 — What Is Built

| Capability | V1 status |
|-----------|----------|
| Quote PDF generation (Puppeteer) | ✅ |
| Invoice PDF generation | ✅ |
| Payment Receipt PDF | ✅ |
| Service Agreement (unsigned) | ✅ |
| Signed Service Agreement | ✅ |
| Work Order (Internal) | ✅ |
| Damage Report | ✅ |
| 4 jurisdiction profiles (CH, DE, AT, FR, IT, GB, US, CA, AU, AE — all document design) | ✅ |
| CH-specific invoice formatting (CHF, MWST, IBAN) | ✅ |
| 4-language support (en, de, fr, it) | ✅ |
| Tenant document identity (logo, color, legal text, banking) | ✅ |
| Document snapshot architecture (company, customer, financial) | ✅ |
| Supabase Storage (private bucket, signed URLs) | ✅ |
| Document versioning (quote versions, invoice corrections) | ✅ |
| Customer portal document access | ✅ |
| AI document assistance (notes, consistency check) | ✅ |
| Email integration (PDF as attachment) | ✅ |
| Audit trail for all document actions | ✅ |
| SVG logo sanitization | ✅ |
| `document_templates` table | ✅ |

### 21.2 V1.5 — Added Before V2

| Capability | Notes |
|-----------|-------|
| Bill of Lading | Required for long-distance/international moves |
| Delivery Receipt / Completion Confirmation | Signed completion record |
| Credit Note | Issued when a partial or full credit is applied |
| Booking Confirmation (distinct from service agreement) | Lighter confirmation for simple local moves |
| Cancellation Confirmation | Written record of job cancellation |
| Swiss QR-Bill | ISO 20022 payment slip in CH invoices |
| Damage Report photos embedded | Photos captured in job linked into damage report PDF |
| Service name localization | `service_catalog.name_translations` JSONB |

### 21.3 V2+ — Future Architecture

| Capability | Notes |
|-----------|-------|
| Survey Summary document | Post-survey professional report |
| Inventory Summary document | Detailed customer-facing inventory PDF |
| Enterprise custom document themes | Custom HTML/CSS templates with Bivro design review |
| Browserless.io / Railway PDF worker | When Supabase Edge Function capacity is insufficient |
| Cloudflare R2 storage | When egress costs exceed $200–500/month |
| Virus/malware scanning on uploads | ClamAV or equivalent |
| QR code on quotes | Quote acceptance QR code for mobile scanning |
| Digital signature integration | DocuSign or equivalent for remote signing |
| Multi-language service catalog | service_catalog.name_translations |
| Insurance certificate document | Complex compliance document |

---

## 22. Cross-Document Consistency

### 22.1 Verified Against Existing Documents

| Claim in this document | Verified against | Status |
|-----------------------|-----------------|--------|
| Puppeteer via Supabase Edge Function for V1 PDF generation | ARCHITECTURE.md §14 | ✅ Consistent |
| V2+ upgrade: Railway persistent worker + Browserless.io | ARCHITECTURE.md §14 | ✅ Consistent |
| @react-pdf/renderer rejected | ARCHITECTURE.md §14 | ✅ Consistent — not referenced |
| Templates stored as HTML in DB with `{{ variable }}` syntax | ARCHITECTURE.md §14 | ✅ Consistent |
| Supabase Storage private bucket; signed URLs | ARCHITECTURE.md §13 | ✅ Consistent |
| Signed URL expiry: 1 hour (web), 15 minutes (portal) | ARCHITECTURE.md §13 | ✅ Consistent |
| V2+: Cloudflare R2 when egress > $200–500/month | ARCHITECTURE.md §13 §25 | ✅ Consistent |
| File path structure: `{company_id}/...` | ARCHITECTURE.md §13, DATABASE_ARCHITECTURE.md §14 | ✅ Consistent |
| `documents` table schema | DATABASE_ARCHITECTURE.md §6.16 §14 | ✅ Consistent — this document extends, not replaces |
| PDF versioning model: new `documents` row per version, `supersedes_id` chain | DATABASE_ARCHITECTURE.md §15 | ✅ Consistent |
| Version policy table per document type | DATABASE_ARCHITECTURE.md §15 | ✅ Consistent |
| `quote_status` ENUM values | DATABASE_ARCHITECTURE.md (§6.6) | ✅ Consistent |
| `quotes.version` and `quotes.parent_quote_id` | DATABASE_ARCHITECTURE.md §6.6 | ✅ Consistent |
| `quotes.portal_token` and portal architecture | DATABASE_ARCHITECTURE.md §6.6, ARCHITECTURE.md §7 | ✅ Consistent |
| No customer login (portal token) | DATABASE_ARCHITECTURE.md §239, ARCHITECTURE.md §7 | ✅ Consistent |
| Owner unrestricted access | PRODUCT_REQUIREMENTS.md §2.0, product_freeze.md | ✅ Consistent |
| Two roles only (owner, office) in V1 | PRODUCT_REQUIREMENTS.md §2.0 | ✅ Consistent |
| AI facts from structured data only | AI_ENGINE.md §1.1, product_freeze.md | ✅ Consistent |
| Estimated vs. fixed pricing distinction | PRODUCT_REQUIREMENTS.md §2.2 | ✅ Consistent |
| email_logs linkage for document sends | DATABASE_ARCHITECTURE.md §16, EMAIL_SYSTEM.md | ✅ Consistent |
| Communication preferences for language | EMAIL_SYSTEM.md §7 | ✅ Consistent |
| Platform support access logging | PLATFORM_ADMIN.md §5 | ✅ Consistent |
| SVG upload validation | ARCHITECTURE.md §20 security | ✅ Consistent |
| Append-only log tables | DATABASE_ARCHITECTURE.md §3 | ✅ Consistent |
| `gen_uuid_v7()` for all PKs | DATABASE_ARCHITECTURE.md P8 | ✅ Consistent — new tables use this |
| `deleted_at` soft delete on business entities | DATABASE_ARCHITECTURE.md §4 | ✅ Consistent |

### 22.2 Resolved Inconsistencies

All inconsistencies identified in the original PDF_ENGINE.md have been resolved by the PDF/database synchronization pass:

| Former inconsistency | Resolution | Where resolved |
|---------------------|------------|---------------|
| `document_type` ENUM incomplete (`payment_receipt`, `work_order` missing) | ENUM extended with all V1/V1.5/V2+ values and comments | DATABASE_ARCHITECTURE.md — ENUM definition |
| `settings.legal_text` and `settings.banking` missing from PRD | Both permissions added to Settings group | PRODUCT_REQUIREMENTS.md §3.3 |
| `documents` table missing snapshot + generation lifecycle fields | `documents` table fully rewritten with all required columns | DATABASE_ARCHITECTURE.md §14 |
| `document_templates` table not defined | `document_templates` table added to DATABASE_ARCHITECTURE.md §14 | DATABASE_ARCHITECTURE.md §14 |
| Storage path convention inconsistency | Canonical versioned format `{document_type}-v{version}-{document_id}.pdf` defined in DATABASE_ARCHITECTURE.md §14 as single authority | DATABASE_ARCHITECTURE.md §14, PDF_ENGINE.md §12.2 |
| `document_generation_status` ENUM not defined | ENUM added | DATABASE_ARCHITECTURE.md — ENUM definitions |
| Email attachment integrity not tracked | `email_logs.attached_document_id` added; pre-send validation rule defined | EMAIL_SYSTEM.md §18.8–18.9 |
| Quote versioning vs document versioning conflation | Two distinct concepts explicitly documented with practical consequences | DATABASE_ARCHITECTURE.md §15 |

---

## 23. Final Report

### Document Principles Established (5)

1. **Company First** — documents present the company's identity; Bivro is invisible
2. **Immutability Is Non-Negotiable** — generated files in storage are permanent; no retroactive changes
3. **Structured Data, Not AI Fabrication** — all business facts from Bivro records; AI handles prose only
4. **Graceful Completeness** — missing required data blocks generation with specific errors; no gaps reach customers
5. **Print-Ready, Screen-Legible** — grayscale-safe; operational not decorative

### Document Types Defined

**V1 (7):** Quote PDF, Service Agreement, Signed Service Agreement, Invoice, Payment Receipt, Damage Report, Work Order

**V1.5 (5):** Bill of Lading, Delivery Receipt, Credit Note, Booking Confirmation, Cancellation Confirmation

**V2+ (4):** Survey Summary, Inventory Summary, Insurance Certificate, Swiss QR-Bill (V1.5)

### Quote PDF Architecture

Canonical 3-section structure: header (company + document identity + customer), line items (pricing mode-aware, estimated vs. fixed clearly distinguished), notes/assumptions/exclusions/acceptance. Multi-page handling with section header repetition. Footer with quote number, version, and page count on every page.

### Quote Versioning Rules

Each revision creates a new `quotes` row (same `quote_number`, incremented `version`, `parent_quote_id` linking to root). Each version has its own `documents` row and immutable PDF file. Accepted version is a permanent commercial record. Superseded versions are retained, never deleted.

### Snapshot Rules

Three-layer snapshot: (1) PDF file in Supabase Storage — immutable, write-once per path; (2) `documents` row with `company_snapshot`, `customer_snapshot`, `financial_snapshot` JSON captured at generation time; (3) `template_version` recorded so the rendering context is always reproducible. No retroactive regeneration of sent documents.

### Storage and Security Rules

Supabase Storage private bucket. Tenant-isolated via RLS on both database and storage layers. Signed URLs: 1 hour (web), 15 minutes (portal). URLs generated ephemerally — never stored. Security is not delegated to URL obscurity alone. Write-once path convention prevents overwrite. SVG logos sanitized server-side.

### AI Document Assistance Rules

AI may assist with: customer-visible notes, assumptions, exclusions, clarity improvements, consistency checks, missing data detection, risk warnings. AI must not: generate prices, totals, VAT, bank details, company registration data, or legal commitments. Pre-generation review gate required for all AI-assisted content. AI never autonomously finalizes or generates a document.

### Multilingual Architecture

4 supported languages: de, en, fr, it. Language resolved per: explicit selection → customer preference → company default → English. System labels translated by Bivro per jurisdiction profile. Company-owned content (service names, legal text, notes) used as-is. Legal text never silently machine-translated — operator warning issued if translation is missing.

### V1 Scope

Full quote and invoice PDF pipeline, 7 document types, 10 jurisdiction profiles, 4 languages, tenant branding system, snapshot architecture, Supabase Storage, customer portal access, AI assistance, email integration.

---

### Files Changed

| File | Action |
|------|--------|
| `docs/PDF_ENGINE.md` | Created; §12.2, §18.1–18.3, §22.2, §23 updated during synchronization pass |
| `DATABASE_ARCHITECTURE.md` | ENUM: added `document_generation_status`, extended `document_type`; §14 `documents` table fully rewritten with snapshot and lifecycle fields; §14 storage path convention replaced with canonical versioned format; §14 `document_templates` table added; §15 versioning model rewritten to clarify quote vs. document versioning; indexes updated |
| `EMAIL_SYSTEM.md` | §18.8 extended with `attached_document_id`; §18.9 email attachment integrity rule added |
| `PRODUCT_REQUIREMENTS.md §3.3` | Settings group: added `settings.legal_text` and `settings.banking` |

---

### Critical Contradictions: None

### High Contradictions: None (all resolved)

### Medium Contradictions: None (all resolved)

---

**PDF engine architecture foundation passed.**
