-- =============================================================
-- Migration 027: Phase 1 — customers, service catalog, rates, company profile
-- =============================================================
-- See docs/PHASE_1_CUSTOMERS_CATALOG.md.
--
--   1. customers: salutation, type, company name, language, billing
--      address (needed for Swiss offers and QR-bills)
--   2. companies: Swiss defaults (CH, CHF, Europe/Zurich)
--   3. company_settings: Swiss rate fields and defaults (MWST 8.1 %, km)
--   4. rate_cards: hourly rates per team (crew size + vehicle)
--   5. service_catalog: unit label and customer-facing description
--   6. Storage bucket for company logos
-- =============================================================

-- =============================================================
-- 1. Customers
-- =============================================================

ALTER TABLE customers
  ADD COLUMN customer_type       text   NOT NULL DEFAULT 'private'
                                        CHECK (customer_type IN ('private', 'business')),
  ADD COLUMN salutation          text   CHECK (salutation IN ('mr', 'ms')),
  ADD COLUMN company_name        text,
  ADD COLUMN preferred_language  text   NOT NULL DEFAULT 'de'
                                        CHECK (preferred_language IN ('de', 'fr', 'it', 'en')),
  ADD COLUMN billing_street      text,
  ADD COLUMN billing_postal_code text,
  ADD COLUMN billing_city        text,
  ADD COLUMN billing_country     text   NOT NULL DEFAULT 'CH'
                                        CHECK (char_length(billing_country) = 2),
  ADD CONSTRAINT customers_business_has_company
    CHECK (customer_type = 'private' OR nullif(trim(company_name), '') IS NOT NULL);

-- Duplicate detection and search
CREATE INDEX idx_customers_company_email ON customers(company_id, lower(email))
  WHERE deleted_at IS NULL AND email IS NOT NULL;
CREATE INDEX idx_customers_company_phone ON customers(company_id, phone)
  WHERE deleted_at IS NULL AND phone IS NOT NULL;
CREATE INDEX idx_customers_company_name ON customers(company_id, lower(last_name), lower(first_name))
  WHERE deleted_at IS NULL;

-- =============================================================
-- 2. Company defaults for Switzerland
-- =============================================================

ALTER TABLE companies ALTER COLUMN country  SET DEFAULT 'CH';
ALTER TABLE companies ALTER COLUMN currency SET DEFAULT 'CHF';
ALTER TABLE companies ALTER COLUMN timezone SET DEFAULT 'Europe/Zurich';

-- Swiss companies created before this migration still carry the US defaults
UPDATE companies
   SET currency = 'CHF', timezone = 'Europe/Zurich'
 WHERE country = 'CH' AND currency = 'USD';

ALTER TABLE companies
  ADD CONSTRAINT companies_accent_color_hex
    CHECK (accent_color IS NULL OR accent_color ~ '^#[0-9a-fA-F]{6}$');

-- =============================================================
-- 3. Company settings (rates)
-- =============================================================
-- The per-mile column stays for compatibility but is no longer used;
-- distances are kilometres.

ALTER TABLE company_settings
  ADD COLUMN travel_flat_fee_cents      integer       NOT NULL DEFAULT 0 CHECK (travel_flat_fee_cents >= 0),
  ADD COLUMN rate_per_km_cents          integer       NOT NULL DEFAULT 0 CHECK (rate_per_km_cents >= 0),
  ADD COLUMN weekend_surcharge_percent  numeric(5,2)  NOT NULL DEFAULT 0
                                          CHECK (weekend_surcharge_percent >= 0 AND weekend_surcharge_percent <= 100);

COMMENT ON COLUMN company_settings.long_distance_rate_per_mile_cents IS
  'Deprecated (migration 027): use rate_per_km_cents.';
COMMENT ON COLUMN company_settings.stair_carry_rate_cents IS
  'Surcharge per floor without lift (cents).';
COMMENT ON COLUMN company_settings.long_carry_rate_cents IS
  'Surcharge for long carry distance from parking to entrance (cents).';

ALTER TABLE company_settings ALTER COLUMN tax_enabled              SET DEFAULT true;
ALTER TABLE company_settings ALTER COLUMN tax_rate_percent         SET DEFAULT 8.1;
ALTER TABLE company_settings ALTER COLUMN tax_label                SET DEFAULT 'MWST';
ALTER TABLE company_settings ALTER COLUMN default_payment_terms_days SET DEFAULT 30;

-- Settings rows that were never configured get the Swiss defaults
UPDATE company_settings s
   SET tax_enabled = true, tax_rate_percent = 8.1, tax_label = 'MWST'
  FROM companies c
 WHERE c.id = s.company_id
   AND c.country = 'CH'
   AND coalesce(s.tax_rate_percent, 0) = 0
   AND coalesce(s.tax_label, 'Tax') = 'Tax';

-- =============================================================
-- 4. Rate cards — hourly rate per team
-- =============================================================
-- Swiss movers price "2 Mann + Lieferwagen", "3 Mann + LKW 3.5 t" …
-- per hour. One row per team configuration.

CREATE TABLE rate_cards (
  id                  uuid          PRIMARY KEY DEFAULT gen_uuid_v7(),
  company_id          uuid          NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name                text          NOT NULL CHECK (char_length(trim(name)) > 0),
  crew_size           integer       NOT NULL CHECK (crew_size BETWEEN 1 AND 20),
  vehicle_type        vehicle_type,
  hourly_rate_cents   integer       NOT NULL CHECK (hourly_rate_cents >= 0),
  hourly_cost_cents   integer       NOT NULL DEFAULT 0 CHECK (hourly_cost_cents >= 0),
  is_active           boolean       NOT NULL DEFAULT true,
  sort_order          integer       NOT NULL DEFAULT 0,
  deleted_at          timestamptz,
  created_at          timestamptz   NOT NULL DEFAULT now(),
  updated_at          timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX idx_rate_cards_company ON rate_cards(company_id, sort_order) WHERE deleted_at IS NULL;

CREATE TRIGGER trg_rate_cards_updated_at
  BEFORE UPDATE ON rate_cards
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE rate_cards ENABLE ROW LEVEL SECURITY;

-- Read: the whole company (quote builder). Write: server only, after the
-- settings.services permission check (same pattern as service_catalog).
CREATE POLICY "rate_cards_select" ON rate_cards
  FOR SELECT USING (company_id = public.auth_company_id());

GRANT SELECT ON TABLE rate_cards TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE rate_cards TO service_role;

-- =============================================================
-- 5. Service catalog
-- =============================================================

ALTER TABLE service_catalog
  ADD COLUMN customer_description text;

COMMENT ON COLUMN service_catalog.description IS 'Internal description (office only).';
COMMENT ON COLUMN service_catalog.customer_description IS 'Text shown to the customer on offers.';

CREATE UNIQUE INDEX idx_service_catalog_unique_name
  ON service_catalog(company_id, lower(name))
  WHERE deleted_at IS NULL;

-- =============================================================
-- 6. Company logos (public bucket, written by the server only)
-- =============================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('company-logos', 'company-logos', true, 1048576, ARRAY['image/png', 'image/jpeg', 'image/webp'])
ON CONFLICT (id) DO NOTHING;
