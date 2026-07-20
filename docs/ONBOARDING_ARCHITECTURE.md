# Bivro — Registration and Onboarding Architecture

**Version:** 1.0
**Status:** Authoritative — Governs all registration, approval, invitation, and onboarding flows
**Owner:** Engineering / Product
**Last updated:** 2026-07-20

> This document is the single source of truth for how a company enters the Bivro platform — from public registration through Platform Admin approval to a fully provisioned, operational workspace. It resolves all gaps identified in the Sprint 2 architecture review. Every other document section this document conflicts with is superseded here.

---

## Table of Contents

1. [Company Status Lifecycle](#1-company-status-lifecycle)
2. [Public Registration Form](#2-public-registration-form)
3. [Email Verification](#3-email-verification)
4. [Platform Admin Approval Workflow](#4-platform-admin-approval-workflow)
5. [Approval Automation — What Happens on Approve](#5-approval-automation--what-happens-on-approve)
6. [Owner Onboarding](#6-owner-onboarding)
7. [Office User Invitation](#7-office-user-invitation)
8. [Password Management](#8-password-management)
9. [Database Schema Additions](#9-database-schema-additions)
10. [Platform Email Templates](#10-platform-email-templates)
11. [Implementation Plan](#11-implementation-plan)

---

## 1. Company Status Lifecycle

### 1.1 The `company_status` Enum

The `company_status` field tracks the operational lifecycle of a company, independently of `subscription_status` (which tracks billing). Both columns exist on `companies` and are orthogonal — a company can be operationally `suspended` while having an `active` subscription.

```sql
CREATE TYPE company_status AS ENUM (
  'pending_email_verification',  -- registered; awaiting owner email confirmation
  'pending_review',              -- email confirmed; awaiting Platform Admin approval
  'active',                      -- approved; fully operational
  'suspended',                   -- temporarily blocked by Platform Admin
  'rejected',                    -- registration rejected; never activated
  'archived'                     -- churned; data retained, all access blocked
);
```

### 1.2 State Transition Diagram

```
                   [User submits registration form]
                               │
                               ▼
                ┌──────────────────────────────────┐
                │   pending_email_verification      │
                │   (auth.users exists; email       │
                │    not yet confirmed)             │
                └────────────────┬─────────────────┘
                                 │ User clicks email verification link
                                 ▼
                ┌──────────────────────────────────┐
                │          pending_review           │
                │   (visible in Platform Admin      │
                │    approval queue)                │
                └─────┬──────────────┬─────────────┘
                      │              │
                      │ Platform     │ Platform
                      │ Admin        │ Admin
                      │ approves     │ rejects
                      ▼              ▼
           ┌──────────────────┐  ┌──────────┐
           │      active      │  │ rejected │ (terminal for this registration;
           │  (fully          │  └──────────┘  owner may re-apply with a
           │   operational)   │               different email if allowed by
           └──────┬───────────┘               Platform Admin)
                  │
       ┌──────────┼───────────────┐
       │          │               │
       ▼          ▼               ▼
  suspended   archived     (billing states:
       │          │          trialing → active
       │          │          → past_due →
       │ restore  │ restore   cancelled — see
       └──────────┘           subscription_status)
           │
           ▼
         active
```

**Note on `pending_review` and "request more information":** Requesting more information does not change `company_status`. The company remains `pending_review`. The Platform Admin sends a `registration-more-info-needed` email and records notes in `companies.review_notes`. When the owner resubmits information (via email reply or a future portal form), the Platform Admin reviews again.

### 1.3 Transition Rules

| From | To | Trigger | Who |
|------|----|---------|-----|
| *(none)* | `pending_email_verification` | User submits registration form | Public (anonymous) |
| `pending_email_verification` | `pending_review` | Owner clicks email verification link | Supabase Auth confirmation hook |
| `pending_review` | `active` | Platform Admin approves | Platform Admin (`tenants.approve` permission) |
| `pending_review` | `rejected` | Platform Admin rejects | Platform Admin (`tenants.reject` permission) |
| `active` | `suspended` | Platform Admin suspension OR automatic (3 failed payment retries) | Platform Admin or system |
| `suspended` | `active` | Platform Admin restores | Platform Admin (`tenants.restore` permission) |
| `active` | `archived` | Platform Admin archives | Platform Admin (`tenants.archive` permission) |
| `suspended` | `archived` | Platform Admin archives | Platform Admin (`tenants.archive` permission) |
| `archived` | `active` | Platform Admin restores | Platform Admin (`tenants.restore` permission) |

`rejected` and `archived` are soft-terminal: no code path transitions out automatically. Platform Admin can restore from `archived` to `active` manually. `rejected` companies cannot be reactivated — a new registration with a different email is required.

### 1.4 How Company Status Affects Login

The `custom_access_token_hook` reads `company_status` from the `companies` table and injects it into the JWT `app_metadata`:

```json
{
  "app_metadata": {
    "company_id": "...",
    "role": "owner",
    "company_status": "pending_review"
  }
}
```

Next.js middleware reads this claim and routes accordingly:

| `company_status` | Owner behaviour | Office behaviour |
|-----------------|----------------|-----------------|
| `pending_email_verification` | Redirect to `/verify-email` status page | Same |
| `pending_review` | Redirect to `/pending-approval` status page | Same |
| `active` | Normal dashboard access | Normal (permission-gated) access |
| `suspended` | Redirect to `/suspended` status page with support contact | "Account unavailable. Contact your administrator." |
| `rejected` | Redirect to `/rejected` status page | Same |
| `archived` | Redirect to `/archived` page; data export request available | "Account no longer active." |

**The Owner can always authenticate** (Supabase Auth session is valid) but is routed to an appropriate status page rather than the dashboard until the company is `active`.

---

## 2. Public Registration Form

### 2.1 URL and Access

**Registration URL:** `app.bivro.io/register`

This page is publicly accessible. No authentication is required. Link is shown on the marketing site and the login page ("Don't have an account? Register your company").

### 2.2 Form Fields

#### Required Fields

| Field | Input type | Validation | Notes |
|-------|-----------|-----------|-------|
| **Company legal name** | Text | Non-empty; 2–200 chars | The official registered name used on legal documents |
| **Country** | Select | ISO 3166-1 alpha-2 | Determines VAT/UID framework and default currency/timezone |
| **Owner first name** | Text | Non-empty; 1–100 chars | The person who will be the account Owner |
| **Owner last name** | Text | Non-empty; 1–100 chars | |
| **Owner email address** | Email | Valid email format; not already registered | This becomes the login email; must be unique in the system |
| **Password** | Password | Min 12 chars; at least 1 number; at least 1 special character | Strength indicator shown in real time |
| **I accept the Terms of Service** | Checkbox | Must be checked | Version and date recorded at submission |
| **I accept the Privacy Policy** | Checkbox | Must be checked | Version and date recorded at submission |

#### Optional Fields (collected at registration)

| Field | Input type | Validation | Notes |
|-------|-----------|-----------|-------|
| **Company trading name** | Text | 0–200 chars | "Doing business as" name; used on customer-facing documents if different from legal name |
| **Company phone** | Tel | E.164 format or free text | Main business phone |
| **Company website** | URL | Valid URL or empty | |
| **VAT / Tax number** | Text | Format-validated per country (see §2.4) | Tax registration number; optional for sole traders and micro-businesses |

#### Collected in Onboarding Wizard (not at registration)

Address, logo, bank details, pricing, service catalog, crew, vehicles, and email templates are collected in the post-approval onboarding wizard. Blocking registration on these fields reduces sign-up friction and increases conversion.

### 2.3 Duplicate Detection

**Duplicate email:**
If the submitted owner email already exists in Supabase `auth.users`:
- If they have a `pending_review` or `active` company → show: "An account already exists for this email. Please sign in." Link to `/login`.
- If they have a `rejected` company → show: "This email is associated with a previous application. Please contact support@bivro.io."
- The specific reason a prior account exists is never revealed (prevents account enumeration).

**Duplicate company name:**
If `companies.legal_name` (case-insensitive match) already exists for the same country:
- Do not block registration.
- Show a non-blocking warning: "A company with a similar name exists in your region. If you are re-registering an existing business, please contact us at support@bivro.io."
- The Platform Admin review process catches legitimate duplicates.

**Slug generation (internal):**
The company's URL-safe `slug` is generated automatically from `legal_name`:
- Lowercase, strip diacritics, replace spaces with hyphens, remove non-alphanumeric characters.
- If the resulting slug already exists in `companies`, append a number suffix (`-2`, `-3`, etc.) until unique.
- The slug is stored but not shown to the registering company at this stage. It can be changed by Platform Admin at approval.

### 2.4 VAT / UID Field Handling

The VAT/UID field label and validation format change based on the selected **Country**:

| Region | Field label | Format validation | Notes |
|--------|------------|-------------------|-------|
| **Switzerland** | UID (MwSt-Nr.) | `CHE-xxx.xxx.xxx` — `CHE-` followed by 9 digits in groups of 3 | Swiss UID; validated regex only in V1 |
| **EU member states** | VAT Number | Country code + digits per EU VAT format (e.g., `DE123456789`, `FR12345678901`) | Format-validated per country regex; live VIES check deferred to V2+ |
| **United Kingdom** | VAT Number | `GB` + 9 or 12 digits | Post-Brexit UK VAT |
| **United States** | EIN (Employer Identification Number) | `xx-xxxxxxx` (2 digits, hyphen, 7 digits) | Optional; many sole operators do not have an EIN |
| **Canada** | Business Number | 9 digits | GST/HST registration number |
| **Australia** | ABN | 11 digits (space-separated groups accepted) | Australian Business Number |
| **Other countries** | Tax / VAT Number | Free text, 0–50 chars | Displayed as optional; no format validation |

**V1 validation:** Regex format check only. No live government API calls. If the format is invalid, a field-level error is shown and the form cannot be submitted.

**V2+ validation:** Live VIES API validation for EU VAT numbers. ATO API for ABNs. These are deferred due to API rate limits, costs, and the need for server-side validation infrastructure.

**Not required in V1:** If the company is a sole trader, freelancer, or does not have a VAT/tax registration (e.g., below the threshold), the field is left blank. The Platform Admin review catches mismatches between stated country and registration details.

### 2.5 Terms and Privacy Policy Acceptance

Both checkboxes are required. On form submission, Bivro records:

```
companies.terms_accepted_at          = timestamp of submission
companies.terms_version              = e.g., "2026-07-20" (the version current at submission)
companies.privacy_policy_accepted_at = timestamp of submission
companies.privacy_policy_version     = e.g., "2026-07-20"
companies.registration_ip            = client IP address (from request headers)
```

These records are immutable after creation. If terms are updated, re-acceptance is requested on next login and re-recorded without overwriting the original acceptance record (V2+ feature; V1 stores the initial acceptance only).

### 2.6 Submission Flow

```
1. User fills form and submits.
2. Client-side validation runs (all required fields, email format, password strength, VAT format).
3. Server-side (tRPC/Route Handler) validates:
   a. Email not already registered (check Supabase auth.users).
   b. Password meets policy.
   c. VAT format valid if provided.
   d. Terms and Privacy Policy accepted.
4. Supabase Auth creates auth.users record (email + password).
   → Supabase Auth sends a confirmation email automatically (built-in).
5. after_signup hook fires (triggered by Supabase Auth on user creation):
   a. Creates companies row:
      { name, legal_name, trading_name, country, vat_number, slug,
        subscription_tier: 'free', subscription_status: 'trialing',
        company_status: 'pending_email_verification',
        terms_accepted_at, terms_version, privacy_policy_accepted_at,
        privacy_policy_version, registration_ip }
   b. Creates profiles row:
      { id: auth.uid(), company_id, role: 'owner', first_name, last_name, email,
        is_active: true }
6. Server returns: "Check your email to verify your account."
7. User is shown a confirmation page at /register/check-email.
```

---

## 3. Email Verification

### 3.1 Mechanism

Supabase Auth sends a confirmation email to the owner's address at step 4 of §2.6. This is Supabase Auth's built-in email confirmation. Bivro customises the email template in the Supabase Auth dashboard to match the Bivro visual identity.

The confirmation link takes the form:
```
https://app.bivro.io/auth/confirm?token=...&type=signup
```

### 3.2 Confirmation Handler

`app/auth/confirm/route.ts` handles the confirmation GET request:

```
1. Validate the token with Supabase Auth.
2. If valid:
   a. Update companies.company_status → 'pending_review'
   b. Send platform notification email to the Platform Admin review queue.
   c. Send "application received" email to the owner (registration-received template).
   d. Write activity_logs entry: { action: 'company.email_verified', entity_type: 'company', ... }
   e. Redirect owner to /pending-approval.
3. If invalid or expired:
   a. Redirect to /register/verify-expired.
   b. Show: "Your verification link has expired." + "Resend verification email" button.
```

### 3.3 Resend Verification

If the user did not receive or lost the verification email, a "Resend verification email" button appears on the `/register/check-email` page and the `/pending-approval` page. This calls `supabase.auth.resendConfirmationEmail()`. Rate-limited to 3 resends per hour per email address.

### 3.4 Verification Expiry

Supabase Auth's default token TTL is 24 hours. If the token expires before the user clicks it, they see the resend page. The `companies` row persists with `company_status = 'pending_email_verification'` and is visible to Platform Admins for cleanup (auto-archived after 30 days by a nightly cron).

---

## 4. Platform Admin Approval Workflow

### 4.1 Approval Queue

Platform Admins with `tenants.review` permission see a **Registration Queue** in the Platform Portal (`admin.bivro.io/registrations`). The queue shows all companies with `company_status = 'pending_review'`, ordered oldest first.

**Queue columns:**
| Column | Content |
|--------|---------|
| Legal name | Company's stated legal name |
| Trading name | Trading name (if different) |
| Country | Flag + country name |
| Owner email | Registration email address |
| VAT number | If provided |
| Website | If provided |
| Registered | How long ago (e.g., "2 days ago") |
| Action | Review button |

### 4.2 Review Detail View

Clicking a company opens the review detail view showing all registration data and three action buttons: **Approve**, **Request More Information**, **Reject**.

### 4.3 Approve

**Permission required:** `tenants.approve`

**When to approve:** Legitimate moving company, no duplicate, no red flags, VAT/registration details plausible.

**Admin action:** Click Approve → optional note field (internal, not sent to owner) → Confirm.

**What happens immediately on approval:**

```
1.  companies.company_status  → 'active'
2.  companies.trial_ends_at   → now() + 14 days
3.  companies.reviewed_at     → now()
4.  companies.reviewed_by     → platform_admin_users.id (stored as text; no FK)
5.  Provision company defaults (see §5 — runs as a server action via service_role):
    a. company_settings row
    b. Default permission groups (4 groups)
    c. Default service catalog (19 system-default services)
    d. Default email templates (27 rows, is_system_default: true)
    e. Default email automations (12 rows, all inactive)
    f. Default email sender identity (bivro_managed tier)
6.  Write platform_audit_log: { action: 'tenant.approved', target_company_id, reviewed_by, ... }
7.  Write activity_logs:      { action: 'company.approved', entity_type: 'company', entity_id, ... }
8.  Write domain_events:      { event_type: 'tenant.created', payload: { company_id, tier: 'free' } }
9.  Send registration-approved email to the owner (see §10.3).
10. Update Platform Dashboard metrics.
```

### 4.4 Reject

**Permission required:** `tenants.reject`

**When to reject:** Fraudulent registration, non-moving-company business, duplicate registration with suspicious intent, incomplete information after two follow-ups, or terms violation.

**Admin action:** Click Reject → **Rejection reason required** (dropdown + free text):
- Insufficient business information
- Business does not qualify (non-moving industry)
- Duplicate registration
- Fraudulent or suspicious registration
- Terms of Service violation
- Other (free text required)

**What happens on rejection:**

```
1.  companies.company_status     → 'rejected'
2.  companies.rejection_reason   → the entered reason (internal)
3.  companies.rejected_at        → now()
4.  companies.rejected_by        → platform_admin_users.id
5.  Write platform_audit_log: { action: 'tenant.rejected', reason, ... }
6.  Write activity_logs: { action: 'company.rejected', ... }
7.  Send registration-rejected email to owner (see §10.4).
    → Reason shown to owner is the "customer-facing reason" (a subset of the internal reason).
    → The internal rejection reason and fraudulent/suspicious flags are never sent to the owner.
8.  Deactivate the owner's auth.users account (Supabase Admin API: ban user).
    → This prevents the rejected owner from logging in.
    → If the rejection is later reversed (rare), Platform Admin must manually re-enable.
```

**Owner's experience after rejection:**
- Attempting to log in shows: "Your application was not approved." with support contact.
- The `company_status` claim in the JWT routes them to the `/rejected` status page.
- The rejection email (sent immediately on rejection) explains next steps.

### 4.5 Request More Information

**Permission required:** `tenants.request_info`

**When to use:** Insufficient data to approve or reject (e.g., no VAT number for an EU company, suspicious mismatch between stated country and company name, website links to a non-moving business).

**Admin action:** Click "Request More Information" → Free text field (minimum 30 characters) describing what information is needed → Submit.

**What happens:**

```
1.  companies.company_status   → remains 'pending_review' (no status change)
2.  companies.review_notes     → appended with: "[date] Admin [name]: [message]"
3.  companies.more_info_requested_at → now()
4.  Write platform_audit_log: { action: 'tenant.info_requested', message, ... }
5.  Send registration-more-info-needed email to owner (see §10.5).
```

**How the owner responds:**
In V1, the owner responds by replying to the email. Support then updates the registration manually and the Platform Admin reviews again.

V2+: A dedicated "complete your registration" form accessible from the owner's pending-approval page.

### 4.6 Suspend

**Permission required:** `tenants.suspend`

**Trigger:** Non-payment (after 3 Stripe payment failures) or policy violation.

**What happens:**

```
1.  companies.company_status   → 'suspended'
2.  companies.suspended_reason → entered by Platform Admin (required)
3.  companies.suspended_at     → now()
4.  companies.suspended_by     → platform_admin_users.id (stored as text)
5.  All existing sessions invalidated via Supabase Admin API (sign out all users in company).
6.  Write platform_audit_log: { action: 'tenant.suspended', reason, ... }
7.  Write domain_events: { event_type: 'tenant.suspended', payload: { company_id, reason } }
8.  Send account-suspended email to owner.
```

**Owner experience while suspended:**
- Attempting to log in succeeds (Supabase Auth session is valid) but the middleware reads `company_status = 'suspended'` from the JWT and redirects to the `/suspended` status page.
- Owner sees: "Your Bivro account has been suspended. Reason: [reason]. Contact support@bivro.io."
- Office users see: "This account is currently unavailable. Please contact your administrator."

### 4.7 Reactivate (from Suspended)

**Permission required:** `tenants.restore`

**What happens:**

```
1.  companies.company_status  → 'active'
2.  companies.suspended_at    → null (cleared)
3.  companies.suspended_reason → null (cleared)
4.  Write platform_audit_log: { action: 'tenant.restored', ... }
5.  Write domain_events: { event_type: 'tenant.restored', payload: { company_id } }
6.  Send account-reactivated email to owner.
```

### 4.8 Archive

**Permission required:** `tenants.archive`

**Used for:** Churned companies, cancelled subscriptions, long-term inactive accounts.

**What happens:**

```
1.  companies.company_status  → 'archived'
2.  companies.deleted_at      → now()   (soft-delete; RLS hides from company users)
3.  All sessions invalidated via Supabase Admin API.
4.  Write platform_audit_log: { action: 'tenant.archived', ... }
5.  Data retained indefinitely (minimum 3 years for financial records per EU regulations).
```

**Owner experience when archived:**
Login succeeds but the owner is routed to `/archived`. A data export request form is available. No operational data is accessible.

---

## 5. Approval Automation — What Happens on Approve

Approval triggers a server-side provisioning function (`provisionCompany(companyId)`) that runs entirely via the Supabase service role. It is idempotent: running it twice on the same company does not create duplicates (checks for existence before inserting).

### 5.1 Default Company Settings

Creates one `company_settings` row with default rate configuration:

```
company_id:              the approved company's id
local_rate_per_hour_cents:            0   (owner must set)
long_distance_rate_per_mile_cents:    0
minimum_charge_cents:                 0
minimum_hours:                        2.0
fuel_surcharge_percent:               0
stair_carry_rate_cents:               0
long_carry_rate_cents:                0
elevator_wait_rate_cents:             0
default_deposit_percent:              20
default_quote_expiry_days:            30
default_payment_terms_days:           7
tax_enabled:                          false
tax_rate_percent:                     0
tax_label:                            'Tax'
```

### 5.2 Default Permission Groups

Creates 4 `permission_groups` rows and their `permission_group_assignments`:

| Group | Slug | Default permissions |
|-------|------|---------------------|
| Dispatcher | `dispatcher` | `jobs.*`, `employees.*`, `vehicles.*`, `customers.view`, `leads.view` |
| Estimator | `estimator` | `leads.*`, `quotes.*`, `customers.view`, `customers.create`, `customers.edit`, `appointments.*` |
| Office Manager | `office-manager` | All except `settings.banking`, `analytics.view_financial`, `analytics.export` |
| Billing | `billing` | `invoices.*`, `payments.*`, `customers.view`, `analytics.view_financial` |

Each group is created with `is_default = false`. The Owner assigns groups to Office users at invite time.

### 5.3 Default Service Catalog

Creates 19 `service_catalog` rows with `is_system_default = true`. Seeded from `PRODUCT_REQUIREMENTS.md §2.2`. Default prices are 0 (the owner must set their rates). The Owner can deactivate but not delete system-default services.

### 5.4 Default Email Templates

Creates 27 `email_templates` rows with `is_system_default = true`. The 27 lifecycle templates from `MASTER_BOOTSTRAP.md §16.2`. Each template gets one `email_template_versions` row (version 1, current, in English).

### 5.5 Default Email Automations

Creates 12 `email_automations` rows with `is_active = false`. The 12 automations from `MASTER_BOOTSTRAP.md §16.3`. All inactive — the Owner must explicitly enable each.

### 5.6 Default Email Sender Identity

Creates one `email_sender_identities` row with `tier = 'bivro_managed'`. The company sends via Bivro's shared sending domain (`mail.bivro.io`) until they configure their own domain in V2+.

### 5.7 Subscription State

At approval:
- `subscription_tier` = `'free'` (already set at registration; no change)
- `subscription_status` = `'trialing'` (already set; no change)
- `trial_ends_at` = `now() + 14 days` (set at approval, not at registration — trial starts when the company is actually usable)

No Stripe customer is created at approval. Stripe customer creation is deferred until the Owner initiates a paid subscription (Sprint 6+, Payments module).

### 5.8 Audit Log Entries

At minimum, the following entries are written on approval:

```
activity_logs:
  { action: 'company.approved',   entity_type: 'company',          entity_id: company_id }
  { action: 'settings.created',   entity_type: 'company_settings', entity_id: settings_id }
  { action: 'catalog.seeded',     entity_type: 'company',          entity_id: company_id, metadata: { count: 19 } }
  { action: 'templates.seeded',   entity_type: 'company',          entity_id: company_id, metadata: { count: 27 } }

platform_audit_log:
  { action: 'tenant.approved', target_company_id, actor_id: platform_admin_id, ... }

domain_events:
  { event_type: 'tenant.created', aggregate_id: company_id, payload: { tier: 'free', trial_ends_at } }
```

### 5.9 Welcome Email

Immediately after provisioning completes, the `registration-approved` email is sent to the Owner. This email:
- Informs them their application was approved
- Contains a direct link to log in and start the onboarding wizard
- Sets expectations: "Your 14-day trial starts today."

---

## 6. Owner Onboarding

### 6.1 First Login

After approval, the Owner visits `app.bivro.io/login`, enters their email and password. The `custom_access_token_hook` reads `company_status = 'active'` and injects the full JWT claims. The middleware grants access to the dashboard.

**First-login detection:** If `profiles.last_seen_at IS NULL`, the owner has never logged in. The middleware sets a first-login cookie and redirects to the onboarding wizard at `/onboarding`.

### 6.2 Password Setup (Approval Path)

The Owner set their password at registration. No additional password step is needed before first login. This differs from the invitation path (§7.4).

### 6.3 Onboarding Wizard

The onboarding wizard is a 7-step guided sequence that completes the company profile after approval. It is accessible at `/onboarding`. The wizard is shown:
- Automatically on first login after approval
- From the onboarding checklist at any time until all steps are complete

**Step 1 — Company Profile**
- Company trading name (if not set at registration)
- Company phone
- Company website
- Confirm country (pre-filled from registration)

**Step 2 — Company Address**
- Address line 1
- Address line 2
- City
- State / Region
- Postal code
- (Country already set)

**Step 3 — Brand & Identity**
- Company logo upload (PNG or WebP, max 2 MB)
- Accent color selector (hex color picker or preset swatches)

**Step 4 — Pricing Basics**
- Local hourly rate (per crew member)
- Minimum hours
- Default deposit percent (pre-filled to 20%)
- Currency (pre-filled from country default)

**Step 5 — First Service**
- Add one service from the default catalog (or create custom)
- Brief explanation of the service catalog

**Step 6 — Bank Details** (optional at onboarding, required before first invoice)
- Bank name
- IBAN
- BIC / SWIFT
- Payee name (legal name for payment)

**Step 7 — Test Quote** (optional)
- "You're ready. Send a test quote to yourself."
- Pre-fills a demo quote with the company's first service
- Option to skip

### 6.4 Onboarding Checklist

Visible in the dashboard sidebar and as a dedicated widget until all items are complete. Items are checked off as the Owner completes each step.

| # | Task | Completion trigger |
|---|------|--------------------|
| 1 | Complete company profile | `companies.phone IS NOT NULL` |
| 2 | Add company address | `companies.city IS NOT NULL` |
| 3 | Upload company logo | `companies.logo_url IS NOT NULL` |
| 4 | Set your rates | `company_settings.local_rate_per_hour_cents > 0` |
| 5 | Add bank details | `companies.bank_iban IS NOT NULL` |
| 6 | Invite your first team member | `COUNT(user_invitations WHERE status='accepted') > 0` |
| 7 | Send your first quote | `COUNT(quotes WHERE status != 'draft') > 0` |

Progress is shown as "X of 7 steps complete." The checklist widget disappears from the sidebar once all 7 are complete. It can be reopened from Settings → Onboarding.

### 6.5 Company Profile Completion

The Owner can update company information at any time in **Settings → Company** (requires `settings.company` permission, or Owner). Fields updated here flow into all future document snapshots but never retroactively change historical documents.

---

## 7. Office User Invitation

### 7.1 Governing Principle

**Office users NEVER self-register.** There is no public sign-up path for Office users. The only way an Office user gains access to a company workspace is via an explicit, Owner-generated invitation. This is architecturally enforced:

- The `user_invitations` INSERT RLS policy requires `public.auth_user_role() = 'owner'`
- The `custom_access_token_hook` only creates a `profiles` row when a valid invitation exists
- A user who creates a Supabase Auth account without a valid invite token has no company association and cannot access any company data

### 7.2 Invitation Creation

**Who can invite:** Only the Owner. Office users cannot invite other Office users regardless of permission configuration.

**Invitation flow:**
```
1. Owner navigates to Settings → Team → Invite Member.
2. Owner enters:
   - Invitee's email address
   - Role: Office (only option; Owner role cannot be granted via invitation in V1)
   - Permission Groups: one or more of the company's Permission Groups
3. Server (tRPC: team.invite):
   a. Check: no active invitation already exists for this email + company_id
      (UNIQUE(company_id, email) WHERE status = 'pending').
      If one exists: revoke the prior invite first.
   b. Generate a cryptographically random 32-byte URL-safe token.
   c. Store SHA-256 hash of the token in user_invitations.token_hash.
      (The raw token is NEVER stored. Only the hash lives in the database.)
   d. Insert user_invitations row:
      { company_id, email, role: 'office', permission_group_ids: [...],
        token_hash, invited_by: profile.id, expires_at: now() + 7 days, status: 'pending' }
   e. Send office-invitation email via Resend with the raw token in the link.
   f. Write activity_logs: { action: 'user_invitation.created', entity_type: 'user_invitation', ... }
4. Owner sees: "Invitation sent to [email]. Expires in 7 days."
```

### 7.3 Invitation Email

The `office-invitation` email (sent from the company's sender identity) contains:
- Subject: "You've been invited to join [Company Name] on Bivro"
- Body: "You've been invited to join [Company Name] as an Office member by [Owner name]."
- Invitation expiry date
- CTA button: "Accept invitation" → `app.bivro.io/invite/{raw_token}`
- Note: "This link expires on [date]. If you did not expect this invitation, please ignore it."

### 7.4 Invitation Acceptance

**URL:** `app.bivro.io/invite/[token]`

```
1. Route handler receives GET /invite/{token}
2. Compute SHA-256(token) → look up user_invitations WHERE token_hash = hash AND status = 'pending'
3. If not found: redirect to /invite/invalid (token not found or already used).
4. If found but expires_at < now(): update status → 'expired'; redirect to /invite/expired.
5. Display invitation landing page:
   - "You've been invited to join [Company Name]"
   - Invited by: "[Owner first name] [last name]"
   - Role: Office
   - Expiry: "[date]"
   - CTA: "Accept and set up your account"
6. Invitee clicks CTA → shown password setup form.
7. Invitee enters password + confirmation. Password strength indicator shown.
8. Submit → POST /invite/{token}/accept:
   a. Validate password meets policy.
   b. Check invite still valid (re-check status and expires_at).
   c. Call Supabase Admin API: createUser({ email, password }) → auth.users.id
      OR if auth.users already exists for this email: update password.
   d. Create profiles row:
      { id: auth_uid, company_id: invite.company_id, role: 'office',
        first_name: (from invite email or prompted), last_name: ...,
        email, is_active: true, invited_by: invite.invited_by, invited_at: invite.created_at }
   e. Create user_permission_groups rows for each permission_group_id in invite.permission_group_ids.
   f. Update user_invitations:
      { status: 'accepted', accepted_at: now(), accepted_by_auth_uid: auth_uid }
   g. Write activity_logs:
      { action: 'user_invitation.accepted', entity_type: 'user_invitation', entity_id: invite.id,
        actor_id: auth_uid, metadata: { role: 'office', permission_groups: [...] } }
   h. Issue Supabase Auth session.
   i. Redirect to /onboarding/welcome (first-login welcome screen).
```

### 7.5 First-Login Welcome Screen

After invitation acceptance, the Office user sees a welcome screen:
- "Welcome to [Company Name] on Bivro"
- "Your access: [list of Permission Group names]"
- "Your access has been configured by [Owner name]. If you have questions about what you can access, contact [Owner email]."
- CTA: "Go to dashboard"

### 7.6 Invitation Expiry

Invitations expire after 7 days. A nightly Vercel Cron (00:05 UTC) runs:
```sql
UPDATE user_invitations
SET status = 'expired'
WHERE status = 'pending' AND expires_at < now();
```

Expired invitations are retained as an audit trail. They are never deleted.

The Owner is not automatically notified when an invitation expires. When they check Settings → Team, expired invitations are shown with an "Expired" badge and a "Resend" action.

### 7.7 Invitation Revocation

The Owner can revoke a pending invitation from Settings → Team.

```
1. Owner clicks "Revoke" on a pending invitation.
2. Server (tRPC: team.revokeInvite):
   a. Verify the caller is the Owner of the company.
   b. Update user_invitations: { status: 'revoked', revoked_at: now(), revoked_by: profile.id }
   c. Write activity_logs: { action: 'user_invitation.revoked', ... }
3. The invitation link in the invitee's email is now invalid (token_hash lookup returns 'revoked').
4. No email is sent to the invitee on revocation (they may not have received the original email yet).
```

### 7.8 Permission Assignment Security

Permission groups are applied at invite acceptance time from the `permission_group_ids` snapshot on the invitation record. The snapshot is taken at invite creation time. If the Owner changes a Permission Group's permissions after sending an invitation but before the invitee accepts:

- The user receives the permission set that existed at invite creation time (snapshot semantics).
- The correct approach is to revoke and re-issue the invitation.

This is a security property, not a bug: the Owner's intent at invite time is what is applied, not a subsequently mutated state.

---

## 8. Password Management

### 8.1 Forgot Password

**URL:** `app.bivro.io/forgot-password`

**Flow:**
```
1. User enters their email address.
2. Server response is always: "If this email is registered, you'll receive a reset link."
   → Never confirm or deny whether the email exists (prevents account enumeration).
3. If auth.users exists for this email:
   a. Call Supabase Auth: resetPasswordForEmail(email, { redirectTo: 'https://app.bivro.io/reset-password' })
   b. Supabase Auth generates a secure reset token and sends the password-reset email.
4. If auth.users does not exist: identical UI response; no email sent.
5. User shown: "Check your email for a reset link. The link expires in 60 minutes."
```

### 8.2 Password Reset Email

Sent by Supabase Auth using a customised template matching Bivro's visual identity. Contains:
- Subject: "Reset your Bivro password"
- "We received a request to reset the password for [email]."
- CTA: "Reset password" (link valid 60 minutes, one-time use)
- "If you didn't request this, you can safely ignore this email."

### 8.3 Reset Password Page

**URL:** `app.bivro.io/reset-password` (Supabase Auth redirects here with `?token=...&type=recovery`)

```
1. Route handler validates the recovery token with Supabase Auth.
2. If valid: show password reset form (new password + confirm password + strength indicator).
3. On submit:
   a. Validate new password meets policy (min 12 chars, 1 number, 1 special character).
   b. Call Supabase Auth: updateUser({ password: newPassword })
   c. Supabase Auth invalidates all other active sessions for this user.
   d. Show: "Password updated. Signing you in..." → redirect to dashboard.
4. If token invalid or expired: show error with link back to /forgot-password.
```

### 8.4 Token Security

- Reset tokens are generated by Supabase Auth (not Bivro).
- Tokens are one-time use (invalidated immediately on use).
- Tokens expire in 60 minutes (configurable in Supabase Auth dashboard).
- The token is delivered in the URL. Supabase Auth's PKCE flow is used where supported.
- Tokens are never logged (Bivro logs only the reset event, not the token value).

### 8.5 Change Password (While Logged In)

**URL:** `app.bivro.io/settings/security`

Available to all authenticated users (Owner and Office).

```
1. User enters current password + new password + confirm new password.
2. Server:
   a. Re-authenticate to verify current password is correct (prevent CSRF token reuse attacks).
   b. Validate new password meets policy.
   c. Call Supabase Auth: updateUser({ password: newPassword })
   d. Invalidate all OTHER sessions (the current session remains valid).
   e. Write activity_logs: { action: 'user.password_changed', actor_id, ip_address, ... }
   f. Send password-changed confirmation email (platform email, not tenant email).
3. Show: "Password updated successfully."
```

### 8.6 Password Policy

| Rule | Requirement |
|------|-------------|
| Minimum length | 12 characters |
| Numbers | At least 1 digit |
| Special characters | At least 1 special character (`!@#$%^&*()_+-=[]{}|;':",.<>?/`) |
| Maximum length | 128 characters |
| Common passwords | Rejected (Supabase Auth checks against HaveIBeenPwned by default) |
| Previous passwords | Not reused (V2+ enforcement; not in V1) |

Strength indicator: Weak / Fair / Strong / Very Strong — shown on all password creation and reset forms.

---

## 9. Database Schema Additions

This section defines every field and table that must be added to the database in a Sprint 2 patch migration (migration 021). No existing column or constraint is removed.

### 9.1 New Enum: `company_status`

```sql
CREATE TYPE company_status AS ENUM (
  'pending_email_verification',
  'pending_review',
  'active',
  'suspended',
  'rejected',
  'archived'
);
```

### 9.2 `companies` Table — New Columns

All columns are added via `ALTER TABLE companies ADD COLUMN`. They are added with `DEFAULT` or nullable so existing rows are not broken.

**Operational status:**
```sql
company_status          company_status    NOT NULL DEFAULT 'active'
-- Default 'active' for existing rows created before this migration (Sprint 2 dev data).
-- New rows created via registration start at 'pending_email_verification'.
```

**Legal identity:**
```sql
legal_name              text
-- Official registered company name. Matches the name on the business registration.
-- If NULL, 'name' is used as the legal name on documents.

trading_name            text
-- "Doing business as" name. Customer-facing. If NULL, 'name' is used.

registration_number     text
-- Company registration number with the relevant authority (Companies House, Kammer, etc.)

vat_number              text
-- VAT/UID/EIN/GST registration number. Format validated by country (see §2.4).
```

**Banking (for invoice payment instructions):**
```sql
bank_name               text
bank_iban               text
bank_bic                text
-- SWIFT/BIC code.
bank_payee_name         text
-- Name on the bank account (may differ from company name if a sole trader).
```

**Branding:**
```sql
accent_color            text
-- Hex color code (e.g., '#1E40AF'). Used in PDF templates and email headers.
-- If NULL: Bivro defaults apply (ink-900 / #1E293B).
```

**Stripe:**
```sql
stripe_subscription_id  text
-- Stripe subscription object ID (sub_...). NULL until the owner creates a paid subscription.
-- stripe_customer_id (already exists) is the Stripe customer object ID (cus_...).
```

**Platform management:**
```sql
is_demo                 boolean           NOT NULL DEFAULT false
-- Demo companies are excluded from revenue and usage metrics. Auto-archived after 30 days.

suspended_reason        text
-- Populated when company_status = 'suspended'. Human-readable reason (shown to owner).

suspended_at            timestamptz
-- When the suspension was applied.

suspended_by            text
-- platform_admin_users.id as text. No FK enforced (cross-schema reference).
```

**Registration / approval tracking:**
```sql
registration_ip         inet
-- Client IP address captured at registration form submission.

terms_accepted_at       timestamptz
-- When the owner accepted the Terms of Service.

terms_version           text
-- Version identifier of the Terms of Service accepted (e.g., '2026-07-20').

privacy_policy_accepted_at  timestamptz
-- When the owner accepted the Privacy Policy.

privacy_policy_version  text
-- Version identifier of the Privacy Policy accepted.

reviewed_at             timestamptz
-- When a Platform Admin made the approve/reject decision.

reviewed_by             text
-- platform_admin_users.id as text. No FK enforced.

review_notes            text
-- Internal Platform Admin notes (never sent to the owner).

rejection_reason        text
-- Internal reason for rejection (never sent verbatim to the owner).

rejected_at             timestamptz

more_info_requested_at  timestamptz
-- When the last "request more information" action was taken.
```

### 9.3 New Table: `company_email_domains`

Enables tenant routing: when a user enters their email on the login page, the domain portion is looked up to pre-select the company.

```sql
CREATE TABLE company_email_domains (
  id                    uuid          PRIMARY KEY DEFAULT gen_uuid_v7(),
  company_id            uuid          NOT NULL REFERENCES companies(id) ON DELETE CASCADE,

  domain                text          NOT NULL,
  -- e.g., 'alpinemoving.com' — lowercase, no leading '@'

  is_primary            boolean       NOT NULL DEFAULT false,
  -- One primary domain per company (used as the preferred display domain).

  verified_at           timestamptz,
  -- NULL = unverified (self-declared); non-null = verified via DNS TXT record.
  -- V1: all domains are self-declared (unverified). DNS verification is V2+.

  created_at            timestamptz   NOT NULL DEFAULT now(),

  CONSTRAINT domain_format CHECK (domain ~ '^[a-z0-9]([a-z0-9\-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9\-]*[a-z0-9])?)+$')
);

CREATE UNIQUE INDEX idx_company_email_domains_domain ON company_email_domains(domain);
-- A domain can be registered to only one company at a time.

CREATE INDEX idx_company_email_domains_company ON company_email_domains(company_id);

-- RLS:
--   SELECT: public.auth_company_id() = company_id
--   INSERT/UPDATE/DELETE: public.auth_company_id() = company_id AND public.auth_user_role() = 'owner'
--   Platform (service_role): unrestricted
```

**Note on `company_email_domains` population:** In V1, domains are added by the Owner in Settings → Company → Email Domains. The system does not auto-populate the domain from the Owner's registration email (that would silently expose the company's email domain to routing). The Owner explicitly declares which email domains belong to their company.

### 9.4 Updated `custom_access_token_hook`

The hook must be updated to also read and inject `company_status` into the JWT:

```sql
-- In the custom_access_token_hook (migration 021 replaces migration 019):
SELECT company_id, role::text, company_status::text
  INTO v_company_id, v_role, v_company_status
  FROM public.profiles p
  JOIN public.companies c ON c.id = p.company_id
  WHERE p.id = v_user_id AND p.deleted_at IS NULL AND p.is_active = true;

-- Set in app_metadata:
-- { company_id, role, company_status }
```

### 9.5 New Indexes on `companies`

```sql
CREATE INDEX idx_companies_company_status ON companies(company_status)
  WHERE deleted_at IS NULL;
-- Used by the Platform Admin approval queue query.

CREATE INDEX idx_companies_pending_review ON companies(created_at)
  WHERE company_status = 'pending_review';
-- Ordered approval queue.

CREATE INDEX idx_companies_is_demo ON companies(is_demo)
  WHERE is_demo = true;
-- Exclude demo companies from metrics queries.
```

### 9.6 New `tenants.approve`, `tenants.reject`, `tenants.request_info` Permissions

These must be added to `permission_definitions` seed data in migration 021 (platform-level permissions; no company_id). They are referenced by the Platform Admin permission system.

**Note:** These are PLATFORM permissions, not company permissions. They live in `platform_admin_role_permissions`, not in the company-side `permission_definitions`. No migration to `permission_definitions` is needed. The Platform Admin role table already defines permissions as free text. The approval/rejection actions are added to the Platform Admin permission catalogue in `PLATFORM_ADMIN.md §4.3`.

---

## 10. Platform Email Templates

Platform emails are sent from `noreply@mail.bivro.io` by Bivro (not by the company to its customers). They use the platform Resend sender identity seeded in `MASTER_BOOTSTRAP.md §16.4`. They are NOT stored in the per-company `email_templates` table — they are hardcoded React Email components in `/emails/platform/`.

### 10.1 `platform-email-verification.tsx`

Sent by Supabase Auth after registration (Supabase Auth's built-in confirmation email — configured in the Supabase Auth dashboard with Bivro's template, not a custom Resend send).

**Content:**
- Subject: "Confirm your email to complete registration"
- "Thanks for registering [Company Legal Name] on Bivro."
- CTA: "Confirm my email" (Supabase Auth confirmation link)
- "This link expires in 24 hours."

### 10.2 `platform-registration-received.tsx`

Sent by Bivro immediately after email confirmation (when `company_status` transitions to `pending_review`).

**Content:**
- Subject: "We've received your Bivro application"
- "Your email has been verified. Your application for [Company Name] is now under review."
- "We review applications within 1 business day."
- "You'll receive an email once a decision has been made."
- Support contact.

### 10.3 `platform-registration-approved.tsx`

Sent by Bivro when Platform Admin approves the company.

**Content:**
- Subject: "Your Bivro account is ready — welcome aboard"
- "Your application for [Company Name] has been approved."
- "Your 14-day free trial starts today."
- CTA: "Log in to your dashboard" → `https://app.bivro.io/login`
- What to do next: brief intro to the 7-step onboarding wizard.

### 10.4 `platform-registration-rejected.tsx`

Sent by Bivro when Platform Admin rejects the company.

**Content:**
- Subject: "Update on your Bivro application"
- "Unfortunately, we were unable to approve your application for [Company Name]."
- Customer-facing reason (derived from the internal rejection category — worded carefully):
  - "Insufficient business information" → "We were unable to verify the business information provided."
  - "Non-qualifying business" → "At this time, Bivro serves professional moving and relocation companies. Based on the information provided, we are unable to confirm your business qualifies."
  - "Duplicate registration" → "An account already exists for this business. Please contact us if you believe this is an error."
  - Other → "Please contact us at support@bivro.io for more details."
- Support contact.

### 10.5 `platform-registration-more-info-needed.tsx`

Sent by Bivro when Platform Admin requests more information.

**Content:**
- Subject: "Action required: additional information needed for your Bivro application"
- "Your application for [Company Name] is under review."
- "We need a little more information before we can proceed:"
- [The specific information request, written by the Platform Admin]
- "Please reply to this email with the requested information."
- Support contact.

### 10.6 `platform-account-suspended.tsx`

Sent by Bivro when company is suspended.

**Content:**
- Subject: "Your Bivro account has been suspended"
- "Your [Company Name] account has been temporarily suspended."
- Reason: [suspension reason]
- "To resolve this, please contact support@bivro.io."

### 10.7 `platform-account-reactivated.tsx`

Sent by Bivro when suspended account is restored.

**Content:**
- Subject: "Your Bivro account has been reactivated"
- "Your [Company Name] account has been reactivated. You can now log in and resume normal operations."
- CTA: "Log in to your dashboard"

### 10.8 `platform-office-invitation.tsx`

Sent to the invitee when an Owner invites an Office user.

**Content:**
- Subject: "You've been invited to join [Company Name] on Bivro"
- "You've been invited by [Owner first name] [last name] to join [Company Name] on Bivro as an Office member."
- Invitation expires: [date]
- CTA: "Accept invitation"
- "If you did not expect this invitation, you can safely ignore this email."

### 10.9 `platform-password-reset.tsx`

Supabase Auth's built-in password reset email (configured in Supabase Auth dashboard with Bivro's template). Not a custom Resend send.

**Content:**
- Subject: "Reset your Bivro password"
- CTA: "Reset my password" (link expires in 60 minutes)
- "If you didn't request this, you can safely ignore this email."

### 10.10 `platform-password-changed.tsx`

Sent by Bivro (via Resend) after a successful password change (both reset and in-session change).

**Content:**
- Subject: "Your Bivro password has been changed"
- "The password for your Bivro account ([email]) was changed on [date] at [time] from [IP location]."
- "If you did not make this change, please contact support@bivro.io immediately."

---

## 11. Implementation Plan

### 11.1 Sprint 2 Patch — Migration 021 (schema only, no application code)

All database additions from §9. This migration must be applied before any Sprint 3 application code can be written.

**Migration 021 contents:**
- `CREATE TYPE company_status AS ENUM (...)`
- `ALTER TABLE companies ADD COLUMN company_status ...` (and all other missing columns)
- `CREATE TABLE company_email_domains (...)`
- RLS policies for `company_email_domains`
- New indexes on `companies`
- `CREATE OR REPLACE FUNCTION public.custom_access_token_hook(...)` — updated version that reads `company_status` and injects it into the JWT (replaces migration 019's version without recreating the auth.company_id() helpers)

**Default value for `company_status` on existing rows:** `'active'` — Sprint 2 development companies (the `alpine-moving` seed company) are treated as already active. This is correct for development.

### 11.2 Sprint 3 — IAM Module and Auth UI

Sprint 3 implements all application code for the flows described in this document. No database migrations in Sprint 3 (schema is complete after migration 021).

**Sprint 3 deliverables:**

| Deliverable | Files |
|------------|-------|
| Registration page | `app/(auth)/register/page.tsx` |
| Registration form tRPC router | `modules/iam/router/registration.ts` |
| After-signup Edge Function | `supabase/functions/on-signup/index.ts` |
| Email confirmation handler | `app/auth/confirm/route.ts` |
| Pending approval page | `app/(auth)/pending-approval/page.tsx` |
| Check email page | `app/(auth)/register/check-email/page.tsx` |
| Invite acceptance page | `app/(auth)/invite/[token]/page.tsx` |
| Invite acceptance tRPC router | `modules/iam/router/invitation.ts` |
| First-login welcome page | `app/(auth)/onboarding/welcome/page.tsx` |
| Forgot password page | `app/(auth)/forgot-password/page.tsx` |
| Reset password page | `app/(auth)/reset-password/page.tsx` |
| Status pages | `app/(auth)/suspended/page.tsx`, `/rejected/`, `/archived/` |
| Auth middleware | `middleware.ts` updated — check `company_status`, route accordingly |
| Platform email templates | `emails/platform/*.tsx` (10 templates from §10) |
| Permission loading middleware | `modules/iam/lib/permissions.ts` |
| tRPC auth context | `lib/trpc/context.ts` |
| Nightly invite expiry cron | `app/api/cron/expire-invitations/route.ts` |
| Nightly unverified cleanup cron | `app/api/cron/cleanup-unverified/route.ts` |

### 11.3 Sprint 4 — Platform Admin Portal (partial)

Sprint 4 implements the Platform Admin approval UI.

| Deliverable | Files |
|------------|-------|
| Registration queue page | `app/admin/registrations/page.tsx` |
| Review detail view | `app/admin/registrations/[id]/page.tsx` |
| Approve action (+ company provisioning function) | `modules/platform/lib/provision.ts` |
| Reject action | `modules/platform/router/approvals.ts` |
| Request-more-info action | `modules/platform/router/approvals.ts` |
| Suspend / restore / archive actions | `modules/platform/router/tenant-lifecycle.ts` |
| Platform email sends (Resend) | Called from provisioning/lifecycle functions |
| Nightly unverified-company archival cron | `app/api/cron/archive-unverified/route.ts` |

### 11.4 Sprint 5 — Onboarding Wizard

Sprint 5 implements the owner-facing onboarding wizard and checklist.

| Deliverable | Files |
|------------|-------|
| Onboarding wizard (7 steps) | `app/(dashboard)/onboarding/page.tsx` (step-based) |
| Onboarding checklist widget | `components/onboarding/checklist.tsx` |
| Company profile settings | `app/(dashboard)/settings/company/page.tsx` |
| Bank details settings | `app/(dashboard)/settings/company/banking/page.tsx` |
| Logo upload | `app/(dashboard)/settings/company/brand/page.tsx` |
| Email domains settings | `app/(dashboard)/settings/company/domains/page.tsx` |

### 11.5 Items Explicitly Out of Sprint 3 Scope

- Stripe subscription creation (Sprint 6: Payments module)
- Company profile completion wizard (Sprint 5: Onboarding)
- Platform Admin approval queue UI (Sprint 4: Platform Admin)
- DNS-verified email domains (V2+)
- VIES live VAT validation (V2+)
- Re-registration flow after rejection (V2+)
- SAML SSO (V2+)
- Multi-company ownership (V2+)
