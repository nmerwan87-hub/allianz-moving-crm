# Bivro — Coding Standards

**Version:** 1.0  
**Status:** Frozen — Enforced on Every Pull Request  
**Owner:** Engineering  
**Last updated:** 2026-06-29  

> These standards are not suggestions. They are the contract every line of Bivro code must satisfy. A pull request that violates these rules is not mergeable, regardless of whether the feature works.

---

## Why Standards Exist

Standards at this stage are not bureaucracy. They are the compound interest of a codebase. Every standard violation that ships becomes a constraint on the next engineer who touches that file. Every consistent pattern that ships becomes a reference that makes the next feature faster to build. At Bivro's stage, the cost of inconsistency is higher than at any other — because the patterns set now persist for years.

These rules were written with one question in mind: *What does a file need to look like so that an engineer who has never seen it before can understand, extend, and trust it in under ten minutes?*

---

## Table of Contents

1. [TypeScript Rules](#1-typescript-rules)
2. [Next.js Rules](#2-nextjs-rules)
3. [React Rules](#3-react-rules)
4. [Supabase Rules](#4-supabase-rules)
5. [RLS Safety Rules](#5-rls-safety-rules)
6. [Folder Structure](#6-folder-structure)
7. [Naming Conventions](#7-naming-conventions)
8. [Error Handling](#8-error-handling)
9. [Validation with Zod](#9-validation-with-zod)
10. [Form Handling](#10-form-handling)
11. [API Conventions](#11-api-conventions)
12. [Component Conventions](#12-component-conventions)
13. [Security Rules](#13-security-rules)
14. [Testing Rules](#14-testing-rules)
15. [Documentation Rules](#15-documentation-rules)
16. [Git Rules](#16-git-rules)
17. [What Claude Is Allowed to Do](#17-what-claude-is-allowed-to-do)
18. [What Claude Must Never Do](#18-what-claude-must-never-do)

---

## 1. TypeScript Rules

### 1.1 Strict Mode is Non-Negotiable

The TypeScript configuration must include:

```
strict: true
noUncheckedIndexedAccess: true
exactOptionalPropertyTypes: true
noImplicitReturns: true
noFallthroughCasesInSwitch: true
```

These flags are never disabled. If code does not compile in strict mode, the code is wrong — not the compiler flag.

### 1.2 `any` is Forbidden

`any` is a type-system escape hatch that silences the compiler without solving the problem. It is forbidden in all production code.

**Instead of `any`, use:**
- `unknown` when the type is genuinely unknown at the call site (requires narrowing before use)
- Proper generics when the type varies by caller
- A union type when there are a finite set of possible shapes
- `never` to assert a code path is unreachable

The only acceptable `any` is in test utilities or third-party type shims where a library provides no types. All such uses require a comment explaining why `any` was necessary and what the actual runtime type is.

### 1.3 Type Assertions Require Justification

`value as SomeType` is a lie to the compiler. Every type assertion (`as`) must be accompanied by an inline comment explaining why the assertion is safe and what invariant guarantees it.

The `satisfies` operator is preferred over `as` where applicable — it validates the type without widening it.

Prefer:
```
const config = { ... } satisfies ConfigType
```
Over:
```
const config = { ... } as ConfigType
```

### 1.4 Non-Null Assertions Require Justification

The `!` non-null assertion operator (`value!`) tells TypeScript "I know this is not null, trust me." It is treated like `as`: requires an inline comment explaining the invariant that guarantees non-nullability.

If you cannot write that comment clearly, the code needs a proper null check.

### 1.5 Explicit Return Types on Public Functions

All functions exported from a module must have explicit return types. TypeScript's inferred return types are fine for internal implementation functions, but public interface functions must declare their contracts explicitly.

This is not about verbosity — it is about documenting the contract. When a caller reads the function signature, they must know exactly what they will receive.

### 1.6 Prefer `interface` for Object Shapes, `type` for Everything Else

- Use `interface` for objects that represent entities, props, or contracts (they support extension and produce better error messages)
- Use `type` for unions, intersections, mapped types, and computed types

### 1.7 Use Discriminated Unions for Variant Types

When a value can be in multiple states with different shapes, use a discriminated union — not optional properties.

**Correct:**
```
type QuoteStatus =
  | { status: 'draft' }
  | { status: 'sent'; sentAt: Date; trackingId: string }
  | { status: 'accepted'; acceptedAt: Date; depositPaid: boolean }
  | { status: 'declined'; reason: string }
```

**Wrong:**
```
interface QuoteStatus {
  status: 'draft' | 'sent' | 'accepted' | 'declined'
  sentAt?: Date
  trackingId?: string
  acceptedAt?: Date
  depositPaid?: boolean
  reason?: string
}
```

Discriminated unions make impossible states unrepresentable. The compiler catches mistakes that optional fields hide.

### 1.8 Exhaustive Switch Statements

Every `switch` over a union type must be exhaustive. Add a default case that assigns to `never` to catch unhandled variants at compile time:

```
function handleJobStatus(status: JobStatus): string {
  switch (status) {
    case 'scheduled': return 'Scheduled'
    case 'in_progress': return 'In Progress'
    case 'completed': return 'Completed'
    case 'cancelled': return 'Cancelled'
    default: {
      const _exhaustive: never = status
      throw new Error(`Unhandled job status: ${_exhaustive}`)
    }
  }
}
```

When a new status is added to the union, every switch that handles it will fail to compile until updated.

### 1.9 Branded Types for Domain Identifiers

All domain IDs are UUIDs. Without branding, it is easy to pass a `jobId` where a `quoteId` is expected. Use branded types:

```
type TenantId = string & { readonly _brand: 'TenantId' }
type QuoteId = string & { readonly _brand: 'QuoteId' }
type JobId = string & { readonly _brand: 'JobId' }
```

Domain functions that accept identifiers must use branded types. Constructor functions validate and brand the input.

### 1.10 `undefined` vs `null`

- Use `undefined` for optional values that were never set
- Use `null` deliberately and sparingly — only when `null` carries explicit semantic meaning ("this field was intentionally cleared")
- Never use `null` and `undefined` interchangeably for the same concept

Database `NULL` maps to `null | undefined` depending on context — the ORM layer is responsible for the translation. Domain logic operates on `undefined` for absent optional values.

### 1.11 Import Ordering

Imports are ordered in four groups, separated by blank lines:
1. Node built-ins (`node:path`, `node:fs`)
2. External packages (`next`, `react`, `zod`)
3. Internal absolute imports (`@/modules/...`, `@/lib/...`, `@/components/...`)
4. Relative imports (`./quote-card`, `../types`)

ESLint enforces this automatically.

### 1.12 No Barrel Files

Barrel files (`index.ts` that re-export from many modules) are forbidden. They:
- Create circular import risk
- Slow TypeScript server startup (the resolver must load everything)
- Obscure where something actually lives

Import directly from the source file:
```
import { QuoteCard } from '@/components/quotes/quote-card'
```
Not from a barrel:
```
import { QuoteCard } from '@/components/quotes'
```

---

## 2. Next.js Rules

### 2.1 App Router Only

Bivro uses the Next.js App Router exclusively. No Pages Router patterns (`getServerSideProps`, `getStaticProps`, pages directory). If a Next.js guide suggests a Pages Router approach, find the App Router equivalent.

### 2.2 Server Components by Default

Every component is a React Server Component unless it explicitly needs client-side interactivity. Add `'use client'` only when the component uses:
- Browser-only APIs (`window`, `document`, `localStorage`)
- Event handlers (`onClick`, `onChange`)
- React state or lifecycle (`useState`, `useEffect`, `useRef`)
- Third-party libraries that require a browser context

The boundary between Server and Client Components is a performance and architecture decision, not a convenience choice. Keep it as high in the component tree as possible.

### 2.3 Data Fetching Lives in Server Components

Data fetching happens in Server Components — not in `useEffect`, not in Client Components via `fetch`. Server Components can be `async` and `await` data directly.

Data fetched in a Server Component is passed as props to child Client Components. Client Components receive data — they do not fetch it.

The only exceptions:
- Real-time updates (Supabase Realtime subscriptions in Client Components)
- User-triggered refetches (React Query in Client Components, for SWR patterns post-initial-load)

### 2.4 Route Handlers for API Endpoints

External API endpoints (mobile, portal, webhooks) live in `/app/api/`. They are not called from the Next.js frontend — the frontend uses tRPC or Server Actions instead.

### 2.5 Server Actions for Form Mutations

Form submissions and user-triggered mutations use Next.js Server Actions where appropriate. Server Actions run on the server, have access to the full server context (auth, database), and integrate with React's transition model.

Server Actions are defined in `actions.ts` files colocated with the component that uses them, or in the domain module's `actions.ts` if shared.

### 2.6 Loading and Error States

Every route segment that fetches data must have a corresponding `loading.tsx` and `error.tsx`. These are not optional polish — they are the contract for what users see when things are slow or broken.

### 2.7 Mandatory Next.js Primitives

- Always use `next/image` for images. Never use raw `<img>` tags. `next/image` enforces dimensions, prevents layout shift, and enables automatic optimization.
- Always use `next/link` for internal navigation. Never use `<a href>` for same-origin links.
- Always use `next/font` for typography. No external font `<link>` tags in `<head>`.

### 2.8 Metadata

Every page exports `generateMetadata` or a static `metadata` export. Default metadata (title, description, OG tags) is defined in the root layout and overridden at the page level.

---

## 3. React Rules

### 3.1 Function Components Only

No class components. React class components are considered legacy. Function components with hooks cover every use case.

### 3.2 One Component Per File

Each file exports one primary component, named identically to the file. A file named `quote-card.tsx` exports `QuoteCard` as its default export.

Small, tightly coupled helper components (used only by the primary component) may live in the same file but are not exported.

### 3.3 Hook Ordering

Hooks are declared in a consistent order at the top of the component, before any logic:
1. Context hooks (`useContext`)
2. Router/navigation hooks (`useRouter`, `usePathname`, `useSearchParams`)
3. State hooks (`useState`)
4. Ref hooks (`useRef`)
5. Memoization hooks (`useMemo`, `useCallback`)
6. Effect hooks (`useEffect`) — always last

This order is mechanical and enforced by ESLint. Following it means any engineer can scan any component and know exactly where to find the state.

### 3.4 `useEffect` is a Last Resort

`useEffect` is for synchronizing with external systems (DOM, third-party libraries, timers). It is not for data fetching, state derivation, or responding to prop changes.

Before writing a `useEffect`, ask: can this be computed in the render? Can it happen in a Server Component? Can it happen in an event handler? If the answer to all three is no, then `useEffect` may be appropriate.

Every `useEffect` must have a comment explaining why it exists and what it is synchronizing with.

### 3.5 No Premature Memoization

`useMemo`, `useCallback`, and `React.memo` are performance tools. They are not defensive programming. Wrap things in memoization only after a profiler identifies an actual performance problem.

Premature memoization:
- Obscures the data flow
- Adds maintenance overhead (stale dependencies)
- Sometimes hurts performance (the comparison cost exceeds the render cost)

### 3.6 Stable, Meaningful Keys

List keys must be stable, unique, and meaningful — never the array index. Array index keys cause incorrect reconciliation when list items are reordered, filtered, or removed.

Use the entity's ID as the key: `key={job.id}`.

### 3.7 Prop Drilling Limit

Component props may not be drilled more than two levels deep. If data needs to travel deeper, either:
- Colocate the state closer to where it is consumed
- Use React Context for truly global or layout-scoped state
- Lift the data fetch to a common ancestor and pass as props shallowly

Prop drilling beyond two levels is a design smell — it means state is living in the wrong place.

### 3.8 Boolean Prop Naming

Boolean props use affirmative, prefixed names:
- `isLoading` not `loading`
- `isDisabled` not `disabled` (unless mirroring an HTML attribute)
- `hasError` not `error` (when boolean)
- `canEdit` not `editable`
- `shouldValidate` not `validate`

This makes JSX props unambiguous at the call site: `<QuoteCard isLoading />` is clearer than `<QuoteCard loading />`.

---

## 4. Supabase Rules

### 4.1 Three Clients, Three Contexts

Bivro uses exactly three Supabase client instances, each with a distinct purpose and scope:

**Client 1: Browser Client** (`@/lib/supabase/client.ts`)
- Created with the `anon` public key
- Used only in Client Components (`'use client'`)
- Used for: Supabase Realtime subscriptions, client-side auth state
- Must never be used for data fetching — use Server Components instead

**Client 2: Server Client** (`@/lib/supabase/server.ts`)
- Created from cookies using `createServerClient`
- Used in Server Components, Server Actions, and Route Handlers
- Authenticates as the current user (RLS applies)
- This is the default client for data access

**Client 3: Service Role Client** (`@/lib/supabase/service-role.ts`)
- Created with the `SUPABASE_SERVICE_ROLE_KEY` (server-side only, never exposed)
- Bypasses RLS
- Used exclusively for: system background jobs, tenant provisioning, auth hooks
- Every use requires an inline comment explaining why RLS bypass is necessary

No fourth Supabase client instance is ever created. No direct instantiation of `createClient` outside these three files.

### 4.2 Server Client in Every Server-Side Context

In any Server Component, Server Action, or Route Handler that reads or writes database data, the server client (Client 2) is used — never the browser client, never a freshly instantiated client.

### 4.3 Authenticate Before Querying

Every server-side data operation begins by resolving the current user session. If there is no valid session, the request is rejected before any database query runs. Data is never fetched and then conditionally shown based on auth state — auth is resolved first, always.

```
const supabase = await createServerClient()
const { data: { user }, error } = await supabase.auth.getUser()
if (!user || error) redirect('/login')
// proceed with query
```

### 4.4 Select Only What You Need

Supabase queries select specific columns — never `select('*')` in production code.

**Wrong:** `supabase.from('quotes').select('*')`
**Correct:** `supabase.from('quotes').select('id, status, total_amount, created_at, customer:customers(name)')`

This applies to every query, including development code. `select('*')` overfetches, slows queries, leaks columns that shouldn't reach the client, and breaks when columns are renamed.

### 4.5 Always Handle Supabase Errors

Every Supabase operation returns `{ data, error }`. The `error` must be checked before `data` is used. An unchecked Supabase error is a Class 4 infrastructure error waiting to silently propagate.

```
const { data: quote, error } = await supabase.from('quotes').select(...).single()
if (error) throw new DatabaseError('Failed to fetch quote', { cause: error })
```

### 4.6 Use `count` for Existence Checks

When checking whether a row exists, use `count` — not `select` followed by a null check. Fetching full rows to check existence wastes bandwidth and query time.

```
const { count } = await supabase
  .from('jobs')
  .select('*', { count: 'exact', head: true })
  .eq('company_id', companyId)
  .eq('crew_member_id', crewMemberId)
  .eq('date', jobDate)
```

### 4.7 Use Transactions for Multi-Table Writes

When a business operation requires writing to multiple tables atomically (e.g., creating a job and writing the domain event simultaneously), use a Supabase database function (PostgreSQL function called via `rpc()`) to wrap the writes in a transaction.

Application-level "try both writes and hope" is not a transaction. If the second write fails, the first has already committed — the database is now inconsistent.

---

## 5. RLS Safety Rules

### 5.1 Every New Table Has an RLS Policy Before It Has Data

Creating a table without RLS policies is creating a data breach surface. The sequence is:

1. Write the migration (create table)
2. Write the RLS policies (in the same migration file)
3. Enable RLS on the table (in the same migration file)
4. Only then write application code that reads or writes the table

A table without RLS is rejected in code review, regardless of the application-level guards in place.

### 5.2 RLS Policy Checklist

For every new table, policies must be defined for all four operations:

| Operation | Question to answer |
|-----------|-------------------|
| SELECT | Which users can read which rows? |
| INSERT | Which users can insert rows? Which tenant_id must be set? |
| UPDATE | Which users can modify which rows? Which columns can they change? |
| DELETE | Can rows be deleted? By whom? (Prefer soft-delete) |

If an operation is not permitted for any user, the policy must explicitly deny it (or the table must have no GRANT for that operation).

### 5.3 The Tenant Isolation Test

For every table with a `tenant_id` column, the RLS SELECT policy must satisfy this test: a query authenticated as User A (in Tenant A) cannot return any row where `tenant_id = Tenant B`, even if User A knows Tenant B's ID and constructs a query with that filter.

This is tested explicitly — not assumed to work.

### 5.4 Document Every Service Role Bypass

When the service role client (Client 3) is used to bypass RLS, the code must include a comment block that states:
1. Why RLS bypass is necessary for this operation
2. Which tables are written
3. What tenant scoping is applied in application logic to substitute for RLS

No undocumented service role operations.

### 5.5 RLS Policies in Migration Files

RLS policies live in migration files — not in Supabase's dashboard. Policies configured only in the dashboard are invisible to code review, version control, and environment promotion. Every policy must be reproducible from the migration files alone.

### 5.6 Test RLS Explicitly in Integration Tests

Integration tests for any feature that reads or writes the database must include at least one test that proves the RLS boundary: a request authenticated as Tenant A must not be able to read or modify Tenant B's data, even with a direct ID reference.

This test is as important as the happy path test.

---

## 6. Folder Structure

```
/
├── app/                          ← Next.js App Router
│   ├── (auth)/                   ← Auth layout group (login, signup, invite)
│   │   ├── login/
│   │   ├── signup/
│   │   └── layout.tsx
│   ├── (dashboard)/              ← Operator dashboard layout group
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
│   ├── portal/                   ← Customer portal (no auth, token-based)
│   │   └── [token]/
│   ├── api/                      ← API Route Handlers
│   │   ├── trpc/                 ← tRPC handler
│   │   ├── v1/                   ← Mobile REST API + future public API
│   │   │   └── crew/
│   │   └── webhooks/             ← Supabase, Stripe, Resend webhooks
│   ├── layout.tsx                ← Root layout
│   ├── globals.css
│   └── not-found.tsx
│
├── modules/                      ← Domain modules (bounded contexts)
│   ├── iam/                      ← Identity & Access Management
│   │   ├── interface.ts          ← Public interface (used by other modules)
│   │   ├── middleware.ts         ← Auth/tenant/RBAC middleware
│   │   ├── schemas.ts            ← Zod schemas
│   │   └── service.ts            ← Domain logic
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
├── trpc/                         ← tRPC router definitions
│   ├── routers/                  ← One router per domain module
│   │   ├── leads.ts
│   │   ├── quotes.ts
│   │   ├── jobs.ts
│   │   └── ...
│   ├── root.ts                   ← Root router (merges all routers)
│   ├── middleware.ts             ← tRPC middleware (auth, permissions)
│   └── client.ts                 ← tRPC client setup
│
├── components/                   ← Shared UI components
│   ├── ui/                       ← Base UI primitives (shadcn/ui)
│   │   ├── button.tsx
│   │   ├── input.tsx
│   │   ├── dialog.tsx
│   │   └── ...
│   ├── forms/                    ← Shared form components
│   ├── layouts/                  ← Layout components (sidebar, header)
│   └── [feature]/                ← Feature-specific components (e.g., quotes/)
│
├── hooks/                        ← Shared React hooks
│
├── lib/                          ← Shared utilities and configuration
│   ├── supabase/
│   │   ├── client.ts             ← Browser client (anon key)
│   │   ├── server.ts             ← Server client (uses cookies)
│   │   └── service-role.ts       ← Service role client (bypasses RLS)
│   ├── types/                    ← Shared TypeScript types
│   │   ├── database.ts           ← Generated database types (from Supabase)
│   │   ├── domain.ts             ← Branded ID types and domain types
│   │   └── api.ts                ← API response types
│   ├── utils/                    ← Pure utility functions
│   ├── constants.ts              ← Application-wide constants
│   └── permissions.ts            ← Permission matrix (role → resource → action)
│
├── emails/                       ← React Email templates
│
├── supabase/                     ← Supabase project files
│   ├── migrations/               ← SQL migration files (source of truth)
│   ├── functions/                ← Supabase Edge Functions
│   └── seed.sql                  ← Development seed data
│
├── public/                       ← Static assets
│
└── tests/                        ← Test files
    ├── unit/                     ← Unit tests (colocated with source)
    ├── integration/              ← Integration tests (tRPC, DB)
    └── e2e/                      ← Playwright end-to-end tests
```

### Folder Structure Rules

**Rule 1:** No file exists outside this structure without a documented reason.

**Rule 2:** Domain modules (`/modules/`) never import from each other's internals. They use the module's `interface.ts` only.

**Rule 3:** Components in `/components/ui/` have no business logic. They are presentation-only and accept generic props.

**Rule 4:** The `/lib/` folder contains only pure functions, type definitions, and configuration. No side effects, no database calls.

**Rule 5:** Migration files in `/supabase/migrations/` are append-only. Existing migrations are never edited — only new migrations are added.

---

## 7. Naming Conventions

### Files and Directories

| Item | Convention | Example |
|------|-----------|---------|
| Directories | kebab-case | `quote-builder/`, `crew-management/` |
| React component files | kebab-case | `quote-card.tsx`, `job-status-badge.tsx` |
| Non-component TypeScript files | kebab-case | `use-quotes.ts`, `quote-service.ts` |
| Migration files | `YYYYMMDDHHMMSS_description` | `20260629120000_create_quotes_table.sql` |
| Email template files | kebab-case | `quote-sent.tsx`, `booking-confirmation.tsx` |
| Test files | Same as source + `.test` | `quote-service.test.ts` |

### Code

| Item | Convention | Example |
|------|-----------|---------|
| React components | PascalCase | `QuoteCard`, `JobStatusBadge` |
| Functions | camelCase | `generateQuote`, `assignCrew` |
| Variables | camelCase | `quoteTotal`, `assignedCrewId` |
| Constants (immutable config) | SCREAMING_SNAKE_CASE | `MAX_RETRY_ATTEMPTS`, `DEFAULT_QUOTE_EXPIRY_DAYS` |
| TypeScript interfaces | PascalCase | `QuoteLineItem`, `JobAssignment` |
| TypeScript types | PascalCase | `QuoteStatus`, `UserRole` |
| Zod schemas | camelCase with `Schema` suffix | `quoteSchema`, `createJobInputSchema` |
| React hooks | camelCase with `use` prefix | `useQuotes`, `useJobStatus` |
| Event types | `domain.entity.action` | `quoting.quote.sent`, `jobs.job.completed` |
| tRPC routers | camelCase | `quotesRouter`, `jobsRouter` |
| tRPC procedures | camelCase | `quotes.list`, `quotes.create`, `jobs.assignCrew` |

### Database

| Item | Convention | Example |
|------|-----------|---------|
| Table names | snake_case, plural | `quotes`, `job_assignments`, `crew_members` |
| Column names | snake_case | `tenant_id`, `created_at`, `total_amount_cents` |
| Index names | `idx_{table}_{column(s)}` | `idx_quotes_tenant_id`, `idx_jobs_status_date` |
| Foreign keys | `fk_{table}_{referenced_table}` | `fk_quotes_tenants` |
| RLS policy names | Descriptive English sentence | `"Tenant members can read their own quotes"` |
| Functions/stored procedures | snake_case | `provision_tenant`, `get_user_tenant` |

### Monetary Values

All monetary values in code, database, and API responses are stored and transmitted as **integers in the smallest currency unit** (cents for USD/EUR, etc.).

- Database column name always includes `_cents`: `total_amount_cents`, `deposit_amount_cents`
- Display formatting (e.g., `$1,234.56`) happens only at the UI rendering layer
- No floating point math on money, ever

### Identifiers

All domain entity IDs are UUID v7 (time-ordered, B-tree friendly). Columns named `id` are always UUIDs. Foreign key columns are named `{entity}_id` — for example, `tenant_id`, `quote_id`, `job_id`.

**Database-side generation (canonical V1 approach):** `gen_uuid_v7()` — a custom `plpgsql` function defined in the bootstrap migration using `pgcrypto`'s `gen_random_bytes()`. Every table's `PRIMARY KEY DEFAULT` clause uses this function. V1 application code does not generate IDs. tRPC mutations return the server-assigned UUID after the INSERT completes. Never use `gen_random_uuid()` (UUID v4) in Bivro schemas.

**Application-side generation (not a V1 requirement):** V1 has no offline-first sync and no use case that requires knowing a UUID before the database insert. If a future release requires application-side UUID v7 generation (e.g., V2 offline mobile or bulk optimistic UI), that must be documented as an explicit architectural decision. The approved package for that decision is `uuidv7` (npm). It is not installed or used in V1.

---

## 8. Error Handling

### 8.1 The Error Taxonomy (from ARCHITECTURE.md)

Every error in Bivro belongs to one of five classes. The class determines how it is handled:

| Class | Type | HTTP Status | Log? | Alert? |
|-------|------|-------------|------|--------|
| 1 | Validation | 400 | No | No |
| 2 | Authorization | 403 | Yes (attempt) | If repeated |
| 3 | Domain / Business Rule | 422 | No | No |
| 4 | Infrastructure | 503 | Yes (Sentry) | Yes |
| 5 | Unknown | 500 | Yes (Sentry) | Yes |

### 8.2 No Silent Failures

An empty `catch` block is never acceptable. If an error is caught and not re-thrown, it must be logged. If it is logged, it must use the structured logging format (Section 15.3). If there is no meaningful recovery, the error is re-thrown after logging.

**Wrong:**
```
try {
  await sendEmail(...)
} catch (e) {
  // do nothing
}
```

**Correct:**
```
try {
  await sendEmail(...)
} catch (error) {
  logger.error('Failed to send quote email', {
    quoteId,
    tenantId,
    error: error instanceof Error ? error.message : String(error),
  })
  throw new CommunicationsError('Email delivery failed', { cause: error })
}
```

### 8.3 Typed Domain Errors

Domain errors (Class 3) are not strings — they are typed classes that carry structured context. Every module defines its own error types:

```
class QuoteError extends Error {
  constructor(
    message: string,
    public readonly code: QuoteErrorCode,
    options?: ErrorOptions
  ) {
    super(message, options)
    this.name = 'QuoteError'
  }
}

type QuoteErrorCode =
  | 'QUOTE_EXPIRED'
  | 'QUOTE_ALREADY_ACCEPTED'
  | 'INVALID_INVENTORY'
```

The `code` field is what the API returns to clients. The `message` is for internal logs. Clients never receive raw error messages.

### 8.4 Error Response Format

All API error responses follow RFC 7807 (Problem Details). tRPC errors use the `TRPCError` type with a structured `message`. REST errors use the following JSON:

```json
{
  "type": "https://bivro.io/errors/{error-code}",
  "title": "Human-readable title",
  "status": 422,
  "detail": "Specific actionable message for the user.",
  "instance": "/api/trpc/quotes.accept",
  "requestId": "req_01j..."
}
```

Error messages in `detail` are written for the operator or end user — not for engineers. "Quote has expired" is correct. "Constraint violation on quotes.status" is not.

### 8.5 Never Expose Internal Details to Clients

Stack traces, database error messages, internal file paths, and service names never appear in API responses. Class 4 and Class 5 errors return a generic message to the client: "An unexpected error occurred. Our team has been notified." The full detail goes to Sentry.

### 8.6 Async Error Handling

Every `async` function that can fail must be wrapped in try/catch or have its promise handled. Unhandled promise rejections are a runtime crash. There are no unhandled promise rejections in Bivro.

---

## 9. Validation with Zod

### 9.1 Validate at the Boundary, Trust Internally

Validation happens exactly once: at the API boundary (tRPC procedure input or REST Route Handler body). After validation, data is trusted throughout the domain module. Re-validating internally is noise that obscures what the actual business rules are.

### 9.2 Schema Location

Zod schemas live in the domain module they describe:

```
/modules/quoting/
  schemas.ts      ← All Zod schemas for the quoting domain
```

Shared schemas (e.g., pagination input, common ID types) live in `/lib/types/schemas.ts`.

### 9.3 Schema Naming

| Schema type | Naming convention | Example |
|------------|------------------|---------|
| Entity validation | `{entity}Schema` | `quoteSchema` |
| Create mutation input | `create{Entity}Input` | `createQuoteInput` |
| Update mutation input | `update{Entity}Input` | `updateQuoteInput` |
| Query filter | `{entity}FilterSchema` | `quoteFilterSchema` |
| API response | `{entity}ResponseSchema` | `quoteResponseSchema` |

### 9.4 Extend, Don't Duplicate

When two schemas share fields, use `.extend()` or `.pick()` to build one from the other. Duplicating field definitions means two schemas can diverge — the next engineer updates one and misses the other.

### 9.5 Monetary Values in Schemas

Monetary values in Zod schemas are validated as integers (cents):

```
totalAmountCents: z.number().int().positive().max(100_000_000)
```

The UI layer accepts strings or floats from form inputs and converts to cents before calling the API. The schema only ever sees integers.

### 9.6 Use `.parse()` for Hard Failures

In server code where invalid input represents a programming error (not user error), use `.parse()` — it throws on failure. In user-facing paths where the input comes from an untrusted source, use `.safeParse()` and return a 400 with structured field errors.

---

## 10. Form Handling

### 10.1 React Hook Form for All Forms

All forms use React Hook Form. No uncontrolled inputs, no manual state tracking of form field values.

### 10.2 Zod Resolver

All React Hook Form instances use `@hookform/resolvers/zod` with a Zod schema. The same schema used to validate server-side is reused for client-side validation. Single source of truth for field rules.

### 10.3 Server-Side Validation Always

Client-side form validation (via Zod + React Hook Form) is a UX optimization, not a security boundary. The server always validates the input independently. A form that passes client validation is not trusted by the server.

### 10.4 Optimistic UI Requires Rollback

Forms that update data optimistically (showing the change before the server confirms) must implement a rollback path for when the server request fails. No optimistic update without a rollback handler.

### 10.5 Loading and Disabled States

Submit buttons are disabled during form submission. The form itself is visually disabled (opacity, no interaction) while a submission is in flight. There is no scenario where a user can submit the same form twice in rapid succession.

### 10.6 Error Display

Server-returned field errors are mapped back to React Hook Form field errors via `setError`. Errors appear inline, adjacent to the field they describe. A generic toast is shown for non-field errors. Error messages are never cleared automatically — only on user action (resubmit or reset).

---

## 11. API Conventions

### 11.1 tRPC for All Dashboard Operations

Every data operation from the operator web dashboard flows through a tRPC procedure. There are no ad-hoc `fetch()` calls to Next.js API routes from the dashboard. The tRPC client is the single API surface for operator-facing features.

### 11.2 Procedure Declaration Structure

Every tRPC procedure follows this structure:
1. Input validation (Zod schema)
2. Auth and tenant context (from middleware — already resolved)
3. Permission check (`requirePermission('resource:action')`)
4. Domain module call
5. Return typed response

Nothing in the tRPC procedure layer contains business logic. It is a thin orchestration layer that delegates to domain modules.

### 11.3 Mutation Procedures Return the Updated Entity

tRPC mutation procedures (create, update) return the full updated entity, not just a success boolean. This allows the client to update its cache in a single round trip without a subsequent fetch.

### 11.4 Query Procedures Return Typed Responses

tRPC query procedures return typed data. The TypeScript type of the response is the authoritative contract between server and client — not a separate schema document.

### 11.5 Cursor-Based Pagination

All list endpoints that can return more than 50 items use cursor-based pagination. The response shape:

```typescript
{
  items: T[]
  nextCursor: string | null
  totalCount: number
}
```

Offset-based pagination is forbidden for any endpoint that could see high cardinality results. Offset is O(n) in PostgreSQL — it scans and discards rows. Cursor pagination is O(1).

### 11.6 REST API Versioning

Public REST API endpoints (mobile, portal, future public API) are versioned in the URL path: `/api/v1/...`. When a breaking change is needed, `/api/v2/...` is introduced. Old versions are never modified after they have external consumers.

### 11.7 Webhook Signature Verification

All inbound webhooks (Supabase, Stripe, Resend) are verified by signature before any processing occurs. Processing an unverified webhook payload is a security vulnerability. Signature verification is the first line of every webhook handler, before any deserialization of the payload body.

---

## 12. Component Conventions

### 12.1 Props Interface Naming

Props interfaces are named `{ComponentName}Props`:

```typescript
interface QuoteCardProps {
  quoteId: QuoteId
  status: QuoteStatus
  totalAmountCents: number
  onAccept: () => void
}
```

### 12.2 Components Orchestrate, Modules Execute

Components handle presentation and user interaction. Business logic — calculations, data transformation, AI calls, database writes — belongs in domain modules. A component that contains significant business logic is a design error.

If a component needs to perform business logic, it calls a domain service (via tRPC or a Server Action). The component does not contain the logic itself.

### 12.3 Default Exports for Pages, Named Exports for Everything Else

- Page components (`/app/.../page.tsx`): default export (required by Next.js)
- Layout components: default export (required by Next.js)
- All other components: named export

Named exports make refactoring tools (rename, find-all-references) work correctly.

### 12.4 No Inline Styles

No `style={{ ... }}` props in production components. Styling uses Tailwind CSS utility classes. If a design requires dynamic styling based on state, use `cn()` (class name utility) with conditional class strings.

### 12.5 Data Attributes for Testing

Interactive elements that are tested use `data-testid` attributes. These are added only for elements tested in E2E tests — not speculatively. Attribute values are descriptive: `data-testid="quote-accept-button"`, not `data-testid="button-3"`.

### 12.6 Accessible by Default

Every interactive element:
- Has a meaningful `aria-label` if its purpose is not clear from visible text
- Is reachable by keyboard (tab order)
- Has a visible focus state
- Communicates its state to assistive technology (`aria-disabled`, `aria-expanded`, `aria-current`)

Accessibility is not a post-launch concern. It is a day-one requirement.

---

## 13. Security Rules

### 13.1 Validate All External Input

Everything that arrives from outside the application boundary is untrusted and must be validated:
- API request bodies (Zod validation — see Section 9)
- URL parameters and query strings
- Headers used in logic (forwarded IPs, user agents)
- Webhook payloads (after signature verification)
- File uploads (MIME type, size)

Trust no input. Validate at the boundary. Trust within.

### 13.2 No PII in Logs

Structured logs must never contain personally identifiable information:
- Customer names, email addresses, phone numbers
- Addresses (origin or destination)
- Payment instrument details (card numbers, bank accounts)
- Authentication credentials of any kind

Log entity IDs (UUIDs), not entity data. If debugging requires PII, use the database directly in a controlled environment.

### 13.3 No Secrets in Code

API keys, database URLs, service credentials, and signing secrets never appear in source code. They live in environment variables. Files that contain secrets (`.env`, `.env.local`) are in `.gitignore` and never committed. If a secret is accidentally committed, it must be revoked immediately — not just removed in the next commit.

### 13.4 Service Role Key Restrictions

The `SUPABASE_SERVICE_ROLE_KEY` is only ever:
- Read from a server-side environment variable
- Used in the service role client (`/lib/supabase/service-role.ts`)
- Referenced in Supabase Edge Functions

It is never:
- Sent to the client in any API response
- Stored in a cookie or localStorage
- Logged
- Exposed via `NEXT_PUBLIC_` (which would send it to the browser)

### 13.5 `dangerouslySetInnerHTML` is Banned

`dangerouslySetInnerHTML` inserts raw HTML into the DOM without React's XSS protection. It is forbidden unless:
- The content is provably static and never user-controlled
- The content is sanitized with an allowlist-based sanitizer (not DOMPurify with default config)
- The usage is documented with an explanation of why the sanitization is safe

Every instance of `dangerouslySetInnerHTML` requires a code review by a second engineer.

### 13.6 Signed Tokens for Customer Portal

Customer portal URLs contain a signed HMAC-SHA256 token that encodes the job ID, tenant ID, and expiry. This token is verified server-side on every request. Tokens expire in 72 hours. A customer portal request without a valid token returns 404 — not 403 (does not confirm the resource exists).

### 13.7 Rate Limiting on Public Endpoints

All endpoints accessible without operator authentication:
- Customer portal routes
- Quote request form submission
- Webhook endpoints

Are rate-limited. The rate limit is applied at the middleware layer before any business logic runs.

---

## 14. Testing Rules

### 14.1 Three Testing Layers

**Layer 1 — Unit Tests (Vitest)**
Test pure functions, domain logic, Zod schemas, and utility functions in isolation. No database, no network, no Supabase. Fast — should complete in under 1 second for the whole suite.

What to unit test:
- All functions in `/lib/utils/`
- All Zod schema validation logic
- Domain calculations (pricing, scheduling conflict detection)
- Permission matrix logic
- AI response parsing and validation

**Layer 2 — Integration Tests (Vitest + real Supabase)**
Test tRPC procedures and database operations against a real local Supabase instance. These tests verify that business logic works end-to-end including RLS policies.

What to integration test:
- Every tRPC procedure (at least one happy path + one auth failure)
- Every RLS policy (tenant A cannot access tenant B's data)
- Every database constraint (uniqueness, foreign keys)
- Stripe and email operations (against test mode / test doubles)

**Layer 3 — E2E Tests (Playwright)**
Test critical user workflows from the browser against the full application. Slow — run in CI, not in development watch mode.

What to E2E test:
- Complete quote lifecycle (lead → quote → accept → pay)
- Complete job lifecycle (booking → dispatch → complete → invoice → pay)
- Auth flows (login, invite, role-based access)
- Customer portal (quote accept, sign, pay)

### 14.2 Test File Colocaton

Unit and integration test files live adjacent to the code they test:

```
/modules/quoting/
  service.ts
  service.test.ts     ← tests for service.ts
  schemas.ts
  schemas.test.ts     ← tests for schemas.ts
```

E2E tests live in `/tests/e2e/`.

### 14.3 Tests Describe Business Behavior

Test names describe what the business expects, not what the code does:

**Correct:** `it('prevents a crew member from being assigned to two jobs at the same time')`
**Wrong:** `it('throws an error when crew_assignment has a conflict')`

The test name is the executable specification.

### 14.4 No Testing Supabase Internals

Tests do not test whether Supabase's RLS engine works — that is Supabase's responsibility. Tests verify that the application's policies are configured correctly by testing the business invariant: "Tenant A cannot read Tenant B's quotes."

### 14.5 External Services are Mocked in Unit Tests

In unit and integration tests, external services (Resend, Stripe, Anthropic) are mocked. Tests do not make real API calls to external services. What is tested:
- The correct arguments are passed to the service adapter
- The application handles successful responses correctly
- The application handles error responses correctly

Real API integration is the responsibility of a staging environment smoke test, not the test suite.

### 14.6 Tests Must Pass Before Merge

No pull request is merged while tests are failing. Test failures are not deferred — they are fixed before the PR continues. A red CI pipeline is a merge blocker.

---

## 15. Documentation Rules

### 15.1 No Comments That Explain What the Code Does

Code that requires a comment to explain what it does is code that should be renamed or refactored. Comments that restate the code are noise that becomes stale and misleading:

**Wrong:**
```typescript
// increment the counter by 1
count++
```

**Correct:** (no comment needed — the code is obvious)

### 15.2 Comments Are for Non-Obvious Whys

A comment is appropriate when:
- The code implements a non-obvious business rule that is not captured in the function name
- The code works around a specific external bug or limitation (name the bug, link to the issue)
- The code intentionally does something that looks wrong but is correct for a subtle reason
- The code makes a performance trade-off that a reader might try to "fix"

A comment must explain **why**, never **what**.

### 15.3 Structured Log Format

All application logging uses structured JSON via a logger utility. Never use `console.log` in production code:

```typescript
logger.info('Quote generated by AI', {
  module: 'quoting',
  quoteId,
  tenantId,
  confidence: aiResult.confidence,
  tokensUsed: aiResult.tokensUsed,
  durationMs: performance.now() - startTime,
})
```

Log fields:
- `module`: the bounded context (always present)
- `requestId`: the originating HTTP request ID (when in request context)
- `tenantId`: the tenant (always present when a tenant context exists)
- `userId`: the acting user (when available)
- Entity IDs relevant to the operation
- Numeric measurements (`durationMs`, `tokensUsed`)

Never log string-interpolated messages: `logger.error(`Failed for tenant ${tenantId}`)` defeats log parsing and search.

### 15.4 Module README

Each domain module in `/modules/` contains a `README.md` that explains:
- The domain problem this module solves
- The aggregate roots it owns
- The events it produces and consumes
- Any non-obvious design decisions

### 15.5 Migration File Comments

Every migration file includes a comment block at the top:
```sql
-- Migration: create_quotes_table
-- Created: 2026-06-29
-- Description: Creates the quotes table with RLS policies.
--              Quotes belong to a tenant and are linked to a customer (lead).
--              RLS: Tenant members can CRUD their own tenant's quotes.
--                   Customers access quotes via the portal token system (no RLS required).
```

---

## 16. Git Rules

### 16.1 Commit Message Format

All commits use the Conventional Commits specification:

```
type(scope): short description in present tense

Optional longer description explaining why the change was made.
```

**Types:**

| Type | When to use |
|------|-------------|
| `feat` | A new feature |
| `fix` | A bug fix |
| `docs` | Documentation only changes |
| `refactor` | Code change that neither fixes a bug nor adds a feature |
| `test` | Adding or fixing tests |
| `chore` | Build process, dependency updates, tooling changes |
| `perf` | Performance improvement |
| `security` | Security fix |

**Scopes** match the bounded contexts: `crm`, `quoting`, `jobs`, `workforce`, `fleet`, `communications`, `documents`, `payments`, `analytics`, `ai`, `iam`, `portal`, `mobile`, `infra`.

**Examples:**
```
feat(quoting): add AI confidence score to quote response
fix(jobs): prevent crew double-booking when job overlaps by less than 1 hour
docs(architecture): update V2+ migration path for Inngest
test(iam): add RLS isolation test for tenant A / tenant B boundary
chore(infra): update Supabase client to v2.50.0
```

### 16.2 Branch Naming

```
feature/{issue-number}-short-description
fix/{issue-number}-short-description
docs/short-description
refactor/short-description
```

### 16.3 Branch Lifecycle

- `main`: Always deployable. Direct pushes forbidden. Merged via pull request only.
- `staging`: Pre-production environment. Used for integration testing before main.
- Feature branches: Created from `main`. Deleted after merge.

### 16.4 Pull Request Rules

Every pull request must:
- Have a description that explains the change and links to the relevant issue
- Pass all CI checks (type check, lint, tests)
- Have at least one reviewer approval
- Be merged with "Squash and merge" to keep the main branch history clean
- Have a title that is a valid Conventional Commit message

### 16.5 No WIP Commits to Shared Branches

Work-in-progress commits are acceptable on personal feature branches. They are not acceptable on `staging` or `main`. Before raising a pull request, the commit history is cleaned up (squashed locally or via the GitHub squash-merge option).

---

## 17. What Claude Is Allowed to Do

Claude operates within the boundaries set by this document and `PRODUCT_REQUIREMENTS.md`. The following actions are authorized without additional confirmation:

### Authorized Actions

- **Create new files** that fit within the defined folder structure
- **Implement features** that are defined as P0 or P1 in `PRODUCT_REQUIREMENTS.md`
- **Write Zod schemas** for any domain defined in the bounded contexts
- **Write tRPC procedures** following the defined conventions
- **Write React components** following the component conventions
- **Write Drizzle ORM queries** following the Supabase rules
- **Write database migrations** including RLS policies (must include the full RLS checklist)
- **Write unit and integration tests** for any implemented code
- **Write React Email templates** for any template in the template inventory
- **Refactor within a module** without changing its public interface
- **Update documentation** to reflect code changes
- **Fix bugs** in existing code that has been discussed and confirmed as bugs
- **Suggest improvements** to patterns, naming, or structure when a better approach exists

### Always Announce Before Doing

Before any of these actions, Claude must state what it is about to do in one sentence. This is not optional. The user must be able to stop the action before it happens.

---

## 18. What Claude Must Never Do

The following actions are forbidden without an explicit, specific instruction from the user in the current conversation. A general instruction to "build the app" does not authorize these actions.

### Forbidden Without Explicit Instruction

**Schema and Data:**
- Modify an existing migration file (migrations are append-only)
- Delete any table, column, or index
- Run any destructive database operation (DROP, TRUNCATE, DELETE without WHERE)
- Change the schema in application code without a corresponding migration file

**Code Quality:**
- Add `any` to any TypeScript type
- Disable ESLint rules with `eslint-disable` comments without documenting why
- Skip input validation on any API endpoint
- Use `as` type assertions without justification comments
- Use `!` non-null assertions without justification comments
- Add `console.log` in production code (use the logger)

**Architecture:**
- Add a new npm package that is not already in `package.json`
- Create a new bounded context that is not defined in `ARCHITECTURE.md`
- Add a new API surface that is not defined in `ARCHITECTURE.md`
- Change the folder structure without updating `CODING_STANDARDS.md`
- Use the Supabase service role client for user-facing data fetches
- Expose the service role key in client-side code, API responses, or logs

**Features:**
- Implement a feature not defined in `PRODUCT_REQUIREMENTS.md`
- Add UI elements or flows not defined in the PRD
- Change the product scope, user roles, or permissions matrix without updating the PRD

**Security:**
- Log any PII (customer names, addresses, phone numbers, emails)
- Store secrets in code or committed files
- Use `dangerouslySetInnerHTML` without documented sanitization justification
- Skip signature verification on any inbound webhook

**Git:**
- Commit to `main` or `staging` directly
- Force-push to any branch
- Skip the pre-commit checks (lint, type-check)
- Write a commit message that does not follow the Conventional Commits format

**AI:**
- Hardcode AI model identifiers (e.g., `'claude-sonnet-4-6'`) anywhere in application logic. All model identifiers must be defined as named constants in a single configuration file (e.g., `lib/ai/models.ts`). Every AI task implementation references the constant — never the string directly. This ensures model upgrades require a single change, not a grep-and-replace across the codebase.

**Behavioral:**
- Assume a task is complete because it compiles — features are only complete when they have tests and the tests pass
- Implement a "quick fix" that bypasses the established patterns because it is faster
- Silently ignore an inconsistency between the code being written and the documentation in `ARCHITECTURE.md` or `PRODUCT_REQUIREMENTS.md` — flag it explicitly instead

---

## Appendix: Quick Reference Card

### Before Writing Any Code

1. Is this feature in `PRODUCT_REQUIREMENTS.md`? If not, stop.
2. Is there an existing pattern to follow? Find it first.
3. Will this require a new package? Ask first.
4. Will this touch the database schema? Write the migration file first, including RLS.

### Before Raising a Pull Request

1. `tsc --noEmit` passes with zero errors
2. `eslint` passes with zero warnings
3. All new code has tests
4. All tests pass
5. RLS policies are in the migration file
6. No PII in any log statement
7. No secrets in any file
8. Commit messages follow Conventional Commits

### The Single Most Important Rule

**When in doubt, make it explicit.** Explicit types over inferred. Explicit error handling over assumption. Explicit comments when the reason is non-obvious. Explicit tenant scoping over relying on RLS alone. Explicit test assertions over general coverage. Explicitness is what makes a codebase trustworthy.

---

*This document applies to all code in the Bivro repository, written by any engineer or AI assistant. Standards violations are corrected in code review — they are not merged with a note to fix them later.*
