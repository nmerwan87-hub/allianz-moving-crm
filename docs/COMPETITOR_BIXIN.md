# Bivro — Competitor Analysis: Bixin (MOVU)

Status: **Reference** · Analysed 2026-10-26 in the founder's live Bixin account (app.bixin.ch)

Bixin is the operator tool that MOVU (Swiss moving-lead marketplace) gives its partner companies. The founder's companies use it today. This document records **structure and processes only** — no customer data was copied. It is orientation, not a template: Bivro must cover the same ground and do it better.

Test data created during the analysis (still in Bixin, can be deleted by the founder): customer #163723 "TEST Claude Bitte Loeschen", inquiry #821082, draft offer #2196293 (saved, **never sent**).

---

## 1. Modules

| Bixin | Purpose | Bivro equivalent |
|---|---|---|
| Übersicht | KPI tiles (MOVU leads, bookings, offers by status), open tasks, documents to upload, next appointments, latest reviews | Dashboard (F027) |
| Anfragen | Marketplace leads from MOVU (with commission %) plus own inquiries | Leads (F001–F004) |
| Kunden | Contact records; offers and appointments per customer | Customers (F005) |
| Kalender | Day / week / month; manual appointments (e.g. home visit) | Calendar + Dispatch (F016) |
| Offerten | List with status filter, offer editor | Quotes (F007, F034–F039) |
| Unterlagen | Upload of the signed acceptance protocol per job | Documents (F012, F024) |
| Zahlungsübersicht | MOVU/Bixin **commission invoices to the company** (monthly), not customer invoices | Not needed (own invoices: F021–F023) |
| Bewertungen | Customer reviews with star rating | P1: review request after job |
| Offene Aufgaben | System-generated to-dos ("Entwurfsofferte absenden", "Finale Abrechnung erstellen", "Abnahmeprotokoll hochladen") | Task engine (see §5) |
| Profil & Einstellungen | Company data, language, services offered, partner status, password | Settings (F029) |

Not present in Bixin: user accounts/roles per company, crew and vehicle planning, service price catalogue, VAT, customer invoices with QR-bill, customer portal, e-signature, deposits, analytics, multi-company.

---

## 2. Observed Data Model and Flow

```
Kunde ──< Anfrage ──< Offerte ── Termin(e)
            │            └── Abrechnung (final settlement) ── Abnahmeprotokoll (upload)
            ├── Fragebogen (access conditions, both addresses)
            ├── Inventarliste (free text)
            ├── Dienstleistungen (selected services)
            ├── Medien (photos, videos, PDF)
            ├── Private Notizen
            └── Hausbesuch (appointment)
```

**Customer:** salutation, first/last name, e-mail, mobile and landline (one phone required, validated, stored E.164), language DE/EN/FR.

**Inquiry ("Neue Offerte erstellen"):** service type (Umzug / Reinigung / Umzug + Reinigung), service date (date picker limited to about five weeks ahead), current address (street, ZIP, city, country, rooms 1–8 in half steps), new address (street, ZIP, city, country — European list). Addresses are normalised ("Zuerich" → "Zürich"). Source is recorded (MOVU or BIXIN).

**Questionnaire (per address):** dwelling type (flat, two-storey flat, shared flat, house 1/2/3+ floors, storage, office), floor (basement … 10+), lift (none, 2–3, 4–5, 6+ persons, goods lift), distance parking → entrance in metres, outside steps, number of boxes/bags, comment.

**Offer editor:**

- Validity date (defaults to five days), company location (for travel distance, map and distance view).
- Main service in one of two modes:
  - **Fixed price:** price, estimated hours, number of workers.
  - **Hourly:** hours × hourly rate, **Kostendach** (price cap), number of workers.
- Additional services from a fixed list (furniture assembly, furniture lift, wardrobe boxes, packing incl. boxes, lamp removal, disposal per m³, floor protection) plus free custom services; each with a price and a "Im Stundenpreis enthalten" (included in hourly rate) flag.
- Rich-text offer comment (3000 characters).
- Actions: Verwerfen / Speichern (draft, explicitly not sent) / Senden.

**Offer statuses:** Erstellt (Submitted, not sent) → Offen (sent) → Gebucht (booked). Booked offers show the marketplace commission (e.g. 5 %) and an "Abrechnung anpassen" action for the final settlement.

**Appointments:** title, date, start time, duration, "confirmed by customer" flag, optional link to an inquiry, comment. No crew, vehicle or capacity.

---

## 3. Weaknesses Found (Bivro must not repeat)

| # | Observation | Consequence |
|---|---|---|
| 1 | "Entsorgung pro m³" takes a quantity, but the line total ignores it (qty 2 × CHF 80 shown as CHF 80) | Wrong prices on unit-based services |
| 2 | Offer total (CHF 1'480) exceeds the Kostendach (CHF 1'400) without any warning | Price cap promise can silently break |
| 3 | No VAT anywhere in the offer | Not a valid Swiss offer/invoice basis |
| 4 | Real extra costs (e.g. parking reservation CHF 200) live in the free-text comment, not as priced lines | Totals and later invoice are wrong; nothing is reportable |
| 5 | Inventory is a single free-text field | No volume, no crew/vehicle estimate, no checklist on site |
| 6 | Service date limited to ~5 weeks ahead | Long-term bookings impossible |
| 7 | Validity silently defaults to 5 days | Offers expire unnoticed |
| 8 | Acceptance protocol is a manual upload task | Paper process; no digital signature |
| 9 | No users, roles or permissions inside a company | Everyone sees prices, commissions, everything |
| 10 | No crew/vehicle assignment on appointments | Dispatch happens outside the tool |
| 11 | No customer invoice / QR-bill / payment tracking for the company's own money | Invoicing happens in another tool |
| 12 | Clicking the first checkbox in "Services hinzufügen" toggles the main service | Easy to remove the main service by mistake |

---

## 4. Good Ideas Worth Keeping

- **Access questionnaire** per address (floor, lift size, parking distance, outside steps) — it drives effort and must feed pricing.
- **Fixed vs hourly** quote mode with a **Kostendach** — standard in Swiss moving; keep, and enforce it.
- **"Included in hourly rate"** flag for services.
- **System-generated open tasks** derived from the state of each job.
- **Source tracking** per inquiry (marketplace, website, phone, referral) for marketing ROI.
- **Address normalisation** and company-location-based distance.
- **Explicit "save without sending"** confirmation.
- **Home-visit appointment** linked to the inquiry.

---

## 5. Backend Process Model for Bivro

Bivro's backend is built around explicit state machines. Every transition is validated in the database, writes an audit entry and emits a domain event; side effects (e-mails, tasks, documents) are produced by event handlers, never by the UI.

### 5.1 Pipeline

| Entity | States | Key transitions and rules |
|---|---|---|
| Lead | new → contacted → survey_scheduled → quoted → won / lost | `quoted` only with at least one sent quote; `won` only through quote acceptance |
| Survey (home visit) | planned → done / cancelled | Appointment with assigned person; results stored as structured questionnaire |
| Quote | draft → sent → viewed → accepted / declined / expired; new version = superseded | Sending freezes a snapshot (lines, prices, VAT, terms); edits after sending create a new version; expiry by scheduled job; warning when total > price cap |
| Job | booked → scheduled → in_progress → completed / cancelled | Created only from an accepted quote; `scheduled` requires date, crew and vehicle |
| Final settlement | open → confirmed | Actual hours, extra lines, deductions; total capped by Kostendach unless an override with reason is recorded |
| Invoice | draft → issued → partially_paid → paid / overdue / cancelled | Swiss QR-bill, VAT breakdown, deposit deducted, numbering without gaps, immutable once issued |
| Payment | pending → succeeded / failed / refunded | Webhook-driven, idempotent |

### 5.2 Generated tasks (replacing "Offene Aufgaben")

Derived automatically, closed automatically when the condition is met:

- Draft quote not sent after 24 h
- Sent quote not viewed after 48 h / expiring in 2 days
- Accepted quote without scheduled job
- Job tomorrow without crew or vehicle
- Completed job without final settlement
- Final settlement without signed acceptance protocol
- Invoice overdue (reminder levels 1–3)

### 5.3 Correctness rules (the "better" part)

- Money in integer cents; every line computes `quantity × unit price − discount`, then VAT per line (Swiss rates configurable per company, default 8.1 %).
- All totals are computed on the server and stored with the snapshot; the UI never sends totals.
- Price cap enforced in the database for hourly quotes and settlements.
- Every extra cost is a line item; comments never carry prices.
- Structured inventory (rooms → items → volume) feeding crew/vehicle/hour estimates.
- Every state change is audited and emits an event; event handlers are idempotent and retried by the scheduler.

### 5.4 Mapping to existing Bivro docs

The stages in `PRODUCT_REQUIREMENTS.md §4` (Lead → Survey → Quote → Booking → Preparation → Execution → Completion → Billing → Closed) already match this pipeline. Without AI in V1 (see project decision), the quote is built manually from questionnaire, inventory and the company's service catalogue and rate matrix (F030, F033–F039).
