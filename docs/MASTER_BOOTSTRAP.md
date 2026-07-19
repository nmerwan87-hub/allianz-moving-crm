# Bivro — Master Bootstrap

**Version:** 1.0  
**Status:** Implementation Authority — Supersedes all prior planning documents  
**Owner:** Engineering  
**Created:** 2026-07-19

---

## 1. Document Purpose and Authority

This document is the single source of truth for how Bivro is built — from an empty repository to a production-ready V1. It is an execution plan, dependency map, and implementation sequence. It is not a product specification.

**What this document decides:**
- The exact order in which database objects are created
- The exact order in which application modules are built
- What constitutes completion of each phase
- When Sprint 1 may begin

**What this document does not decide:**
- Product features (see PRODUCT_REQUIREMENTS.md)
- Database schema details (see DATABASE_ARCHITECTURE.md)
- AI engine behaviour (see AI_ENGINE.md)
- Email system design (see EMAIL_SYSTEM.md)
- PDF rendering design (see PDF_ENGINE.md)
- Platform admin design (see PLATFORM_ADMIN.md)
- UI/UX specifications (see UI_UX_SYSTEM.md)
- Coding conventions (see CODING_STANDARDS.md)
- Business model (see BUSINESS_MODEL.md)

**Authority hierarchy:** This document references the above source documents as authoritative. When this document conflicts with a source document, the source document wins. Flag the conflict; do not silently deviate.

---

## 2. Frozen Architecture Decisions

The following decisions are permanent. They may not be revisited, overridden, or "temporarily" bypassed during V1 implementation. Any deviation requires an explicit architecture decision record and the approval of the technical lead.

| Decision | Value | Authority |
|----------|-------|-----------|
| Framework | Next.js 16, App Router | ARCHITECTURE.md §2 |
| Language | TypeScript strict mode (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`) | CODING_STANDARDS.md §1 |
| Database | Supabase PostgreSQL 17 | DATABASE_ARCHITECTURE.md P8 |
| ORM | Drizzle ORM — no Prisma, no Sequelize | ARCHITECTURE.md §2 |
| Internal API | tRPC v11 — no REST for internal calls | ARCHITECTURE.md §2 |
| Auth | Supabase Auth — JWT with `company_id`+`role` in `app_metadata` | DATABASE_ARCHITECTURE.md §3 |
| Primary key format | UUID v7 via `gen_uuid_v7()` — `gen_random_uuid()` is FORBIDDEN | DATABASE_ARCHITECTURE.md P8 |
| Tenant isolation | Triple-layer: JWT + RLS + application WHERE clause | DATABASE_ARCHITECTURE.md §2 |
| RLS JWT claim | `(auth.jwt() -> 'app_metadata' ->> 'company_id')::uuid` via `public.auth_company_id()` helper | DATABASE_ARCHITECTURE.md §2 |
| Monetary values | Integers in cents; column names end in `_cents` | DATABASE_ARCHITECTURE.md P3 |
| Soft deletes | `deleted_at timestamptz` on business entities | DATABASE_ARCHITECTURE.md P5 |
| Append-only logs | `email_logs`, `ai_logs`, `activity_logs`, `domain_events` — no UPDATE except email tracking | DATABASE_ARCHITECTURE.md P6 |
| V1 roles | `owner` (unrestricted) and `office` (permission-gated) only | DATABASE_ARCHITECTURE.md §4 |
| AI models | Haiku for cheap tasks; Sonnet for primary; Opus for complex reasoning | AI_ENGINE.md §14 |
| AI model identifiers | Must be constants in `lib/ai/models.ts` — never hardcoded | CODING_STANDARDS.md §18 |
| PDF generator | Puppeteer via Supabase Edge Function | PDF_ENGINE.md; ARCHITECTURE.md §14 |
| PDF template syntax | `{{ variable }}` — HTML stored in `document_templates` table | PDF_ENGINE.md |
| Email sending | Resend + React Email | EMAIL_SYSTEM.md; ARCHITECTURE.md §15 |
| Webhook verification | HMAC-SHA256 via Svix (Resend); Stripe signature verification | EMAIL_SYSTEM.md; ARCHITECTURE.md |
| Storage | Supabase Storage, private bucket `documents` | ARCHITECTURE.md §13 |
| Storage path | `{company_id}/{entity_folder}/{entity_id}/{document_type}-v{version}-{document_id}.pdf` | PDF_ENGINE.md |
| Signed URL TTL | 1 hour (web), 15 minutes (customer portal) | PDF_ENGINE.md |
| Payments | Stripe | ARCHITECTURE.md §2 |
| Realtime | Supabase Realtime (WebSocket) | ARCHITECTURE.md §16 |
| Background jobs | Vercel Cron + Supabase Edge Functions | ARCHITECTURE.md §10 |
| Error monitoring | Sentry | ARCHITECTURE.md §19 |
| Deployment | Vercel | ARCHITECTURE.md §2 |
| No barrel files | Direct imports only — no `index.ts` re-exports | CODING_STANDARDS.md §1.12 |
| No `any` | Forbidden in all production code | CODING_STANDARDS.md §1.2 |
| Admin portal | `admin.bivro.io` — Host header check in Next.js middleware | PLATFORM_ADMIN.md §1; ARCHITECTURE.md §19 |
| Sequence numbers | `{PREFIX}-{YEAR}-{LPAD(seq,4,'0')}` | DATABASE_ARCHITECTURE.md §19 |

---

## 3. Repository and Workspace Structure

The repository is a single Next.js monolith (modular monolith architecture). No separate packages. No turborepo. No workspaces within the repo.

### 3.1 Canonical Folder Structure

```
bivro/
├── app/                          ← Next.js App Router pages
│   ├── (auth)/                   ← Login, signup, invite acceptance
│   │   ├── login/page.tsx
│   │   ├── signup/page.tsx
│   │   ├── invite/[token]/page.tsx
│   │   └── layout.tsx
│   ├── (dashboard)/              ← Operator portal (app.bivro.io)
│   │   ├── layout.tsx            ← Dashboard shell (sidebar, header)
│   │   ├── page.tsx              ← /dashboard home
│   │   ├── leads/
│   │   ├── quotes/
│   │   ├── jobs/
│   │   ├── customers/
│   │   ├── crew/
│   │   ├── fleet/
│   │   ├── invoices/
│   │   ├── analytics/
│   │   └── settings/
│   ├── portal/[token]/           ← Customer portal (no-auth, token-based)
│   ├── admin/                    ← Platform Admin (admin.bivro.io only)
│   ├── api/
│   │   ├── trpc/[trpc]/route.ts  ← tRPC handler
│   │   ├── v1/crew/              ← Mobile REST API
│   │   └── webhooks/
│   │       ├── domain-event/route.ts
│   │       ├── email-tracking/route.ts
│   │       └── stripe/route.ts
│   ├── layout.tsx
│   ├── globals.css
│   └── not-found.tsx
│
├── modules/                      ← Domain modules (bounded contexts)
│   ├── iam/                      ← Identity & Access Management
│   │   ├── interface.ts          ← Public API used by other modules
│   │   ├── middleware.ts
│   │   ├── schemas.ts
│   │   └── service.ts
│   ├── crm/
│   ├── quoting/
│   ├── jobs/
│   ├── workforce/
│   ├── fleet/
│   ├── communications/
│   ├── documents/
│   ├── payments/
│   ├── analytics/
│   └── ai/
│
├── trpc/
│   ├── routers/                  ← One file per domain module
│   ├── root.ts
│   ├── middleware.ts
│   └── client.ts
│
├── components/
│   ├── ui/                       ← shadcn/ui primitives (no business logic)
│   ├── forms/
│   ├── layouts/
│   └── [feature]/                ← Feature-specific components
│
├── hooks/
│
├── lib/
│   ├── supabase/
│   │   ├── client.ts             ← Browser client (anon key)
│   │   ├── server.ts             ← Server client (cookies)
│   │   └── service-role.ts       ← Service role client (RLS bypass)
│   ├── ai/
│   │   └── models.ts             ← AI model identifier constants (REQUIRED)
│   ├── types/
│   │   ├── database.ts           ← Generated from Supabase type generation
│   │   ├── domain.ts             ← Branded ID types, domain types
│   │   └── api.ts                ← API response types
│   ├── utils/
│   ├── constants.ts
│   └── permissions.ts            ← Permission matrix
│
├── emails/                       ← React Email templates (27 lifecycle stages)
│
├── supabase/
│   ├── migrations/               ← SQL migration files — append-only, source of truth
│   ├── functions/                ← Supabase Edge Functions (PDF generation)
│   └── seed.sql                  ← Development seed data
│
├── public/
│
└── tests/
    ├── unit/
    ├── integration/
    └── e2e/                      ← Playwright
```

### 3.2 Module Interface Rule

Every domain module exposes ONE public interface file (`interface.ts`). All cross-module calls go through this interface only. Importing from `modules/crm/service.ts` from inside `modules/quoting/` is a violation. Import from `modules/crm/interface.ts` only.

---

## 4. Required Packages

### 4.1 Production Dependencies

```
next@^16.0.0
react
react-dom
typescript

# Supabase
@supabase/supabase-js
@supabase/ssr

# ORM
drizzle-orm
postgres           ← PostgreSQL driver for Drizzle

# API layer
@trpc/server
@trpc/client
@trpc/next
@trpc/react-query
@tanstack/react-query

# Validation
zod

# Forms
react-hook-form
@hookform/resolvers

# AI
@anthropic-ai/sdk

# Email
resend
@react-email/components
react-email
svix               ← Resend webhook signature verification

# PDF
puppeteer-core     ← Supabase Edge Function uses puppeteer-core

# Payments
stripe

# Monitoring
@sentry/nextjs

# UI
tailwindcss
@tailwindcss/forms
class-variance-authority
clsx
tailwind-merge
lucide-react
@radix-ui/react-dialog
@radix-ui/react-dropdown-menu
@radix-ui/react-select
@radix-ui/react-tabs
@radix-ui/react-toast
@radix-ui/react-tooltip
@radix-ui/react-label
@radix-ui/react-checkbox
@radix-ui/react-popover
@radix-ui/react-separator
@radix-ui/react-avatar

# Utilities
date-fns
```

### 4.2 Development Dependencies

```
drizzle-kit        ← Migration generation and push

# Testing
vitest
@vitest/coverage-v8
@testing-library/react
@testing-library/user-event
jsdom
@playwright/test

# Linting and formatting
eslint
eslint-config-next
@typescript-eslint/parser
@typescript-eslint/eslint-plugin
eslint-plugin-import

prettier
prettier-plugin-tailwindcss

# Git hooks
husky
lint-staged

# Supabase CLI (global or project-local)
supabase
```

### 4.3 Installation Order

1. Initialize `package.json` with `pnpm init`
2. Install production deps: `pnpm add [production list]`
3. Install dev deps: `pnpm add -D [dev list]`
4. Verify zero peer dependency conflicts before proceeding

**Package manager:** pnpm (deterministic installs, disk-efficient, workspace-ready for V2+).

---

## 5. Environment Strategy

### 5.1 Three Environments

| Environment | Purpose | Supabase project | Vercel project |
|-------------|---------|-----------------|----------------|
| `local` | Individual developer machines | `supabase start` (Docker) | Not deployed |
| `staging` | Integration testing; PR previews | Dedicated staging project | Vercel (branch: staging) |
| `production` | Live product | Dedicated production project | Vercel (branch: main) |

Preview deployments on Vercel pull requests use the staging Supabase project with a branch-specific prefix on storage paths.

### 5.2 Environment Variables Catalogue

Every variable listed here is required unless marked `[optional]`. Missing required variables at startup cause the application to throw during the environment validation check (implemented in `lib/env.ts` using Zod).

#### Supabase

| Variable | Scope | Description |
|----------|-------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Client + Server | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Client + Server | Public anon key (safe to expose) |
| `SUPABASE_SERVICE_ROLE_KEY` | Server only | Service role key — bypasses RLS; never expose to client |
| `SUPABASE_DB_URL` | Server / CI only | Direct PostgreSQL connection string for drizzle-kit migrations |
| `SUPABASE_JWT_SECRET` | Server only | JWT signing secret for custom token validation |

#### Application

| Variable | Scope | Description |
|----------|-------|-------------|
| `NEXT_PUBLIC_APP_URL` | Client + Server | e.g., `https://app.bivro.io` |
| `NEXT_PUBLIC_ADMIN_URL` | Client + Server | e.g., `https://admin.bivro.io` |
| `CRON_SECRET` | Server only | Shared secret for authenticating Vercel Cron requests (`Authorization: Bearer {CRON_SECRET}`) |

#### AI

| Variable | Scope | Description |
|----------|-------|-------------|
| `ANTHROPIC_API_KEY` | Server only | Claude API key |

#### Email

| Variable | Scope | Description |
|----------|-------|-------------|
| `RESEND_API_KEY` | Server only | Resend sending API key |
| `RESEND_WEBHOOK_SECRET` | Server only | Svix signature secret for Resend webhook verification |

#### Payments

| Variable | Scope | Description |
|----------|-------|-------------|
| `STRIPE_SECRET_KEY` | Server only | Stripe secret key |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Client + Server | Stripe publishable key |
| `STRIPE_WEBHOOK_SECRET` | Server only | Stripe webhook endpoint signing secret |
| `STRIPE_PRICE_ID_STARTER` | Server only | Stripe Price ID for Starter monthly plan |
| `STRIPE_PRICE_ID_STARTER_ANNUAL` | Server only | Stripe Price ID for Starter annual plan |
| `STRIPE_PRICE_ID_PRO` | Server only | Stripe Price ID for Pro monthly plan |
| `STRIPE_PRICE_ID_PRO_ANNUAL` | Server only | Stripe Price ID for Pro annual plan |
| `STRIPE_PRICE_ID_BUSINESS` | Server only | Stripe Price ID for Business monthly plan |
| `STRIPE_PRICE_ID_BUSINESS_ANNUAL` | Server only | Stripe Price ID for Business annual plan |

#### Monitoring

| Variable | Scope | Description |
|----------|-------|-------------|
| `SENTRY_DSN` | Client + Server | Sentry error reporting endpoint |
| `SENTRY_ORG` | CI only | Sentry organization slug (for source map upload) |
| `SENTRY_PROJECT` | CI only | Sentry project slug |
| `SENTRY_AUTH_TOKEN` | CI only | Sentry token for source map upload during build |

#### Platform Admin

| Variable | Scope | Description |
|----------|-------|-------------|
| `PLATFORM_GOOGLE_CLIENT_ID` | Server only | Google OAuth client ID (restricted to @bivro.io) |
| `PLATFORM_GOOGLE_CLIENT_SECRET` | Server only | Google OAuth client secret |
| `PLATFORM_SESSION_SECRET` | Server only | Platform admin session signing secret |

---

## 6. Local Development Setup

### 6.1 Prerequisites

- Node.js ≥ 22.x LTS
- pnpm ≥ 9.x
- Docker Desktop (for `supabase start`)
- Supabase CLI ≥ 1.200.x
- Git

### 6.2 First-Time Setup Sequence

```
1. git clone https://github.com/bivro/bivro.git
2. cd bivro
3. pnpm install
4. cp .env.example .env.local
   → Fill in required variables (Anthropic, Resend, Stripe keys for dev)
5. supabase start
   → Starts local PostgreSQL + Auth + Storage + Studio
   → Outputs: local API URL, anon key, service_role key
   → These go into .env.local
6. pnpm db:migrate
   → Runs all migration files in /supabase/migrations/ in order
7. pnpm db:seed
   → Populates development seed data
8. pnpm dev
   → Next.js dev server on http://localhost:3000
9. supabase studio
   → Database explorer on http://localhost:54323
```

### 6.3 pnpm Script Definitions

| Script | Command | Description |
|--------|---------|-------------|
| `dev` | `next dev` | Start Next.js dev server |
| `build` | `next build` | Production build |
| `start` | `next start` | Start production server |
| `typecheck` | `tsc --noEmit` | TypeScript validation, zero tolerance |
| `lint` | `eslint . --max-warnings 0` | Lint — zero warnings allowed |
| `format` | `prettier --write .` | Format all files |
| `format:check` | `prettier --check .` | Verify formatting in CI |
| `test` | `vitest run` | Run unit and integration tests |
| `test:watch` | `vitest` | Watch mode |
| `test:coverage` | `vitest run --coverage` | Coverage report |
| `test:e2e` | `playwright test` | Playwright end-to-end tests |
| `db:migrate` | `supabase db push` | Apply migrations to local DB |
| `db:generate` | `drizzle-kit generate` | Generate migration from schema |
| `db:types` | `supabase gen types typescript` | Regenerate database types |
| `db:seed` | `supabase db seed` | Apply seed data |
| `db:reset` | `supabase db reset` | Reset local DB (destructive) |
| `email:dev` | `email dev` | React Email preview server |

---

## 7. Supabase Project Setup

### 7.1 Supabase Project Configuration

For both staging and production:

1. Create new Supabase project at supabase.com
2. Select PostgreSQL 17 (verify — do not accept default if lower)
3. Choose region closest to primary user base (US East for V1)
4. Record: Project URL, anon key, service_role key, DB connection string, JWT secret

### 7.2 Supabase Auth Configuration

1. **Email auth:** Enable email + password; enable magic links
2. **Email templates:** Configure Resend SMTP credentials for Supabase Auth emails (password reset, magic link, email verification). These are the only auth emails Supabase sends directly — all other emails go through Resend API.
3. **Custom access token hook:** Enable and wire `custom_access_token_hook` PostgreSQL function. This hook fires on every JWT issue and injects `company_id` and `role` from the `profiles` table into `app_metadata`. This is the foundation of tenant isolation and RBAC.
4. **JWT expiry:** 3600 seconds (1 hour). JWT refresh is handled by Supabase Auth client automatically.
5. **Redirect URLs:** Add `app.bivro.io`, `admin.bivro.io`, and staging/preview URLs to the Supabase Auth allowed redirect list.

### 7.3 Supabase Storage Configuration

1. Create private bucket: `documents`
2. Set max file size: 20 MB
3. Set allowed MIME types: `application/pdf`, `image/jpeg`, `image/png`, `image/webp`
4. Enable RLS on the bucket: policies are defined in migration files, not dashboard

### 7.4 Supabase Database Webhooks

Configure the following Database Webhooks (INSERT on these tables → POST to these API routes):

| Table | Event | Target URL | Purpose |
|-------|-------|-----------|---------|
| `domain_events` | INSERT | `/api/webhooks/domain-event` | Route domain events to module handlers |

No other tables need Database Webhooks in V1. The domain_events table is the universal event bus.

---

## 8. PostgreSQL Extensions

The first migration file (`001_bootstrap.sql`) must enable extensions before any other SQL runs:

```sql
-- Required before gen_uuid_v7() is defined
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Required for hash-chained audit log
CREATE EXTENSION IF NOT EXISTS pgcrypto; -- already above; pgcrypto covers sha256
```

No other PostgreSQL extensions are required for V1. `uuid-ossp` is explicitly NOT used — Bivro uses `gen_uuid_v7()` for all UUID generation.

---

## 9. Database Migration Order

### 9.1 Migration Naming Convention

```
{YYYYMMDDHHMMSS}_{description}.sql

Examples:
20260719000001_bootstrap_extensions_enums_helpers.sql
20260719000002_core_entities_companies_profiles.sql
20260719000003_crm_customers_leads_appointments.sql
```

Migrations are strictly append-only. Never edit an existing migration file after it has been applied to any environment.

### 9.2 Complete Migration Sequence

| Migration # | File Name Pattern | Contents |
|-------------|------------------|----------|
| 001 | `_bootstrap` | pgcrypto extension, `gen_uuid_v7()` function, all 21 ENUMs, `public.auth_company_id()` + `public.auth_user_role()` helper functions, `update_updated_at()` trigger function |
| 002 | `_core_entities` | `companies`, `profiles` |
| 003 | `_crm` | `customers`, `leads`, `appointments` |
| 004 | `_workforce_fleet` | `employees`, `vehicles` |
| 005 | `_catalog_settings` | `service_catalog`, `company_settings` |
| 006 | `_permissions` | `permission_groups`, `user_permission_groups`, `user_permission_overrides`, `user_invitations` |
| 007 | `_quotes` | `quotes`, `quote_items`, `quote_versions`, `ai_quote_recommendations` |
| 008 | `_jobs` | `jobs`, `job_assignments` |
| 009 | `_invoices_payments` | `invoices`, `invoice_items`, `payments` |
| 010 | `_documents` | `document_templates`, `documents` |
| 011 | `_tasks_notifications` | `tasks`, `notifications` |
| 012 | `_append_only_logs` | `email_logs`, `ai_logs`, `activity_logs`, `domain_events` |
| 013 | `_email_system` | `email_sender_identities`, `email_templates`, `email_template_versions`, `email_automations`, `email_automation_runs`, `communication_preferences`, `ai_communication_memory` |
| 014 | `_analytics` | `metric_snapshots` |
| 015 | `_platform_admin` | `platform_admin_users`, `platform_sessions`, `platform_support_sessions`, `platform_audit_log`, `company_subscription_overrides`, `platform_metric_snapshots` |
| 016 | `_indexes` | All indexes from DATABASE_ARCHITECTURE.md §10 |
| 017 | `_functions_triggers` | `generate_sequence_number()`, `reject_snapshot_field_updates()` trigger, `update_updated_at` trigger on all business tables, platform audit log hash chain trigger |
| 018 | `_rls_enable` | Enable RLS on every table; all SELECT, INSERT, UPDATE, DELETE policies |
| 019 | `_custom_access_token_hook` | The `custom_access_token_hook` PostgreSQL function |
| 020 | `_seed_defaults` | Default permission group seed rows, default email template rows (27 lifecycle stages), default automation rules (12, seeded inactive) |

### 9.3 Migration Dependency Graph

```
001_bootstrap
  ↓ (all ENUMs + helpers ready)
002_core_entities (companies ← root; profiles ← companies)
  ↓
003_crm (customers ← companies; leads ← companies, customers; appointments ← companies, leads)
  ↓
004_workforce_fleet (employees ← companies, profiles; vehicles ← companies)
  ↓
005_catalog_settings (service_catalog ← companies; company_settings ← companies)
  ↓
006_permissions (permission_groups ← companies; user_permission_groups ← profiles, permission_groups;
                 user_permission_overrides ← profiles; user_invitations ← companies)
  ↓
007_quotes (quotes ← companies, customers, leads; quote_items ← quotes;
            quote_versions ← quotes; ai_quote_recommendations ← quotes)
  ↓
008_jobs (jobs ← companies, customers, quotes; job_assignments ← jobs, employees, vehicles)
  ↓
009_invoices_payments (invoices ← companies, customers, jobs; invoice_items ← invoices; payments ← invoices)
  ↓
010_documents (document_templates ← companies; documents ← companies [entity FK = soft ref])
  ↓
011_tasks_notifications (tasks ← companies, profiles; notifications ← companies, profiles)
  ↓
012_append_only_logs (all no-FK append-only tables; safe to create any time after 002)
  ↓
013_email_system (email_sender_identities ← companies; email_templates ← companies;
                  email_template_versions ← email_templates;
                  email_automations ← companies, email_templates, email_sender_identities;
                  email_automation_runs ← no FK [append-only];
                  communication_preferences ← companies, customers;
                  ai_communication_memory ← companies, customers)
  ↓
014_analytics (metric_snapshots ← companies)
  ↓
015_platform_admin (platform tables — no FK deps outside platform schema)
  ↓
016_indexes (safe after all tables exist)
  ↓
017_functions_triggers (safe after all tables exist)
  ↓
018_rls_enable (must come after all tables and functions; public.auth_company_id() must exist)
  ↓
019_custom_access_token_hook (depends on profiles table)
  ↓
020_seed_defaults (depends on all tables + RLS)
```

---

## 10. ENUM Creation Order

All ENUMs are created in migration 001. Order does not matter (no ENUM references another ENUM), but the canonical list is:

| # | ENUM Name | Authority |
|---|-----------|-----------|
| 1 | `user_role` | DATABASE_ARCHITECTURE.md §5 |
| 2 | `employee_status` | DATABASE_ARCHITECTURE.md §5 |
| 3 | `vehicle_type` | DATABASE_ARCHITECTURE.md §5 |
| 4 | `vehicle_status` | DATABASE_ARCHITECTURE.md §5 |
| 5 | `assignment_role` | DATABASE_ARCHITECTURE.md §5 |
| 6 | `document_type` | DATABASE_ARCHITECTURE.md §5 |
| 7 | `document_entity_type` | DATABASE_ARCHITECTURE.md §5 |
| 8 | `document_generation_status` | DATABASE_ARCHITECTURE.md §5 |
| 9 | `line_item_type` | DATABASE_ARCHITECTURE.md §5 |
| 10 | `task_status` | DATABASE_ARCHITECTURE.md §5 |
| 11 | `task_priority` | DATABASE_ARCHITECTURE.md §5 |
| 12 | `email_delivery_status` | DATABASE_ARCHITECTURE.md §5 |
| 13 | `ai_task_type` | DATABASE_ARCHITECTURE.md §5 |
| 14 | `ai_result_status` | DATABASE_ARCHITECTURE.md §5 |
| 15 | `subscription_tier` | DATABASE_ARCHITECTURE.md §5 (`free`, `starter`, `pro`, `business`, `enterprise`) |
| 16 | `subscription_status` | DATABASE_ARCHITECTURE.md §5 |
| 17 | `property_size` | DATABASE_ARCHITECTURE.md §5 |
| 18 | `acquisition_source` | DATABASE_ARCHITECTURE.md §5 |
| 19 | `pricing_mode` | DATABASE_ARCHITECTURE.md §5 |
| 20 | `discount_type` | DATABASE_ARCHITECTURE.md §5 |
| 21 | `permission_override_type` | DATABASE_ARCHITECTURE.md §5 |

Additional ENUMs for quote, job, invoice, payment, lead statuses are defined in DATABASE_ARCHITECTURE.md §5 and created in migration 001 alongside the above.

---

## 11. Table Creation Order

See migration dependency graph in §9.3. Canonical table list by dependency tier:

**Tier 0 (no FK deps):** `companies`

**Tier 1 (FK → Tier 0):** `profiles`, `customers`, `vehicles`, `service_catalog`, `company_settings`, `permission_groups`, `user_invitations`, `email_sender_identities`, `email_templates`, `platform_admin_users`

**Tier 2 (FK → Tier 1):** `leads`, `employees`, `user_permission_groups`, `user_permission_overrides`, `quotes`, `document_templates`, `tasks`, `notifications`, `email_template_versions`, `communication_preferences`, `ai_communication_memory`, `metric_snapshots`

**Tier 3 (FK → Tier 2):** `appointments`, `quote_items`, `quote_versions`, `ai_quote_recommendations`, `jobs`, `email_automations`

**Tier 4 (FK → Tier 3):** `job_assignments`, `invoices`, `email_automation_runs`

**Tier 5 (FK → Tier 4):** `invoice_items`, `payments`, `documents`

**Append-only (no FK, create any time after Tier 0):** `email_logs`, `ai_logs`, `activity_logs`, `domain_events`, `platform_audit_log`

**Platform (separate from company schema):** `platform_sessions`, `platform_support_sessions`, `company_subscription_overrides`, `platform_metric_snapshots`

---

## 12. Index Creation Order

All indexes are created in migration 016 after all tables exist. The complete index list is defined in DATABASE_ARCHITECTURE.md §10. Key index categories:

- **Tenant scoping:** Every table has `idx_{table}_company_id ON {table}(company_id)` — this is the most-used filter
- **Status filtering:** Partial indexes on `status` columns (e.g., active quotes only)
- **Soft delete:** Partial indexes `WHERE deleted_at IS NULL` on all business entities
- **Sequence lookups:** Indexes on `quote_number`, `job_number`, `invoice_number`
- **Email tracking:** `idx_email_logs_resend_id` for webhook matching
- **Domain events:** `idx_domain_events_unprocessed WHERE processed_at IS NULL` for the 15-minute monitor cron
- **Append-only logs:** Indexes by `(company_id, created_at DESC)` for paginated history

---

## 13. Database Functions and Triggers

Created in migration 017:

| Object | Type | Purpose |
|--------|------|---------|
| `gen_uuid_v7()` | Function | UUID v7 generator — created in migration 001, used by all PRIMARY KEY DEFAULT clauses |
| `public.auth_company_id()` | Function | `(auth.jwt() -> 'app_metadata' ->> 'company_id')::uuid` — used by all RLS policies |
| `public.auth_user_role()` | Function | `(auth.jwt() -> 'app_metadata' ->> 'role')::text` — used by role-based RLS conditions |
| `update_updated_at()` | Trigger function | Sets `updated_at = now()` on UPDATE — applied to all tables with `updated_at` column |
| `generate_sequence_number(company_id, sequence_type)` | Function | Atomically increments sequence counter on `companies` row and returns formatted string using LPAD |
| `reject_snapshot_field_updates()` | Trigger function | Raises exception if any snapshot field changes on a `documents` row with `generation_status = 'generated'` |
| `chain_platform_audit_log()` | Trigger function | Computes SHA-256 hash of new row + previous row's hash for tamper-evident chaining |
| `custom_access_token_hook(event)` | Hook function | Created in migration 019; reads `profiles.company_id` and `profiles.role`, injects into JWT `app_metadata` |

---

## 14. RLS Enablement Order

Migration 018 enables RLS on every table in this order:

1. Enable RLS: `ALTER TABLE {table} ENABLE ROW LEVEL SECURITY;` for all tables
2. Create `SELECT` policies (tenant isolation + soft-delete filter)
3. Create `INSERT` policies (enforce `company_id` from JWT, not user input)
4. Create `UPDATE` policies (additional field-level checks where needed)
5. Create `DELETE` policies (soft-delete only; hard DELETE restricted)
6. Create platform admin bypass policies (service role for break-glass sessions)
7. Verify: query each table as anonymous user → expect 0 rows

### 14.1 RLS Policy Pattern

Every company-scoped table follows this pattern:

```sql
-- SELECT
CREATE POLICY "{table}_select" ON {table}
  FOR SELECT USING (
    public.auth_company_id() = company_id
    AND deleted_at IS NULL  -- omit on append-only logs
  );

-- INSERT
CREATE POLICY "{table}_insert" ON {table}
  FOR INSERT WITH CHECK (
    public.auth_company_id() = company_id
  );

-- UPDATE
CREATE POLICY "{table}_update" ON {table}
  FOR UPDATE USING (
    public.auth_company_id() = company_id
    AND deleted_at IS NULL
  );
```

Append-only tables (`email_logs`, `ai_logs`, `activity_logs`, `domain_events`) have SELECT only — no UPDATE or DELETE policy is created. Attempting to UPDATE these tables from application code must fail at the RLS layer.

---

## 15. RLS Verification Strategy

RLS verification is not optional and not assumed. Every table must have a passing RLS isolation test before the feature that writes to it is considered complete.

### 15.1 Verification Pattern

For every table, a Vitest integration test must:

```
1. Create two companies: Company A and Company B (via service_role client)
2. Create a profile in each company
3. Insert test rows for Company A
4. Authenticate as Company B user
5. Query the table → assert: 0 rows returned
6. Attempt to insert with company_id = Company A → assert: rejected
7. Attempt to UPDATE Company A's row using Company B's JWT → assert: rejected
```

This pattern is in `tests/integration/rls/rls-isolation.test.ts` and runs in CI on every push.

### 15.2 Service Role Test Client

Tests that set up multi-tenant fixtures use the Supabase service role client (bypasses RLS). This is the only acceptable use of the service role client in tests. The service role key is injected via `TEST_SUPABASE_SERVICE_ROLE_KEY` environment variable in test environments only.

---

## 16. Seed Data Catalogue

Created by migration 020 (development) and an equivalent production seed applied once at launch.

### 16.1 Permission Groups (seeded per new company at onboarding)

| Group Slug | Display Name | Default Permissions |
|------------|-------------|---------------------|
| `dispatcher` | Dispatcher | `leads.*`, `quotes.*`, `jobs.*`, `customers.*` |
| `estimator` | Estimator | `leads.*`, `quotes.*`, `customers.view` |
| `office-manager` | Office Manager | All except `settings.banking` |
| `billing` | Billing | `invoices.*`, `payments.*`, `customers.view` |

These groups are seeded for every new company at creation (not global). They are starting points the Owner can modify.

### 16.2 Email Templates (seeded per new company)

27 lifecycle stages from EMAIL_SYSTEM.md §3 are seeded for every new company. They are marked `is_system_default = true` and can be deactivated but not deleted.

| # | Template Slug | Stage | Class |
|---|--------------|-------|-------|
| 1 | `lead-received` | Lead intake | transactional |
| 2 | `quote-sent` | Quote delivery | transactional |
| 3 | `quote-follow-up-1` | Quote follow-up (24h) | transactional |
| 4 | `quote-follow-up-2` | Quote follow-up (3d) | transactional |
| 5 | `quote-expiry-warning` | Quote expiry (48h before) | transactional |
| 6 | `quote-accepted` | Booking confirmation | transactional |
| 7 | `contract-sent` | Contract delivery | transactional |
| 8 | `deposit-request` | Deposit payment link | transactional |
| 9 | `deposit-confirmed` | Deposit receipt | transactional |
| 10 | `booking-confirmed` | Booking summary | transactional |
| 11 | `pre-move-preparation` | Preparation guide (7d before) | transactional |
| 12 | `move-reminder` | Move day reminder (48h) | transactional |
| 13 | `crew-on-the-way` | Day-of notification | transactional |
| 14 | `post-move-thank-you` | Post-move thanks | transactional |
| 15 | `invoice-sent` | Invoice delivery | transactional |
| 16 | `payment-reminder-1` | Overdue (48h) | transactional |
| 17 | `payment-reminder-2` | Overdue (7d) | transactional |
| 18 | `payment-confirmed` | Payment receipt | transactional |
| 19 | `review-request` | Review solicitation | marketing |
| 20 | `crew-job-assignment` | Crew notification (internal) | transactional |
| 21 | `crew-job-reminder` | Crew day-before reminder | transactional |
| 22 | `quote-declined` | Quote declined acknowledgment | transactional |
| 23 | `job-cancelled` | Cancellation confirmation | transactional |
| 24 | `damage-report-sent` | Damage documentation delivery | transactional |
| 25 | `invoice-overdue-final` | Final overdue notice | transactional |
| 26 | `portal-access-link` | Customer portal access | transactional |
| 27 | `general-follow-up` | General outreach | transactional |

### 16.3 Email Automations (seeded per new company, all inactive)

12 automation rules are seeded inactive. The owner must explicitly activate each:

| # | Trigger | Template | Delay | Mode |
|---|---------|----------|-------|------|
| 1 | `quoting.quote.sent` | `quote-follow-up-1` | 24h | approval |
| 2 | `quoting.quote.sent` | `quote-follow-up-2` | 72h | approval |
| 3 | `quoting.quote.sent` | `quote-expiry-warning` | 5d | auto_send |
| 4 | `quoting.quote.accepted` | `booking-confirmed` | 0 | auto_send |
| 5 | `jobs.job.scheduled` | `pre-move-preparation` | 0 | auto_send |
| 6 | `jobs.job.scheduled` | `move-reminder` | −48h | auto_send |
| 7 | `jobs.job.completed` | `post-move-thank-you` | 2h | auto_send |
| 8 | `jobs.job.completed` | `review-request` | 48h | approval |
| 9 | `invoicing.invoice.sent` | `payment-reminder-1` | 48h | auto_send |
| 10 | `invoicing.invoice.sent` | `payment-reminder-2` | 7d | auto_send |
| 11 | `invoicing.payment.received` | `payment-confirmed` | 0 | auto_send |
| 12 | `crm.lead.received` | `lead-received` | 0 | approval |

### 16.4 Bivro Platform Sender Identity (seeded globally)

One platform-owned `email_sender_identities` row with `company_id = NULL` (platform-level, not tenant-level):

```
email: noreply@mail.bivro.io
name: Bivro
tier: bivro_managed
is_default: true (for platform emails)
```

### 16.5 Development Seed Data

`supabase/seed.sql` creates:
- 1 demo company: "Alpine Moving Co." (slug: `alpine-moving`)
- 1 owner profile: `owner@alpine.dev` / `password: devpassword1!`
- 1 office profile: `office@alpine.dev`
- 3 demo customers
- 5 demo leads
- 3 demo quotes (draft, sent, accepted)
- 1 demo job (in_progress)
- 1 demo invoice
- Permission groups (4 defaults)
- Email templates (27 defaults, inactive automations)

---

## 17. Authentication Setup

### 17.1 Company User Authentication

Company users (owner and office roles) authenticate at `app.bivro.io` or `{slug}.bivro.io` using Supabase Auth:

**Method 1 — Email + password** (all tiers)
**Method 2 — Magic link** (all tiers; fallback)
**Method 3 — SAML SSO** (Business + Enterprise; V1.5)

**Tenant resolution on login:**
1. User enters email
2. Middleware looks up email domain in `company_email_domains` (if exists) → resolve `company_id`
3. If no domain match: show tenant selector or resolve from previous session cookie
4. JWT is issued with `company_id` + `role` in `app_metadata` via `custom_access_token_hook`

**Invite flow:**
1. Owner creates invite → `user_invitations` row with `token_hash` (raw token is NOT stored)
2. Invite email sent via Resend with invite link containing the raw token
3. User clicks link → application verifies: hash the token → compare with `token_hash`
4. If valid: Supabase Auth account created/updated → `profiles` row created → invite consumed

### 17.2 Customer Portal Authentication (No-Auth)

Customers do not have Supabase Auth accounts. They access quotes/invoices via token-authenticated links:

```
https://app.bivro.io/portal/{token}
```

The `token` is a short-lived signed URL token. The route handler validates the token, resolves the quote/invoice, and renders the portal page using the service role client (no JWT required). NEVER expose company data to portal tokens — only the specific document the token was issued for.

### 17.3 Platform Admin Authentication

Platform staff authenticate at `admin.bivro.io` only:

1. Google OAuth 2.0 restricted to `@bivro.io` Workspace domain
2. Google callback validates `hd` claim = `bivro.io` — any other domain is rejected
3. Platform session created in `platform_sessions` table
4. Session cookie set with `HttpOnly; Secure; SameSite=Strict`
5. Every request to `/admin/*` must have: Host = `admin.bivro.io` AND valid platform session cookie

---

## 18. Company Onboarding Flow

When a new company signs up:

```
1. User submits signup form (company name, email, password)
2. Supabase Auth: create auth.users record
3. after_signup hook fires (PostgreSQL function or Edge Function)
4. Hook creates:
   a. companies row (name, slug, subscription_tier: 'free', subscription_status: 'trialing', trial_ends_at: NOW() + 14 days)
   b. profiles row (id = auth.uid(), company_id, role: 'owner', first_name, last_name, email)
   c. company_settings row (defaults)
   d. Default permission groups (4 groups: dispatcher, estimator, office-manager, billing)
   e. Default email templates (27 rows, is_system_default: true)
   f. Default email automations (12 rows, is_active: false)
   g. Default email_sender_identity (bivro_managed tier)
5. custom_access_token_hook: sets company_id + role in app_metadata
6. Redirect to onboarding wizard (7-step guided sequence per UI_UX_SYSTEM.md §17)
```

**Onboarding wizard (7 steps):** Company info → Address → Service area → Pricing basics → First crew member → First vehicle → Send test quote

---

## 19. Tenant Routing

### 19.1 Domain Model

| Domain | Content | Company resolved via |
|--------|---------|---------------------|
| `app.bivro.io` | Operator dashboard | Email/session |
| `{slug}.bivro.io` | Operator dashboard (branded) | Subdomain slug |
| `app.bivro.io/portal/{token}` | Customer portal | Token |
| `admin.bivro.io` | Platform Admin | Google OAuth + Host check |

### 19.2 Next.js Middleware

`middleware.ts` (runs on every request) enforces:

```
1. If Host === admin.bivro.io → verify platform admin session → allow /admin/* or redirect
2. If Host === {slug}.bivro.io → resolve company_id from slug → set in request context
3. If path starts with /portal → validate portal token → set document context
4. All other paths: validate Supabase JWT → extract company_id + role → inject AuthContext
```

The middleware runs at the Vercel Edge. It is the first line of defense and must not be bypassed.

---

## 20. Owner and Office Authorization Model

### 20.1 Permission Resolution at Runtime

Every tRPC procedure (and every server action) that modifies data goes through this check:

```
1. Extract role from JWT: public.auth_user_role()
2. If role === 'owner': ALLOW unconditionally
3. If role === 'office':
   a. Resolve user's permission groups from user_permission_groups
   b. Resolve user's permission overrides from user_permission_overrides
   c. Compute effective permission set: union(group_perms) ± overrides
   d. Check if required permission is in effective set
   e. If yes: ALLOW. If no: return 403.
```

This logic lives in `modules/iam/service.ts` and is exposed via `modules/iam/interface.ts`. The tRPC middleware calls it for every protected procedure.

### 20.2 64 Permissions Across 12 Resource Groups

See PRODUCT_REQUIREMENTS.md §3.3 for the complete permission catalogue. Implementation order: permission checking is wired during Phase 4 (Permissions and Audit). Before Phase 4, all tRPC procedures block all `office` role access.

---

## 21. Platform Admin Separation

The platform admin portal shares the Next.js codebase with the company portal in V1 (extracted to separate deployment in V2+). Separation is enforced by:

1. **Host header check** in middleware: any request to `/admin/*` from a host other than `admin.bivro.io` receives `403 Forbidden` before any route code runs.
2. **Separate session store:** Platform admin sessions use `platform_sessions` table, completely separate from Supabase Auth company sessions. A company user JWT cannot access platform routes.
3. **Separate database clients:** Platform admin routes use the service role client with explicit tenant scoping applied in application code. They do NOT use the anon/user JWT client.
4. **No shared tRPC router:** Platform admin API uses its own tRPC router (`/trpc/routers/platform/`) that is never merged into the company-facing root router.

---

## 22. Storage Bucket Setup

### 22.1 Bucket Configuration

```
Bucket name: documents
Type: Private (no public access)
Max file size: 20 MB
Allowed MIME types: application/pdf, image/jpeg, image/png, image/webp
```

### 22.2 Canonical Storage Path

```
{company_id}/{entity_folder}/{entity_id}/{document_type}-v{version}-{document_id}.pdf

Examples:
  {uuid}/quotes/{quote_uuid}/quote_pdf-v1-{doc_uuid}.pdf
  {uuid}/jobs/{job_uuid}/damage_report-v1-{doc_uuid}.pdf
  {uuid}/invoices/{invoice_uuid}/invoice_pdf-v1-{doc_uuid}.pdf
```

**Immutability rule:** Once a path is written, it is NEVER overwritten. A new document version creates a new path (incremented version number). The old file remains at its original path permanently.

### 22.3 Signed URL TTL

- Web portal (operator): 1 hour
- Customer portal: 15 minutes

URL generation happens server-side only. The signed URL is returned to the client; the client never has direct storage credentials.

---

## 23. Email Infrastructure Setup

### 23.1 Resend Configuration

1. Create Resend account at resend.com
2. Add sending domain: `mail.bivro.io`
3. Configure DNS records: SPF, DKIM, DMARC
4. Create API key — server-only, never expose to client
5. Configure webhook endpoint: `https://app.bivro.io/api/webhooks/email-tracking`
6. Configure Svix signing secret → `RESEND_WEBHOOK_SECRET`

### 23.2 Webhook Verification

Every inbound Resend webhook request must be verified:

```typescript
import { Webhook } from 'svix'
const wh = new Webhook(process.env.RESEND_WEBHOOK_SECRET!)
wh.verify(rawBody, headers)
// throws if signature invalid — never process unverified events
```

### 23.3 Email Sending Flow

```
1. Domain event triggers Communications module handler
2. Handler checks communication_preferences: opted_out? email_deliverability?
3. Handler selects email template (current version for customer's preferred language)
4. Handler resolves variables (customer name, quote number, portal link, etc.)
5. Pre-send validation: all required variables present; attached_document_id valid
6. Resend API call with idempotency_key from email_logs.idempotency_key
7. email_logs row inserted (status: 'sent', resend_id populated)
8. On Resend webhook: email_logs tracking fields updated
```

---

## 24. PDF Generation Infrastructure

### 24.1 Setup

1. Puppeteer is NOT installed in the Next.js app (exceeds Vercel 50MB bundle limit)
2. PDF generation runs in a Supabase Edge Function: `supabase/functions/generate-pdf/index.ts`
3. The Edge Function receives: `{ documentId, templateId, companyId, entityId, entityType }`
4. The Edge Function:
   a. Loads template HTML from `document_templates` row
   b. Compiles template: replaces `{{ variable }}` tokens with entity data
   c. Launches Puppeteer (using `puppeteer-core` bundled with the Edge Function)
   d. Renders HTML → PDF buffer
   e. Uploads to Supabase Storage at canonical path
   f. Updates `documents` row: `storage_path`, `generation_status = 'generated'`, `content_hash`
   g. Writes `document.generated` domain event

### 24.2 Trigger

PDF generation is triggered by database webhook on `domain_events` INSERT for event types:
- `quoting.quote.sent` → generate quote_pdf
- `jobs.job.completed` → generate work_order, damage_report if exists
- `invoicing.invoice.created` → generate invoice_pdf
- `invoicing.payment.received` → generate payment_receipt

### 24.3 Immutability Guarantee

The `reject_snapshot_field_updates()` trigger on `documents` prevents modification of any snapshot or storage field once `generation_status = 'generated'`. Any attempt to update `storage_path`, `content_hash`, `company_snapshot`, etc., raises a PostgreSQL exception.

---

## 25. AI Infrastructure Setup

### 25.1 Model Constants File

`lib/ai/models.ts` is the ONLY location where AI model identifiers appear:

```typescript
export const AI_MODELS = {
  HAIKU: 'claude-haiku-4-5-20251001',   // fast, cheap: lead scoring, pattern obs
  SONNET: 'claude-sonnet-4-6',           // primary: quoting, email, CEO brief
  OPUS: 'claude-opus-4-8',               // complex: profit analysis, simulation
} as const
```

All AI task implementations import from this file. Hardcoding model strings elsewhere is forbidden (CODING_STANDARDS.md §18).

### 25.2 14 AI Tasks

| ID | Task | Model | Trigger |
|----|------|-------|---------|
| AI-001 | Inventory Parse | SONNET | User input in quote builder |
| AI-002 | Quote Estimation | SONNET | Quote estimation requested |
| AI-003 | Lead Scoring | HAIKU | New lead created |
| AI-004 | Email Draft | SONNET | User requests AI email |
| AI-005 | CEO Brief | SONNET | Daily 7AM cron |
| AI-006 | Post-Job Replay | SONNET | Job marked complete |
| AI-007 | Pattern Observation | HAIKU | Nightly cron |
| AI-008 | Profit Analysis | SONNET | Weekly cron (Monday) |
| AI-009 | Simulation | SONNET | Operator triggers in UI |
| AI-010 | Learning Report | SONNET | Monthly cron (1st) |
| AI-011 | Quote Follow-up Draft | HAIKU | Quote unopened 24h+ |
| AI-012 | Scheduling Conflict Alert | HAIKU | Job created with overlap |
| AI-013 | Invoice Risk Flag | HAIKU | Invoice 7+ days unpaid |
| AI-014 | Service Suggestion (inline) | HAIKU | Observation matches active quote |

### 25.3 AI Safety Invariants

Every AI call must:
1. Return within the confidence threshold — if confidence < threshold, surface as `partial` or `fallback`, never as `success`
2. Log to `ai_logs` before returning to the caller (token count, model, cost_millicents, result_status)
3. Never execute an action directly — AI outputs are proposals surfaced to the operator
4. Never include PII in log entries (customer names, addresses, phone numbers)
5. Check token budget before calling Anthropic API: if `ai_disabled` flag set on company, skip with notification

### 25.4 Token Budget Enforcement

A daily Vercel Cron aggregates `ai_logs.cost_millicents` per company. If 80% of tier limit consumed: create `notifications` row for owner (warning). If 100%: set `companies.settings->>'ai_disabled' = 'true'`. AI features gate on this flag.

---

## 26. Cron Job Catalogue

All cron jobs are implemented as Next.js API route handlers in `app/api/cron/`. Each is authenticated by verifying `Authorization: Bearer {CRON_SECRET}` in the request header. An unauthorized cron request returns 401 with no processing.

| Route | Schedule | Job | Tables affected |
|-------|----------|-----|----------------|
| `/api/cron/invitation-expiry` | `5 0 * * *` (00:05) | Expire pending invitations | `user_invitations` |
| `/api/cron/ceo-brief` | `0 7 * * *` (07:00) | AI-005 CEO Brief (all active companies) | `ai_logs`, `notifications` |
| `/api/cron/analytics` | `0 6 * * *` (06:00) | Aggregate metric_snapshots | `metric_snapshots`, `ai_logs` |
| `/api/cron/overdue-invoices` | `0 9 * * *` (09:00) | Detect overdue invoices → domain events | `invoices`, `domain_events` |
| `/api/cron/quote-expiry` | `0 8 * * *` (08:00) | Expire sent/viewed quotes | `quotes`, `domain_events` |
| `/api/cron/lead-scoring` | `0 2 * * *` (02:00) | AI-003 Lead scoring refresh | `ai_logs`, `leads` |
| `/api/cron/pattern-observation` | `0 1 * * *` (01:00) | AI-007 Pattern observation batch | `ai_logs`, `ai_communication_memory` |
| `/api/cron/profit-analysis` | `0 6 * * 1` (Monday 06:00) | AI-008 Weekly profit analysis | `ai_logs`, `notifications` |
| `/api/cron/fleet-maintenance` | `0 9 * * 1` (Monday 09:00) | Fleet maintenance alert check | `vehicles`, `notifications` |
| `/api/cron/learning-report` | `0 7 1 * *` (1st of month 07:00) | AI-010 Monthly learning report | `ai_logs`, `notifications` |
| `/api/cron/domain-event-monitor` | `*/15 * * * *` (every 15 min) | Alert if unprocessed domain events > 5 min old | `domain_events` (read-only) |
| `/api/cron/notifications-cleanup` | `0 3 */90 * *` (every 90 days) | Hard-delete read notifications > 90 days | `notifications` |

Vercel Cron configuration lives in `vercel.json`.

---

## 27. Domain Event Infrastructure

### 27.1 Event Bus Architecture

`domain_events` is the central event bus. Every state change in Bivro writes a domain event. Supabase Database Webhook watches for INSERT and POSTs to `/api/webhooks/domain-event`.

### 27.2 Event Router

`/api/webhooks/domain-event/route.ts`:
1. Verify request is from Supabase (IP allowlist or signature header)
2. Parse `event_type` from payload
3. Route to module handler:
   - `quoting.*` → `modules/quoting/event-handlers.ts`
   - `jobs.*` → `modules/jobs/event-handlers.ts`
   - `invoicing.*` → `modules/invoicing/event-handlers.ts`
   - `crm.*` → `modules/crm/event-handlers.ts`
   - `comms.*` → `modules/communications/event-handlers.ts`
   - `document.*` → `modules/documents/event-handlers.ts`
4. Handler processes event; marks `domain_events.processed_at = NOW()`
5. On error: set `domain_events.processing_error`, capture to Sentry

### 27.3 Event Type Naming Convention

`{module}.{entity}.{action}` — e.g., `quoting.quote.sent`, `jobs.job.completed`, `invoicing.payment.received`

---

## 28. Audit Logging Setup

### 28.1 `activity_logs` (Business Actions)

Every user-initiated state change writes to `activity_logs`. This is a Tier 1 log — human-readable, tenant-scoped, retained indefinitely.

Pattern in every tRPC mutation:

```typescript
await db.insert(activityLogs).values({
  company_id: ctx.companyId,
  actor_id: ctx.userId,
  actor_type: 'user',
  actor_email: ctx.email,        // snapshot at time of action
  actor_name: ctx.fullName,      // snapshot at time of action
  action: 'quote.sent',
  entity_type: 'quote',
  entity_id: quoteId,
  before_snapshot: beforeData,   // JSONB
  after_snapshot: afterData,     // JSONB
})
```

### 28.2 `platform_audit_log` (Platform Admin Actions)

Every platform admin action writes a hash-chained entry. The `chain_platform_audit_log()` trigger function computes `SHA-256(row_data || previous_hash)` on each INSERT, creating a tamper-evident chain. 7-year retention. See PLATFORM_ADMIN.md §10.

---

## 29. Observability and Error Monitoring

### 29.1 Sentry Setup

1. Create Sentry project at sentry.io
2. `pnpm add @sentry/nextjs`
3. Run Sentry wizard: `npx @sentry/wizard@latest -i nextjs`
4. Configure `sentry.server.config.ts`, `sentry.client.config.ts`, `sentry.edge.config.ts`
5. Set environment: `development` / `staging` / `production`
6. Enable session replay for `production` environment only (PII scrubbing configured)

### 29.2 PII Scrubbing in Sentry

Sentry `beforeSend` hook must strip:
- `email` from any event data
- `phone` from any event data
- `address*` from any event data
- Customer `name` from breadcrumbs

### 29.3 Structured Logging

All application logs use structured JSON emitted to stdout (Vercel collects). Log format:

```json
{
  "level": "info|warn|error",
  "timestamp": "ISO-8601",
  "requestId": "req_...",
  "companyId": "uuid",
  "userId": "uuid",
  "module": "quoting",
  "message": "...",
  "durationMs": 342
}
```

No PII in any log statement — no customer names, emails, phone numbers, or addresses.

---

## 30. Billing and Subscription Setup

### 30.1 Stripe Configuration

1. Create Stripe account
2. Create Products and Prices for each tier:
   - Starter: Monthly ($49) + Annual ($39×12)
   - Pro: Monthly ($199) + Annual ($159×12)
   - Business: Monthly ($499) + Annual ($399×12)
   - Enterprise: Custom (manual)
3. Configure webhook endpoint: `https://app.bivro.io/api/webhooks/stripe`
4. Subscribe to events: `customer.subscription.*`, `invoice.*`, `payment_intent.*`
5. Record webhook signing secret → `STRIPE_WEBHOOK_SECRET`
6. Add all Stripe Price IDs to environment variables

### 30.2 Webhook Signature Verification

```typescript
const event = stripe.webhooks.constructEvent(
  rawBody,
  req.headers['stripe-signature']!,
  process.env.STRIPE_WEBHOOK_SECRET!
)
```

Never process a Stripe webhook that fails signature verification.

### 30.3 Subscription State Machine

See PLATFORM_ADMIN.md §9. Key states: `trialing → active → past_due → cancelled / paused`. State lives in `companies.subscription_status`. The Stripe webhook handler transitions state; the application reads state to gate features.

---

## 31. Application Module Dependency Graph

```
lib/supabase (clients: browser, server, service-role)
    ↓
lib/types (database.ts, domain.ts, api.ts)
    ↓
lib/ai/models.ts (AI model constants)
    ↓
modules/iam (auth context, permission resolution, middleware)
    ↓              ↓
modules/crm    modules/workforce   modules/fleet
    ↓
modules/quoting (depends on: iam, crm, ai, documents)
    ↓
modules/jobs (depends on: iam, crm, quoting, workforce, fleet)
    ↓              ↓
modules/invoicing  modules/documents (depends on: iam, quoting, jobs)
    ↓
modules/payments (depends on: iam, invoicing)
    ↓
modules/communications (depends on: iam, crm, quoting, jobs, invoicing, documents)
    ↓
modules/ai (depends on: all domain modules for context compilation)
    ↓
modules/analytics (depends on: all domain modules for metric aggregation)
```

**Rule:** No module may import from a module below it in this dependency graph. Circular dependencies are build-breaking.

---

## 32. Testing Strategy

### 32.1 Test Pyramid

| Layer | Framework | Coverage target | What is tested |
|-------|-----------|----------------|----------------|
| Unit | Vitest | 80% of service functions | Pure logic: calculations, transformations, validators, formatters |
| Integration | Vitest + real Supabase local | Every tRPC procedure | DB writes, RLS isolation, permission checks |
| E2E | Playwright | All P0 user flows | Complete browser workflows |

### 32.2 Test Matrix

| Test Category | Required | When | Gate |
|--------------|---------|------|------|
| RLS isolation (all tables) | Mandatory | After Phase 2 | Blocks feature work |
| Permission checks (office role) | Mandatory | After Phase 4 | Blocks Phase 5+ |
| Webhook signature verification | Mandatory | After Phase 10 | Blocks email go-live |
| Document immutability | Mandatory | After Phase 9 | Blocks PDF go-live |
| Email idempotency | Mandatory | After Phase 10 | Blocks email go-live |
| AI token budget | Mandatory | After Phase 11 | Blocks AI go-live |
| Tenant isolation E2E | Mandatory | Before launch | Launch gate |
| P0 feature E2E | Mandatory | Before launch | Launch gate |
| Security headers scan | Mandatory | Before launch | Launch gate |
| Accessibility (WCAG 2.2 AA) | Required | Phase 15 | Launch gate |

---

## 33. Security Testing

### 33.1 Security Gates (must pass before launch)

1. **RLS boundary test:** Every table has a failing cross-tenant query test that passes
2. **JWT forgery test:** A JWT with a forged `company_id` must return 0 rows from all tables
3. **Service role exposure scan:** `grep -r "SERVICE_ROLE_KEY" app/ components/ modules/` must return 0 results
4. **PII logging scan:** `grep -r "customer_name\|phone_number\|email" app/api/` — verify no PII in log calls
5. **Webhook signature bypass test:** POST to webhook endpoints without valid signature must return 401
6. **Admin host check test:** POST to `/admin/*` with Host: `app.bivro.io` must return 403
7. **Portal token brute-force protection:** Portal token must be cryptographically random, not guessable
8. **SQL injection test:** All inputs go through Zod + Drizzle parameterization — no raw string SQL with user input
9. **IDOR test:** Attempt to access another tenant's entity by guessing ID — must return 404 (not 403, to prevent enumeration)
10. **Stripe webhook replay attack test:** Replaying a Stripe webhook with `stripe-signature` timestamp > 5 minutes old must be rejected

---

## 34. CI/CD Setup

### 34.1 CI Pipeline (GitHub Actions)

Every pull request runs:

```yaml
jobs:
  validate:
    steps:
      - pnpm install --frozen-lockfile
      - pnpm typecheck          # tsc --noEmit — zero errors required
      - pnpm lint               # eslint — zero warnings required
      - pnpm format:check       # prettier — no formatting changes
      - supabase start
      - pnpm db:migrate
      - pnpm test               # vitest — all tests pass
      - pnpm test:coverage      # coverage report (not gating yet; added Phase 15)

  e2e:
    needs: validate
    steps:
      - playwright install
      - pnpm test:e2e
```

No pull request may merge if any step fails. There are no exceptions.

### 34.2 Deployment Pipeline

```
Push to feature branch → CI validates → Preview deployment on Vercel (staging Supabase)
Push to staging branch → CI validates → Staging deployment on Vercel
Push to main → CI validates → Production deployment on Vercel → Post-deploy smoke test
```

### 34.3 Pre-commit Hooks (Husky + lint-staged)

```json
{
  "lint-staged": {
    "*.{ts,tsx}": ["eslint --fix", "prettier --write"],
    "*.{json,md,css}": ["prettier --write"]
  }
}
```

---

## 35. Deployment Sequence

### 35.1 First Production Deployment

```
1. Apply all migrations to production Supabase (migration 001 → 020)
2. Verify: query each table as anonymous → 0 rows (RLS active)
3. Configure Supabase Auth (email templates, redirect URLs, hooks)
4. Configure Storage bucket and RLS
5. Configure Supabase Database Webhooks
6. Set all production environment variables in Vercel
7. Deploy: git push origin main
8. Verify: /api/health returns 200
9. Verify: signup flow creates company + profile + JWT with company_id
10. Verify: Stripe webhook endpoint receives test event
11. Verify: Resend webhook endpoint receives test event
12. Verify: PDF generation Edge Function responds to test invocation
13. Verify: domain_events webhook fires and handler processes event
14. Run post-deploy smoke test suite
```

### 35.2 Subsequent Deployments

```
1. Merge to main triggers Vercel deploy (automatic)
2. If migration files changed: apply to production DB before or during deploy
   ↳ Zero-downtime: Drizzle migrations use transactions; add-only operations are safe
3. Post-deploy smoke test runs automatically
4. Sentry monitors for error spike in first 15 minutes
5. Rollback trigger: error rate > 1% → revert Vercel to previous deployment
```

---

## 36. Rollback Strategy

### 36.1 Application Rollback

Vercel keeps the previous 10 deployments. Rollback command:

```
vercel rollback {deployment-url}
```

This takes effect in < 30 seconds.

### 36.2 Database Rollback

Database migrations are **NOT automatically rolled back** when an application rolls back. This is by design — destructive database operations (DROP, TRUNCATE) are forbidden in V1 migrations.

V1 migrations are additive only (CREATE TABLE, CREATE INDEX, ALTER TABLE ADD COLUMN, CREATE POLICY). Rolling back the application is safe — the new database columns/tables are simply unused by the old code.

If a migration must be undone, write a new forward migration that removes the new objects. Never edit or delete an existing migration file.

---

## 37. Backup and Disaster Recovery

### 37.1 Supabase Backups

Supabase Pro plan includes:
- **Daily backups:** 30-day retention
- **Point-in-time recovery (PITR):** 7 days (Pro); upgrade to 14-day PITR on Business plan

### 37.2 V1 Backup Schedule

- Automated daily backups via Supabase Pro: enabled by default
- Manual backup before every schema migration: `supabase db dump -f backup-{date}.sql`
- Storage bucket: Supabase Storage is backed by S3 — file durability is 99.999999999%

### 37.3 Recovery Time Objectives

| Scenario | RTO | RPO |
|----------|-----|-----|
| Application crash | < 5 min (Vercel auto-restart) | 0 (stateless) |
| Database corruption | < 4 hours (PITR restore) | < 1 hour |
| Full region outage | 24 hours (Supabase failover to new region) | < 24 hours |

---

## 38. V1 Exclusions

The following are explicitly OUT OF SCOPE for V1 and must not be implemented:

| Excluded Item | Authority |
|--------------|-----------|
| Crew/driver login accounts | DATABASE_ARCHITECTURE.md §4 |
| Customer login accounts | DATABASE_ARCHITECTURE.md §4 |
| Custom role names (Dispatcher, Estimator as JWT roles) | DATABASE_ARCHITECTURE.md §21 |
| Multi-location support | DATABASE_ARCHITECTURE.md §21 |
| Mobile app (Expo / React Native) | ARCHITECTURE.md §2 (V2+) |
| Inngest job orchestration | ARCHITECTURE.md §10 |
| Schema-per-tenant | DATABASE_ARCHITECTURE.md §21 |
| Cloudflare R2 (storage) | ARCHITECTURE.md §13 |
| Redis caching | ARCHITECTURE.md §2 |
| OpenTelemetry / Datadog | ARCHITECTURE.md §19 |
| Marketplace / lead gen | BUSINESS_MODEL.md §8 |
| SAML SSO | PLATFORM_ADMIN.md §12 |
| Embedded insurance | BUSINESS_MODEL.md §8 |
| QuickBooks integration | PRODUCT_REQUIREMENTS.md |
| Crew GPS tracking | PRODUCT_REQUIREMENTS.md |
| AI Simulation Engine (AI-009) in UI (backend OK) | AI_ENGINE.md §20 |
| AI Digital Twin | AI_ENGINE.md §20 |
| PDF generation on Railway | ARCHITECTURE.md §14 |
| Inngest email workflows | EMAIL_SYSTEM.md §19 |

---

## 39. V1.5 and V2 Dependency Boundaries

Features deferred to V1.5 or V2+ must not be designed into V1 data structures unless DATABASE_ARCHITECTURE.md explicitly includes the column as `nullable` with a comment noting the future use.

| V1.5 | V2+ |
|------|-----|
| Delivery receipt + bill of lading document types | Crew/driver login (user_role ENUM: add 'crew') |
| Credit note document type | Custom role names |
| SAML SSO (Business tier) | Multi-location (locations table) |
| Credit note payment type | Schema-per-tenant (Enterprise) |
| AI-009 Simulation UI | Marketplace tables |
| API v1 external (public) | Mobile Expo app |
| Booking confirmation doc type | Inngest job orchestration |
| Cancellation confirmation doc | Railway PDF workers |
| QuickBooks integration | Cloudflare R2 |

---

## 40. Third-Party Service Setup Checklist

Before deploying to staging, all services must be configured and tested:

- [ ] Supabase project created (staging)
- [ ] Supabase project created (production)
- [ ] Supabase Auth email templates configured (invite, password reset, magic link)
- [ ] Resend domain verified (`mail.bivro.io`): SPF, DKIM, DMARC all green
- [ ] Resend webhook endpoint configured and verified
- [ ] Stripe account created; products and prices created for all tiers
- [ ] Stripe webhook endpoint configured and verified
- [ ] Sentry project created; DSN configured in both staging and production
- [ ] Vercel project created; domains configured (`app.bivro.io`, `admin.bivro.io`)
- [ ] GitHub repository connected to Vercel for CI/CD
- [ ] Google OAuth credentials created; restricted to `@bivro.io` domain
- [ ] All environment variables set in Vercel (staging + production)
- [ ] Vercel Cron jobs configured in `vercel.json` and verified in dashboard

---

## 41. Launch-Readiness Checklist

### 41.1 Security Gates (all must pass)

- [ ] RLS isolation test: all tables pass cross-tenant isolation
- [ ] JWT forgery test: forged company_id returns 0 rows
- [ ] Service role key not exposed in any client-side code
- [ ] No PII in any log statements (automated scan)
- [ ] Webhook signature verification working (Resend + Stripe)
- [ ] Admin host check enforced (admin.bivro.io only)
- [ ] Portal tokens are cryptographically random (min 32 bytes entropy)
- [ ] All API inputs validated with Zod before touching database
- [ ] HTTPS enforced; HSTS header configured
- [ ] Security headers: CSP, X-Frame-Options, X-Content-Type-Options

### 41.2 Functional Gates (all P0 features working)

- [ ] Company signup and onboarding (7-step wizard)
- [ ] Owner login, invite office user, accept invite
- [ ] Create lead → convert to quote → send quote → customer views portal
- [ ] Accept quote → confirm job → assign crew → mark complete
- [ ] Generate invoice → record payment → generate receipt
- [ ] PDF generation working (quote, invoice, receipt)
- [ ] Email sending working (quote sent, booking confirmation, invoice)
- [ ] AI quote estimation working (AI-002)
- [ ] Platform admin login and tenant management

### 41.3 Reliability Gates

- [ ] Zero critical Sentry errors in 24h smoke test
- [ ] All Vercel Cron jobs have fired at least once
- [ ] Domain event webhook processes 100% of test events
- [ ] Stripe webhook processes subscription creation correctly
- [ ] Resend webhook updates email_logs tracking fields correctly
- [ ] PDF generation succeeds for all 7 V1 document types

### 41.4 Data Integrity Gates

- [ ] Sequence numbers are unique and sequential per company
- [ ] Document immutability trigger prevents snapshot field updates
- [ ] GDPR anonymization path works correctly (email_logs anonymized, not deleted)
- [ ] Platform audit log hash chain is valid after 100 test entries

---

## 42. Post-Launch Monitoring

### 42.1 Day 1 Monitoring (first 24 hours)

Monitor every 30 minutes:
- Sentry error rate: alert if > 1% of requests
- Domain event processing lag: alert if any event > 5 minutes unprocessed
- PDF generation success rate: alert if < 95%
- Email delivery rate: alert if < 99%

### 42.2 Week 1 KPIs

- Signups completed (account created → first quote sent)
- Onboarding wizard completion rate (target: > 70%)
- AI quote generation usage (AI-002 calls per day)
- Email open rate (target: > 40% for transactional)
- Error rate (target: < 0.5%)

---

## 43. Definition of Done

A phase is **done** when:
1. All deliverables are merged to `staging`
2. All required tests pass in CI
3. All security checks pass
4. All acceptance criteria verified manually on staging
5. No critical or high severity bugs open against this phase

A feature is **done** when:
1. Implementation is complete and merged
2. Unit tests exist and pass
3. Integration tests exist and pass (including RLS isolation test if touching DB)
4. TypeScript compiles with zero errors
5. ESLint passes with zero warnings
6. The tRPC procedure is tested end-to-end from client to database
7. The UI is responsive (mobile breakpoint tested in Playwright)

Bivro V1 is **done** when:
1. All 15 phases are complete
2. All launch-readiness gates pass
3. Staging has been running for 72 hours with zero critical errors
4. Production deployment completes successfully
5. Post-deploy smoke test suite passes

---

## 44. Phased Implementation Plan

---

### Phase 0 — Repository and Tooling

**Objective:** Empty repository → working development environment with all tooling configured.

**Prerequisites:** None.

**Deliverables:**
- Next.js 16 app initialized with App Router
- TypeScript strict config (`tsconfig.json`) with all required flags
- ESLint config (`eslint.config.mjs`) — Next.js + TypeScript rules, zero-warning mode
- Prettier config (`.prettierrc`) with `prettier-plugin-tailwindcss`
- Husky + lint-staged pre-commit hooks
- `pnpm-workspace.yaml` (single workspace, no packages)
- `vercel.json` (cron job schedule stubs, domain configuration)
- `.env.example` with all required variables listed
- `lib/env.ts` — Zod environment validation (throws on startup if required vars missing)
- `app/layout.tsx` — root layout with Sentry wrapper
- `app/(auth)/layout.tsx` — auth layout stub
- `app/(dashboard)/layout.tsx` — dashboard layout stub (no features yet)
- `app/admin/layout.tsx` — admin layout stub with host-check middleware
- `middleware.ts` — host routing stub (admin.bivro.io → /admin/*, company portal → /dashboard/*)
- Vitest config (`vitest.config.ts`)
- Playwright config (`playwright.config.ts`)
- GitHub Actions CI workflow
- `supabase/config.toml` — local Supabase config

**Database objects:** None.

**Application modules:** `lib/env.ts`, `lib/supabase/client.ts`, `lib/supabase/server.ts`, `lib/supabase/service-role.ts`

**Tests required:**
- `tests/unit/lib/env.test.ts` — env validation throws on missing vars
- `tests/unit/health.test.ts` — `/api/health` returns `{ status: 'ok' }`
- CI: typecheck, lint, format:check, test

**Security checks:**
- Verify service role key never appears in client-side Supabase client
- Verify middleware blocks `/admin/*` from non-admin hostnames

**Acceptance criteria:**
- `pnpm dev` starts without error
- `pnpm typecheck` passes zero errors
- `pnpm lint` passes zero warnings
- `pnpm test` passes
- `supabase start` starts local database
- `/api/health` returns `{ status: 'ok', timestamp: ISO-8601 }`

**Non-goals:** No database tables, no auth, no UI components beyond shells.

**Parallel:** Not applicable — first phase.

---

### Phase 1 — Infrastructure and Environments

**Objective:** Database migration framework active; Supabase configured for local and staging.

**Prerequisites:** Phase 0 complete.

**Deliverables:**
- Migration 001: pgcrypto, `gen_uuid_v7()`, all 21 ENUMs, auth helper functions
- `supabase/migrations/` directory structure established
- `drizzle.config.ts` configured for direct DB connection
- `lib/types/database.ts` — generated from Supabase type generation (empty schema = baseline types)
- Staging Supabase project configured (URL + keys in Vercel staging env)
- `pnpm db:migrate` applies migration 001 to local and staging
- `pnpm db:types` regenerates types after each migration
- Vercel project created; GitHub integration active; preview deployments enabled

**Database objects:** `gen_uuid_v7()`, all ENUMs (001)

**Application modules:** None (infrastructure only)

**Tests required:**
- `tests/integration/db/bootstrap.test.ts` — verify ENUMs exist, verify `gen_uuid_v7()` returns valid UUIDs, verify `public.auth_company_id()` function exists

**Security checks:** Verify no database credentials in committed files

**Acceptance criteria:**
- Migration 001 applies cleanly to local, staging
- `SELECT gen_uuid_v7()` returns a valid UUID in PostgreSQL
- `SELECT enum_range(NULL::subscription_tier)` returns all 5 values including 'starter'
- Preview deployment deploys on PR push

**Non-goals:** No tables, no auth, no application code.

**Parallel:** Phase 0 must complete; this phase cannot parallelize with Phase 0.

---

### Phase 2 — Database Foundation

**Objective:** All 37+ tables created; RLS enabled; indexes created; functions and triggers active.

**Prerequisites:** Phase 1 complete.

**Deliverables:**
- Migrations 002–020: all tables, indexes, functions, triggers, RLS policies, seed data
- `lib/types/database.ts` regenerated with full schema types
- Drizzle schema files in `lib/db/schema/` reflecting each table group
- RLS isolation integration test suite (one test per table, cross-tenant boundary)
- `pnpm db:seed` populates development seed data

**Database objects:** All tables (§9.2), all indexes (§12), all functions and triggers (§13), all RLS policies (§14), seed data (§16)

**Application modules:** None (database only; schema types generated)

**Tests required:**
- `tests/integration/rls/` — one test file per table group, testing cross-tenant isolation
- `tests/integration/db/uuid-v7.test.ts` — all PKs are UUID v7 format, not v4
- `tests/integration/db/sequence-numbers.test.ts` — `generate_sequence_number()` produces correct format
- `tests/integration/db/document-immutability.test.ts` — snapshot field update rejected on generated document

**Security checks:**
- Verify: `SELECT * FROM companies` as anonymous user returns 0 rows (RLS active)
- Verify: service role can read all tables (bypass RLS)
- Verify: `gen_random_uuid()` is not used anywhere in schema

**Acceptance criteria:**
- All 20 migrations apply in order without error
- Every table has RLS enabled: `SELECT relrowsecurity FROM pg_class WHERE relname = '{table}'` = true
- Cross-tenant RLS test passes for every table
- Document immutability trigger fires on attempt to update `storage_path` of a generated document
- Sequence number format is `QT-2026-0001` (not `QT-2026-  1` — space-padded)

**Non-goals:** No application code, no auth flows, no UI.

**Parallel:** Phase 1 must complete. Internal to this phase, migration groups 002–008 can be written in parallel (by different engineers) since FK deps are known, but must be applied in order.

---

### Phase 3 — Authentication and Tenancy

**Objective:** Full signup, login, invite, and JWT-injection flow working end-to-end.

**Prerequisites:** Phase 2 complete.

**Deliverables:**
- `modules/iam/service.ts` — signup, login, invite acceptance, session management
- `modules/iam/middleware.ts` — tRPC auth middleware; injects `{ companyId, userId, role }` into context
- `modules/iam/schemas.ts` — Zod schemas for all IAM inputs
- `modules/iam/interface.ts` — public interface for other modules
- `app/(auth)/login/page.tsx` — email + password login form
- `app/(auth)/signup/page.tsx` — company signup form (step 1 of onboarding)
- `app/(auth)/invite/[token]/page.tsx` — invite acceptance form
- `app/(dashboard)/page.tsx` — dashboard home stub (requires authenticated session)
- `middleware.ts` — fully wired: host routing + Supabase JWT validation + tenant injection
- `custom_access_token_hook` — verified working (migration 019 applied)
- Company onboarding hook — creates companies, profiles, default permission groups, email templates, automations on signup

**Database objects:** `companies`, `profiles`, `user_invitations`, `company_settings`, `permission_groups` (via onboarding hook)

**Application modules:** `modules/iam`

**Tests required:**
- `tests/integration/iam/signup.test.ts` — creates company, profile, JWT has company_id
- `tests/integration/iam/invite.test.ts` — invite created → token hashed → invite accepted → profile created
- `tests/integration/iam/jwt.test.ts` — JWT contains company_id and role in app_metadata
- `tests/e2e/auth/signup.e2e.ts` — full signup flow to dashboard
- `tests/e2e/auth/login.e2e.ts` — login → dashboard → logout

**Security checks:**
- Verify raw invite token is NOT stored in `user_invitations` (only `token_hash`)
- Verify JWT without `company_id` cannot access any dashboard route
- Verify admin.bivro.io host check blocks company users from `/admin/*`
- Verify portal route `/portal/{token}` does not require Supabase Auth session

**Acceptance criteria:**
- Signup → onboarding step 1 → session established with company_id in JWT
- Invite email sent → invite link with raw token → accepted → profile created → old token invalid
- Login → JWT refreshed → company_id + role in app_metadata
- Logout → session destroyed → redirect to login
- Cross-company: Company A user cannot read Company B's `companies` row

**Non-goals:** No permission system, no company portal features, no platform admin login.

**Parallel:** May not begin until Phase 2 is complete. Auth flow depends on profiles table (migration 002).

---

### Phase 4 — Permissions and Audit

**Objective:** Full RBAC working for office users; audit log capturing all state changes.

**Prerequisites:** Phase 3 complete.

**Deliverables:**
- `modules/iam/service.ts` extended: permission resolution (groups + overrides)
- `lib/permissions.ts` — 64-permission matrix lookup
- tRPC middleware: `protectedProcedure` (owner OR office with required permission)
- `app/(dashboard)/settings/team/page.tsx` — invite team, manage roles, assign permission groups
- Permission group CRUD tRPC procedures
- User permission override CRUD tRPC procedures
- `activity_logs` write pattern: utility function used by all mutations
- `platform_audit_log` write pattern for platform admin operations

**Database objects:** `permission_groups`, `user_permission_groups`, `user_permission_overrides`, `activity_logs`, `platform_audit_log`

**Application modules:** `modules/iam` (extended)

**Tests required:**
- `tests/integration/permissions/office-access.test.ts` — office user with permission can access; without permission is blocked (403)
- `tests/integration/permissions/owner-unrestricted.test.ts` — owner bypasses all permission checks
- `tests/integration/permissions/override.test.ts` — individual deny overrides group grant
- `tests/integration/audit/activity-log.test.ts` — every mutation writes activity_log entry

**Security checks:**
- Verify office user cannot grant themselves owner-level permissions
- Verify permission resolution happens server-side (never client-driven)
- Verify `activity_logs` are never deleted

**Acceptance criteria:**
- Owner can invite office user, assign permission groups
- Office user with `quotes.create` can create quotes; without it receives 403
- Permission override (deny) blocks office user from accessing a permitted resource
- Every mutation writes an `activity_logs` entry with before/after snapshots

**Non-goals:** Platform admin RBAC (Phase 13), custom role names (V2+), crew login (V2+).

---

### Phase 5 — Core CRM

**Objective:** Customer and lead management fully working.

**Prerequisites:** Phase 4 complete.

**Deliverables:**
- `modules/crm/` — lead service, customer service, appointment service
- `trpc/routers/leads.ts` — CRUD for leads
- `trpc/routers/customers.ts` — CRUD for customers
- `trpc/routers/appointments.ts` — CRUD for appointments
- `app/(dashboard)/leads/` — leads list, lead detail, create lead
- `app/(dashboard)/customers/` — customers list, customer detail
- AI-003 Lead Scoring (calls `modules/ai/` after lead creation)
- `communication_preferences` row created on customer creation

**Database objects:** `customers`, `leads`, `appointments`, `communication_preferences`

**Application modules:** `modules/crm`, `modules/ai` (AI-003 only)

**Tests required:**
- `tests/integration/crm/leads.test.ts` — CRUD + permission checks + RLS
- `tests/integration/crm/customers.test.ts` — CRUD + soft delete + RLS
- `tests/integration/ai/lead-scoring.test.ts` — AI-003 call logged in `ai_logs`
- `tests/e2e/crm/lead-to-customer.e2e.ts` — create lead → qualify → convert to customer

**Security checks:**
- Customer PII never appears in any log statement (Sentry scrubbing + manual audit)
- Soft-deleted customers not visible in list queries

**Acceptance criteria:**
- Lead created → AI-003 fires → lead.ai_score populated within 30 seconds
- Customer created → `communication_preferences` row created automatically
- Soft-deleted lead not visible in list; recoverable from activity_logs

**Non-goals:** Quote generation (Phase 6), job management (Phase 7), email sending (Phase 10).

---

### Phase 6 — Quote Engine

**Objective:** Full quote lifecycle from creation to customer acceptance, including AI estimation.

**Prerequisites:** Phase 5 complete.

**Deliverables:**
- `modules/quoting/` — quote service, quote item service, versioning
- `trpc/routers/quotes.ts` — CRUD + status transitions + versioning
- `app/(dashboard)/quotes/` — quote list, quote builder, quote detail
- AI-001 Inventory Parse (called from quote builder)
- AI-002 Quote Estimation (called from quote builder)
- AI-014 Service Suggestion (inline in quote builder)
- `generate_sequence_number()` — produces `QT-{YEAR}-{LPAD(seq,4,'0')}`
- Quote status state machine: `draft → sent → viewed → accepted / declined / expired`
- Customer portal: `app/portal/[token]/quote/page.tsx` — view + accept
- `domain_events` written on every quote status transition
- `quote_expiry` cron job wired (`/api/cron/quote-expiry`)

**Database objects:** `quotes`, `quote_items`, `quote_versions`, `ai_quote_recommendations`, `domain_events`

**Application modules:** `modules/quoting`, `modules/ai` (AI-001, AI-002, AI-014)

**Tests required:**
- `tests/integration/quoting/lifecycle.test.ts` — quote transitions + versioning
- `tests/integration/quoting/sequence.test.ts` — sequence numbers unique and zero-padded
- `tests/integration/quoting/portal.test.ts` — portal token validates; customer accepts quote
- `tests/integration/ai/quote-estimation.test.ts` — AI-002 result logged + stored
- `tests/e2e/quoting/quote-flow.e2e.ts` — create quote → AI estimate → send → customer accepts

**Security checks:**
- Portal token is not guessable (32 bytes cryptographic random)
- Accepted quote revision locked — no edits to accepted version
- AI-002 output never executes without operator review

**Acceptance criteria:**
- Quote builder → AI estimate → edit → send → customer views portal → accepts
- Quote expiry cron marks sent/viewed quotes expired after `expires_at`
- Declining a quote creates a new revision option, not edit-in-place
- `ai_quote_recommendations.estimated_margin_percent` stored as point-in-time snapshot, not live computed

**Non-goals:** Job creation (Phase 7), invoice (Phase 8), PDF (Phase 9), email automation (Phase 10).

---

### Phase 7 — Jobs and Operations

**Objective:** Full job lifecycle from booking to completion.

**Prerequisites:** Phase 6 complete.

**Deliverables:**
- `modules/jobs/` — job service, job assignment service
- `trpc/routers/jobs.ts` — CRUD + status transitions + crew assignment
- `app/(dashboard)/jobs/` — job calendar, job list, job detail, crew assignment
- `modules/workforce/` — employee service
- `modules/fleet/` — vehicle service
- `app/(dashboard)/crew/` — employee list, employee detail
- `app/(dashboard)/fleet/` — vehicle list, vehicle detail
- AI-012 Scheduling Conflict Alert (on job creation with overlap)
- `domain_events` on all job status transitions
- `fleet_maintenance` cron job wired
- Job number sequence (`JB-{YEAR}-{LPAD(seq,4,'0')}`)

**Database objects:** `jobs`, `job_assignments`, `employees`, `vehicles`

**Application modules:** `modules/jobs`, `modules/workforce`, `modules/fleet`, `modules/ai` (AI-012)

**Tests required:**
- `tests/integration/jobs/lifecycle.test.ts` — job status machine
- `tests/integration/jobs/assignment.test.ts` — crew/vehicle assignment + conflict detection
- `tests/e2e/jobs/booking-flow.e2e.ts` — quote accepted → job created → crew assigned → completed

**Acceptance criteria:**
- Accepted quote → job automatically created (or triggered from quote detail)
- Job assigned to crew → domain event emitted
- Job completed → AI-006 Post-Job Replay triggered
- Fleet maintenance cron alerts owner for vehicles > 7 days past service date

**Non-goals:** Invoice (Phase 8), PDF work order (Phase 9), crew email notifications (Phase 10).

---

### Phase 8 — Invoicing and Payments

**Objective:** Full invoice lifecycle with Stripe online payment and manual payment recording.

**Prerequisites:** Phase 7 complete.

**Deliverables:**
- `modules/invoicing/` — invoice service, payment service
- `trpc/routers/invoices.ts` — CRUD + status transitions
- `trpc/routers/payments.ts` — create payment (manual + Stripe)
- `app/(dashboard)/invoices/` — invoice list, invoice detail, record payment
- Customer portal: payment page with Stripe checkout
- `app/api/webhooks/stripe/route.ts` — Stripe webhook handler (idempotent)
- Invoice number sequence (`INV-{YEAR}-{LPAD(seq,4,'0')}`)
- `overdue_invoices` cron job wired
- AI-013 Invoice Risk Flag

**Database objects:** `invoices`, `invoice_items`, `payments`

**Application modules:** `modules/invoicing`, `modules/payments`, `modules/ai` (AI-013)

**Tests required:**
- `tests/integration/invoicing/lifecycle.test.ts` — invoice states + balance calculation
- `tests/integration/payments/stripe-webhook.test.ts` — stripe event → payment row → idempotency
- `tests/integration/payments/manual.test.ts` — manual cash/check payment recorded
- `tests/e2e/invoicing/payment-flow.e2e.ts` — invoice sent → customer pays online → receipt

**Security checks:**
- Stripe webhook signature verification (test with tampered signature → 401)
- Payment amount cannot be user-modified after Stripe confirmation
- Manual payment recorder must have `payments.record` permission

**Acceptance criteria:**
- Invoice created from completed job → balance_due_cents calculated correctly
- Stripe payment → webhook → payment row → invoice status `paid`
- Duplicate Stripe webhook (same `stripe_payment_intent_id`) → idempotent (no duplicate payment)
- Overdue invoices cron emits domain event after due date

**Non-goals:** PDF invoice (Phase 9), invoice email (Phase 10), PDF receipt (Phase 9).

---

### Phase 9 — PDF Engine

**Objective:** PDF generation working for all 7 V1 document types.

**Prerequisites:** Phase 8 complete; Supabase Edge Functions configured.

**Deliverables:**
- `supabase/functions/generate-pdf/index.ts` — Puppeteer PDF generation
- `document_templates` seed rows — 7 V1 document type HTML templates
- `modules/documents/` — document service (generation trigger, retrieval, signing)
- Domain event handlers for PDF triggers (quote.sent, job.completed, invoice.created, payment.received)
- `reject_snapshot_field_updates()` trigger verified working
- Signed URL generation (1 hour web, 15 min portal)
- `app/(dashboard)/` — PDF viewer modal in quote, job, invoice detail views

**Database objects:** `document_templates`, `documents`

**Application modules:** `modules/documents`

**Tests required:**
- `tests/integration/documents/immutability.test.ts` — snapshot field update rejected
- `tests/integration/documents/generation.test.ts` — generation triggered → status transitions `pending → generating → generated`
- `tests/integration/documents/storage-path.test.ts` — canonical path format verified
- `tests/e2e/documents/pdf-view.e2e.ts` — quote PDF viewable in browser

**Security checks:**
- Documents table RLS: `public.auth_company_id() = company_id` verified (F-006 fix confirmed)
- Signed URLs expire correctly (1h web, 15m portal)
- PDF Edge Function authenticates incoming request (secret header)
- No customer PII in PDF Edge Function logs

**Acceptance criteria:**
- Quote sent → PDF generated → stored at canonical path → viewable via signed URL
- Signed document immutable: attempt to update `storage_path` on generated document fails
- All 7 document types render without error with seed template HTML
- GDPR path: PDF retained after customer anonymization (Art. 17(3)(b)); signed URL generation blocked for anonymized customer

**Non-goals:** Credit note (V1.5), bill of lading (V1.5), Railway workers (V2+).

---

### Phase 10 — Email System

**Objective:** Full email sending, automation, and tracking infrastructure working.

**Prerequisites:** Phase 9 complete; Resend domain verified.

**Deliverables:**
- `modules/communications/` — email service, automation engine, template renderer
- Email automation handler in domain event router
- `app/(dashboard)/settings/emails/` — template management UI
- `app/(dashboard)/settings/automations/` — automation rule management UI
- `app/(dashboard)/customers/[id]/communications/` — communication timeline
- Resend webhook handler: `app/api/webhooks/email-tracking/route.ts`
- `communications.*` domain events
- AI-004 Email Draft (AI-assisted email composer)
- AI-011 Quote Follow-up Draft
- All 27 email template React Email components in `emails/`
- All 12 automation rules seeded and manageable

**Database objects:** `email_logs`, `email_templates`, `email_template_versions`, `email_sender_identities`, `email_automations`, `email_automation_runs`, `communication_preferences`, `ai_communication_memory`

**Application modules:** `modules/communications`, `modules/ai` (AI-004, AI-011)

**Tests required:**
- `tests/integration/email/idempotency.test.ts` — same `idempotency_key` → no duplicate send
- `tests/integration/email/tracking.test.ts` — Resend webhook updates email_logs tracking fields
- `tests/integration/email/automation.test.ts` — automation triggers, cancellation events work
- `tests/integration/email/opt-out.test.ts` — opted-out customer → email blocked at pre-send check
- `tests/integration/email/gdpr.test.ts` — anonymization sets to_email = '[erased]', not deleted
- `tests/e2e/email/send-quote.e2e.ts` — quote sent → email log created → tracking update received

**Security checks:**
- Resend webhook signature verification (Svix) — test with invalid signature → 401
- `idempotency_key` prevents duplicate sends on retry
- PII (to_email, to_name) never in application logs
- Platform emails use Bivro sender identity, not tenant sender identity

**Acceptance criteria:**
- Quote sent domain event → automation fires → email sent via Resend → email_logs row created
- Resend webhook → `email_logs.first_opened_at` updated (existing row update, not new insert)
- Email with `idempotency_key` sent twice → only one Resend API call made
- Opted-out customer → send blocked before Resend API call
- Customer email anonymized on GDPR request: `to_email = '[erased]'`, `to_name = '[erased]'`

**Non-goals:** Inngest workflows (V2+), inbound email (V2+), SMS (V2+).

---

### Phase 11 — AI Engine

**Objective:** All 14 AI tasks implemented; Company AI Brain active; memory system operational.

**Prerequisites:** Phase 10 complete.

**Deliverables:**
- `modules/ai/` — full AI engine: context builder, memory system, all 14 tasks
- `lib/ai/models.ts` — AI model constants (SONNET, HAIKU, OPUS)
- AI task implementations: AI-001 through AI-014
- Cron jobs wired: CEO Brief (AI-005), Pattern Observation (AI-007), Profit Analysis (AI-008), Learning Report (AI-010)
- AI token budget enforcement: aggregation cron + `ai_disabled` flag
- `app/(dashboard)/analytics/` — AI insights, CEO Brief, business recommendations
- Human-in-the-loop: all AI outputs presented as proposals with edit UI

**Database objects:** `ai_logs`, `ai_quote_recommendations`, `ai_communication_memory`

**Application modules:** `modules/ai`

**Tests required:**
- `tests/integration/ai/token-budget.test.ts` — budget exceeded → AI features gated
- `tests/integration/ai/safety.test.ts` — AI output never auto-executes; always returned as proposal
- `tests/integration/ai/tenant-isolation.test.ts` — Company A's AI context never includes Company B data
- `tests/integration/ai/logging.test.ts` — every AI call writes `ai_logs` entry before returning
- `tests/integration/ai/model-constants.test.ts` — no hardcoded model strings in source (grep test)

**Security checks:**
- AI context builder never includes data from a different `company_id`
- No PII in `ai_logs.prompt_template` or `ai_logs.error_message`
- Model identifier strings not hardcoded in any file except `lib/ai/models.ts`

**Acceptance criteria:**
- CEO Brief generated at 7AM for every active company; delivered as notification
- AI-002 quote estimation: result has confidence score; low confidence flagged to operator
- Pattern Observation nightly: new `ai_communication_memory` rows with `status = 'proposed'`
- Token budget: > 80% consumed → owner notification; 100% → `ai_disabled` flag set

**Non-goals:** AI Simulation Engine UI (V1.5), AI Digital Twin (V2+), custom model fine-tuning.

---

### Phase 12 — Customer Portal

**Objective:** Full customer-facing portal for quotes, contracts, invoices, and payments.

**Prerequisites:** Phase 11 complete (for AI-assisted content in portal); Phase 9 for PDF viewing.

**Deliverables:**
- `app/portal/[token]/` — customer portal pages
- Quote portal: view quote, accept/decline, download PDF
- Invoice portal: view invoice, pay online (Stripe), download PDF
- Contract portal: view contract, sign (V1: checkbox acknowledgment; DocuSign in V2+)
- Portal token generation (server-side, cryptographically random, 32-byte entropy)
- Portal token expiry (24 hours; renewed on access)
- No Supabase Auth required for portal — service role reads specific entity by token

**Database objects:** Reads from `quotes`, `invoices`, `documents`; writes to `quotes.status`, `payments`

**Application modules:** Portal-specific route handlers; uses `modules/quoting`, `modules/invoicing`, `modules/payments` via service role

**Tests required:**
- `tests/integration/portal/token.test.ts` — token validation; expired token rejected; token entropy
- `tests/integration/portal/access-control.test.ts` — token for Quote A cannot access Quote B
- `tests/e2e/portal/quote-acceptance.e2e.ts` — customer views quote → accepts → domain event
- `tests/e2e/portal/payment.e2e.ts` — customer pays invoice → Stripe → payment confirmed

**Security checks:**
- Portal token does not expose `company_id` or `quote_id` in URL (only opaque token)
- Service role usage documented: fetches only the specific entity the token authorizes
- Portal cannot enumerate other customers' documents
- Signed URL TTL is 15 minutes for portal (not 1 hour)

**Acceptance criteria:**
- Customer receives email with portal link → views quote → accepts → `quotes.status = 'accepted'`
- Customer pays invoice via Stripe → `payments` row created → `invoices.status = 'paid'`
- Expired token shows "this link has expired" message; operator can resend

**Non-goals:** Customer account creation, customer login, review solicitation UI (uses email).

---

### Phase 13 — Platform Admin

**Objective:** Full platform admin portal at admin.bivro.io.

**Prerequisites:** Phase 3 complete (auth patterns established).

**Deliverables:**
- `app/admin/` — full platform admin UI
- Platform admin login: Google OAuth restricted to @bivro.io
- Tenant management: list, view, search, pause, extend trial, override subscription
- Support access: break-glass session creation with audit log entry
- Platform metrics dashboard: MRR, ARR, active companies, new signups
- Subscription management: manual tier override, extension
- Platform email sending: trial expiry warnings, subscription notifications
- `platform_audit_log` hash chain integrity check (nightly cron)
- Platform admin RBAC: `system.admin`, `support.agent` roles

**Database objects:** `platform_admin_users`, `platform_sessions`, `platform_support_sessions`, `platform_audit_log`, `company_subscription_overrides`, `platform_metric_snapshots`

**Application modules:** `trpc/routers/platform/` (separate from company tRPC root)

**Tests required:**
- `tests/integration/platform/host-check.test.ts` — requests to /admin/* from non-admin host → 403
- `tests/integration/platform/google-oauth.test.ts` — non-bivro.io Google account rejected
- `tests/integration/platform/audit-chain.test.ts` — hash chain is valid; tampered entry detected
- `tests/integration/platform/support-session.test.ts` — break-glass session creates audit entry, is read-only

**Security checks:**
- Host header check is the outermost guard — runs before any auth check
- Google OAuth `hd` claim validation mandatory
- Platform admin session completely separate from company Supabase Auth session
- Break-glass sessions are read-only; write attempts in break-glass session blocked

**Acceptance criteria:**
- Platform staff login via Google (@bivro.io) → platform dashboard
- Company user cannot access `/admin/*` regardless of URL manipulation
- Support session opens → `platform_support_sessions` row + `platform_audit_log` entry
- Audit log hash chain valid after 1000 test entries

**Non-goals:** Company-facing UI, SAML SSO for platform staff (V2+), dedicated admin SPA (V2+).

**Parallel:** This phase can begin in parallel with Phase 5 (Core CRM) once Phase 3 is complete, since platform admin and company portal are logically separate.

---

### Phase 14 — Billing

**Objective:** Stripe subscription lifecycle fully integrated; tier gating active.

**Prerequisites:** Phase 13 complete (platform admin manages subscriptions).

**Deliverables:**
- Stripe Customer created on company signup (or on first paid action)
- Stripe Checkout for plan upgrade (from Starter, Pro, Business)
- Stripe webhook handler: subscription created/updated/cancelled/past_due
- `companies.subscription_tier` and `companies.subscription_status` updated by webhook
- Feature gating: queries check `subscription_tier` before accessing gated features
- Trial expiry platform email (sent by nightly cron at T-3 days and T=0)
- Billing portal link (Stripe Customer Portal for self-service plan management)
- `app/(dashboard)/settings/billing/` — current plan, usage, upgrade CTA
- AI token billing: add-on credit purchase flow

**Database objects:** `companies.stripe_customer_id`, `company_subscription_overrides`

**Application modules:** `modules/payments` extended with subscription logic

**Tests required:**
- `tests/integration/billing/webhook.test.ts` — subscription events update company tier correctly
- `tests/integration/billing/gating.test.ts` — Free tier user cannot access Pro features
- `tests/integration/billing/idempotency.test.ts` — duplicate Stripe webhook has no effect

**Security checks:**
- Stripe webhook signature verification (repeat from Phase 8)
- Subscription tier cannot be self-modified by operator (only via Stripe webhook or platform admin override)

**Acceptance criteria:**
- Free user hits job limit → upgrade prompt → Stripe Checkout → subscription activated → tier updated
- `subscription_status = 'past_due'` → feature access warning; > 7 days past_due → gating
- Trial expires → platform email sent → account status changes to `paused`

---

### Phase 15 — Hardening and Production Launch

**Objective:** All launch gates pass; production deployed; live.

**Prerequisites:** All Phases 0–14 complete and passing on staging.

**Deliverables:**
- All launch-readiness checklist items verified (§41)
- WCAG 2.2 AA accessibility audit completed and issues resolved
- Security audit of all high-risk surfaces completed
- Performance optimization: Core Web Vitals targets met (LCP < 2.5s, INP < 200ms)
- Sentry session replay configured and tested
- All Vercel Cron jobs verified (manual trigger test)
- Production Supabase migrations applied (001 → 020)
- DNS configured: app.bivro.io, admin.bivro.io
- SSL/TLS verified; HSTS enabled
- Post-deploy smoke test suite passing on production
- Monitoring dashboard live (Sentry + Vercel Analytics)

**Tests required:**
- Full E2E test suite on staging before production deploy
- Cross-tenant isolation verification on production data (with synthetic test tenants)
- Load test: 100 concurrent signups, 100 concurrent quote generations (no errors expected)

**Acceptance criteria:**
- All 55 items in §41 Launch-Readiness Checklist checked
- Zero critical Sentry errors in 24-hour staging smoke test
- Production deployment succeeds; smoke test passes
- First real company signup completes end-to-end

---

## 45. Sprint 1 Definition

### Sprint 1 Scope: Repository and Tooling Foundation

**Sprint goal:** An engineer can clone the repository, run `pnpm install && supabase start && pnpm dev`, and have a running Next.js application with working TypeScript, linting, testing, and a local Supabase database — ready for the first migration to be written.

**Sprint duration:** 3–5 days.

**Maps to:** Phase 0 (Repository and Tooling) + beginning of Phase 1 (migration framework scaffolding).

### Sprint 1 Deliverables

| # | Deliverable | Description |
|---|-------------|-------------|
| 1 | `package.json` | pnpm workspace; all production and dev deps listed; scripts defined |
| 2 | `tsconfig.json` | Strict mode + all required flags from CODING_STANDARDS.md §1.1 |
| 3 | `next.config.ts` | Basic Next.js config; Sentry webpack plugin; no experimental flags |
| 4 | `eslint.config.mjs` | Next.js + TypeScript rules; zero-warning mode enforced |
| 5 | `.prettierrc` | Prettier config with tailwindcss plugin |
| 6 | `.husky/pre-commit` | lint-staged: eslint + prettier on staged files |
| 7 | `vercel.json` | Cron schedule stubs (routes defined but handlers stub only) |
| 8 | `.env.example` | All 22 required env vars listed with descriptions (no values) |
| 9 | `lib/env.ts` | Zod schema for all env vars; throws on startup if missing |
| 10 | `app/layout.tsx` | Root layout (Sentry wrapper, global CSS import) |
| 11 | `app/(auth)/layout.tsx` | Auth layout stub (no UI, just layout wrapper) |
| 12 | `app/(dashboard)/layout.tsx` | Dashboard layout stub (no sidebar yet; just wrapper) |
| 13 | `app/admin/layout.tsx` | Admin layout stub + host check (returns 403 if Host ≠ admin.bivro.io) |
| 14 | `middleware.ts` | Routing stubs: host detection, route group assignment |
| 15 | `app/api/health/route.ts` | Returns `{ status: 'ok', timestamp: ISO-8601 }` |
| 16 | `lib/supabase/client.ts` | Browser Supabase client (anon key) |
| 17 | `lib/supabase/server.ts` | Server Supabase client (cookies) |
| 18 | `lib/supabase/service-role.ts` | Service role client; doc comment: "RLS bypass — server only" |
| 19 | `lib/types/domain.ts` | Branded ID types (`CompanyId`, `QuoteId`, `JobId`, etc.) |
| 20 | `lib/ai/models.ts` | AI model constants (`AI_MODELS.HAIKU`, `AI_MODELS.SONNET`, `AI_MODELS.OPUS`) |
| 21 | `supabase/config.toml` | Local Supabase config (auth, storage, db settings) |
| 22 | `supabase/migrations/` | Directory created; migration 001 file written (bootstrap SQL) |
| 23 | `vitest.config.ts` | Vitest config; jsdom environment; coverage with v8 |
| 24 | `playwright.config.ts` | Playwright config; baseURL for local dev |
| 25 | `.github/workflows/ci.yml` | typecheck + lint + format:check + test on push and PR |

### Sprint 1 Does NOT Include

- Customer, lead, quote, job, invoice, or payment CRUD
- AI features
- Email sending
- PDF rendering
- Stripe integration
- Production authentication flows (login form is a stub only)
- Full RLS policy implementation (migration 018)
- Any visual feature development beyond layout shells
- shadcn/ui component library installation (deferred to Phase 5 when first components needed)
- React Email templates
- Webhook handlers

### Sprint 1 Acceptance Criteria

- [ ] `pnpm install` completes with zero peer dependency errors
- [ ] `pnpm typecheck` passes with zero errors
- [ ] `pnpm lint` passes with zero warnings
- [ ] `pnpm format:check` passes
- [ ] `pnpm test` passes (2 tests: env validation, health check)
- [ ] `supabase start` starts local Supabase
- [ ] `pnpm db:migrate` applies migration 001 (bootstrap: pgcrypto + gen_uuid_v7 + ENUMs)
- [ ] `SELECT gen_uuid_v7()` returns a UUID in local PostgreSQL
- [ ] `pnpm dev` starts at http://localhost:3000
- [ ] `GET /api/health` returns `{ status: 'ok', timestamp: "..." }`
- [ ] CI workflow runs and passes on GitHub
- [ ] `GET /admin/anything` with Host: app.bivro.io returns 403

### Sprint 1 is complete when all acceptance criteria are met and the CI workflow is green on the `main` branch.

---

## 46. Final Consistency Review

### Documents reviewed for contradictions during this final review pass:

| Document | Status |
|----------|--------|
| BUSINESS_MODEL.md | Synchronized — Starter tier added; Free tier renamed |
| PRODUCT_REQUIREMENTS.md | Synchronized — 64 permissions in 12 groups confirmed |
| ARCHITECTURE.md | Synchronized — tenant_id JWT references replaced with company_id |
| DATABASE_ARCHITECTURE.md | Synchronized — 7 email tables added; email_logs updated; documents RLS fixed; GDPR anonymized |
| CODING_STANDARDS.md | Synchronized — AI model ID rule added; company_id in code examples |
| AI_ENGINE.md | Authoritative reference — no changes needed |
| PLATFORM_ADMIN.md | Synchronized — raw token removed; ENUM note marked resolved; email infra added |
| UI_UX_SYSTEM.md | Authoritative reference — consistent with PRD post-sync |
| EMAIL_SYSTEM.md | Authoritative reference — DATABASE_ARCHITECTURE.md now reflects §18 extensions |
| PDF_ENGINE.md | Synchronized — documents RLS auth claim fixed |

### Contradiction Scan Results

#### Critical contradictions

None. All Critical findings from the FINAL REVIEW FAILED verdict have been resolved:

| Finding | Resolution |
|---------|-----------|
| F-001: subscription_tier ENUM missing 'starter' | Resolved — DATABASE_ARCHITECTURE.md had 'starter'; PLATFORM_ADMIN.md stale notes updated |
| F-002: 7 email tables absent from DATABASE_ARCHITECTURE.md | Resolved — §22 added with all 7 tables |
| F-003: template_id text/uuid collision in email_logs | Resolved — text field removed; uuid field added |
| F-006: documents table RLS using wrong JWT claim (tenant_id) | Resolved — fixed to public.auth_company_id() in DATABASE_ARCHITECTURE.md, PDF_ENGINE.md, ARCHITECTURE.md |

#### High contradictions

None. All High findings resolved:

| Finding | Resolution |
|---------|-----------|
| F-004: idempotency_key absent from email_logs | Resolved — added to DATABASE_ARCHITECTURE.md |
| F-005: raw invite token stored in user_invitations | Resolved — token text field removed from PLATFORM_ADMIN.md §11.13 |
| F-007: GDPR path purges email_logs rows | Resolved — changed to anonymize with UPDATE |
| F-008: communications permissions absent from PRODUCT_REQUIREMENTS.md | Pre-resolved — already present in PRD |
| F-009: Starter tier missing from BUSINESS_MODEL.md | Resolved — Starter tier added; Free tier renamed |
| F-011: FORMAT('%04s') does not zero-pad in PostgreSQL | Resolved — replaced with LPAD |

#### Medium contradictions

None. All Medium findings resolved:

| Finding | Resolution |
|---------|-----------|
| F-013: incomplete cron catalogue in ARCHITECTURE.md | Resolved — 12-job catalogue added |
| F-014: GDPR PDF retention not documented | Resolved — Art. 17(3)(b) note added |
| F-015: P7 principle unclear on AI estimates | Resolved — AI prediction exception documented in P7 |
| F-017: AI model IDs hardcoded risk | Resolved — rule added to CODING_STANDARDS.md §18 |
| F-018: platform email infrastructure undocumented | Resolved — §13 added to PLATFORM_ADMIN.md |

#### Low contradictions

None requiring documentation change. F-019 (archival strategy) deferred to V2+ with existing language in DATABASE_ARCHITECTURE.md §21 sufficient.

---

**MASTER BOOTSTRAP PASSED — Sprint 1 may begin.**
