-- =============================================================
-- Migration 023: Security patch — narrow authenticated grants
-- =============================================================
-- Migration 022 applied a broad GRANT SELECT, INSERT, UPDATE, DELETE
-- ON ALL TABLES IN SCHEMA public TO authenticated. That unblocked PostgREST
-- operations correctly, but it is wider than least privilege requires.
--
-- This migration applies targeted revocations and explicit deny policies:
--
-- CHANGES:
--
--   1. Platform-admin tables (6 tables)
--      Revoke ALL DML from authenticated + add RESTRICTIVE deny policy.
--      These tables store Platform Admin credentials, roles, and sessions.
--      No tenant user must ever access them. Default-deny from empty RLS
--      policies already blocks reads, but REVOKE + RESTRICTIVE policy gives
--      belt-and-suspenders protection: even an accidental future permissive
--      policy cannot override a RESTRICTIVE USING(false).
--
--   2. Platform system tables (platform_audit_log, platform_metric_snapshots,
--      platform_support_sessions)
--      Same treatment as platform-admin tables.
--
--   3. domain_events — DROP INSERT policy + REVOKE write
--      The domain_events_insert policy from migration 018 allows authenticated
--      users to insert company-scoped domain events. This is wrong: domain
--      events are written exclusively by service_role server operations.
--      Allowing authenticated users to insert arbitrary events could corrupt
--      the application event stream. Drop the policy and revoke write access.
--      The SELECT policy is intentionally retained (tenants may read their
--      own events for audit trail display).
--
--   4. Service-managed append-only tables
--      activity_logs, email_logs, metric_snapshots, email_automation_runs,
--      ai_logs, notifications: no INSERT/UPDATE/DELETE RLS policy exists for
--      authenticated (already blocked by default-deny), but the privilege grant
--      from migration 022 remains. Revoke writes to prevent accidental exposure
--      if a future policy is added carelessly.
--
--   5. ALTER DEFAULT PRIVILEGES for authenticated — REVOKED
--      Future migrations adding tables must explicitly GRANT to authenticated.
--      service_role retains its broad ALTER DEFAULT PRIVILEGES (appropriate
--      since it is server-side only and bypasses RLS regardless).
--
--   6. Anon — revoke unnecessary DDL-adjacent privileges
--      TRIGGER, TRUNCATE, REFERENCES grants on all tables are removed.
--      TRUNCATE is dangerous in principle; none are needed via PostgREST.
--
-- TABLES INTENTIONALLY UNCHANGED:
--
--   document_templates:
--     SELECT USING (auth.role() = 'authenticated') — CORRECT.
--     document_templates holds SYSTEM-WIDE PDF/legal boilerplate (no company_id).
--     All tenants need to read these to generate company documents. Platform
--     Admin manages writes via service_role. No cross-tenant data present.
--
--   permission_definitions:
--     SELECT USING (auth.role() = 'authenticated') — CORRECT.
--     Global lookup table: what named permissions exist in the system.
--     Read-only for authenticated, no sensitive data exposed.
--
--   subscription_plans, subscription_plan_features:
--     SELECT USING (auth.role() = 'authenticated') — CORRECT.
--     Pricing catalog. All tenants may read plan definitions. Read-only.
--
--   domain_events SELECT:
--     SELECT USING (company_id = auth_company_id()) — CORRECT.
--     Tenants may read their own company's events (audit trail). Retained.
--
--   ai_communication_memory INSERT + UPDATE:
--     Retained. Policies exist and are company-scoped. Application may write
--     via authenticated context for user-initiated memory operations.
--
-- SECURITY INVARIANTS:
--   • service_role: all grants retained (BYPASSRLS, server-side only)
--   • RLS remains the primary row-isolation mechanism
--   • No completed migration is modified
--   • No RLS policy is weakened — only writes tightened or explicit denials added
-- =============================================================

-- ── 1. Platform-admin tables — REVOKE ALL + RESTRICTIVE deny ────────────────

REVOKE ALL ON TABLE public.platform_admin_users
    FROM authenticated;
REVOKE ALL ON TABLE public.platform_admin_roles
    FROM authenticated;
REVOKE ALL ON TABLE public.platform_admin_role_permissions
    FROM authenticated;
REVOKE ALL ON TABLE public.platform_admin_sessions
    FROM authenticated;
REVOKE ALL ON TABLE public.platform_admin_permission_overrides
    FROM authenticated;
REVOKE ALL ON TABLE public.platform_admin_user_roles
    FROM authenticated;

CREATE POLICY "deny_authenticated"
    ON public.platform_admin_users
    AS RESTRICTIVE FOR ALL TO authenticated
    USING (false) WITH CHECK (false);

CREATE POLICY "deny_authenticated"
    ON public.platform_admin_roles
    AS RESTRICTIVE FOR ALL TO authenticated
    USING (false) WITH CHECK (false);

CREATE POLICY "deny_authenticated"
    ON public.platform_admin_role_permissions
    AS RESTRICTIVE FOR ALL TO authenticated
    USING (false) WITH CHECK (false);

CREATE POLICY "deny_authenticated"
    ON public.platform_admin_sessions
    AS RESTRICTIVE FOR ALL TO authenticated
    USING (false) WITH CHECK (false);

CREATE POLICY "deny_authenticated"
    ON public.platform_admin_permission_overrides
    AS RESTRICTIVE FOR ALL TO authenticated
    USING (false) WITH CHECK (false);

CREATE POLICY "deny_authenticated"
    ON public.platform_admin_user_roles
    AS RESTRICTIVE FOR ALL TO authenticated
    USING (false) WITH CHECK (false);

-- ── 2. Platform system tables — REVOKE ALL + RESTRICTIVE deny ───────────────

REVOKE ALL ON TABLE public.platform_audit_log        FROM authenticated;
REVOKE ALL ON TABLE public.platform_metric_snapshots FROM authenticated;
REVOKE ALL ON TABLE public.platform_support_sessions FROM authenticated;

CREATE POLICY "deny_authenticated"
    ON public.platform_audit_log
    AS RESTRICTIVE FOR ALL TO authenticated
    USING (false) WITH CHECK (false);

CREATE POLICY "deny_authenticated"
    ON public.platform_metric_snapshots
    AS RESTRICTIVE FOR ALL TO authenticated
    USING (false) WITH CHECK (false);

CREATE POLICY "deny_authenticated"
    ON public.platform_support_sessions
    AS RESTRICTIVE FOR ALL TO authenticated
    USING (false) WITH CHECK (false);

-- ── 3. domain_events — DROP INSERT policy + REVOKE write access ─────────────

DROP POLICY IF EXISTS domain_events_insert ON public.domain_events;

REVOKE INSERT, UPDATE, DELETE ON TABLE public.domain_events FROM authenticated;

-- ── 4. Append-only / service-managed tables — REVOKE write access ───────────

-- activity_logs: written by triggers and service_role. Authenticated may
-- SELECT (company_id = auth_company_id() RLS policy retained).
REVOKE INSERT, UPDATE, DELETE ON TABLE public.activity_logs    FROM authenticated;

-- email_logs: written by email service (service_role). SELECT retained.
REVOKE INSERT, UPDATE, DELETE ON TABLE public.email_logs       FROM authenticated;

-- metric_snapshots: written by cron jobs (service_role). SELECT retained.
REVOKE INSERT, UPDATE, DELETE ON TABLE public.metric_snapshots FROM authenticated;

-- email_automation_runs: written by automation engine (service_role). SELECT retained.
REVOKE INSERT, UPDATE, DELETE ON TABLE public.email_automation_runs FROM authenticated;

-- ai_logs: written by AI service (service_role). SELECT retained.
REVOKE INSERT, UPDATE, DELETE ON TABLE public.ai_logs FROM authenticated;

-- notifications: created by the system (service_role). Authenticated may UPDATE
-- (mark as read — UPDATE RLS policy exists). INSERT/DELETE revoked.
REVOKE INSERT, DELETE ON TABLE public.notifications FROM authenticated;

-- ── 5. Remove ALTER DEFAULT PRIVILEGES for authenticated ─────────────────────
-- New tables added by future migrations will NOT automatically receive
-- SELECT, INSERT, UPDATE, DELETE for authenticated. Each migration that adds
-- a tenant-accessible table must include an explicit GRANT.

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
    REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLES FROM authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
    REVOKE USAGE, SELECT ON SEQUENCES FROM authenticated;

-- ── 6. Anon — revoke unnecessary DDL-adjacent privileges ────────────────────

REVOKE REFERENCES, TRIGGER, TRUNCATE ON ALL TABLES IN SCHEMA public FROM anon;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
    REVOKE REFERENCES, TRIGGER, TRUNCATE ON TABLES FROM anon;
