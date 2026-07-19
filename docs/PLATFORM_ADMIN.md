# Bivro — Platform Administration Architecture

**Version:** 1.0  
**Status:** Authoritative Reference — Platform Operations Layer  
**Owner:** Engineering / Platform  
**Last updated:** 2026-07-05

> This document defines how Bivro operates as a software company. It governs everything that exists above the tenant layer: internal staff access, platform administration, subscription management, support protocols, and the audit system. Nothing in this document may be changed without Platform Owner approval.

---

## Table of Contents

1. [The Two Worlds — Strict Separation](#1-the-two-worlds--strict-separation)
2. [Bivro Platform Login Portal](#2-bivro-platform-login-portal)
3. [Company Login Portals](#3-company-login-portals)
4. [Platform Roles and Permission System](#4-platform-roles-and-permission-system)
5. [Platform Dashboard](#5-platform-dashboard)
6. [Tenant Management](#6-tenant-management)
7. [Support Access Protocol](#7-support-access-protocol)
8. [Subscription Tiers and Feature Flags](#8-subscription-tiers-and-feature-flags)
9. [Billing and Revenue Management](#9-billing-and-revenue-management)
10. [Platform Audit System](#10-platform-audit-system)
11. [Platform Database Schema](#11-platform-database-schema)
12. [V1 Implementation vs. V2+ Vision](#12-v1-implementation-vs-v2-vision)
13. [Cross-Document Inconsistencies Resolved](#13-cross-document-inconsistencies-resolved)

---

## 1. The Two Worlds — Strict Separation

Bivro is a multi-tenant SaaS platform. It contains two completely separate worlds that must never be mixed.

```
╔══════════════════════════════════════════════════════════════════════╗
║                         BIVRO PLATFORM                               ║
║                     admin.bivro.io                                   ║
║                                                                      ║
║  Bivro employees only. Internal control plane.                       ║
║  Manages companies, subscriptions, billing, system health.           ║
║  Never sees raw customer data without explicit audited access.       ║
╚══════════════════════════════════════════════════════════════════════╝

            ║ creates, configures, suspends, archives ║
            ▼

╔══════════════════════════════════════════════════════════════════════╗
║                     CUSTOMER COMPANIES (TENANTS)                     ║
║                     app.bivro.io / {slug}.bivro.io                  ║
║                                                                      ║
║  Company A ────────────────────────────────── isolated ──────────── ║
║  Company B ────────────────────────────────── isolated ──────────── ║
║  Company C ────────────────────────────────── isolated ──────────── ║
║                                                                      ║
║  Each company has its own Owner and Office users.                    ║
║  Company data is never visible to another company.                   ║
║  Company data is never visible to Bivro staff without audit.        ║
╚══════════════════════════════════════════════════════════════════════╝
```

### 1.1 Separation Rules — Non-Negotiable

| Rule | Description |
|------|-------------|
| **Separate auth domains** | Platform staff authenticate via `admin.bivro.io`. Company users authenticate via `app.bivro.io`. These are different identity pools with different credentials and different session management. A Bivro employee cannot log into a company portal with their Bivro credentials. |
| **Separate database schema** | Platform tables are prefixed `platform_` and live in a restricted schema. Company tables carry `company_id` and are governed by RLS. No RLS policy ever grants platform staff access to company data. |
| **No passive data access** | Platform staff see only metadata about companies (name, status, subscription, usage metrics). They never see quote content, customer names, job details, or financial records unless a time-limited support session is explicitly granted and logged. |
| **No cross-tenant queries** | The database enforces tenant isolation via RLS on every business table. A query without a valid `company_id` in the JWT returns zero rows — not an error, zero rows. |
| **Audit everything** | Every action taken by a platform staff member is written to `platform_audit_log`. This log is append-only, hash-chained, and retained for 7 years. |

---

## 2. Bivro Platform Login Portal

### 2.1 URL and Access

**URL:** `admin.bivro.io`

This subdomain is exclusively for Bivro employees. It is not linked from any public page. Its existence is not announced to customers.

### 2.2 Authentication Method

**V1: Google OAuth restricted to `@bivro.io` domain**

Platform staff authenticate via Google OAuth2, enforced to the `bivro.io` Google Workspace domain. An email address not ending in `@bivro.io` is rejected at the OAuth callback before any platform session is created. There are no passwords to manage and no risk of credential reuse.

MFA is enforced at the Google Workspace level — all `@bivro.io` accounts must have hardware key or TOTP MFA enabled. Bivro's platform portal inherits this without implementing MFA separately.

**V2+:** Hardware key (FIDO2/WebAuthn) enforced at the platform portal level in addition to Google Workspace MFA.

### 2.3 Session Management

| Parameter | Value |
|----------|-------|
| Session duration | 8 hours |
| Inactivity timeout | 30 minutes |
| Session storage | Server-side session record; httpOnly signed cookie |
| Session invalidation | Immediate on password change or role revocation |
| Concurrent sessions | Maximum 3 (additional sessions invalidate the oldest) |
| IP binding | Soft-bind to login IP; alert on IP change within session |

### 2.4 Authorization Within the Platform Portal

After authentication, the platform session reads the staff member's assigned roles from `platform_admin_user_roles`. Access to each area of the admin portal is gated by the platform permission system defined in Section 4.

Authenticating via `@bivro.io` Google account grants no permissions by default. Permissions are explicit — a new staff member who completes OAuth has a valid session but sees an empty dashboard until a Platform Admin or Platform Owner assigns them a role.

### 2.5 Security Controls

- All platform portal traffic is HTTPS. HTTP is rejected with a 301 redirect.
- HSTS with `max-age=31536000; includeSubDomains; preload`
- CSP headers prevent XSS; inline scripts are disallowed
- Every request carries a CSRF token validated server-side
- Rate limiting: 10 failed auth attempts per IP per 15 minutes → temporary block
- All admin portal requests are logged with the staff member's session ID and IP

---

## 3. Company Login Portals

### 3.1 URLs

Companies access Bivro via one of two URL patterns:

| Pattern | Description |
|---------|-------------|
| `{slug}.bivro.io` | Subdomain per company. The company's `slug` is set at creation and cannot be changed without Platform Admin action. |
| `app.bivro.io/login` | Shared login page. Tenant is resolved from the user's email after they enter it. Used as a fallback and for invite link landing. |

### 3.2 Tenant Routing

When a user lands on the login page, tenant routing determines which company context they belong to before a session is created. Routing is resolved in this priority order:

```
Step 1 — Subdomain check
  Is the request to {slug}.bivro.io?
  → YES: company_id resolved from slug lookup. Proceed to auth.
  → NO: proceed to Step 2.

Step 2 — Invite token
  Does the URL contain an invite token (/invite/{token})?
  → YES: token decoded → company_id + role + email pre-filled. Proceed to auth.
  → NO: proceed to Step 3.

Step 3 — Email domain lookup
  User enters email address.
  → Bivro looks up the email domain in company_email_domains table.
  → If a company is found: company_id resolved. Proceed to auth.
  → If not found: "No account found. Contact your company administrator."

Step 4 — Error
  Tenant cannot be resolved.
  → Show support contact. Do NOT reveal which companies exist in the system.
```

The resolved `company_id` is bound to the authentication session before credentials are checked. A user cannot authenticate into a different company by manipulating their email domain.

### 3.3 Authentication Methods

**Email + Password**  
Standard email and password. Password requirements: minimum 12 characters, at least one number and one special character. Bcrypt hashing via Supabase Auth.

**Magic Link**  
A one-time sign-in link delivered to the user's email. Valid for 15 minutes. Only one magic link can be active per email at a time — generating a new one invalidates the previous.

**Google OAuth (V2+)**  
Company-level Google Workspace SSO for Professional and above. Configured per company by the Owner. Restricted to the company's configured Google domain.

**SAML SSO (V2+ — Business and above)**  
Enterprise SAML 2.0 integration. Configured per company. Identity provider assertion must include `email` and optionally `role` attributes. Session initiated by IdP-initiated or SP-initiated flow.

### 3.4 MFA

| User Type | MFA Policy |
|-----------|-----------|
| Owner | Required by default. Can be downgraded to optional by Owner (not recommended; surfaced as a security warning). |
| Office | Optional by default. Owner can require MFA for all Office users in company settings. |
| MFA methods | TOTP authenticator app (V1). Hardware key / FIDO2 (V2+). |

MFA state is stored in Supabase Auth's `auth.mfa_factors` table. The `custom_access_token_hook` reads MFA status and sets `mfa_verified: true` in the JWT `app_metadata` when MFA is satisfied. Server-side middleware rejects requests to sensitive routes if `mfa_verified` is absent.

### 3.5 Invitation Flow

**Owner inviting an Office user:**

```
1. Owner enters email address and selects Permission Group(s) in Settings → Team.
2. Bivro creates an invite record in `user_invitations`:
   { email, company_id, role: 'office', permission_groups: [...], invited_by, expires_at }
3. Resend delivers the invitation email (template: user-invite).
4. Recipient clicks the link → lands on app.bivro.io/invite/{token}.
5. Tenant is resolved from token (Step 2 of routing).
6. Recipient sets their password (or continues via Google if configured).
7. Supabase Auth creates the auth.users record.
8. custom_access_token_hook reads the invite record:
   → Creates profiles record with company_id, role, permission_groups
   → Marks invite as accepted
   → Sets app_metadata: { company_id, role, permission_groups }
9. User is redirected to the company dashboard.
```

**Invite expiry:** 7 days. If the invite expires, Platform Admin or Owner can reissue it (Owner reissues for Office users; Platform Admin reissues for Owner-level invites).

**Invite rules:**
- Only one active invite per email per company at a time
- Accepting an invite for an email already associated with another company creates a second profile; users do not automatically get cross-company access
- Invites cannot be used more than once

### 3.6 Password Reset

```
1. User clicks "Forgot password" on the login page.
2. User enters their email address.
3. Bivro looks up the email — if found, sends a reset link via Resend.
   If NOT found: identical success message is shown (prevents email enumeration).
4. Reset link is valid for 1 hour. One-time use.
5. User sets a new password. All active sessions for that user are invalidated.
6. User is redirected to login with a confirmation message.
```

### 3.7 Session Management

| Parameter | Value |
|----------|-------|
| Session duration | 30 days ("Stay signed in" selected) or 8 hours (not selected) |
| Inactivity timeout | Not applied in V1 (configurable per company in V2+) |
| Session storage | Supabase Auth session (httpOnly cookie + refresh token) |
| Session invalidation | Immediate on password reset, role change, company suspension |
| MFA session | MFA satisfaction recorded in JWT; re-verification required if JWT expires |

---

## 4. Platform Roles and Permission System

### 4.1 Role Hierarchy

Platform roles are distinct from company roles. A Bivro staff member has a platform role. A company user has a company role (`owner` or `office`). These are completely separate systems.

```
Platform Owner
  └── Platform Admin
        ├── Customer Success
        ├── Support
        ├── Finance
        ├── Sales
        └── Developer
              └── Read Only Auditor
```

The hierarchy is for visual clarity only — roles do not inherit from each other. Every role has an explicit, independent permission set. A senior role does not automatically include all permissions of junior roles; permissions are assigned explicitly.

### 4.2 Role Definitions

**Platform Owner**  
The single most privileged role. Reserved for Bivro founders and the CTO. Unrestricted access to all platform capabilities including permanent data deletion and staff role management. There should never be more than 3 Platform Owners.

**Platform Admin**  
The operational role for Bivro staff who manage the platform day-to-day. Can perform all tenant lifecycle operations, manage subscriptions, initiate support sessions, and view all platform metrics. Cannot permanently delete data. Cannot manage Platform Owner accounts.

**Customer Success**  
Focused on tenant health and relationship management. Can view tenant details, usage metrics, and subscription history. Can initiate time-limited support sessions for onboarding and issue resolution. Cannot change subscriptions directly (must request via Platform Admin).

**Support**  
Frontline support role. Can initiate time-limited, audit-logged access sessions to investigate specific customer-reported issues. Can view company metadata (name, status, subscription, active user count). Cannot access financial data. Cannot change subscriptions.

**Finance**  
Access to all billing and revenue data. Can process refunds, adjust subscriptions, and export financial reports. Cannot access customer operational data. Cannot perform tenant lifecycle operations.

**Sales**  
Access to the company list for lead and pipeline management. Can create trial companies and extend trial periods. Cannot access customer data. Cannot view financial details of other companies.

**Developer**  
Access to system health metrics, error logs (PII-stripped), AI performance metrics, prompt management, and infrastructure monitoring. Can initiate support sessions for technical debugging. Cannot access financial data.

**Read Only Auditor**  
Read-only access to the platform audit log, platform dashboard, and company metadata. Cannot take any action that modifies state. Designed for internal compliance review or external auditor access.

### 4.3 Platform Permission Catalogue

All permissions follow the format `{resource}.{action}`. Every endpoint in the platform portal checks for the required permission before executing.

**Tenant Management**

| Permission | Description |
|-----------|-------------|
| `tenants.view` | View company list and company detail pages |
| `tenants.create` | Manually create a new company |
| `tenants.edit_metadata` | Edit company name, slug, contact details |
| `tenants.suspend` | Immediately block all logins for a company |
| `tenants.restore` | Re-activate a suspended or archived company |
| `tenants.archive` | Soft-delete a company (data retained, inaccessible) |
| `tenants.delete` | Permanently delete a company and all data (Platform Owner only) |
| `tenants.transfer_ownership` | Change the owner user of a company |
| `tenants.reset_owner_invite` | Reissue an owner invitation |
| `tenants.manage_limits` | Override default tier limits for a specific company |

**Subscription Management**

| Permission | Description |
|-----------|-------------|
| `subscriptions.view` | View subscription details and history for any company |
| `subscriptions.change_tier` | Upgrade or downgrade a company's subscription tier |
| `subscriptions.override_limits` | Set custom limits that differ from tier defaults |
| `subscriptions.extend_trial` | Extend a company's trial period |
| `subscriptions.grant_credits` | Add AI token credits to a company's balance |
| `subscriptions.process_refund` | Issue a refund through Stripe |

**Support Access**

| Permission | Description |
|-----------|-------------|
| `support.initiate_session` | Request time-limited access to a company's data |
| `support.view_active_sessions` | View all currently active support sessions |
| `support.end_session` | Manually end an active support session |

**Billing and Finance**

| Permission | Description |
|-----------|-------------|
| `billing.view_revenue` | View MRR, ARR, and revenue dashboards |
| `billing.view_invoices` | View platform invoices and Stripe records |
| `billing.export` | Export billing data and financial reports |
| `billing.process_refund` | Process refunds (requires `subscriptions.process_refund` too) |

**AI and System**

| Permission | Description |
|-----------|-------------|
| `ai.view_system_metrics` | View AI request volume, error rates, costs across tenants |
| `ai.view_costs` | View per-tenant AI token costs and budget usage |
| `ai.manage_prompts` | Deploy new prompt versions to production |
| `system.view_health` | View platform health dashboard (uptime, error rates, latency) |
| `system.manage_alerts` | Configure alert thresholds and notification recipients |
| `system.view_logs` | View PII-stripped application logs |

**Staff Management**

| Permission | Description |
|-----------|-------------|
| `staff.view` | View the list of platform staff members and their roles |
| `staff.invite` | Invite a new Bivro staff member |
| `staff.manage_roles` | Assign or change roles for other staff members |
| `staff.deactivate` | Revoke a staff member's platform access |
| `staff.manage_owners` | Manage Platform Owner accounts (Platform Owner only) |

**Audit**

| Permission | Description |
|-----------|-------------|
| `audit.view` | View the platform audit log |
| `audit.export` | Export audit log entries |
| `audit.view_support_sessions` | View the history of support access sessions |

### 4.4 Default Role → Permission Mapping

| Permission | Owner | Admin | CS | Support | Finance | Sales | Developer | Auditor |
|-----------|:-----:|:-----:|:--:|:-------:|:-------:|:-----:|:---------:|:-------:|
| `tenants.view` | ✅ | ✅ | ✅ | ✅ | — | ✅ | ✅ | ✅ |
| `tenants.create` | ✅ | ✅ | — | — | — | ✅ | — | — |
| `tenants.edit_metadata` | ✅ | ✅ | ✅ | — | — | — | — | — |
| `tenants.suspend` | ✅ | ✅ | — | — | — | — | — | — |
| `tenants.restore` | ✅ | ✅ | — | — | — | — | — | — |
| `tenants.archive` | ✅ | ✅ | — | — | — | — | — | — |
| `tenants.delete` | ✅ | — | — | — | — | — | — | — |
| `tenants.transfer_ownership` | ✅ | ✅ | — | — | — | — | — | — |
| `tenants.reset_owner_invite` | ✅ | ✅ | ✅ | — | — | — | — | — |
| `tenants.manage_limits` | ✅ | ✅ | — | — | — | — | — | — |
| `subscriptions.view` | ✅ | ✅ | ✅ | — | ✅ | ✅ | — | ✅ |
| `subscriptions.change_tier` | ✅ | ✅ | — | — | ✅ | — | — | — |
| `subscriptions.override_limits` | ✅ | ✅ | — | — | — | — | — | — |
| `subscriptions.extend_trial` | ✅ | ✅ | ✅ | — | ✅ | ✅ | — | — |
| `subscriptions.grant_credits` | ✅ | ✅ | ✅ | — | ✅ | — | — | — |
| `subscriptions.process_refund` | ✅ | ✅ | — | — | ✅ | — | — | — |
| `support.initiate_session` | ✅ | ✅ | ✅ | ✅ | — | — | ✅ | — |
| `support.view_active_sessions` | ✅ | ✅ | ✅ | ✅ | — | — | ✅ | ✅ |
| `support.end_session` | ✅ | ✅ | ✅ | ✅ | — | — | ✅ | — |
| `billing.view_revenue` | ✅ | ✅ | — | — | ✅ | — | — | ✅ |
| `billing.view_invoices` | ✅ | ✅ | — | — | ✅ | — | — | ✅ |
| `billing.export` | ✅ | ✅ | — | — | ✅ | — | — | — |
| `ai.view_system_metrics` | ✅ | ✅ | ✅ | — | — | — | ✅ | ✅ |
| `ai.view_costs` | ✅ | ✅ | — | — | ✅ | — | ✅ | ✅ |
| `ai.manage_prompts` | ✅ | ✅ | — | — | — | — | ✅ | — |
| `system.view_health` | ✅ | ✅ | ✅ | ✅ | — | — | ✅ | ✅ |
| `system.manage_alerts` | ✅ | ✅ | — | — | — | — | ✅ | — |
| `system.view_logs` | ✅ | ✅ | — | — | — | — | ✅ | — |
| `staff.view` | ✅ | ✅ | — | — | — | — | — | ✅ |
| `staff.invite` | ✅ | ✅ | — | — | — | — | — | — |
| `staff.manage_roles` | ✅ | ✅ | — | — | — | — | — | — |
| `staff.deactivate` | ✅ | ✅ | — | — | — | — | — | — |
| `staff.manage_owners` | ✅ | — | — | — | — | — | — | — |
| `audit.view` | ✅ | ✅ | ✅ | ✅ | ✅ | — | ✅ | ✅ |
| `audit.export` | ✅ | ✅ | — | — | ✅ | — | — | ✅ |
| `audit.view_support_sessions` | ✅ | ✅ | ✅ | ✅ | — | — | ✅ | ✅ |

These are default assignments. The Platform Owner can adjust individual permissions for any staff member.

---

## 5. Platform Dashboard

### 5.1 Overview

The Platform Dashboard (`admin.bivro.io/dashboard`) is the primary view for Platform Owners and Admins. It provides a real-time snapshot of the business and system health. Each section is visible only to roles with the corresponding permission.

### 5.2 Business Health Panel

Visible to: Platform Owner, Platform Admin, Finance, Read Only Auditor

| Metric | Description | Update Frequency |
|--------|-------------|-----------------|
| Monthly Recurring Revenue (MRR) | Sum of all active subscription monthly values | Daily |
| Annual Recurring Revenue (ARR) | MRR × 12 | Daily |
| MRR Growth (MoM) | % change vs. prior month | Daily |
| Total active companies | Companies with status = `active` | Real-time |
| Total trialing companies | Companies in trial period | Real-time |
| New companies this month | Created with status = `active` or `trialing` in current month | Daily |
| Churned this month | Companies moved to `cancelled` in current month | Daily |
| Net Revenue Retention (NRR) | (MRR + expansions − contractions − churn) / prior MRR | Monthly |
| Average Revenue Per Account (ARPA) | MRR / active company count | Daily |
| Overdue invoices | Companies with `subscription_status = 'past_due'` | Real-time |

### 5.3 Usage Metrics Panel

Visible to: Platform Owner, Platform Admin, Customer Success, AI metrics visible to Developer

| Metric | Description |
|--------|-------------|
| Total AI tokens used (month-to-date) | Across all tenants, current billing period |
| AI token cost (month-to-date) | Platform's Claude API bill, current period |
| AI request volume (today) | Number of Claude API calls today |
| AI error rate (today) | Failed AI requests / total AI requests |
| Failed AI requests (last 24h) | Count with link to error log |
| Total storage used | GB across all tenants in Supabase Storage |
| Storage breakdown | Grouped by tier (Free / Starter / Pro / Business / Enterprise) |
| API calls (month-to-date) | Total external API calls from all tenants |
| Active users (last 30 days) | Unique authenticated company users with at least one action |
| Quote volume (month-to-date) | Total quotes created across all tenants |
| Job volume (month-to-date) | Total jobs completed across all tenants |

### 5.4 Platform Health Panel

Visible to: Platform Owner, Platform Admin, Customer Success, Developer, Read Only Auditor

| Metric | Description | Alert Threshold |
|--------|-------------|----------------|
| API P50 latency | Median response time | — |
| API P95 latency | 95th percentile response time | > 1.5s |
| API P99 latency | 99th percentile response time | > 3s |
| API error rate | 5xx responses / total requests | > 0.5% |
| Uptime (last 30 days) | % of time the platform was reachable | < 99.9% |
| Database connection pool | Active / maximum connections | > 80% |
| Background job queue depth | Pending domain events awaiting processing | > 50 events |
| Events older than 10 min | Stalled domain events | > 5 events |
| Vercel function errors | Unhandled exceptions logged to Sentry | > 10/hour |
| Email delivery rate | Emails sent / emails accepted by Resend | < 99% |
| Failed email deliveries (24h) | Bounces + rejections | > 20 |
| Stripe webhook failures | Unprocessed Stripe events | > 0 |

### 5.5 Operations Panel

Visible to: Platform Owner, Platform Admin, Customer Success, Support

| Section | Content |
|---------|---------|
| Active support sessions | Currently open support access windows — who, which company, expires when |
| Expiring sessions (next 1h) | Sessions about to expire, so staff can extend if still working |
| Companies with no owner login (7+ days) | Potential churned or abandoned accounts |
| Trials expiring in 3 days | Conversion opportunity list |
| Companies at AI token limit | Approaching or over budget — may need credits |
| Open support tickets | Count by priority with link to support system |

### 5.6 Recent Platform Activity

Visible to: Platform Owner, Platform Admin, Read Only Auditor

A live feed of the last 50 platform audit log entries, showing:
- Actor (staff member name + role)
- Action taken
- Target company
- Timestamp

Clicking any entry opens the full audit record with before/after state.

---

## 6. Tenant Management

### 6.1 Company Lifecycle

A company moves through the following states:

```
          ┌──────────┐
          │  trial   │ ← Created manually or via signup
          └────┬─────┘
               │ trial_end or subscription started
               ▼
          ┌──────────┐
          │  active  │ ←─────────────────────────────┐
          └────┬─────┘                               │
               │                                     │ restore
       ┌───────┼──────────┐                          │
       ▼       ▼          ▼                          │
  suspend  archive   (overdue)                       │
       │       │      past_due                       │
       │       │          │ payment fails 3× or      │
       │       │          ▼ manual                   │
       │       │    ┌──────────┐                     │
       └───────┴───▶│cancelled │─────────────────────┘
                    └────┬─────┘
                         │ legal retention period elapsed
                         ▼             (Platform Owner only)
                    ┌──────────┐
                    │ deleted  │ ← Irreversible
                    └──────────┘
```

### 6.2 Create Company

**Who can:** Platform Admin, Sales (trial only)

**Used for:** Manual onboarding (white-glove), internal demo companies, QA test tenants

**Required fields:**
- Company legal name
- Slug (auto-suggested from name, unique, URL-safe)
- Owner email address (an invitation will be sent)
- Subscription tier
- Trial end date (if trial)
- Primary country (for VAT and currency defaults)

**What happens:**
1. `companies` record created with `status = 'trialing'` or `'active'`
2. Owner invitation record created in `user_invitations`
3. Company provisioned with default seed data (initial service catalog from V1 onboarding template — see PRODUCT_REQUIREMENTS.md §2.2, default permission groups)
4. Invitation email sent via Resend
5. Audit log entry: `tenant.created` with all fields recorded

**Demo companies** are flagged with `is_demo = true`. They are excluded from revenue and usage statistics. Demo companies are automatically archived after 30 days unless converted.

### 6.3 Suspend Company

**Who can:** Platform Admin, Platform Owner

**Effect:** All company users are immediately unable to log in. Existing sessions receive a `401` on their next request with a message: "Your account has been suspended. Contact Bivro support." No data is deleted. No data is modified. The suspension is fully reversible.

**Required:** A suspension reason must be entered before confirming. The reason is stored in `companies.suspended_reason` and in the audit log.

**Automatic notifications:**
- Owner email: "Your Bivro account has been suspended. Reason: [reason]. Contact support@bivro.io to resolve."

**When to use:**
- Non-payment after exhausting payment retry attempts
- Policy violation
- Fraud investigation
- Customer requested pause

### 6.4 Archive Company

**Who can:** Platform Admin, Platform Owner

**Effect:** Company is soft-deleted. All logins are blocked. The company no longer appears in normal company lists (filtered to `status != 'archived'` by default). Data is fully retained and accessible internally. Archiving is reversible via Restore.

**When to use:**
- Churned customer — subscription cancelled, data retention period in effect
- Customer requested data retention without active access
- Long-term inactive account cleanup

**Automatic trigger:** If a company remains `cancelled` for more than 90 days without restoration, a Platform Admin is prompted to archive it.

### 6.5 Restore Company

**Who can:** Platform Admin, Platform Owner

**Effect:** Moves company from `suspended` or `archived` back to `active`. Owner can log in again immediately. If the company had an active subscription that lapsed, the subscription must be reactivated separately.

### 6.6 Delete Company (Permanent)

**Who can:** Platform Owner only

**This action is irreversible.** All company data is permanently deleted: profiles, customers, leads, quotes, jobs, invoices, payments, documents, AI memory, audit logs attributed to that company.

**Conditions for deletion:**
- Company must be in `archived` status first
- Legal data retention period must have elapsed (minimum 3 years for financial records in most jurisdictions — confirm with legal counsel before deleting)
- A 48-hour confirmation hold is enforced: the deletion is queued, not immediate. The Platform Owner receives a confirmation email with a cancellation link
- A second Platform Owner (if one exists) must countersign for companies with more than 12 months of history

**What is retained after deletion:**
- The `platform_audit_log` entries for that company (for legal and compliance record-keeping)
- Stripe payment records (Stripe retains these independently per their terms)
- The company's `companies` record is replaced with a tombstone: `{ id, status: 'deleted', deleted_at, deleted_by, deletion_reason }` — no other fields

### 6.7 Transfer Ownership

**Who can:** Platform Admin, Platform Owner

**Used for:** Owner leaves the company, ownership dispute, account takeover by new business owner

**Process:**
1. Platform Admin enters the new owner's email address
2. If the email already has a profile in the company: role is promoted to `owner`, prior owner is demoted to `office`
3. If the email is new to the company: an invitation is sent with role `owner`. Once accepted, the prior owner is demoted to `office`
4. Both parties are notified by email
5. Full audit record: previous owner, new owner, authorizing platform staff member

**Note:** A company can have only one Owner at a time in V1. The prior Owner becomes an Office user and must be assigned Permission Groups.

### 6.8 Reset Owner Invitation

**Who can:** Platform Admin, Customer Success, Platform Owner

**Used for:** Owner lost access to the invitation email, invitation expired before acceptance

**Effect:** The prior invitation record is invalidated. A new invitation is generated and sent to the same email address. If the invitation email must be changed (e.g., typo), use Transfer Ownership instead.

### 6.9 Change Subscription

**Who can:** Platform Admin, Finance, Platform Owner

**Effect:** Updates `companies.subscription_tier` and `companies.subscription_status`. Triggers a Stripe subscription update. Feature flags are updated in real-time — the company's access to features changes immediately upon confirmation, not at the next billing cycle.

**Downgrade behavior:** If the company is using resources that exceed the new tier's limits (e.g., 15 Office users on a tier with a 10-user limit), the downgrade is allowed but a warning is shown: "This company has 15 Office users. The selected tier allows 10. Excess users will retain access until the owner manually removes them or you enforce the limit."

**Proration:** Handled by Stripe. Platform Admin confirms the proration amount before submitting.

### 6.10 Manage Limits (Custom Overrides)

**Who can:** Platform Admin, Platform Owner

**Used for:** Enterprise and Custom tier companies with negotiated terms

**Effect:** A company can be given limits that differ from their subscription tier's defaults without changing the tier itself. For example, a Business tier company can be given 5,000,000 AI tokens/month instead of the default 2,000,000.

Overrides are stored in `company_subscription_overrides` and take precedence over tier defaults. Each override records: the field, the override value, the reason, the authorizing staff member, and an optional expiry date.

---

## 7. Support Access Protocol

### 7.1 The Governing Principle

Bivro staff never have passive access to company data. A Bivro employee browsing the admin portal cannot see quotes, customers, jobs, invoices, AI memory, or any other operational data belonging to a company. This is enforced architecturally: the admin portal does not render company data. Only company metadata (name, status, user count, usage metrics) is visible without a support session.

Accessing company data requires an explicit, logged, time-limited support session.

### 7.2 Initiating a Support Session

Any staff member with `support.initiate_session` permission can request access. The request requires:

```
Required fields:
  Company:          [autocomplete from company list]
  Access reason:    [dropdown]
    - Customer reported a bug
    - Onboarding assistance (customer requested)
    - Data recovery request
    - Security investigation
    - Billing dispute investigation
    - Internal QA / testing (demo company only)
  Specific details: [free text, minimum 30 characters]
    What specific data will you access and why?
  Duration:         [select]
    - 1 hour
    - 4 hours
    - 24 hours
    - 72 hours (requires Platform Admin approval)
```

For sessions exceeding 24 hours: a second Platform Admin or Platform Owner must approve before the session is active.

### 7.3 What Happens When a Session Is Granted

1. A `platform_support_sessions` record is created:
   ```
   { id, admin_user_id, company_id, reason, details, duration_hours,
     granted_at, expires_at, status: 'active' }
   ```
2. The requesting staff member's platform session gains a temporary `support_company_id` scope — this allows the admin portal to render that company's data for the session duration
3. The company's Owner receives an email:
   > *"Bivro support has accessed your account.  
   > Staff member: [name]  
   > Reason: [reason]  
   > Access expires: [timestamp]  
   > All activity during this session is logged. Contact support@bivro.io with any questions."*
4. All subsequent actions by the staff member while the support session is active are logged with `support_session_id` in `platform_audit_log`

### 7.4 During the Support Session

The admin portal renders a persistent banner:

```
┌────────────────────────────────────────────────────────────┐
│  🔒 SUPPORT SESSION ACTIVE — {Company Name}                 │
│  Expires: in 3h 42m  |  All actions are logged              │
│  [End Session Early]                                        │
└────────────────────────────────────────────────────────────┘
```

All actions within the session are logged. The log entry includes:
- `admin_user_id` — the platform staff member
- `support_session_id` — links to the session record
- `company_id` — which company's data was accessed
- `action` — what was done (page viewed, record read, action taken)
- `timestamp`
- `ip_address`

Data accessed during a session is read-only by default. Write operations (e.g., editing a quote to help a customer) require explicit confirmation and are logged individually.

### 7.5 Session Expiry

When the session expires:
- The `support_company_id` scope is removed from the platform session
- The company data is no longer visible in the admin portal
- The session record is updated: `{ status: 'expired', expired_at: timestamp }`
- The company Owner receives a second email confirming the session has ended

A staff member cannot extend their own session. Extension requires a new access request.

### 7.6 Session History

All past support sessions are visible to staff with `audit.view_support_sessions`. Each session shows:
- Which staff member accessed
- Which company
- Reason
- Duration
- All logged actions within the session

Companies can request their full support session history at any time from the Owner settings panel. This is surfaced as a transparency feature.

---

## 8. Subscription Tiers and Feature Flags

### 8.1 Subscription Tier Naming — Canonical Definition

> ✅ **RESOLVED.** `DATABASE_ARCHITECTURE.md` now defines the `subscription_tier` ENUM as `('free', 'starter', 'pro', 'business', 'enterprise')` — all five values are present. The Starter tier and Custom handling are fully reflected. Section 14 of this document records the original inconsistency for audit purposes.

The canonical subscription tiers for Bivro, their internal DB values, and their product names are:

| Product Name | DB Enum Value | Notes |
|-------------|---------------|-------|
| **Free** | `free` | Time-limited trial. Existing enum value. |
| **Starter** | `starter` | **New value — must be added to enum.** |
| **Professional** | `pro` | Existing enum value. Product name is "Professional", not "Pro". |
| **Business** | `business` | Existing enum value. |
| **Enterprise** | `enterprise` | Existing enum value. |
| **Custom** | `enterprise` | Custom contracts use the `enterprise` value; limits are managed via `company_subscription_overrides`. No new enum value needed. |

### 8.2 Tier Details

---

**FREE**  
*Trial tier. All new signups start here.*

| Limit | Value |
|-------|-------|
| Duration | 14 days from account creation (extendable by Platform Admin) |
| Owner users | 1 |
| Office users | 0 |
| Quotes per month | 10 |
| Jobs per month | 5 |
| AI tokens per month | 10,000 |
| Storage | 500 MB |
| Quotation modes | Manual only |
| Support | Email (72h response SLA) |

Feature flags: `ai_manual_mode` only. No AI quote generation, no business coach, no permissions system (not relevant for solo owner).

---

**STARTER**  
*For sole operators and very small crews (1–3 movers).*

| Limit | Value |
|-------|-------|
| Owner users | 1 |
| Office users | 2 |
| Jobs per month | 30 |
| Quotes per month | Unlimited |
| AI tokens per month | 50,000 |
| Storage | 5 GB |
| Quotation modes | Manual + AI-Generated |
| Support | Email (48h response SLA) |

Feature flags: `ai_manual_mode`, `ai_quote_generate`. No business coach, no simulations, no profit analysis.

---

**PROFESSIONAL**  
*For growing operations (3–10 crew, 1 dispatcher/estimator).*

| Limit | Value |
|-------|-------|
| Owner users | 1 |
| Office users | 10 |
| Jobs per month | Unlimited |
| Quotes per month | Unlimited |
| AI tokens per month | 500,000 |
| Storage | 25 GB |
| Quotation modes | Manual + AI-Generated + Hybrid |
| API access | Yes (500 req/day) |
| Support | Email + chat (24h response SLA) |

Feature flags: `ai_manual_mode`, `ai_quote_generate`, `ai_quote_hybrid`, `ai_lead_scoring`, `ai_email_draft`, `ai_coach_brief`, `ai_replay`, `ai_observations`, `advanced_permissions`, `api_access`, `data_export`.

---

**BUSINESS**  
*For established companies (10–30 crew, dedicated office staff).*

| Limit | Value |
|-------|-------|
| Owner users | 1 |
| Office users | Unlimited |
| Jobs per month | Unlimited |
| Quotes per month | Unlimited |
| AI tokens per month | 2,000,000 |
| Storage | 100 GB |
| Quotation modes | All |
| API access | Yes (5,000 req/day) |
| Webhooks | Yes |
| Support | Priority email + chat (8h response SLA) |

Feature flags: All Professional flags + `ai_profit_analysis`, `ai_simulation`, `webhook_support`, `audit_log_export`. SAML SSO added in V2+.

---

**ENTERPRISE**  
*For large companies (30+ crew) and franchise groups.*

| Limit | Value |
|-------|-------|
| Owner users | 1 |
| Office users | Custom |
| Jobs per month | Custom |
| Quotes per month | Unlimited |
| AI tokens per month | Custom |
| Storage | Custom |
| Quotation modes | All |
| API access | Full (custom rate limit) |
| Webhooks | Yes |
| SSO | SAML 2.0 (V2+) |
| SLA | 99.9% uptime guarantee |
| Support | Dedicated Customer Success Manager |

Feature flags: All Business flags + `sso_saml` (V2+), `custom_ai_model` (V2+), `white_label` (V2+).

---

**CUSTOM**  
*For agencies, franchise groups, white-label partners — negotiated contracts.*

Custom billing cycle, custom feature set, fully negotiated. Uses `enterprise` DB enum value with all limits set via `company_subscription_overrides`. Billed manually via invoice. Requires Platform Owner approval to create.

---

### 8.3 Complete Feature Flag Registry

All feature flags are stored in `subscription_plan_features`. The application checks `companies.subscription_tier` → joins to plan features → evaluates the flag at request time.

| Feature Flag | Free | Starter | Professional | Business | Enterprise |
|-------------|:----:|:-------:|:------------:|:--------:|:----------:|
| `ai_manual_mode` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `ai_quote_generate` | — | ✅ | ✅ | ✅ | ✅ |
| `ai_quote_hybrid` | — | — | ✅ | ✅ | ✅ |
| `ai_lead_scoring` | — | — | ✅ | ✅ | ✅ |
| `ai_email_draft` | — | — | ✅ | ✅ | ✅ |
| `ai_coach_brief` | — | — | ✅ | ✅ | ✅ |
| `ai_replay` | — | — | ✅ | ✅ | ✅ |
| `ai_observations` | — | — | ✅ | ✅ | ✅ |
| `ai_profit_analysis` | — | — | — | ✅ | ✅ |
| `ai_simulation` | — | — | — | ✅ | ✅ |
| `advanced_permissions` | — | — | ✅ | ✅ | ✅ |
| `api_access` | — | — | ✅ | ✅ | ✅ |
| `webhook_support` | — | — | — | ✅ | ✅ |
| `data_export` | — | — | ✅ | ✅ | ✅ |
| `audit_log_export` | — | — | — | ✅ | ✅ |
| `sso_saml` | — | — | — | — | V2+ |
| `custom_ai_model` | — | — | — | — | V2+ |
| `white_label` | — | — | — | — | V2+ |

### 8.4 Limit Enforcement

Limits are enforced at the application layer, not the database layer. The database does not prevent a 31st quote from being created for a company on the Starter tier — the tRPC resolver checks the limit before executing the insert.

**Enforcement strategy:**
1. On every relevant write operation, the resolver checks `companies.subscription_tier` → `subscription_plan_limits` → current month count
2. If the count equals the limit: return a structured error with a code of `QUOTA_EXCEEDED`
3. The UI renders this as a modal: "You've reached your monthly quote limit on the Starter plan. Upgrade to Professional for unlimited quotes." with a one-click upgrade link
4. Limits are evaluated against a calendar-month window, resetting at midnight UTC on the 1st of each month

**Soft limits vs. hard limits:**
- AI token budget: soft limit at 80% (notification), hard stop at 100%
- User count: hard limit (cannot invite beyond the limit)
- Job/quote count: hard limit (cannot create beyond the limit)
- Storage: soft limit at 90% (warning), hard stop at 100%

---

## 9. Billing and Revenue Management

### 9.1 Stripe Integration

All subscription billing is managed through Stripe. Bivro stores only the minimum billing state required for operational decisions:

| Stored in Bivro DB | Source of Truth |
|-------------------|----------------|
| `subscription_tier` | Stripe product/price ID |
| `subscription_status` | Stripe subscription status |
| `stripe_customer_id` | Stripe |
| `stripe_subscription_id` | Stripe |
| `current_period_end` | Stripe |
| `trial_ends_at` | Stripe |

Payment method details (card numbers, expiry) are never stored in Bivro's database. They live entirely in Stripe's vault.

### 9.2 Stripe Webhook Events

Bivro listens to the following Stripe events and updates company subscription state accordingly:

| Stripe Event | Bivro Action |
|-------------|-------------|
| `customer.subscription.created` | Set `subscription_status = 'active'`, record tier |
| `customer.subscription.updated` | Update tier and status; update feature flags |
| `customer.subscription.deleted` | Set `subscription_status = 'cancelled'` |
| `invoice.payment_succeeded` | Set `subscription_status = 'active'`; record payment |
| `invoice.payment_failed` | Set `subscription_status = 'past_due'`; notify owner |
| `invoice.payment_failed` (3rd attempt) | Trigger suspension workflow |
| `customer.subscription.trial_will_end` | Send trial ending email (3 days before) |
| `customer.subscription.trial_ended` | Set status; send conversion prompt |

Webhook payloads are verified with Stripe's signature before processing. Failed webhook processing is retried via the domain event queue.

### 9.3 Revenue Dashboard

Accessible to Platform Owner, Platform Admin, Finance, and Read Only Auditor. Displays:

**Top-line metrics (current month)**
- Total MRR
- New MRR (from new subscriptions started this month)
- Expansion MRR (from upgrades)
- Contraction MRR (from downgrades)
- Churned MRR (from cancellations)
- Net New MRR

**Historical trend (last 12 months)**
- MRR trend chart
- Active company count trend
- Tier distribution (what % of companies are on each tier)

**Cohort analysis (V2+)**
- Retention by signup month
- Revenue retention by cohort

### 9.4 AI Usage Billing

AI token usage is tracked per company per billing period. For companies that exceed their included token budget:

- **Starter through Business:** AI features are disabled until the period resets or the owner purchases additional credits via the Bivro portal
- **Enterprise / Custom:** Overage is billed at the negotiated per-token rate, added to the next invoice

AI credit purchases (top-ups) are handled via a Stripe one-time payment product. Credits are added to `companies.ai_token_credits_remaining` immediately after payment confirmation.

---

## 10. Platform Audit System

### 10.1 Audit Scope

Every state-changing action taken by a platform staff member is recorded in `platform_audit_log`. This includes:

- Tenant lifecycle operations (create, suspend, archive, restore, delete)
- Subscription changes
- Support session initiation, actions within sessions, and expiry
- Staff management (invite, role change, deactivate)
- Prompt deployment
- System configuration changes
- Billing operations (refunds, credit grants)
- Login events (success and failure)
- Permission changes

Read-only actions (viewing a company detail page, viewing the dashboard) are not written to the audit log by default. They are captured in application request logs (Logtail) which are retained for 90 days.

### 10.2 Audit Log Entry Structure

Every audit log entry contains:

```
id               — unique record identifier
actor_id         — platform staff member's ID
actor_email      — snapshotted at write time (does not change if email changes later)
actor_role       — the role(s) the actor had at the time of the action
actor_ip         — client IP address
actor_session_id — platform session identifier

action           — string key, e.g. 'tenant.suspended', 'subscription.tier_changed'
resource_type    — 'company' | 'subscription' | 'staff' | 'support_session' | 'prompt' | 'system'
resource_id      — UUID of the affected resource

target_company_id — if the action targets a company (nullable for system-level actions)

before_state     — JSON snapshot of the affected record before the action
after_state      — JSON snapshot of the affected record after the action

support_session_id — links to support_access_sessions if this action occurred during a support session

reason           — free-text reason (required for destructive operations)
metadata         — additional context specific to the action type

previous_hash    — SHA-256 hash of the previous audit log entry (for chain integrity)
entry_hash       — SHA-256 hash of this entry's content

created_at       — exact timestamp (microsecond precision)
```

### 10.3 Tamper Detection (Hash Chain)

The `platform_audit_log` is hash-chained. Each entry's `entry_hash` is computed from its content plus the `previous_hash` of the entry that immediately precedes it. This means any modification to a historical record will break the chain and be detectable by a chain-verification process.

Chain verification runs automatically:
- Nightly: verifies the last 7 days of entries
- On demand: Platform Owner can trigger a full chain verification

If a broken chain is detected, a critical alert is sent to all Platform Owners immediately.

### 10.4 Retention and Export

**Retention:** Platform audit log entries are retained permanently (no automatic deletion). Storage cost is managed by archiving entries older than 3 years to cold storage (Supabase Storage or S3) while keeping the schema accessible for queries.

**Export:** Staff with `audit.export` permission can export audit log entries as CSV or JSON, filtered by:
- Date range
- Actor (staff member)
- Target company
- Action type
- Support session ID

Exports are themselves logged in the audit log: `{ action: 'audit.log_exported', filter_params: {...}, record_count: N }`.

### 10.5 Audit Action Key Catalogue

| Action Key | Trigger |
|-----------|---------|
| `auth.platform_login_success` | Platform staff authenticated successfully |
| `auth.platform_login_failed` | Failed authentication attempt |
| `auth.platform_session_expired` | Session timed out |
| `tenant.created` | New company created |
| `tenant.suspended` | Company suspended |
| `tenant.restored` | Company restored from suspended/archived |
| `tenant.archived` | Company archived |
| `tenant.deletion_queued` | Permanent deletion queued (48h hold) |
| `tenant.deletion_cancelled` | Queued deletion cancelled |
| `tenant.deleted` | Company permanently deleted |
| `tenant.ownership_transferred` | Owner changed |
| `tenant.owner_invite_reset` | Owner invitation reissued |
| `tenant.metadata_edited` | Company name, slug, or contact details changed |
| `subscription.tier_changed` | Tier upgrade or downgrade |
| `subscription.limits_overridden` | Custom limits set |
| `subscription.trial_extended` | Trial period extended |
| `subscription.credits_granted` | AI token credits added |
| `subscription.refund_processed` | Stripe refund issued |
| `support.session_initiated` | Support access session started |
| `support.session_ended` | Session ended (by expiry or manual end) |
| `support.data_viewed` | Specific company record viewed during session |
| `support.data_modified` | Company record modified during session |
| `staff.invited` | New platform staff member invited |
| `staff.role_assigned` | Role assigned to staff member |
| `staff.role_removed` | Role removed from staff member |
| `staff.deactivated` | Staff member access revoked |
| `prompt.version_deployed` | AI prompt version deployed to production |
| `system.alert_configured` | Alert threshold changed |
| `audit.log_exported` | Audit log records exported |

---

## 11. Platform Database Schema

Platform tables are prefixed with `platform_` and are stored in the same database as company tables but are governed by separate RLS policies. No company-level RLS policy grants access to platform tables. No platform table is accessible via the Supabase anon or authenticated key used by company users.

Platform tables use the `service_role` key exclusively, called only from server-side platform portal code.

### 11.1 `platform_admin_users`

Bivro internal staff. Completely separate from the `profiles` table.

```sql
platform_admin_users
──────────────────────────────────────────────────────────────────
id                    uuid         PRIMARY KEY DEFAULT gen_uuid_v7()
email                 text         NOT NULL UNIQUE
full_name             text         NOT NULL
google_sub            text         UNIQUE  -- Google OAuth subject ID
avatar_url            text

is_active             boolean      NOT NULL DEFAULT true
deactivated_at        timestamptz
deactivated_by        uuid         REFERENCES platform_admin_users(id) ON DELETE SET NULL

last_login_at         timestamptz
last_login_ip         inet

created_at            timestamptz  NOT NULL DEFAULT now()
updated_at            timestamptz  NOT NULL DEFAULT now()
──────────────────────────────────────────────────────────────────
CONSTRAINTS:
  CHECK (email LIKE '%@bivro.io')   -- enforce internal domain
INDEXES:
  idx_platform_users_email    (email) WHERE is_active = true
  idx_platform_users_google   (google_sub) WHERE google_sub IS NOT NULL
NOTE: No RLS — accessible only via service_role from admin portal server code.
```

### 11.2 `platform_admin_roles`

Role definitions. Seeded at deployment. Not editable via UI (requires a migration).

```sql
platform_admin_roles
──────────────────────────────────────────────────────────────────
id                    uuid         PRIMARY KEY DEFAULT gen_uuid_v7()
name                  text         NOT NULL UNIQUE
  -- 'platform_owner' | 'platform_admin' | 'customer_success'
  -- 'support' | 'finance' | 'sales' | 'developer' | 'read_only_auditor'
display_name          text         NOT NULL
description           text         NOT NULL
is_system             boolean      NOT NULL DEFAULT false
  -- true for built-in roles; system roles cannot be deleted

created_at            timestamptz  NOT NULL DEFAULT now()
──────────────────────────────────────────────────────────────────
```

### 11.3 `platform_admin_role_permissions`

Which permissions each role has. Seeded at deployment; reflects the table in Section 4.4.

```sql
platform_admin_role_permissions
──────────────────────────────────────────────────────────────────
id                    uuid         PRIMARY KEY DEFAULT gen_uuid_v7()
role_id               uuid         NOT NULL REFERENCES platform_admin_roles(id) ON DELETE CASCADE
permission_key        text         NOT NULL  -- e.g. 'tenants.suspend'

created_at            timestamptz  NOT NULL DEFAULT now()
──────────────────────────────────────────────────────────────────
CONSTRAINTS:
  UNIQUE(role_id, permission_key)
```

### 11.4 `platform_admin_user_roles`

Staff-to-role mapping. A staff member can hold multiple roles.

```sql
platform_admin_user_roles
──────────────────────────────────────────────────────────────────
id                    uuid         PRIMARY KEY DEFAULT gen_uuid_v7()
admin_user_id         uuid         NOT NULL REFERENCES platform_admin_users(id) ON DELETE CASCADE
role_id               uuid         NOT NULL REFERENCES platform_admin_roles(id) ON DELETE RESTRICT

assigned_by           uuid         REFERENCES platform_admin_users(id) ON DELETE SET NULL
assigned_at           timestamptz  NOT NULL DEFAULT now()

revoked_by            uuid         REFERENCES platform_admin_users(id) ON DELETE SET NULL
revoked_at            timestamptz
──────────────────────────────────────────────────────────────────
CONSTRAINTS:
  UNIQUE(admin_user_id, role_id) WHERE revoked_at IS NULL
```

### 11.5 `platform_admin_permission_overrides`

Individual permission overrides per staff member (mirrors the company-side permission model).

```sql
platform_admin_permission_overrides
──────────────────────────────────────────────────────────────────
id                    uuid         PRIMARY KEY DEFAULT gen_uuid_v7()
admin_user_id         uuid         NOT NULL REFERENCES platform_admin_users(id) ON DELETE CASCADE
permission_key        text         NOT NULL
override_type         text         NOT NULL CHECK (override_type IN ('grant', 'deny'))

reason                text         NOT NULL
granted_by            uuid         NOT NULL REFERENCES platform_admin_users(id) ON DELETE SET NULL
granted_at            timestamptz  NOT NULL DEFAULT now()
expires_at            timestamptz  -- null = permanent
──────────────────────────────────────────────────────────────────
CONSTRAINTS:
  UNIQUE(admin_user_id, permission_key) WHERE expires_at IS NULL OR expires_at > now()
```

### 11.6 `platform_admin_sessions`

Active platform admin sessions. Used for session invalidation.

```sql
platform_admin_sessions
──────────────────────────────────────────────────────────────────
id                    uuid         PRIMARY KEY DEFAULT gen_uuid_v7()
admin_user_id         uuid         NOT NULL REFERENCES platform_admin_users(id) ON DELETE CASCADE
session_token_hash    text         NOT NULL UNIQUE  -- bcrypt hash of session token
ip_address            inet         NOT NULL
user_agent            text

created_at            timestamptz  NOT NULL DEFAULT now()
last_active_at        timestamptz  NOT NULL DEFAULT now()
expires_at            timestamptz  NOT NULL   -- created_at + 8h

invalidated_at        timestamptz  -- null = session still valid
invalidation_reason   text
  -- 'expired' | 'logout' | 'password_change' | 'role_revoked' | 'admin_forced'
──────────────────────────────────────────────────────────────────
INDEXES:
  idx_platform_sessions_token    (session_token_hash) WHERE invalidated_at IS NULL
  idx_platform_sessions_user     (admin_user_id, expires_at)
```

### 11.7 `subscription_plans`

Tier definitions. Seeded at deployment. One row per tier.

```sql
subscription_plans
──────────────────────────────────────────────────────────────────
id                    uuid         PRIMARY KEY DEFAULT gen_uuid_v7()
tier                  subscription_tier  NOT NULL UNIQUE
  -- 'free' | 'starter' | 'pro' | 'business' | 'enterprise'
display_name          text         NOT NULL  -- 'Free' | 'Starter' | 'Professional' | etc.
description           text         NOT NULL
stripe_price_id       text         -- Stripe Price ID for recurring billing (null for free/custom)
monthly_price_cents   integer      -- null for enterprise/custom

-- Limits
max_office_users      integer      -- null = unlimited
max_jobs_per_month    integer      -- null = unlimited
max_quotes_per_month  integer      -- null = unlimited
max_ai_tokens_month   integer      -- null = custom (see overrides)
max_storage_mb        integer      -- null = unlimited
max_api_calls_day     integer      -- null = unlimited

-- Trial
trial_days            integer      NOT NULL DEFAULT 0

is_active             boolean      NOT NULL DEFAULT true
sort_order            integer      NOT NULL  -- display order in pricing page

created_at            timestamptz  NOT NULL DEFAULT now()
updated_at            timestamptz  NOT NULL DEFAULT now()
──────────────────────────────────────────────────────────────────
```

### 11.8 `subscription_plan_features`

Feature flags per tier. One row per (tier, feature) pair.

```sql
subscription_plan_features
──────────────────────────────────────────────────────────────────
id                    uuid         PRIMARY KEY DEFAULT gen_uuid_v7()
plan_id               uuid         NOT NULL REFERENCES subscription_plans(id) ON DELETE CASCADE
feature_key           text         NOT NULL  -- e.g. 'ai_quote_generate'
is_enabled            boolean      NOT NULL DEFAULT false

created_at            timestamptz  NOT NULL DEFAULT now()
──────────────────────────────────────────────────────────────────
CONSTRAINTS:
  UNIQUE(plan_id, feature_key)
```

### 11.9 `company_subscription_overrides`

Custom limits that override tier defaults for specific companies. Used for Enterprise and Custom contracts.

```sql
company_subscription_overrides
──────────────────────────────────────────────────────────────────
id                    uuid         PRIMARY KEY DEFAULT gen_uuid_v7()
company_id            uuid         NOT NULL REFERENCES companies(id) ON DELETE CASCADE

limit_key             text         NOT NULL
  -- 'max_office_users' | 'max_jobs_per_month' | 'max_ai_tokens_month'
  -- 'max_storage_mb' | 'max_api_calls_day'
override_value        integer      NOT NULL  -- null = unlimited
reason                text         NOT NULL
authorized_by         uuid         NOT NULL REFERENCES platform_admin_users(id) ON DELETE SET NULL

valid_from            timestamptz  NOT NULL DEFAULT now()
valid_until           timestamptz  -- null = permanent

created_at            timestamptz  NOT NULL DEFAULT now()
──────────────────────────────────────────────────────────────────
CONSTRAINTS:
  UNIQUE(company_id, limit_key) WHERE valid_until IS NULL OR valid_until > now()
INDEXES:
  idx_sub_overrides_company   (company_id) WHERE valid_until IS NULL OR valid_until > now()
```

### 11.10 `company_feature_overrides`

Per-company feature flag overrides. Allows enabling a feature above the tier (e.g., giving a Starter company access to AI simulations for a limited trial).

```sql
company_feature_overrides
──────────────────────────────────────────────────────────────────
id                    uuid         PRIMARY KEY DEFAULT gen_uuid_v7()
company_id            uuid         NOT NULL REFERENCES companies(id) ON DELETE CASCADE

feature_key           text         NOT NULL
is_enabled            boolean      NOT NULL
reason                text         NOT NULL
authorized_by         uuid         NOT NULL REFERENCES platform_admin_users(id) ON DELETE SET NULL

valid_from            timestamptz  NOT NULL DEFAULT now()
valid_until           timestamptz  -- null = permanent

created_at            timestamptz  NOT NULL DEFAULT now()
──────────────────────────────────────────────────────────────────
CONSTRAINTS:
  UNIQUE(company_id, feature_key) WHERE valid_until IS NULL OR valid_until > now()
```

### 11.11 `platform_support_sessions`

Audited support access sessions.

```sql
platform_support_sessions
──────────────────────────────────────────────────────────────────
id                    uuid         PRIMARY KEY DEFAULT gen_uuid_v7()
admin_user_id         uuid         NOT NULL REFERENCES platform_admin_users(id) ON DELETE RESTRICT
company_id            uuid         NOT NULL REFERENCES companies(id) ON DELETE RESTRICT

-- Request context
reason_category       text         NOT NULL
  -- 'bug_report' | 'onboarding_assistance' | 'data_recovery'
  -- 'security_investigation' | 'billing_dispute' | 'internal_qa'
reason_details        text         NOT NULL  -- free text, minimum 30 chars

-- Timing
requested_at          timestamptz  NOT NULL DEFAULT now()
approved_at           timestamptz  -- null if auto-approved (< 24h duration)
approved_by           uuid         REFERENCES platform_admin_users(id) ON DELETE SET NULL
  -- null = auto-approved; set for sessions > 24h (require second approver)

granted_at            timestamptz
expires_at            timestamptz  NOT NULL

-- Status
status                text         NOT NULL DEFAULT 'pending'
  -- 'pending' | 'active' | 'expired' | 'ended_early' | 'denied'
ended_at              timestamptz
ended_by              uuid         REFERENCES platform_admin_users(id) ON DELETE SET NULL
ended_reason          text

-- Notifications
owner_notified_at     timestamptz  -- when company owner was emailed
owner_notified_end_at timestamptz  -- when company owner was emailed on session end

created_at            timestamptz  NOT NULL DEFAULT now()
──────────────────────────────────────────────────────────────────
INDEXES:
  idx_support_sessions_active    (admin_user_id, status) WHERE status = 'active'
  idx_support_sessions_company   (company_id, created_at DESC)
  idx_support_sessions_expires   (expires_at) WHERE status = 'active'
```

### 11.12 `platform_audit_log`

Immutable, hash-chained record of all platform staff actions. No UPDATE, no DELETE — ever.

```sql
platform_audit_log
──────────────────────────────────────────────────────────────────
id                    uuid         PRIMARY KEY DEFAULT gen_uuid_v7()

-- Actor
actor_id              uuid         NOT NULL  -- platform_admin_users.id
actor_email           text         NOT NULL  -- snapshotted
actor_roles           text[]       NOT NULL  -- snapshotted role names at action time
actor_ip              inet         NOT NULL
actor_session_id      uuid         NOT NULL REFERENCES platform_admin_sessions(id) ON DELETE RESTRICT

-- Action
action                text         NOT NULL  -- e.g. 'tenant.suspended'
resource_type         text         NOT NULL  -- 'company' | 'subscription' | 'staff' | etc.
resource_id           uuid                   -- UUID of affected resource

-- Target company (nullable — some actions are not company-specific)
target_company_id     uuid
target_company_name   text         -- snapshotted

-- State snapshots
before_state          jsonb        -- record state before action
after_state           jsonb        -- record state after action

-- Context
support_session_id    uuid         REFERENCES platform_support_sessions(id) ON DELETE RESTRICT
  -- non-null when this action occurred during a support session
reason                text         -- required for destructive operations
metadata              jsonb        -- additional action-specific context

-- Integrity
previous_entry_id     uuid         REFERENCES platform_audit_log(id) ON DELETE RESTRICT
previous_hash         text         NOT NULL  -- hash of previous entry
entry_hash            text         NOT NULL  -- hash of this entry's content + previous_hash

created_at            timestamptz  NOT NULL DEFAULT now()
──────────────────────────────────────────────────────────────────
INDEXES:
  idx_audit_actor           (actor_id, created_at DESC)
  idx_audit_action          (action, created_at DESC)
  idx_audit_company         (target_company_id, created_at DESC)
  idx_audit_session         (support_session_id) WHERE support_session_id IS NOT NULL
  idx_audit_created_at      (created_at DESC)
NOTE: No RLS UPDATE/DELETE. Enforced at DB level via a BEFORE UPDATE/DELETE trigger
that raises an exception unconditionally.
```

### 11.13 `user_invitations`

Company user invitations (Owner inviting Office users, or Platform Admin resetting an Owner invite).

```sql
user_invitations
──────────────────────────────────────────────────────────────────
id                    uuid         PRIMARY KEY DEFAULT gen_uuid_v7()
company_id            uuid         NOT NULL REFERENCES companies(id) ON DELETE CASCADE
email                 text         NOT NULL
role                  user_role    NOT NULL  -- 'owner' | 'office'
permission_group_ids  uuid[]       NOT NULL DEFAULT '{}'
  -- Permission Groups pre-assigned for Office users

token_hash            text         NOT NULL UNIQUE  -- bcrypt hash of the random invite token
-- The raw token is NOT stored. It is generated once, emailed to the invitee, then discarded.
-- Verification: hash the token from the URL, compare against token_hash.

invited_by            uuid         -- profiles.id (company user) OR null (platform admin)
invited_by_platform   uuid         -- platform_admin_users.id if invited by platform staff

status                text         NOT NULL DEFAULT 'pending'
  -- 'pending' | 'accepted' | 'expired' | 'revoked'

expires_at            timestamptz  NOT NULL  -- DEFAULT now() + INTERVAL '7 days'
accepted_at           timestamptz
accepted_by_user_id   uuid         -- auth.users.id after acceptance

created_at            timestamptz  NOT NULL DEFAULT now()
──────────────────────────────────────────────────────────────────
CONSTRAINTS:
  -- Only one active invite per email per company
  UNIQUE(company_id, email) WHERE status = 'pending'
INDEXES:
  idx_invitations_token_hash    (token_hash) WHERE status = 'pending'
  idx_invitations_company       (company_id, status)
  idx_invitations_email         (email, status)
```

### 11.14 `platform_metric_snapshots`

Daily aggregated business metrics. Stored for dashboard history and trend charts.

```sql
platform_metric_snapshots
──────────────────────────────────────────────────────────────────
id                    uuid         PRIMARY KEY DEFAULT gen_uuid_v7()
snapshot_date         date         NOT NULL
metric_key            text         NOT NULL
  -- 'mrr_cents' | 'arr_cents' | 'active_company_count'
  -- 'trialing_company_count' | 'new_company_count' | 'churned_company_count'
  -- 'total_ai_tokens_used' | 'total_ai_cost_millicents'
  -- 'total_storage_mb' | 'total_quotes_created' | 'total_jobs_completed'
  -- 'api_error_rate' | 'ai_error_rate' | 'email_delivery_rate'
metric_value          numeric      NOT NULL
dimension             text         -- optional grouping: 'tier' | 'country' | null

created_at            timestamptz  NOT NULL DEFAULT now()
──────────────────────────────────────────────────────────────────
CONSTRAINTS:
  UNIQUE(snapshot_date, metric_key, dimension)
INDEXES:
  idx_metric_snapshots_date    (snapshot_date DESC, metric_key)
```

---

## 12. V1 Implementation vs. V2+ Vision

### V1 — Foundation

| Capability | V1 Implementation |
|-----------|------------------|
| Platform login | Google OAuth restricted to `@bivro.io` + session table |
| Company login | Supabase Auth (email/password + magic link) |
| Platform roles | Seeded role table + permission check middleware |
| Platform dashboard | Protected Next.js route at `/admin/*` |
| Tenant management | Admin portal CRUD on `companies` table via service_role |
| Support sessions | `platform_support_sessions` + `platform_audit_log`; email notifications via Resend |
| Subscriptions | Stripe integration; `subscription_plans` + feature flag tables |
| Billing webhooks | Stripe webhook handler → Supabase DB update |
| Audit log | `platform_audit_log` with hash chain; nightly verification cron |
| Metrics | `platform_metric_snapshots` via daily Vercel Cron |
| MFA (company users) | Supabase Auth TOTP |
| MFA (platform staff) | Enforced via Google Workspace — no separate Bivro MFA implementation |

### V2+ — Evolution

| Capability | V2+ Enhancement |
|-----------|----------------|
| Platform login | Hardware key (FIDO2/WebAuthn) enforced in addition to Google |
| Company login | SAML 2.0 SSO (Business + Enterprise tiers) |
| Platform dashboard | Dedicated admin SPA with real-time metrics via websocket |
| Audit log | Immutable append-only log shipped to cold storage; compliance API |
| Metrics | Real-time revenue dashboard (Stripe webhooks → live aggregation) |
| Cohort analysis | Full retention and revenue cohort analysis |
| RBAC (platform) | Dynamic role builder — custom platform roles with granular permissions |
| White-label | Custom domain + branding per Enterprise tenant |
| Data residency | EU/US/APAC data regions (separate Supabase projects per region) |
| IP allowlisting | Platform portal access restricted to Bivro office IPs or VPN |

---

## 13. Platform Email Infrastructure

### How Bivro Platform Sends Emails to Companies

The Bivro platform sends operational emails to company owners for platform-level events (trial expiry, subscription changes, billing receipts, support session notifications, security alerts). These are distinct from the email system that company users manage for their own customers.

**Sending infrastructure:** Platform emails use the same Resend account as company emails but through a dedicated Bivro-owned sender identity — `noreply@mail.bivro.io` (or `platform@bivro.io`). This sender is a `bivro_managed` tier identity in the `email_sender_identities` table, scoped to `company_id = NULL` (platform-owned, not tenant-owned).

**Platform email types (V1):**

| Event | Recipient | Template |
|-------|-----------|----------|
| Trial expiry warning (3 days) | Company owner | `platform-trial-expiry-warning` |
| Trial expired — account paused | Company owner | `platform-trial-expired` |
| Subscription activated | Company owner | `platform-subscription-activated` |
| Subscription cancelled | Company owner | `platform-subscription-cancelled` |
| Payment failed | Company owner | `platform-payment-failed` |
| Support session started | Company owner | `platform-support-session-started` |
| Support session ended | Company owner | `platform-support-session-ended` |
| New user invitation | Invitee | `user-invite` (sent from company sender, not platform sender) |
| Password reset | Any user | Supabase Auth built-in (not routed through Resend) |

**Implementation:** Platform email dispatch is handled by a dedicated server action (`/api/platform/email`) called by platform admin operations and Vercel Cron jobs. It uses the Resend SDK with the Bivro platform sender identity. It is NOT routed through the company's `email_automations` system — platform emails are always direct sends, never queued in automation runs.

**Authentication emails** (password reset, magic link, email verification) are handled by Supabase Auth's built-in email delivery (configured with the Bivro Resend SMTP credentials) and are not customizable per company in V1.

---

## 14. Cross-Document Inconsistencies Resolved

This section documents all contradictions discovered between this document and the existing architecture documentation, and how they are resolved. The resolution listed here is authoritative.

---

### Inconsistency 1 — Subscription Tier Naming ✅ RESOLVED

**Location:** `DATABASE_ARCHITECTURE.md` — `subscription_tier` ENUM definition

**Original inconsistency:** `DATABASE_ARCHITECTURE.md` previously defined the ENUM as `('free', 'pro', 'business', 'enterprise')`, missing the `'starter'` value introduced by this document.

**Resolution applied:** `DATABASE_ARCHITECTURE.md` now defines:
```sql
CREATE TYPE subscription_tier AS ENUM (
  'free',
  'starter',
  'pro',
  'business',
  'enterprise'
);
```

All five canonical values are present. `'custom'` was intentionally not added — custom contracts use `'enterprise'` with limits managed via `company_subscription_overrides`. The product display name "Professional" maps to the DB value `'pro'`; the UI must always show "Professional" while the database stores `'pro'`.

---

### Inconsistency 2 — Admin Dashboard Location

**Location:** `ARCHITECTURE.md` Section 19, line 1454  
**Current state:** *"Displayed in an internal Bivro ops dashboard (a protected `/admin` route in the Next.js app)."*

**Issue:** This implies the platform admin dashboard is part of the same Next.js application as the company portal, protected by a route prefix. This creates a risk: a misconfigured RLS policy or middleware bug could expose admin routes to company users on the same application domain.

**Resolution:**  
In V1, the admin portal is implemented as a protected route group at `/admin/*` in the same Next.js application, accessible only at `admin.bivro.io` via a Vercel domain binding. The middleware layer rejects all requests to `/admin/*` that do not originate from `admin.bivro.io` and do not carry a valid platform admin session cookie. This provides logical separation without the operational overhead of a separate deployment in V1.

In V2+, the platform admin portal is extracted to a separate Next.js application with its own Vercel deployment, its own environment variables, and no shared code with the company portal. This eliminates any theoretical risk of cross-contamination.

**No change needed to `ARCHITECTURE.md`.** The description is accurate for V1. This document adds the routing constraint (domain-binding + middleware rejection) that was previously implicit.

---

### Inconsistency 3 — `user_invitations` Table

**Location:** `ARCHITECTURE.md` Section 7 (Auth flow)  
**Current state:** The invite flow is described but the `user_invitations` table schema is not formally defined anywhere.

**Resolution:**  
The canonical `user_invitations` schema is now defined in Section 11.13 of this document. `DATABASE_ARCHITECTURE.md` should be updated to include this table in Section 6 (Core Tables) and reference it in Section 7 (Entity Relationships).

---

### Inconsistency 4 — `platform_audit_log` naming ✅ RESOLVED

**Location:** `AI_ENGINE.md` Section 18.8 previously used `platform_admin_audit_log`. This document uses `platform_audit_log`.

**Resolution (applied):**  
The canonical table name is **`platform_audit_log`** (this document, Section 11.12). `AI_ENGINE.md` has been updated — all five instances of `platform_admin_audit_log` have been renamed to `platform_audit_log`. No further action required.

This is a different table from `activity_logs`. Their separation is intentional:

| Table | Purpose | Actors | Retention |
|-------|---------|--------|----------|
| `activity_logs` | Company-side business events (who created a quote, who sent an email) | Company users (Owner + Office) | Per company data retention policy |
| `platform_audit_log` | Platform-side admin actions (who suspended a company, who changed a subscription) | Bivro platform staff only | 7 years, minimum |

---

*This document governs how Bivro operates as a software company. The customer-facing product is defined in `PRODUCT_REQUIREMENTS.md`. The AI layer is defined in `AI_ENGINE.md`. The database is defined in `DATABASE_ARCHITECTURE.md`. These four documents form the complete pre-implementation specification for Bivro V1.*
