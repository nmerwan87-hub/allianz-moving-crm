-- =============================================================
-- Migration 022: Grant DML privileges to service_role and authenticated
-- =============================================================
-- Root cause: every application migration runs as the postgres role.
-- postgres's DEFAULT PRIVILEGES for new tables grant only
-- TRUNCATE, REFERENCES, TRIGGER (Dxtm) to service_role, authenticated,
-- and anon — NOT SELECT, INSERT, UPDATE, or DELETE.
--
-- Tables created by supabase_admin (Supabase internal tables) get the
-- full arwdDxtm ACL automatically; our 53 application tables do not.
--
-- This migration fixes the gap:
--   1. Grants SELECT, INSERT, UPDATE, DELETE on all existing public tables
--      to service_role and authenticated.
--   2. Alters default privileges so tables created by postgres in future
--      migrations automatically receive these grants.
--   3. Grants USAGE, SELECT on sequences for serial/identity columns.
--
-- Security invariants maintained:
--   • service_role is server-side only. It already has rolbypassrls=true;
--     granting DML enables functionality — it is NOT a privilege escalation.
--     Application code (tRPC procedures, API routes) enforces authorization
--     above the DB layer for all service_role calls.
--   • authenticated users remain governed by RLS (migration 018).
--     platform_admin_* tables have RLS ENABLED with NO permissive policies,
--     so authenticated users cannot access those rows despite having DML
--     grants on the tables.
--   • anon role receives no new privileges.
--   • No existing RLS policy is modified.
--   • No completed migration is modified.
-- =============================================================

-- ── 1. Existing tables ──────────────────────────────────────────────────────

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;

-- Sequences (for serial/identity columns and gen_random_uuid fallbacks)
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- ── 2. Default privileges for tables created by postgres in future ───────────
-- Ensures any table added in a future migration (which runs as postgres)
-- automatically inherits these grants without an additional migration.

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO authenticated;
