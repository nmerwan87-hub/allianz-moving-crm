-- =============================================================
-- Migration 010: Documents — document_templates, documents
-- =============================================================
-- Depends on: 002 (companies, profiles)
-- Forward dependencies:
--   documents.ai_log_id → ai_logs (created in 012)
--   FK constraint added at end of migration 012.
-- Note: documents.entity_id is a polymorphic FK — validated by trigger
--       in migration 017, not via SQL FK constraint.
-- =============================================================

-- ─── document_templates ──────────────────────────────────────
-- System table for HTML rendering templates. Managed by Bivro developers.
-- No tenant RLS — read access for the generation service only.
CREATE TABLE document_templates (
  id                    uuid              PRIMARY KEY DEFAULT gen_uuid_v7(),

  -- Identity
  document_type         document_type     NOT NULL,
  language              text              NOT NULL DEFAULT 'en',
  jurisdiction_profile  text,
  name                  text              NOT NULL,
  version               text              NOT NULL,
  is_current            boolean           NOT NULL DEFAULT false,

  -- Template content
  template_html         text              NOT NULL,
  variables_required    text[]            NOT NULL DEFAULT '{}',
  variables_optional    text[]            NOT NULL DEFAULT '{}',

  -- Deployment tracking
  released_at           timestamptz,
  released_by           text,             -- developer identifier; not a FK

  -- Append-only
  created_at            timestamptz       NOT NULL DEFAULT now()
);

-- Only one current template per (type, language, jurisdiction_profile)
CREATE UNIQUE INDEX idx_doc_templates_current
  ON document_templates(document_type, language, jurisdiction_profile)
  WHERE is_current = true;

-- Unique version per (type, language, jurisdiction_profile)
CREATE UNIQUE INDEX idx_doc_templates_version
  ON document_templates(document_type, language, jurisdiction_profile, version);

-- ─── documents ───────────────────────────────────────────────
-- Storage references for all files. Generated documents are immutable
-- once generation_status = 'generated' (enforced by trigger in migration 017).
CREATE TABLE documents (
  id                      uuid                          PRIMARY KEY DEFAULT gen_uuid_v7(),
  company_id              uuid                          NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,

  -- Entity relationship (polymorphic — trigger validates entity_id)
  entity_type             document_entity_type          NOT NULL,
  entity_id               uuid                          NOT NULL,

  -- Classification
  document_type           document_type                 NOT NULL,
  name                    text                          NOT NULL,
  language                text                          NOT NULL DEFAULT 'en',
  jurisdiction_profile    text,

  -- Versioning
  version                 integer                       NOT NULL DEFAULT 1,
  supersedes_id           uuid                          REFERENCES documents(id) ON DELETE SET NULL,
  superseded_at           timestamptz,

  -- Generation lifecycle
  generation_status       document_generation_status    NOT NULL DEFAULT 'pending',
  generation_source       text                          NOT NULL DEFAULT 'puppeteer',
  generated_by            uuid                          REFERENCES profiles(id) ON DELETE SET NULL,
  generated_at            timestamptz,
  generation_started_at   timestamptz,
  generation_completed_at timestamptz,
  generation_attempt      smallint                      NOT NULL DEFAULT 1
                            CHECK (generation_attempt BETWEEN 1 AND 5),
  generation_error        text,

  -- Template provenance (text, not FK, to allow template pruning)
  template_id             text,
  template_version        text,
  renderer_version        text,

  -- Storage
  storage_bucket          text                          NOT NULL DEFAULT 'documents',
  storage_path            text,
  mime_type               text                          NOT NULL DEFAULT 'application/pdf',
  file_size_bytes         integer                       CHECK (file_size_bytes > 0),
  content_hash            text,

  -- Immutable snapshot fields (written once at generation; never updated after)
  company_snapshot        jsonb,
  customer_snapshot       jsonb,
  address_snapshot        jsonb,
  service_line_snapshot   jsonb,
  financial_snapshot      jsonb,
  terms_snapshot          text,
  payment_details_snapshot jsonb,

  -- Signature state
  requires_signature      boolean                       NOT NULL DEFAULT false,
  signed_at               timestamptz,
  signed_by_name          text,
  signed_by_email         text,

  -- Void state
  voided_at               timestamptz,
  voided_by               uuid                          REFERENCES profiles(id) ON DELETE SET NULL,
  void_reason             text,

  -- AI involvement
  ai_assisted             boolean                       NOT NULL DEFAULT false,
  ai_log_id               uuid,                         -- soft ref to ai_logs(id); FK added in migration 012

  -- Portal visibility
  is_customer_visible     boolean                       NOT NULL DEFAULT false,

  -- Notes
  notes                   text,

  -- Soft delete
  deleted_at              timestamptz,

  -- Timestamps
  created_at              timestamptz                   NOT NULL DEFAULT now(),
  updated_at              timestamptz                   NOT NULL DEFAULT now()
);
