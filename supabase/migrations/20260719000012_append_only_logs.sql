-- =============================================================
-- Migration 012: Append-Only Logs
-- =============================================================
-- Tables: email_logs, ai_logs, activity_logs, domain_events
-- All append-only: no UPDATE/DELETE ever. No FK constraints (logs
-- must survive entity deletion). No updated_at, no deleted_at.
-- Safe to create any time after migration 002 (companies, profiles).
-- =============================================================
-- This migration also resolves forward FK references from:
--   quotes.ai_log_id → ai_logs (migration 007)
--   ai_quote_recommendations.ai_log_id → ai_logs (migration 007)
--   documents.ai_log_id → ai_logs (migration 010)
-- =============================================================

-- ─── email_logs ──────────────────────────────────────────────
CREATE TABLE email_logs (
  id                      uuid                    PRIMARY KEY DEFAULT gen_uuid_v7(),
  company_id              uuid                    NOT NULL,  -- no FK: append-only log

  -- What triggered this email
  trigger_event           text                    NOT NULL,
  entity_type             text,
  entity_id               uuid,

  -- Recipients and sender
  to_email                text                    NOT NULL,
  to_name                 text,
  from_email              text                    NOT NULL,
  from_name               text                    NOT NULL,
  reply_to                text,

  -- Content
  subject                 text                    NOT NULL,

  -- Delivery
  status                  email_delivery_status   NOT NULL DEFAULT 'queued',
  resend_id               text                    UNIQUE,

  -- Tracking events (updated by Resend webhooks — the one exception to append-only)
  sent_at                 timestamptz,
  delivered_at            timestamptz,
  first_opened_at         timestamptz,
  open_count              integer                 NOT NULL DEFAULT 0,
  first_clicked_at        timestamptz,
  bounced_at              timestamptz,
  bounce_type             text,
  bounce_reason           text,
  complained_at           timestamptz,

  -- Error
  error_code              text,
  error_message           text,

  -- Automation linkage (soft references — no FK on append-only log)
  automation_id           uuid,
  automation_run_id       uuid,

  -- Template linkage (soft references)
  template_id             uuid,
  template_version_id     uuid,

  -- AI involvement
  ai_influenced           boolean                 NOT NULL DEFAULT false,

  -- Idempotency key (prevents duplicate sends on retry)
  idempotency_key         uuid                    NOT NULL UNIQUE DEFAULT gen_uuid_v7(),

  -- Language
  language                text                    DEFAULT 'en',

  -- Scheduled send
  scheduled_for           timestamptz,

  -- Sender identity (soft reference)
  sender_identity_id      uuid,

  -- Document attachment (soft reference — immutable after send)
  attached_document_id    uuid,

  -- Append-only
  created_at              timestamptz             NOT NULL DEFAULT now()
);

-- ─── ai_logs ─────────────────────────────────────────────────
CREATE TABLE ai_logs (
  id                  uuid                PRIMARY KEY DEFAULT gen_uuid_v7(),
  company_id          uuid                NOT NULL,  -- no FK: append-only log
  triggered_by        uuid,                           -- profile id; NULL for system-triggered

  -- Context
  task_type           ai_task_type        NOT NULL,
  entity_type         text,
  entity_id           uuid,

  -- Model used
  model               text                NOT NULL,
  prompt_template     text                NOT NULL,

  -- Token usage
  input_tokens        integer             NOT NULL DEFAULT 0 CHECK (input_tokens >= 0),
  output_tokens       integer             NOT NULL DEFAULT 0 CHECK (output_tokens >= 0),
  total_tokens        integer GENERATED ALWAYS AS (input_tokens + output_tokens) STORED,

  -- Cost tracking (millicents to avoid float; 1000 millicents = 1 cent)
  cost_millicents     integer             NOT NULL DEFAULT 0 CHECK (cost_millicents >= 0),

  -- Performance
  duration_ms         integer             CHECK (duration_ms >= 0),

  -- Result
  status              ai_result_status    NOT NULL,
  confidence          smallint            CHECK (confidence >= 0 AND confidence <= 100),

  -- Operator feedback
  operator_rating     smallint            CHECK (operator_rating >= 1 AND operator_rating <= 5),
  operator_edited     boolean             NOT NULL DEFAULT false,
  edit_delta_summary  text,

  -- Error detail
  error_code          text,
  error_message       text,

  -- Append-only
  created_at          timestamptz         NOT NULL DEFAULT now()
);

-- ─── activity_logs ───────────────────────────────────────────
CREATE TABLE activity_logs (
  id              uuid          PRIMARY KEY DEFAULT gen_uuid_v7(),
  company_id      uuid          NOT NULL,  -- no FK: append-only log
  actor_id        uuid,                    -- NULL for system actions; no FK
  actor_type      text          NOT NULL   CHECK (actor_type IN ('user', 'system', 'api')),
  actor_email     text,
  actor_name      text,

  -- What happened
  action          text          NOT NULL,

  -- On what entity
  entity_type     text          NOT NULL,
  entity_id       uuid          NOT NULL,
  entity_label    text,

  -- State change
  before_state    jsonb,
  after_state     jsonb,

  -- Context metadata
  metadata        jsonb         NOT NULL DEFAULT '{}',
  ip_address      inet,
  user_agent      text,
  request_id      text,

  -- Append-only
  created_at      timestamptz   NOT NULL DEFAULT now()
);

-- ─── domain_events ───────────────────────────────────────────
CREATE TABLE domain_events (
  id              uuid          PRIMARY KEY DEFAULT gen_uuid_v7(),
  company_id      uuid          NOT NULL,  -- no FK: append-only

  -- Event identity
  event_type      text          NOT NULL,
  aggregate_type  text          NOT NULL,
  aggregate_id    uuid          NOT NULL,

  -- Full event payload
  payload         jsonb         NOT NULL,

  -- Processing state
  processed_at    timestamptz,
  processing_error text,

  -- Append-only
  created_at      timestamptz   NOT NULL DEFAULT now()
);

-- ─── Resolve forward FK references ───────────────────────────
-- ai_logs now exists; wire up FK constraints that were deferred.
ALTER TABLE quotes
  ADD CONSTRAINT fk_quotes_ai_log_id
    FOREIGN KEY (ai_log_id) REFERENCES ai_logs(id) ON DELETE SET NULL;

ALTER TABLE ai_quote_recommendations
  ADD CONSTRAINT fk_ai_quote_recs_ai_log_id
    FOREIGN KEY (ai_log_id) REFERENCES ai_logs(id) ON DELETE SET NULL;

ALTER TABLE documents
  ADD CONSTRAINT fk_documents_ai_log_id
    FOREIGN KEY (ai_log_id) REFERENCES ai_logs(id) ON DELETE SET NULL;
