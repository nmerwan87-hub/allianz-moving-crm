-- =============================================================
-- Migration 018: Row Level Security — Enable + Policies
-- =============================================================
-- Order: 1) ENABLE RLS on all tables
--        2) SELECT policies
--        3) INSERT policies
--        4) UPDATE policies
--        5) DELETE policies
-- Requires: public.auth_company_id() and public.auth_user_role()
-- created in migration 001.
-- Platform tables (platform_admin_*) have no RLS — they are
-- accessible only via service_role from server code.
-- =============================================================

-- ─── Enable RLS on all tenant tables ────────────────────────

ALTER TABLE companies                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads                        ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE quotes                       ENABLE ROW LEVEL SECURITY;
ALTER TABLE quote_items                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE quote_versions               ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_quote_recommendations     ENABLE ROW LEVEL SECURITY;
ALTER TABLE jobs                         ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_assignments              ENABLE ROW LEVEL SECURITY;
ALTER TABLE employees                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicles                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_catalog              ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_settings             ENABLE ROW LEVEL SECURITY;
ALTER TABLE permission_definitions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE permission_groups            ENABLE ROW LEVEL SECURITY;
ALTER TABLE permission_group_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_permission_groups       ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_permission_overrides    ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_invitations             ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_items                ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_templates           ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks                        ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications                ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_logs                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_logs                      ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_logs                ENABLE ROW LEVEL SECURITY;
ALTER TABLE domain_events                ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_sender_identities      ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_templates              ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_template_versions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_automations            ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_automation_runs        ENABLE ROW LEVEL SECURITY;
ALTER TABLE communication_preferences    ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_communication_memory      ENABLE ROW LEVEL SECURITY;
ALTER TABLE metric_snapshots             ENABLE ROW LEVEL SECURITY;

-- Platform tables: enable RLS with NO policies.
-- RLS blocks anon + authenticated; service_role (used by admin portal)
-- bypasses RLS entirely and retains full access.
-- This is intentional — these tables are exclusively accessed via
-- service_role from server code at admin.bivro.io.
ALTER TABLE platform_admin_users             ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_admin_roles             ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_admin_role_permissions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_admin_user_roles        ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_admin_permission_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_admin_sessions          ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_support_sessions        ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_audit_log               ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_metric_snapshots        ENABLE ROW LEVEL SECURITY;

-- subscription_plans + subscription_plan_features: global reference data.
-- Company users need SELECT to check their tier limits and features.
ALTER TABLE subscription_plans               ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscription_plan_features       ENABLE ROW LEVEL SECURITY;

-- company_subscription_overrides + company_feature_overrides:
-- Platform-managed but company-scoped. Company owner can read their own.
ALTER TABLE company_subscription_overrides   ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_feature_overrides        ENABLE ROW LEVEL SECURITY;

-- =============================================================
-- SELECT Policies
-- =============================================================

-- companies — own row only
CREATE POLICY "companies_select" ON companies
  FOR SELECT USING (public.auth_company_id() = id);

-- profiles — same company, exclude soft-deleted
CREATE POLICY "profiles_select" ON profiles
  FOR SELECT USING (
    company_id = public.auth_company_id()
    AND deleted_at IS NULL
  );

-- customers
CREATE POLICY "customers_select" ON customers
  FOR SELECT USING (
    company_id = public.auth_company_id()
    AND deleted_at IS NULL
  );

-- leads
CREATE POLICY "leads_select" ON leads
  FOR SELECT USING (
    company_id = public.auth_company_id()
    AND deleted_at IS NULL
  );

-- appointments
CREATE POLICY "appointments_select" ON appointments
  FOR SELECT USING (
    company_id = public.auth_company_id()
    AND deleted_at IS NULL
  );

-- quotes
CREATE POLICY "quotes_select" ON quotes
  FOR SELECT USING (
    company_id = public.auth_company_id()
    AND deleted_at IS NULL
  );

-- quote_items — no soft delete; visible if parent quote is same company
CREATE POLICY "quote_items_select" ON quote_items
  FOR SELECT USING (company_id = public.auth_company_id());

-- quote_versions — append-only; same company
CREATE POLICY "quote_versions_select" ON quote_versions
  FOR SELECT USING (company_id = public.auth_company_id());

-- ai_quote_recommendations
CREATE POLICY "ai_quote_recommendations_select" ON ai_quote_recommendations
  FOR SELECT USING (company_id = public.auth_company_id());

-- jobs
CREATE POLICY "jobs_select" ON jobs
  FOR SELECT USING (
    company_id = public.auth_company_id()
    AND deleted_at IS NULL
  );

-- job_assignments
CREATE POLICY "job_assignments_select" ON job_assignments
  FOR SELECT USING (company_id = public.auth_company_id());

-- employees
CREATE POLICY "employees_select" ON employees
  FOR SELECT USING (
    company_id = public.auth_company_id()
    AND deleted_at IS NULL
  );

-- vehicles
CREATE POLICY "vehicles_select" ON vehicles
  FOR SELECT USING (
    company_id = public.auth_company_id()
    AND deleted_at IS NULL
  );

-- service_catalog
CREATE POLICY "service_catalog_select" ON service_catalog
  FOR SELECT USING (
    company_id = public.auth_company_id()
    AND deleted_at IS NULL
  );

-- company_settings — own company only
CREATE POLICY "company_settings_select" ON company_settings
  FOR SELECT USING (company_id = public.auth_company_id());

-- permission_definitions — any authenticated user (system read-only)
CREATE POLICY "permission_definitions_select" ON permission_definitions
  FOR SELECT USING (auth.role() = 'authenticated');

-- permission_groups
CREATE POLICY "permission_groups_select" ON permission_groups
  FOR SELECT USING (
    company_id = public.auth_company_id()
    AND deleted_at IS NULL
  );

-- permission_group_assignments
CREATE POLICY "permission_group_assignments_select" ON permission_group_assignments
  FOR SELECT USING (company_id = public.auth_company_id());

-- user_permission_groups
CREATE POLICY "user_permission_groups_select" ON user_permission_groups
  FOR SELECT USING (company_id = public.auth_company_id());

-- user_permission_overrides — owner only
CREATE POLICY "user_permission_overrides_select" ON user_permission_overrides
  FOR SELECT USING (
    company_id = public.auth_company_id()
    AND public.auth_user_role() = 'owner'
  );

-- user_invitations — owner only
CREATE POLICY "user_invitations_select" ON user_invitations
  FOR SELECT USING (
    company_id = public.auth_company_id()
    AND public.auth_user_role() = 'owner'
  );

-- invoices
CREATE POLICY "invoices_select" ON invoices
  FOR SELECT USING (
    company_id = public.auth_company_id()
    AND deleted_at IS NULL
  );

-- invoice_items
CREATE POLICY "invoice_items_select" ON invoice_items
  FOR SELECT USING (company_id = public.auth_company_id());

-- payments
CREATE POLICY "payments_select" ON payments
  FOR SELECT USING (
    company_id = public.auth_company_id()
    AND deleted_at IS NULL
  );

-- documents
CREATE POLICY "documents_select" ON documents
  FOR SELECT USING (
    company_id = public.auth_company_id()
    AND deleted_at IS NULL
  );

-- document_templates — any authenticated user (read-only; no tenant scoping)
CREATE POLICY "document_templates_select" ON document_templates
  FOR SELECT USING (auth.role() = 'authenticated');

-- tasks
CREATE POLICY "tasks_select" ON tasks
  FOR SELECT USING (
    company_id = public.auth_company_id()
    AND deleted_at IS NULL
  );

-- notifications — own user_id only
CREATE POLICY "notifications_select" ON notifications
  FOR SELECT USING (
    user_id = auth.uid()
    AND company_id = public.auth_company_id()
  );

-- email_logs — same company (read-only for users; writes via service_role)
CREATE POLICY "email_logs_select" ON email_logs
  FOR SELECT USING (company_id = public.auth_company_id());

-- ai_logs — same company
CREATE POLICY "ai_logs_select" ON ai_logs
  FOR SELECT USING (company_id = public.auth_company_id());

-- activity_logs — same company
CREATE POLICY "activity_logs_select" ON activity_logs
  FOR SELECT USING (company_id = public.auth_company_id());

-- domain_events — same company
CREATE POLICY "domain_events_select" ON domain_events
  FOR SELECT USING (company_id = public.auth_company_id());

-- email_sender_identities
CREATE POLICY "email_sender_identities_select" ON email_sender_identities
  FOR SELECT USING (
    company_id = public.auth_company_id()
    AND deleted_at IS NULL
  );

-- email_templates
CREATE POLICY "email_templates_select" ON email_templates
  FOR SELECT USING (
    company_id = public.auth_company_id()
    AND deleted_at IS NULL
  );

-- email_template_versions — append-only; same company
CREATE POLICY "email_template_versions_select" ON email_template_versions
  FOR SELECT USING (company_id = public.auth_company_id());

-- email_automations
CREATE POLICY "email_automations_select" ON email_automations
  FOR SELECT USING (company_id = public.auth_company_id());

-- email_automation_runs — append-only; same company
CREATE POLICY "email_automation_runs_select" ON email_automation_runs
  FOR SELECT USING (company_id = public.auth_company_id());

-- communication_preferences
CREATE POLICY "communication_preferences_select" ON communication_preferences
  FOR SELECT USING (company_id = public.auth_company_id());

-- ai_communication_memory
CREATE POLICY "ai_communication_memory_select" ON ai_communication_memory
  FOR SELECT USING (company_id = public.auth_company_id());

-- metric_snapshots
CREATE POLICY "metric_snapshots_select" ON metric_snapshots
  FOR SELECT USING (company_id = public.auth_company_id());

-- subscription_plans — any authenticated user (global reference data)
CREATE POLICY "subscription_plans_select" ON subscription_plans
  FOR SELECT USING (auth.role() = 'authenticated');

-- subscription_plan_features — any authenticated user
CREATE POLICY "subscription_plan_features_select" ON subscription_plan_features
  FOR SELECT USING (auth.role() = 'authenticated');

-- company_subscription_overrides — owner of the company can read their own overrides
CREATE POLICY "company_subscription_overrides_select" ON company_subscription_overrides
  FOR SELECT USING (
    company_id = public.auth_company_id()
    AND public.auth_user_role() = 'owner'
  );

-- company_feature_overrides — owner of the company
CREATE POLICY "company_feature_overrides_select" ON company_feature_overrides
  FOR SELECT USING (
    company_id = public.auth_company_id()
    AND public.auth_user_role() = 'owner'
  );

-- platform_admin_* tables: NO policies. service_role bypasses RLS.
-- anon + authenticated get zero rows (default deny with RLS enabled + no policy).

-- =============================================================
-- INSERT Policies
-- company_id must always come from the JWT — never trusted from
-- user input. Use WITH CHECK to enforce.
-- =============================================================

-- profiles — no INSERT policy; created via auth hook (service_role)

-- customers — authenticated users in the company
CREATE POLICY "customers_insert" ON customers
  FOR INSERT WITH CHECK (company_id = public.auth_company_id());

-- leads
CREATE POLICY "leads_insert" ON leads
  FOR INSERT WITH CHECK (company_id = public.auth_company_id());

-- appointments
CREATE POLICY "appointments_insert" ON appointments
  FOR INSERT WITH CHECK (company_id = public.auth_company_id());

-- quotes
CREATE POLICY "quotes_insert" ON quotes
  FOR INSERT WITH CHECK (company_id = public.auth_company_id());

-- quote_items
CREATE POLICY "quote_items_insert" ON quote_items
  FOR INSERT WITH CHECK (company_id = public.auth_company_id());

-- quote_versions — append-only; same company
CREATE POLICY "quote_versions_insert" ON quote_versions
  FOR INSERT WITH CHECK (company_id = public.auth_company_id());

-- ai_quote_recommendations — system only (service_role bypasses RLS, no INSERT policy)

-- jobs
CREATE POLICY "jobs_insert" ON jobs
  FOR INSERT WITH CHECK (company_id = public.auth_company_id());

-- job_assignments
CREATE POLICY "job_assignments_insert" ON job_assignments
  FOR INSERT WITH CHECK (company_id = public.auth_company_id());

-- employees
CREATE POLICY "employees_insert" ON employees
  FOR INSERT WITH CHECK (company_id = public.auth_company_id());

-- vehicles
CREATE POLICY "vehicles_insert" ON vehicles
  FOR INSERT WITH CHECK (company_id = public.auth_company_id());

-- service_catalog
CREATE POLICY "service_catalog_insert" ON service_catalog
  FOR INSERT WITH CHECK (company_id = public.auth_company_id());

-- company_settings — no INSERT; created with company by hook (service_role)

-- permission_definitions — no INSERT (system table, seeded in migration 020)

-- permission_groups — owner only
CREATE POLICY "permission_groups_insert" ON permission_groups
  FOR INSERT WITH CHECK (
    company_id = public.auth_company_id()
    AND public.auth_user_role() = 'owner'
  );

-- permission_group_assignments — owner only
CREATE POLICY "permission_group_assignments_insert" ON permission_group_assignments
  FOR INSERT WITH CHECK (
    company_id = public.auth_company_id()
    AND public.auth_user_role() = 'owner'
  );

-- user_permission_groups — owner only
CREATE POLICY "user_permission_groups_insert" ON user_permission_groups
  FOR INSERT WITH CHECK (
    company_id = public.auth_company_id()
    AND public.auth_user_role() = 'owner'
  );

-- user_permission_overrides — owner only
CREATE POLICY "user_permission_overrides_insert" ON user_permission_overrides
  FOR INSERT WITH CHECK (
    company_id = public.auth_company_id()
    AND public.auth_user_role() = 'owner'
  );

-- user_invitations — owner only
CREATE POLICY "user_invitations_insert" ON user_invitations
  FOR INSERT WITH CHECK (
    company_id = public.auth_company_id()
    AND public.auth_user_role() = 'owner'
  );

-- invoices
CREATE POLICY "invoices_insert" ON invoices
  FOR INSERT WITH CHECK (company_id = public.auth_company_id());

-- invoice_items
CREATE POLICY "invoice_items_insert" ON invoice_items
  FOR INSERT WITH CHECK (company_id = public.auth_company_id());

-- payments
CREATE POLICY "payments_insert" ON payments
  FOR INSERT WITH CHECK (company_id = public.auth_company_id());

-- documents
CREATE POLICY "documents_insert" ON documents
  FOR INSERT WITH CHECK (company_id = public.auth_company_id());

-- tasks
CREATE POLICY "tasks_insert" ON tasks
  FOR INSERT WITH CHECK (company_id = public.auth_company_id());

-- notifications — system only (no INSERT policy)

-- email_logs — system only (no INSERT policy)

-- ai_logs — system only (no INSERT policy)

-- activity_logs — system only (no INSERT policy)

-- domain_events — same company (application events emitted by server)
CREATE POLICY "domain_events_insert" ON domain_events
  FOR INSERT WITH CHECK (company_id = public.auth_company_id());

-- email_sender_identities
CREATE POLICY "email_sender_identities_insert" ON email_sender_identities
  FOR INSERT WITH CHECK (company_id = public.auth_company_id());

-- email_templates
CREATE POLICY "email_templates_insert" ON email_templates
  FOR INSERT WITH CHECK (company_id = public.auth_company_id());

-- email_template_versions — append-only; same company
CREATE POLICY "email_template_versions_insert" ON email_template_versions
  FOR INSERT WITH CHECK (company_id = public.auth_company_id());

-- email_automations
CREATE POLICY "email_automations_insert" ON email_automations
  FOR INSERT WITH CHECK (company_id = public.auth_company_id());

-- email_automation_runs — system only (no INSERT policy)

-- communication_preferences
CREATE POLICY "communication_preferences_insert" ON communication_preferences
  FOR INSERT WITH CHECK (company_id = public.auth_company_id());

-- ai_communication_memory
CREATE POLICY "ai_communication_memory_insert" ON ai_communication_memory
  FOR INSERT WITH CHECK (company_id = public.auth_company_id());

-- metric_snapshots — system only (no INSERT policy; written by Vercel Cron via service_role)

-- =============================================================
-- UPDATE Policies
-- =============================================================

-- companies — owner only
CREATE POLICY "companies_update" ON companies
  FOR UPDATE USING (
    public.auth_company_id() = id
    AND public.auth_user_role() = 'owner'
  );

-- profiles — own row only
CREATE POLICY "profiles_update" ON profiles
  FOR UPDATE USING (
    id = auth.uid()
    AND company_id = public.auth_company_id()
  );

-- customers
CREATE POLICY "customers_update" ON customers
  FOR UPDATE USING (company_id = public.auth_company_id());

-- leads
CREATE POLICY "leads_update" ON leads
  FOR UPDATE USING (company_id = public.auth_company_id());

-- appointments
CREATE POLICY "appointments_update" ON appointments
  FOR UPDATE USING (company_id = public.auth_company_id());

-- quotes — any status (application layer enforces draft-only restriction for certain fields)
CREATE POLICY "quotes_update" ON quotes
  FOR UPDATE USING (company_id = public.auth_company_id());

-- quote_items
CREATE POLICY "quote_items_update" ON quote_items
  FOR UPDATE USING (company_id = public.auth_company_id());

-- quote_versions — append-only; no UPDATE policy

-- ai_quote_recommendations — owner + office can set operator_overrode_at
CREATE POLICY "ai_quote_recommendations_update" ON ai_quote_recommendations
  FOR UPDATE USING (company_id = public.auth_company_id());

-- jobs
CREATE POLICY "jobs_update" ON jobs
  FOR UPDATE USING (company_id = public.auth_company_id());

-- job_assignments
CREATE POLICY "job_assignments_update" ON job_assignments
  FOR UPDATE USING (company_id = public.auth_company_id());

-- employees
CREATE POLICY "employees_update" ON employees
  FOR UPDATE USING (company_id = public.auth_company_id());

-- vehicles
CREATE POLICY "vehicles_update" ON vehicles
  FOR UPDATE USING (company_id = public.auth_company_id());

-- service_catalog — owner only (application also checks settings.services permission)
CREATE POLICY "service_catalog_update" ON service_catalog
  FOR UPDATE USING (
    company_id = public.auth_company_id()
    AND public.auth_user_role() = 'owner'
  );

-- company_settings — owner only
CREATE POLICY "company_settings_update" ON company_settings
  FOR UPDATE USING (
    company_id = public.auth_company_id()
    AND public.auth_user_role() = 'owner'
  );

-- permission_groups — owner only
CREATE POLICY "permission_groups_update" ON permission_groups
  FOR UPDATE USING (
    company_id = public.auth_company_id()
    AND public.auth_user_role() = 'owner'
  );

-- permission_group_assignments — no UPDATE (delete + insert pattern)

-- user_permission_groups — no UPDATE (delete + insert pattern)

-- user_permission_overrides — owner only
CREATE POLICY "user_permission_overrides_update" ON user_permission_overrides
  FOR UPDATE USING (
    company_id = public.auth_company_id()
    AND public.auth_user_role() = 'owner'
  );

-- user_invitations — owner only (for revocation)
CREATE POLICY "user_invitations_update" ON user_invitations
  FOR UPDATE USING (
    company_id = public.auth_company_id()
    AND public.auth_user_role() = 'owner'
  );

-- invoices — any status (draft enforcement at application layer)
CREATE POLICY "invoices_update" ON invoices
  FOR UPDATE USING (company_id = public.auth_company_id());

-- invoice_items
CREATE POLICY "invoice_items_update" ON invoice_items
  FOR UPDATE USING (company_id = public.auth_company_id());

-- payments
CREATE POLICY "payments_update" ON payments
  FOR UPDATE USING (company_id = public.auth_company_id());

-- documents
CREATE POLICY "documents_update" ON documents
  FOR UPDATE USING (company_id = public.auth_company_id());

-- tasks
CREATE POLICY "tasks_update" ON tasks
  FOR UPDATE USING (company_id = public.auth_company_id());

-- notifications — own user can update read_at only
CREATE POLICY "notifications_update" ON notifications
  FOR UPDATE USING (
    user_id = auth.uid()
    AND company_id = public.auth_company_id()
  );

-- email_logs — system only (webhook updates; no authenticated UPDATE policy)

-- ai_logs — no UPDATE (append-only)

-- activity_logs — no UPDATE (append-only)

-- domain_events — system only for processed_at (no authenticated UPDATE policy)

-- email_sender_identities — owner only
CREATE POLICY "email_sender_identities_update" ON email_sender_identities
  FOR UPDATE USING (
    company_id = public.auth_company_id()
    AND public.auth_user_role() = 'owner'
  );

-- email_templates
CREATE POLICY "email_templates_update" ON email_templates
  FOR UPDATE USING (company_id = public.auth_company_id());

-- email_template_versions — append-only; no UPDATE policy

-- email_automations — owner only (mode and is_active changes)
CREATE POLICY "email_automations_update" ON email_automations
  FOR UPDATE USING (
    company_id = public.auth_company_id()
    AND public.auth_user_role() = 'owner'
  );

-- email_automation_runs — system only (no authenticated UPDATE policy)

-- communication_preferences
CREATE POLICY "communication_preferences_update" ON communication_preferences
  FOR UPDATE USING (company_id = public.auth_company_id());

-- ai_communication_memory — owner can confirm/reject proposals
CREATE POLICY "ai_communication_memory_update" ON ai_communication_memory
  FOR UPDATE USING (company_id = public.auth_company_id());

-- metric_snapshots — system only (no authenticated UPDATE policy)

-- =============================================================
-- DELETE Policies
-- Soft-delete tables: no hard DELETE policy — app issues UPDATE.
-- Tables with actual row deletion: explicit DELETE policy.
-- =============================================================

-- job_assignments — actual hard DELETE allowed
CREATE POLICY "job_assignments_delete" ON job_assignments
  FOR DELETE USING (company_id = public.auth_company_id());

-- permission_group_assignments — delete + insert pattern; owner only
CREATE POLICY "permission_group_assignments_delete" ON permission_group_assignments
  FOR DELETE USING (
    company_id = public.auth_company_id()
    AND public.auth_user_role() = 'owner'
  );

-- user_permission_groups — delete + insert pattern; owner only
CREATE POLICY "user_permission_groups_delete" ON user_permission_groups
  FOR DELETE USING (
    company_id = public.auth_company_id()
    AND public.auth_user_role() = 'owner'
  );
