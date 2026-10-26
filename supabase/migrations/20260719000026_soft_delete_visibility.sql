-- =============================================================
-- Migration 026: Soft-delete visibility
-- =============================================================
-- Problem: users could not archive (soft-delete) anything.
--
-- The SELECT policies from migration 018 hide archived rows with
-- `deleted_at IS NULL`. PostgreSQL requires the new row of an UPDATE to
-- satisfy the table's SELECT policies as well whenever the UPDATE reads
-- columns (e.g. `WHERE id = …`). Setting deleted_at therefore produced
-- "new row violates row-level security policy" for every user-initiated
-- archive on these 15 tables.
--
-- Fix: SELECT policies only enforce tenant isolation. Hiding archived
-- rows is the query's job — every application query already filters
-- `deleted_at IS NULL` explicitly — and archived rows stay readable
-- within their own company for restore and history.
--
-- profiles_select (migration 024) is unchanged: profiles are never
-- archived by users, and deleted people should not be listed.
-- =============================================================

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'customers', 'leads', 'appointments', 'quotes', 'jobs',
    'employees', 'vehicles', 'service_catalog', 'permission_groups',
    'invoices', 'payments', 'documents', 'tasks',
    'email_sender_identities', 'email_templates'
  ] LOOP
    EXECUTE format('DROP POLICY %I ON %I', t || '_select', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR SELECT USING (company_id = public.auth_company_id())',
      t || '_select', t);
  END LOOP;
END;
$$;
