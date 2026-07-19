-- =============================================================
-- Migration 005: Catalog & Settings — service_catalog, company_settings
-- =============================================================
-- Depends on: 002 (companies)
-- =============================================================

-- ─── service_catalog ─────────────────────────────────────────
CREATE TABLE service_catalog (
  id                          uuid          PRIMARY KEY DEFAULT gen_uuid_v7(),
  company_id                  uuid          NOT NULL REFERENCES companies(id) ON DELETE CASCADE,

  -- Service identity
  name                        text          NOT NULL,
  description                 text,
  category                    text,

  -- Defaults (can be overridden per quote item)
  default_pricing_mode        pricing_mode  NOT NULL DEFAULT 'quantity',
  default_unit_label          text,
  default_unit_price_cents    integer       DEFAULT 0 CHECK (default_unit_price_cents >= 0),
  default_cost_price_cents    integer       DEFAULT 0 CHECK (default_cost_price_cents >= 0),
  default_vat_rate_percent    numeric(5,2)  DEFAULT 0
                                CHECK (default_vat_rate_percent >= 0 AND default_vat_rate_percent <= 100),

  -- Status
  is_active                   boolean       NOT NULL DEFAULT true,
  is_system_default           boolean       NOT NULL DEFAULT false,

  -- Display
  sort_order                  integer       NOT NULL DEFAULT 0,

  -- Soft delete
  deleted_at                  timestamptz,

  -- Timestamps
  created_at                  timestamptz   NOT NULL DEFAULT now(),
  updated_at                  timestamptz   NOT NULL DEFAULT now()
);

-- Only one active service name per company (excludes soft-deleted rows)
CREATE UNIQUE INDEX idx_service_catalog_unique_active
  ON service_catalog(company_id, name)
  WHERE deleted_at IS NULL;

-- ─── company_settings ────────────────────────────────────────
-- One row per company (1:1). Created by application on signup.
CREATE TABLE company_settings (
  id                                  uuid          PRIMARY KEY DEFAULT gen_uuid_v7(),
  company_id                          uuid          NOT NULL UNIQUE REFERENCES companies(id) ON DELETE CASCADE,

  -- Rate configuration
  local_rate_per_hour_cents           integer       DEFAULT 0 CHECK (local_rate_per_hour_cents >= 0),
  long_distance_rate_per_mile_cents   integer       DEFAULT 0 CHECK (long_distance_rate_per_mile_cents >= 0),
  minimum_charge_cents                integer       DEFAULT 0 CHECK (minimum_charge_cents >= 0),
  minimum_hours                       numeric(4,2)  DEFAULT 2,

  -- Surcharges
  fuel_surcharge_percent              numeric(5,2)  DEFAULT 0 CHECK (fuel_surcharge_percent >= 0),
  stair_carry_rate_cents              integer       DEFAULT 0,
  long_carry_rate_cents               integer       DEFAULT 0,
  elevator_wait_rate_cents            integer       DEFAULT 0,

  -- Quote defaults
  default_deposit_percent             numeric(5,2)  DEFAULT 20,
  default_quote_expiry_days           integer       DEFAULT 30 CHECK (default_quote_expiry_days > 0),
  quote_footer_text                   text,

  -- Invoice defaults
  default_payment_terms_days          integer       DEFAULT 7 CHECK (default_payment_terms_days >= 0),
  invoice_footer_text                 text,

  -- Tax
  tax_enabled                         boolean       DEFAULT false,
  tax_rate_percent                    numeric(5,2)  DEFAULT 0
                                        CHECK (tax_rate_percent >= 0 AND tax_rate_percent <= 100),
  tax_label                           text          DEFAULT 'Tax',

  -- Notification preferences
  alert_email                         text,

  -- Terms and conditions
  service_agreement_text              text,

  -- Timestamps
  created_at                          timestamptz   NOT NULL DEFAULT now(),
  updated_at                          timestamptz   NOT NULL DEFAULT now()
);
