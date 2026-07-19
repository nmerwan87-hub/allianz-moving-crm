-- =============================================================
-- Migration 007: Quotes — quotes, quote_items, quote_versions,
--                          ai_quote_recommendations
-- =============================================================
-- Depends on: 002 (companies, profiles), 003 (customers, leads),
--             005 (service_catalog)
-- Forward dependencies:
--   quotes.ai_log_id → ai_logs (created in 012)
--   ai_quote_recommendations.ai_log_id → ai_logs (created in 012)
--   FK constraints for ai_log_id added at end of migration 012.
-- =============================================================

-- ─── quotes ──────────────────────────────────────────────────
CREATE TABLE quotes (
  id                      uuid          PRIMARY KEY DEFAULT gen_uuid_v7(),
  company_id              uuid          NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  lead_id                 uuid          REFERENCES leads(id) ON DELETE RESTRICT,
  customer_id             uuid          REFERENCES customers(id) ON DELETE RESTRICT,
  created_by              uuid          REFERENCES profiles(id) ON DELETE SET NULL,

  -- Human-readable identifier (QT-2026-001)
  quote_number            text          NOT NULL,

  -- Versioning
  version                 integer       NOT NULL DEFAULT 1,
  parent_quote_id         uuid          REFERENCES quotes(id) ON DELETE SET NULL,

  -- Lifecycle
  status                  quote_status  NOT NULL DEFAULT 'draft',

  -- Move snapshot
  move_type               move_type     NOT NULL,
  scheduled_date          date,
  date_flexible           boolean       NOT NULL DEFAULT false,
  property_size           property_size,

  -- Origin snapshot
  origin_address          text,
  origin_city             text,
  origin_state            text,
  origin_postal_code      text,
  origin_country          text,
  origin_floor            smallint,
  origin_has_elevator     boolean       NOT NULL DEFAULT false,
  origin_has_stairs       boolean       NOT NULL DEFAULT false,

  -- Destination snapshot
  dest_address            text,
  dest_city               text,
  dest_state              text,
  dest_postal_code        text,
  dest_country            text,
  dest_floor              smallint,
  dest_has_elevator       boolean       NOT NULL DEFAULT false,
  dest_has_stairs         boolean       NOT NULL DEFAULT false,

  -- Estimated scope
  distance_miles          numeric(8,2),
  estimated_hours         numeric(4,2),

  -- Pricing (all in cents)
  subtotal_cents          integer       NOT NULL DEFAULT 0 CHECK (subtotal_cents >= 0),
  discount_cents          integer       NOT NULL DEFAULT 0 CHECK (discount_cents >= 0),
  discount_reason         text,
  tax_rate_percent        numeric(5,2)  NOT NULL DEFAULT 0 CHECK (tax_rate_percent >= 0),
  tax_cents               integer       NOT NULL DEFAULT 0 CHECK (tax_cents >= 0),
  total_amount_cents      integer       NOT NULL DEFAULT 0 CHECK (total_amount_cents >= 0),
  deposit_percent         numeric(5,2)  NOT NULL DEFAULT 20
                            CHECK (deposit_percent >= 0 AND deposit_percent <= 100),
  deposit_amount_cents    integer       NOT NULL DEFAULT 0 CHECK (deposit_amount_cents >= 0),

  -- AI generation metadata
  ai_generated            boolean       NOT NULL DEFAULT false,
  ai_confidence           smallint      CHECK (ai_confidence >= 0 AND ai_confidence <= 100),
  ai_log_id               uuid,         -- soft ref to ai_logs(id); FK added in migration 012

  -- Communication tracking
  sent_at                 timestamptz,
  viewed_at               timestamptz,
  view_count              integer       NOT NULL DEFAULT 0,
  accepted_at             timestamptz,
  declined_at             timestamptz,
  declined_reason         text,
  expires_at              timestamptz,

  -- Customer portal
  portal_token            text,
  portal_token_expires_at timestamptz,

  -- Agreement
  terms_accepted          boolean       NOT NULL DEFAULT false,
  terms_accepted_at       timestamptz,
  signature_url           text,

  -- Notes
  customer_notes          text,
  internal_notes          text,

  -- Soft delete
  deleted_at              timestamptz,

  -- Timestamps
  created_at              timestamptz   NOT NULL DEFAULT now(),
  updated_at              timestamptz   NOT NULL DEFAULT now(),

  CONSTRAINT quotes_accepted_at_required
    CHECK (status != 'accepted' OR accepted_at IS NOT NULL),
  CONSTRAINT quotes_declined_reason_required
    CHECK (status != 'declined' OR declined_reason IS NOT NULL),
  CONSTRAINT quotes_deposit_lte_total
    CHECK (deposit_amount_cents <= total_amount_cents)
);

-- Unique quote number per company
CREATE UNIQUE INDEX idx_quotes_number
  ON quotes(company_id, quote_number);

-- Unique portal token (partial: only for non-null tokens)
CREATE UNIQUE INDEX idx_quotes_portal_token
  ON quotes(portal_token)
  WHERE portal_token IS NOT NULL;

-- ─── quote_items ─────────────────────────────────────────────
CREATE TABLE quote_items (
  id                      uuid          PRIMARY KEY DEFAULT gen_uuid_v7(),
  company_id              uuid          NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  quote_id                uuid          NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  service_catalog_id      uuid          REFERENCES service_catalog(id) ON DELETE SET NULL,

  -- Item definition
  item_type               line_item_type  NOT NULL,
  name                    text          NOT NULL,
  description             text,

  -- Pricing mode
  pricing_mode            pricing_mode  NOT NULL DEFAULT 'quantity',

  -- Quantity and sell price
  quantity                numeric(8,2)  NOT NULL DEFAULT 1 CHECK (quantity != 0),
  unit                    text,
  unit_price_cents        integer       NOT NULL,

  -- Cost tracking (internal)
  cost_price_cents        integer       NOT NULL DEFAULT 0 CHECK (cost_price_cents >= 0),

  -- Discount
  discount_type           discount_type,
  discount_value          numeric(10,4),
  discount_amount_cents   integer       NOT NULL DEFAULT 0 CHECK (discount_amount_cents >= 0),

  -- Totals (computed and stored — enforced by trigger in migration 017)
  subtotal_cents          integer       NOT NULL DEFAULT 0,
  net_total_cents         integer       NOT NULL DEFAULT 0,

  -- VAT
  vat_rate_percent        numeric(5,2)  NOT NULL DEFAULT 0
                            CHECK (vat_rate_percent >= 0 AND vat_rate_percent <= 100),
  vat_amount_cents        integer       NOT NULL DEFAULT 0 CHECK (vat_amount_cents >= 0),

  -- Gross total
  gross_total_cents       integer       NOT NULL DEFAULT 0,

  -- Notes
  internal_notes          text,
  customer_notes          text,

  -- Display
  sort_order              integer       NOT NULL DEFAULT 0,

  -- Timestamps (no soft delete — cascade-deleted with parent quote)
  created_at              timestamptz   NOT NULL DEFAULT now(),
  updated_at              timestamptz   NOT NULL DEFAULT now(),

  CONSTRAINT quote_items_discount_value_required
    CHECK (discount_type IS NULL OR discount_value IS NOT NULL)
);

-- ─── quote_versions ──────────────────────────────────────────
-- Immutable snapshots. Append-only — no updated_at, no deleted_at.
CREATE TABLE quote_versions (
  id                      uuid          PRIMARY KEY DEFAULT gen_uuid_v7(),
  company_id              uuid          NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  quote_id                uuid          NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  version                 integer       NOT NULL,
  created_by              uuid          REFERENCES profiles(id) ON DELETE SET NULL,

  -- Complete snapshot of quote + items at this version
  snapshot                jsonb         NOT NULL,
  total_amount_cents      integer       NOT NULL,
  change_summary          text,

  -- Append-only
  created_at              timestamptz   NOT NULL DEFAULT now()
);

-- One snapshot per version per quote
CREATE UNIQUE INDEX idx_quote_versions_number
  ON quote_versions(quote_id, version);

-- ─── ai_quote_recommendations ────────────────────────────────
-- AI operational recommendations alongside quote estimates.
-- Append-only — no updated_at, no deleted_at.
CREATE TABLE ai_quote_recommendations (
  id                              uuid          PRIMARY KEY DEFAULT gen_uuid_v7(),
  company_id                      uuid          NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  quote_id                        uuid          NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  ai_log_id                       uuid,         -- soft ref to ai_logs(id); FK added in migration 012

  -- Operational recommendations
  recommended_crew_size           smallint,
  recommended_lead_count          smallint,
  recommended_mover_count         smallint,
  recommended_vehicle_type        vehicle_type,
  recommended_vehicle_count       smallint,
  recommended_vehicle_size_cuft   integer,

  -- Time estimates (decimal hours)
  estimated_total_hours           numeric(5,2),
  estimated_loading_hours         numeric(5,2),
  estimated_travel_hours          numeric(5,2),
  estimated_unloading_hours       numeric(5,2),
  estimated_packing_hours         numeric(5,2),
  recommended_buffer_hours        numeric(5,2),

  -- Assessment flags
  furniture_lift_required         boolean       NOT NULL DEFAULT false,
  long_carry_required             boolean       NOT NULL DEFAULT false,
  long_carry_distance_ft          integer,
  stair_count_origin              smallint,
  stair_count_dest                smallint,
  packing_materials_required      boolean       NOT NULL DEFAULT false,
  specialty_items_present         boolean       NOT NULL DEFAULT false,
  specialty_item_notes            text,

  -- Financial estimates
  estimated_total_price_cents     integer,
  estimated_cost_cents            integer,
  estimated_margin_percent        numeric(5,2),

  -- AI meta
  confidence_score                smallint      CHECK (confidence_score >= 0 AND confidence_score <= 100),
  reasoning_summary               text,

  -- Override tracking
  operator_crew_size              smallint,
  operator_total_hours            numeric(5,2),
  operator_overrode_at            timestamptz,
  overriding_user                 uuid          REFERENCES profiles(id) ON DELETE SET NULL,

  -- Append-only
  created_at                      timestamptz   NOT NULL DEFAULT now()
);
