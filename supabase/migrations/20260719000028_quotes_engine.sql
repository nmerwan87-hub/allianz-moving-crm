-- =============================================================
-- Migration 028: Quote engine — server-side totals, locking, revisions
-- =============================================================
-- See docs/QUOTES.md.
--
--   1. quotes: cost cap, document language, km distance, title
--   2. quote_status 'superseded' + transitions
--   3. quote_items: line totals computed by the database
--   4. quotes: totals always recomputed from items (cannot be written)
--   5. Sent quotes are frozen (items and content columns)
--   6. Guard: no sending above the cost cap
--   7. replace_quote_items() — atomic save of all lines
--   8. create_quote_revision() — new version, old one superseded
--   9. Private 'documents' storage bucket
-- =============================================================

-- =============================================================
-- 1. Quote columns
-- =============================================================

ALTER TABLE quotes
  ADD COLUMN title             text,
  ADD COLUMN language          text      NOT NULL DEFAULT 'de'
                                         CHECK (language IN ('de', 'fr', 'it', 'en')),
  ADD COLUMN cost_cap_cents    integer   CHECK (cost_cap_cents IS NULL OR cost_cap_cents > 0),
  ADD COLUMN distance_km       numeric(8,1) CHECK (distance_km IS NULL OR distance_km >= 0);

-- Swiss defaults for addresses (jobs required a country and defaulted to US)
ALTER TABLE quotes ALTER COLUMN origin_country SET DEFAULT 'CH';
ALTER TABLE quotes ALTER COLUMN dest_country   SET DEFAULT 'CH';
ALTER TABLE jobs   ALTER COLUMN origin_country SET DEFAULT 'CH';
ALTER TABLE jobs   ALTER COLUMN dest_country   SET DEFAULT 'CH';

COMMENT ON COLUMN quotes.cost_cap_cents IS
  'Kostendach: maximum total incl. VAT the customer pays. Sending is refused while the total exceeds it.';
COMMENT ON COLUMN quotes.distance_miles IS 'Deprecated (migration 028): use distance_km.';

-- One open draft per quote number (a revision in progress)
CREATE UNIQUE INDEX idx_quotes_one_draft_per_number
  ON quotes(company_id, quote_number)
  WHERE status = 'draft' AND deleted_at IS NULL;

-- Versions share their quote number (PDF_ENGINE.md §5.1). The number alone
-- was unique since migration 007; uniqueness moves to number + version.
DROP INDEX idx_quotes_number;
CREATE UNIQUE INDEX idx_quotes_number_version
  ON quotes(company_id, quote_number, version);

-- =============================================================
-- 2. Superseded versions
-- =============================================================

ALTER TYPE quote_status ADD VALUE IF NOT EXISTS 'superseded';

INSERT INTO workflow_transitions (entity_type, from_status, to_status, system_only, reason_column, stamp_column) VALUES
  ('quote', 'sent',   'superseded', false, NULL, NULL),
  ('quote', 'viewed', 'superseded', false, NULL, NULL);

-- =============================================================
-- 3. Line totals — computed, never trusted from the client
-- =============================================================
-- Rounding: half away from zero to the Rappen.
-- discount_value: percent for 'percent', cents for 'fixed'.
-- 'manual' lines: quantity 1, unit_price_cents is the line amount.

CREATE OR REPLACE FUNCTION public.round_cents(p_value numeric)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT (sign(p_value) * floor(abs(p_value) + 0.5))::integer;
$$;

CREATE OR REPLACE FUNCTION public.compute_quote_item()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.quantity <= 0 THEN
    RAISE EXCEPTION 'invalid_line: quantity must be greater than zero' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.unit_price_cents < 0 THEN
    RAISE EXCEPTION 'invalid_line: price must not be negative' USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.pricing_mode = 'manual' THEN
    NEW.quantity := 1;
  END IF;

  NEW.subtotal_cents := public.round_cents(NEW.quantity * NEW.unit_price_cents);

  NEW.discount_amount_cents := CASE NEW.discount_type
    WHEN 'percent' THEN public.round_cents(NEW.subtotal_cents * NEW.discount_value / 100)
    WHEN 'fixed'   THEN public.round_cents(NEW.discount_value)
    ELSE 0
  END;

  IF NEW.discount_type = 'percent' AND (NEW.discount_value < 0 OR NEW.discount_value > 100) THEN
    RAISE EXCEPTION 'invalid_line: discount must be between 0 and 100 %%' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.discount_amount_cents < 0 OR NEW.discount_amount_cents > NEW.subtotal_cents THEN
    RAISE EXCEPTION 'invalid_line: discount must not exceed the line amount' USING ERRCODE = 'check_violation';
  END IF;

  NEW.net_total_cents   := NEW.subtotal_cents - NEW.discount_amount_cents;
  NEW.vat_amount_cents  := public.round_cents(NEW.net_total_cents * NEW.vat_rate_percent / 100);
  NEW.gross_total_cents := NEW.net_total_cents + NEW.vat_amount_cents;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_quote_items_compute
  BEFORE INSERT OR UPDATE ON quote_items
  FOR EACH ROW EXECUTE FUNCTION public.compute_quote_item();

-- =============================================================
-- 4. Quote totals — always derived from the lines
-- =============================================================

CREATE OR REPLACE FUNCTION public.compute_quote_totals()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_subtotal integer;
  v_discount integer;
  v_tax      integer;
  v_total    integer;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_subtotal := 0; v_discount := 0; v_tax := 0; v_total := 0;
  ELSE
    SELECT coalesce(sum(subtotal_cents), 0),
           coalesce(sum(discount_amount_cents), 0),
           coalesce(sum(vat_amount_cents), 0),
           coalesce(sum(gross_total_cents), 0)
      INTO v_subtotal, v_discount, v_tax, v_total
      FROM public.quote_items
     WHERE quote_id = NEW.id;
  END IF;

  NEW.subtotal_cents       := v_subtotal;
  NEW.discount_cents       := v_discount;
  NEW.tax_cents            := v_tax;
  NEW.total_amount_cents   := v_total;
  NEW.deposit_amount_cents := public.round_cents(v_total * NEW.deposit_percent / 100);
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_quotes_compute_totals
  BEFORE INSERT OR UPDATE ON quotes
  FOR EACH ROW EXECUTE FUNCTION public.compute_quote_totals();

-- Line change → touch the quote so its totals are recomputed
CREATE OR REPLACE FUNCTION public.touch_quote_after_item_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  UPDATE public.quotes SET updated_at = now()
   WHERE id = coalesce(NEW.quote_id, OLD.quote_id);
  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_quote_items_touch_quote
  AFTER INSERT OR UPDATE OR DELETE ON quote_items
  FOR EACH ROW EXECUTE FUNCTION public.touch_quote_after_item_change();

-- =============================================================
-- 5. Frozen after sending
-- =============================================================
-- A quote that left the company is a commercial record. Its lines and
-- content columns cannot change; changes need a new version.

CREATE OR REPLACE FUNCTION public.reject_locked_quote_item_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_status text;
BEGIN
  SELECT status::text INTO v_status FROM public.quotes WHERE id = coalesce(NEW.quote_id, OLD.quote_id);
  -- Parent already gone (cascade from quote deletion) → allow
  IF v_status IS NULL THEN
    RETURN coalesce(NEW, OLD);
  END IF;
  IF v_status <> 'draft' THEN
    RAISE EXCEPTION 'quote_locked: lines of a % quote cannot be changed; create a new version', v_status
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN coalesce(NEW, OLD);
END;
$$;

CREATE TRIGGER trg_quote_items_locked
  BEFORE INSERT OR UPDATE OR DELETE ON quote_items
  FOR EACH ROW EXECUTE FUNCTION public.reject_locked_quote_item_change();

CREATE OR REPLACE FUNCTION public.reject_locked_quote_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  -- Columns that may still change after sending (lifecycle and internal fields)
  v_mutable text[] := ARRAY[
    'status', 'updated_at', 'sent_at', 'viewed_at', 'view_count', 'accepted_at',
    'declined_at', 'declined_reason', 'portal_token', 'portal_token_expires_at',
    'terms_accepted', 'terms_accepted_at', 'signature_url', 'internal_notes',
    'deleted_at', 'lead_id'
  ];
BEGIN
  IF OLD.status = 'draft' THEN
    RETURN NEW;
  END IF;
  IF (to_jsonb(NEW) - v_mutable) IS DISTINCT FROM (to_jsonb(OLD) - v_mutable) THEN
    RAISE EXCEPTION 'quote_locked: a % quote cannot be edited; create a new version', OLD.status
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

-- Runs after the totals trigger (alphabetical: compute < locked)
CREATE TRIGGER trg_quotes_locked
  BEFORE UPDATE ON quotes
  FOR EACH ROW EXECUTE FUNCTION public.reject_locked_quote_change();

-- =============================================================
-- 6. Cost cap guard on sending (extends enforce_status_transition)
-- =============================================================

CREATE OR REPLACE FUNCTION public.enforce_quote_send_rules()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status = 'draft' AND NEW.status = 'sent' THEN
    IF NEW.cost_cap_cents IS NOT NULL AND NEW.total_amount_cents > NEW.cost_cap_cents THEN
      RAISE EXCEPTION 'guard_failed: quote total exceeds the cost cap'
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.expires_at IS NOT NULL AND NEW.expires_at <= now() THEN
      RAISE EXCEPTION 'guard_failed: validity date must be in the future'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_quotes_send_rules
  BEFORE UPDATE OF status ON quotes
  FOR EACH ROW EXECUTE FUNCTION public.enforce_quote_send_rules();

-- =============================================================
-- 7. replace_quote_items() — save all lines atomically
-- =============================================================
-- SECURITY INVOKER: RLS on quotes decides visibility. Line rows are
-- written with the definer helper below because users have no DELETE
-- policy on quote_items (lines are only ever replaced as a whole).

CREATE OR REPLACE FUNCTION public.replace_quote_items(p_quote_id uuid, p_items jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_catalog
AS $$
DECLARE
  v_company_id uuid;
  v_status     text;
  v_count      integer;
BEGIN
  SELECT company_id, status::text INTO v_company_id, v_status
    FROM public.quotes
   WHERE id = p_quote_id AND deleted_at IS NULL;

  IF v_company_id IS NULL
     OR (public.is_user_request() AND v_company_id IS DISTINCT FROM public.auth_company_id()) THEN
    RAISE EXCEPTION 'not_found: quote %', p_quote_id USING ERRCODE = 'no_data_found';
  END IF;
  IF v_status <> 'draft' THEN
    RAISE EXCEPTION 'quote_locked: lines of a % quote cannot be changed; create a new version', v_status
      USING ERRCODE = 'check_violation';
  END IF;
  IF jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) > 200 THEN
    RAISE EXCEPTION 'invalid_line: expected up to 200 lines' USING ERRCODE = 'check_violation';
  END IF;

  DELETE FROM public.quote_items WHERE quote_id = p_quote_id;

  INSERT INTO public.quote_items (
    company_id, quote_id, service_catalog_id, item_type, name, description, pricing_mode,
    quantity, unit, unit_price_cents, cost_price_cents, discount_type, discount_value,
    vat_rate_percent, internal_notes, customer_notes, sort_order
  )
  SELECT
    v_company_id, p_quote_id,
    -- a catalog reference must belong to the same company
    (SELECT s.id FROM public.service_catalog s
      WHERE s.id = nullif(i ->> 'service_catalog_id', '')::uuid AND s.company_id = v_company_id),
    coalesce(nullif(i ->> 'item_type', ''), 'other')::line_item_type,
    i ->> 'name',
    nullif(i ->> 'description', ''),
    coalesce(nullif(i ->> 'pricing_mode', ''), 'quantity')::pricing_mode,
    (i ->> 'quantity')::numeric,
    nullif(i ->> 'unit', ''),
    (i ->> 'unit_price_cents')::integer,
    coalesce((i ->> 'cost_price_cents')::integer, 0),
    nullif(i ->> 'discount_type', '')::discount_type,
    nullif(i ->> 'discount_value', '')::numeric,
    coalesce((i ->> 'vat_rate_percent')::numeric, 0),
    nullif(i ->> 'internal_notes', ''),
    nullif(i ->> 'customer_notes', ''),
    ord::integer
  FROM jsonb_array_elements(p_items) WITH ORDINALITY AS t(i, ord);

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.replace_quote_items(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.replace_quote_items(uuid, jsonb) TO authenticated, service_role;

-- =============================================================
-- 8. create_quote_revision()
-- =============================================================
-- Copies a sent/viewed/expired/declined quote with its lines into a new
-- draft (same number, version + 1). A sent or viewed predecessor becomes
-- 'superseded' — the customer can no longer accept the old version.

CREATE OR REPLACE FUNCTION public.create_quote_revision(p_quote_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_catalog
AS $$
DECLARE
  v_old     public.quotes%ROWTYPE;
  v_new_id  uuid;
  v_version integer;
BEGIN
  SELECT * INTO v_old FROM public.quotes WHERE id = p_quote_id AND deleted_at IS NULL;
  IF v_old.id IS NULL
     OR (public.is_user_request() AND v_old.company_id IS DISTINCT FROM public.auth_company_id()) THEN
    RAISE EXCEPTION 'not_found: quote %', p_quote_id USING ERRCODE = 'no_data_found';
  END IF;
  IF v_old.status NOT IN ('sent', 'viewed', 'expired', 'declined') THEN
    RAISE EXCEPTION 'guard_failed: only sent, viewed, expired or declined quotes can be revised'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT max(version) + 1 INTO v_version
    FROM public.quotes
   WHERE company_id = v_old.company_id AND quote_number = v_old.quote_number;

  INSERT INTO public.quotes (
    company_id, lead_id, customer_id, created_by, quote_number, version, parent_quote_id,
    status, move_type, scheduled_date, date_flexible, property_size,
    origin_address, origin_city, origin_state, origin_postal_code, origin_country,
    origin_floor, origin_has_elevator, origin_has_stairs,
    dest_address, dest_city, dest_state, dest_postal_code, dest_country,
    dest_floor, dest_has_elevator, dest_has_stairs,
    distance_km, estimated_hours, discount_reason, tax_rate_percent, deposit_percent,
    customer_notes, internal_notes, title, language, cost_cap_cents, expires_at
  ) VALUES (
    v_old.company_id, v_old.lead_id, v_old.customer_id,
    CASE WHEN public.is_user_request() THEN auth.uid() ELSE v_old.created_by END,
    v_old.quote_number, v_version, coalesce(v_old.parent_quote_id, v_old.id),
    'draft', v_old.move_type, v_old.scheduled_date, v_old.date_flexible, v_old.property_size,
    v_old.origin_address, v_old.origin_city, v_old.origin_state, v_old.origin_postal_code, v_old.origin_country,
    v_old.origin_floor, v_old.origin_has_elevator, v_old.origin_has_stairs,
    v_old.dest_address, v_old.dest_city, v_old.dest_state, v_old.dest_postal_code, v_old.dest_country,
    v_old.dest_floor, v_old.dest_has_elevator, v_old.dest_has_stairs,
    v_old.distance_km, v_old.estimated_hours, v_old.discount_reason, v_old.tax_rate_percent, v_old.deposit_percent,
    v_old.customer_notes, v_old.internal_notes, v_old.title, v_old.language, v_old.cost_cap_cents,
    -- A new version gets a fresh validity period from the company's terms
    (current_date + coalesce(
      (SELECT default_quote_expiry_days FROM public.company_settings WHERE company_id = v_old.company_id),
      30))::timestamptz
  )
  RETURNING id INTO v_new_id;

  INSERT INTO public.quote_items (
    company_id, quote_id, service_catalog_id, item_type, name, description, pricing_mode,
    quantity, unit, unit_price_cents, cost_price_cents, discount_type, discount_value,
    vat_rate_percent, internal_notes, customer_notes, sort_order
  )
  SELECT company_id, v_new_id, service_catalog_id, item_type, name, description, pricing_mode,
         quantity, unit, unit_price_cents, cost_price_cents, discount_type, discount_value,
         vat_rate_percent, internal_notes, customer_notes, sort_order
    FROM public.quote_items
   WHERE quote_id = v_old.id;

  IF v_old.status IN ('sent', 'viewed') THEN
    UPDATE public.quotes SET status = 'superseded' WHERE id = v_old.id;
  END IF;

  RETURN v_new_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_quote_revision(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_quote_revision(uuid) TO authenticated, service_role;

-- =============================================================
-- 9. Private document storage
-- =============================================================
-- No storage policies for users: the server reads and writes with the
-- service role after its own authorization check and hands out
-- short-lived signed URLs (PDF_ENGINE.md §12).

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('documents', 'documents', false, 10485760, ARRAY['application/pdf'])
ON CONFLICT (id) DO NOTHING;
