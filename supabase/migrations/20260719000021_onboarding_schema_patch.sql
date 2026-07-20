-- =============================================================
-- Migration 021: Onboarding Schema Patch (Sprint 2 Patch)
-- =============================================================
-- Required before Sprint 3 (IAM Module) can be implemented.
-- All schema decisions are specified in:
--   docs/ONBOARDING_ARCHITECTURE.md §9
--   docs/DATABASE_ARCHITECTURE.md §5, §6.1, §6.28
--   docs/MASTER_BOOTSTRAP.md §47
--
-- This migration is backward-compatible:
--   • All new columns are nullable or carry a DEFAULT.
--   • Existing companies rows receive company_status = 'active'.
--   • No existing columns, constraints, or policies are removed.
--   • No existing migrations are modified.
--
-- SECURITY INVARIANTS — unchanged from prior migrations:
--   • public.auth_company_id() and public.auth_user_role() are NEVER
--     recreated here. They live in migration 001 and are stable.
--   • custom_access_token_hook is REPLACED (CREATE OR REPLACE), not dropped.
--   • Tenant isolation is maintained. No RLS policy is weakened.
--   • Service-role key is never exposed. service_role bypasses RLS.
-- =============================================================

-- =============================================================
-- 1. New Enum: company_status
-- =============================================================
-- Tracks operational lifecycle of a company.
-- Orthogonal to subscription_status (billing state).
-- Full state machine: ONBOARDING_ARCHITECTURE.md §1.

CREATE TYPE company_status AS ENUM (
  'pending_email_verification',  -- registered; owner email not yet confirmed
  'pending_review',              -- email confirmed; awaiting Platform Admin approval
  'active',                      -- approved and fully operational
  'suspended',                   -- temporarily blocked (non-payment or policy violation)
  'rejected',                    -- registration rejected; never activated
  'archived'                     -- churned; data retained, all access blocked
);

-- =============================================================
-- 2. New Columns on companies
-- =============================================================
-- All additions use ADD COLUMN. No existing column is removed or
-- altered. Every new NOT NULL column carries a DEFAULT so existing
-- rows remain valid without a backfill.

-- 2a. Operational lifecycle status
-- DEFAULT 'active' applies to all existing Sprint 2 development rows.
-- New rows created via the registration form start at
-- 'pending_email_verification' (set by the application, not the DB default).
ALTER TABLE companies
  ADD COLUMN company_status company_status NOT NULL DEFAULT 'active';

-- 2b. Legal identity
ALTER TABLE companies
  ADD COLUMN legal_name            text,
  ADD COLUMN trading_name          text,
  ADD COLUMN registration_number   text,
  ADD COLUMN vat_number            text;

-- 2c. Banking (displayed on invoice payment instructions)
ALTER TABLE companies
  ADD COLUMN bank_name             text,
  ADD COLUMN bank_iban             text,
  ADD COLUMN bank_bic              text,
  ADD COLUMN bank_payee_name       text;

-- 2d. Branding
ALTER TABLE companies
  ADD COLUMN accent_color          text;
-- Hex color code (e.g., '#1E40AF'). NULL → Bivro default palette.

-- 2e. Stripe
ALTER TABLE companies
  ADD COLUMN stripe_subscription_id text;
-- Stripe subscription object ID (sub_...).
-- NULL until Owner initiates a paid subscription (Sprint 6: Payments).
-- stripe_customer_id already exists from migration 002.

-- 2f. Platform management flags
ALTER TABLE companies
  ADD COLUMN is_demo               boolean   NOT NULL DEFAULT false,
  ADD COLUMN suspended_reason      text,
  ADD COLUMN suspended_at          timestamptz,
  ADD COLUMN suspended_by          text;
-- suspended_by holds platform_admin_users.id as text.
-- No FK enforced — platform_admin_users is in a separate schema boundary.

-- 2g. Registration and approval tracking
-- All nullable: existing rows never went through the registration flow.
ALTER TABLE companies
  ADD COLUMN registration_ip            inet,
  ADD COLUMN terms_accepted_at          timestamptz,
  ADD COLUMN terms_version              text,
  ADD COLUMN privacy_policy_accepted_at timestamptz,
  ADD COLUMN privacy_policy_version     text,
  ADD COLUMN reviewed_at               timestamptz,
  ADD COLUMN reviewed_by               text,
  ADD COLUMN review_notes              text,
  ADD COLUMN rejection_reason          text,
  ADD COLUMN rejected_at               timestamptz,
  ADD COLUMN more_info_requested_at    timestamptz;
-- reviewed_by holds platform_admin_users.id as text. No FK enforced.
-- review_notes is internal — never sent to the registrant.
-- rejection_reason is internal — never sent verbatim to the registrant.

-- =============================================================
-- 3. New Table: company_email_domains
-- =============================================================
-- Maps email domains to companies for tenant routing.
-- Used at login: domain portion of email → look up company_id.
-- Full spec: ONBOARDING_ARCHITECTURE.md §9.3.
-- All lookups from the unauthenticated login page use service_role.

CREATE TABLE company_email_domains (
  id                uuid          PRIMARY KEY DEFAULT gen_uuid_v7(),
  company_id        uuid          NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  domain            text          NOT NULL,
  is_primary        boolean       NOT NULL DEFAULT false,
  verified_at       timestamptz,
  -- NULL = self-declared (unverified). Non-null = DNS TXT verified (V2+).
  -- V1: all entries are self-declared.
  created_at        timestamptz   NOT NULL DEFAULT now(),

  CONSTRAINT company_email_domains_format
    CHECK (domain ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$')
);

-- A domain may only be registered to one company at a time.
CREATE UNIQUE INDEX idx_company_email_domains_domain
  ON company_email_domains(domain);

-- Standard company-scoped lookup.
CREATE INDEX idx_company_email_domains_company
  ON company_email_domains(company_id);

-- =============================================================
-- 4. RLS on company_email_domains
-- =============================================================

ALTER TABLE company_email_domains ENABLE ROW LEVEL SECURITY;

-- SELECT: any authenticated user in the same company
CREATE POLICY "company_email_domains_select" ON company_email_domains
  FOR SELECT USING (company_id = public.auth_company_id());

-- INSERT / UPDATE / DELETE: owner only
CREATE POLICY "company_email_domains_insert" ON company_email_domains
  FOR INSERT WITH CHECK (
    company_id = public.auth_company_id()
    AND public.auth_user_role() = 'owner'
  );

CREATE POLICY "company_email_domains_update" ON company_email_domains
  FOR UPDATE USING (
    company_id = public.auth_company_id()
    AND public.auth_user_role() = 'owner'
  );

CREATE POLICY "company_email_domains_delete" ON company_email_domains
  FOR DELETE USING (
    company_id = public.auth_company_id()
    AND public.auth_user_role() = 'owner'
  );

-- =============================================================
-- 5. Indexes on companies for new columns
-- =============================================================

-- Approval queue query: Platform Admin sees pending_review companies.
CREATE INDEX idx_companies_company_status
  ON companies(company_status)
  WHERE deleted_at IS NULL;

-- Ordered approval queue (oldest first).
CREATE INDEX idx_companies_pending_review
  ON companies(created_at)
  WHERE company_status = 'pending_review';

-- Exclude demo companies from revenue/usage metric queries.
CREATE INDEX idx_companies_is_demo
  ON companies(is_demo)
  WHERE is_demo = true;

-- =============================================================
-- 6. Updated custom_access_token_hook
-- =============================================================
-- Replaces the function from migration 019 (CREATE OR REPLACE).
-- The prior grants and revokes remain in effect.
-- Change: also reads company_status from companies (via JOIN on profiles)
-- and injects it into JWT app_metadata alongside company_id and role.
--
-- Next.js middleware reads app_metadata.company_status to route
-- non-active companies to status-specific pages before the dashboard
-- is reached. See ONBOARDING_ARCHITECTURE.md §1.4.
--
-- SECURITY: same constraints as migration 019 —
--   SECURITY DEFINER; SET search_path; grant to supabase_auth_admin only.

CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_user_id        uuid;
  v_company_id     uuid;
  v_role           text;
  v_company_status text;
  v_claims         jsonb;
BEGIN
  -- Extract the authenticated user's UUID from the hook event.
  v_user_id := (event ->> 'user_id')::uuid;

  -- Look up the user's tenant, role, and company operational status.
  -- JOIN companies to read company_status in a single round-trip.
  SELECT p.company_id, p.role::text, c.company_status::text
    INTO v_company_id, v_role, v_company_status
    FROM public.profiles p
    JOIN public.companies c ON c.id = p.company_id
   WHERE p.id = v_user_id
     AND p.deleted_at IS NULL
     AND p.is_active  = true;

  -- Build the claims object, preserving all existing claims.
  v_claims := event -> 'claims';

  IF v_company_id IS NOT NULL THEN
    -- Inject company_id, role, and company_status into app_metadata.
    -- company_status is read by Next.js middleware to route users:
    --   active                     → dashboard
    --   pending_email_verification → /verify-email
    --   pending_review             → /pending-approval
    --   suspended                  → /suspended
    --   rejected                   → /rejected
    --   archived                   → /archived
    v_claims := jsonb_set(
      v_claims,
      '{app_metadata}',
      COALESCE(v_claims -> 'app_metadata', '{}'::jsonb)
        || jsonb_build_object(
             'company_id',     v_company_id,
             'role',           v_role,
             'company_status', v_company_status
           )
    );
  END IF;
  -- If no profile found (e.g., platform admin or incomplete signup),
  -- return claims unchanged — the middleware will handle the rejection.

  RETURN jsonb_build_object('claims', v_claims);
END;
$$;

-- Grant SELECT on companies to supabase_auth_admin so the JOIN
-- in the hook above can resolve company_status.
-- (SELECT on profiles was already granted in migration 019.)
GRANT SELECT ON TABLE public.companies TO supabase_auth_admin;

-- The existing GRANT EXECUTE and REVOKE from migration 019 remain
-- in effect. Re-assert them here defensively in case of re-application.
GRANT USAGE  ON SCHEMA public TO supabase_auth_admin;
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook TO supabase_auth_admin;
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook FROM authenticated, anon;
