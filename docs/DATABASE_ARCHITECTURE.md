# Bivro — Database Architecture

**Version:** 1.0  
**Status:** Frozen — Authoritative Schema Reference  
**Owner:** Engineering  
**Last updated:** 2026-06-29  

> This document is the single source of truth for Bivro's PostgreSQL schema. No table, column, index, or policy may be created without being defined here first. Migration files must reproduce this document exactly.

---

## Table of Contents

1. [Database Principles](#1-database-principles)
2. [Multi-Tenant Strategy](#2-multi-tenant-strategy)
3. [Supabase Auth Relationship](#3-supabase-auth-relationship)
4. [User Roles in V1](#4-user-roles-in-v1)
5. [Enum Strategy](#5-enum-strategy)
6. [Core Tables](#6-core-tables)
7. [Entity Relationships](#7-entity-relationships)
8. [Status State Machines](#8-status-state-machines)
9. [RLS Policy Concepts](#9-rls-policy-concepts)
10. [Index Strategy](#10-index-strategy)
11. [Constraints](#11-constraints)
12. [Soft Delete Strategy](#12-soft-delete-strategy)
13. [Audit Log Design](#13-audit-log-design)
14. [Document Storage Model](#14-document-storage-model)
15. [PDF Versioning Model](#15-pdf-versioning-model)
16. [Email Log Model](#16-email-log-model)
17. [AI Log Model](#17-ai-log-model)
18. [Payment Tracking Model](#18-payment-tracking-model)
19. [Human-Readable Sequence Numbers](#19-human-readable-sequence-numbers)
20. [Domain Events Table](#20-domain-events-table)
21. [Future Migration Notes](#21-future-migration-notes)

---

## 1. Database Principles

### P1 — Correctness Before Convenience
The schema must make invalid states unrepresentable. CHECK constraints, NOT NULL, foreign keys, and unique constraints exist to prevent bad data from entering the system. An application bug that tries to insert invalid data should fail at the database, not silently succeed and cause a business problem later.

### P2 — Every Table Belongs to a Tenant
With the exception of `auth.users` (managed by Supabase) and Bivro's internal system tables (event queue, sequences), every table that holds business data has a `company_id` column that is always NOT NULL. This is the foundational rule of the multi-tenant model.

### P3 — Monetary Values Are Integers
All monetary amounts are stored as integers representing the smallest currency unit (cents for USD/EUR). No NUMERIC, DECIMAL, or FLOAT types for money. Column names always include the `_cents` suffix to make the unit explicit. Formatting for display happens in the application layer only.

### P4 — Timestamps Are Always UTC
All timestamp columns use `timestamptz` (timestamp with time zone). Data is stored in UTC. Time zone conversion happens in the application. The company's timezone is stored in `companies.timezone` and used by the application for display purposes only.

### P5 — Soft Deletes for Business Data
Business entities (companies, customers, leads, quotes, jobs, etc.) use soft deletes via a `deleted_at timestamptz` column. Hard deletes are reserved for GDPR erasure requests. System and log tables (activity_logs, email_logs, ai_logs, domain_events) are append-only and never deleted.

### P6 — Append-Only for Logs
Log tables (activity_logs, email_logs, ai_logs, domain_events) have no `updated_at` column and no UPDATE permission. They are insert-only. Corrections are new records, not edits. Exception: `email_logs` tracking fields (sent_at, open_count, bounced_at, etc.) are updated by inbound Resend webhook events — see §16 Email Tracking Update Pattern.

### P7 — Generated Columns for Derived Values
Where a value is a pure function of other columns (e.g., `balance_due_cents = total - deposit_applied - amount_paid`), PostgreSQL GENERATED ALWAYS AS (expression) STORED columns are used. These eliminate the risk of the derived value going stale due to an application bug.

**AI prediction fields are an explicit exception.** Columns that record what an AI model predicted at a specific point in time (e.g., `ai_quote_recommendations.estimated_margin_percent`) are historical inference snapshots, not live derived values. Storing them does not violate this principle. Live operational margins must still be GENERATED columns or computed at read time from their component fields — AI estimates are additional context, not the source of truth.

### P8 — UUIDs Are Time-Ordered (v7)

All primary keys use UUID v7. UUID v7 encodes a 48-bit millisecond Unix timestamp in the most significant bits, making UUIDs sortable by creation time and B-tree index friendly. This avoids the random write scatter pattern of UUID v4, which causes index page splits and write amplification under high insert volume.

**Target PostgreSQL version:** Bivro V1 targets **PostgreSQL 17**, which is the Supabase default for new projects as of June 2026.

**PostgreSQL 17 and UUID v7:** PostgreSQL 17 does not include a native `uuidv7()` function. Native `uuidv7()` was introduced in PostgreSQL 18. Supabase does not yet support PostgreSQL 18 for new projects at the time of Bivro V1.

**V1 canonical generation function:** `gen_uuid_v7()`

Because PG17 has no built-in UUID v7 generator, Bivro defines `gen_uuid_v7()` as a custom `plpgsql` function created in the **first bootstrap migration**, before any table is created. Every `PRIMARY KEY DEFAULT` clause in this schema uses this function.

The function name `gen_uuid_v7()` is intentionally distinct from PG18's native `uuidv7()`. This makes the Bivro-defined function immediately recognizable in SQL and enables a clean upgrade path: when Supabase supports PG18, the function body is replaced to delegate to native `uuidv7()` with no changes to any table schema.

**Implementation dependency:** `pgcrypto` — specifically `gen_random_bytes()`. The bootstrap migration must activate this extension explicitly before defining the function. Do not assume pgcrypto is pre-enabled.

```sql
CREATE EXTENSION IF NOT EXISTS pgcrypto;
```

**Why not `pg_idkit`:** Supabase supports the `pg_idkit` extension, but its function is named `idkit_uuidv7()`, not `gen_uuid_v7()`. Using it would require aliasing and adds a binary extension dependency. The custom function approach is portable, requires only pgcrypto (which Supabase makes available), and is self-contained in the bootstrap migration.

**Reference implementation** (authoritative SQL lives in `MASTER_BOOTSTRAP.md`):

```sql
-- Requires: pgcrypto activated above
-- Must be created before any table that uses DEFAULT gen_uuid_v7()
CREATE OR REPLACE FUNCTION gen_uuid_v7()
RETURNS uuid
LANGUAGE plpgsql
VOLATILE PARALLEL SAFE
AS $$
DECLARE
  ts_ms    BIGINT;
  ts_hex   TEXT;
  rand_hex TEXT;
  variant  TEXT;
BEGIN
  -- 48-bit millisecond Unix timestamp
  ts_ms    := (EXTRACT(EPOCH FROM clock_timestamp()) * 1000)::BIGINT;
  ts_hex   := lpad(to_hex(ts_ms), 12, '0');
  -- 80 random bits (10 bytes) via pgcrypto
  rand_hex := encode(gen_random_bytes(10), 'hex');
  -- Variant nibble: must be hex 8/9/a/b (binary 10xx)
  -- get_byte() & 3 gives 0-3 with uniform distribution; 8+n gives 8/9/10/11
  variant  := to_hex(8 + (get_byte(gen_random_bytes(1), 0) & 3));

  -- UUID v7 layout: tttttttt-tttt-7rrr-Vrrr-rrrrrrrrrrrr
  --   t = timestamp (48 bits)  |  7 = version nibble
  --   r = random (rand_a 12 bits + rand_b 62 bits)
  --   V = variant nibble (8/9/a/b)
  RETURN (
    substr(ts_hex,   1, 8) || '-' ||
    substr(ts_hex,   9, 4) || '-' ||
    '7' || substr(rand_hex, 1, 3) || '-' ||
    variant || substr(rand_hex, 4, 3) || '-' ||
    substr(rand_hex, 7, 12)
  )::uuid;
END;
$$;
```

**PostgreSQL 18 upgrade path:** When Supabase supports PG18 and Bivro upgrades, the function body is replaced in a single migration:

```sql
CREATE OR REPLACE FUNCTION gen_uuid_v7()
RETURNS uuid LANGUAGE sql VOLATILE PARALLEL SAFE
AS $$ SELECT uuidv7(); $$;
```

No table schema changes are required. All `DEFAULT gen_uuid_v7()` clauses continue to work.

**Application-side generation:** The database generates all primary key values via `DEFAULT gen_uuid_v7()`. V1 application code does not generate IDs. tRPC mutations return the server-assigned UUID after insert. If offline-first ID generation is required in a future release (e.g., V2 mobile with offline sync), that decision will be made explicitly and the approved package is `uuidv7` (npm).

**All primary keys:** Every table uses `id uuid PRIMARY KEY DEFAULT gen_uuid_v7()`. No table in this schema uses `gen_random_uuid()` or any other UUID generation strategy.

### P9 — No Orphaned Records
All foreign key relationships have explicit ON DELETE behavior defined. Business relationships generally use RESTRICT (prevent deletion of a referenced parent). Cascade DELETE is used only for line items that have no independent existence (e.g., `quote_items` cannot exist without a `quote`).

### P10 — Single Source of Truth per Piece of Data
Data is not stored in two places. Where a value appears to be redundant (e.g., job totals vs. invoice totals), one is the authoritative source and the other is a generated column or a snapshot taken at a specific lifecycle event.

---

## 2. Multi-Tenant Strategy

### The Tenant Model

In Bivro, a **tenant** is a moving company. The `companies` table is the tenant registry. Every company has a unique `id` (UUID v7) that serves as the `company_id` referenced by all other tables.

### Isolation Enforcement

Tenant isolation is enforced at **three layers** simultaneously:

**Layer 1 — JWT (Identity Layer)**
When a user authenticates via Supabase Auth, the issued JWT contains `company_id` in its `app_metadata` claim. This is set when the user is first associated with a company (on signup or on invite acceptance) via a Supabase Auth hook.

**Layer 2 — RLS (Database Layer)**
Every tenant-scoped table has Row-Level Security enabled. The RLS policy extracts `company_id` from the JWT using:
```sql
(auth.jwt() -> 'app_metadata' ->> 'company_id')::uuid
```
No query from an authenticated user can return rows from a different company, even if the query explicitly filters by a different `company_id`. The database enforces this unconditionally.

**Layer 3 — Application (Code Layer)**
All application queries explicitly include `company_id` in their WHERE clauses. This is a belt-and-suspenders approach — the application does not rely solely on RLS, and RLS does not rely solely on the application.

### The `company_id` Contract

**Rule:** Every INSERT operation must set `company_id` to `(auth.jwt() -> 'app_metadata' ->> 'company_id')::uuid`. The RLS INSERT policy enforces this — if the application tries to insert a row with a different `company_id`, the insert is rejected.

**Rule:** Application code must never derive `company_id` from user input. It is always resolved from the authenticated session context.

---

## 3. Supabase Auth Relationship

### Auth Schema vs. Public Schema

Supabase Auth maintains its own `auth.users` table in the `auth` schema. This table is managed entirely by Supabase Auth and contains authentication credentials (email, hashed password, provider tokens, MFA factors).

Bivro does not write to `auth.users` directly. All authentication is delegated to Supabase Auth via its SDK.

Bivro maintains a `profiles` table in the `public` schema that extends `auth.users` with Bivro-specific data. The relationship is:

```
auth.users.id  ←  profiles.id  (one-to-one, same UUID)
```

The `profiles.id` is not a separate generated UUID — it is the same UUID as the Supabase Auth user's `id`. This identity is the join key between the auth system and the business data.

### Provisioning Flow

```
1. User signs up → Supabase Auth creates auth.users record
2. Supabase Auth triggers after_signup hook
3. Hook creates: companies record + profiles record
4. Hook sets company_id in auth.users.app_metadata via Admin API
5. JWT now contains { company_id, role } in app_metadata
6. RLS activates on next request
```

For invited users:
```
1. Owner invites email → invite record created in DB
2. Supabase Auth sends magic link invite email
3. User accepts → Supabase Auth creates/updates auth.users
4. Hook reads invite record → creates profiles record + sets app_metadata
5. Invite consumed
```

### JWT Claims Used by RLS

The following `app_metadata` fields are set on the JWT and used by RLS policies:

| Claim | Type | Usage |
|-------|------|-------|
| `company_id` | UUID string | Tenant isolation in all RLS policies |
| `role` | string (`owner` or `office`) | Role-based access in RLS policies |

These are set and maintained by Supabase Auth hooks. When a user's role changes, the JWT is refreshed on the next request (Supabase Auth refreshes tokens automatically; the new token carries the updated claims).

---

## 4. User Roles in V1

### V1 Role Model: Two Roles Only

Bivro V1 supports exactly two roles for users who log in:

| Role | Access Level | Description |
|------|-------------|-------------|
| `owner` | **Unrestricted** | Company owner. Has unconditional access to every module, every record, every setting. No permission check ever blocks an Owner. Manages permissions for all other users. |
| `office` | **Configurable** | Internal team member. Has exactly the permissions the Owner assigns — no more, no less. The permission set is defined via Permission Groups and individual overrides. |

### What Does NOT Exist in V1

- **No driver/crew login.** Employees exist as data records (`employees` table) for planning and assignment. They do not have Supabase Auth accounts and cannot log in.
- **No customer login.** Customers access their quotes and invoices via token-authenticated portal links — no account creation.
- **No fixed permissions for Office.** The Office role has no hardcoded permission set. What an Office user can do is configured entirely by the Owner through the permission system (see Section 6.24).
- **No custom role names in V1.** Custom role names (e.g., "Dispatcher," "Estimator") are labels the Owner gives to Permission Groups — not system-level roles in the database.

### Permission System Overview

Office user permissions are resolved at runtime from three data sources:

1. `permission_groups` — named sets of permissions created by the Owner
2. `user_permission_groups` — which groups each office user belongs to
3. `user_permission_overrides` — individual grants or denials that override group settings

Resolved permission set = union of all group permissions ± individual overrides.

Every permission change is recorded in `activity_logs`.

See Section 6.24 for the full permission schema. The complete permission catalogue is in `PRODUCT_REQUIREMENTS.md` Section 3.3.

### Role Summary

| Resource | Owner | Office |
|----------|-------|--------|
| All resources | **Unrestricted — no permission check applies** | Determined by permission group assignments + individual overrides |
| Billing (Bivro subscription) | Full | Never accessible — Owner-only regardless of any permission assignment |

---

## 5. Enum Strategy

### Decision: PostgreSQL Native Enums

All fixed-value status fields use PostgreSQL `CREATE TYPE ... AS ENUM`. This approach:
- Constrains values at the database level (no invalid statuses possible)
- Produces better error messages than CHECK constraints
- Integrates cleanly with Drizzle ORM's type generation

**Trade-off acknowledged:** Adding a new enum value requires a migration. This is acceptable because status changes are deliberate schema decisions, not ad-hoc data changes.

**V2+ migration path:** If enum inflexibility becomes painful (e.g., customers needing custom statuses), convert the affected columns to `text` with a CHECK constraint against a `allowed_values` reference table. This migration is straightforward.

### Complete Enum Catalogue

```sql
-- Internal user roles (V1: owner and office only)
CREATE TYPE user_role AS ENUM (
  'owner',
  'office'
  -- V2+: 'driver', 'accountant', 'custom'
);

-- Type of move
CREATE TYPE move_type AS ENUM (
  'local',           -- same metro area, typically < 50 miles
  'long_distance',   -- cross-state or > 50 miles
  'commercial',      -- office or business move
  'international',   -- cross-border
  'junk_removal'     -- V2+ vertical expansion seed
);

-- Lead lifecycle status
CREATE TYPE lead_status AS ENUM (
  'new',         -- just received, not yet contacted
  'contacted',   -- first contact made
  'surveyed',    -- survey/appointment completed
  'quoted',      -- at least one quote sent
  'booked',      -- converted to a job
  'lost',        -- will not convert
  'duplicate'    -- merged into another lead
);

-- Quote lifecycle status
CREATE TYPE quote_status AS ENUM (
  'draft',      -- being prepared, not sent
  'sent',       -- sent to customer
  'viewed',     -- customer opened the portal link
  'accepted',   -- customer accepted
  'declined',   -- customer explicitly declined
  'expired',    -- passed expiry date without action
  'cancelled'   -- cancelled by operator
);

-- Job lifecycle status
CREATE TYPE job_status AS ENUM (
  'scheduled',    -- booked, date set
  'confirmed',    -- customer confirmed attendance
  'in_progress',  -- job day started
  'completed',    -- physically done
  'cancelled',    -- cancelled before completion
  'on_hold'       -- paused (weather, access issue, etc.)
);

-- Invoice lifecycle status
CREATE TYPE invoice_status AS ENUM (
  'draft',           -- generated, not yet sent
  'sent',            -- sent to customer
  'viewed',          -- customer opened the portal link
  'partially_paid',  -- some payment received, balance remaining
  'paid',            -- fully paid
  'overdue',         -- past due date, not paid
  'void',            -- cancelled, no longer valid
  'write_off'        -- uncollectable, written off
);

-- Payment classification
CREATE TYPE payment_type AS ENUM (
  'deposit',     -- upfront deposit collected at booking
  'balance',     -- final balance after job completion
  'partial',     -- partial payment (neither deposit nor full balance)
  'refund',      -- money returned to customer
  'adjustment'   -- correction entry
);

-- How payment was made
CREATE TYPE payment_method AS ENUM (
  'card',          -- credit or debit card (via Stripe)
  'ach',           -- ACH bank transfer (via Stripe)
  'cash',          -- cash in person
  'check',         -- physical check
  'bank_transfer', -- wire or direct transfer (manual)
  'other'          -- any other method
);

-- Payment processing status
CREATE TYPE payment_status AS ENUM (
  'pending',    -- initiated but not confirmed
  'completed',  -- successfully received
  'failed',     -- processing failed
  'refunded',   -- refund processed
  'cancelled'   -- cancelled before processing
);

-- Appointment type
CREATE TYPE appointment_type AS ENUM (
  'survey',          -- in-person inventory survey
  'virtual_survey',  -- video call survey
  'callback',        -- scheduled phone call
  'site_visit'       -- site assessment before move
);

-- Appointment status
CREATE TYPE appointment_status AS ENUM (
  'scheduled',  -- booked
  'confirmed',  -- customer confirmed
  'completed',  -- happened
  'no_show',    -- customer did not attend
  'cancelled'   -- cancelled
);

-- Employee role (for planning records, not login roles)
CREATE TYPE employee_role AS ENUM (
  'driver',      -- operates the vehicle
  'mover',       -- physical moving labor
  'foreman',     -- crew lead, on-site supervisor
  'specialist'   -- piano mover, art handler, etc.
);

-- Employee status
CREATE TYPE employee_status AS ENUM (
  'active',
  'inactive',
  'terminated'
);

-- Vehicle type
CREATE TYPE vehicle_type AS ENUM (
  'cargo_van',
  'box_truck_16ft',
  'box_truck_24ft',
  'box_truck_26ft',
  'semi_truck',
  'pickup_truck'
);

-- Vehicle operational status
CREATE TYPE vehicle_status AS ENUM (
  'available',
  'in_use',
  'maintenance',
  'retired'
);

-- Assignment role (who does what on a job)
CREATE TYPE assignment_role AS ENUM (
  'lead',   -- crew lead / foreman
  'mover'   -- standard crew member
);

-- Document category
CREATE TYPE document_type AS ENUM (
  -- V1 document types
  'quote_pdf',              -- customer-facing quote / offer
  'contract',               -- unsigned service agreement
  'signed_contract',        -- countersigned service agreement
  'invoice_pdf',            -- customer-facing invoice
  'payment_receipt',        -- payment received confirmation
  'damage_report',          -- damage documentation (internal + conditional customer)
  'work_order',             -- internal crew job sheet (never customer-facing)
  -- V1.5 document types
  'delivery_receipt',       -- signed completion / delivery confirmation
  'bill_of_lading',         -- long-distance / international transport document
  'credit_note',            -- partial or full credit against an invoice
  'booking_confirmation',   -- lightweight booking summary (distinct from service agreement)
  'cancellation_confirmation', -- written record of job cancellation
  -- V2+ document types
  'survey_summary',         -- post-survey professional report for customer
  'inventory_summary',      -- detailed customer-facing inventory document
  -- Internal / crew documents
  'inventory_list',         -- internal inventory checklist
  'photo',                  -- job site or damage photo
  'license',                -- employee license document
  'certification',          -- employee certification
  'insurance_certificate',  -- company or customer insurance document
  'other'
);

-- What entity a document belongs to
CREATE TYPE document_entity_type AS ENUM (
  'quote',
  'job',
  'invoice',
  'customer',
  'employee',
  'vehicle',
  'company'
);

-- Quote/invoice line item type
CREATE TYPE line_item_type AS ENUM (
  'labor',       -- hourly labor charge
  'truck',       -- truck/vehicle charge
  'packing',     -- packing materials/service
  'fuel',        -- fuel surcharge
  'toll',        -- toll charges
  'storage',     -- storage fee
  'specialty',   -- piano, safe, specialty item
  'surcharge',   -- stairs, long carry, elevator wait
  'discount',    -- discount line (negative amount)
  'other'
);

-- Task status
CREATE TYPE task_status AS ENUM (
  'open',
  'in_progress',
  'completed',
  'cancelled'
);

-- Task priority
CREATE TYPE task_priority AS ENUM (
  'low',
  'medium',
  'high',
  'urgent'
);

-- Email delivery status
CREATE TYPE email_delivery_status AS ENUM (
  'queued',
  'sent',
  'delivered',
  'opened',
  'clicked',
  'bounced',
  'complained',  -- marked as spam
  'failed'
);

-- Document generation lifecycle status
CREATE TYPE document_generation_status AS ENUM (
  'pending',      -- row created; generation not yet started
  'generating',   -- Edge Function is actively rendering
  'generated',    -- PDF stored; snapshot complete; ready for delivery
  'failed',       -- generation failed after max retries; operator alert required
  'superseded',   -- a newer version of this document exists; retained for history
  'voided'        -- document explicitly voided (e.g., invoice cancelled)
);

-- AI task classification
CREATE TYPE ai_task_type AS ENUM (
  'inventory_parse',   -- parse natural language inventory
  'lead_score',        -- score a lead 0-100
  'email_draft',       -- draft a customer email
  'quote_generate',    -- suggest quote pricing
  'insight'            -- generate business insight
);

-- AI processing result
CREATE TYPE ai_result_status AS ENUM (
  'success',   -- completed and returned valid result
  'failed',    -- failed completely
  'partial',   -- returned result but with low confidence
  'fallback'   -- AI was unavailable; fallback used
);

-- Subscription tier
-- Canonical plan names → DB values (defined in PLATFORM_ADMIN.md §8.1):
--   Free → 'free' | Starter → 'starter' | Professional → 'pro'
--   Business → 'business' | Enterprise → 'enterprise'
--   Custom contracts use 'enterprise' + company_subscription_overrides (no separate enum value)
CREATE TYPE subscription_tier AS ENUM (
  'free',
  'starter',
  'pro',
  'business',
  'enterprise'
);

-- Subscription billing status
CREATE TYPE subscription_status AS ENUM (
  'trialing',
  'active',
  'past_due',
  'cancelled',
  'paused'
);

-- Company operational / lifecycle status (orthogonal to subscription_status)
-- Full state machine: ONBOARDING_ARCHITECTURE.md §1
CREATE TYPE company_status AS ENUM (
  'pending_email_verification',  -- just registered; owner email not yet confirmed
  'pending_review',              -- email confirmed; awaiting Platform Admin approval
  'active',                      -- approved and operational
  'suspended',                   -- temporarily blocked (non-payment or policy violation)
  'rejected',                    -- registration rejected; never activated
  'archived'                     -- churned or removed; data retained, all access blocked
);

-- Home/property size reference
CREATE TYPE property_size AS ENUM (
  'studio',
  'one_bedroom',
  'two_bedroom',
  'three_bedroom',
  'four_bedroom',
  'five_plus_bedroom',
  'commercial_small',
  'commercial_medium',
  'commercial_large'
);

-- Lead/customer acquisition source
CREATE TYPE acquisition_source AS ENUM (
  'web_form',
  'phone_call',
  'referral',
  'marketplace',
  'repeat_customer',
  'social_media',
  'google_ads',
  'organic_search',
  'manual',
  'other'
);

-- Quote/invoice line item pricing mode
CREATE TYPE pricing_mode AS ENUM (
  'fixed',          -- total = unit_price × quantity (standard multiplication)
  'hourly',         -- quantity represents hours; unit_price is the hourly rate
  'quantity',       -- same as fixed; alias for clarity when unit is countable items
  'distance',       -- quantity represents miles/km; unit_price is the per-unit rate
  'manual'          -- operator enters total directly; no formula enforced
);

-- Discount type for line items
CREATE TYPE discount_type AS ENUM (
  'percent',   -- discount is a percentage of the line total (e.g., 10%)
  'fixed'      -- discount is a fixed amount in cents (e.g., $50 off)
);

-- Permission override type (grant or deny)
CREATE TYPE permission_override_type AS ENUM (
  'grant',   -- explicitly grant this permission (overrides group absence)
  'deny'     -- explicitly deny this permission (overrides group presence)
);
```

---

## 6. Core Tables

### 6.1 `companies`

The tenant registry. Every company using Bivro is one row in this table. This is the root of the entire multi-tenant tree.

```
companies
─────────────────────────────────────────────────────────────────
id                      uuid            PRIMARY KEY  DEFAULT gen_uuid_v7()
─────────────────────────────────────────────────────────────────
name                    text            NOT NULL
slug                    text            NOT NULL UNIQUE  -- URL-safe identifier
email                   text
phone                   text
website                 text

-- Address
address_line1           text
address_line2           text
city                    text
state                   text
postal_code             text
country                 text            NOT NULL DEFAULT 'US'

-- Business identity
timezone                text            NOT NULL DEFAULT 'America/New_York'
currency                text            NOT NULL DEFAULT 'USD'
logo_url                text            -- Supabase Storage path
license_number          text            -- moving company license
usdot_number            text            -- US DOT number (US movers)
mc_number               text            -- motor carrier number (US long-distance)

-- Operational lifecycle status (independent of billing status)
-- Full lifecycle and transition rules: ONBOARDING_ARCHITECTURE.md §1
company_status          company_status  NOT NULL DEFAULT 'pending_email_verification'
-- Default 'active' applied in migration 021 to existing dev/seed rows only.
-- All new registrations start at 'pending_email_verification'.

-- Legal identity
legal_name              text
-- Official registered company name. If NULL, 'name' is used on legal documents.
trading_name            text
-- "Doing business as" name. Customer-facing. If NULL, 'name' is used.
registration_number     text
-- Company registration number with the relevant government authority.
vat_number              text
-- VAT/UID/EIN/GST/ABN number. Format validated by country. See ONBOARDING_ARCHITECTURE.md §2.4.

-- Banking (displayed on invoice payment instructions)
bank_name               text
bank_iban               text
bank_bic                text
-- SWIFT/BIC code
bank_payee_name         text
-- Name on the bank account; may differ from company name (sole traders)

-- Branding
accent_color            text
-- Hex color code (e.g., '#1E40AF'). Used in PDF templates and email headers.
-- NULL = Bivro default palette applies (ink-900 / #1E293B).

-- Subscription (Bivro billing)
subscription_tier       subscription_tier  NOT NULL DEFAULT 'free'
subscription_status     subscription_status NOT NULL DEFAULT 'trialing'
trial_ends_at           timestamptz
-- Set at approval time (now() + 14 days), NOT at registration time.
stripe_customer_id      text            -- Bivro's Stripe customer ID (cus_...)
stripe_subscription_id  text            -- Stripe subscription object ID (sub_...)
current_period_end      timestamptz

-- Platform management
is_demo                 boolean         NOT NULL DEFAULT false
-- Demo companies excluded from revenue/usage metrics. Auto-archived after 30 days.
suspended_reason        text
-- Human-readable reason shown to the Owner when company_status = 'suspended'.
suspended_at            timestamptz
suspended_by            text
-- platform_admin_users.id as text. No FK enforced (cross-schema reference).

-- Registration / approval tracking (complete spec: ONBOARDING_ARCHITECTURE.md §2–§4)
registration_ip         inet
-- Client IP captured at registration form submission.
terms_accepted_at       timestamptz
-- When the owner accepted the Terms of Service.
terms_version           text
-- Version identifier of the ToS accepted (e.g., '2026-07-20').
privacy_policy_accepted_at  timestamptz
privacy_policy_version  text
reviewed_at             timestamptz
-- When Platform Admin made the approve/reject decision.
reviewed_by             text
-- platform_admin_users.id as text. No FK enforced.
review_notes            text
-- Internal Platform Admin notes. Never sent to the owner.
rejection_reason        text
-- Internal reason for rejection. Not sent verbatim to the owner.
rejected_at             timestamptz
more_info_requested_at  timestamptz
-- When the last "request more information" action was taken.

-- Counters (used to generate human-readable numbers)
quote_sequence          integer         NOT NULL DEFAULT 0
job_sequence            integer         NOT NULL DEFAULT 0
invoice_sequence        integer         NOT NULL DEFAULT 0

-- Soft delete
deleted_at              timestamptz

-- Timestamps
created_at              timestamptz     NOT NULL DEFAULT now()
updated_at              timestamptz     NOT NULL DEFAULT now()
─────────────────────────────────────────────────────────────────
CONSTRAINTS:
  slug: lowercase, alphanumeric + hyphens only (CHECK constraint)
  subscription_tier: valid enum value
  country: 2-letter ISO code (CHECK char_length = 2)
```

**Why sequences on the company?** Human-readable numbers (QT-2026-001) must be unique per company and sequential. PostgreSQL global sequences would create gaps across tenants. Storing the sequence counter on the company row and incrementing with SELECT ... FOR UPDATE ensures per-company sequential numbers without gaps.

---

### 6.2 `profiles`

Bivro's internal user record. One-to-one with `auth.users`. This table holds Bivro-specific user data that Supabase Auth does not manage.

```
profiles
─────────────────────────────────────────────────────────────────
id                      uuid            PRIMARY KEY  -- SAME UUID as auth.users.id
─────────────────────────────────────────────────────────────────
company_id              uuid            NOT NULL REFERENCES companies(id) ON DELETE RESTRICT

-- V1 role (owner | office only)
role                    user_role       NOT NULL DEFAULT 'office'

-- Identity
first_name              text            NOT NULL
last_name               text            NOT NULL
email                   text            NOT NULL
phone                   text
avatar_url              text            -- Supabase Storage path

-- Status
is_active               boolean         NOT NULL DEFAULT true

-- Invite tracking
invited_by              uuid            REFERENCES profiles(id) ON DELETE SET NULL
invited_at              timestamptz

-- Activity
last_seen_at            timestamptz

-- Soft delete
deleted_at              timestamptz

-- Timestamps
created_at              timestamptz     NOT NULL DEFAULT now()
updated_at              timestamptz     NOT NULL DEFAULT now()
─────────────────────────────────────────────────────────────────
INDEXES:
  idx_profiles_company_id         (company_id)
  idx_profiles_email              (email)
CONSTRAINTS:
  email: must match auth.users.email for the same id (maintained by application)
  Unique active email per company: UNIQUE(company_id, email) WHERE deleted_at IS NULL
```

**Why not use auth.users directly?** Supabase Auth's schema is controlled by Supabase and can change. By maintaining our own `profiles` table with `id` matching `auth.users.id`, we decouple our business data from the auth provider. If we migrate off Supabase Auth, only the `profiles.id` foreign key reference changes — no other table changes.

---

### 6.3 `customers`

People or businesses who have engaged with a moving company (have at least one lead, quote, or job). A customer record is created when a lead converts.

```
customers
─────────────────────────────────────────────────────────────────
id                      uuid            PRIMARY KEY  DEFAULT gen_uuid_v7()
─────────────────────────────────────────────────────────────────
company_id              uuid            NOT NULL REFERENCES companies(id) ON DELETE RESTRICT

-- Identity
first_name              text            NOT NULL
last_name               text            NOT NULL
email                   text
phone                   text
secondary_phone         text

-- Acquisition
source                  acquisition_source
referral_source         text            -- free text: "John Smith referred"
referral_customer_id    uuid            REFERENCES customers(id) ON DELETE SET NULL

-- Denormalized stats (updated by triggers or application)
total_jobs_count        integer         NOT NULL DEFAULT 0
total_revenue_cents     integer         NOT NULL DEFAULT 0
last_job_at             timestamptz

-- Notes
internal_notes          text            -- not visible to customer

-- Soft delete
deleted_at              timestamptz

-- Timestamps
created_at              timestamptz     NOT NULL DEFAULT now()
updated_at              timestamptz     NOT NULL DEFAULT now()
─────────────────────────────────────────────────────────────────
INDEXES:
  idx_customers_company_id        (company_id)
  idx_customers_email             (company_id, email) WHERE deleted_at IS NULL
  idx_customers_phone             (company_id, phone) WHERE deleted_at IS NULL
  idx_customers_created_at        (company_id, created_at DESC)
```

---

### 6.4 `leads`

An inbound inquiry — the starting point of every job lifecycle. A lead captures everything known about a potential move before commitment.

```
leads
─────────────────────────────────────────────────────────────────
id                      uuid            PRIMARY KEY  DEFAULT gen_uuid_v7()
─────────────────────────────────────────────────────────────────
company_id              uuid            NOT NULL REFERENCES companies(id) ON DELETE RESTRICT
customer_id             uuid            REFERENCES customers(id) ON DELETE SET NULL  -- set on conversion
assigned_to             uuid            REFERENCES profiles(id) ON DELETE SET NULL

-- Contact (snapshot pre-conversion; synced with customer after)
first_name              text            NOT NULL
last_name               text            NOT NULL
email                   text
phone                   text

-- Move details
move_type               move_type
requested_date          date
date_flexible           boolean         NOT NULL DEFAULT false
property_size           property_size

-- Origin address
origin_address          text
origin_city             text
origin_state            text
origin_postal_code      text
origin_country          text            DEFAULT 'US'
origin_floor            smallint        CHECK (origin_floor >= 0 AND origin_floor <= 200)
origin_has_elevator     boolean         NOT NULL DEFAULT false
origin_has_stairs       boolean         NOT NULL DEFAULT false
origin_parking_notes    text

-- Destination address
dest_address            text
dest_city               text
dest_state              text
dest_postal_code        text
dest_country            text            DEFAULT 'US'
dest_floor              smallint        CHECK (dest_floor >= 0 AND dest_floor <= 200)
dest_has_elevator       boolean         NOT NULL DEFAULT false
dest_has_stairs         boolean         NOT NULL DEFAULT false
dest_parking_notes      text

-- Estimated scope (filled by estimator or AI)
estimated_volume_cuft   numeric(8,2)    CHECK (estimated_volume_cuft > 0)
estimated_distance_miles numeric(8,2)   CHECK (estimated_distance_miles > 0)

-- Lifecycle
status                  lead_status     NOT NULL DEFAULT 'new'
lost_reason             text            -- required when status = 'lost'
converted_at            timestamptz     -- when status became 'booked'

-- AI scoring
ai_score                smallint        CHECK (ai_score >= 0 AND ai_score <= 100)
ai_score_rationale      text
ai_score_computed_at    timestamptz

-- Acquisition
source                  acquisition_source
utm_source              text
utm_medium              text
utm_campaign            text
referrer_url            text

-- Notes
internal_notes          text

-- Soft delete
deleted_at              timestamptz

-- Timestamps
created_at              timestamptz     NOT NULL DEFAULT now()
updated_at              timestamptz     NOT NULL DEFAULT now()
─────────────────────────────────────────────────────────────────
INDEXES:
  idx_leads_company_id            (company_id)
  idx_leads_status                (company_id, status) WHERE deleted_at IS NULL
  idx_leads_assigned_to           (company_id, assigned_to) WHERE deleted_at IS NULL
  idx_leads_customer_id           (customer_id) WHERE customer_id IS NOT NULL
  idx_leads_created_at            (company_id, created_at DESC)
  idx_leads_requested_date        (company_id, requested_date) WHERE deleted_at IS NULL
CONSTRAINTS:
  lost_reason required: CHECK (status != 'lost' OR lost_reason IS NOT NULL)
```

---

### 6.5 `appointments`

Scheduled interactions — surveys, callbacks, site visits — linked to leads or jobs.

```
appointments
─────────────────────────────────────────────────────────────────
id                      uuid            PRIMARY KEY  DEFAULT gen_uuid_v7()
─────────────────────────────────────────────────────────────────
company_id              uuid            NOT NULL REFERENCES companies(id) ON DELETE RESTRICT
lead_id                 uuid            REFERENCES leads(id) ON DELETE SET NULL
customer_id             uuid            REFERENCES customers(id) ON DELETE SET NULL
job_id                  uuid            REFERENCES jobs(id) ON DELETE SET NULL
assigned_to             uuid            REFERENCES profiles(id) ON DELETE SET NULL

-- Type and status
type                    appointment_type    NOT NULL
status                  appointment_status  NOT NULL DEFAULT 'scheduled'

-- Timing
scheduled_at            timestamptz     NOT NULL
duration_minutes        integer         NOT NULL DEFAULT 60 CHECK (duration_minutes > 0)
completed_at            timestamptz

-- Notes
notes                   text
cancellation_reason     text            -- required when status = 'cancelled'

-- Soft delete
deleted_at              timestamptz

-- Timestamps
created_at              timestamptz     NOT NULL DEFAULT now()
updated_at              timestamptz     NOT NULL DEFAULT now()
─────────────────────────────────────────────────────────────────
INDEXES:
  idx_appointments_company_id     (company_id)
  idx_appointments_lead_id        (lead_id) WHERE lead_id IS NOT NULL
  idx_appointments_assigned_to    (company_id, assigned_to, scheduled_at)
  idx_appointments_scheduled_at   (company_id, scheduled_at) WHERE deleted_at IS NULL
CONSTRAINTS:
  at least one parent: CHECK (lead_id IS NOT NULL OR job_id IS NOT NULL OR customer_id IS NOT NULL)
  cancellation_reason required: CHECK (status != 'cancelled' OR cancellation_reason IS NOT NULL)
```

---

### 6.6 `quotes`

The formal price estimate sent to a customer. A quote is the central document of the sales process.

```
quotes
─────────────────────────────────────────────────────────────────
id                      uuid            PRIMARY KEY  DEFAULT gen_uuid_v7()
─────────────────────────────────────────────────────────────────
company_id              uuid            NOT NULL REFERENCES companies(id) ON DELETE RESTRICT
lead_id                 uuid            REFERENCES leads(id) ON DELETE RESTRICT
customer_id             uuid            REFERENCES customers(id) ON DELETE RESTRICT
created_by              uuid            REFERENCES profiles(id) ON DELETE SET NULL

-- Human-readable identifier (QT-2026-001)
quote_number            text            NOT NULL

-- Versioning (revised quotes reference their parent)
version                 integer         NOT NULL DEFAULT 1
parent_quote_id         uuid            REFERENCES quotes(id) ON DELETE SET NULL

-- Lifecycle
status                  quote_status    NOT NULL DEFAULT 'draft'

-- Move snapshot (values at time of quote — do not update if lead changes)
move_type               move_type       NOT NULL
scheduled_date          date
date_flexible           boolean         NOT NULL DEFAULT false
property_size           property_size

-- Origin snapshot
origin_address          text
origin_city             text
origin_state            text
origin_postal_code      text
origin_country          text
origin_floor            smallint
origin_has_elevator     boolean         NOT NULL DEFAULT false
origin_has_stairs       boolean         NOT NULL DEFAULT false

-- Destination snapshot
dest_address            text
dest_city               text
dest_state              text
dest_postal_code        text
dest_country            text
dest_floor              smallint
dest_has_elevator       boolean         NOT NULL DEFAULT false
dest_has_stairs         boolean         NOT NULL DEFAULT false

-- Estimated scope
distance_miles          numeric(8,2)
estimated_hours         numeric(4,2)

-- Pricing (all in cents)
subtotal_cents          integer         NOT NULL DEFAULT 0 CHECK (subtotal_cents >= 0)
discount_cents          integer         NOT NULL DEFAULT 0 CHECK (discount_cents >= 0)
discount_reason         text
tax_rate_percent        numeric(5,2)    NOT NULL DEFAULT 0 CHECK (tax_rate_percent >= 0)
tax_cents               integer         NOT NULL DEFAULT 0 CHECK (tax_cents >= 0)
total_amount_cents      integer         NOT NULL DEFAULT 0 CHECK (total_amount_cents >= 0)
deposit_percent         numeric(5,2)    NOT NULL DEFAULT 20 CHECK (deposit_percent >= 0 AND deposit_percent <= 100)
deposit_amount_cents    integer         NOT NULL DEFAULT 0 CHECK (deposit_amount_cents >= 0)

-- AI generation metadata
ai_generated            boolean         NOT NULL DEFAULT false
ai_confidence           smallint        CHECK (ai_confidence >= 0 AND ai_confidence <= 100)
ai_log_id               uuid            REFERENCES ai_logs(id) ON DELETE SET NULL

-- Communication tracking
sent_at                 timestamptz
viewed_at               timestamptz
view_count              integer         NOT NULL DEFAULT 0
accepted_at             timestamptz
declined_at             timestamptz
declined_reason         text
expires_at              timestamptz

-- Customer portal
portal_token            text            UNIQUE
portal_token_expires_at timestamptz

-- Agreement
terms_accepted          boolean         NOT NULL DEFAULT false
terms_accepted_at       timestamptz
signature_url           text            -- Supabase Storage path to signed agreement PDF

-- Notes
customer_notes          text            -- visible in portal
internal_notes          text            -- internal only

-- Soft delete
deleted_at              timestamptz

-- Timestamps
created_at              timestamptz     NOT NULL DEFAULT now()
updated_at              timestamptz     NOT NULL DEFAULT now()
─────────────────────────────────────────────────────────────────
INDEXES:
  idx_quotes_company_id           (company_id)
  idx_quotes_lead_id              (lead_id) WHERE lead_id IS NOT NULL
  idx_quotes_customer_id          (customer_id) WHERE customer_id IS NOT NULL
  idx_quotes_status               (company_id, status) WHERE deleted_at IS NULL
  idx_quotes_portal_token         (portal_token) WHERE portal_token IS NOT NULL
  idx_quotes_created_at           (company_id, created_at DESC)
  idx_quotes_scheduled_date       (company_id, scheduled_date) WHERE deleted_at IS NULL
CONSTRAINTS:
  UNIQUE(company_id, quote_number)
  accepted_at set: CHECK (status != 'accepted' OR accepted_at IS NOT NULL)
  declined_reason required: CHECK (status != 'declined' OR declined_reason IS NOT NULL)
```

---

### 6.7 `quote_items`

Line items on a quote. No independent existence — they belong to the quote and are cascade-deleted with it.

Every line item supports cost tracking, margin, VAT, per-item discounts, and separate internal and customer-facing notes.

```
quote_items
─────────────────────────────────────────────────────────────────
id                      uuid            PRIMARY KEY  DEFAULT gen_uuid_v7()
─────────────────────────────────────────────────────────────────
company_id              uuid            NOT NULL REFERENCES companies(id) ON DELETE RESTRICT
quote_id                uuid            NOT NULL REFERENCES quotes(id) ON DELETE CASCADE
service_catalog_id      uuid            REFERENCES service_catalog(id) ON DELETE SET NULL
-- service_catalog_id: null = free-text custom line item not from catalog

-- Item definition
item_type               line_item_type  NOT NULL
name                    text            NOT NULL   -- service name shown to customer
description             text                       -- optional description shown on PDF

-- Pricing mode
pricing_mode            pricing_mode    NOT NULL DEFAULT 'quantity'

-- Quantity and sell price
quantity                numeric(8,2)    NOT NULL DEFAULT 1 CHECK (quantity != 0)
unit                    text            -- 'hours', 'items', 'miles', 'km', 'm³', 'days', etc.
unit_price_cents        integer         NOT NULL   -- sell price per unit (charged to customer)

-- Cost tracking (internal — not shown to customers)
cost_price_cents        integer         NOT NULL DEFAULT 0 CHECK (cost_price_cents >= 0)
-- cost per unit; defaults to 0 if company doesn't track costs

-- Discount
discount_type           discount_type   -- null = no discount
discount_value          numeric(10,4)   -- the percent (e.g., 10.0) or fixed cents (e.g., 5000)
discount_amount_cents   integer         NOT NULL DEFAULT 0 CHECK (discount_amount_cents >= 0)
-- discount_amount_cents is computed and stored to avoid recalculation

-- Totals (computed and stored for performance and snapshots)
subtotal_cents          integer         NOT NULL DEFAULT 0
-- subtotal_cents = unit_price_cents × quantity (before discount)
net_total_cents         integer         NOT NULL DEFAULT 0
-- net_total_cents = subtotal_cents - discount_amount_cents

-- VAT
vat_rate_percent        numeric(5,2)    NOT NULL DEFAULT 0 CHECK (vat_rate_percent >= 0 AND vat_rate_percent <= 100)
vat_amount_cents        integer         NOT NULL DEFAULT 0 CHECK (vat_amount_cents >= 0)
-- vat_amount_cents = net_total_cents × vat_rate_percent / 100

-- Gross total (what customer pays for this line)
gross_total_cents       integer         NOT NULL DEFAULT 0
-- gross_total_cents = net_total_cents + vat_amount_cents

-- Notes
internal_notes          text            -- visible to office users only; never shown on PDF
customer_notes          text            -- shown to customer on quote PDF

-- Display
sort_order              integer         NOT NULL DEFAULT 0

-- Timestamps (no soft delete — deleted with parent quote)
created_at              timestamptz     NOT NULL DEFAULT now()
updated_at              timestamptz     NOT NULL DEFAULT now()
─────────────────────────────────────────────────────────────────
INDEXES:
  idx_quote_items_quote_id        (quote_id)
  idx_quote_items_company_id      (company_id)
CONSTRAINTS:
  discount_value NOT NULL when discount_type IS NOT NULL
  subtotal_cents = unit_price_cents × quantity (enforced by trigger)
  gross_total_cents = net_total_cents + vat_amount_cents (enforced by trigger)
  cost_price_cents may be 0 if company does not track internal costs
```

**On computed totals:** The formula chain is enforced by a BEFORE INSERT/UPDATE trigger to guarantee consistency:
```
subtotal = unit_price × quantity
discount_amount = IF discount_type='percent': subtotal × discount_value/100
                  IF discount_type='fixed': discount_value
net_total = subtotal - discount_amount
vat_amount = net_total × vat_rate_percent / 100
gross_total = net_total + vat_amount
```

**On margin:** Margin is not stored — it is computed on read by the application:
```
margin_percent = (unit_price_cents - cost_price_cents) / unit_price_cents × 100
```
Storing a computed margin would create a three-way consistency problem (cost, price, margin). The application computes it on read for users with `quotes.view_cost_price`.

**On cost visibility:** `cost_price_cents` is stored in plain sight in the database (RLS cannot hide individual columns). Access control is enforced at the application layer: tRPC procedures omit `cost_price_cents` and `internal_notes` from responses for users without `quotes.view_cost_price`.

---

### 6.8 `quote_versions`

Immutable snapshots of a quote at each version. Enables full audit trail and future comparison views.

```
quote_versions
─────────────────────────────────────────────────────────────────
id                      uuid            PRIMARY KEY  DEFAULT gen_uuid_v7()
─────────────────────────────────────────────────────────────────
company_id              uuid            NOT NULL REFERENCES companies(id) ON DELETE RESTRICT
quote_id                uuid            NOT NULL REFERENCES quotes(id) ON DELETE CASCADE
version                 integer         NOT NULL
created_by              uuid            REFERENCES profiles(id) ON DELETE SET NULL

-- Complete snapshot of quote + items at this version
snapshot                jsonb           NOT NULL
total_amount_cents      integer         NOT NULL

-- What changed (human-written or AI-summarized)
change_summary          text

-- Append-only: no updated_at, no deleted_at
created_at              timestamptz     NOT NULL DEFAULT now()
─────────────────────────────────────────────────────────────────
INDEXES:
  idx_quote_versions_quote_id     (quote_id)
CONSTRAINTS:
  UNIQUE(quote_id, version)
```

---

### 6.9 `jobs`

The operational record of a confirmed and booked move. Created when a quote is accepted and a deposit is paid.

```
jobs
─────────────────────────────────────────────────────────────────
id                      uuid            PRIMARY KEY  DEFAULT gen_uuid_v7()
─────────────────────────────────────────────────────────────────
company_id              uuid            NOT NULL REFERENCES companies(id) ON DELETE RESTRICT
quote_id                uuid            REFERENCES quotes(id) ON DELETE RESTRICT
customer_id             uuid            NOT NULL REFERENCES customers(id) ON DELETE RESTRICT
created_by              uuid            REFERENCES profiles(id) ON DELETE SET NULL

-- Human-readable identifier (JB-2026-001)
job_number              text            NOT NULL

-- Lifecycle
status                  job_status      NOT NULL DEFAULT 'scheduled'

-- Move details
move_type               move_type       NOT NULL

-- Scheduling
scheduled_date          date            NOT NULL
scheduled_start_time    time
estimated_duration_hours numeric(4,2)   CHECK (estimated_duration_hours > 0)

-- Actual timing (recorded as it happens)
actual_start_at         timestamptz
actual_end_at           timestamptz

-- Origin (confirmed address for the job)
origin_address          text            NOT NULL
origin_city             text            NOT NULL
origin_state            text
origin_postal_code      text
origin_country          text            NOT NULL DEFAULT 'US'
origin_floor            smallint        CHECK (origin_floor >= 0)
origin_has_elevator     boolean         NOT NULL DEFAULT false
origin_has_stairs       boolean         NOT NULL DEFAULT false
origin_parking_notes    text
origin_access_notes     text

-- Destination
dest_address            text            NOT NULL
dest_city               text            NOT NULL
dest_state              text
dest_postal_code        text
dest_country            text            NOT NULL DEFAULT 'US'
dest_floor              smallint        CHECK (dest_floor >= 0)
dest_has_elevator       boolean         NOT NULL DEFAULT false
dest_has_stairs         boolean         NOT NULL DEFAULT false
dest_parking_notes      text
dest_access_notes       text

-- Distance
distance_miles          numeric(8,2)    CHECK (distance_miles > 0)

-- Crew requirements
crew_size_required      smallint        NOT NULL DEFAULT 2 CHECK (crew_size_required > 0)

-- Financial (snapshot from accepted quote)
total_amount_cents      integer         NOT NULL DEFAULT 0 CHECK (total_amount_cents >= 0)
deposit_amount_cents    integer         NOT NULL DEFAULT 0 CHECK (deposit_amount_cents >= 0)
deposit_paid_at         timestamptz

-- Completion
completion_notes        text
customer_signature_url  text            -- Supabase Storage path

-- Cancellation
cancelled_at            timestamptz
cancellation_reason     text
cancelled_by            uuid            REFERENCES profiles(id) ON DELETE SET NULL

-- Notes
internal_notes          text
customer_notes          text            -- visible to customer
special_instructions    text

-- Soft delete
deleted_at              timestamptz

-- Timestamps
created_at              timestamptz     NOT NULL DEFAULT now()
updated_at              timestamptz     NOT NULL DEFAULT now()
─────────────────────────────────────────────────────────────────
INDEXES:
  idx_jobs_company_id             (company_id)
  idx_jobs_customer_id            (customer_id)
  idx_jobs_status                 (company_id, status) WHERE deleted_at IS NULL
  idx_jobs_scheduled_date         (company_id, scheduled_date) WHERE deleted_at IS NULL
  idx_jobs_quote_id               (quote_id) WHERE quote_id IS NOT NULL
  idx_jobs_created_at             (company_id, created_at DESC)
CONSTRAINTS:
  UNIQUE(company_id, job_number)
  cancellation_reason required: CHECK (status != 'cancelled' OR cancellation_reason IS NOT NULL)
  cancelled_at set: CHECK (status != 'cancelled' OR cancelled_at IS NOT NULL)
```

---

### 6.10 `job_assignments`

Which employees (planning records) and which vehicle are assigned to a job. V1: planning only — employees do not log in or update this.

```
job_assignments
─────────────────────────────────────────────────────────────────
id                      uuid            PRIMARY KEY  DEFAULT gen_uuid_v7()
─────────────────────────────────────────────────────────────────
company_id              uuid            NOT NULL REFERENCES companies(id) ON DELETE RESTRICT
job_id                  uuid            NOT NULL REFERENCES jobs(id) ON DELETE CASCADE
employee_id             uuid            NOT NULL REFERENCES employees(id) ON DELETE RESTRICT
vehicle_id              uuid            REFERENCES vehicles(id) ON DELETE SET NULL

-- Role on this specific job
role                    assignment_role NOT NULL DEFAULT 'mover'

-- Who made this assignment
assigned_by             uuid            REFERENCES profiles(id) ON DELETE SET NULL
assigned_at             timestamptz     NOT NULL DEFAULT now()

-- Notes
notes                   text

-- Timestamps (no soft delete — managed via job lifecycle)
created_at              timestamptz     NOT NULL DEFAULT now()
updated_at              timestamptz     NOT NULL DEFAULT now()
─────────────────────────────────────────────────────────────────
INDEXES:
  idx_job_assignments_job_id      (job_id)
  idx_job_assignments_employee_id (employee_id)
  idx_job_assignments_company_id  (company_id)
CONSTRAINTS:
  UNIQUE(job_id, employee_id)  -- one assignment per employee per job
  Only one lead per job: UNIQUE(job_id, role) WHERE role = 'lead'
```

---

### 6.11 `employees`

Moving company employees and crew members as **planning records only**. V1: these records do not have login accounts. They are used for job assignment and planning purposes.

```
employees
─────────────────────────────────────────────────────────────────
id                      uuid            PRIMARY KEY  DEFAULT gen_uuid_v7()
─────────────────────────────────────────────────────────────────
company_id              uuid            NOT NULL REFERENCES companies(id) ON DELETE RESTRICT

-- Identity
first_name              text            NOT NULL
last_name               text            NOT NULL
email                   text
phone                   text

-- Role and status
role                    employee_role   NOT NULL DEFAULT 'mover'
status                  employee_status NOT NULL DEFAULT 'active'

-- Employment
employment_type         text            CHECK (employment_type IN ('full_time','part_time','contractor'))
hourly_rate_cents       integer         CHECK (hourly_rate_cents >= 0)

-- Driver qualifications
driver_license_class    text
driver_license_expiry   date

-- Skills and notes
skills                  text[]          DEFAULT '{}'
notes                   text

-- V2+ link: when employees get login accounts
profile_id              uuid            REFERENCES profiles(id) ON DELETE SET NULL

-- Soft delete
deleted_at              timestamptz

-- Timestamps
created_at              timestamptz     NOT NULL DEFAULT now()
updated_at              timestamptz     NOT NULL DEFAULT now()
─────────────────────────────────────────────────────────────────
INDEXES:
  idx_employees_company_id        (company_id)
  idx_employees_status            (company_id, status) WHERE deleted_at IS NULL
  idx_employees_role              (company_id, role) WHERE deleted_at IS NULL
```

---

### 6.12 `vehicles`

Company fleet vehicles.

```
vehicles
─────────────────────────────────────────────────────────────────
id                      uuid            PRIMARY KEY  DEFAULT gen_uuid_v7()
─────────────────────────────────────────────────────────────────
company_id              uuid            NOT NULL REFERENCES companies(id) ON DELETE RESTRICT

-- Identity
name                    text            NOT NULL  -- "Truck 1", "16ft Box Truck - Blue"
type                    vehicle_type    NOT NULL

-- Specifications
make                    text
model                   text
year                    smallint        CHECK (year >= 1980 AND year <= 2100)
color                   text
license_plate           text
vin                     text

-- Capacity
capacity_cuft           integer         CHECK (capacity_cuft > 0)
max_weight_lbs          integer         CHECK (max_weight_lbs > 0)

-- Status
status                  vehicle_status  NOT NULL DEFAULT 'available'

-- Compliance
insurance_policy_number text
insurance_expiry        date
registration_expiry     date

-- Notes
notes                   text

-- Soft delete
deleted_at              timestamptz

-- Timestamps
created_at              timestamptz     NOT NULL DEFAULT now()
updated_at              timestamptz     NOT NULL DEFAULT now()
─────────────────────────────────────────────────────────────────
INDEXES:
  idx_vehicles_company_id         (company_id)
  idx_vehicles_status             (company_id, status) WHERE deleted_at IS NULL
```

---

### 6.13 `invoices`

Formal billing documents generated at or after job completion. An invoice is linked to a job and a customer.

```
invoices
─────────────────────────────────────────────────────────────────
id                      uuid            PRIMARY KEY  DEFAULT gen_uuid_v7()
─────────────────────────────────────────────────────────────────
company_id              uuid            NOT NULL REFERENCES companies(id) ON DELETE RESTRICT
job_id                  uuid            NOT NULL REFERENCES jobs(id) ON DELETE RESTRICT
customer_id             uuid            NOT NULL REFERENCES customers(id) ON DELETE RESTRICT
created_by              uuid            REFERENCES profiles(id) ON DELETE SET NULL

-- Human-readable identifier (INV-2026-001)
invoice_number          text            NOT NULL

-- Lifecycle
status                  invoice_status  NOT NULL DEFAULT 'draft'

-- Amounts (all in cents)
subtotal_cents          integer         NOT NULL DEFAULT 0 CHECK (subtotal_cents >= 0)
discount_cents          integer         NOT NULL DEFAULT 0 CHECK (discount_cents >= 0)
tax_cents               integer         NOT NULL DEFAULT 0 CHECK (tax_cents >= 0)
total_amount_cents      integer         NOT NULL DEFAULT 0 CHECK (total_amount_cents >= 0)
deposit_applied_cents   integer         NOT NULL DEFAULT 0 CHECK (deposit_applied_cents >= 0)
amount_paid_cents       integer         NOT NULL DEFAULT 0 CHECK (amount_paid_cents >= 0)
balance_due_cents       integer GENERATED ALWAYS AS
                          (total_amount_cents - deposit_applied_cents - amount_paid_cents)
                          STORED

-- Dates
issued_at               timestamptz
due_at                  timestamptz
paid_at                 timestamptz

-- Communication tracking
sent_at                 timestamptz
viewed_at               timestamptz
view_count              integer         NOT NULL DEFAULT 0

-- Stripe (for online payment)
stripe_payment_intent_id text
stripe_invoice_id        text

-- Customer portal
portal_token            text            UNIQUE
portal_token_expires_at timestamptz

-- Notes
notes                   text            -- visible to customer
internal_notes          text

-- Soft delete
deleted_at              timestamptz

-- Timestamps
created_at              timestamptz     NOT NULL DEFAULT now()
updated_at              timestamptz     NOT NULL DEFAULT now()
─────────────────────────────────────────────────────────────────
INDEXES:
  idx_invoices_company_id         (company_id)
  idx_invoices_job_id             (job_id)
  idx_invoices_customer_id        (customer_id)
  idx_invoices_status             (company_id, status) WHERE deleted_at IS NULL
  idx_invoices_portal_token       (portal_token) WHERE portal_token IS NOT NULL
  idx_invoices_due_at             (company_id, due_at) WHERE deleted_at IS NULL
CONSTRAINTS:
  UNIQUE(company_id, invoice_number)
  balance_due_cents >= 0 (ensured by generated column and proper payment recording)
```

---

### 6.14 `invoice_items`

Line items on an invoice. Copied from quote items at job completion with option to modify.

```
invoice_items
─────────────────────────────────────────────────────────────────
id                      uuid            PRIMARY KEY  DEFAULT gen_uuid_v7()
─────────────────────────────────────────────────────────────────
company_id              uuid            NOT NULL REFERENCES companies(id) ON DELETE RESTRICT
invoice_id              uuid            NOT NULL REFERENCES invoices(id) ON DELETE CASCADE
quote_item_id           uuid            REFERENCES quote_items(id) ON DELETE SET NULL

-- Item definition (copied from quote, editable)
item_type               line_item_type  NOT NULL
name                    text            NOT NULL
description             text
quantity                numeric(8,2)    NOT NULL DEFAULT 1 CHECK (quantity != 0)
unit                    text
unit_price_cents        integer         NOT NULL
total_price_cents       integer         NOT NULL

-- Display
sort_order              integer         NOT NULL DEFAULT 0

-- Timestamps
created_at              timestamptz     NOT NULL DEFAULT now()
updated_at              timestamptz     NOT NULL DEFAULT now()
─────────────────────────────────────────────────────────────────
INDEXES:
  idx_invoice_items_invoice_id    (invoice_id)
```

---

### 6.15 `payments`

Every payment event — deposit, balance, manual, Stripe — is recorded as a payment row. This is the complete financial transaction log.

```
payments
─────────────────────────────────────────────────────────────────
id                      uuid            PRIMARY KEY  DEFAULT gen_uuid_v7()
─────────────────────────────────────────────────────────────────
company_id              uuid            NOT NULL REFERENCES companies(id) ON DELETE RESTRICT
job_id                  uuid            NOT NULL REFERENCES jobs(id) ON DELETE RESTRICT
invoice_id              uuid            REFERENCES invoices(id) ON DELETE SET NULL
customer_id             uuid            NOT NULL REFERENCES customers(id) ON DELETE RESTRICT
recorded_by             uuid            REFERENCES profiles(id) ON DELETE SET NULL
-- recorded_by = NULL means online payment (processed automatically)

-- Classification
payment_type            payment_type    NOT NULL
method                  payment_method  NOT NULL
status                  payment_status  NOT NULL DEFAULT 'pending'

-- Amount
amount_cents            integer         NOT NULL CHECK (amount_cents != 0)
-- positive = money received, negative = refund
currency                text            NOT NULL DEFAULT 'USD'

-- Manual payment reference
reference_number        text            -- check number, cash receipt reference
notes                   text

-- Stripe fields (populated for online payments)
stripe_payment_intent_id    text        UNIQUE
stripe_charge_id            text
stripe_refund_id            text

-- Timing
paid_at                 timestamptz

-- Soft delete (rare — prefer adjustment entries for corrections)
deleted_at              timestamptz

-- Timestamps
created_at              timestamptz     NOT NULL DEFAULT now()
updated_at              timestamptz     NOT NULL DEFAULT now()
─────────────────────────────────────────────────────────────────
INDEXES:
  idx_payments_company_id         (company_id)
  idx_payments_job_id             (job_id)
  idx_payments_invoice_id         (invoice_id) WHERE invoice_id IS NOT NULL
  idx_payments_customer_id        (customer_id)
  idx_payments_status             (company_id, status)
  idx_payments_stripe_intent      (stripe_payment_intent_id) WHERE stripe_payment_intent_id IS NOT NULL
  idx_payments_paid_at            (company_id, paid_at DESC) WHERE paid_at IS NOT NULL
```

---

### 6.16 `documents`

Storage references for all files in the system. Every PDF, photo, and uploaded document creates one row here.

Described in detail in [Section 14](#14-document-storage-model).

---

### 6.17 `tasks`

Internal action items and follow-up reminders for office staff.

```
tasks
─────────────────────────────────────────────────────────────────
id                      uuid            PRIMARY KEY  DEFAULT gen_uuid_v7()
─────────────────────────────────────────────────────────────────
company_id              uuid            NOT NULL REFERENCES companies(id) ON DELETE RESTRICT
created_by              uuid            REFERENCES profiles(id) ON DELETE SET NULL
assigned_to             uuid            REFERENCES profiles(id) ON DELETE SET NULL

-- Context (what this task relates to)
entity_type             text            CHECK (entity_type IN ('lead','quote','job','customer','invoice'))
entity_id               uuid

-- Task details
title                   text            NOT NULL
description             text
status                  task_status     NOT NULL DEFAULT 'open'
priority                task_priority   NOT NULL DEFAULT 'medium'

-- Timing
due_at                  timestamptz
completed_at            timestamptz
completed_by            uuid            REFERENCES profiles(id) ON DELETE SET NULL

-- Soft delete
deleted_at              timestamptz

-- Timestamps
created_at              timestamptz     NOT NULL DEFAULT now()
updated_at              timestamptz     NOT NULL DEFAULT now()
─────────────────────────────────────────────────────────────────
INDEXES:
  idx_tasks_company_id            (company_id)
  idx_tasks_assigned_to           (company_id, assigned_to, status) WHERE deleted_at IS NULL
  idx_tasks_entity                (entity_type, entity_id) WHERE entity_id IS NOT NULL
  idx_tasks_due_at                (company_id, due_at) WHERE deleted_at IS NULL AND status != 'completed'
```

---

### 6.18 `email_logs`

Described in detail in [Section 16](#16-email-log-model).

---

### 6.19 `ai_logs`

Described in detail in [Section 17](#17-ai-log-model).

---

### 6.20 `activity_logs`

Described in detail in [Section 13](#13-audit-log-design).

---

### 6.21 `notifications`

In-app notifications powered by Supabase Realtime. When a row is inserted, Supabase broadcasts it to the subscribed user.

```
notifications
─────────────────────────────────────────────────────────────────
id                      uuid            PRIMARY KEY  DEFAULT gen_uuid_v7()
─────────────────────────────────────────────────────────────────
company_id              uuid            NOT NULL REFERENCES companies(id) ON DELETE CASCADE
user_id                 uuid            NOT NULL REFERENCES profiles(id) ON DELETE CASCADE

-- Type (maps to a notification template in the application)
type                    text            NOT NULL  -- e.g., "quote.viewed", "job.late", "payment.received"

-- Display content
title                   text            NOT NULL
body                    text            NOT NULL

-- Deep link
entity_type             text
entity_id               uuid
action_url              text

-- Read state
read_at                 timestamptz

-- Append-only: no deleted_at, no updated_at
created_at              timestamptz     NOT NULL DEFAULT now()
─────────────────────────────────────────────────────────────────
INDEXES:
  idx_notifications_user_id       (user_id, created_at DESC) WHERE read_at IS NULL
  idx_notifications_company_id    (company_id)
```

---

### 6.22 `domain_events`

The event bus backbone. All domain state changes produce an event row. V1: Supabase DB webhooks dispatch these. V2+: Inngest consumes them.

Described in detail in [Section 20](#20-domain-events-table).

---

### 6.23 `company_settings`

Structured configuration for each company. One row per company (1:1 with `companies`).

```
company_settings
─────────────────────────────────────────────────────────────────
id                      uuid            PRIMARY KEY  DEFAULT gen_uuid_v7()
company_id              uuid            NOT NULL UNIQUE REFERENCES companies(id) ON DELETE CASCADE
─────────────────────────────────────────────────────────────────
-- Rate configuration (base rates)
local_rate_per_hour_cents       integer DEFAULT 0 CHECK (local_rate_per_hour_cents >= 0)
long_distance_rate_per_mile_cents integer DEFAULT 0 CHECK (long_distance_rate_per_mile_cents >= 0)
minimum_charge_cents            integer DEFAULT 0 CHECK (minimum_charge_cents >= 0)
minimum_hours                   numeric(4,2) DEFAULT 2

-- Surcharges
fuel_surcharge_percent          numeric(5,2) DEFAULT 0 CHECK (fuel_surcharge_percent >= 0)
stair_carry_rate_cents          integer DEFAULT 0  -- per flight
long_carry_rate_cents           integer DEFAULT 0  -- per 50ft beyond threshold
elevator_wait_rate_cents        integer DEFAULT 0  -- per hour

-- Quote defaults
default_deposit_percent         numeric(5,2) DEFAULT 20
default_quote_expiry_days       integer DEFAULT 30 CHECK (default_quote_expiry_days > 0)
quote_footer_text               text  -- shown on quote PDFs

-- Invoice defaults
default_payment_terms_days      integer DEFAULT 7 CHECK (default_payment_terms_days >= 0)
invoice_footer_text             text

-- Tax
tax_enabled                     boolean DEFAULT false
tax_rate_percent                numeric(5,2) DEFAULT 0 CHECK (tax_rate_percent >= 0 AND tax_rate_percent <= 100)
tax_label                       text DEFAULT 'Tax'  -- "GST", "VAT", "Sales Tax"

-- Notification preferences
alert_email                     text  -- for system alerts (different from company.email)

-- Terms and conditions
service_agreement_text          text  -- custom terms shown on quotes

-- Timestamps
created_at              timestamptz     NOT NULL DEFAULT now()
updated_at              timestamptz     NOT NULL DEFAULT now()
```

---

### 6.24 Permission Tables

The four permission tables together implement the configurable permission system for the `office` role.

#### `permission_definitions`

The canonical registry of every permission string that exists in Bivro. This table is populated by migrations — not by operators. It is a reference table that ensures the application and the database share the same permission vocabulary.

```
permission_definitions
─────────────────────────────────────────────────────────────────
key                     text            PRIMARY KEY
-- e.g., 'quotes.view', 'quotes.change_pricing', 'analytics.view_financial'
resource                text            NOT NULL  -- e.g., 'quotes', 'analytics'
action                  text            NOT NULL  -- e.g., 'view', 'change_pricing'
description             text            NOT NULL  -- human-readable description
is_sensitive            boolean         NOT NULL DEFAULT false
-- sensitive = true means this permission is hidden from non-Owner permission assignment UI
-- e.g., 'quotes.view_cost_price', 'analytics.view_financial'

created_at              timestamptz     NOT NULL DEFAULT now()
─────────────────────────────────────────────────────────────────
No company_id — this is a system-level reference table, not tenant-scoped.
No RLS — this table is read-only by all authenticated users.
```

#### `permission_groups`

Named groups of permissions created by the Owner for their company. An Owner can create as many groups as they need (e.g., "Dispatcher," "Estimator," "Finance," "Office Manager").

```
permission_groups
─────────────────────────────────────────────────────────────────
id                      uuid            PRIMARY KEY  DEFAULT gen_uuid_v7()
─────────────────────────────────────────────────────────────────
company_id              uuid            NOT NULL REFERENCES companies(id) ON DELETE CASCADE
name                    text            NOT NULL     -- e.g., "Dispatcher"
description             text
color                   text            -- UI label color (hex code)
is_default              boolean         NOT NULL DEFAULT false
-- is_default = true: new Office users get this group automatically on invite

deleted_at              timestamptz
created_at              timestamptz     NOT NULL DEFAULT now()
updated_at              timestamptz     NOT NULL DEFAULT now()
─────────────────────────────────────────────────────────────────
INDEXES:
  idx_permission_groups_company_id  (company_id) WHERE deleted_at IS NULL
CONSTRAINTS:
  UNIQUE(company_id, name) WHERE deleted_at IS NULL
```

#### `permission_group_assignments`

Which permission strings are granted by each permission group.

```
permission_group_assignments
─────────────────────────────────────────────────────────────────
id                      uuid            PRIMARY KEY  DEFAULT gen_uuid_v7()
─────────────────────────────────────────────────────────────────
company_id              uuid            NOT NULL REFERENCES companies(id) ON DELETE CASCADE
group_id                uuid            NOT NULL REFERENCES permission_groups(id) ON DELETE CASCADE
permission_key          text            NOT NULL REFERENCES permission_definitions(key) ON DELETE CASCADE

created_by              uuid            REFERENCES profiles(id) ON DELETE SET NULL
created_at              timestamptz     NOT NULL DEFAULT now()
─────────────────────────────────────────────────────────────────
INDEXES:
  idx_pga_group_id               (group_id)
  idx_pga_company_id             (company_id)
CONSTRAINTS:
  UNIQUE(group_id, permission_key)
-- No updated_at — append-only; changes are delete + insert
```

#### `user_permission_groups`

Which permission groups an Office user belongs to.

```
user_permission_groups
─────────────────────────────────────────────────────────────────
id                      uuid            PRIMARY KEY  DEFAULT gen_uuid_v7()
─────────────────────────────────────────────────────────────────
company_id              uuid            NOT NULL REFERENCES companies(id) ON DELETE CASCADE
user_id                 uuid            NOT NULL REFERENCES profiles(id) ON DELETE CASCADE
group_id                uuid            NOT NULL REFERENCES permission_groups(id) ON DELETE CASCADE

assigned_by             uuid            REFERENCES profiles(id) ON DELETE SET NULL
assigned_at             timestamptz     NOT NULL DEFAULT now()
─────────────────────────────────────────────────────────────────
INDEXES:
  idx_upg_user_id                (user_id)
  idx_upg_company_id             (company_id)
CONSTRAINTS:
  UNIQUE(user_id, group_id)
```

#### `user_permission_overrides`

Individual permission grants or denials that apply to a specific user on top of their group assignments. An explicit `deny` here overrides any `grant` from a group.

```
user_permission_overrides
─────────────────────────────────────────────────────────────────
id                      uuid            PRIMARY KEY  DEFAULT gen_uuid_v7()
─────────────────────────────────────────────────────────────────
company_id              uuid            NOT NULL REFERENCES companies(id) ON DELETE CASCADE
user_id                 uuid            NOT NULL REFERENCES profiles(id) ON DELETE CASCADE
permission_key          text            NOT NULL REFERENCES permission_definitions(key) ON DELETE CASCADE
override_type           permission_override_type  NOT NULL  -- 'grant' or 'deny'

reason                  text            -- why this override was set
set_by                  uuid            REFERENCES profiles(id) ON DELETE SET NULL
set_at                  timestamptz     NOT NULL DEFAULT now()

-- These overrides are set and then replaced; treat as an event log
-- To remove an override: delete the row; the group-level permission applies again
created_at              timestamptz     NOT NULL DEFAULT now()
─────────────────────────────────────────────────────────────────
INDEXES:
  idx_upo_user_id                (user_id)
  idx_upo_company_id             (company_id)
CONSTRAINTS:
  UNIQUE(user_id, permission_key)
```

**Permission resolution algorithm:**
```
1. Collect all groups for user → union all permission_group_assignments.permission_key
2. Apply user_permission_overrides:
   - 'grant' override: add permission_key to resolved set
   - 'deny' override: remove permission_key from resolved set (even if group grants it)
3. Result: resolved permission set
```

**Audit:** Every change to `permission_groups`, `permission_group_assignments`, `user_permission_groups`, and `user_permission_overrides` is written to `activity_logs`. This is enforced at the service layer.

---

### 6.25 `service_catalog`

The company's service menu — the list of services that can be added as line items to quotes and invoices. Bivro seeds a default catalog at company creation; the company can add, edit, or deactivate entries.

```
service_catalog
─────────────────────────────────────────────────────────────────
id                      uuid            PRIMARY KEY  DEFAULT gen_uuid_v7()
─────────────────────────────────────────────────────────────────
company_id              uuid            NOT NULL REFERENCES companies(id) ON DELETE CASCADE

-- Service identity
name                    text            NOT NULL   -- display name
description             text                       -- default description shown on quote PDF
category                text                       -- grouping for UI: 'labor','transport','materials','specialty','surcharge'

-- Defaults (can be overridden per quote item)
default_pricing_mode    pricing_mode    NOT NULL DEFAULT 'quantity'
default_unit_label      text                       -- 'hours', 'items', 'miles', 'flat', etc.
default_unit_price_cents integer         DEFAULT 0 CHECK (default_unit_price_cents >= 0)
default_cost_price_cents integer         DEFAULT 0 CHECK (default_cost_price_cents >= 0)
default_vat_rate_percent numeric(5,2)   DEFAULT 0 CHECK (default_vat_rate_percent >= 0 AND default_vat_rate_percent <= 100)

-- Status
is_active               boolean         NOT NULL DEFAULT true
is_system_default       boolean         NOT NULL DEFAULT false
-- is_system_default = true: this entry was seeded by Bivro; can be deactivated but not deleted

-- Display
sort_order              integer         NOT NULL DEFAULT 0

-- Timestamps
deleted_at              timestamptz
created_at              timestamptz     NOT NULL DEFAULT now()
updated_at              timestamptz     NOT NULL DEFAULT now()
─────────────────────────────────────────────────────────────────
INDEXES:
  idx_service_catalog_company_id  (company_id, is_active) WHERE deleted_at IS NULL
  idx_service_catalog_category    (company_id, category) WHERE is_active = true AND deleted_at IS NULL
CONSTRAINTS:
  UNIQUE(company_id, name) WHERE deleted_at IS NULL
```

**Seeded default services** — initial onboarding template created for every new company at signup.

This is a versioned onboarding template, not a permanent product invariant. The seed count and content may be updated in future product versions without affecting existing companies (who own their own isolated catalogs). The canonical seed is defined in `PRODUCT_REQUIREMENTS.md §2.2`.

```
#  | Service                              | default_pricing_mode | category
---|--------------------------------------|----------------------|----------
01 | Moving Labor                         | hourly               | labor
02 | Packing Service                      | hourly               | labor
03 | Packing Materials                    | quantity             | materials
04 | Furniture Lift                       | hourly               | labor
05 | Furniture Disassembly                | hourly               | labor
06 | Furniture Assembly                   | hourly               | labor
07 | Disposal / Junk Removal              | fixed                | specialty
08 | Cleaning Service                     | hourly               | labor
09 | Storage (monthly)                    | fixed                | specialty
10 | Long-Distance Transport              | distance             | transport
11 | Piano Moving                         | fixed                | specialty
12 | Safe Moving                          | fixed                | specialty
13 | Crane Service                        | fixed                | specialty
14 | Specialty Items (artwork, antiques)  | manual               | specialty
15 | Fuel Surcharge                       | fixed                | surcharge
16 | Travel Surcharge                     | distance             | surcharge
17 | Long Carry Surcharge                 | fixed                | surcharge
18 | Stair Surcharge                      | fixed                | surcharge
19 | Elevator Wait Surcharge              | hourly               | surcharge
```

All 19 seeded services have `is_system_default = true`. Companies can deactivate them but not delete them.

**Historical snapshot protection:**
`quote_items.name` and all financial fields (`unit_price_cents`, `cost_price_cents`, `discount_*`, `*_total_cents`) are stored as immutable values at quote creation time. `quote_items.service_catalog_id` is a nullable FK with `ON DELETE SET NULL` — if a service is archived, the FK becomes null but the line item's own field values remain exactly as originally quoted. Renaming, repricing, deactivating, or archiving a service catalog entry never retroactively changes any historical quote item or invoice line item.

---

### 6.26 `ai_quote_recommendations`

When the AI generates a quote estimate, it produces operational recommendations (crew, vehicles, hours) alongside financial pricing. These recommendations are stored separately from the quote itself — they represent the AI's analysis, not the final operator decision.

```
ai_quote_recommendations
─────────────────────────────────────────────────────────────────
id                      uuid            PRIMARY KEY  DEFAULT gen_uuid_v7()
─────────────────────────────────────────────────────────────────
company_id              uuid            NOT NULL REFERENCES companies(id) ON DELETE CASCADE
quote_id                uuid            NOT NULL REFERENCES quotes(id) ON DELETE CASCADE
ai_log_id               uuid            REFERENCES ai_logs(id) ON DELETE SET NULL

-- Operational recommendations
recommended_crew_size           smallint    -- total number of movers
recommended_lead_count          smallint    -- number of foremen/leads
recommended_mover_count         smallint    -- number of movers (excluding lead)
recommended_vehicle_type        vehicle_type
recommended_vehicle_count       smallint
recommended_vehicle_size_cuft   integer

-- Time estimates (in decimal hours)
estimated_total_hours           numeric(5,2)
estimated_loading_hours         numeric(5,2)
estimated_travel_hours          numeric(5,2)
estimated_unloading_hours       numeric(5,2)
estimated_packing_hours         numeric(5,2)
recommended_buffer_hours        numeric(5,2)

-- Assessment flags
furniture_lift_required         boolean     NOT NULL DEFAULT false
long_carry_required             boolean     NOT NULL DEFAULT false
long_carry_distance_ft          integer     -- estimated distance in feet
stair_count_origin              smallint
stair_count_dest                smallint
packing_materials_required      boolean     NOT NULL DEFAULT false
specialty_items_present         boolean     NOT NULL DEFAULT false
specialty_item_notes            text

-- Financial estimates
estimated_total_price_cents     integer
estimated_cost_cents            integer
estimated_margin_percent        numeric(5,2)

-- AI meta
confidence_score                smallint    CHECK (confidence_score >= 0 AND confidence_score <= 100)
reasoning_summary               text        -- short explanation of why AI made these recommendations

-- Override tracking (what the operator actually did vs. what AI recommended)
operator_crew_size              smallint    -- what operator set; null if accepted AI recommendation
operator_total_hours            numeric(5,2)
operator_overrode_at            timestamptz
overriding_user                 uuid        REFERENCES profiles(id) ON DELETE SET NULL

-- Append-only (recommendations don't change; a new recommendation is created for revised quotes)
created_at              timestamptz     NOT NULL DEFAULT now()
─────────────────────────────────────────────────────────────────
INDEXES:
  idx_ai_quote_recs_quote_id     (quote_id)
  idx_ai_quote_recs_company_id   (company_id)
```

### 6.27 `user_invitations`

Tracks pending, accepted, expired, and revoked invitations for company users. An invitation is created when an Owner invites a new Office user, or when a Platform Admin reissues an Owner invitation. The canonical schema and lifecycle rules are defined in `PLATFORM_ADMIN.md` §11.13.

**Design decisions:**
- The raw invitation token is generated by the application and sent via email. Only its hash is used for database lookup — the raw token is never queried directly and is not stored permanently.
- `permission_group_ids` is a snapshot of the groups assigned at invite time. These are applied when the invite is accepted via the `custom_access_token_hook`. If the Owner changes the groups before acceptance, the invite should be revoked and reissued.
- `invited_by_platform` references `platform_admin_users.id` (a platform-layer table, no FK enforced at DB level to avoid cross-schema coupling). Application layer validates this.
- No soft delete — invitations use a `status` enum. Expired and revoked invitations are retained as an audit trail of onboarding activity.

```
user_invitations
─────────────────────────────────────────────────────────────────
id                      uuid            PRIMARY KEY DEFAULT gen_uuid_v7()
company_id              uuid            NOT NULL REFERENCES companies(id) ON DELETE CASCADE
─────────────────────────────────────────────────────────────────
email                   text            NOT NULL
role                    user_role       NOT NULL    -- 'owner' | 'office'
permission_group_ids    uuid[]          NOT NULL DEFAULT '{}'
  -- Snapshot of Permission Group IDs to assign on acceptance (office users only)

-- Token (lookup is by hash; raw token lives only in the email link)
token_hash              text            NOT NULL UNIQUE
  -- SHA-256 hash of the random URL-safe token sent in the invitation email

-- Invited by (one of the two will be non-null)
invited_by              uuid            REFERENCES profiles(id) ON DELETE SET NULL
  -- Set when an Owner invites an Office user from within the company portal
invited_by_platform     uuid
  -- Set when a Platform Admin reissues an Owner invitation (no FK — cross-schema reference)

-- Status
status                  text            NOT NULL DEFAULT 'pending'
  -- 'pending' | 'accepted' | 'expired' | 'revoked'
  CHECK (status IN ('pending', 'accepted', 'expired', 'revoked'))

-- Timing
expires_at              timestamptz     NOT NULL DEFAULT (now() + INTERVAL '7 days')
accepted_at             timestamptz
accepted_by_auth_uid    uuid
  -- auth.users.id of the user who accepted; set by custom_access_token_hook on first login

-- Revocation (when status = 'revoked')
revoked_at              timestamptz
revoked_by              uuid            REFERENCES profiles(id) ON DELETE SET NULL
revocation_reason       text

created_at              timestamptz     NOT NULL DEFAULT now()
─────────────────────────────────────────────────────────────────
INDEXES:
  idx_invitations_token_hash    ON user_invitations(token_hash) WHERE status = 'pending'
  idx_invitations_company       ON user_invitations(company_id, status)
  idx_invitations_email         ON user_invitations(email) WHERE status = 'pending'

UNIQUE CONSTRAINTS:
  UNIQUE (company_id, email) WHERE status = 'pending'
    -- Only one active invite per email per company at a time

RLS:
  SELECT  company_id = public.auth_company_id() AND role = 'owner'
    -- Only Owners can see the invite list for their company
  INSERT  company_id = public.auth_company_id() AND public.auth_user_role() = 'owner'
    -- Only Owners can create invitations (platform admin uses service_role)
  UPDATE  company_id = public.auth_company_id() AND public.auth_user_role() = 'owner'
    -- Only Owners can revoke invitations
  -- System (service_role): used by custom_access_token_hook to mark 'accepted'

LIFECYCLE RULES:
  1. A nightly Vercel Cron job sets status = 'expired' for all pending invites
     where expires_at < now(). It does not delete them.
  2. Accepting an invite sets: status = 'accepted', accepted_at = now(),
     accepted_by_auth_uid = auth.uid(). Performed by the custom_access_token_hook
     via service_role (bypasses RLS).
  3. Revoking an invite sets: status = 'revoked', revoked_at = now(),
     revoked_by = current user's profile id. Only Owners can revoke.
  4. If an Owner re-invites the same email, the prior pending invite is automatically
     revoked first (application layer enforces this before inserting a new row).

AUDIT:
  Invite creation, acceptance, revocation, and expiry are all recorded in
  activity_logs with entity_type = 'user_invitation' and entity_id = invitation.id.
```

### 6.28 `company_email_domains`

Maps email domains to companies. Used for tenant routing on login: when a user enters their email, the domain portion is looked up here to pre-select the company. Also referenced in `MASTER_BOOTSTRAP.md §17.1` for email-domain → tenant routing. Full spec: `ONBOARDING_ARCHITECTURE.md §9.3`.

```
company_email_domains
─────────────────────────────────────────────────────────────────
id                      uuid            PRIMARY KEY DEFAULT gen_uuid_v7()
company_id              uuid            NOT NULL REFERENCES companies(id) ON DELETE CASCADE
─────────────────────────────────────────────────────────────────
domain                  text            NOT NULL
  -- e.g., 'alpinemoving.com' — lowercase, no leading '@'

is_primary              boolean         NOT NULL DEFAULT false
  -- One primary domain per company (preferred display domain).

verified_at             timestamptz
  -- NULL = unverified (self-declared).
  -- Non-null = verified via DNS TXT record (V2+).
  -- V1: all domains are self-declared.

created_at              timestamptz     NOT NULL DEFAULT now()
─────────────────────────────────────────────────────────────────
CONSTRAINTS:
  domain: format CHECK (domain ~ '^[a-z0-9]([a-z0-9\-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9\-]*[a-z0-9])?)+$')

INDEXES:
  UNIQUE idx_company_email_domains_domain ON company_email_domains(domain)
    -- A domain may be registered to only one company at a time.
  idx_company_email_domains_company ON company_email_domains(company_id)

RLS:
  SELECT  company_id = public.auth_company_id()
  INSERT  company_id = public.auth_company_id() AND public.auth_user_role() = 'owner'
  UPDATE  company_id = public.auth_company_id() AND public.auth_user_role() = 'owner'
  DELETE  company_id = public.auth_company_id() AND public.auth_user_role() = 'owner'
  -- Platform (service_role): unrestricted
  -- Login page domain lookup uses service_role (no JWT available yet at login time)
```

**V1 population:** Added by the Owner in Settings → Company → Email Domains. The domain from the Owner's registration email is NOT auto-populated (to prevent silent exposure of the company's email domain to public routing). The Owner explicitly declares which domains belong to their company.

**V2+ DNS verification:** A DNS TXT verification record will be required before a domain is trusted for tenant routing. V1 relies on admin oversight to prevent malicious domain claiming.

---

## 7. Entity Relationships

```
auth.users
    │ id (1:1)
    ▼
profiles ──────────────────────────── companies
  │ company_id                           │ id (1:many all below)
  │                                      │
  │ (many:many via jobs, leads, etc.)    ├── company_settings (1:1)
                                         │
                                         ├── profiles (1:many)
                                         │     ├── user_permission_groups (1:many)
                                         │     └── user_permission_overrides (1:many)
                                         │
                                         ├── permission_groups (1:many)
                                         │     ├── permission_group_assignments (1:many)
                                         │     └── user_permission_groups (1:many)
                                         │
                                         ├── service_catalog (1:many)
                                         │     └── quote_items.service_catalog_id (many:1)
                                         │
                                         ├── customers (1:many)
                                         │     └── leads (many:1 customer, nullable)
                                         │
                                         ├── leads (1:many)
                                         │     ├── appointments (many:1 lead)
                                         │     └── quotes (many:1 lead)
                                         │
                                         ├── quotes (1:many)
                                         │     ├── quote_items (1:many, cascade)
                                         │     ├── quote_versions (1:many)
                                         │     ├── ai_quote_recommendations (1:many)
                                         │     └── jobs (1:1)
                                         │
                                         ├── jobs (1:many)
                                         │     ├── job_assignments (1:many)
                                         │     ├── invoices (1:1 typically)
                                         │     └── payments (1:many)
                                         │
                                         ├── invoices (1:many)
                                         │     ├── invoice_items (1:many, cascade)
                                         │     └── payments (1:many)
                                         │
                                         ├── employees (1:many)
                                         │     └── job_assignments (1:many)
                                         │
                                         ├── vehicles (1:many)
                                         │     └── job_assignments (1:many)
                                         │
                                         ├── documents (1:many, polymorphic)
                                         ├── tasks (1:many)
                                         ├── notifications (1:many)
                                         ├── email_logs (1:many)
                                         ├── ai_logs (1:many)
                                         ├── activity_logs (1:many)
                                         ├── domain_events (1:many)
                                         └── user_invitations (1:many)
                                               └── profiles.accepted_by (1:1, on acceptance)

permission_definitions (system-level, no company_id)
```

### Key Relationship Rules

**Lead → Customer:** A lead has a nullable `customer_id`. On conversion (when status becomes `booked`), a customer record is created or matched (by email), and `lead.customer_id` is set. The lead is not deleted — it remains as the acquisition record.

**Quote → Job:** One accepted quote produces one job. The quote's `id` is stored on the job. After a job is created, the quote is frozen (no further edits). Quote status becomes `accepted`.

**Job → Invoice:** One job typically has one invoice. Multiple invoices per job are technically permitted (e.g., partial billing, amendment) but rare in V1.

**Invoice → Payments:** One invoice can have many payment rows (deposit payment, balance payment, adjustments). The sum of `payments.amount_cents` where `status = 'completed'` equals `invoices.amount_paid_cents` (maintained by the application).

**Documents (polymorphic):** The `documents` table is polymorphic — `entity_type` + `entity_id` point to any business entity. This is documented and deliberate. A PostgreSQL trigger validates that the referenced entity exists in the correct table for the given `entity_type`.

**Quote items → Service catalog:** `quote_items.service_catalog_id` is nullable. When a service is selected from the catalog, the catalog entry's `id` is referenced. When an operator enters a free-text custom line item (not from the catalog), `service_catalog_id` is NULL. The catalog entry is a source of defaults only — the quote item's name, price, and mode are copied at creation and not updated if the catalog changes (snapshot semantics).

**AI recommendations → Quote:** Each time the AI generates a quote draft, one `ai_quote_recommendations` row is created. If the quote is revised and the AI is triggered again, a new recommendation row is created for the same quote. Only the most recent recommendation is displayed; older ones are retained for the feedback loop.

---

## 8. Status State Machines

### Company Status

Tracks the operational lifecycle of a company (independent of `subscription_status`). Full rules: `ONBOARDING_ARCHITECTURE.md §1`.

```
[registration submitted]
          │
          ▼
pending_email_verification
          │ email confirmed
          ▼
   pending_review ──► rejected (terminal)
          │ Platform Admin approves
          ▼
        active ◄──── suspended
          │               ▲
          ├── suspended ───┘ restore
          │
          └── archived (soft-terminal; Platform Admin can restore → active)
```

**Transition summary:**
- `pending_email_verification → pending_review`: Owner clicks email verification link
- `pending_review → active`: Platform Admin approves (triggers full company provisioning)
- `pending_review → rejected`: Platform Admin rejects
- `active → suspended`: Platform Admin action or 3 failed Stripe payment retries
- `suspended → active`: Platform Admin restores
- `active → archived` / `suspended → archived`: Platform Admin archives (sets `deleted_at`)
- `archived → active`: Platform Admin restores

**Effect on login:** `company_status` is injected into the JWT `app_metadata` by the `custom_access_token_hook`. Next.js middleware routes users to status-specific pages for any non-`active` status. The Supabase Auth session remains valid regardless of company_status; only access to the dashboard is blocked.

### Lead Status

```
                 ┌─────────────────────────────┐
                 │                             │
   new ──► contacted ──► surveyed ──► quoted ──► booked (terminal)
    │          │              │          │
    └──────────┴──────────────┴──────────┴──► lost (terminal)
    
    Any status ──► duplicate (terminal: merged into another lead)
```

**Allowed transitions:**
- `new → contacted, lost, duplicate`
- `contacted → surveyed, quoted, lost, duplicate`
- `surveyed → quoted, lost, duplicate`
- `quoted → booked, lost, duplicate`
- `booked` is terminal (cannot revert)
- `lost` is terminal unless reopened explicitly (admin action)
- `duplicate` is terminal

### Quote Status

```
draft ──► sent ──► viewed ──┬──► accepted (terminal)
  │          │               └──► declined (terminal)
  │          └──────────────────► expired (terminal, by scheduled job)
  └──────────────────────────────► cancelled (terminal)
```

**Rules:**
- Only `draft` quotes can be edited
- `sent` status requires `sent_at` to be set
- `accepted` requires `terms_accepted = true` and `accepted_at` set
- `expired` is set by a scheduled job when `expires_at` passes and status is still `sent` or `viewed`

### Job Status

```
scheduled ──► confirmed ──► in_progress ──► completed (terminal)
     │              │              │
     └──────────────┴──────────────┴──────► cancelled (terminal)
     
     Any active status ──► on_hold (reversible)
     on_hold ──► scheduled | confirmed | cancelled
```

### Invoice Status

```
draft ──► sent ──► viewed ──┬──► partially_paid ──► paid (terminal)
                             └──► paid (terminal)
                             
Any non-terminal ──► overdue (set by scheduled job)
overdue ──► paid (terminal) | write_off (terminal)
Any non-paid ──► void (terminal)
```

### Payment Status

```
pending ──► completed (terminal)
pending ──► failed (terminal)
pending ──► cancelled (terminal)
completed ──► refunded (terminal, when a refund payment row is created)
```

---

## 9. RLS Policy Concepts

### Core Policy Pattern

All tenant-scoped tables use this RLS pattern:

```sql
-- Helper functions (created once in migration 001, public schema)
CREATE OR REPLACE FUNCTION public.auth_company_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT (auth.jwt() -> 'app_metadata' ->> 'company_id')::uuid;
$$;

CREATE OR REPLACE FUNCTION public.auth_user_role()
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT (auth.jwt() -> 'app_metadata' ->> 'role')::text;
$$;
```

### Policy Table

| Table | SELECT | INSERT | UPDATE | DELETE |
|-------|--------|--------|--------|--------|
| companies | own row only | — (created via hook) | own row, owner only | — (never deleted) |
| profiles | same company | — (created via hook) | own row | soft delete, owner only |
| customers | same company | same company | same company | soft delete |
| leads | same company | same company | same company | soft delete |
| appointments | same company | same company | same company | soft delete |
| quotes | same company | same company | same company (draft only) | soft delete |
| quote_items | same company | same company | same company | cascade with quote |
| quote_versions | same company | same company | — (append-only) | — |
| jobs | same company | same company | same company | soft delete |
| job_assignments | same company | same company | same company | none (delete row) |
| employees | same company | same company | same company | soft delete |
| vehicles | same company | same company | same company | soft delete |
| invoices | same company | same company | same company (draft only) | soft delete |
| invoice_items | same company | same company | same company | cascade with invoice |
| payments | same company | same company | same company | soft delete (rare) |
| documents | same company | same company | same company | soft delete |
| tasks | same company | same company | same company | soft delete |
| notifications | own user_id | system only | own (read_at only) | — |
| email_logs | same company | system only | system only | — |
| ai_logs | same company | system only | — | — |
| activity_logs | same company | system only | — | — |
| domain_events | same company | same company | system only (processed_at) | — |
| company_settings | own company | — (created with company) | owner only | — |
| permission_groups | same company | owner only | owner only | owner only (soft delete) |
| permission_group_assignments | same company | owner only | — (delete + insert) | owner only |
| user_permission_groups | same company | owner only | — (delete + insert) | owner only |
| user_permission_overrides | same company | owner only | owner only | owner only |
| service_catalog | same company | same company | owner + `settings.services` | owner only (soft delete) |
| ai_quote_recommendations | same company | system only | owner + office (operator_overrode_at) | — |
| permission_definitions | all authenticated | — | — | — (system read-only) |
| user_invitations | same company, owner only | same company, owner only | same company, owner only (revoke) | — (status-based; no hard delete) |

### Customer Portal Policy

The customer portal accesses specific rows via the `portal_token`. Portal access does not go through Supabase Auth — it uses the service role client with application-level token verification and explicit company + entity ID scoping.

```
Portal request → verify portal_token signature → extract quote_id + company_id + expiry
→ confirm not expired → use service role client scoped to exact quote_id + company_id
→ return only the specific entity (quote or invoice) and its child documents
```

### Role-Based RLS Extension

For tables where Owner has additional permissions over Office:

```sql
-- Example: only owners can change company subscription or access billing
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners can update company" ON companies
  FOR UPDATE USING (public.auth_company_id() = id AND public.auth_user_role() = 'owner');

CREATE POLICY "Office can read company" ON companies
  FOR SELECT USING (public.auth_company_id() = id);
```

---

## 10. Index Strategy

### Indexing Principles

1. **All foreign key columns are indexed.** PostgreSQL does not automatically index FK columns. A missing FK index causes full table scans on joins and cascade operations.

2. **Compound indexes follow query patterns.** The leading column is the most selective filter used in queries. For tenant-scoped queries, the pattern is `(company_id, status)` or `(company_id, scheduled_date)`.

3. **Partial indexes for active records.** Most queries exclude soft-deleted rows. Partial indexes with `WHERE deleted_at IS NULL` are smaller and faster than full indexes.

4. **No index on every column.** Indexes cost write performance and storage. Only columns that appear in WHERE clauses, JOIN conditions, or ORDER BY expressions are indexed.

### Index Catalogue

```sql
-- profiles
CREATE INDEX idx_profiles_company_id ON profiles(company_id);
CREATE UNIQUE INDEX idx_profiles_email_per_company ON profiles(company_id, email) WHERE deleted_at IS NULL;

-- customers
CREATE INDEX idx_customers_company_id ON customers(company_id);
CREATE INDEX idx_customers_email ON customers(company_id, email) WHERE deleted_at IS NULL;
CREATE INDEX idx_customers_phone ON customers(company_id, phone) WHERE deleted_at IS NULL;
CREATE INDEX idx_customers_created_at ON customers(company_id, created_at DESC);

-- leads
CREATE INDEX idx_leads_company_id ON leads(company_id);
CREATE INDEX idx_leads_status ON leads(company_id, status) WHERE deleted_at IS NULL;
CREATE INDEX idx_leads_assigned_to ON leads(company_id, assigned_to) WHERE deleted_at IS NULL;
CREATE INDEX idx_leads_customer_id ON leads(customer_id) WHERE customer_id IS NOT NULL;
CREATE INDEX idx_leads_requested_date ON leads(company_id, requested_date) WHERE deleted_at IS NULL;
CREATE INDEX idx_leads_created_at ON leads(company_id, created_at DESC);
CREATE INDEX idx_leads_ai_score ON leads(company_id, ai_score DESC NULLS LAST) WHERE deleted_at IS NULL;

-- appointments
CREATE INDEX idx_appointments_company_id ON appointments(company_id);
CREATE INDEX idx_appointments_lead_id ON appointments(lead_id) WHERE lead_id IS NOT NULL;
CREATE INDEX idx_appointments_job_id ON appointments(job_id) WHERE job_id IS NOT NULL;
CREATE INDEX idx_appointments_assigned_to ON appointments(company_id, assigned_to, scheduled_at);
CREATE INDEX idx_appointments_scheduled_at ON appointments(company_id, scheduled_at) WHERE deleted_at IS NULL;

-- quotes
CREATE INDEX idx_quotes_company_id ON quotes(company_id);
CREATE INDEX idx_quotes_lead_id ON quotes(lead_id) WHERE lead_id IS NOT NULL;
CREATE INDEX idx_quotes_customer_id ON quotes(customer_id) WHERE customer_id IS NOT NULL;
CREATE INDEX idx_quotes_status ON quotes(company_id, status) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX idx_quotes_portal_token ON quotes(portal_token) WHERE portal_token IS NOT NULL;
CREATE INDEX idx_quotes_created_at ON quotes(company_id, created_at DESC);
CREATE INDEX idx_quotes_scheduled_date ON quotes(company_id, scheduled_date) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX idx_quotes_number ON quotes(company_id, quote_number);

-- quote_items
CREATE INDEX idx_quote_items_quote_id ON quote_items(quote_id);
CREATE INDEX idx_quote_items_company_id ON quote_items(company_id);

-- quote_versions
CREATE INDEX idx_quote_versions_quote_id ON quote_versions(quote_id);
CREATE UNIQUE INDEX idx_quote_versions_number ON quote_versions(quote_id, version);

-- jobs
CREATE INDEX idx_jobs_company_id ON jobs(company_id);
CREATE INDEX idx_jobs_customer_id ON jobs(customer_id);
CREATE INDEX idx_jobs_quote_id ON jobs(quote_id) WHERE quote_id IS NOT NULL;
CREATE INDEX idx_jobs_status ON jobs(company_id, status) WHERE deleted_at IS NULL;
CREATE INDEX idx_jobs_scheduled_date ON jobs(company_id, scheduled_date) WHERE deleted_at IS NULL;
CREATE INDEX idx_jobs_created_at ON jobs(company_id, created_at DESC);
CREATE UNIQUE INDEX idx_jobs_number ON jobs(company_id, job_number);

-- job_assignments
CREATE INDEX idx_job_assignments_job_id ON job_assignments(job_id);
CREATE INDEX idx_job_assignments_employee_id ON job_assignments(employee_id);
CREATE INDEX idx_job_assignments_company_id ON job_assignments(company_id);
CREATE UNIQUE INDEX idx_job_assignments_unique ON job_assignments(job_id, employee_id);

-- employees
CREATE INDEX idx_employees_company_id ON employees(company_id);
CREATE INDEX idx_employees_status ON employees(company_id, status) WHERE deleted_at IS NULL;

-- vehicles
CREATE INDEX idx_vehicles_company_id ON vehicles(company_id);
CREATE INDEX idx_vehicles_status ON vehicles(company_id, status) WHERE deleted_at IS NULL;

-- invoices
CREATE INDEX idx_invoices_company_id ON invoices(company_id);
CREATE INDEX idx_invoices_job_id ON invoices(job_id);
CREATE INDEX idx_invoices_customer_id ON invoices(customer_id);
CREATE INDEX idx_invoices_status ON invoices(company_id, status) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX idx_invoices_portal_token ON invoices(portal_token) WHERE portal_token IS NOT NULL;
CREATE INDEX idx_invoices_due_at ON invoices(company_id, due_at) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX idx_invoices_number ON invoices(company_id, invoice_number);

-- invoice_items
CREATE INDEX idx_invoice_items_invoice_id ON invoice_items(invoice_id);

-- payments
CREATE INDEX idx_payments_company_id ON payments(company_id);
CREATE INDEX idx_payments_job_id ON payments(job_id);
CREATE INDEX idx_payments_invoice_id ON payments(invoice_id) WHERE invoice_id IS NOT NULL;
CREATE INDEX idx_payments_customer_id ON payments(customer_id);
CREATE UNIQUE INDEX idx_payments_stripe_intent ON payments(stripe_payment_intent_id) WHERE stripe_payment_intent_id IS NOT NULL;
CREATE INDEX idx_payments_paid_at ON payments(company_id, paid_at DESC) WHERE paid_at IS NOT NULL;

-- documents
CREATE INDEX idx_documents_company_id ON documents(company_id);
CREATE INDEX idx_documents_entity ON documents(entity_type, entity_id);
CREATE INDEX idx_documents_type_current ON documents(company_id, document_type, entity_id)
  WHERE deleted_at IS NULL AND generation_status = 'generated';
CREATE INDEX idx_documents_type_status ON documents(company_id, document_type, generation_status);
CREATE INDEX idx_documents_customer_visible ON documents(entity_id, is_customer_visible)
  WHERE is_customer_visible = true AND deleted_at IS NULL;
CREATE INDEX idx_documents_supersedes ON documents(supersedes_id)
  WHERE supersedes_id IS NOT NULL;
-- document_templates
CREATE UNIQUE INDEX idx_doc_templates_current ON document_templates(document_type, language, jurisdiction_profile)
  WHERE is_current = true;
CREATE INDEX idx_doc_templates_type ON document_templates(document_type, language);

-- tasks
CREATE INDEX idx_tasks_company_id ON tasks(company_id);
CREATE INDEX idx_tasks_assigned_to ON tasks(company_id, assigned_to, status) WHERE deleted_at IS NULL;
CREATE INDEX idx_tasks_entity ON tasks(entity_type, entity_id) WHERE entity_id IS NOT NULL;
CREATE INDEX idx_tasks_due_at ON tasks(company_id, due_at) WHERE deleted_at IS NULL AND status != 'completed';

-- notifications
CREATE INDEX idx_notifications_user_unread ON notifications(user_id, created_at DESC) WHERE read_at IS NULL;
CREATE INDEX idx_notifications_company_id ON notifications(company_id);

-- email_logs
CREATE INDEX idx_email_logs_company_id ON email_logs(company_id);
CREATE INDEX idx_email_logs_entity ON email_logs(entity_type, entity_id) WHERE entity_id IS NOT NULL;
CREATE INDEX idx_email_logs_resend_id ON email_logs(resend_id) WHERE resend_id IS NOT NULL;
CREATE INDEX idx_email_logs_created_at ON email_logs(company_id, created_at DESC);

-- ai_logs
CREATE INDEX idx_ai_logs_company_id ON ai_logs(company_id);
CREATE INDEX idx_ai_logs_entity ON ai_logs(entity_type, entity_id) WHERE entity_id IS NOT NULL;
CREATE INDEX idx_ai_logs_task_type ON ai_logs(company_id, task_type);
CREATE INDEX idx_ai_logs_created_at ON ai_logs(company_id, created_at DESC);

-- activity_logs
CREATE INDEX idx_activity_logs_company_id ON activity_logs(company_id);
CREATE INDEX idx_activity_logs_entity ON activity_logs(entity_type, entity_id);
CREATE INDEX idx_activity_logs_actor_id ON activity_logs(actor_id) WHERE actor_id IS NOT NULL;
CREATE INDEX idx_activity_logs_created_at ON activity_logs(company_id, created_at DESC);

-- domain_events
CREATE INDEX idx_domain_events_company_id ON domain_events(company_id);
CREATE INDEX idx_domain_events_unprocessed ON domain_events(company_id, created_at) WHERE processed_at IS NULL;
CREATE INDEX idx_domain_events_aggregate ON domain_events(aggregate_type, aggregate_id);
CREATE INDEX idx_domain_events_event_type ON domain_events(event_type);

-- permission_groups
CREATE INDEX idx_permission_groups_company_id ON permission_groups(company_id) WHERE deleted_at IS NULL;

-- permission_group_assignments
CREATE INDEX idx_pga_group_id ON permission_group_assignments(group_id);
CREATE INDEX idx_pga_company_id ON permission_group_assignments(company_id);

-- user_permission_groups
CREATE INDEX idx_upg_user_id ON user_permission_groups(user_id);
CREATE INDEX idx_upg_company_id ON user_permission_groups(company_id);

-- user_permission_overrides
CREATE INDEX idx_upo_user_id ON user_permission_overrides(user_id);
CREATE INDEX idx_upo_company_id ON user_permission_overrides(company_id);

-- service_catalog
CREATE INDEX idx_service_catalog_company_id ON service_catalog(company_id, is_active) WHERE deleted_at IS NULL;
CREATE INDEX idx_service_catalog_category ON service_catalog(company_id, category) WHERE is_active = true AND deleted_at IS NULL;

-- ai_quote_recommendations
CREATE INDEX idx_ai_quote_recs_quote_id ON ai_quote_recommendations(quote_id);
CREATE INDEX idx_ai_quote_recs_company_id ON ai_quote_recommendations(company_id);

-- user_invitations
CREATE UNIQUE INDEX idx_invitations_token_hash ON user_invitations(token_hash) WHERE status = 'pending';
CREATE INDEX idx_invitations_company ON user_invitations(company_id, status);
CREATE INDEX idx_invitations_email_pending ON user_invitations(email) WHERE status = 'pending';
CREATE INDEX idx_invitations_expires_at ON user_invitations(expires_at) WHERE status = 'pending';
  -- Used by the nightly expiry cron to efficiently find stale invites
```

---

## 11. Constraints

### Unique Constraints

| Table | Constraint | Purpose |
|-------|-----------|---------|
| companies | `slug` | URL-safe company identifier |
| profiles | `(company_id, email) WHERE deleted_at IS NULL` | No duplicate emails per company |
| quotes | `(company_id, quote_number)` | Human-readable numbers unique per company |
| jobs | `(company_id, job_number)` | Human-readable numbers unique per company |
| invoices | `(company_id, invoice_number)` | Human-readable numbers unique per company |
| quotes | `portal_token WHERE NOT NULL` | Portal tokens are globally unique |
| invoices | `portal_token WHERE NOT NULL` | Portal tokens are globally unique |
| payments | `stripe_payment_intent_id WHERE NOT NULL` | Stripe idempotency |
| quote_versions | `(quote_id, version)` | One snapshot per version |
| job_assignments | `(job_id, employee_id)` | One assignment per employee per job |
| company_settings | `company_id` | One settings row per company |
| permission_groups | `(company_id, name) WHERE deleted_at IS NULL` | No duplicate group names per company |
| permission_group_assignments | `(group_id, permission_key)` | A group cannot grant the same permission twice |
| user_permission_groups | `(user_id, group_id)` | A user belongs to a group at most once |
| user_permission_overrides | `(user_id, permission_key)` | One override per permission per user |
| service_catalog | `(company_id, name) WHERE deleted_at IS NULL` | No duplicate service names per company |
| user_invitations | `(company_id, email) WHERE status = 'pending'` | Only one active invite per email per company |
| user_invitations | `token_hash` | Invite tokens are globally unique |

### Check Constraints

| Table | Column | Constraint |
|-------|--------|-----------|
| All money columns | `*_cents` | `>= 0` (except `payments.amount_cents` which allows negative for refunds) |
| All percentage columns | `*_percent` | `>= 0 AND <= 100` |
| leads | `ai_score` | `>= 0 AND <= 100` |
| quotes | `ai_confidence` | `>= 0 AND <= 100` |
| jobs | `crew_size_required` | `> 0` |
| employees | `hourly_rate_cents` | `>= 0` |
| vehicles | `year` | `>= 1980 AND <= 2100` |
| leads | `status = 'lost'` | `lost_reason IS NOT NULL` |
| jobs | `status = 'cancelled'` | `cancellation_reason IS NOT NULL AND cancelled_at IS NOT NULL` |
| appointments | `status = 'cancelled'` | `cancellation_reason IS NOT NULL` |
| jobs | `deposit_amount_cents` | `<= total_amount_cents` |
| quotes | `deposit_amount_cents` | `<= total_amount_cents` |
| quote_items | `discount_value` | `NOT NULL when discount_type IS NOT NULL` |
| quote_items | `discount_amount_cents` | `>= 0` |
| quote_items | `vat_rate_percent` | `>= 0 AND <= 100` |
| ai_quote_recommendations | `confidence_score` | `>= 0 AND <= 100` |

### Foreign Key ON DELETE Behaviors

| Relationship | Behavior | Reason |
|-------------|---------|--------|
| `profiles.company_id → companies.id` | RESTRICT | Cannot delete a company with active users |
| `leads.customer_id → customers.id` | SET NULL | Lead can exist without a linked customer record |
| `quotes.lead_id → leads.id` | RESTRICT | Cannot delete a lead that has quotes |
| `quote_items.quote_id → quotes.id` | CASCADE | Items have no existence without their quote |
| `quote_items.service_catalog_id → service_catalog.id` | SET NULL | Catalog entry can be deactivated without breaking existing quotes |
| `quote_versions.quote_id → quotes.id` | CASCADE | Versions belong to quote |
| `jobs.quote_id → quotes.id` | RESTRICT | Cannot delete an accepted quote |
| `jobs.customer_id → customers.id` | RESTRICT | Cannot delete a customer with jobs |
| `job_assignments.job_id → jobs.id` | CASCADE | Assignments belong to the job |
| `job_assignments.employee_id → employees.id` | RESTRICT | Cannot delete an employee with job assignments |
| `invoices.job_id → jobs.id` | RESTRICT | Cannot delete a job with invoices |
| `payments.job_id → jobs.id` | RESTRICT | Cannot delete a job with payment records |
| `invoice_items.invoice_id → invoices.id` | CASCADE | Items have no existence without their invoice |
| `notifications.company_id → companies.id` | CASCADE | Notifications belong to the company |
| `company_settings.company_id → companies.id` | CASCADE | Settings belong to the company |
| `permission_groups.company_id → companies.id` | CASCADE | Groups belong to company |
| `permission_group_assignments.group_id → permission_groups.id` | CASCADE | Assignments belong to group |
| `user_permission_groups.group_id → permission_groups.id` | CASCADE | User-group link removed when group deleted |
| `user_permission_overrides.user_id → profiles.id` | CASCADE | Overrides belong to user |
| `service_catalog.company_id → companies.id` | CASCADE | Catalog belongs to company |
| `ai_quote_recommendations.quote_id → quotes.id` | CASCADE | Recommendations belong to quote |
| `user_invitations.company_id → companies.id` | CASCADE | Invites belong to the company; if company deleted, remove all pending invites |
| `user_invitations.invited_by → profiles.id` | SET NULL | Preserve invite record if the inviting user is later removed |
| `user_invitations.revoked_by → profiles.id` | SET NULL | Preserve revocation record if revoking user is later removed |

---

## 12. Soft Delete Strategy

### What Uses Soft Delete

All primary business entities use soft delete:
- `companies`, `profiles`, `customers`, `leads`, `appointments`
- `quotes`, `jobs`, `employees`, `vehicles`
- `invoices`, `payments`, `documents`, `tasks`
- `permission_groups`, `service_catalog`

### What Does NOT Use Soft Delete

Append-only records that must never be modified or deleted:
- `activity_logs` — permanent audit trail
- `email_logs` — delivery record
- `ai_logs` — usage and cost record
- `domain_events` — event history
- `quote_versions` — immutable snapshots
- `notifications` — read by Supabase Realtime; cleaned up by a scheduled job after 90 days

Status-enum records (no `deleted_at` column; lifecycle managed via `status` field):
- `user_invitations` — uses `status` ('pending' | 'accepted' | 'expired' | 'revoked'). Rows are never deleted. The full invitation history is retained as an onboarding audit trail. Expiry is set by the nightly cron; it does not delete rows.

### Implementation

```
deleted_at    timestamptz    DEFAULT NULL
```

- `deleted_at IS NULL` → active record
- `deleted_at IS NOT NULL` → soft-deleted record

**All RLS SELECT policies include `AND deleted_at IS NULL`.** Soft-deleted records are invisible to all normal application queries.

**All standard queries filter `deleted_at IS NULL`.** Even though RLS enforces it, application queries include the filter explicitly (belt-and-suspenders, and makes the intent clear in query logs).

### GDPR Hard Delete Path

For GDPR Right to Erasure requests:
1. Soft-delete the customer record (`deleted_at = now()`)
2. Anonymize PII fields (replace with `[DELETED]`) — not delete the row
3. After 30 days, hard-delete the row
4. Retain anonymized `activity_logs` (the action happened — who is redacted)
5. Anonymize `email_logs` rows for that customer: `UPDATE email_logs SET to_email = '[erased]', to_name = '[erased]' WHERE company_id = {company_id} AND to_email = {customer_email}`. Email delivery records are retained for operational and audit integrity; only identifying fields are erased.
6. Remove files from Supabase Storage under that customer's path

**PDF retention exception (GDPR Art. 17(3)(b)):** Completed financial documents — invoice PDFs, signed contracts, payment receipts — are retained beyond erasure requests. Financial record-keeping law requires retention for 7+ years, which constitutes a legal obligation exception under GDPR Art. 17(3)(b). These PDF files remain in Supabase Storage. The application layer must suppress signed-URL generation and Customer Portal access for anonymized customers, but the underlying files must not be deleted.

This two-phase approach allows soft-delete recovery within 30 days and compliance after.

---

## 13. Audit Log Design

### The `activity_logs` Table

```
activity_logs
─────────────────────────────────────────────────────────────────
id                      uuid            PRIMARY KEY  DEFAULT gen_uuid_v7()
─────────────────────────────────────────────────────────────────
company_id              uuid            NOT NULL  -- no FK: append-only, company may be deleted
actor_id                uuid            -- NULL for system actions; no FK for same reason
actor_type              text            NOT NULL CHECK (actor_type IN ('user','system','api'))
actor_email             text            -- snapshot of email at time of action (for deleted users)
actor_name              text            -- snapshot of name

-- What happened
action                  text            NOT NULL  -- e.g., "quote.created", "job.status.updated"

-- On what entity
entity_type             text            NOT NULL  -- e.g., "quote", "job"
entity_id               uuid            NOT NULL
entity_label            text            -- human-readable snapshot: "Quote QT-2026-001"

-- State change
before_state            jsonb           -- null for create actions
after_state             jsonb           -- null for delete actions

-- Context metadata
metadata                jsonb           NOT NULL DEFAULT '{}'  -- extra context
ip_address              inet
user_agent              text
request_id              text            -- trace back to originating HTTP request

-- Append-only: no updated_at, no deleted_at
created_at              timestamptz     NOT NULL DEFAULT now()
─────────────────────────────────────────────────────────────────
INDEXES:
  idx_activity_logs_company_id    (company_id)
  idx_activity_logs_entity        (entity_type, entity_id)
  idx_activity_logs_actor_id      (actor_id) WHERE actor_id IS NOT NULL
  idx_activity_logs_created_at    (company_id, created_at DESC)
```

### What Is Logged

Every write operation against any business entity must produce an activity log entry:

| Action type | Example |
|-------------|---------|
| Create | Lead created, Quote drafted, Job created |
| Update | Job status changed, Quote accepted, Employee assigned |
| Delete | Customer soft-deleted, Quote cancelled |
| Auth | User invited, User role changed |
| Financial | Payment recorded, Invoice sent |
| AI | AI quote generated (ai_log_id in metadata) |
| System | Overdue invoice detected, Quote expired |

### Guarantees

- **Append-only:** No UPDATE or DELETE ever executed against `activity_logs`. PostgreSQL grants are configured to REVOKE UPDATE and DELETE from all application roles on this table.
- **No FK constraints:** Activity logs reference company_id and actor_id without FK constraints. This allows logs to survive even if the referenced entity is later hard-deleted.
- **Snapshot of actor identity:** `actor_email` and `actor_name` are stored at write time. If the user's profile is later deleted, the log still shows who did it.
- **PII in before/after state:** `before_state` and `after_state` contain entity field snapshots. These are scrubbed as part of GDPR erasure (replace customer name/email with `[REDACTED]`).

---

## 14. Document Storage Model

### The `documents` Table

Every PDF, photo, and uploaded file creates one row. Generated business documents (quote PDFs, invoices, receipts) are immutable once `generation_status = 'generated'`. No application code may UPDATE snapshot fields or storage fields after that point.

```
documents
─────────────────────────────────────────────────────────────────
id                      uuid            PRIMARY KEY  DEFAULT gen_uuid_v7()
─────────────────────────────────────────────────────────────────
company_id              uuid            NOT NULL REFERENCES companies(id) ON DELETE RESTRICT

-- ── ENTITY RELATIONSHIP ──────────────────────────────────────
entity_type             document_entity_type  NOT NULL
entity_id               uuid            NOT NULL
-- A trigger validates that entity_id exists in the correct table for entity_type.

-- ── CLASSIFICATION ────────────────────────────────────────────
document_type           document_type   NOT NULL
name                    text            NOT NULL    -- human-readable display name
language                text            NOT NULL DEFAULT 'en'  -- ISO 639-1
jurisdiction_profile    text            -- 'CH' | 'DE' | 'GB' | 'US' | etc.; null = default

-- ── VERSIONING ────────────────────────────────────────────────
-- documents.version tracks PDF regenerations within the same entity_id + document_type.
-- For quotes: entity_id changes on each quote revision (new quotes row per revision),
--   so documents.version is typically 1 per quote entity.
--   The human-visible version number comes from quotes.version.
-- For invoices: same entity_id, documents.version increments on each PDF correction.
version                 integer         NOT NULL DEFAULT 1

supersedes_id           uuid            REFERENCES documents(id) ON DELETE SET NULL
-- The documents row that this one replaces. Never null for version > 1.
-- The superseded row is NEVER deleted; retained for audit and dispute resolution.

superseded_at           timestamptz
-- Populated on the OLD row when a newer version is generated.
-- Immutable once set; never cleared.

-- ── GENERATION LIFECYCLE ──────────────────────────────────────
generation_status       document_generation_status  NOT NULL DEFAULT 'pending'
generation_source       text            NOT NULL DEFAULT 'puppeteer'
-- 'puppeteer' = server-side Puppeteer render (standard)
-- 'upload'    = operator-uploaded file (e.g., signed agreement scan)
-- 'system'    = internally generated without Puppeteer (future)

generated_by            uuid            REFERENCES profiles(id) ON DELETE SET NULL
-- null = system/automation triggered; populated = operator triggered

generated_at            timestamptz
-- Populated when generation_status transitions to 'generated'.

generation_started_at   timestamptz
generation_completed_at timestamptz
generation_attempt      smallint        NOT NULL DEFAULT 1 CHECK (generation_attempt BETWEEN 1 AND 5)
generation_error        text
-- Populated on failure; describes which validation or render step failed.

-- ── TEMPLATE PROVENANCE ───────────────────────────────────────
-- These fields record exactly what was used to render this document.
-- Together with the snapshot fields, they make every generation reproducible.
template_id             text
-- Identifier of the document_templates row used (stored as text; no FK to allow
-- template pruning without losing provenance records).
template_version        text
-- Version string of the HTML template at generation time (e.g., '1.2.0').
renderer_version        text
-- Version of the Puppeteer/rendering system at generation time.

-- ── STORAGE ───────────────────────────────────────────────────
storage_bucket          text            NOT NULL DEFAULT 'documents'
storage_path            text
-- Null while pending/generating; populated after successful upload.
-- Canonical format: {company_id}/{entity_folder}/{entity_id}/{document_type}-v{version}-{id}.pdf
-- See "Canonical Storage Path Convention" below.
mime_type               text            NOT NULL DEFAULT 'application/pdf'
file_size_bytes         integer         CHECK (file_size_bytes > 0)
content_hash            text
-- SHA-256 hex digest of the PDF binary content.
-- Computed after upload; used for integrity verification.
-- If content_hash of a stored file does not match this value, the file has been corrupted or replaced.

-- ── IMMUTABLE SNAPSHOT FIELDS ─────────────────────────────────
-- These JSONB fields capture the exact state of the world at generation time.
-- They are written once, at generation, and must never be updated thereafter.
-- They are the queryable audit trail that complements the immutable PDF file in storage.
-- A historical document is fully reconstructable from these fields + the template version.

company_snapshot        jsonb
-- Company identity captured at generation time. Fields:
-- { name, legal_name, trading_name,
--   address_line1, address_line2, city, postal_code, country,
--   phone, email, website,
--   vat_number, registration_number,
--   logo_url, accent_color,
--   bank_name, bank_iban, bank_bic, bank_payee_name,
--   invoice_footer_text, quote_footer_text }
-- Immutable: company logo changes, address changes, VAT number changes —
-- none of these affect the content of historical documents.

customer_snapshot       jsonb
-- Customer identity at generation time. Fields:
-- { id, full_name, email, phone,
--   billing_address_line1, billing_address_line2,
--   billing_city, billing_postal_code, billing_country,
--   vat_number }
-- Immutable: customer address changes do not alter historical invoice delivery addresses.

address_snapshot        jsonb
-- Origin and destination addresses for job-related documents. Fields:
-- { origin: { address, city, postal_code, country, floor, has_elevator, has_stairs },
--   destination: { address, city, postal_code, country, floor, has_elevator, has_stairs } }
-- Populated for: quote_pdf, contract, work_order, bill_of_lading, delivery_receipt.
-- Null for: invoice_pdf, payment_receipt, damage_report (unless job-related context needed).

service_line_snapshot   jsonb
-- Array of all line items at generation time. Element shape:
-- [ { name, description, pricing_mode, quantity, unit,
--     rate_cents, amount_cents, is_estimated,
--     discount_cents, vat_rate_percent, vat_cents } ]
-- Populated for: quote_pdf, invoice_pdf.
-- Immutable: renaming a service in the catalog does not change historical line item names.

financial_snapshot      jsonb
-- Summary financial figures at generation time. Fields:
-- { subtotal_cents, discount_cents, discount_reason,
--   tax_rate_percent, tax_label, tax_cents,
--   total_cents, currency_code,
--   deposit_percent, deposit_cents,
--   outstanding_cents, payments_received_cents }
-- Populated for: quote_pdf, invoice_pdf, payment_receipt, credit_note.

terms_snapshot          text
-- Full plain-text copy of the service agreement or legal terms in effect at generation time.
-- Populated for: contract, signed_contract.
-- Immutable: changes to company_settings.service_agreement_text do not reach historical agreements.

payment_details_snapshot jsonb
-- Bank and payment information at generation time. Fields:
-- { bank_name, iban, bic, payee_name, payment_reference,
--   payment_terms_days, due_date, currency_code }
-- Populated for: invoice_pdf, payment_receipt.
-- Immutable: bank account changes never alter historical invoice payment instructions.

-- ── SIGNATURE STATE ───────────────────────────────────────────
requires_signature      boolean         NOT NULL DEFAULT false
signed_at               timestamptz
signed_by_name          text
signed_by_email         text

-- ── VOID STATE ────────────────────────────────────────────────
-- Voiding marks a document as no longer commercially valid.
-- The file and row are NEVER deleted; void is a status flag only.
voided_at               timestamptz
voided_by               uuid            REFERENCES profiles(id) ON DELETE SET NULL
void_reason             text

-- ── AI INVOLVEMENT ────────────────────────────────────────────
ai_assisted             boolean         NOT NULL DEFAULT false
-- true if AI generated or modified any text content in this document.
ai_log_id               uuid            REFERENCES ai_logs(id) ON DELETE SET NULL

-- ── PORTAL VISIBILITY ─────────────────────────────────────────
is_customer_visible     boolean         NOT NULL DEFAULT false
-- Explicit opt-in. The customer portal only surfaces documents where this = true.

-- ── NOTES ─────────────────────────────────────────────────────
notes                   text            -- internal only; never customer-facing

-- ── SOFT DELETE ───────────────────────────────────────────────
-- Documents are never hard-deleted.
-- Soft delete is permitted only on documents that have never been sent to a customer.
-- Any document with a corresponding email_logs.attached_document_id reference is permanently locked.
deleted_at              timestamptz

-- ── TIMESTAMPS ────────────────────────────────────────────────
created_at              timestamptz     NOT NULL DEFAULT now()
updated_at              timestamptz     NOT NULL DEFAULT now()
─────────────────────────────────────────────────────────────────
INDEXES:
  idx_documents_company_id         (company_id)
  idx_documents_entity             (entity_type, entity_id)
  idx_documents_type_current       (company_id, document_type, entity_id)
                                    WHERE deleted_at IS NULL AND generation_status = 'generated'
  idx_documents_type_status        (company_id, document_type, generation_status)
  idx_documents_customer_visible   (entity_id, is_customer_visible)
                                    WHERE is_customer_visible = true AND deleted_at IS NULL
  idx_documents_supersedes         (supersedes_id) WHERE supersedes_id IS NOT NULL
  idx_documents_content_hash       (content_hash) WHERE content_hash IS NOT NULL

CONSTRAINTS:
  -- Snapshot fields are immutable once generated
  -- Enforced by application layer; no PostgreSQL constraint for JSONB immutability
  -- The trigger below fires on UPDATE to reject changes to snapshot columns post-generation

TRIGGER: trg_documents_snapshot_immutability
  BEFORE UPDATE ON documents
  FOR EACH ROW
  WHEN (OLD.generation_status = 'generated')
  EXECUTE FUNCTION reject_snapshot_field_updates();
  -- Raises exception if any of the following columns change:
  -- company_snapshot, customer_snapshot, address_snapshot, service_line_snapshot,
  -- financial_snapshot, terms_snapshot, payment_details_snapshot,
  -- storage_path, storage_bucket, content_hash, template_id, template_version,
  -- renderer_version, entity_type, entity_id, document_type, version

RLS: public.auth_company_id() = company_id
     Platform support: read-only during break-glass session (PLATFORM_ADMIN.md §5)
```

### Immutability Guarantee

A document row with `generation_status = 'generated'` is immutable in all snapshot and storage fields. This guarantee holds regardless of what changes in the rest of the system:

| Change in Bivro | Effect on historical documents |
|----------------|-------------------------------|
| Company logo updated | None — `company_snapshot.logo_url` holds the URL at generation time; the PDF file is frozen |
| Company address changed | None — `company_snapshot` holds the address at generation time |
| Bank details changed | None — `payment_details_snapshot` holds the IBAN at generation time |
| VAT number changed | None — `company_snapshot.vat_number` holds the value at generation time |
| Customer address changed | None — `customer_snapshot` holds the billing address at generation time |
| Service renamed in catalog | None — `service_line_snapshot[*].name` holds the name at generation time |
| Service price changed | None — `service_line_snapshot[*].rate_cents` holds the price at generation time |
| Legal text updated | None — `terms_snapshot` holds the full text at generation time |
| Template HTML updated | None — `template_version` identifies the old template; PDF file is already rendered |
| Renderer version upgraded | None — `renderer_version` records what rendered it; file is already frozen |

The PDF file in Supabase Storage is the primary immutable artifact. The snapshot fields are the queryable provenance record. Together they are the complete immutable historical document.

### Canonical Storage Path Convention

All generated document files use the following versioned path format. This is the single authoritative convention — no other format is used.

```
Bucket: documents  (private; no public access)

Generated business documents:
  {company_id}/{entity_folder}/{entity_id}/{document_type}-v{version}-{document_id}.pdf

Entity folder mapping:
  entity_type = 'quote'    → quotes/
  entity_type = 'invoice'  → invoices/
  entity_type = 'job'      → jobs/
  entity_type = 'customer' → customers/
  entity_type = 'employee' → employees/
  entity_type = 'company'  → company/

Examples:
  {cid}/quotes/{quote_id}/quote_pdf-v1-{doc_id}.pdf
  {cid}/quotes/{quote_id}/contract-v1-{doc_id}.pdf
  {cid}/quotes/{quote_id}/signed_contract-v1-{doc_id}.pdf
  {cid}/invoices/{invoice_id}/invoice_pdf-v1-{doc_id}.pdf
  {cid}/invoices/{invoice_id}/invoice_pdf-v2-{doc_id}.pdf    ← corrected invoice
  {cid}/invoices/{invoice_id}/payment_receipt-v1-{doc_id}.pdf
  {cid}/invoices/{invoice_id}/credit_note-v1-{doc_id}.pdf
  {cid}/jobs/{job_id}/work_order-v1-{doc_id}.pdf
  {cid}/jobs/{job_id}/damage_report-v1-{doc_id}.pdf
  {cid}/jobs/{job_id}/bill_of_lading-v1-{doc_id}.pdf
  {cid}/jobs/{job_id}/delivery_receipt-v1-{doc_id}.pdf
  {cid}/jobs/{job_id}/photos/{doc_id}.jpg                    ← photos use doc_id only
  {cid}/employees/{employee_id}/license-{doc_id}.pdf

Company identity assets (not versioned in the same way; may be replaced):
  {company_id}/company/logo.png          ← PNG or WebP; replaced on update
  {company_id}/company/email-header.png

Path uniqueness guarantee:
  The {document_id} UUID (gen_uuid_v7()) in every generated document path ensures global
  uniqueness. No two generation runs ever produce the same path, even for the same entity
  and version number. This structurally prevents accidental overwrite.

Signed URL expiry (from ARCHITECTURE.md §13):
  Internal web app:  1 hour
  Customer portal:   15 minutes
  URLs are generated ephemerally; never stored in the database.
```

### Polymorphic Validation

A PostgreSQL trigger validates that the `entity_id` actually exists in the table corresponding to `entity_type`. This prevents orphaned document records.

### `document_templates` Table

Stores versioned HTML templates used by the Puppeteer rendering engine. Managed by Bivro developers; not editable by company operators.

```
document_templates
─────────────────────────────────────────────────────────────────
id                      uuid            PRIMARY KEY  DEFAULT gen_uuid_v7()
─────────────────────────────────────────────────────────────────
-- Identity
document_type           document_type   NOT NULL
language                text            NOT NULL DEFAULT 'en'   -- ISO 639-1
jurisdiction_profile    text            -- null = applies to all; 'CH' = CH-specific variant
name                    text            NOT NULL   -- human-readable, e.g., "Quote PDF — DE"
version                 text            NOT NULL   -- semantic version, e.g., '1.2.0'
is_current              boolean         NOT NULL DEFAULT false
-- UNIQUE (document_type, language, jurisdiction_profile) WHERE is_current = true

-- Template content
template_html           text            NOT NULL   -- full HTML document with {{ variable }} tokens
variables_required      text[]          NOT NULL DEFAULT '{}'
-- Variable names that must resolve before generation is allowed
variables_optional      text[]          NOT NULL DEFAULT '{}'
-- Variable names that may be absent (rendered empty or omitted cleanly)

-- Deployment tracking
released_at             timestamptz
released_by             text           -- developer identifier (not a FK; deploy system reference)

-- Append-only
created_at              timestamptz    NOT NULL DEFAULT now()
─────────────────────────────────────────────────────────────────
INDEXES:
  idx_doc_templates_current   (document_type, language, jurisdiction_profile)
                               WHERE is_current = true
  idx_doc_templates_type      (document_type, language)

CONSTRAINTS:
  UNIQUE (document_type, language, jurisdiction_profile, version)

RLS: No tenant RLS — system table. Read access for the generation service only.
     No write access for company operators under any circumstances.
```

---

## 15. PDF Versioning Model

### Two Distinct Versioning Concepts

Bivro has two versioning concepts that must not be conflated:

**Quote revision versioning (`quotes.version`):**
Each time an operator revises a quote, a new `quotes` row is created with the same `quote_number`, an incremented `quotes.version`, and a `parent_quote_id` referencing the original (version 1) quotes row. Each revision is a fully independent entity with its own UUID. The PDF for each quote revision has `documents.entity_id` pointing to that specific `quotes.id`, and `documents.version = 1` (because it is the first and only PDF generation for that quote entity row). The human-visible "Version 2" shown in the UI comes from `quotes.version`, not `documents.version`.

**Document PDF versioning (`documents.version`):**
For the same entity (`entity_id` + `document_type`), `documents.version` increments when the PDF is regenerated — for example, when a template bug requires regeneration of an invoice, or when an invoice PDF is corrected without a financial change. For invoice corrections involving financial changes, the correct approach is a Credit Note, not a new invoice version.

**Practical consequence:**
- Quote QT-2026-0042 Version 3 is a new `quotes` row → new `documents` row with `documents.version = 1`
- Invoice INV-2026-0088 PDF regenerated after a template fix → same `invoices` row → new `documents` row with `documents.version = 2`

### Document Version Lifecycle

When a new `documents` version is generated for the same entity:

1. The new PDF is stored in Supabase Storage at a new versioned path (new `document_id` in filename)
2. A new `documents` row is inserted: `version = previous_version + 1`, `supersedes_id = previous_document_id`
3. The previous `documents` row has `superseded_at` populated and `generation_status` updated to `'superseded'`
4. The previous `documents` row is NEVER soft-deleted — it remains permanently accessible
5. The previous PDF file in Supabase Storage is NEVER deleted or overwritten
6. The domain event `document.generated` is written with the new document ID

### Current Document Version Query

```sql
SELECT d.*
FROM documents d
WHERE d.entity_type = 'invoice'
  AND d.entity_id = '{invoice_id}'
  AND d.document_type = 'invoice_pdf'
  AND d.deleted_at IS NULL
  AND d.generation_status = 'generated'
ORDER BY d.version DESC
LIMIT 1
```

### All Versions Query (Version History)

```sql
SELECT d.*
FROM documents d
WHERE d.entity_type = 'quote'
  AND d.entity_id = '{quote_id}'
  AND d.document_type = 'quote_pdf'
  AND d.deleted_at IS NULL
ORDER BY d.version ASC
```

### All Quote Revisions and Their PDFs

To retrieve all PDFs across all revisions of quote QT-2026-0042:

```sql
SELECT q.version AS quote_version, q.status AS quote_status,
       d.id AS document_id, d.version AS document_version,
       d.generation_status, d.generated_at, d.storage_path
FROM quotes q
JOIN documents d ON d.entity_id = q.id
                AND d.entity_type = 'quote'
                AND d.document_type = 'quote_pdf'
WHERE (q.id = '{root_quote_id}' OR q.parent_quote_id = '{root_quote_id}')
  AND d.deleted_at IS NULL
ORDER BY q.version ASC, d.version ASC
```

### Version Retention Policy

| Document type | Versions retained | Policy |
|--------------|------------------|--------|
| `quote_pdf` | All | All quote revision PDFs retained permanently; commercial dispute evidence |
| `contract` | All | All unsigned agreement versions retained permanently |
| `signed_contract` | All | Once signed, no new version should exist; retained permanently |
| `invoice_pdf` | All | Full financial audit trail; all versions retained |
| `payment_receipt` | All | Permanent financial record |
| `credit_note` | All | Permanent financial record |
| `work_order` | Latest + prior (until job complete) | Latest supersedes prior; prior retained until job is completed and archived |
| `damage_report` | All | Evidence trail for insurance/legal; all versions retained permanently |
| `bill_of_lading` | All | Legal transport document; all versions retained |
| `delivery_receipt` | All | Signed completion record; retained permanently |
| `booking_confirmation` | Latest only | Prior versions superseded; latest retained |
| `cancellation_confirmation` | All | Permanent record |

---

## 16. Email Log Model

### The `email_logs` Table

```
email_logs
─────────────────────────────────────────────────────────────────
id                      uuid            PRIMARY KEY  DEFAULT gen_uuid_v7()
─────────────────────────────────────────────────────────────────
company_id              uuid            NOT NULL  -- no FK: append-only log

-- What triggered this email
trigger_event           text            NOT NULL  -- domain event type e.g. "quoting.quote.sent"
entity_type             text            -- 'quote' | 'job' | 'invoice' | 'lead'
entity_id               uuid

-- Recipients and sender
to_email                text            NOT NULL
to_name                 text
from_email              text            NOT NULL
from_name               text            NOT NULL
reply_to                text

-- Content
subject                 text            NOT NULL

-- Delivery
status                  email_delivery_status  NOT NULL DEFAULT 'queued'
resend_id               text            UNIQUE    -- Resend's message ID

-- Tracking events (updated by Resend webhook)
sent_at                 timestamptz
delivered_at            timestamptz
first_opened_at         timestamptz
open_count              integer         NOT NULL DEFAULT 0
first_clicked_at        timestamptz
bounced_at              timestamptz
bounce_type             text            -- 'hard' | 'soft'
bounce_reason           text
complained_at           timestamptz

-- Error
error_code              text
error_message           text

-- Automation linkage (added by email system — soft references, no FK on append-only log)
automation_id           uuid            -- soft reference to email_automations.id
automation_run_id       uuid            -- soft reference to email_automation_runs.id

-- Template linkage (DB-versioned template system)
template_id             uuid            -- soft reference to email_templates.id
template_version_id     uuid            -- soft reference to email_template_versions.id

-- AI involvement
ai_influenced           boolean         NOT NULL DEFAULT false
-- true = AI drafted or modified the email body

-- Idempotency
idempotency_key         uuid            UNIQUE NOT NULL DEFAULT gen_uuid_v7()
-- Passed to Resend; prevents duplicate sends on retry

-- Language
language                text            DEFAULT 'en'

-- Scheduled send
scheduled_for           timestamptz
-- null = immediate send; populated = was scheduled before send

-- Sender identity
sender_identity_id      uuid            -- soft reference to email_sender_identities.id

-- Document attachment integrity
attached_document_id    uuid
-- Soft reference to the exact documents.id attached to this email.
-- No FK: email_logs is append-only and documents may be soft-deleted.
-- This reference is immutable after send — never update it.

-- Append-only: no updated_at, no deleted_at
created_at              timestamptz     NOT NULL DEFAULT now()
─────────────────────────────────────────────────────────────────
INDEXES:
  idx_email_logs_company_id           (company_id)
  idx_email_logs_entity               (entity_type, entity_id) WHERE entity_id IS NOT NULL
  idx_email_logs_resend_id            (resend_id) WHERE resend_id IS NOT NULL
  idx_email_logs_status               (company_id, status)
  idx_email_logs_created_at           (company_id, created_at DESC)
  idx_email_logs_idempotency_key      (idempotency_key)
  idx_email_logs_automation_run       (automation_run_id) WHERE automation_run_id IS NOT NULL
  idx_email_logs_template             (template_id) WHERE template_id IS NOT NULL
```

### Email Tracking Update Pattern

Resend webhooks (`email.opened`, `email.clicked`, `email.bounced`) POST to `/api/webhooks/email-tracking`. The handler identifies the `email_logs` row via `resend_id` and updates the tracking fields. This is the one case where an "append-only" log is updated — tracking events are accumulative state, not new events.

The `status` column always reflects the most advanced delivery state reached (it only progresses forward, never back).

---

## 17. AI Log Model

### The `ai_logs` Table

```
ai_logs
─────────────────────────────────────────────────────────────────
id                      uuid            PRIMARY KEY  DEFAULT gen_uuid_v7()
─────────────────────────────────────────────────────────────────
company_id              uuid            NOT NULL  -- no FK: append-only log
triggered_by            uuid            -- profile id; NULL for system-triggered

-- Context
task_type               ai_task_type    NOT NULL
entity_type             text            -- 'lead' | 'quote' | 'job'
entity_id               uuid

-- Model used
model                   text            NOT NULL  -- e.g., "claude-sonnet-4-6"
prompt_template         text            NOT NULL  -- template identifier and version

-- Token usage
input_tokens            integer         NOT NULL DEFAULT 0 CHECK (input_tokens >= 0)
output_tokens           integer         NOT NULL DEFAULT 0 CHECK (output_tokens >= 0)
total_tokens            integer GENERATED ALWAYS AS (input_tokens + output_tokens) STORED

-- Cost tracking (millicents to avoid float; 1000 millicents = 1 cent)
cost_millicents         integer         NOT NULL DEFAULT 0 CHECK (cost_millicents >= 0)

-- Performance
duration_ms             integer         CHECK (duration_ms >= 0)

-- Result
status                  ai_result_status  NOT NULL
confidence              smallint        CHECK (confidence >= 0 AND confidence <= 100)

-- Operator feedback
operator_rating         smallint        CHECK (operator_rating >= 1 AND operator_rating <= 5)
operator_edited         boolean         NOT NULL DEFAULT false
edit_delta_summary      text            -- brief description of what operator changed

-- Error detail
error_code              text
error_message           text

-- Append-only: no updated_at, no deleted_at
created_at              timestamptz     NOT NULL DEFAULT now()
─────────────────────────────────────────────────────────────────
INDEXES:
  idx_ai_logs_company_id          (company_id)
  idx_ai_logs_entity              (entity_type, entity_id) WHERE entity_id IS NOT NULL
  idx_ai_logs_task_type           (company_id, task_type)
  idx_ai_logs_created_at          (company_id, created_at DESC)
  idx_ai_logs_model               (model, created_at DESC)
```

### AI Cost Budget Tracking

A daily Vercel Cron job aggregates `ai_logs.cost_millicents` per company for the current billing period and compares against the company's tier limit. If usage exceeds 80%, a notification is created for the owner. If it exceeds 100%, AI features are gated (recorded in `companies.settings->>'ai_disabled'`).

### Feedback Loop

The `operator_rating`, `operator_edited`, and `edit_delta_summary` fields capture implicit and explicit feedback:
- If an operator edits an AI-generated quote before sending, `operator_edited = true` is set and the delta is recorded
- If an operator clicks a "rate this" prompt, `operator_rating` is set
- These are read periodically by the Bivro team to improve prompt templates

---

## 18. Payment Tracking Model

### V1 Payment Philosophy

V1 supports two payment modes simultaneously:

**Mode 1 — Online (Stripe):** Customer pays via the Customer Portal. Stripe processes the card or ACH. Stripe sends a webhook to Bivro. A `payments` row is created automatically with `stripe_payment_intent_id` set.

**Mode 2 — Manual:** Operator records a cash, check, or bank transfer payment on behalf of the customer. A `payments` row is created by the operator with `recorded_by` set and `method = 'cash' | 'check' | 'bank_transfer'`.

Both modes write to the same `payments` table. The `recorded_by = NULL` indicates an online payment. `recorded_by IS NOT NULL` indicates a manually recorded payment.

### Payment Idempotency (Stripe)

Stripe webhooks may fire multiple times for the same event. The `stripe_payment_intent_id` UNIQUE index prevents duplicate payment records. The payment processing handler is idempotent: if a row with the same `stripe_payment_intent_id` already exists and is in `completed` status, the webhook is acknowledged without creating a new row.

### Invoice Balance Reconciliation

When a payment is recorded or updated, the application recalculates and updates:
1. `invoices.amount_paid_cents` = sum of completed payments for this invoice
2. `invoices.status` = derive from balance_due_cents (0 → paid, > 0 → partially_paid)
3. `jobs.deposit_paid_at` = set when a deposit payment completes
4. `customers.total_revenue_cents` = sum of all completed payments for this customer

These denormalized fields are updated synchronously in the same transaction as the payment record creation.

### Refund Handling

Refunds are recorded as new `payments` rows with:
- `payment_type = 'refund'`
- `amount_cents` = negative integer (money going out)
- `stripe_refund_id` = Stripe's refund ID (for online refunds)

The negative amount reduces `invoices.amount_paid_cents` accordingly.

---

## 19. Human-Readable Sequence Numbers

### Format

```
{PREFIX}-{YEAR}-{PADDED_SEQUENCE}

Examples:
  QT-2026-0001    (quote)
  JB-2026-0042    (job)
  INV-2026-0017   (invoice)
```

### Implementation

Sequence counters are stored on the `companies` row:
- `companies.quote_sequence`
- `companies.job_sequence`
- `companies.invoice_sequence`

A PostgreSQL function generates the next number atomically using `SELECT ... FOR UPDATE` on the company row. This prevents race conditions when two quotes are created simultaneously.

```
Function: generate_sequence_number(company_id uuid, sequence_type text) RETURNS text

Steps:
1. SELECT the relevant sequence column FROM companies WHERE id = company_id FOR UPDATE
   -- sequence column: quote_sequence | job_sequence | invoice_sequence (derived from sequence_type)
2. new_seq = sequence_column + 1
3. UPDATE companies SET <sequence_column> = new_seq WHERE id = company_id
4. prefix = CASE sequence_type
               WHEN 'quote'   THEN 'QT'
               WHEN 'job'     THEN 'JB'
               WHEN 'invoice' THEN 'INV'
            END
5. RETURN prefix || '-' || to_char(NOW(), 'YYYY') || '-' || LPAD(new_seq::text, 4, '0')
```

> **Implementation note:** `FORMAT('%04s', n)` does not zero-pad in PostgreSQL's `format()` function — `%s` only controls minimum width with space-filling. Always use `LPAD(n::text, 4, '0')` for zero-padded sequence numbers.

The sequence resets logic is a business decision made at launch: V1 does **not** reset sequences annually (QT-2027-0001 after QT-2026-NNNN). Sequences are monotonically increasing per company, per entity type, forever. This avoids the complexity of a year rollover and potential number collisions.

Year is included in the format for readability but is not used for uniqueness.

---

## 20. Domain Events Table

### The `domain_events` Table

```
domain_events
─────────────────────────────────────────────────────────────────
id                      uuid            PRIMARY KEY  DEFAULT gen_uuid_v7()
─────────────────────────────────────────────────────────────────
company_id              uuid            NOT NULL  -- no FK: append-only

-- Event identity
event_type              text            NOT NULL  -- e.g., "quoting.quote.sent"
aggregate_type          text            NOT NULL  -- e.g., "quote"
aggregate_id            uuid            NOT NULL  -- the entity this event is about

-- Full event payload (enough for consumers to act without a DB query)
payload                 jsonb           NOT NULL

-- Processing state
processed_at            timestamptz     -- NULL until all handlers complete
processing_error        text            -- set if handler failed

-- Append-only: no updated_at, no deleted_at
created_at              timestamptz     NOT NULL DEFAULT now()
─────────────────────────────────────────────────────────────────
INDEXES:
  idx_domain_events_company_id    (company_id)
  idx_domain_events_unprocessed   (company_id, created_at ASC) WHERE processed_at IS NULL
  idx_domain_events_aggregate     (aggregate_type, aggregate_id)
  idx_domain_events_event_type    (event_type, created_at DESC)
```

### V1 Dispatch Mechanism

A Supabase Database Webhook watches for INSERT on `domain_events` and POSTs to `/api/webhooks/domain-event`. The handler routes by `event_type` to the correct module handler and sets `processed_at` on completion.

### Unprocessed Event Monitor

A Vercel Cron job runs every 15 minutes and queries for `domain_events` where `processed_at IS NULL AND created_at < NOW() - INTERVAL '5 minutes'`. These are logged to Sentry as alerts (an event that hasn't been processed in 5 minutes is a failure that needs investigation).

---

## 21. Future Migration Notes

### Employees → Login Accounts (V2+)

The `employees` table has a `profile_id` column (nullable FK to `profiles`). When employees get login capability in V2+:
1. Create Supabase Auth accounts for employees
2. Create `profiles` rows linked to those auth accounts (role: `driver` — new enum value)
3. Set `employees.profile_id` to the new profile UUID
4. Add V2+ role permissions for `driver` role in the RLS policies

No schema changes to `employees`, `jobs`, or `job_assignments` are required. The `profile_id` column is already there waiting.

### Crew Login Role (V2+)

When crew members get login accounts (V2+), one new role is added to the `user_role` enum:
```sql
ALTER TYPE user_role ADD VALUE 'crew';   -- restricted mobile-only access
```

The `crew` role is hardcoded with minimal permissions (view own assigned jobs only). It does not go through the configurable permission system — crew members' access is always fixed by the `crew` role, not configurable by the Owner. The Permission Group system is specifically for the `office` role.

PostgreSQL supports `ALTER TYPE ... ADD VALUE` without a full enum rebuild.

### Custom Named Roles (V2+ Enterprise)

The permission system tables already support unlimited permission groups per company. What V2+ Enterprise adds is the concept of named roles that can be assigned like the `office` role (i.e., the role claim in the JWT is a custom value instead of `office`). This requires:
1. A new `custom_roles` table referencing `permission_groups`
2. The Supabase Auth hook to embed the custom role name in `app_metadata`
3. The RBAC middleware to handle arbitrary role names that resolve to permission sets

The current `user_permission_groups` and `permission_groups` tables remain unchanged — they become the permission set backing for custom roles.

### Multi-Location (V2+)

When companies have multiple locations (branches), a `locations` table is added:
```
locations
  id          uuid PK
  company_id  uuid FK
  name        text
  address     ...
```

Jobs, employees, and vehicles gain an optional `location_id` FK. RLS policies are extended to support location-scoped roles.

### Schema-Per-Tenant (Enterprise)

The current row-level isolation model can be promoted to schema-per-tenant for Enterprise customers. The migration path:
1. Create a dedicated PostgreSQL schema named `tenant_{company_id}`
2. Move all company rows into that schema via a migration script
3. Update the Supabase client to use `search_path = tenant_{company_id}`
4. Existing RLS policies remain but are now redundant (schema isolation is stronger)

This migration is non-trivial but possible without changing the application's SQL (schema-qualified queries are handled by the search_path configuration).

### Marketplace Tables (V2+ Horizon 2)

When the marketplace launches (connecting customers directly to operators):
- `marketplace_listings` — operator profile on the public marketplace
- `marketplace_inquiries` — customer requests submitted to the marketplace
- `marketplace_bids` — operator bids on customer inquiries

These tables share the same `company_id` tenant model and RLS patterns. The marketplace context also needs public-read RLS policies (marketplace listings are visible without authentication).

### Supabase → Neon Migration (V2+)

The schema is PostgreSQL-standard with no Supabase-specific extensions. The only Supabase-specific elements are:
1. The `auth.users` table (used via `profiles.id` FK)
2. The `auth.jwt()` function (used in RLS policies)

Migration steps:
1. Replace `auth.jwt()` in RLS policies with a custom JWT validation function
2. Migrate `auth.users` data to the new auth provider
3. Re-establish the `profiles.id` FK against the new user store
4. All other tables, indexes, constraints, and business logic are provider-agnostic

---

## 22. Email System Tables

The following tables are required by the email system (EMAIL_SYSTEM.md §18). They extend the core schema and must be included in migration files. All tables are tenant-isolated by `company_id` and covered by RLS using `public.auth_company_id() = company_id`.

---

### 22.1 `email_templates`

Company-owned email templates. Seeded with Bivro defaults at company creation.

```
email_templates
─────────────────────────────────────────────────────────────────
id                      uuid            PRIMARY KEY  DEFAULT gen_uuid_v7()
─────────────────────────────────────────────────────────────────
company_id              uuid            NOT NULL REFERENCES companies(id) ON DELETE CASCADE

slug                    text            NOT NULL   -- unique within company; e.g., 'quote-sent'
name                    text            NOT NULL   -- display name; e.g., "Quote Sent"
description             text

lifecycle_stage         text            -- e.g., 'quote_sent', 'move_reminder'
template_class          text            NOT NULL DEFAULT 'transactional'
-- 'transactional' | 'marketing'

is_system_default       boolean         NOT NULL DEFAULT false
-- true = seeded by Bivro; can be deactivated but not deleted

is_active               boolean         NOT NULL DEFAULT true
archived_at             timestamptz

sort_order              integer         NOT NULL DEFAULT 0

created_at              timestamptz     NOT NULL DEFAULT now()
updated_at              timestamptz     NOT NULL DEFAULT now()
deleted_at              timestamptz
─────────────────────────────────────────────────────────────────
INDEXES:
  UNIQUE (company_id, slug) WHERE deleted_at IS NULL
  idx_email_templates_company_active  (company_id, is_active, lifecycle_stage)
RLS:
  SELECT: public.auth_company_id() = company_id AND deleted_at IS NULL
  INSERT/UPDATE/DELETE: public.auth_company_id() = company_id AND public.auth_user_role() = 'owner'
    (office users with communications.manage_automations may UPDATE is_active only)
```

---

### 22.2 `email_template_versions`

Immutable version records. Every save to a template creates a new version.

```
email_template_versions
─────────────────────────────────────────────────────────────────
id                      uuid            PRIMARY KEY  DEFAULT gen_uuid_v7()
─────────────────────────────────────────────────────────────────
template_id             uuid            NOT NULL REFERENCES email_templates(id) ON DELETE CASCADE
company_id              uuid            NOT NULL   -- denormalized for RLS

version_number          integer         NOT NULL   -- sequential within template; 1, 2, 3...
is_current              boolean         NOT NULL DEFAULT false
-- Only one version per template+language may have is_current = true

language                text            NOT NULL DEFAULT 'en'

subject                 text            NOT NULL
body_html               text            NOT NULL
body_text               text            NOT NULL
variables_used          text[]          NOT NULL DEFAULT '{}'

created_by              uuid            REFERENCES profiles(id) ON DELETE SET NULL

-- Append-only: no updated_at, no deleted_at
created_at              timestamptz     NOT NULL DEFAULT now()
─────────────────────────────────────────────────────────────────
INDEXES:
  idx_template_versions_template      (template_id, language, version_number DESC)
  idx_template_versions_current       (template_id, language) WHERE is_current = true
CONSTRAINTS:
  UNIQUE (template_id, language, version_number)
RLS:
  SELECT: public.auth_company_id() = company_id
  INSERT: public.auth_company_id() = company_id (versions are created on template save, not deleted)
  UPDATE/DELETE: forbidden (versions are immutable)
```

---

### 22.3 `email_automations`

Automation rule definitions. Each rule is scoped to a company.

```
email_automations
─────────────────────────────────────────────────────────────────
id                      uuid            PRIMARY KEY  DEFAULT gen_uuid_v7()
─────────────────────────────────────────────────────────────────
company_id              uuid            NOT NULL REFERENCES companies(id) ON DELETE CASCADE

name                    text            NOT NULL
description             text

trigger_event           text            NOT NULL   -- domain event type; e.g., 'quoting.quote.sent'
trigger_delay_seconds   integer         NOT NULL DEFAULT 0

conditions              jsonb           NOT NULL DEFAULT '[]'
cancellation_events     text[]          NOT NULL DEFAULT '{}'

template_id             uuid            NOT NULL REFERENCES email_templates(id) ON DELETE RESTRICT
template_language       text            DEFAULT 'customer_preference'

sender_identity_id      uuid            REFERENCES email_sender_identities(id) ON DELETE SET NULL

mode                    text            NOT NULL DEFAULT 'approval'
-- 'draft' | 'approval' | 'auto_send'

max_retries             smallint        NOT NULL DEFAULT 3
retry_delay_minutes     smallint        NOT NULL DEFAULT 5

is_system_default       boolean         NOT NULL DEFAULT false
is_active               boolean         NOT NULL DEFAULT false
-- All automations start inactive; Owner must explicitly activate

created_by              uuid            REFERENCES profiles(id) ON DELETE SET NULL
updated_by              uuid            REFERENCES profiles(id) ON DELETE SET NULL

created_at              timestamptz     NOT NULL DEFAULT now()
updated_at              timestamptz     NOT NULL DEFAULT now()
─────────────────────────────────────────────────────────────────
INDEXES:
  idx_email_automations_company_trigger  (company_id, trigger_event) WHERE is_active = true
RLS:
  SELECT: public.auth_company_id() = company_id
  INSERT/UPDATE/DELETE: public.auth_company_id() = company_id AND (public.auth_user_role() = 'owner'
    OR has_permission('communications.manage_automations'))
```

---

### 22.4 `email_automation_runs`

Execution log for every automation trigger event. Append-only audit trail.

```
email_automation_runs
─────────────────────────────────────────────────────────────────
id                      uuid            PRIMARY KEY  DEFAULT gen_uuid_v7()
─────────────────────────────────────────────────────────────────
company_id              uuid            NOT NULL   -- no FK: append-only log
automation_id           uuid            NOT NULL   -- soft reference to email_automations.id
template_id             uuid            NOT NULL   -- soft reference to email_template_versions.id

trigger_event           text            NOT NULL
entity_type             text
entity_id               uuid

to_email                text            NOT NULL
to_name                 text

status                  text            NOT NULL
-- 'pending' | 'draft_created' | 'approval_pending' | 'approved'
-- | 'sent' | 'skipped' | 'failed' | 'expired' | 'cancelled'
cancellation_reason     text

scheduled_for           timestamptz
approved_at             timestamptz
approved_by             uuid            -- soft reference to profiles

email_log_id            uuid            -- references email_logs.id when email was sent
error_message           text

-- Append-only: no updated_at, no deleted_at
created_at              timestamptz     NOT NULL DEFAULT now()
─────────────────────────────────────────────────────────────────
INDEXES:
  idx_automation_runs_company_id   (company_id, created_at DESC)
  idx_automation_runs_entity       (entity_type, entity_id) WHERE entity_id IS NOT NULL
  idx_automation_runs_pending      (company_id, status) WHERE status IN ('pending', 'approval_pending')
RLS:
  SELECT: public.auth_company_id() = company_id
  INSERT: public.auth_company_id() = company_id (system-initiated only; no user INSERT via API)
  UPDATE/DELETE: forbidden (append-only)
```

---

### 22.5 `email_sender_identities`

Verified sender identities for each company.

```
email_sender_identities
─────────────────────────────────────────────────────────────────
id                      uuid            PRIMARY KEY  DEFAULT gen_uuid_v7()
─────────────────────────────────────────────────────────────────
company_id              uuid            NOT NULL REFERENCES companies(id) ON DELETE CASCADE

name                    text            NOT NULL   -- display name
email                   text            NOT NULL   -- from address

reply_to                text

tier                    text            NOT NULL DEFAULT 'bivro_managed'
-- 'bivro_managed' | 'company_verified'

domain                  text
dkim_status             text            DEFAULT 'pending'
-- 'pending' | 'verified' | 'failed'
spf_status              text            DEFAULT 'pending'
dmarc_status            text            DEFAULT 'pending'
verified_at             timestamptz

is_active               boolean         NOT NULL DEFAULT true
is_default              boolean         NOT NULL DEFAULT false
-- Only one per company may be is_default = true

created_at              timestamptz     NOT NULL DEFAULT now()
updated_at              timestamptz     NOT NULL DEFAULT now()
deleted_at              timestamptz
─────────────────────────────────────────────────────────────────
INDEXES:
  idx_sender_identities_default  (company_id) WHERE is_default = true AND deleted_at IS NULL
CONSTRAINTS:
  UNIQUE (company_id, email) WHERE deleted_at IS NULL
RLS:
  SELECT: public.auth_company_id() = company_id AND deleted_at IS NULL
  INSERT/UPDATE/DELETE: public.auth_company_id() = company_id AND public.auth_user_role() = 'owner'
```

---

### 22.6 `communication_preferences`

Per-customer communication preferences. One row per customer.

```
communication_preferences
─────────────────────────────────────────────────────────────────
id                      uuid            PRIMARY KEY  DEFAULT gen_uuid_v7()
─────────────────────────────────────────────────────────────────
company_id              uuid            NOT NULL REFERENCES companies(id) ON DELETE CASCADE
customer_id             uuid            NOT NULL UNIQUE REFERENCES customers(id) ON DELETE CASCADE

preferred_language      text            DEFAULT NULL
language_source         text            DEFAULT 'unset'
-- 'unset' | 'operator_set' | 'customer_set' | 'ai_detected'

opted_out_all           boolean         NOT NULL DEFAULT false
opted_out_automated     boolean         NOT NULL DEFAULT false
opted_out_marketing     boolean         NOT NULL DEFAULT false
opted_out_at            timestamptz

email_deliverability    text            NOT NULL DEFAULT 'ok'
-- 'ok' | 'soft_bounce_risk' | 'hard_bounce' | 'complained'
deliverability_updated_at  timestamptz

preferred_salutation    text
communication_notes     text

created_at              timestamptz     NOT NULL DEFAULT now()
updated_at              timestamptz     NOT NULL DEFAULT now()
─────────────────────────────────────────────────────────────────
INDEXES:
  idx_comm_prefs_deliverability  (company_id, email_deliverability)
RLS:
  SELECT: public.auth_company_id() = company_id
  INSERT/UPDATE: public.auth_company_id() = company_id AND (public.auth_user_role() = 'owner'
    OR has_permission('communications.view'))
  DELETE: forbidden (opt-out records must be retained)
```

---

### 22.7 `ai_communication_memory`

Tenant-isolated AI communication tone and style learning. One-to-few rows per company.

```
ai_communication_memory
─────────────────────────────────────────────────────────────────
id                      uuid            PRIMARY KEY  DEFAULT gen_uuid_v7()
─────────────────────────────────────────────────────────────────
company_id              uuid            NOT NULL REFERENCES companies(id) ON DELETE CASCADE

scope                   text            NOT NULL DEFAULT 'company'
-- 'company' | 'customer'
customer_id             uuid            REFERENCES customers(id) ON DELETE CASCADE
-- null when scope = 'company'

memory_type             text            NOT NULL
-- e.g., 'preferred_greeting' | 'preferred_signoff' | 'message_length'
--       'register' | 'follow_up_style' | 'language_preference'

observed_value          text            NOT NULL
confidence              integer         NOT NULL DEFAULT 0 CHECK (confidence BETWEEN 0 AND 100)

status                  text            NOT NULL DEFAULT 'proposed'
-- 'proposed' | 'confirmed' | 'rejected'
confirmed_by            uuid            REFERENCES profiles(id) ON DELETE SET NULL
confirmed_at            timestamptz

observation_count       integer         NOT NULL DEFAULT 1

created_at              timestamptz     NOT NULL DEFAULT now()
updated_at              timestamptz     NOT NULL DEFAULT now()
─────────────────────────────────────────────────────────────────
INDEXES:
  idx_ai_comm_memory_company_type  (company_id, scope, memory_type)
  idx_ai_comm_memory_customer      (customer_id) WHERE customer_id IS NOT NULL
RLS:
  SELECT: public.auth_company_id() = company_id
  INSERT/UPDATE: public.auth_company_id() = company_id (system-initiated; no direct user INSERT)
  DELETE: public.auth_company_id() = company_id AND public.auth_user_role() = 'owner'
```

---

*This document is the authoritative schema reference for Bivro V1. No table may be created, no column may be added, and no policy may be written that is not defined here. Migration files must faithfully reproduce this specification.*
