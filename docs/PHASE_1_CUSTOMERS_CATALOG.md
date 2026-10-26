# Bivro — Phase 1: Customers, Service Catalog, Rates, Company Profile

Status: **Implemented** (migration 027) · 2026-10-26

Features F005 (customer records), F029 (company profile and branding), F030 (rate configuration) and F033 (service catalog) from `PRODUCT_REQUIREMENTS.md`, built for Swiss moving companies first.

---

## 1. Swiss Decisions

| Topic | Decision |
|---|---|
| Currency, country, time zone | New companies default to CHF, CH, Europe/Zurich (existing Swiss companies migrated) |
| VAT | MWST enabled by default at 8.1 %, label "MWST", per service configurable |
| Distances | Kilometres (`rate_per_km_cents`); the per-mile column is deprecated |
| Money | Integer Rappen; displayed `CHF 1'250.50` (hand-formatted, identical on server, browser and PDF) |
| Phone numbers | Stored E.164 (`+41791234567`), displayed `+41 79 123 45 67`; any input format accepted |
| UID | `CHE-123.456.789` format enforced |
| IBAN | mod-97 validated; QR-IBAN recognised (needed for QR-bills with QR reference) |
| Payment terms | 30 days default |
| Customer language | DE / FR / IT / EN — decides the language of offers, invoices, e-mails |

---

## 2. Customers

- **Private or business** customers. Business customers require a company name (API and database constraint); the person is the contact.
- Salutation, correspondence language, mobile and landline, **billing address** (required later for QR-bills), source and referral.
- **Duplicate warning** while typing: same e-mail or same phone (in any format) → link to the existing customer. Saving a duplicate stays possible (families, company switchboards).
- **Search** over name, company, e-mail and phone; phone search accepts formatted numbers. Free-text search is sanitised before it reaches the PostgREST filter (also fixed in the leads list).
- **Archive / restore** instead of delete; leads, offers and jobs keep their reference. Archived customers are listed separately and stay readable.
- Every change is written to the activity log with only the changed fields.
- Permissions: `customers.view / create / edit / delete`.

## 3. Service Catalog

- 19 Swiss standard services per company at provisioning (e.g. *Umzugsteam (Stundenansatz)*, *Endreinigung mit Abnahmegarantie*, *Entsorgung* per m³, *Halteverbotszone / Parkbewilligung*), each with pricing mode, unit and 8.1 % VAT.
  - **Bug fixed:** provisioning previously inserted pricing modes that do not exist (`hourly_rate`, `per_mile`, `flat_rate`, `percentage`); the insert failed silently and new companies had no catalog. Errors are now raised.
- Each service: name, category, pricing mode (fixed / hourly / per unit / per km / manual), unit, price, cost price (internal), VAT, text on offers, internal note.
- Unique names per company (case-insensitive). Activate / deactivate; reorder within a category.
- Removal rules (snapshot integrity): standard services can only be deactivated; custom services are deleted if never used, otherwise archived.
- Everyone in the company can read the catalog (quote builder); changes need `settings.services`.

## 4. Rates & Terms

- **Team rates** (`rate_cards`): hourly price and internal cost per team, e.g. "2 Mann + Lieferwagen", "3 Mann + LKW 3.5 t" (crew size + vehicle class).
- **Surcharges & terms** (`company_settings`): travel flat fee, price per km, minimum charge, minimum hours, stairs per floor, long carry, lift waiting, weekend/holiday %, fuel %, deposit %, offer validity, payment terms, VAT registration/rate/label.
- Permission: `settings.services`.

## 5. Company Profile

- Display and legal name, UID, commercial register number, address, contact, website, brand colour — `settings.company`.
- Bank details (IBAN/QR-IBAN, BIC, bank, account holder) — separate permission `settings.banking`, because changing them redirects payments; old and new IBAN are audited.
- Logo: PNG/JPEG/WebP up to 1 MB in the public `company-logos` bucket. The file type is detected from the file's bytes, not its declared type (an SVG disguised as PNG is rejected); the previous logo file is deleted. The logo appears in the company switcher immediately.

## 6. Settings Navigation

`/settings` lists only the sections the user may open: Company profile, Services, Rates & terms, Team & permissions (owner).

## 7. Local Development

`supabase/seed-local.ts` now provisions the three demo companies like an approved registration (settings, 19 services, permission groups, e-mail templates) and can reset demo companies that already contain data.
