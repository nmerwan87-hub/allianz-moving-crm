-- =============================================================
-- Migration 013: Email System
-- =============================================================
-- Tables: email_sender_identities, email_templates,
--         email_template_versions, email_automations,
--         email_automation_runs, communication_preferences,
--         ai_communication_memory
-- Depends on: 002 (companies, profiles), 003 (customers)
-- Creation order within this migration matters:
--   email_sender_identities → email_templates → email_template_versions
--   → email_automations (refs templates + sender_identities)
--   → email_automation_runs (append-only, soft refs)
--   → communication_preferences → ai_communication_memory
-- =============================================================

-- ─── email_sender_identities ─────────────────────────────────
CREATE TABLE email_sender_identities (
  id              uuid          PRIMARY KEY DEFAULT gen_uuid_v7(),
  company_id      uuid          NOT NULL REFERENCES companies(id) ON DELETE CASCADE,

  name            text          NOT NULL,
  email           text          NOT NULL,
  reply_to        text,

  tier            text          NOT NULL DEFAULT 'bivro_managed'
                    CHECK (tier IN ('bivro_managed', 'company_verified')),

  domain          text,
  dkim_status     text          DEFAULT 'pending'
                    CHECK (dkim_status IN ('pending', 'verified', 'failed')),
  spf_status      text          DEFAULT 'pending'
                    CHECK (spf_status IN ('pending', 'verified', 'failed')),
  dmarc_status    text          DEFAULT 'pending'
                    CHECK (dmarc_status IN ('pending', 'verified', 'failed')),
  verified_at     timestamptz,

  is_active       boolean       NOT NULL DEFAULT true,
  is_default      boolean       NOT NULL DEFAULT false,

  created_at      timestamptz   NOT NULL DEFAULT now(),
  updated_at      timestamptz   NOT NULL DEFAULT now(),
  deleted_at      timestamptz
);

-- Unique email per company (partial: excludes soft-deleted)
CREATE UNIQUE INDEX idx_sender_identities_unique_email
  ON email_sender_identities(company_id, email)
  WHERE deleted_at IS NULL;

-- ─── email_templates ─────────────────────────────────────────
CREATE TABLE email_templates (
  id                uuid          PRIMARY KEY DEFAULT gen_uuid_v7(),
  company_id        uuid          NOT NULL REFERENCES companies(id) ON DELETE CASCADE,

  slug              text          NOT NULL,
  name              text          NOT NULL,
  description       text,

  lifecycle_stage   text,
  template_class    text          NOT NULL DEFAULT 'transactional'
                      CHECK (template_class IN ('transactional', 'marketing')),

  is_system_default boolean       NOT NULL DEFAULT false,
  is_active         boolean       NOT NULL DEFAULT true,
  archived_at       timestamptz,

  sort_order        integer       NOT NULL DEFAULT 0,

  created_at        timestamptz   NOT NULL DEFAULT now(),
  updated_at        timestamptz   NOT NULL DEFAULT now(),
  deleted_at        timestamptz
);

-- Unique slug per company (partial: excludes soft-deleted)
CREATE UNIQUE INDEX idx_email_templates_unique_slug
  ON email_templates(company_id, slug)
  WHERE deleted_at IS NULL;

-- ─── email_template_versions ─────────────────────────────────
-- Immutable version records. Append-only — no updated_at, no deleted_at.
CREATE TABLE email_template_versions (
  id              uuid          PRIMARY KEY DEFAULT gen_uuid_v7(),
  template_id     uuid          NOT NULL REFERENCES email_templates(id) ON DELETE CASCADE,
  company_id      uuid          NOT NULL,   -- denormalized for RLS

  version_number  integer       NOT NULL,
  is_current      boolean       NOT NULL DEFAULT false,
  language        text          NOT NULL DEFAULT 'en',

  subject         text          NOT NULL,
  body_html       text          NOT NULL,
  body_text       text          NOT NULL,
  variables_used  text[]        NOT NULL DEFAULT '{}',

  created_by      uuid          REFERENCES profiles(id) ON DELETE SET NULL,

  -- Append-only
  created_at      timestamptz   NOT NULL DEFAULT now()
);

-- One version number per template per language
CREATE UNIQUE INDEX idx_template_versions_unique
  ON email_template_versions(template_id, language, version_number);

-- ─── email_automations ───────────────────────────────────────
CREATE TABLE email_automations (
  id                      uuid          PRIMARY KEY DEFAULT gen_uuid_v7(),
  company_id              uuid          NOT NULL REFERENCES companies(id) ON DELETE CASCADE,

  name                    text          NOT NULL,
  description             text,

  trigger_event           text          NOT NULL,
  trigger_delay_seconds   integer       NOT NULL DEFAULT 0,

  conditions              jsonb         NOT NULL DEFAULT '[]',
  cancellation_events     text[]        NOT NULL DEFAULT '{}',

  template_id             uuid          NOT NULL REFERENCES email_templates(id) ON DELETE RESTRICT,
  template_language       text          DEFAULT 'customer_preference',

  sender_identity_id      uuid          REFERENCES email_sender_identities(id) ON DELETE SET NULL,

  mode                    text          NOT NULL DEFAULT 'approval'
                            CHECK (mode IN ('draft', 'approval', 'auto_send')),

  max_retries             smallint      NOT NULL DEFAULT 3,
  retry_delay_minutes     smallint      NOT NULL DEFAULT 5,

  is_system_default       boolean       NOT NULL DEFAULT false,
  is_active               boolean       NOT NULL DEFAULT false,
  -- All automations start inactive; Owner must explicitly activate

  created_by              uuid          REFERENCES profiles(id) ON DELETE SET NULL,
  updated_by              uuid          REFERENCES profiles(id) ON DELETE SET NULL,

  created_at              timestamptz   NOT NULL DEFAULT now(),
  updated_at              timestamptz   NOT NULL DEFAULT now()
);

-- ─── email_automation_runs ───────────────────────────────────
-- Execution log for every automation trigger event. Append-only.
CREATE TABLE email_automation_runs (
  id                  uuid          PRIMARY KEY DEFAULT gen_uuid_v7(),
  company_id          uuid          NOT NULL,   -- no FK: append-only log
  automation_id       uuid          NOT NULL,   -- soft ref to email_automations.id
  template_id         uuid          NOT NULL,   -- soft ref to email_template_versions.id

  trigger_event       text          NOT NULL,
  entity_type         text,
  entity_id           uuid,

  to_email            text          NOT NULL,
  to_name             text,

  status              text          NOT NULL
                        CHECK (status IN (
                          'pending', 'draft_created', 'approval_pending', 'approved',
                          'sent', 'skipped', 'failed', 'expired', 'cancelled'
                        )),
  cancellation_reason text,

  scheduled_for       timestamptz,
  approved_at         timestamptz,
  approved_by         uuid,         -- soft ref to profiles

  email_log_id        uuid,         -- references email_logs.id when sent
  error_message       text,

  -- Append-only
  created_at          timestamptz   NOT NULL DEFAULT now()
);

-- ─── communication_preferences ───────────────────────────────
-- Per-customer communication opt-out and preference tracking.
-- One row per customer (1:1 with customers).
CREATE TABLE communication_preferences (
  id                        uuid          PRIMARY KEY DEFAULT gen_uuid_v7(),
  company_id                uuid          NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  customer_id               uuid          NOT NULL UNIQUE REFERENCES customers(id) ON DELETE CASCADE,

  preferred_language        text          DEFAULT NULL,
  language_source           text          DEFAULT 'unset'
                              CHECK (language_source IN ('unset', 'operator_set', 'customer_set', 'ai_detected')),

  opted_out_all             boolean       NOT NULL DEFAULT false,
  opted_out_automated       boolean       NOT NULL DEFAULT false,
  opted_out_marketing       boolean       NOT NULL DEFAULT false,
  opted_out_at              timestamptz,

  email_deliverability      text          NOT NULL DEFAULT 'ok'
                              CHECK (email_deliverability IN ('ok', 'soft_bounce_risk', 'hard_bounce', 'complained')),
  deliverability_updated_at timestamptz,

  preferred_salutation      text,
  communication_notes       text,

  created_at                timestamptz   NOT NULL DEFAULT now(),
  updated_at                timestamptz   NOT NULL DEFAULT now()
);

-- ─── ai_communication_memory ─────────────────────────────────
-- Tenant-isolated AI communication tone and style learning.
CREATE TABLE ai_communication_memory (
  id                  uuid          PRIMARY KEY DEFAULT gen_uuid_v7(),
  company_id          uuid          NOT NULL REFERENCES companies(id) ON DELETE CASCADE,

  scope               text          NOT NULL DEFAULT 'company'
                        CHECK (scope IN ('company', 'customer')),
  customer_id         uuid          REFERENCES customers(id) ON DELETE CASCADE,
  -- null when scope = 'company'

  memory_type         text          NOT NULL,
  observed_value      text          NOT NULL,
  confidence          integer       NOT NULL DEFAULT 0 CHECK (confidence BETWEEN 0 AND 100),

  status              text          NOT NULL DEFAULT 'proposed'
                        CHECK (status IN ('proposed', 'confirmed', 'rejected')),
  confirmed_by        uuid          REFERENCES profiles(id) ON DELETE SET NULL,
  confirmed_at        timestamptz,

  observation_count   integer       NOT NULL DEFAULT 1,

  created_at          timestamptz   NOT NULL DEFAULT now(),
  updated_at          timestamptz   NOT NULL DEFAULT now()
);
