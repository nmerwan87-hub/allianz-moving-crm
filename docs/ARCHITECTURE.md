# Bivro — Software Architecture

**Version:** 1.1  
**Status:** Frozen — Authoritative Technical Reference  
**Owner:** Architecture  
**Last updated:** 2026-06-29  

> This document governs all technical decisions in Bivro. No implementation may contradict the decisions made here. If a better decision is discovered, update this document before changing the code.

---

## Stack Philosophy

Bivro uses a **two-phase infrastructure strategy**:

**V1 (MVP → First 100 Customers):** Supabase as the unified platform — auth, database, storage, and realtime in one place. This is the fastest clean foundation for an early-stage product. One dashboard, one SDK, one bill.

**V2+ (Scale → Enterprise):** Individual best-in-class providers replace Supabase's bundled services as scale, cost, or capability demands it. The modular architecture ensures this is a provider swap, not a rewrite.

Every section in this document is labelled `V1:` and `V2+:` where the strategy differs. Sections with no label apply to both phases.

---

## Table of Contents

1. [Architectural Principles](#1-architectural-principles)
2. [High-Level Architecture](#2-high-level-architecture)
3. [Domain-Driven Design](#3-domain-driven-design)
4. [Bounded Contexts](#4-bounded-contexts)
5. [Modular Monolith Decision](#5-modular-monolith-decision)
6. [Multi-Tenancy Strategy](#6-multi-tenancy-strategy)
7. [Authentication Architecture](#7-authentication-architecture)
8. [Authorization & RBAC](#8-authorization--rbac)
9. [API Architecture](#9-api-architecture)
10. [Background Job Architecture](#10-background-job-architecture)
11. [Event Architecture](#11-event-architecture)
12. [AI Service Architecture](#12-ai-service-architecture)
13. [File Storage Architecture](#13-file-storage-architecture)
14. [PDF Generation Architecture](#14-pdf-generation-architecture)
15. [Email Service Architecture](#15-email-service-architecture)
16. [Notification Architecture](#16-notification-architecture)
17. [Audit Logging](#17-audit-logging)
18. [Error Handling Strategy](#18-error-handling-strategy)
19. [Observability & Monitoring](#19-observability--monitoring)
20. [Security Architecture](#20-security-architecture)
21. [Deployment Architecture](#21-deployment-architecture)
22. [Infrastructure Stack](#22-infrastructure-stack)
23. [Scaling Strategy](#23-scaling-strategy)
24. [Disaster Recovery](#24-disaster-recovery)
25. [Future Migration Path](#25-future-migration-path)
26. [Technology Decision Register](#26-technology-decision-register)

---

## 1. Architectural Principles

These principles govern every architectural decision. When trade-offs arise, evaluate against this list in order.

**Principle 1 — Correctness over performance.**
A system that is fast but loses data or produces wrong quotes is not a system anyone can trust. Correctness — data integrity, transactional consistency, and accurate AI outputs — is never traded for speed.

**Principle 2 — Operational simplicity at this stage.**
Bivro is not yet at Google scale. Architectural complexity that is not justified by current scale is a liability, not an asset. A two-person engineering team maintaining a distributed microservices mesh will ship features ten times slower than a team maintaining a well-structured monolith. Choose boring technology for infrastructure; reserve innovation budget for the product.

**Principle 3 — Design for extraction, not premature separation.**
Every module must be designed as if it will one day become an independent service. But it is not extracted until the data and performance justify it. Clear module boundaries now prevent a big-bang rewrite later.

**Principle 4 — Tenant isolation is non-negotiable.**
A bug that leaks one tenant's data to another is an existential event. Every design decision affecting data access must explicitly reason about tenant boundaries.

**Principle 5 — The AI is part of the architecture, not a feature.**
AI is not a plugin. The event system, the data model, and the feedback loops are designed with AI training and inference as first-class concerns from the start.

**Principle 6 — Fail safely.**
When a system fails — AI unavailable, email provider down, payment webhook missed — the failure must be visible, logged, retryable, and never silent. No fire-and-forget operations on critical paths.

---

## 2. High-Level Architecture

### 2.1 System Overview

Bivro consists of four user-facing surfaces and one internal intelligence layer:

```
┌─────────────────────────────────────────────────────────────┐
│                        USER SURFACES                         │
├──────────────────┬────────────────┬──────────────────────────┤
│  Operator Web    │ Customer Portal │    Crew Mobile App       │
│  (Next.js SPA)   │ (Next.js pages) │  (Expo / React Native)   │
└────────┬─────────┴───────┬────────┴────────────┬─────────────┘
         │                 │                      │
         ▼                 ▼                      ▼
┌─────────────────────────────────────────────────────────────┐
│                        API GATEWAY LAYER                      │
│           tRPC Router (internal) + REST (external)            │
└────────────────────────────┬────────────────────────────────┘
                             │
         ┌───────────────────┼───────────────────┐
         ▼                   ▼                   ▼
┌────────────────┐  ┌─────────────────┐  ┌────────────────────┐
│   Application  │  │  Background     │  │    AI Engine       │
│   Modules      │  │  Jobs           │  │    Layer           │
│ (Domain Logic) │  │  V1: Vercel     │  │  (Claude API)      │
│                │  │  Cron + Supabase│  │                    │
│                │  │  Edge Functions │  │                    │
│                │  │  V2+: Inngest   │  │                    │
└───────┬────────┘  └───────┬─────────┘  └────────┬───────────┘
        │                   │                      │
        └───────────────────┼──────────────────────┘
                            │
         ┌──────────────────┼──────────────────────┐
         ▼                  ▼                       ▼
┌────────────────┐  ┌───────────────────┐  ┌──────────────────┐
│  Supabase      │  │  Supabase         │  │  External        │
│  PostgreSQL    │  │  Storage          │  │  Services        │
│  + Auth        │  │  V2+: R2/S3       │  │  Stripe, Resend  │
│  + Realtime    │  │                   │  │  Claude API      │
└────────────────┘  └───────────────────┘  └──────────────────┘
```

### 2.2 Request Flow

A typical operator request (e.g., generate a quote):

```
Browser → Vercel Edge (CDN + routing)
       → Next.js Server (Route Handler / tRPC endpoint)
       → Auth middleware (Supabase JWT validated)
       → Tenant middleware (injects tenantId from JWT app_metadata)
       → RBAC middleware (validates role permission)
       → Domain module (Quoting)
       → AI Engine (Claude API call)
       → Database write (Supabase PostgreSQL)
       → Event written to domain_events table
       → Supabase DB webhook → Next.js API route (email/PDF trigger)
       → Response returned to browser
```

Each step is explicit, ordered, and observable. There are no hidden side effects.

### 2.3 Technology Stack Summary

#### V1 Stack

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| Framework | Next.js 16 (App Router) | Full-stack, SSR, API routes, Vercel-native |
| Language | TypeScript (strict) | Type safety end-to-end; no `any` allowed in production |
| Database | PostgreSQL via Supabase | ACID, RLS, built-in auth integration, serverless |
| ORM | Drizzle ORM | Lightweight, type-safe, SQL-close, no magic |
| Internal API | tRPC v11 | End-to-end type safety, no schema codegen |
| External API | REST (OpenAPI) | Standard, mobile-compatible, future public API |
| Auth | Supabase Auth | Native JWT + RLS integration; zero friction with Supabase DB |
| Background Jobs | Vercel Cron + Supabase Edge Functions | Scheduled tasks and DB-triggered events without extra services |
| AI | Anthropic Claude API | Best-in-class reasoning for quoting and language tasks |
| Email | Resend + React Email | Modern API, React component templates |
| PDF | Puppeteer (headless) | HTML-to-PDF for complex branded documents |
| File Storage | Supabase Storage | Integrated with Supabase RLS; zero extra config for V1 |
| Payments | Stripe | Industry standard, Connect for multi-party payouts |
| Realtime | Supabase Realtime | WebSocket-based live updates over PostgreSQL changes |
| Mobile | Expo (React Native) | Cross-platform iOS/Android, React code sharing |
| Monitoring | Sentry | Error tracking, session replay |
| Deployment | Vercel | Next.js hosting, preview deployments, Cron |

#### V2+ Upgrade Path (when V1 limits are reached)

| Concern | V1 | V2+ Upgrade | Trigger |
|---------|-----|------------|---------|
| Auth | Supabase Auth | Custom JWT or Clerk | >50k MAU or need advanced org management |
| Database | Supabase PostgreSQL | Neon (branching) or Supabase Pro | DB branching per PR needed at team scale |
| Background jobs | Vercel Cron + Edge Functions | Inngest | Durable workflows needed; retry complexity grows |
| File storage | Supabase Storage | Cloudflare R2 | Egress costs become significant (>$500/month) |
| Caching | None (V1) | Upstash Redis | Permission cache TTL needed; AI response cache needed |
| Workers | None (V1) | Railway | PDF generation volume exceeds Vercel function limits |

---

## 3. Domain-Driven Design

### 3.1 Why DDD

Bivro is not a CRUD application. It is an operating platform for a complex industry with deeply interconnected workflows. Domain-Driven Design gives the engineering team a shared language with the business — when the business says "booking," engineering knows exactly what that means, what state it can be in, and what events it produces.

Without DDD, a growing codebase becomes a tangle of database queries spread across dozens of files with no clear ownership. With DDD, each domain module owns its data, its logic, and its events.

### 3.2 Ubiquitous Language

The following terms have precise technical meaning in Bivro. These exact words are used in code, database tables, API endpoints, and documentation. No synonyms.

| Business Term | Technical Meaning |
|--------------|-------------------|
| Tenant | A moving company using the Bivro platform |
| Lead | An unconfirmed prospect |
| Contact | A person associated with a lead or customer record |
| Quote | A formal price estimate, versioned and trackable |
| Booking | A confirmed job with signed agreement and deposit paid |
| Job | The operational record of a move (from booking to completion) |
| Crew | A named team of one or more workforce members |
| Crew Member | An individual workforce member (lead or standard) |
| Inventory | The list of items to be moved on a specific job |
| Dispatch | The act of assigning crew and vehicle to a job |
| Bill of Lading | The legal document confirming items transported |
| Invoice | A financial request for payment tied to a job |
| Transaction | A completed payment event |
| Tenant Admin | An operator with full access to their company's Bivro account |
| Customer Portal | The external, token-authenticated view for the end customer |

### 3.3 Aggregate Roots

In DDD, an Aggregate Root is the entry point for a cluster of related entities. All state changes to entities within an aggregate must go through the root.

| Aggregate Root | Child Entities |
|----------------|----------------|
| Lead | Contact, LeadNote, LeadActivity |
| Quote | QuoteLineItem, QuoteVersion, QuoteActivity |
| Job | JobNote, JobActivity, JobDocument, CrewAssignment, VehicleAssignment |
| Invoice | InvoiceLineItem, InvoicePayment |
| Customer | CustomerContact, CustomerNote |
| Crew | CrewMember, CrewSchedule |
| Vehicle | VehicleDocument, MaintenanceRecord |
| Tenant | TenantUser, TenantSettings, RateMatrix |

---

## 4. Bounded Contexts

A Bounded Context is a logical boundary within which a domain model applies. Across these boundaries, translation (via events or explicit interfaces) is required. No direct cross-context database queries.

### Context 1: Identity & Access (IAM)

**Responsibility:** Authentication, users, roles, permissions, tenant membership.

**Owns:** User records, role assignments, permission grants, sessions.

**Communicates via:** Middleware context injection. Every request handler receives a resolved `AuthContext` containing `{ userId, tenantId, role, permissions }`. No other context calls IAM directly.

**V1 external dependency:** Supabase Auth. IAM context wraps it with Bivro's own `profiles` table, so Bivro is never directly coupled to Supabase Auth's data model. Tenant membership is stored in the `profiles` table, and `company_id` and `role` are injected into the Supabase JWT `app_metadata` via the `custom_access_token_hook` on every login and token refresh.

---

### Context 2: Tenant Management

**Responsibility:** Company provisioning, subscription status, feature flags, billing metadata.

**Owns:** Tenant records, subscription tier, feature entitlements, billing state.

**Communicates via:** Events (`tenant.created`, `tenant.upgraded`, `tenant.suspended`) and direct interface calls from IAM middleware.

**Note:** Tenant is the top-level isolation boundary for all other contexts.

---

### Context 3: CRM

**Responsibility:** Lead lifecycle, customer records, contact management, interaction history.

**Owns:** Lead, Contact, Customer, LeadActivity, LeadNote.

**Produces events:** `lead.created`, `lead.assigned`, `lead.converted`, `customer.created`.

**Consumes events:** `quote.sent` (updates lead stage), `booking.created` (converts lead to customer).

---

### Context 4: Quoting

**Responsibility:** Inventory parsing, price calculation, quote generation, quote lifecycle management.

**Owns:** Quote, QuoteLineItem, QuoteVersion, InventoryItem, RateMatrix.

**Produces events:** `quote.drafted`, `quote.sent`, `quote.opened`, `quote.accepted`, `quote.declined`, `quote.expired`.

**Consumes events:** `lead.converted` (creates initial quote context).

**AI dependency:** The Quoting context is the primary consumer of the AI Engine. It calls the AI service for inventory parsing and price suggestion, but treats AI as an advisory service — the final quote is always a Bivro data structure, not a raw AI output.

---

### Context 5: Job Operations

**Responsibility:** The operational lifecycle of a confirmed move. Scheduling, dispatch, real-time status, crew/vehicle assignment.

**Owns:** Job, JobNote, JobActivity, JobDocument, CrewAssignment, VehicleAssignment, InventoryChecklist, DamageRecord.

**Produces events:** `job.created`, `job.crew_assigned`, `job.preparation_complete`, `job.started`, `job.completed`, `job.cancelled`.

**Consumes events:** `booking.created` (creates job), `invoice.paid` (closes job billing).

---

### Context 6: Workforce

**Responsibility:** Crew member profiles, availability, skills, timesheets, performance.

**Owns:** CrewMember, CrewAvailability, Timesheet, ClockEvent, PerformanceMetric.

**Produces events:** `crew_member.clocked_in`, `crew_member.clocked_out`, `crew_member.unavailable`.

**Consumes events:** `job.crew_assigned` (creates schedule entry), `job.completed` (finalizes timesheet).

---

### Context 7: Fleet

**Responsibility:** Vehicle records, availability, maintenance, capacity validation.

**Owns:** Vehicle, VehicleDocument, MaintenanceRecord, VehicleAvailability.

**Produces events:** `vehicle.unavailable`, `vehicle.maintenance_due`.

**Consumes events:** `job.crew_assigned` (records vehicle assignment).

---

### Context 8: Communications

**Responsibility:** All outbound communications — email sequences, triggers, templates, delivery tracking.

**Owns:** EmailTemplate, CommunicationSequence, SequenceEnrollment, MessageLog.

**Produces events:** `email.sent`, `email.opened`, `email.clicked`, `email.bounced`.

**Consumes events:** Every lifecycle event from every other context is a potential trigger for a communication. Communications subscribes to all domain events and evaluates whether a communication should be sent.

**Important:** Communications context never queries other contexts' data directly. It receives all needed data in the event payload. This is a strict rule.

---

### Context 9: Documents

**Responsibility:** PDF generation, digital signatures, document storage, template management.

**Owns:** Document, DocumentTemplate, SignatureRecord.

**Produces events:** `document.generated`, `document.signed`.

**Consumes events:** `quote.accepted` (generate service agreement), `job.completed` (generate BOL, damage report), `invoice.created` (generate invoice PDF).

---

### Context 10: Payments

**Responsibility:** Invoices, payment collection, Stripe integration, financial reconciliation.

**Owns:** Invoice, InvoiceLineItem, Payment, Refund.

**Produces events:** `invoice.created`, `invoice.sent`, `invoice.paid`, `invoice.overdue`, `payment.received`, `payment.failed`, `refund.issued`.

**Consumes events:** `job.completed` (creates draft invoice), `booking.created` (collects deposit).

**Stripe relationship:** Stripe is an external system. The Payments context wraps all Stripe interactions. No other context calls Stripe directly.

---

### Context 11: Analytics

**Responsibility:** Metric aggregation, dashboards, report generation.

**Owns:** MetricSnapshot, ReportDefinition (read-only projections from all contexts).

**Note:** Analytics is a read-only context. It never writes to other contexts. It consumes all domain events to build aggregations and projections. It does not issue commands. This is the CQRS read side.

---

### Context 12: AI Engine

**Responsibility:** All interactions with the Anthropic Claude API. Prompt management, response parsing, cost tracking, feedback loops.

**Owns:** PromptTemplate, AIRequest, AIResponse, AIFeedback, UsageLedger.

**Called by:** Quoting (inventory parsing, price suggestion), CRM (lead scoring), Communications (email drafting), Analytics (insight generation).

**Note:** The AI Engine is a service, not a domain. It has no business logic of its own. It executes requests and returns structured outputs. The calling context decides what to do with the output.

---

### Context 13: Customer Portal

**Responsibility:** The external-facing view for end customers. Token-authenticated, read-heavy, no business logic.

**Owns:** Nothing — it reads from other contexts via read-only interfaces.

**Note:** The Customer Portal is a thin presentation layer. It renders data from Jobs, Quotes, Invoices, and Documents contexts. It writes back via explicit commands (accept quote, submit payment, capture signature) that flow through the appropriate context.

---

## 5. Modular Monolith Decision

### Decision: Modular Monolith

Bivro is built as a **Modular Monolith** — a single deployable unit with strict internal domain boundaries.

### Why Not Microservices

Microservices are the correct answer when an organization has outgrown a monolith. They are the wrong answer when an organization is trying to grow to the size where a monolith becomes painful.

The tax of microservices before scale:
- Every feature requires coordinating deployments across multiple services
- Distributed tracing, service mesh, and API gateway add weeks of infrastructure work per quarter
- Network failures between services introduce a new class of bugs that don't exist in a monolith
- A two-to-five person engineering team maintains operational overhead instead of shipping product
- Integration testing across service boundaries is significantly harder than within a monolith
- Transactional consistency across service boundaries requires distributed transactions (Saga pattern) — one of the hardest problems in distributed systems

Stripe, Shopify, GitHub, Basecamp, and Linear all started as monoliths. Shopify served billions in GMV before extracting their first independent service. The pattern holds: premature distribution is a form of premature optimization at the system architecture level.

### Why Not a Single Spaghetti Monolith

The failure mode of a monolith is not scale — it is organizational entropy. When there are no module boundaries, every file imports every other file, domain logic leaks everywhere, and changes in one area break another with no warning.

The Modular Monolith avoids this by enforcing strict boundaries as if they were service boundaries — but without the network tax.

### Rules of the Modular Monolith

**Rule 1:** Each domain module lives in its own directory (`/modules/[context]/`).

**Rule 2:** A module may only import from its own directory, from shared utilities (`/lib/`), and from explicitly defined cross-module interfaces (`/modules/[context]/interface.ts`).

**Rule 3:** No module may import from another module's internal implementation. If Module A needs data from Module B, it uses Module B's public interface or receives it via an event.

**Rule 4:** All cross-module communication is either synchronous via interface (for queries) or asynchronous via event (for commands and notifications).

**Rule 5:** The database is logically partitioned by domain. Each module "owns" its tables and is the only writer to those tables. Other modules may read via database views or via the module's interface, but never write directly.

### Alternatives Considered

| Option | Verdict | Reason |
|--------|---------|--------|
| Full microservices | Rejected | Operational complexity unjustified at current scale |
| Serverless functions only | Rejected | Cold starts and stateless constraints hurt background jobs and AI calls |
| Modular monolith | Selected | Correct balance of development velocity and future flexibility |
| BFF (Backend For Frontend) | Deferred | Relevant when mobile API requirements diverge significantly from web |

### Future Scalability

The module boundaries defined in Section 4 are the extraction seams. When a module's compute or throughput demands justify extraction, it becomes a service. The first candidate is the AI Engine (compute-intensive, independently deployable). Second is Communications (high volume, can be horizontally scaled independently).

The transition from modular monolith to selective microservices is a migration, not a rewrite, because the interfaces were designed to be service boundaries from the start.

---

## 6. Multi-Tenancy Strategy

### Database Bootstrap Conventions

The first bootstrap migration defines two SQL artifacts before any table is created.

**Target PostgreSQL version: PG17**

Bivro V1 targets PostgreSQL 17, which is the Supabase default for new projects as of June 2026. PG17 has no native UUID v7 function. PostgreSQL 18 added native `uuidv7()`, but Supabase does not yet support PG18 for new projects.

**UUID v7 generator function**

All Bivro primary keys are UUID v7 (time-ordered, B-tree friendly). Because PG17 has no built-in UUID v7 function, Bivro defines `gen_uuid_v7()` as a custom `plpgsql` function using `gen_random_bytes()` from `pgcrypto`. The authoritative SQL implementation is in `MASTER_BOOTSTRAP.md`. Every table schema uses `id uuid PRIMARY KEY DEFAULT gen_uuid_v7()`.

The database generates all primary key values. V1 application code does not generate IDs — tRPC mutations return the server-assigned UUID after insert.

Never use `gen_random_uuid()` (UUID v4) in Bivro schema definitions. It produces non-time-ordered identifiers that cause B-tree index scatter under high insert volume.

**PG18 upgrade path:** When Supabase supports PG18, replace `gen_uuid_v7()`'s function body with `SELECT uuidv7()`. No table schema changes required.

**pgcrypto extension (required, must be explicitly activated)**

```sql
CREATE EXTENSION IF NOT EXISTS pgcrypto; -- required by gen_uuid_v7()
```

Do not assume pgcrypto is pre-enabled. The bootstrap migration activates it explicitly before the function is defined.

No other extensions are required for V1. `uuid-ossp` and `pg_idkit` are not used.

---

### Decision: Shared Database, Row-Level Security (RLS)

Every table that contains tenant-specific data includes a `tenant_id` column. PostgreSQL Row-Level Security policies enforce that queries can only return rows belonging to the current tenant.

### Architecture

```
Application Layer
    ↓
Auth middleware (validates Supabase JWT; extracts company_id from app_metadata)
    ↓
Supabase Client (authenticated with user's JWT — RLS activates automatically)
    ↓
PostgreSQL RLS Policy (SELECT/INSERT/UPDATE/DELETE restricted to rows
  where company_id = (auth.jwt() -> 'app_metadata' ->> 'company_id')::uuid)
```

### Why This Approach

**Shared database (vs. database-per-tenant):**
At the scale of thousands of tenants, database-per-tenant means managing thousands of database instances. This is operationally untenable without a dedicated platform team. Row-level isolation handles the vast majority of operators without this overhead.

**Row-level vs. schema-per-tenant:**
Schema-per-tenant (each tenant gets a PostgreSQL schema) is a step up in isolation and a step down in operational simplicity. It requires migrations applied to hundreds of schemas simultaneously — a complex, failure-prone operation. Row-level is simpler to maintain and sufficient for most customers.

**PostgreSQL RLS vs. application-level filtering:**
Application-level filtering (WHERE company_id = X in every query) relies on discipline. A single forgotten WHERE clause leaks cross-tenant data. RLS is enforced at the database level — it is physically impossible to query another tenant's data once RLS is active, regardless of what the application does.

**Why Supabase RLS is particularly clean for V1:**
Supabase Auth issues JWTs that include `app_metadata`. When `company_id` is stored in `app_metadata`, the RLS policy can reference `auth.jwt()` directly — no separate session variable needed, no extra round-trip to resolve the tenant. The auth and RLS systems are natively integrated.

### Company ID Injection into JWT

When a user logs in, Supabase Auth issues a JWT. The `company_id` must be present in that JWT so RLS policies can reference it without a database lookup on every query.

**Mechanism:** A Supabase Auth hook (`custom_access_token_hook`) fires on every JWT issue. The hook reads the user's `company_id`, `role`, and `company_status` from `profiles` JOIN `companies` and injects them into `app_metadata` in the token. The JWT refresh (every hour) keeps these current. The RLS helper function `public.auth_company_id()` reads `(auth.jwt() -> 'app_metadata' ->> 'company_id')::uuid` — all RLS policies use this function rather than reading the JWT claim directly. The `company_status` claim is read by Next.js middleware to route non-`active` companies to status-specific pages (pending, suspended, rejected, archived) before the dashboard is reached.

### Tenant Isolation Layers

| Layer | Mechanism |
|-------|-----------|
| Authentication | Supabase Auth validates JWT |
| JWT | `company_id` and `role` embedded in `app_metadata` on every token via `custom_access_token_hook` |
| API | tRPC middleware validates `companyId` extracted from JWT on every request |
| Database | PostgreSQL RLS policies on all tenant-scoped tables via `public.auth_company_id()` helper |
| Storage | Supabase Storage bucket paths prefixed with `{tenantId}/`; RLS on storage objects |
| Email | Sending domain scoped per environment (white-label: Phase 2) |
| AI | AI requests carry `tenantId`; usage tracked per tenant |

### Enterprise Tier: Schema-Per-Tenant

For Enterprise-tier customers requiring contractual data isolation, Bivro offers schema-per-tenant as a premium configuration. This is provisioned manually by the operations team at onboarding and is not the default.

### Alternatives Considered

| Option | Verdict | Reason |
|--------|---------|--------|
| Database per tenant | Rejected (default) | Operationally untenable at thousands of tenants |
| Schema per tenant | Reserved for Enterprise | Migrations complexity; overkill for most customers |
| Row-level with app filtering | Rejected | Too brittle; relies on developer discipline |
| Row-level with Supabase RLS | Selected | Database-enforced isolation; native JWT integration; zero extra configuration |

---

## 7. Authentication Architecture

### V1 Decision: Supabase Auth

Supabase Auth handles all aspects of authentication for Bivro operators and crew members. It is treated as an external identity provider — never directly referenced outside the IAM context.

### Why Supabase Auth for V1

Supabase Auth and Supabase PostgreSQL are natively integrated. The JWT issued by Supabase Auth is understood by the database — RLS policies can reference `auth.uid()` and `auth.jwt()` directly. This eliminates an entire class of configuration that other auth providers require (setting session variables, passing tokens to the database connection separately).

For a V1 product where speed of foundation matters, this integration is the primary advantage.

| Option | Verdict | Reason |
|--------|---------|--------|
| Supabase Auth | Selected (V1) | Native RLS integration; zero friction with Supabase DB; included in Supabase pricing |
| Clerk | V2+ option | Best-in-class org management; use when Supabase Auth limits are reached |
| NextAuth.js (Auth.js) | Considered | Good open-source option; requires wiring RLS tenant resolution separately |
| Auth0 | Rejected | Expensive at scale; overconfigured for V1 needs |
| Custom JWT | Future | Maximum control; correct when scale justifies it |

### Authentication Flows

**Flow 1: Operator Web Login**
```
User enters email/password → Supabase Auth validates credentials
→ custom_access_token_hook fires → reads company_id + role from profiles
→ Supabase issues JWT with user claims + app_metadata (company_id, role)
→ JWT stored in HttpOnly cookie (Supabase client handles this)
→ Next.js middleware validates JWT on every request via Supabase server client
→ companyId + role extracted from JWT app_metadata via public.auth_company_id()
→ Bivro's AuthContext populated → Request proceeds
```

**Flow 2: Company Registration → Approval → Owner Activation**
```
STEP 1 — Public registration (anonymous)
  User submits /register form (legal_name, country, owner email, password, T&C acceptance)
  → Server validates: email not already registered, password policy, VAT format
  → Supabase Auth: createUser(email, password) → auth.users created
  → after_signup hook fires (Edge Function):
       creates companies row (company_status: 'pending_email_verification',
                              subscription_tier: 'free', subscription_status: 'trialing')
       creates profiles row (id = auth.uid(), company_id, role: 'owner')
  → Supabase Auth sends email confirmation automatically
  → User redirected to /register/check-email

STEP 2 — Email verification
  Owner clicks confirmation link → app/auth/confirm/route.ts
  → Confirms token with Supabase Auth
  → Updates companies.company_status → 'pending_review'
  → Sends platform-registration-received email to owner
  → Writes activity_logs (company.email_verified)
  → Owner redirected to /pending-approval (status page, no dashboard access)

STEP 3 — Platform Admin review
  Platform Admin sees company in admin.bivro.io/registrations (company_status = 'pending_review')
  → Platform Admin approves (tenants.approve permission):
       companies.company_status       → 'active'
       companies.trial_ends_at        → now() + 14 days
       companies.reviewed_at/by       set
       provisionCompany(companyId) runs via service_role:
         company_settings, permission_groups, service_catalog,
         email_templates, email_automations, platform sender_identity
       Writes platform_audit_log, activity_logs, domain_events
       Sends platform-registration-approved email to owner

STEP 4 — Owner first login
  Owner visits /login → Supabase Auth validates credentials
  → custom_access_token_hook reads company_status = 'active' + company_id + role
  → JWT issued with {company_id, role, company_status} in app_metadata
  → Middleware detects first login (profiles.last_seen_at IS NULL)
  → Redirected to /onboarding (7-step onboarding wizard)

All transitions update company_status in JWT via custom_access_token_hook on every
token refresh. Non-active statuses route to status-specific pages, never the dashboard.
Full state machine and transition rules: ONBOARDING_ARCHITECTURE.md §1.
```

**Flow 3: Office User Invitation (invitation-only; no self-registration)**
```
Owner creates invitation (Settings → Team → Invite Member):
  Enters: invitee email, permission groups
  → Server generates 32-byte random token; stores SHA-256(token) in user_invitations.token_hash
    (raw token NEVER stored in database)
  → user_invitations row: { company_id, email, role:'office', permission_group_ids (snapshot),
                             token_hash, expires_at: now()+7d, status:'pending' }
  → platform-office-invitation email sent via Resend with raw token in link

Invitee clicks /invite/{raw_token}:
  → Server: SHA-256(token) → look up user_invitations WHERE token_hash = hash AND status='pending'
  → If expired: status → 'expired'; redirect /invite/expired
  → If valid: show invitation landing page → password setup form
  → On submit: Supabase Admin API creates auth.users; profiles row created;
               user_permission_groups rows created from permission_group_ids snapshot
  → user_invitations.status → 'accepted'
  → custom_access_token_hook reads company_id + role = 'office' from profiles
  → JWT issued → redirected to /onboarding/welcome (first-login screen)

Expiry: nightly cron sets status='expired' for pending invites where expires_at < now().
Full spec: ONBOARDING_ARCHITECTURE.md §7.
```

**Flow 4: Crew Mobile Login**
```
Crew member receives invite link → Enters email → Supabase Auth sends OTP
→ OTP verified → Supabase issues JWT
→ Expo SecureStore saves session token
→ Mobile app sends Bearer token with every API request
→ Next.js API validates JWT → Crew member's restricted AuthContext injected
```

**Flow 5: Customer Portal (No Auth)**
```
Customer receives unique job URL (contains signed token) → No login required
→ Next.js verifies token signature (HMAC-SHA256, job ID + tenant ID + expiry)
→ Customer identity derived from token → Read-only access to specific job
→ No Supabase Auth session created
```

**Flow 6: Background Jobs (System Context)**
```
Vercel Cron or Supabase Edge Function invoked
→ Uses Supabase service role key (bypasses RLS for system operations)
→ tenantId explicitly scoped in every query (application-level)
→ Audit log records action as "system" on behalf of tenantId
→ Service role key never exposed to client
```

### Session Strategy

- **Web:** Supabase client manages HttpOnly, Secure cookies automatically. Session auto-refreshed.
- **Mobile:** Expo SecureStore (hardware-backed on iOS, Keystore on Android). Supabase client handles token refresh.
- **Customer portal:** Stateless HMAC-signed token in URL. No session storage. Expires in 72 hours.
- **System/background:** Supabase service role key in server environment variables only.

### Supabase Auth as External System

Bivro maintains its own `users` table in PostgreSQL. Supabase Auth is the source of truth for credentials and sessions. Bivro is the source of truth for authorization (roles, permissions, tenant structure).

When a user authenticates, Bivro's middleware looks up the internal user record by `auth.uid()`. If no internal record exists (first login from an invite), one is created (just-in-time provisioning). This decoupling means Bivro can migrate off Supabase Auth without changing any authorization logic.

---

## 8. Authorization & RBAC

### Decision: Configurable Permission System with Middleware Enforcement

Bivro V1 has two login roles (`owner` and `office`) stored in the JWT. However, the `office` role has no fixed permission set — permissions are configurable per user by the Owner, via Permission Groups.

The authorization model is:
```
JWT role claim → if 'owner': grant all
                 if 'office': load permission set from database → evaluate
```

### Two-Tier Authorization

**Tier 1 — Role check (fast, JWT-based)**
The `owner` role bypasses all permission checks. If `public.auth_user_role() = 'owner'`, the request is authorized without a database lookup. This is the only fast-path.

**Tier 2 — Permission check (database-backed, cached)**
For `office` users, the permission set is loaded from the database (permission groups + individual overrides for that user), cached in memory for the request lifetime, and evaluated against the required permission for each tRPC procedure.

### Permission Model

```
User (office role)
  → belongs to Permission Groups (0 or more)
  → groups contain permission grants (e.g., "quotes.create", "jobs.assign")
  → individual overrides (explicit grant or deny per user, override group settings)
  → resolved permission set = union of all group grants ± individual overrides
```

Permission keys follow the format `{resource}.{action}`:

```
customers.view / customers.create / customers.edit / customers.delete / customers.export
leads.view / leads.create / leads.edit / leads.delete / leads.assign
quotes.view / quotes.create / quotes.edit / quotes.delete / quotes.duplicate
quotes.send / quotes.approve / quotes.change_pricing / quotes.view_cost_price / quotes.apply_discount
jobs.view / jobs.create / jobs.edit / jobs.assign / jobs.complete / jobs.cancel
employees.view / employees.create / employees.edit / employees.delete
vehicles.view / vehicles.create / vehicles.edit / vehicles.delete
invoices.view / invoices.create / invoices.edit / invoices.cancel / invoices.refund
payments.view / payments.record_manual / payments.export
ai.view_suggestions / ai.generate_quote / ai.override / ai.auto_pricing / ai.auto_emails
analytics.view_operations / analytics.view_sales / analytics.view_financial / analytics.export
settings.company / settings.templates / settings.services / settings.users
settings.permissions / settings.integrations
```

### RBAC Implementation

**Step 1: Middleware resolution**
Every API request goes through `withAuth` middleware, which resolves:
```
{ userId, companyId, role, permissions: Set<string> }
```

`companyId` and `role` come from the Supabase JWT `app_metadata`. For `owner` role, `permissions` is the sentinel `'*'` (all). For `office` role, permissions are loaded from the `permission_groups` / `user_permission_overrides` tables (see DATABASE_ARCHITECTURE.md).

**Step 2: Permission check at API boundary**
Each tRPC procedure declares its required permission string. Middleware evaluates:
- If `permissions === '*'` (owner): pass
- Else: `permissions.has(requiredPermission)` → pass or 403

This check happens before any domain logic executes. No procedure ever executes domain code before authorization is confirmed.

**Step 3: Row-level scoping in domain logic**
Some resources require additional scoping within the domain. Example: an office user with `quotes.view` can only see quotes that belong to their company (enforced by RLS). Additional scoping (e.g., a future crew role seeing only their own assigned jobs) is enforced inside the domain module, not just at the API boundary.

**Step 4: Tenant boundary (always first)**
Before any permission check, the `companyId` in the request context is validated. A user in Company A can never access resources from Company B, regardless of their permission set. RLS at the database level and explicit `companyId` scoping in all queries enforce this at two layers.

### V1: Permission Loading and Caching

For `office` users, permissions are loaded per request:

1. Check server-side in-memory cache (`userId` → permissions set, TTL 60 seconds)
2. If cache miss: query `user_permission_groups` → join `permission_group_assignments` + `user_permission_overrides` → compute resolved set
3. Cache the resolved set for 60 seconds
4. On any permission group change or user override change: emit `iam.permissions.changed` domain event → cache is invalidated for affected user on next request

This means a maximum of 60 seconds before a permission change takes effect. This is acceptable for V1. Any critical revocation (e.g., terminating an employee) can be paired with session termination via Supabase Admin API to be immediate.

### Owner Guarantee

No permission check, no RLS policy, no middleware, and no domain logic gate ever blocks an Owner. The owner check is the outermost condition in every authorization decision:

```typescript
if (ctx.role === 'owner') return proceed();
if (!ctx.permissions.has(requiredPermission)) throw new ForbiddenError();
```

The Owner can also bypass soft-delete visibility (to recover deleted records), access all users' data within their company, and change their own permissions (which no office user can do).

### Audit Trail

Every permission grant, revocation, group membership change, or user role change is written to `activity_logs` with `action = 'iam.permissions.changed'`. This is enforced at the service layer and cannot be bypassed by application code.

### V2+: Custom Roles

The permission model is designed to support additional roles beyond `owner` and `office`. V2+ will introduce:
- `crew` role (restricted access to own assigned jobs — mobile only)
- Custom named roles (enterprise: create roles with arbitrary permission sets)

The database tables (`permission_groups`, `permission_group_assignments`, `user_permission_overrides`) already support this without schema changes. Only the `user_role` enum requires a new value and the JWT hook requires updating.

---

## 9. API Architecture

### Three API Surfaces

Bivro exposes three distinct API surfaces, each designed for its consumer.

---

### Surface 1: Internal API (tRPC)

**Consumer:** Operator web application.

**Decision:** tRPC v11 with React Query integration.

**Why tRPC:**
tRPC provides end-to-end type safety from the database schema to the React component with zero code generation. When a database field changes, TypeScript propagates the error to every UI component that uses it. This eliminates an entire class of runtime errors that exist in REST APIs with separate client libraries.

tRPC procedures are the canonical entry point into each domain module. They handle input validation (Zod), auth/permission checks, domain method calls, and response serialization.

tRPC routes are organized by domain module:
```
/api/trpc/[trpc]
  → leads.list, leads.get, leads.create, leads.update, leads.archive
  → quotes.list, quotes.get, quotes.create, quotes.send, quotes.accept
  → jobs.list, jobs.get, jobs.create, jobs.updateStatus, jobs.assignCrew
  → ...
```

**Trade-offs:**
- tRPC requires the TypeScript client — not usable from non-TypeScript consumers without a REST adapter.
- This is acceptable: the web app is TypeScript-native. Mobile uses the REST surface (see below).

---

### Surface 2: Mobile & Portal API (REST)

**Consumer:** Crew mobile app (Expo), Customer Portal (server-rendered Next.js pages).

**Decision:** REST endpoints via Next.js Route Handlers.

**Why REST for mobile:**
The Expo mobile app is TypeScript but does not benefit from tRPC the same way as the web app. REST is simpler to reason about on mobile, produces smaller bundle sizes, and is easier to debug with standard tools.

**Route structure:**
```
GET  /api/v1/crew/jobs           → assigned jobs for authenticated crew member
GET  /api/v1/crew/jobs/:id       → single job detail
POST /api/v1/crew/jobs/:id/clock-in
POST /api/v1/crew/jobs/:id/clock-out
POST /api/v1/crew/jobs/:id/inventory/confirm
POST /api/v1/crew/jobs/:id/damage           → with photo upload
POST /api/v1/crew/jobs/:id/complete

GET  /api/v1/portal/:token       → customer portal data (no auth, token-based)
POST /api/v1/portal/:token/accept-quote
POST /api/v1/portal/:token/sign
POST /api/v1/portal/:token/review
```

---

### Surface 3: Public API (REST, Future — P2)

**Consumer:** Third-party developers, partner integrations.

**Decision:** Versioned REST API (/api/v1/) with API key authentication and OpenAPI specification.

**Versioning strategy:** URL-based versioning (/v1/, /v2/). Breaking changes require a new version. Old versions supported for 12 months after deprecation announcement.

**Authentication:** API keys (Bearer token), issued per tenant, scoped to specific permissions.

**Rate limiting:** Per API key, per tenant. Default: 1,000 requests/hour. Enterprise: custom limits.

**Webhook delivery:** Outbound webhooks for all domain events. HMAC-SHA256 signature on payload. Retry with exponential backoff on delivery failure.

---

### API Design Standards

- All requests and responses are JSON.
- All timestamps are ISO 8601, UTC.
- All monetary values are integers in the smallest currency unit (cents), never floats.
- All IDs are UUIDs (v7 — time-ordered for index performance).
- Pagination uses cursor-based pagination (not offset) — offset pagination is O(n) in PostgreSQL; cursor is O(1).
- Error responses follow RFC 7807 (Problem Details): `{ type, title, status, detail, instance }`.

---

## 10. Background Job Architecture

### V1 Decision: Vercel Cron + Supabase Edge Functions + Async Route Handlers

For V1, background work is handled without a dedicated job orchestration service. Three mechanisms cover all use cases:

---

### Mechanism 1: Vercel Cron Jobs (Scheduled, Recurring)

Vercel Pro includes cron job scheduling at no extra cost. Cron expressions trigger Next.js API route handlers on a schedule.

**V1 Cron Job Catalogue:**

| Schedule | Job | What it does |
|----------|-----|-------------|
| Nightly (00:05) | Invitation expiry | `UPDATE user_invitations SET status = 'expired' WHERE expires_at < NOW() AND status = 'pending'` |
| Daily (07:00 local) | CEO Brief (AI-005) | Triggers AI-005 for every active company; generates daily operational summary for owners |
| Daily (06:00) | Analytics aggregation | Aggregates `ai_logs.cost_millicents`, quote/job/payment counts into `metric_snapshots` for dashboard |
| Daily (09:00) | Overdue invoice detection | Queries invoices where `due_date < NOW() AND status != 'paid'`; emits `invoice.overdue` domain events |
| Daily (08:00) | Quote expiry | `UPDATE quotes SET status = 'expired' WHERE expires_at < NOW() AND status IN ('sent', 'viewed')` |
| Daily (02:00) | AI lead scoring refresh | Re-scores leads not scored in the last 24h; updates `ai_lead_scores` table |
| Nightly (01:00) | Pattern Observation (AI-007) | Triggers AI-007 batch; identifies behavioral patterns across the company's job history |
| Weekly (Mon 06:00) | Profit Analysis (AI-008) | Triggers AI-008; generates weekly financial insight for owners |
| Weekly (Mon 09:00) | Fleet maintenance alerts | Checks `vehicles.next_service_date`; emits maintenance alerts for vehicles overdue or within 7 days |
| Monthly (1st, 07:00) | Learning Report (AI-010) | Triggers AI-010; generates monthly cumulative learning report |
| Every 15 min | Domain event monitor | Queries `domain_events WHERE processed_at IS NULL AND created_at < NOW() - INTERVAL '5 minutes'`; logs to Sentry if any found — these are processing failures requiring investigation |
| Every 90 days | Notifications cleanup | Hard-deletes `notifications` rows older than 90 days and already read |

**Characteristics:** Simple, reliable, observable in Vercel dashboard. No retry on failure (acceptable for polling jobs — they run again on the next scheduled cycle). Failures are captured by Sentry.

---

### Mechanism 2: Supabase Database Webhooks → Next.js API Routes (Event-triggered)

Supabase can watch for row insertions on any table and POST to an HTTP endpoint. Bivro uses this to trigger immediate reactions to domain events.

**How it works:**
```
Domain event written to domain_events table
→ Supabase Database Webhook fires (within ~1 second)
→ POST to /api/webhooks/domain-event
→ Route handler reads event payload
→ Dispatches to correct handler (send email, generate PDF, etc.)
→ Handler records completion timestamp on the event row
```

**Used for:**
- Email sending on lifecycle events (quote sent, booking confirmed, job started)
- PDF generation on job completion and invoice creation
- Notification creation on quote opened, crew assigned, etc.

**Characteristics:** Near-real-time. Single attempt per webhook (no built-in retry). For V1, failures are caught by Sentry and can be re-triggered manually or by the next cron run.

---

### Mechanism 3: Supabase Edge Functions (Heavy, Isolated Processing)

Supabase Edge Functions are Deno-based serverless functions that run close to the database. Used for processing tasks that are too heavy for a Next.js route handler or that benefit from direct database access without HTTP.

**Used for:**
- AI-intensive batch processing (processing all leads for AI scoring in bulk)
- Large data exports (generate CSV for enterprise reports)
- Stripe webhook processing (requires direct database writes with strong consistency)

**Characteristics:** Up to 150 seconds timeout. Direct Supabase DB access. Independent from the Next.js application lifecycle.

---

### V1 Limitations (Known, Accepted)

| Limitation | Impact | V2+ Solution |
|------------|--------|-------------|
| No durable retry on DB webhook failure | Email or PDF not sent if handler crashes | Inngest: automatic retry with exponential backoff |
| No step functions (multi-step workflows) | Quote follow-up sequences are implemented as separate cron jobs, not chained steps | Inngest: `step.sleep()` + `step.waitForEvent()` |
| No workflow observability UI | Background job history requires querying logs | Inngest: step-level execution history dashboard |
| Cron minimum interval: 1 minute | Cannot trigger sub-minute scheduled jobs | Acceptable for V1 use cases |

**The V1 approach is intentional.** It ships a working product without Inngest's learning curve and billing overhead. The domain_events table is the source of truth — no event is lost. When V2+ requires durable workflows, Inngest consumes from the same event table.

### V2+ Upgrade: Inngest

When the V1 limitations become painful (typically when quote follow-up sequences need reliable multi-step coordination, or when background job failure rate causes customer complaints), Inngest is the upgrade path.

Inngest provides:
- Durable workflows (step functions that survive process restarts)
- Wait-for-event primitives (pause a workflow until a specific event arrives)
- Automatic retry with exponential backoff per step
- Complete observability (step-level history in dashboard)
- Native Next.js/Vercel integration

The transition requires no domain logic changes — only the dispatch mechanism changes (from DB webhook → HTTP handler to event publication → Inngest function). The domain_events table continues to be the authoritative log.

### Idempotency (V1 and V2+)

Every background handler that writes to the database or calls an external service is idempotent. Handlers receive the `domain_event.id` as an idempotency key. Running the same handler twice with the same event ID produces exactly one side effect.

---

## 11. Event Architecture

### Decision: Domain Event System via PostgreSQL Table

Bivro uses an internal event-driven architecture where domain state changes emit events consumed by other modules asynchronously.

### Event Design Principles

**Events are facts, not commands.**
An event says "this happened" — not "please do this." `job.completed` is a fact. The Communications module decides to send a post-move email in response. The Billing module decides to create an invoice. Neither is encoded in the event.

**Events carry sufficient payload.**
Each event payload contains enough data for consumers to act without querying the database. This prevents N+1 event processing and decouples consumers from producers.

**Events are immutable.**
Once emitted, events are never modified. If a correction is needed, a new corrective event is emitted.

### Core Event Catalogue

```
iam.user.invited
iam.user.role_changed

tenant.created
tenant.subscription_upgraded
tenant.subscription_downgraded
tenant.suspended

crm.lead.created             { leadId, tenantId, source, estimatedValue, assignedTo }
crm.lead.assigned            { leadId, tenantId, estimatorId }
crm.lead.converted           { leadId, tenantId, customerId }
crm.lead.lost                { leadId, tenantId, reason }

quoting.quote.drafted        { quoteId, tenantId, customerId, totalAmount }
quoting.quote.sent           { quoteId, tenantId, customerId, customerEmail }
quoting.quote.opened         { quoteId, tenantId, openedAt }
quoting.quote.accepted       { quoteId, tenantId, customerId, totalAmount }
quoting.quote.declined       { quoteId, tenantId, reason }
quoting.quote.expired        { quoteId, tenantId }

jobs.booking.created         { bookingId, tenantId, jobDate, origin, destination }
jobs.job.created             { jobId, tenantId, bookingId }
jobs.job.crew_assigned       { jobId, tenantId, crewIds, vehicleId }
jobs.job.started             { jobId, tenantId, startedAt, crewLeadId }
jobs.job.completed           { jobId, tenantId, completedAt, customerSignatureUrl }
jobs.job.cancelled           { jobId, tenantId, reason, cancelledBy }

workforce.crew.clocked_in    { crewMemberId, tenantId, jobId, location, timestamp }
workforce.crew.clocked_out   { crewMemberId, tenantId, jobId, location, timestamp }

payments.invoice.created     { invoiceId, tenantId, jobId, amount, dueDate }
payments.invoice.sent        { invoiceId, tenantId, customerId, customerEmail }
payments.invoice.paid        { invoiceId, tenantId, amount, paidAt, method }
payments.invoice.overdue     { invoiceId, tenantId, dueDate, amount, daysPastDue }
payments.payment.failed      { invoiceId, tenantId, reason }
payments.refund.issued       { invoiceId, tenantId, amount, reason }

documents.document.generated { documentId, tenantId, type, jobId, storageUrl }
documents.document.signed    { documentId, tenantId, signedAt, signatoryEmail }

comms.email.sent             { messageId, tenantId, recipientEmail, template }
comms.email.opened           { messageId, tenantId, openedAt }
comms.email.bounced          { messageId, tenantId, reason }

ai.quote.generated           { quoteId, tenantId, confidence, processingMs, tokensUsed }
ai.inventory.parsed          { requestId, tenantId, itemCount, confidence }
```

### Event Storage

All events are persisted to a PostgreSQL `domain_events` table before being dispatched. This is the ground truth. No event processing system (V1 webhooks or V2+ Inngest) can outpace the database write.

```
domain_events
  id           UUID (v7)
  tenant_id    UUID
  event_type   text (e.g., "jobs.job.completed")
  aggregate_id UUID (the root entity this event relates to)
  payload      JSONB
  created_at   timestamptz
  processed_at timestamptz (null until all handlers complete)
```

### V1 Event Dispatch

```
1. Domain module writes primary record to database (e.g., job status → completed)
2. Domain module inserts row into domain_events table (same transaction)
3. Supabase Database Webhook detects INSERT on domain_events
4. Webhook POSTs to /api/webhooks/domain-event within ~1 second
5. Handler routes by event_type to the correct module handler
6. Handler performs side effect (send email, generate PDF, create notification)
7. Handler updates processed_at on the domain_events row
```

Events where `processed_at` is null after 5 minutes are considered failed and visible to operators in the internal dashboard.

### V2+ Event Dispatch

The `domain_events` table remains. The dispatch mechanism changes: instead of a DB webhook, a trigger publishes to Inngest, which provides durable retry, step functions, and observability. No domain logic changes.

---

## 12. AI Service Architecture

### Decision: Anthropic Claude API with Internal AI Module

All AI capabilities are encapsulated in the AI Engine module. No other module calls the Anthropic API directly.

### AI Module Responsibilities

```
┌─────────────────────────────────────────────────────────┐
│                    AI Engine Module                      │
│                                                          │
│  PromptRegistry → manages versioned prompt templates     │
│  RequestRouter  → selects model based on task type       │
│  RateLimiter    → per-tenant token budget (DB-tracked)   │
│  CostTracker    → records tokens used per tenant/call    │
│  ResponseParser → validates and structures AI output     │
│  FeedbackStore  → records operator corrections           │
│  V1: No cache   → V2+: Upstash Redis (24h TTL)          │
└─────────────────────────────────────────────────────────┘
```

### Model Selection Strategy

Not all AI tasks require the same model. Bivro uses a tiered model strategy:

| Task | Model | Rationale |
|------|-------|-----------|
| Inventory parsing (complex) | claude-sonnet-4-6 | Requires strong reasoning and structured output |
| Lead scoring | claude-haiku-4-5 | Simple classification; speed and cost matter |
| Email drafting | claude-sonnet-4-6 | Quality matters; customer-facing |
| AI insight generation | claude-sonnet-4-6 | Requires nuanced understanding |
| Simple classifications | claude-haiku-4-5 | Fast, cheap, sufficient |
| Complex job analysis | claude-opus-4-8 | Reserved for enterprise tier |

### Prompt Architecture

Prompts are versioned, testable artifacts managed in the PromptRegistry:

```
/modules/ai/prompts/
  inventory-parser.v1.ts     ← structured prompt template
  inventory-parser.v2.ts     ← improved version (A/B tested)
  lead-scorer.v1.ts
  email-drafter.v1.ts
  insight-generator.v1.ts
```

Each prompt template is typed, versioned, and tested with recorded inputs and expected outputs.

### AI Response Validation

Every AI response is parsed through a Zod schema validator. If the response does not match the expected structure, the AI Engine retries with a correction prompt (up to 2 retries). If still invalid, the operation falls back to a manual flow and alerts the operator.

AI outputs that enter the database must be validated data structures, never raw text.

### Feedback Loop Architecture

- **Implicit feedback:** If an operator edits an AI-generated quote before sending, the delta is recorded.
- **Explicit feedback:** Operators can mark AI outputs as "inaccurate" with a reason.
- **Outcome feedback:** Final accepted quote amount vs. AI-generated amount is recorded.

Feedback is stored in the `ai_feedback` table and used for prompt improvement and per-tenant rate matrix calibration.

### AI Cost Management

- **Per-tenant monthly token budget** (configurable by subscription tier)
- **Alert at 80% of budget:** Owner notified
- **Hard stop at 100%:** AI features disabled until next billing period or manual override
- **Cost attribution:** Every Claude API call records tenantId, task type, tokens in, tokens out, cost
- **V1:** No response cache (acceptable at low volume). **V2+:** Upstash Redis cache (identical requests, 24h TTL)

### AI Latency Budget

| Task | Target P50 | Target P99 | Strategy if exceeded |
|------|-----------|-----------|---------------------|
| Inventory parse | < 3s | < 8s | Show progress indicator; never block |
| Lead scoring | < 5s | < 15s | Async; update score when complete |
| Email draft | < 4s | < 10s | Stream response to UI |
| AI insights | < 10s | < 30s | Background job; notify when ready |

AI operations never block the critical user path.

---

## 13. File Storage Architecture

### V1 Decision: Supabase Storage

All file storage uses Supabase Storage in V1.

### Why Supabase Storage for V1

Supabase Storage is backed by S3 and supports RLS policies on storage objects — the same tenant isolation model used on database tables applies to files. No separate access control system, no separate SDK, no separate configuration. It is included in the Supabase plan.

For V1 file volumes (PDFs, a few photos per job), Supabase Storage is entirely sufficient.

### File Organization

```
supabase-storage://{tenant_id}/
  quotes/
    {quote_id}.pdf
  contracts/
    {job_id}-agreement.pdf
    {job_id}-agreement-signed.pdf
  jobs/
    {job_id}/
      bill-of-lading.pdf
      inventory-checklist.pdf
      damage-report.pdf
      delivery-receipt-signed.pdf
      photos/
        {photo_id}.jpg
  invoices/
    {invoice_id}.pdf
  crew/
    {crew_member_id}/
      license.pdf
      certifications/
        {cert_id}.pdf
  company/
    logo.png
    email-header.png
```

### File Access

- **Private files** (most files): Accessed via Supabase signed URLs. URLs expire in 1 hour for web, 15 minutes for customer portal.
- **Semi-public files** (customer portal documents): Short-lived signed URLs generated per session.
- **No public bucket by default.** All file access is mediated through the application.

### Upload Flow

All uploads go through the application server:
1. Validates file type (MIME type check — not extension)
2. Validates file size (hard limit: 20MB per file)
3. Uploads to Supabase Storage under the tenant's namespace
4. Records the storage path in the database
5. RLS on the storage bucket enforces tenant isolation at the storage layer

### V2+: Cloudflare R2

When file egress costs become significant (estimate: >$200–500/month), Supabase Storage is replaced with Cloudflare R2.

R2 advantages over Supabase Storage at scale:
- Zero egress cost (Supabase Storage egress is metered)
- S3-compatible API (code change is minimal — swap the client and endpoint)
- Cloudflare CDN integration for global low-latency delivery

The file organization path structure is identical between V1 and V2+ — the migration is a client swap, not a file reorganization.

---

## 14. PDF Generation Architecture

### Decision: Puppeteer (Headless Chrome) for All PDF Types

All PDFs are generated server-side via Puppeteer, which renders an HTML template to PDF.

### Why Puppeteer

| Option | Verdict | Reason |
|--------|---------|--------|
| @react-pdf/renderer | Rejected | Complex layout limitations (no CSS grid, flexbox quirks); output differs from web preview |
| PDFKit (programmatic) | Rejected | Verbose; non-designers cannot modify templates |
| Puppeteer (headless Chrome) | Selected | HTML/CSS templates identical to web preview; any CSS layout works |
| Browserless.io (hosted Chrome) | V2+ option | Correct at scale when Puppeteer memory becomes a constraint |

### V1 PDF Generation Flow

```
1. tRPC procedure or DB webhook handler triggers PDF generation
2. Document template loaded from database (HTML string with template variables)
3. Template compiled with job/quote/invoice data
4. Puppeteer launches headless Chrome instance
5. HTML rendered to in-memory page
6. Chrome print-to-PDF with @media print CSS
7. PDF buffer uploaded to Supabase Storage under tenant namespace
8. Storage path recorded in database (documents.storage_url)
9. document.generated event written to domain_events
10. DB webhook triggers downstream actions (email attachment, portal availability)
```

### V1 PDF Generation Environment

Puppeteer requires Chrome, which exceeds Vercel's 50MB function bundle limit. In V1, PDF generation runs via a Supabase Edge Function — which has a larger runtime environment and is not subject to Vercel's bundle size limit.

- **Development:** Local Puppeteer installation
- **V1 Production:** Supabase Edge Function (triggered by DB webhook or direct call)
- **V2+ Production:** Railway persistent worker (when PDF volume requires dedicated horizontal scaling)

### PDF Template Architecture

PDF templates are stored as HTML in the database, making them editable without a code deployment. Template variables follow a `{{ variable }}` syntax. Templates are versioned; old versions are retained for historical document regeneration.

---

## 15. Email Service Architecture

### Decision: Resend + React Email

Transactional emails are sent via Resend. Email templates are React components built with React Email.

### Why Resend

Resend has native React Email integration, strong deliverability, and a developer-first API. SendGrid and Postmark are established alternatives — Resend's React Email integration is the differentiating factor.

### React Email

Templates are React components: type-safe, browser-previewable, shareable components (Header, Footer, Button), and version-controlled alongside the application.

### Template Inventory

```
/emails/
  lead-acknowledgment.tsx
  quote-sent.tsx
  quote-follow-up-1.tsx       ← 24h unopened
  quote-follow-up-2.tsx       ← 48h unopened
  booking-confirmation.tsx
  pre-move-preparation.tsx    ← 7 days before
  move-reminder.tsx           ← 48h before
  crew-on-the-way.tsx
  post-move-thank-you.tsx
  invoice-sent.tsx
  payment-reminder-1.tsx      ← 48h unpaid
  payment-reminder-2.tsx      ← 7 days unpaid
  payment-confirmed.tsx
  review-request.tsx
  crew-job-assignment.tsx
  crew-job-reminder.tsx
```

### V1 Email Sending Flow

```
1. Domain event written to domain_events (e.g., quoting.quote.sent)
2. Supabase DB webhook fires → POST to /api/webhooks/domain-event
3. Handler routes to Communications module
4. Module selects correct email template
5. Template rendered with event payload data
6. Resend API called (synchronous — awaited in handler)
7. comms.email.sent event written to domain_events
8. Resend webhook (on open/bounce) → POST to /api/webhooks/email-tracking
9. comms.email.opened or comms.email.bounced event written
```

### V2+ Email Flow (with Inngest)

Steps 1–6 are identical. Inngest replaces the DB webhook mechanism and adds retry, step functions for follow-up sequences, and observability.

### Deliverability Strategy

- Dedicated sending domain per Bivro environment (mail.bivro.io for production)
- SPF, DKIM, DMARC records configured
- Warmup process for new sending domain
- Bounce and complaint handling via Resend webhooks
- Hard bounced addresses suppressed automatically
- Unsubscribe link in all sequence emails (CAN-SPAM / GDPR compliance)

---

## 16. Notification Architecture

### Three Notification Channels

**Channel 1: In-app notifications (web)**

**V1:** Implemented via Supabase Realtime.

Supabase Realtime provides WebSocket-based live updates over PostgreSQL changes. When a row is inserted into the `notifications` table, Supabase broadcasts it to subscribed clients. This is simpler than implementing SSE from scratch — Supabase manages the connection.

```
Browser subscribes to Supabase Realtime channel (filtered to current userId)
→ Server-side: notification row inserted for this user
→ Supabase Realtime broadcasts the INSERT event
→ Browser receives new notification without polling
→ Notification badge / toast displayed
```

**V2+:** Supabase Realtime continues to work at larger scale. If the WebSocket connection overhead becomes significant, migrate to SSE for read-only notification delivery (simpler HTTP).

---

**Channel 2: Push notifications (mobile)**

Crew mobile app receives push notifications via Expo's push notification service, which abstracts over APNs (iOS) and FCM (Android).

```
Domain event triggers notification creation
→ notification row inserted for crew member
→ Supabase DB webhook → /api/webhooks/push
→ Handler queries Expo push token for crew member
→ Expo Push API called
→ Notification delivered to device
```

---

**Channel 3: Email notifications**

Covered in Section 15. Email handles customer communications and owner-level alerts (daily digest, critical system alerts). Not used for real-time operational alerts — in-app and push handle those.

### Notification Storage

```
notifications
  id           UUID
  tenant_id    UUID
  user_id      UUID
  type         text (e.g., "quote.opened", "job.late")
  title        text
  body         text
  data         JSONB (deep-link context)
  read_at      timestamptz (null until read)
  created_at   timestamptz
```

Supabase Realtime watches this table per user. RLS ensures users only receive their own notifications.

---

## 17. Audit Logging

### Decision: Append-only PostgreSQL Audit Log

Every state-changing action in Bivro is logged to an immutable audit log.

### What is Logged

Every write operation — create, update, delete — on any business entity produces an audit log entry:
- User actions (operator created a quote, dispatcher assigned crew)
- System actions (background job sent an email, AI generated a quote)
- Failed attempts (permission denied, validation error)

### Audit Log Schema

```
audit_log
  id              UUID (v7)
  tenant_id       UUID
  actor_id        UUID (user who performed the action, or null for system)
  actor_type      text ('user' | 'system' | 'api_key')
  action          text (e.g., 'quote.created', 'job.status.updated')
  resource_type   text (e.g., 'quote', 'job')
  resource_id     UUID
  before_state    JSONB (null for create operations)
  after_state     JSONB (null for delete operations)
  ip_address      inet
  user_agent      text
  request_id      UUID
  created_at      timestamptz
```

### Audit Log Guarantees

- **Append-only:** No UPDATE or DELETE is ever issued against `audit_log`. PostgreSQL row security prevents it.
- **V1 Write mechanism:** Audit log writes happen in the same request handler, after the primary write succeeds. Failure to write the audit log does not roll back the primary transaction.
- **V2+ Write mechanism:** Audit log writes move to a background job (Inngest) when volume makes synchronous writes a latency concern.
- **Retention:** Minimum 2 years. Enterprise: configurable.
- **Query access:** Read-only. Accessible via admin UI and data export only.

---

## 18. Error Handling Strategy

### Taxonomy of Errors

**Class 1: Validation Errors**
User input that fails Zod schema validation. Expected. Return 400 with field-level error details. Never logged as system errors.

**Class 2: Authorization Errors**
Permission checks that fail. Return 403. Log with IP and user. Alert if frequency exceeds threshold (possible security probe).

**Class 3: Domain Errors**
Business rule violations (e.g., crew double-booked). Expected and carry business meaning. Return 422 with typed error code.

**Class 4: Infrastructure Errors**
Database failures, external service unavailability. Unexpected. Log to Sentry with full context. Return 503. Retry where appropriate.

**Class 5: Unknown Errors**
Unhandled exceptions. Log to Sentry with full stack trace. Return 500 with generic message (never expose internal details). Alert on-call if frequency exceeds threshold.

### Error Response Format (RFC 7807)

```json
{
  "type": "https://bivro.io/errors/crew-conflict",
  "title": "Crew member already assigned",
  "status": 422,
  "detail": "Jordan Smith is already assigned to Job #1042 at this time.",
  "instance": "/api/trpc/jobs.assignCrew",
  "requestId": "req_01j..."
}
```

### Background Job Error Handling

**V1:** Handler failures are caught, logged to Sentry, and recorded on the `domain_events` row. Unprocessed events are visible in the internal ops dashboard. Manual re-trigger is available. Vercel Cron jobs retry on the next scheduled run.

**V2+ (Inngest):** Automatic retry per step with exponential backoff (1s, 30s, 5min). Dead letter queue after max retries. Slack + Sentry alert for dead letter events.

### External Service Failures

| Service | V1 Failure Response |
|---------|-----------------|
| Anthropic API down | Fall back to manual flow; notify operator; unprocessed event visible in dashboard |
| Resend down | Email handler fails; event recorded as unprocessed; manual re-trigger available |
| Stripe webhook missed | Idempotency key ensures reprocessing is safe; Stripe retries webhooks for 72 hours |
| Supabase Storage unavailable | Document generation deferred; job completion not blocked |
| Supabase Auth unavailable | Return 503; cannot authenticate without identity provider |

---

## 19. Observability & Monitoring

### Three Pillars: Errors, Logs, Traces

**Pillar 1: Error Tracking — Sentry**
Every unhandled exception, every Class 4 and Class 5 error, every background job failure sent to Sentry with:
- Full stack trace
- Request context (tenantId, userId, route, input — PII stripped)
- Release version (every deploy tagged)
- Session replay for UI errors

**Pillar 2: Structured Logging**
All application logs are structured JSON emitted to stdout. Vercel collects and surfaces these. For persistent log search, forwarded to Logtail (BetterStack).

```json
{
  "level": "info|warn|error",
  "timestamp": "2026-06-29T10:00:00Z",
  "requestId": "req_01j...",
  "tenantId": "ten_...",
  "userId": "usr_...",
  "module": "quoting",
  "message": "Quote generated",
  "durationMs": 342,
  "aiTokensUsed": 1240
}
```

**Pillar 3: Tracing (V2+)**
V1: Sentry performance monitoring for basic request tracing.
V2+: OpenTelemetry → Datadog APM for distributed tracing across modules, database query analysis, and AI call duration tracking.

### Application Performance Monitoring

| Metric | Tool | Alert Threshold |
|--------|------|----------------|
| API P99 latency | Sentry | > 2s |
| Error rate | Sentry | > 1% of requests |
| Unprocessed domain events | Custom query | > 10 events older than 10 min |
| AI API success rate | Custom metric (DB) | < 95% |
| Uptime | Vercel + Checkly | < 99.9% |

### Business Metrics

Tracked in a lightweight `metric_snapshots` table, aggregated by Vercel Cron daily:
- Quotes generated per day
- Payments processed per day
- New tenant signups
- AI cost per tenant per day

Displayed in the Bivro Platform Admin portal — a protected `/admin/*` route group in the Next.js app, served exclusively at `admin.bivro.io` via a Vercel domain binding.

**V1 Admin Portal Security Rule:** All requests to `/admin/*` are intercepted by Next.js middleware before any route handler executes. The middleware enforces two conditions:

1. The request `Host` header must be `admin.bivro.io`. Any request arriving from `app.bivro.io`, `{slug}.bivro.io`, or any other origin is immediately rejected with `403 Forbidden` — no route code runs.
2. A valid platform admin session cookie must be present. Requests without a valid session are redirected to `admin.bivro.io/login`.

Company users cannot access `/admin/*` routes by URL manipulation because the domain binding and host check are enforced before authentication, and the platform admin session pool is completely separate from the company user session pool.

**V2+:** The platform admin portal is extracted to a standalone Next.js application with its own Vercel project, its own environment variables, and no shared codebase with the company portal. This eliminates any theoretical risk of route collision or middleware misconfiguration. See §17 (V2+ Migration Path) for the extraction sequence. The canonical specification for the admin portal is in `docs/PLATFORM_ADMIN.md`.

---

## 20. Security Architecture

### Defense in Depth

Security in Bivro is layered. No single control is relied upon. Each layer assumes the layer before it may have failed.

### Layer 1: Transport Security
- All traffic over HTTPS/TLS 1.3 minimum. HTTP redirected to HTTPS.
- HSTS header: `max-age=31536000; includeSubDomains; preload`.
- Certificate management via Vercel (automatic renewal).

### Layer 2: Authentication (Section 7)
Supabase Auth-managed sessions. HttpOnly, Secure cookies. No credentials in localStorage.

### Layer 3: Authorization (Section 8)
RBAC at the API middleware layer. Tenant isolation as the outermost check.

### Layer 4: Database Security
- Supabase PostgreSQL RLS (Section 6) — database-enforced tenant isolation.
- All queries via Drizzle ORM (parameterized statements). SQL injection is structurally prevented.
- Database connection string in environment variables, never in code.
- Supabase project accessible only via Supabase API (no direct PostgreSQL public exposure in V1).
- Supabase service role key (bypasses RLS) stored only in server-side environment variables. Never sent to the client.

### Layer 5: Input Validation
Every API input is validated with Zod at the API boundary before reaching domain logic. Invalid inputs rejected before any database query executes.

### Layer 6: Output Encoding
Next.js escapes all React output by default. Template literals in PDF and email generation are sanitized before insertion into HTML. XSS is structurally prevented for React-rendered content.

### Layer 7: PII Protection
Customer PII (names, phone numbers, addresses):
- Accessible only within tenant scope (RLS)
- Excluded from logs (no PII in structured logs)
- Excluded from error reports (Sentry scrubs configured fields)
- Exportable for GDPR Subject Access Requests
- Deletable for GDPR Right to Erasure (soft-delete → hard-delete after 30 days)

Enterprise tier: column-level encryption via PostgreSQL `pgcrypto`.

### Layer 8: Secrets Management
- All secrets in environment variables (never in code or version control)
- Vercel environment variables for Next.js app secrets
- Supabase environment variables for Edge Function secrets
- `.env` files in `.gitignore`, never committed
- Secret rotation: quarterly for API keys; on personnel changes for DB credentials

### Layer 9: Dependency Security
- `npm audit` in CI on every pull request
- Dependabot configured for automatic security patch PRs
- `package-lock.json` committed and enforced in CI

### Layer 10: Rate Limiting
- **V1:** Supabase's built-in rate limits on Auth endpoints. Next.js middleware rate limiting on API routes using an in-memory sliding window (acceptable at V1 scale).
- **V2+:** Upstash Redis token bucket — per-tenant per-endpoint rate limiting.

### Security Compliance Roadmap

| Standard | Timeline | Notes |
|---------|---------|-------|
| GDPR | MVP | Data export, deletion, consent tracking |
| SOC 2 Type I | Year 1 | Required for enterprise sales |
| SOC 2 Type II | Year 2 | Required for US enterprise contracts |
| PCI DSS | Year 1 | Scope A only — Bivro does not store card data (Stripe does) |
| ISO 27001 | Year 3 | For European enterprise customers |

---

## 21. Deployment Architecture

### V1 Decision: Vercel + Supabase Only

V1 runs entirely on two platforms: Vercel (Next.js app) and Supabase (database, auth, storage, edge functions, realtime). No additional worker hosting required.

```
┌─────────────────────────────┐    ┌──────────────────────────────────┐
│          Vercel             │    │           Supabase               │
│                             │    │                                  │
│  Next.js App (serverless)   │    │  PostgreSQL                      │
│  - tRPC API                 │    │  Auth (JWT)                      │
│  - REST API (mobile/portal) │    │  Storage (files)                 │
│  - SSR (customer portal)    │◄──►│  Realtime (notifications)        │
│  - Cron Jobs (scheduled)    │    │  Edge Functions (PDF/webhooks)   │
│                             │    │  Database Webhooks (event dispatch│
└─────────────────────────────┘    └──────────────────────────────────┘
```

This is the leanest possible production foundation. Two dashboards, two bills, one mental model.

### V2+ Additions

| Addition | Trigger | Platform |
|---------|---------|---------|
| Inngest (job orchestration) | Retry complexity; durable workflows needed | Inngest cloud (Vercel-native integration) |
| Railway (persistent workers) | Puppeteer PDF volume exceeds Edge Function limits | Railway |
| Upstash Redis | Permission caching needed; AI response cache needed | Upstash |
| Cloudflare R2 | Storage egress costs >$500/month | Cloudflare |

### Environments

| Environment | Purpose | Database | Deployment trigger |
|------------|---------|----------|-------------------|
| Production | Live customer traffic | Supabase production project | Merge to `main` |
| Staging | Pre-release validation | Supabase staging project | Merge to `staging` |
| Preview | Per-PR feature testing | Supabase staging project (shared) | Pull request opened |
| Development | Local development | Local Supabase (Docker) or staging | Local |

**Note on Preview environments:** V1 uses the staging Supabase project for preview deployments (shared, not isolated). V2+ uses dedicated database branches when the team grows and preview environment isolation becomes important.

### CI/CD Pipeline

```
Pull Request opened
  → GitHub Actions: TypeScript type-check (tsc --noEmit)
  → GitHub Actions: Lint (ESLint)
  → GitHub Actions: Unit tests (Vitest)
  → GitHub Actions: npm audit (security)
  → Vercel: Preview deployment (automatic)
  → GitHub comment: Preview URL posted

Pull Request merged to main
  → GitHub Actions: Full test suite (unit + integration)
  → Vercel: Production deployment (zero-downtime, automatic)
  → Supabase: Database migrations run via GitHub Action (supabase db push)
  → Sentry: Release created
```

### Database Migration Strategy

All migrations managed by Drizzle's migration system:
- Migration files committed to version control
- Every migration reviewed in pull request
- Applied automatically on merge via CI (Supabase CLI)
- Backwards-compatible only: add columns as nullable; remove in a separate migration after code is deployed
- Supabase supports migration rollback via the CLI if a migration fails

---

## 22. Infrastructure Stack

### V1 Complete Provider Map

| Concern | Provider | Tier | Monthly cost estimate |
|---------|---------|------|-----------------------|
| Web hosting | Vercel | Pro ($20/month) | $20 |
| Database | Supabase | Pro ($25/month) | $25 |
| Auth | Supabase Auth | Included in Pro | — |
| File storage | Supabase Storage | Included (pay for egress/GB) | ~$10–30 |
| Realtime | Supabase Realtime | Included in Pro | — |
| Edge Functions | Supabase Edge Functions | Included in Pro | — |
| Email | Resend | Free tier → Pro ($20/month) | $0–20 |
| AI | Anthropic Claude API | Pay per token | ~$30–200 |
| Payments | Stripe | 2.9% + $0.30/transaction | Transaction-based |
| Error tracking | Sentry | Free tier → Team ($26/month) | $0–26 |
| Deployment | Vercel + GitHub Actions | Free tier | $0 |
| Mobile | Expo | Free (EAS: $99/month when publishing) | $0–99 |

**Total V1 infrastructure cost:** ~$100–400/month. Covered by the first 1–2 paying customers.

### V1 → V2+ Provider Upgrade Map

| Concern | V1 | V2+ Upgrade | Trigger |
|---------|-----|------------|---------|
| Background jobs | Vercel Cron + Supabase Edge Functions | Inngest Team ($100/month) | Retry/workflow needs |
| File storage | Supabase Storage | Cloudflare R2 (~$15–50/month) | Egress cost >$200/month |
| Database branching | None | Neon or Supabase branching | Team scale / CI isolation |
| Caching | None | Upstash Redis (~$10/month) | Permission cache needed |
| Workers | None | Railway (~$50/month) | PDF volume at scale |
| Auth | Supabase Auth | Clerk Pro (~$100/month) | Complex org management |

---

## 23. Scaling Strategy

### Scaling Assumptions

Designing for 10,000 active operators with 100,000 jobs per month over the first three years. Not designing for 1 million concurrent users today.

### Horizontal Scaling (Vercel)
Next.js on Vercel scales automatically. Serverless functions spin up per request. No configuration required.

### Database Scaling (Supabase)
Supabase Pro scales to 8GB RAM and 4 CPU cores on its standard tier. Connection pooling via PgBouncer is included. For the first 500–1,000 tenants, Supabase Pro is sufficient.

When database read traffic becomes a bottleneck:
1. Upgrade to Supabase Team plan (read replicas available)
2. Route Analytics context queries to the read replica
3. Route all read-only tRPC procedures to the read replica

### Caching Strategy

**V1:** No external cache. The database handles read load at V1 scale.

**V2+:** Upstash Redis introduced for:

| Cache Target | TTL | Invalidation |
|-------------|-----|-------------|
| User permissions | 60s | On role change |
| Tenant settings | 5 minutes | On settings.updated event |
| AI response cache | 24h | On source data change |
| Rate limit buckets | 1 minute | Rolling window |

### When to Scale Each Layer

| Signal | Action |
|--------|--------|
| API P99 > 2s | Profile slow tRPC procedures; add DB indexes first; then consider Redis cache |
| DB queries > 500ms P99 | Add indexes; add read replica; query optimization |
| AI cost > 15% of revenue | Add Redis AI response cache; evaluate smaller models for simpler tasks |
| PDF queue backup | Move PDF generation to Railway persistent worker |
| Error rate spike | Investigate before scaling — scaling hides bugs |

---

## 24. Disaster Recovery

### Recovery Objectives

| Metric | Target | Measurement |
|--------|--------|------------|
| RTO (Recovery Time Objective) | < 1 hour | Time from incident detection to full service restoration |
| RPO (Recovery Point Objective) | < 5 minutes | Maximum data loss in a worst-case database failure |
| Availability target | 99.9% | ~8.7 hours downtime per year |
| Availability target (enterprise) | 99.95% | ~4.4 hours downtime per year |

### Database Recovery (Supabase)
Supabase Pro provides automated daily backups with Point-in-Time Recovery (PITR) for up to 7 days. In a catastrophic database event:
1. Restore to the last consistent point before the failure via Supabase dashboard
2. Replay any events from the domain_events table that were processed after the restore point
3. Notify affected tenants of any data that cannot be recovered

Monthly restore tests validate that recovery procedures work and measure actual RTO.

### File Storage Recovery (Supabase Storage)
Supabase Storage is backed by S3, which provides 11 nines durability. Files are replicated across multiple AWS data centers. No additional backup required for V1.

### Application Recovery (Vercel)
Previous application versions are retained by Vercel for instant rollback (under 60 seconds). All state lives in Supabase — there is no stateful recovery needed for the application layer.

### Incident Response Runbook

```
Level 1: Performance degradation
  → Sentry alert fires
  → On-call engineer investigates
  → Root cause + fix within 4 hours

Level 2: Partial outage (one module down)
  → Sentry alert fires
  → On-call + senior engineer
  → Status page updated (status.bivro.io)
  → Customer notification if impact > 30 min
  → RTO target: < 2 hours

Level 3: Full outage
  → All engineers notified
  → Incident commander assigned
  → Status page immediately updated
  → Customer email notification
  → RTO target: < 1 hour
  → Post-mortem required within 48 hours
```

---

## 25. Future Migration Path

### V1 → V2+: Background Jobs (Inngest)

**Trigger:** Quote follow-up sequences require reliable multi-step retry; or background job failure rate causes customer impact.

**Migration:** Add Inngest to the project. Inngest functions subscribe to the same `domain_events` table (or directly to events emitted after writes). The DB webhook mechanism is disabled as Inngest takes over. Domain logic is unchanged. This is a dispatch-layer swap.

**Effort estimate:** 1–2 engineering weeks.

---

### V1 → V2+: File Storage (Cloudflare R2)

**Trigger:** Supabase Storage egress costs exceed $200–500/month.

**Migration:** Update the storage client to point to Cloudflare R2. File paths remain identical (R2 uses the same path structure). Migrate existing files via `rclone` or a one-time migration script. The application is not aware of the provider switch.

**Effort estimate:** 3–5 days.

---

### V1 → V2+: Auth (Supabase Auth → Custom or Clerk)

**Trigger:** >50,000 MAU, or enterprise accounts require SAML SSO, or Supabase Auth limitations become blocking.

**Migration:** Supabase Auth is wrapped by the IAM context. Migrating the auth provider requires updating the IAM context's external dependency (the JWT issuance and validation logic) — not changing any RBAC, permission, or domain logic. The `profiles` table and all company membership records remain unchanged.

**Effort estimate:** 2–3 engineering weeks.

---

### Modular Monolith → Selective Microservices

Do not extract a module until at least two of the following are true:
1. The module's compute costs are identifiable and significant (>10% of infra bill)
2. The module's deployment cadence differs significantly from the rest
3. The module has a team of 2+ engineers dedicated to it
4. Module performance is impacting other modules due to resource contention

**First extraction candidate:** AI Engine (compute-intensive, independently deployable, clear interface boundary).
**Second extraction candidate:** Communications (high email volume, can scale independently).
**Third:** Marketplace (fundamentally different data model; built as independent service from day one).

---

## 26. Technology Decision Register

A permanent record of every significant technology decision, the alternatives considered, and the rationale. Updated when a decision changes.

| ID | Decision | V1 Choice | V2+ Path | Rationale | Review Trigger |
|----|---------|----------|---------|-----------|----------------|
| TD-001 | Architecture pattern | Modular Monolith | Selective microservices | Team size; development velocity; module boundaries enable future extraction | >5 engineers on a single domain |
| TD-002 | Multi-tenancy model | Row-level RLS | Schema-per-tenant (Enterprise) | Operational simplicity; Supabase RLS is database-enforced with native JWT integration | Enterprise customer requiring contractual isolation |
| TD-003 | Auth provider | Supabase Auth | Clerk or Custom JWT | Native JWT + RLS integration; included in Supabase; zero extra configuration | >50k MAU; SAML SSO required; Supabase Auth limitations |
| TD-004 | Database | Supabase PostgreSQL | Neon (branching) | ACID; RLS; native auth integration; included in Supabase plan; serverless | DB branching per PR needed; Supabase pricing at scale |
| TD-005 | ORM | Drizzle | Drizzle (retained) | Lightweight; type-safe; SQL-close; no magic; fastest in benchmarks | Major Drizzle breaking change without migration path |
| TD-006 | Internal API | tRPC | tRPC (retained) | End-to-end type safety without codegen; natural Next.js fit | Mobile API requirements diverge significantly from web |
| TD-007 | Background jobs | Vercel Cron + Supabase Edge Functions | Inngest | Simplest foundation; no extra services for V1; known limitations accepted | Durable retry needed; multi-step workflow sequences required |
| TD-008 | AI provider | Anthropic Claude API | Anthropic (retained) | Best reasoning quality for inventory parsing; structured output reliability; tiered model selection | Significant cost differential or quality regression in benchmarks |
| TD-009 | Email provider | Resend | Resend (retained; SendGrid as backup) | React Email integration; modern API; strong deliverability | Deliverability issues; >10M emails/month |
| TD-010 | File storage | Supabase Storage | Cloudflare R2 | Integrated with Supabase RLS; zero extra config for V1 | Egress costs >$200–500/month |
| TD-011 | PDF generation | Puppeteer via Supabase Edge Function | Railway worker + Browserless.io | HTML/CSS flexibility; Supabase Edge Function avoids Vercel bundle limit | PDF volume exceeds Edge Function capacity |
| TD-012 | Realtime/notifications | Supabase Realtime | Supabase Realtime (retained; SSE as fallback) | Native PostgreSQL change broadcasting; zero extra configuration | WebSocket connection overhead at scale |
| TD-013 | Mobile | Expo (React Native) | Expo (retained) | React code sharing; large ecosystem; OTA updates | Performance requirements that React Native cannot meet |
| TD-014 | Response caching | None (V1) | Upstash Redis | No cache needed at V1 volume; avoids extra service | Permission cache TTL needed; AI response cache needed |

---

*This document is the authoritative source for all architectural decisions in Bivro. Implementation that deviates from decisions made here must update this document first, with rationale, before changing the code.*
