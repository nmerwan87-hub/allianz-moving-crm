-- =============================================================
-- Migration 020: Seed Defaults
-- =============================================================
-- Inserts static, global data required at all times:
--   1. permission_definitions (64 permissions — V1 catalogue)
--   2. subscription_plans (5 tiers: free, starter, pro, business, enterprise)
--   3. subscription_plan_features (feature flags per tier)
--   4. platform_admin_roles (8 roles)
--   5. platform_admin_role_permissions (per role → permission mapping)
-- These rows are global, not per-tenant. They exist once in the DB.
-- Source: PRODUCT_REQUIREMENTS.md §3.3, PLATFORM_ADMIN.md §4, §8
-- =============================================================

-- =============================================================
-- 1. permission_definitions — 64 company-side permissions
-- =============================================================

INSERT INTO permission_definitions (key, resource, action, description) VALUES
  -- Customers (5)
  ('customers.view',        'customers',      'view',               'View customer records'),
  ('customers.create',      'customers',      'create',             'Create new customer records'),
  ('customers.edit',        'customers',      'edit',               'Edit existing customer records'),
  ('customers.delete',      'customers',      'delete',             'Soft-delete customer records'),
  ('customers.export',      'customers',      'export',             'Export customer data to CSV'),
  -- Leads (5)
  ('leads.view',            'leads',          'view',               'View leads and pipeline'),
  ('leads.create',          'leads',          'create',             'Create new leads (manual entry)'),
  ('leads.edit',            'leads',          'edit',               'Edit lead details and status'),
  ('leads.delete',          'leads',          'delete',             'Archive leads'),
  ('leads.assign',          'leads',          'assign',             'Assign leads to other users'),
  -- Quotes (10)
  ('quotes.view',           'quotes',         'view',               'View quote list and details'),
  ('quotes.create',         'quotes',         'create',             'Create new quotes'),
  ('quotes.edit',           'quotes',         'edit',               'Edit draft quotes'),
  ('quotes.delete',         'quotes',         'delete',             'Archive quotes'),
  ('quotes.duplicate',      'quotes',         'duplicate',          'Duplicate an existing quote'),
  ('quotes.send',           'quotes',         'send',               'Send a quote to a customer'),
  ('quotes.approve',        'quotes',         'approve',            'Approve AI-generated quotes before sending'),
  ('quotes.change_pricing', 'quotes',         'change_pricing',     'Modify line item prices on a quote'),
  ('quotes.view_cost_price','quotes',         'view_cost_price',    'See cost prices and margin on quote items'),
  ('quotes.apply_discount', 'quotes',         'apply_discount',     'Apply discounts to a quote'),
  -- Jobs (6)
  ('jobs.view',             'jobs',           'view',               'View job list and details'),
  ('jobs.create',           'jobs',           'create',             'Create new jobs'),
  ('jobs.edit',             'jobs',           'edit',               'Edit job details'),
  ('jobs.assign',           'jobs',           'assign',             'Assign crew and vehicles to jobs'),
  ('jobs.complete',         'jobs',           'complete',           'Mark a job as complete'),
  ('jobs.cancel',           'jobs',           'cancel',             'Cancel a job'),
  -- Employees (4)
  ('employees.view',        'employees',      'view',               'View employee records'),
  ('employees.create',      'employees',      'create',             'Create new employee records'),
  ('employees.edit',        'employees',      'edit',               'Edit employee details'),
  ('employees.delete',      'employees',      'delete',             'Soft-delete employee records'),
  -- Vehicles (4)
  ('vehicles.view',         'vehicles',       'view',               'View vehicle records'),
  ('vehicles.create',       'vehicles',       'create',             'Add new vehicles'),
  ('vehicles.edit',         'vehicles',       'edit',               'Edit vehicle details'),
  ('vehicles.delete',       'vehicles',       'delete',             'Soft-delete vehicles'),
  -- Invoices (5)
  ('invoices.view',         'invoices',       'view',               'View invoice list and details'),
  ('invoices.create',       'invoices',       'create',             'Generate invoices'),
  ('invoices.edit',         'invoices',       'edit',               'Edit draft invoices'),
  ('invoices.cancel',       'invoices',       'cancel',             'Void or cancel invoices'),
  ('invoices.refund',       'invoices',       'refund',             'Process refunds'),
  -- Payments (3)
  ('payments.view',         'payments',       'view',               'View payment records'),
  ('payments.record_manual','payments',       'record_manual',      'Record cash, check, and bank transfer payments'),
  ('payments.export',       'payments',       'export',             'Export payment reports'),
  -- Communications (5)
  ('communications.view',               'communications', 'view',               'View customer communication history and timeline'),
  ('communications.send',               'communications', 'send',               'Send emails manually from the composer'),
  ('communications.schedule',           'communications', 'schedule',           'Schedule future email sends'),
  ('communications.draft',              'communications', 'draft',              'Create email drafts only (cannot send directly)'),
  ('communications.manage_automations', 'communications', 'manage_automations', 'Create, edit, activate, and deactivate automation rules'),
  -- AI Features (5)
  ('ai.view_suggestions',  'ai',             'view_suggestions',   'See AI-generated recommendations and scores'),
  ('ai.generate_quote',    'ai',             'generate_quote',     'Trigger AI quote generation'),
  ('ai.override',          'ai',             'override',           'Modify or reject AI recommendations'),
  ('ai.auto_pricing',      'ai',             'auto_pricing',       'Enable AI to apply pricing automatically (no manual approval)'),
  ('ai.auto_emails',       'ai',             'auto_emails',        'Enable AI to send emails automatically (no manual approval)'),
  -- Analytics & Reports (4)
  ('analytics.view_operations', 'analytics', 'view_operations',    'View operational reports (jobs, crew, fleet)'),
  ('analytics.view_sales',      'analytics', 'view_sales',         'View sales reports (leads, quotes, conversion)'),
  ('analytics.view_financial',  'analytics', 'view_financial',     'View financial reports (revenue, payments, invoices, margins)'),
  ('analytics.export',          'analytics', 'export',             'Export reports to CSV or PDF'),
  -- Settings (8)
  ('settings.company',      'settings',       'company',            'Edit company profile and branding'),
  ('settings.templates',    'settings',       'templates',          'Edit document and email templates'),
  ('settings.services',     'settings',       'services',           'Manage service catalog and pricing'),
  ('settings.users',        'settings',       'users',              'Invite and manage Office users'),
  ('settings.permissions',  'settings',       'permissions',        'Manage permission groups and assignments'),
  ('settings.integrations', 'settings',       'integrations',       'Manage third-party integrations'),
  ('settings.legal_text',   'settings',       'legal_text',         'Edit service agreement text and document legal footer content'),
  ('settings.banking',      'settings',       'banking',            'Edit bank details shown on invoices and receipts')
;

-- =============================================================
-- 2. subscription_plans — 5 tiers
-- =============================================================

INSERT INTO subscription_plans
  (tier, display_name, description,
   monthly_price_cents,
   max_office_users, max_jobs_per_month, max_quotes_per_month,
   max_ai_tokens_month, max_storage_mb, max_api_calls_day,
   trial_days, is_active, sort_order)
VALUES
  ('free',       'Free',         'Trial tier. All new signups start here. 14 days.',
   0,
   0,   5,    10,    10000,    500,    NULL,
   14, true, 1),

  ('starter',    'Starter',      'For sole operators and very small crews (1–3 movers).',
   2900,
   2,   30,   NULL,  50000,    5120,   NULL,
   0, true, 2),

  ('pro',        'Professional', 'For growing operations (3–10 crew, 1 dispatcher/estimator).',
   9900,
   10,  NULL, NULL,  500000,   25600,  500,
   0, true, 3),

  ('business',   'Business',     'For established companies (10–30 crew, dedicated office staff).',
   19900,
   NULL, NULL, NULL, 2000000,  102400, 5000,
   0, true, 4),

  ('enterprise', 'Enterprise',   'For large companies (30+ crew) and franchise groups. Custom terms.',
   NULL,
   NULL, NULL, NULL, NULL,     NULL,   NULL,
   0, true, 5)
;

-- =============================================================
-- 3. subscription_plan_features — feature flags per tier
-- Uses a subquery to resolve plan UUIDs dynamically.
-- =============================================================

-- Helper: insert features for each tier
WITH plans AS (
  SELECT id, tier FROM subscription_plans
)
INSERT INTO subscription_plan_features (plan_id, feature_key, is_enabled)
SELECT p.id, f.feature_key, f.is_enabled FROM plans p
CROSS JOIN (VALUES
  -- ai_manual_mode: all tiers
  ('ai_manual_mode',     'free',       true),
  ('ai_manual_mode',     'starter',    true),
  ('ai_manual_mode',     'pro',        true),
  ('ai_manual_mode',     'business',   true),
  ('ai_manual_mode',     'enterprise', true),
  -- ai_quote_generate: starter+
  ('ai_quote_generate',  'free',       false),
  ('ai_quote_generate',  'starter',    true),
  ('ai_quote_generate',  'pro',        true),
  ('ai_quote_generate',  'business',   true),
  ('ai_quote_generate',  'enterprise', true),
  -- ai_quote_hybrid: pro+
  ('ai_quote_hybrid',    'free',       false),
  ('ai_quote_hybrid',    'starter',    false),
  ('ai_quote_hybrid',    'pro',        true),
  ('ai_quote_hybrid',    'business',   true),
  ('ai_quote_hybrid',    'enterprise', true),
  -- ai_lead_scoring: pro+
  ('ai_lead_scoring',    'free',       false),
  ('ai_lead_scoring',    'starter',    false),
  ('ai_lead_scoring',    'pro',        true),
  ('ai_lead_scoring',    'business',   true),
  ('ai_lead_scoring',    'enterprise', true),
  -- ai_email_draft: pro+
  ('ai_email_draft',     'free',       false),
  ('ai_email_draft',     'starter',    false),
  ('ai_email_draft',     'pro',        true),
  ('ai_email_draft',     'business',   true),
  ('ai_email_draft',     'enterprise', true),
  -- ai_coach_brief: pro+
  ('ai_coach_brief',     'free',       false),
  ('ai_coach_brief',     'starter',    false),
  ('ai_coach_brief',     'pro',        true),
  ('ai_coach_brief',     'business',   true),
  ('ai_coach_brief',     'enterprise', true),
  -- ai_replay: pro+
  ('ai_replay',          'free',       false),
  ('ai_replay',          'starter',    false),
  ('ai_replay',          'pro',        true),
  ('ai_replay',          'business',   true),
  ('ai_replay',          'enterprise', true),
  -- ai_observations: pro+
  ('ai_observations',    'free',       false),
  ('ai_observations',    'starter',    false),
  ('ai_observations',    'pro',        true),
  ('ai_observations',    'business',   true),
  ('ai_observations',    'enterprise', true),
  -- ai_profit_analysis: business+
  ('ai_profit_analysis', 'free',       false),
  ('ai_profit_analysis', 'starter',    false),
  ('ai_profit_analysis', 'pro',        false),
  ('ai_profit_analysis', 'business',   true),
  ('ai_profit_analysis', 'enterprise', true),
  -- ai_simulation: business+
  ('ai_simulation',      'free',       false),
  ('ai_simulation',      'starter',    false),
  ('ai_simulation',      'pro',        false),
  ('ai_simulation',      'business',   true),
  ('ai_simulation',      'enterprise', true),
  -- advanced_permissions: pro+
  ('advanced_permissions','free',       false),
  ('advanced_permissions','starter',    false),
  ('advanced_permissions','pro',        true),
  ('advanced_permissions','business',   true),
  ('advanced_permissions','enterprise', true),
  -- api_access: pro+
  ('api_access',         'free',       false),
  ('api_access',         'starter',    false),
  ('api_access',         'pro',        true),
  ('api_access',         'business',   true),
  ('api_access',         'enterprise', true),
  -- webhook_support: business+
  ('webhook_support',    'free',       false),
  ('webhook_support',    'starter',    false),
  ('webhook_support',    'pro',        false),
  ('webhook_support',    'business',   true),
  ('webhook_support',    'enterprise', true),
  -- data_export: pro+
  ('data_export',        'free',       false),
  ('data_export',        'starter',    false),
  ('data_export',        'pro',        true),
  ('data_export',        'business',   true),
  ('data_export',        'enterprise', true),
  -- audit_log_export: business+
  ('audit_log_export',   'free',       false),
  ('audit_log_export',   'starter',    false),
  ('audit_log_export',   'pro',        false),
  ('audit_log_export',   'business',   true),
  ('audit_log_export',   'enterprise', true),
  -- sso_saml: V2+ (disabled for all tiers in V1)
  ('sso_saml',           'free',       false),
  ('sso_saml',           'starter',    false),
  ('sso_saml',           'pro',        false),
  ('sso_saml',           'business',   false),
  ('sso_saml',           'enterprise', false),
  -- custom_ai_model: V2+
  ('custom_ai_model',    'free',       false),
  ('custom_ai_model',    'starter',    false),
  ('custom_ai_model',    'pro',        false),
  ('custom_ai_model',    'business',   false),
  ('custom_ai_model',    'enterprise', false),
  -- white_label: V2+
  ('white_label',        'free',       false),
  ('white_label',        'starter',    false),
  ('white_label',        'pro',        false),
  ('white_label',        'business',   false),
  ('white_label',        'enterprise', false)
) AS f(feature_key, tier, is_enabled)
WHERE p.tier::text = f.tier;

-- =============================================================
-- 4. platform_admin_roles — 8 built-in roles
-- =============================================================

INSERT INTO platform_admin_roles (name, display_name, description, is_system) VALUES
  ('platform_owner',    'Platform Owner',     'Unrestricted access to all platform capabilities. Reserved for founders and CTO.',          true),
  ('platform_admin',    'Platform Admin',     'Day-to-day platform management. Full tenant lifecycle and subscription operations.',        true),
  ('customer_success',  'Customer Success',   'Tenant health and relationship management. Can initiate support sessions.',                  true),
  ('support',           'Support',            'Frontline support. Time-limited, audited access to investigate customer-reported issues.',  true),
  ('finance',           'Finance',            'All billing and revenue data. Can process refunds and export financial reports.',            true),
  ('sales',             'Sales',              'Company list for pipeline management. Can create trials and extend trial periods.',          true),
  ('developer',         'Developer',          'System health, AI metrics, error logs (PII-stripped), and infrastructure monitoring.',      true),
  ('read_only_auditor', 'Read Only Auditor',  'Read-only access to audit log, dashboard, and company metadata. No state mutations.',       true)
;

-- =============================================================
-- 5. platform_admin_role_permissions
-- Source: PLATFORM_ADMIN.md §4.4
-- Columns: Owner | Admin | CS | Support | Finance | Sales | Dev | Auditor
-- =============================================================

WITH roles AS (
  SELECT id, name FROM platform_admin_roles
)
INSERT INTO platform_admin_role_permissions (role_id, permission_key)
SELECT r.id, p.permission_key
FROM roles r
JOIN (VALUES
  -- tenants.view: Owner Admin CS Support Finance(—) Sales Dev Auditor
  ('platform_owner',    'tenants.view'),
  ('platform_admin',    'tenants.view'),
  ('customer_success',  'tenants.view'),
  ('support',           'tenants.view'),
  ('sales',             'tenants.view'),
  ('developer',         'tenants.view'),
  ('read_only_auditor', 'tenants.view'),
  -- tenants.create: Owner Admin Sales
  ('platform_owner',    'tenants.create'),
  ('platform_admin',    'tenants.create'),
  ('sales',             'tenants.create'),
  -- tenants.edit_metadata: Owner Admin CS
  ('platform_owner',    'tenants.edit_metadata'),
  ('platform_admin',    'tenants.edit_metadata'),
  ('customer_success',  'tenants.edit_metadata'),
  -- tenants.suspend: Owner Admin
  ('platform_owner',    'tenants.suspend'),
  ('platform_admin',    'tenants.suspend'),
  -- tenants.restore: Owner Admin
  ('platform_owner',    'tenants.restore'),
  ('platform_admin',    'tenants.restore'),
  -- tenants.archive: Owner Admin
  ('platform_owner',    'tenants.archive'),
  ('platform_admin',    'tenants.archive'),
  -- tenants.delete: Owner only
  ('platform_owner',    'tenants.delete'),
  -- tenants.transfer_ownership: Owner Admin
  ('platform_owner',    'tenants.transfer_ownership'),
  ('platform_admin',    'tenants.transfer_ownership'),
  -- tenants.reset_owner_invite: Owner Admin CS
  ('platform_owner',    'tenants.reset_owner_invite'),
  ('platform_admin',    'tenants.reset_owner_invite'),
  ('customer_success',  'tenants.reset_owner_invite'),
  -- tenants.manage_limits: Owner Admin
  ('platform_owner',    'tenants.manage_limits'),
  ('platform_admin',    'tenants.manage_limits'),
  -- subscriptions.view: Owner Admin CS Finance Sales Auditor
  ('platform_owner',    'subscriptions.view'),
  ('platform_admin',    'subscriptions.view'),
  ('customer_success',  'subscriptions.view'),
  ('finance',           'subscriptions.view'),
  ('sales',             'subscriptions.view'),
  ('read_only_auditor', 'subscriptions.view'),
  -- subscriptions.change_tier: Owner Admin Finance
  ('platform_owner',    'subscriptions.change_tier'),
  ('platform_admin',    'subscriptions.change_tier'),
  ('finance',           'subscriptions.change_tier'),
  -- subscriptions.override_limits: Owner Admin
  ('platform_owner',    'subscriptions.override_limits'),
  ('platform_admin',    'subscriptions.override_limits'),
  -- subscriptions.extend_trial: Owner Admin CS Finance Sales
  ('platform_owner',    'subscriptions.extend_trial'),
  ('platform_admin',    'subscriptions.extend_trial'),
  ('customer_success',  'subscriptions.extend_trial'),
  ('finance',           'subscriptions.extend_trial'),
  ('sales',             'subscriptions.extend_trial'),
  -- subscriptions.grant_credits: Owner Admin CS Finance
  ('platform_owner',    'subscriptions.grant_credits'),
  ('platform_admin',    'subscriptions.grant_credits'),
  ('customer_success',  'subscriptions.grant_credits'),
  ('finance',           'subscriptions.grant_credits'),
  -- subscriptions.process_refund: Owner Admin Finance
  ('platform_owner',    'subscriptions.process_refund'),
  ('platform_admin',    'subscriptions.process_refund'),
  ('finance',           'subscriptions.process_refund'),
  -- support.initiate_session: Owner Admin CS Support Dev
  ('platform_owner',    'support.initiate_session'),
  ('platform_admin',    'support.initiate_session'),
  ('customer_success',  'support.initiate_session'),
  ('support',           'support.initiate_session'),
  ('developer',         'support.initiate_session'),
  -- support.view_active_sessions: Owner Admin CS Support Dev Auditor
  ('platform_owner',    'support.view_active_sessions'),
  ('platform_admin',    'support.view_active_sessions'),
  ('customer_success',  'support.view_active_sessions'),
  ('support',           'support.view_active_sessions'),
  ('developer',         'support.view_active_sessions'),
  ('read_only_auditor', 'support.view_active_sessions'),
  -- support.end_session: Owner Admin CS Support Dev
  ('platform_owner',    'support.end_session'),
  ('platform_admin',    'support.end_session'),
  ('customer_success',  'support.end_session'),
  ('support',           'support.end_session'),
  ('developer',         'support.end_session'),
  -- billing.view_revenue: Owner Admin Finance Auditor
  ('platform_owner',    'billing.view_revenue'),
  ('platform_admin',    'billing.view_revenue'),
  ('finance',           'billing.view_revenue'),
  ('read_only_auditor', 'billing.view_revenue'),
  -- billing.view_invoices: Owner Admin Finance Auditor
  ('platform_owner',    'billing.view_invoices'),
  ('platform_admin',    'billing.view_invoices'),
  ('finance',           'billing.view_invoices'),
  ('read_only_auditor', 'billing.view_invoices'),
  -- billing.export: Owner Admin Finance
  ('platform_owner',    'billing.export'),
  ('platform_admin',    'billing.export'),
  ('finance',           'billing.export'),
  -- ai.view_system_metrics: Owner Admin CS Dev Auditor
  ('platform_owner',    'ai.view_system_metrics'),
  ('platform_admin',    'ai.view_system_metrics'),
  ('customer_success',  'ai.view_system_metrics'),
  ('developer',         'ai.view_system_metrics'),
  ('read_only_auditor', 'ai.view_system_metrics'),
  -- ai.view_costs: Owner Admin Finance Dev Auditor
  ('platform_owner',    'ai.view_costs'),
  ('platform_admin',    'ai.view_costs'),
  ('finance',           'ai.view_costs'),
  ('developer',         'ai.view_costs'),
  ('read_only_auditor', 'ai.view_costs'),
  -- ai.manage_prompts: Owner Admin Dev
  ('platform_owner',    'ai.manage_prompts'),
  ('platform_admin',    'ai.manage_prompts'),
  ('developer',         'ai.manage_prompts'),
  -- system.view_health: Owner Admin CS Support Dev Auditor
  ('platform_owner',    'system.view_health'),
  ('platform_admin',    'system.view_health'),
  ('customer_success',  'system.view_health'),
  ('support',           'system.view_health'),
  ('developer',         'system.view_health'),
  ('read_only_auditor', 'system.view_health'),
  -- system.manage_alerts: Owner Admin Dev
  ('platform_owner',    'system.manage_alerts'),
  ('platform_admin',    'system.manage_alerts'),
  ('developer',         'system.manage_alerts'),
  -- system.view_logs: Owner Admin Dev
  ('platform_owner',    'system.view_logs'),
  ('platform_admin',    'system.view_logs'),
  ('developer',         'system.view_logs'),
  -- staff.view: Owner Admin Auditor
  ('platform_owner',    'staff.view'),
  ('platform_admin',    'staff.view'),
  ('read_only_auditor', 'staff.view'),
  -- staff.invite: Owner Admin
  ('platform_owner',    'staff.invite'),
  ('platform_admin',    'staff.invite'),
  -- staff.manage_roles: Owner Admin
  ('platform_owner',    'staff.manage_roles'),
  ('platform_admin',    'staff.manage_roles'),
  -- staff.deactivate: Owner Admin
  ('platform_owner',    'staff.deactivate'),
  ('platform_admin',    'staff.deactivate'),
  -- staff.manage_owners: Owner only
  ('platform_owner',    'staff.manage_owners'),
  -- audit.view: Owner Admin CS Support Finance Dev Auditor
  ('platform_owner',    'audit.view'),
  ('platform_admin',    'audit.view'),
  ('customer_success',  'audit.view'),
  ('support',           'audit.view'),
  ('finance',           'audit.view'),
  ('developer',         'audit.view'),
  ('read_only_auditor', 'audit.view'),
  -- audit.export: Owner Admin Finance Auditor
  ('platform_owner',    'audit.export'),
  ('platform_admin',    'audit.export'),
  ('finance',           'audit.export'),
  ('read_only_auditor', 'audit.export'),
  -- audit.view_support_sessions: Owner Admin CS Support Dev Auditor
  ('platform_owner',    'audit.view_support_sessions'),
  ('platform_admin',    'audit.view_support_sessions'),
  ('customer_success',  'audit.view_support_sessions'),
  ('support',           'audit.view_support_sessions'),
  ('developer',         'audit.view_support_sessions'),
  ('read_only_auditor', 'audit.view_support_sessions')
) AS p(role_name, permission_key)
ON r.name = p.role_name;
