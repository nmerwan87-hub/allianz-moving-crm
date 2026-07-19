-- =============================================================
-- Migration 015: Platform Administration
-- =============================================================
-- Tables: platform_admin_users, platform_admin_roles,
--         platform_admin_role_permissions, platform_admin_user_roles,
--         platform_admin_permission_overrides, platform_admin_sessions,
--         subscription_plans, subscription_plan_features,
--         company_subscription_overrides, company_feature_overrides,
--         platform_support_sessions, platform_audit_log,
--         platform_metric_snapshots
-- No RLS on platform tables — accessible only via service_role from
-- admin portal server code. Tenant-side tables already in earlier migs.
-- =============================================================

-- ─── platform_admin_users ────────────────────────────────────
-- Bivro internal staff. Completely separate from profiles.
CREATE TABLE platform_admin_users (
  id                uuid          PRIMARY KEY DEFAULT gen_uuid_v7(),
  email             text          NOT NULL UNIQUE,
  full_name         text          NOT NULL,
  google_sub        text          UNIQUE,

  is_active         boolean       NOT NULL DEFAULT true,
  deactivated_at    timestamptz,
  deactivated_by    uuid          REFERENCES platform_admin_users(id) ON DELETE SET NULL,

  last_login_at     timestamptz,
  last_login_ip     inet,

  created_at        timestamptz   NOT NULL DEFAULT now(),
  updated_at        timestamptz   NOT NULL DEFAULT now(),

  CONSTRAINT platform_admin_users_email_domain CHECK (email LIKE '%@bivro.io')
);

CREATE INDEX idx_platform_users_email  ON platform_admin_users(email) WHERE is_active = true;
CREATE INDEX idx_platform_users_google ON platform_admin_users(google_sub) WHERE google_sub IS NOT NULL;

-- ─── platform_admin_roles ─────────────────────────────────────
-- Role definitions. Seeded at deployment — not editable via UI.
CREATE TABLE platform_admin_roles (
  id            uuid          PRIMARY KEY DEFAULT gen_uuid_v7(),
  name          text          NOT NULL UNIQUE,
  -- 'platform_owner' | 'platform_admin' | 'customer_success'
  -- 'support' | 'finance' | 'sales' | 'developer' | 'read_only_auditor'
  display_name  text          NOT NULL,
  description   text          NOT NULL,
  is_system     boolean       NOT NULL DEFAULT false,

  created_at    timestamptz   NOT NULL DEFAULT now()
);

-- ─── platform_admin_role_permissions ─────────────────────────
CREATE TABLE platform_admin_role_permissions (
  id              uuid          PRIMARY KEY DEFAULT gen_uuid_v7(),
  role_id         uuid          NOT NULL REFERENCES platform_admin_roles(id) ON DELETE CASCADE,
  permission_key  text          NOT NULL,

  created_at      timestamptz   NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_platform_role_perms_unique
  ON platform_admin_role_permissions(role_id, permission_key);

-- ─── platform_admin_user_roles ────────────────────────────────
-- Staff-to-role mapping. A staff member may hold multiple roles.
CREATE TABLE platform_admin_user_roles (
  id              uuid          PRIMARY KEY DEFAULT gen_uuid_v7(),
  admin_user_id   uuid          NOT NULL REFERENCES platform_admin_users(id) ON DELETE CASCADE,
  role_id         uuid          NOT NULL REFERENCES platform_admin_roles(id) ON DELETE RESTRICT,

  assigned_by     uuid          REFERENCES platform_admin_users(id) ON DELETE SET NULL,
  assigned_at     timestamptz   NOT NULL DEFAULT now(),

  revoked_by      uuid          REFERENCES platform_admin_users(id) ON DELETE SET NULL,
  revoked_at      timestamptz
);

-- Only one active assignment per user-role pair
CREATE UNIQUE INDEX idx_platform_user_roles_active
  ON platform_admin_user_roles(admin_user_id, role_id)
  WHERE revoked_at IS NULL;

-- ─── platform_admin_permission_overrides ──────────────────────
-- Per-staff individual permission overrides.
CREATE TABLE platform_admin_permission_overrides (
  id              uuid          PRIMARY KEY DEFAULT gen_uuid_v7(),
  admin_user_id   uuid          NOT NULL REFERENCES platform_admin_users(id) ON DELETE CASCADE,
  permission_key  text          NOT NULL,
  override_type   text          NOT NULL CHECK (override_type IN ('grant', 'deny')),

  reason          text          NOT NULL,
  granted_by      uuid          NOT NULL REFERENCES platform_admin_users(id) ON DELETE RESTRICT,
  granted_at      timestamptz   NOT NULL DEFAULT now(),
  expires_at      timestamptz
);

-- One permanent override per (user, permission_key)
CREATE UNIQUE INDEX idx_platform_perm_overrides_permanent
  ON platform_admin_permission_overrides(admin_user_id, permission_key)
  WHERE expires_at IS NULL;

-- ─── platform_admin_sessions ──────────────────────────────────
CREATE TABLE platform_admin_sessions (
  id                    uuid          PRIMARY KEY DEFAULT gen_uuid_v7(),
  admin_user_id         uuid          NOT NULL REFERENCES platform_admin_users(id) ON DELETE CASCADE,
  session_token_hash    text          NOT NULL UNIQUE,
  ip_address            inet          NOT NULL,
  user_agent            text,

  created_at            timestamptz   NOT NULL DEFAULT now(),
  last_active_at        timestamptz   NOT NULL DEFAULT now(),
  expires_at            timestamptz   NOT NULL,

  invalidated_at        timestamptz,
  invalidation_reason   text
);

CREATE INDEX idx_platform_sessions_token ON platform_admin_sessions(session_token_hash) WHERE invalidated_at IS NULL;
CREATE INDEX idx_platform_sessions_user  ON platform_admin_sessions(admin_user_id, expires_at);

-- ─── subscription_plans ───────────────────────────────────────
-- Tier definitions. Seeded at deployment.
CREATE TABLE subscription_plans (
  id                    uuid              PRIMARY KEY DEFAULT gen_uuid_v7(),
  tier                  subscription_tier NOT NULL UNIQUE,

  display_name          text              NOT NULL,
  description           text              NOT NULL,
  stripe_price_id       text,
  monthly_price_cents   integer,

  max_office_users      integer,
  max_jobs_per_month    integer,
  max_quotes_per_month  integer,
  max_ai_tokens_month   integer,
  max_storage_mb        integer,
  max_api_calls_day     integer,

  trial_days            integer           NOT NULL DEFAULT 0,

  is_active             boolean           NOT NULL DEFAULT true,
  sort_order            integer           NOT NULL,

  created_at            timestamptz       NOT NULL DEFAULT now(),
  updated_at            timestamptz       NOT NULL DEFAULT now()
);

-- ─── subscription_plan_features ───────────────────────────────
CREATE TABLE subscription_plan_features (
  id            uuid          PRIMARY KEY DEFAULT gen_uuid_v7(),
  plan_id       uuid          NOT NULL REFERENCES subscription_plans(id) ON DELETE CASCADE,
  feature_key   text          NOT NULL,
  is_enabled    boolean       NOT NULL DEFAULT false,

  created_at    timestamptz   NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_plan_features_unique
  ON subscription_plan_features(plan_id, feature_key);

-- ─── company_subscription_overrides ───────────────────────────
-- Per-company limit overrides for Enterprise / Custom contracts.
CREATE TABLE company_subscription_overrides (
  id              uuid          PRIMARY KEY DEFAULT gen_uuid_v7(),
  company_id      uuid          NOT NULL REFERENCES companies(id) ON DELETE CASCADE,

  limit_key       text          NOT NULL,
  override_value  integer       NOT NULL,
  reason          text          NOT NULL,
  authorized_by   uuid          NOT NULL REFERENCES platform_admin_users(id) ON DELETE RESTRICT,

  valid_from      timestamptz   NOT NULL DEFAULT now(),
  valid_until     timestamptz,

  created_at      timestamptz   NOT NULL DEFAULT now()
);

-- One permanent override per (company, limit_key)
CREATE UNIQUE INDEX idx_sub_overrides_permanent
  ON company_subscription_overrides(company_id, limit_key)
  WHERE valid_until IS NULL;

CREATE INDEX idx_sub_overrides_company
  ON company_subscription_overrides(company_id);

-- ─── company_feature_overrides ────────────────────────────────
-- Per-company feature flag overrides above/below tier.
CREATE TABLE company_feature_overrides (
  id              uuid          PRIMARY KEY DEFAULT gen_uuid_v7(),
  company_id      uuid          NOT NULL REFERENCES companies(id) ON DELETE CASCADE,

  feature_key     text          NOT NULL,
  is_enabled      boolean       NOT NULL,
  reason          text          NOT NULL,
  authorized_by   uuid          NOT NULL REFERENCES platform_admin_users(id) ON DELETE RESTRICT,

  valid_from      timestamptz   NOT NULL DEFAULT now(),
  valid_until     timestamptz,

  created_at      timestamptz   NOT NULL DEFAULT now()
);

-- One permanent override per (company, feature_key)
CREATE UNIQUE INDEX idx_feature_overrides_permanent
  ON company_feature_overrides(company_id, feature_key)
  WHERE valid_until IS NULL;

-- ─── platform_support_sessions ────────────────────────────────
-- Audited, time-limited access to a specific company's data.
CREATE TABLE platform_support_sessions (
  id                    uuid          PRIMARY KEY DEFAULT gen_uuid_v7(),
  admin_user_id         uuid          NOT NULL REFERENCES platform_admin_users(id) ON DELETE RESTRICT,
  company_id            uuid          NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,

  reason_category       text          NOT NULL
                          CHECK (reason_category IN (
                            'bug_report', 'onboarding_assistance', 'data_recovery',
                            'security_investigation', 'billing_dispute', 'internal_qa'
                          )),
  reason_details        text          NOT NULL,

  requested_at          timestamptz   NOT NULL DEFAULT now(),
  approved_at           timestamptz,
  approved_by           uuid          REFERENCES platform_admin_users(id) ON DELETE SET NULL,

  granted_at            timestamptz,
  expires_at            timestamptz   NOT NULL,

  status                text          NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending', 'active', 'expired', 'ended_early', 'denied')),
  ended_at              timestamptz,
  ended_by              uuid          REFERENCES platform_admin_users(id) ON DELETE SET NULL,
  ended_reason          text,

  owner_notified_at     timestamptz,
  owner_notified_end_at timestamptz,

  created_at            timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX idx_support_sessions_active   ON platform_support_sessions(admin_user_id, status) WHERE status = 'active';
CREATE INDEX idx_support_sessions_company  ON platform_support_sessions(company_id, created_at DESC);
CREATE INDEX idx_support_sessions_expires  ON platform_support_sessions(expires_at) WHERE status = 'active';

-- ─── platform_audit_log ───────────────────────────────────────
-- Immutable, hash-chained. No UPDATE, no DELETE — ever.
-- Append-only enforced by trigger in migration 017.
CREATE TABLE platform_audit_log (
  id                    uuid          PRIMARY KEY DEFAULT gen_uuid_v7(),

  actor_id              uuid          NOT NULL,  -- platform_admin_users.id (no FK: append-only)
  actor_email           text          NOT NULL,
  actor_roles           text[]        NOT NULL,
  actor_ip              inet          NOT NULL,
  actor_session_id      uuid          NOT NULL REFERENCES platform_admin_sessions(id) ON DELETE RESTRICT,

  action                text          NOT NULL,
  resource_type         text          NOT NULL,
  resource_id           uuid,

  target_company_id     uuid,
  target_company_name   text,

  before_state          jsonb,
  after_state           jsonb,

  support_session_id    uuid          REFERENCES platform_support_sessions(id) ON DELETE RESTRICT,
  reason                text,
  metadata              jsonb,

  previous_entry_id     uuid          REFERENCES platform_audit_log(id) ON DELETE RESTRICT,
  previous_hash         text          NOT NULL,
  entry_hash            text          NOT NULL,

  created_at            timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_actor      ON platform_audit_log(actor_id, created_at DESC);
CREATE INDEX idx_audit_action     ON platform_audit_log(action, created_at DESC);
CREATE INDEX idx_audit_company    ON platform_audit_log(target_company_id, created_at DESC);
CREATE INDEX idx_audit_session    ON platform_audit_log(support_session_id) WHERE support_session_id IS NOT NULL;
CREATE INDEX idx_audit_created_at ON platform_audit_log(created_at DESC);

-- ─── platform_metric_snapshots ────────────────────────────────
-- Daily aggregated platform-wide metrics. Append-only.
CREATE TABLE platform_metric_snapshots (
  id              uuid          PRIMARY KEY DEFAULT gen_uuid_v7(),
  snapshot_date   date          NOT NULL,
  metric_key      text          NOT NULL,
  -- 'mrr_cents' | 'arr_cents' | 'active_company_count'
  -- 'trialing_company_count' | 'new_company_count' | 'churned_company_count'
  -- 'total_ai_tokens_used' | 'total_ai_cost_millicents'
  -- 'total_storage_mb' | 'total_quotes_created' | 'total_jobs_completed'
  -- 'api_error_rate' | 'ai_error_rate' | 'email_delivery_rate'
  metric_value    numeric       NOT NULL,
  dimension       text,         -- optional: 'tier' | 'country' | null

  created_at      timestamptz   NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_platform_metrics_unique
  ON platform_metric_snapshots(snapshot_date, metric_key, dimension);

CREATE INDEX idx_platform_metrics_date
  ON platform_metric_snapshots(snapshot_date DESC, metric_key);
