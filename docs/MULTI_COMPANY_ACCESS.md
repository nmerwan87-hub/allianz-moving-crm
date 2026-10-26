# Bivro — Multi-Company Access (Company Switcher)

Status: **Implemented** (migration 024) · Approved and built 2026-10-26

One person can belong to several companies with a single login and switch between them. Tenant isolation stays exactly as strong as today.

---

## 1. Goals and Non-Goals

**Goals**

- One login (one `auth.users` row) can be a member of N companies, with a separate role and permission set in each.
- A visible company switcher at the top of the sidebar. Switching takes one click and never mixes data.
- The existing RLS model (`company_id = public.auth_company_id()` from the JWT) stays the single isolation mechanism. No RLS policy on business tables changes.
- The SaaS path stays open: the same model works for external customers, consultants or accountants who serve several companies.

**Non-Goals (V1)**

- Viewing two companies side by side in two tabs at the same time. One browser session has one active company (see §6).
- Cross-company reports ("all three companies combined"). Possible later as an owner-only read model.
- Moving records between companies.

---

## 2. Why Not the Alternatives

| Option | Verdict |
|---|---|
| One login per company (separate e-mails) | Works today, but the user must log out/in to switch. Rejected as the long-term model. |
| RLS checks `company_id IN (my memberships)` and the app passes the company per request | Weakens isolation: any query that forgets a company filter shows data of all the user's companies. Rejected. |
| Change `profiles.id` from the auth user id to a per-membership id | Touches 29 foreign keys and every `auth.uid()` comparison. High risk, no benefit. Rejected. |
| **Membership table + active company in the JWT** (this document) | Small, additive change. RLS untouched. Chosen. |

---

## 3. Data Model

### 3.1 `profiles` — the person

`profiles` remains one row per person (`profiles.id = auth.users.id`). All 29 existing foreign keys (`created_by`, `assigned_to`, …) keep pointing at the person, which is correct: "who created this lead" is a person.

Semantic change:

- `profiles.company_id` becomes the **active company** (renamed to `active_company_id` in a later cleanup; kept as `company_id` in V1 to avoid touching every query at once).
- `profiles.role` and `profiles.is_active` are no longer the source of truth; they are superseded by the membership row of the active company. They are kept in sync by the switch function until removed.

### 3.2 New table `company_memberships` — the person in a company

```sql
CREATE TABLE company_memberships (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   uuid        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id      uuid        NOT NULL REFERENCES profiles(id)  ON DELETE CASCADE,
  role         user_role   NOT NULL DEFAULT 'office',
  is_active    boolean     NOT NULL DEFAULT true,
  last_used_at timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, user_id)
);
```

- Backfill: one row per existing profile from `(profiles.company_id, profiles.id, profiles.role, profiles.is_active)`.
- Every company must always keep at least one active `owner` membership (trigger).
- Permission groups and overrides are already keyed by `(company_id, user_id)` and need no change: a person automatically has a separate permission set per company.

### 3.3 RLS

- Business tables: **unchanged**.
- `company_memberships`: a user can read their own memberships (for the switcher) and, as a member of the active company, the memberships of that company (team list). Writes only through server procedures / `SECURITY DEFINER` functions.
- `profiles_select`: extended from "profile.company_id = active company" to "profile has a membership in the active company", so colleagues stay visible in the team list even while they are working in another company.

---

## 4. JWT and Switching

### 4.1 Access token hook

The hook resolves claims from the membership of the active company, not from `profiles` alone:

1. Read `profiles.company_id` (active company).
2. Join `company_memberships` for that company: must exist and be `is_active`.
3. If it does not (membership removed or deactivated), fall back to the most recently used active membership and write it back as the active company.
4. Inject `company_id`, `role` (from the membership) and `company_status` as today.
5. No valid membership → no tenant claims → middleware sends the user to a "no access" page.

Result: a removed member loses access at the next token refresh at the latest (default JWT lifetime 1 hour; can be lowered).

### 4.2 Switch flow

1. User picks a company in the switcher.
2. tRPC `iam.session.switchCompany({ companyId })` calls the `SECURITY DEFINER` function `switch_active_company(target uuid)`, which:
   - verifies an active membership of `auth.uid()` in `target` and that the company is `active`,
   - sets `profiles.company_id = target`, updates `last_used_at`,
   - writes an `activity_logs` entry.
3. The client calls `supabase.auth.refreshSession()` → the hook issues a token for the new company.
4. The client clears the React Query cache, broadcasts the switch to all open tabs (`BroadcastChannel`), and navigates to `/dashboard`. Other tabs reload as well.

`company_id` is never accepted from the browser for data access. The browser only *requests* a switch; the server verifies it; RLS reads the result from the signed JWT.

---

## 5. Invitations and Onboarding

- Inviting an e-mail that already has an account creates a **membership** (after the person accepts) instead of a new profile.
- Inviting a new e-mail works as today (account + profile + first membership).
- Registration of a new company by an existing user ("Add company") creates the company and an `owner` membership.
- For the founder setup, a seed script creates the three companies and owner memberships for one login.

---

## 6. UX Rules (to prevent mistakes)

- The active company is always visible at the top of the sidebar: name plus logo, or a stable colour badge with initials until a logo is uploaded.
- The switcher lists only active memberships, with role, sorted by last use.
- Switching leads to the dashboard of the new company (never to a record URL that belongs to the old company).
- Forms with unsaved changes warn before switching.
- If a record URL is opened that belongs to another of the user's companies, show "This record belongs to Firma B — switch?" instead of a generic 404.
- Users with only one membership see no switcher.
- One active company per browser session; all tabs follow a switch. A tab that follows a switch made elsewhere leaves its page even with unsaved input: its token now belongs to the new company, so saving there would write into the wrong company.

---

## 7. Audit and Security

- Every switch, membership grant, role change and removal is written to `activity_logs`.
- Tests (integration):
  - member of A and B, active A → cannot read any B row via any table;
  - after switch to B → cannot read A rows;
  - switch to a company without membership → rejected;
  - deactivated membership → token refresh drops the claims / falls back;
  - owner of A, office in B → B permissions apply in B;
  - last owner membership cannot be removed.

---

## 8. Implementation Steps

1. Migration 024: `company_memberships`, backfill, owner trigger, RLS, `switch_active_company()`, updated hook, `profiles_select` change.
2. IAM module: membership-aware team list, invitations for existing users, `switchCompany` procedure.
3. UI: company switcher in the top bar, cross-tab sync, "wrong company" page.
4. Seed script for the founder's three companies.
5. Integration tests from §7; existing tests stay green.

---

## 9. Implementation Notes

| Area | Where |
|---|---|
| Table, triggers, RLS, `switch_active_company()`, hook | `supabase/migrations/20260719000024_company_memberships.sql` |
| Membership queries (team, member lookup, user's companies) | `modules/iam/lib/membership.ts` |
| `iam.session.me` (company list), `switchCompany`, `locateRecord` | `modules/iam/router/session.ts` |
| Joining with an existing account | `iam.joinInvitedCompany` in `modules/iam/router/invitation.ts`, `app/(auth)/invite/[token]/invite-client.tsx` |
| Switcher UI | `app/(dashboard)/_components/company-switcher.tsx` |
| Cross-tab sync, unsaved-changes guard, identity colour | `app/(dashboard)/_lib/active-company.ts` |
| "Belongs to another company" page | `app/(dashboard)/_components/wrong-company-notice.tsx` |
| Tests | `tests/integration/iam/multi-company.test.ts` |
| Local seed (one login, three companies) | `supabase/seed-local.ts` |

Decisions taken during implementation:

- **Profile insert creates the first membership** (trigger), so registration, invitation and test fixtures did not need to change.
- **Membership → profile mirror is one-way.** `profiles.role` / `is_active` are legacy mirrors of the active membership; writing them never changes a membership.
- **Security fix:** before migration 024, `authenticated` could update every column of its own profile, including `role` — an office user could make itself owner. Self-service updates are now limited to `first_name`, `last_name`, `phone`, `avatar_url`, `last_seen_at`, and the role comes from the membership.
- **Invitations never reset passwords.** An invitation to an existing account requires signing in as that account; the link only adds a membership.
- **The hook cannot write.** When it falls back to another membership, `iam.session.me` persists the fallback via `switch_active_company()`.

