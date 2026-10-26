-- =============================================================
-- Migration 031: Final settlement, invoices, payments, reminders
-- =============================================================
-- See docs/INVOICES.md.
--
--   1. invoices: settlement fields, number only when issued, QR reference
--   2. invoice_items: same line model as quote_items (computed by the DB)
--   3. payments: CHF, cancellation reason
--   4. Totals: lines + deposits + payments, always recomputed
--   5. Frozen after issuing (lines and content columns)
--   6. Status rules: issue (number, due date, reference), money guards
--   7. Payments: validation and automatic invoice status
--   8. create_invoice_from_job() — settlement draft from the job's quote
--   9. replace_invoice_items() — atomic save of all lines
--  10. Transitions: void/write-off reasons, payment corrections
--  11. System tasks: reminders instead of a single overdue task
-- =============================================================

-- =============================================================
-- 1. Invoice columns
-- =============================================================

ALTER TABLE invoices
  ADD COLUMN quote_id                 uuid      REFERENCES quotes(id) ON DELETE SET NULL,
  ADD COLUMN title                    text,
  ADD COLUMN language                 text      NOT NULL DEFAULT 'de'
                                                CHECK (language IN ('de', 'fr', 'it', 'en')),
  ADD COLUMN currency                 text      NOT NULL DEFAULT 'CHF' CHECK (currency IN ('CHF', 'EUR')),
  ADD COLUMN service_date             date,
  ADD COLUMN payment_terms_days       integer   NOT NULL DEFAULT 30
                                                CHECK (payment_terms_days BETWEEN 0 AND 365),
  ADD COLUMN cost_cap_cents           integer   CHECK (cost_cap_cents IS NULL OR cost_cap_cents > 0),
  ADD COLUMN cost_cap_override_reason text,
  ADD COLUMN payment_reference        text,
  ADD COLUMN reminder_level           smallint  NOT NULL DEFAULT 0 CHECK (reminder_level BETWEEN 0 AND 3),
  ADD COLUMN last_reminder_at         timestamptz,
  ADD COLUMN voided_at                timestamptz,
  ADD COLUMN void_reason              text,
  ADD COLUMN write_off_reason         text;

COMMENT ON COLUMN invoices.invoice_number IS
  'Assigned when the invoice is issued (draft → sent), in the same transaction: no gaps from deleted drafts.';
COMMENT ON COLUMN invoices.cost_cap_cents IS
  'Kostendach from the accepted quote. Issuing above it needs cost_cap_override_reason.';
COMMENT ON COLUMN invoices.payment_reference IS
  'QR reference (QR-IBAN) or ISO 11649 creditor reference (RF…), set when issued.';
COMMENT ON COLUMN invoices.deposit_applied_cents IS
  'Completed deposit payments recorded on the job before invoicing (payments.invoice_id IS NULL).';

-- Drafts have no number yet
ALTER TABLE invoices ALTER COLUMN invoice_number DROP NOT NULL;
ALTER TABLE invoices ADD CONSTRAINT invoices_number_when_issued
  CHECK (status = 'draft' OR invoice_number IS NOT NULL);

-- One settlement per job (a voided invoice can be replaced)
CREATE UNIQUE INDEX idx_invoices_one_active_per_job
  ON invoices(job_id)
  WHERE status <> 'void' AND deleted_at IS NULL;

CREATE INDEX idx_invoices_quote_id ON invoices(quote_id) WHERE quote_id IS NOT NULL;

ALTER TABLE company_settings ALTER COLUMN default_payment_terms_days SET DEFAULT 30;

-- =============================================================
-- 2. Invoice lines — the quote line model
-- =============================================================

ALTER TABLE invoice_items
  ADD COLUMN service_catalog_id     uuid          REFERENCES service_catalog(id) ON DELETE SET NULL,
  ADD COLUMN pricing_mode           pricing_mode  NOT NULL DEFAULT 'quantity',
  ADD COLUMN quoted_quantity        numeric(8,2),
  ADD COLUMN discount_type          discount_type,
  ADD COLUMN discount_value         numeric(10,4),
  ADD COLUMN discount_amount_cents  integer       NOT NULL DEFAULT 0 CHECK (discount_amount_cents >= 0),
  ADD COLUMN subtotal_cents         integer       NOT NULL DEFAULT 0,
  ADD COLUMN net_total_cents        integer       NOT NULL DEFAULT 0,
  ADD COLUMN vat_rate_percent       numeric(5,2)  NOT NULL DEFAULT 0
                                      CHECK (vat_rate_percent >= 0 AND vat_rate_percent <= 100),
  ADD COLUMN vat_amount_cents       integer       NOT NULL DEFAULT 0 CHECK (vat_amount_cents >= 0),
  ADD COLUMN gross_total_cents      integer       NOT NULL DEFAULT 0,
  ADD COLUMN customer_notes         text,
  ADD CONSTRAINT invoice_items_discount_value_required
    CHECK (discount_type IS NULL OR discount_value IS NOT NULL);

ALTER TABLE invoice_items ALTER COLUMN total_price_cents SET DEFAULT 0;

COMMENT ON COLUMN invoice_items.quoted_quantity IS
  'Quantity on the accepted quote (e.g. estimated hours) — shown next to the actual quantity.';
COMMENT ON COLUMN invoice_items.total_price_cents IS 'Same as gross_total_cents (kept for compatibility).';

-- compute_quote_item() (migration 028) works on any table with the line
-- columns; invoice lines use the same arithmetic.
CREATE TRIGGER trg_invoice_items_compute
  BEFORE INSERT OR UPDATE ON invoice_items
  FOR EACH ROW EXECUTE FUNCTION public.compute_quote_item();

CREATE OR REPLACE FUNCTION public.sync_invoice_item_total()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.total_price_cents := NEW.gross_total_cents;
  RETURN NEW;
END;
$$;

-- Runs after trg_invoice_items_compute (alphabetical order)
CREATE TRIGGER trg_invoice_items_sync_total
  BEFORE INSERT OR UPDATE ON invoice_items
  FOR EACH ROW EXECUTE FUNCTION public.sync_invoice_item_total();

-- =============================================================
-- 3. Payments
-- =============================================================

ALTER TABLE payments ALTER COLUMN currency SET DEFAULT 'CHF';
ALTER TABLE payments ADD COLUMN cancellation_reason text;

-- =============================================================
-- 4. Invoice totals — derived from lines, deposits and payments
-- =============================================================

CREATE OR REPLACE FUNCTION public.compute_invoice_totals()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.subtotal_cents := 0; NEW.discount_cents := 0; NEW.tax_cents := 0; NEW.total_amount_cents := 0;
    NEW.amount_paid_cents := 0;
  ELSE
    SELECT coalesce(sum(subtotal_cents), 0),
           coalesce(sum(discount_amount_cents), 0),
           coalesce(sum(vat_amount_cents), 0),
           coalesce(sum(gross_total_cents), 0)
      INTO NEW.subtotal_cents, NEW.discount_cents, NEW.tax_cents, NEW.total_amount_cents
      FROM public.invoice_items
     WHERE invoice_id = NEW.id;

    SELECT coalesce(sum(amount_cents), 0) INTO NEW.amount_paid_cents
      FROM public.payments
     WHERE invoice_id = NEW.id AND status = 'completed' AND deleted_at IS NULL;
  END IF;

  SELECT coalesce(sum(amount_cents), 0) INTO NEW.deposit_applied_cents
    FROM public.payments
   WHERE job_id = NEW.job_id
     AND invoice_id IS NULL
     AND payment_type = 'deposit'
     AND status = 'completed'
     AND deleted_at IS NULL;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_invoices_compute_totals
  BEFORE INSERT OR UPDATE ON invoices
  FOR EACH ROW EXECUTE FUNCTION public.compute_invoice_totals();

CREATE OR REPLACE FUNCTION public.touch_invoice_after_item_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  UPDATE public.invoices SET updated_at = now()
   WHERE id = coalesce(NEW.invoice_id, OLD.invoice_id);
  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_invoice_items_touch_invoice
  AFTER INSERT OR UPDATE OR DELETE ON invoice_items
  FOR EACH ROW EXECUTE FUNCTION public.touch_invoice_after_item_change();

-- =============================================================
-- 5. Frozen after issuing
-- =============================================================
-- An issued invoice is an accounting record: lines and content columns
-- never change. Corrections: void it and settle again.

CREATE OR REPLACE FUNCTION public.reject_locked_invoice_item_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_status text;
BEGIN
  SELECT status::text INTO v_status FROM public.invoices WHERE id = coalesce(NEW.invoice_id, OLD.invoice_id);
  IF v_status IS NULL THEN
    RETURN coalesce(NEW, OLD);
  END IF;
  IF v_status <> 'draft' THEN
    RAISE EXCEPTION 'invoice_locked: lines of an issued invoice cannot be changed; void it and settle again'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN coalesce(NEW, OLD);
END;
$$;

CREATE TRIGGER trg_invoice_items_locked
  BEFORE INSERT OR UPDATE OR DELETE ON invoice_items
  FOR EACH ROW EXECUTE FUNCTION public.reject_locked_invoice_item_change();

CREATE OR REPLACE FUNCTION public.reject_locked_invoice_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  -- Lifecycle, payment and internal columns; everything else is frozen.
  -- balance_due_cents is generated (NULL in NEW inside a BEFORE trigger).
  -- due_at may move: a payment extension (Zahlungsaufschub) granted later.
  v_mutable text[] := ARRAY[
    'status', 'updated_at', 'sent_at', 'viewed_at', 'view_count', 'paid_at', 'due_at',
    'amount_paid_cents', 'deposit_applied_cents', 'balance_due_cents',
    'portal_token', 'portal_token_expires_at', 'internal_notes',
    'reminder_level', 'last_reminder_at', 'voided_at', 'void_reason', 'write_off_reason',
    'stripe_payment_intent_id', 'stripe_invoice_id'
  ];
BEGIN
  IF OLD.status = 'draft' THEN
    RETURN NEW;
  END IF;
  IF (to_jsonb(NEW) - v_mutable) IS DISTINCT FROM (to_jsonb(OLD) - v_mutable) THEN
    RAISE EXCEPTION 'invoice_locked: an issued invoice cannot be edited; void it and settle again'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

-- Runs after compute_totals and enforce_status (alphabetical order)
CREATE TRIGGER trg_invoices_locked
  BEFORE UPDATE ON invoices
  FOR EACH ROW EXECUTE FUNCTION public.reject_locked_invoice_change();

-- =============================================================
-- 6. Payment references and status rules
-- =============================================================

-- Recursive mod-10 check digit of the QR reference (Swiss Payment Standards)
CREATE OR REPLACE FUNCTION public.qr_reference_check_digit(p_digits text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_table int[] := ARRAY[0, 9, 4, 6, 8, 2, 7, 1, 3, 5];
  v_carry int := 0;
  i       int;
BEGIN
  FOR i IN 1 .. length(p_digits) LOOP
    v_carry := v_table[((v_carry + substr(p_digits, i, 1)::int) % 10) + 1];
  END LOOP;
  RETURN ((10 - v_carry) % 10)::text;
END;
$$;

-- QR-IBAN → 27-digit QR reference; other IBAN → creditor reference RF…
CREATE OR REPLACE FUNCTION public.invoice_payment_reference(p_invoice_number text, p_iban text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_iban    text := upper(regexp_replace(coalesce(p_iban, ''), '\s', '', 'g'));
  v_payload text;
  v_ref     text;
  v_numeric text := '';
  v_char    text;
  v_mod     int := 0;
  i         int;
BEGIN
  IF v_iban = '' OR p_invoice_number IS NULL THEN
    RETURN NULL;
  END IF;

  IF v_iban ~ '^(CH|LI)\d{7}' AND substr(v_iban, 5, 5)::int BETWEEN 30000 AND 31999 THEN
    v_payload := lpad(right(regexp_replace(p_invoice_number, '\D', '', 'g'), 26), 26, '0');
    RETURN v_payload || public.qr_reference_check_digit(v_payload);
  END IF;

  v_ref := left(upper(regexp_replace(p_invoice_number, '[^A-Za-z0-9]', '', 'g')), 21);
  FOR i IN 1 .. length(v_ref || 'RF00') LOOP
    v_char := substr(v_ref || 'RF00', i, 1);
    v_numeric := v_numeric || CASE WHEN v_char ~ '\d' THEN v_char ELSE (ascii(v_char) - 55)::text END;
  END LOOP;
  FOR i IN 1 .. length(v_numeric) LOOP
    v_mod := (v_mod * 10 + substr(v_numeric, i, 1)::int) % 97;
  END LOOP;
  RETURN 'RF' || lpad((98 - v_mod)::text, 2, '0') || v_ref;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_invoice_rules()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_from    text := OLD.status::text;
  v_to      text := NEW.status::text;
  v_balance bigint := NEW.total_amount_cents::bigint - NEW.deposit_applied_cents - NEW.amount_paid_cents;
  v_iban    text;
BEGIN
  IF v_from = v_to THEN
    RETURN NEW;
  END IF;

  -- Issue: number, dates and payment reference in one step
  IF v_from = 'draft' AND v_to = 'sent' THEN
    IF NEW.cost_cap_cents IS NOT NULL AND NEW.total_amount_cents > NEW.cost_cap_cents
       AND nullif(trim(NEW.cost_cap_override_reason), '') IS NULL THEN
      RAISE EXCEPTION 'guard_failed: invoice total exceeds the cost cap; give a reason to override it'
        USING ERRCODE = 'check_violation';
    END IF;
    IF v_balance < 0 THEN
      RAISE EXCEPTION 'guard_failed: deposits exceed the invoice total'
        USING ERRCODE = 'check_violation';
    END IF;
    SELECT bank_iban INTO v_iban FROM public.companies WHERE id = NEW.company_id;
    IF nullif(trim(v_iban), '') IS NULL THEN
      RAISE EXCEPTION 'guard_failed: add the company bank account (IBAN) before issuing invoices'
        USING ERRCODE = 'check_violation';
    END IF;

    IF NEW.invoice_number IS NULL THEN
      NEW.invoice_number := public.generate_sequence_number(NEW.company_id, 'invoice');
    END IF;
    NEW.issued_at := now();
    -- Due at the end of the due day, Swiss time
    NEW.due_at := (((now() AT TIME ZONE 'Europe/Zurich')::date + NEW.payment_terms_days + 1)::timestamp
                   AT TIME ZONE 'Europe/Zurich') - interval '1 second';
    NEW.payment_reference := public.invoice_payment_reference(NEW.invoice_number, v_iban);
    RETURN NEW;
  END IF;

  -- Status must match the money (balance_due_cents is not yet computed in
  -- NEW here, so the balance is derived from its columns)
  IF v_to = 'paid' AND v_balance > 0 THEN
    RAISE EXCEPTION 'guard_failed: invoice still has a balance due' USING ERRCODE = 'check_violation';
  END IF;
  IF v_to = 'partially_paid' AND NOT (NEW.amount_paid_cents > 0 AND v_balance > 0) THEN
    RAISE EXCEPTION 'guard_failed: partially paid needs a payment and an open balance'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_from = 'paid' AND v_balance <= 0 THEN
    RAISE EXCEPTION 'guard_failed: invoice is fully paid' USING ERRCODE = 'check_violation';
  END IF;
  IF v_from = 'partially_paid' AND v_to = 'sent' AND NEW.amount_paid_cents > 0 THEN
    RAISE EXCEPTION 'guard_failed: invoice has payments' USING ERRCODE = 'check_violation';
  END IF;
  IF v_to = 'void' AND NEW.amount_paid_cents <> 0 THEN
    RAISE EXCEPTION 'guard_failed: cancel the recorded payments before voiding the invoice'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_to = 'write_off' AND v_balance <= 0 THEN
    RAISE EXCEPTION 'guard_failed: nothing left to write off' USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

-- Runs after trg_invoices_enforce_status and trg_invoices_locked
CREATE TRIGGER trg_invoices_rules
  BEFORE UPDATE OF status ON invoices
  FOR EACH ROW EXECUTE FUNCTION public.enforce_invoice_rules();

-- Issued invoices are never deleted — they are voided
CREATE OR REPLACE FUNCTION public.reject_issued_invoice_delete()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' AND OLD.status <> 'draft' THEN
    RAISE EXCEPTION 'invoice_locked: issued invoices cannot be deleted; void them'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN OLD;
END;
$$;

CREATE TRIGGER trg_invoices_no_delete
  BEFORE DELETE ON invoices
  FOR EACH ROW EXECUTE FUNCTION public.reject_issued_invoice_delete();

-- =============================================================
-- 7. Payments → invoice
-- =============================================================

CREATE OR REPLACE FUNCTION public.validate_payment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_invoice  public.invoices%ROWTYPE;
  v_job      public.jobs%ROWTYPE;
  v_previous integer := 0;
BEGIN
  -- Only new payments and changes of the money columns are validated
  IF TG_OP = 'UPDATE'
     AND NEW.amount_cents = OLD.amount_cents
     AND NEW.invoice_id IS NOT DISTINCT FROM OLD.invoice_id
     AND NEW.job_id = OLD.job_id THEN
    RETURN NEW;
  END IF;

  IF NEW.payment_type = 'refund' THEN
    RAISE EXCEPTION 'invalid_payment: refunds are not supported yet' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.amount_cents <= 0 THEN
    RAISE EXCEPTION 'invalid_payment: amount must be greater than zero' USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_job FROM public.jobs WHERE id = NEW.job_id;
  IF v_job.id IS NULL OR v_job.company_id <> NEW.company_id THEN
    RAISE EXCEPTION 'not_found: job %', NEW.job_id USING ERRCODE = 'no_data_found';
  END IF;
  NEW.customer_id := v_job.customer_id;

  IF NEW.invoice_id IS NULL THEN
    -- Deposit before invoicing
    IF NEW.payment_type <> 'deposit' THEN
      RAISE EXCEPTION 'invalid_payment: payments without an invoice are deposits' USING ERRCODE = 'check_violation';
    END IF;
    IF EXISTS (SELECT 1 FROM public.invoices
                WHERE job_id = NEW.job_id AND status NOT IN ('draft', 'void') AND deleted_at IS NULL) THEN
      RAISE EXCEPTION 'invalid_payment: the job is already invoiced; record the payment on the invoice'
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

  SELECT * INTO v_invoice FROM public.invoices WHERE id = NEW.invoice_id FOR UPDATE;
  IF v_invoice.id IS NULL OR v_invoice.company_id <> NEW.company_id OR v_invoice.job_id <> NEW.job_id THEN
    RAISE EXCEPTION 'not_found: invoice %', NEW.invoice_id USING ERRCODE = 'no_data_found';
  END IF;
  IF v_invoice.status NOT IN ('sent', 'viewed', 'partially_paid', 'overdue') THEN
    RAISE EXCEPTION 'invalid_payment: payments can only be recorded on open invoices'
      USING ERRCODE = 'check_violation';
  END IF;
  -- On a change, the payment's previous amount is already part of the balance
  IF TG_OP = 'UPDATE' AND OLD.status = 'completed' THEN
    v_previous := OLD.amount_cents;
  END IF;
  IF NEW.status = 'completed' AND NEW.amount_cents - v_previous > v_invoice.balance_due_cents THEN
    RAISE EXCEPTION 'invalid_payment: amount exceeds the open balance of CHF %',
      to_char(v_invoice.balance_due_cents / 100.0, 'FM999999990.00')
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_payments_validate
  BEFORE INSERT OR UPDATE ON payments
  FOR EACH ROW EXECUTE FUNCTION public.validate_payment();

-- Recompute the invoice and move its status to match the money.
-- 'overdue' stays overdue until fully paid; apply_time_based_transitions()
-- moves open invoices past their due date to overdue.
CREATE OR REPLACE FUNCTION public.sync_invoice_payment_status(p_invoice_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_inv    public.invoices%ROWTYPE;
  v_target invoice_status;
BEGIN
  UPDATE public.invoices SET updated_at = now() WHERE id = p_invoice_id
  RETURNING * INTO v_inv;
  IF v_inv.id IS NULL OR v_inv.status IN ('draft', 'void', 'write_off') THEN
    RETURN;
  END IF;

  v_target := CASE
    WHEN v_inv.balance_due_cents <= 0 THEN 'paid'
    WHEN v_inv.status = 'paid' AND v_inv.due_at < now() THEN 'overdue'
    WHEN v_inv.status = 'overdue' THEN 'overdue'
    WHEN v_inv.amount_paid_cents > 0 THEN 'partially_paid'
    WHEN v_inv.status = 'viewed' THEN 'viewed'
    ELSE 'sent'
  END::invoice_status;

  IF v_target <> v_inv.status THEN
    UPDATE public.invoices
       SET status = v_target,
           paid_at = CASE WHEN v_target = 'paid' THEN now() ELSE NULL END
     WHERE id = p_invoice_id;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.apply_payment_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_job_id   uuid := coalesce(NEW.job_id, OLD.job_id);
  v_invoice  uuid;
  v_deposits bigint;
BEGIN
  FOR v_invoice IN
    SELECT DISTINCT unnest(ARRAY[NEW.invoice_id, OLD.invoice_id])
  LOOP
    IF v_invoice IS NOT NULL THEN
      PERFORM public.sync_invoice_payment_status(v_invoice);
    END IF;
  END LOOP;

  -- Deposits: refresh draft settlements and the job's deposit flag
  IF coalesce(NEW.payment_type, OLD.payment_type) = 'deposit'
     AND coalesce(NEW.invoice_id, OLD.invoice_id) IS NULL THEN
    UPDATE public.invoices SET updated_at = now()
     WHERE job_id = v_job_id AND status = 'draft' AND deleted_at IS NULL;

    SELECT coalesce(sum(amount_cents), 0) INTO v_deposits
      FROM public.payments
     WHERE job_id = v_job_id AND invoice_id IS NULL AND payment_type = 'deposit'
       AND status = 'completed' AND deleted_at IS NULL;

    UPDATE public.jobs
       SET deposit_paid_at = CASE
             WHEN deposit_amount_cents > 0 AND v_deposits >= deposit_amount_cents
               THEN coalesce(deposit_paid_at, now())
           END
     WHERE id = v_job_id
       AND deposit_paid_at IS DISTINCT FROM CASE
             WHEN deposit_amount_cents > 0 AND v_deposits >= deposit_amount_cents
               THEN coalesce(deposit_paid_at, now())
           END;
  END IF;

  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_payments_apply
  AFTER INSERT OR UPDATE OR DELETE ON payments
  FOR EACH ROW EXECUTE FUNCTION public.apply_payment_change();

-- =============================================================
-- 8. create_invoice_from_job() — the settlement draft
-- =============================================================
-- Copies the accepted quote's lines. Hourly lines take the actual hours
-- from the job (start → end, rounded up to the quarter hour) and keep the
-- quoted quantity for comparison.

CREATE OR REPLACE FUNCTION public.create_invoice_from_job(p_job_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_catalog
AS $$
DECLARE
  v_job      public.jobs%ROWTYPE;
  v_quote    public.quotes%ROWTYPE;
  v_language text;
  v_terms    integer;
  v_hours    numeric;
  v_id       uuid;
BEGIN
  SELECT * INTO v_job FROM public.jobs WHERE id = p_job_id AND deleted_at IS NULL;
  IF v_job.id IS NULL
     OR (public.is_user_request() AND v_job.company_id IS DISTINCT FROM public.auth_company_id()) THEN
    RAISE EXCEPTION 'not_found: job %', p_job_id USING ERRCODE = 'no_data_found';
  END IF;
  IF v_job.status NOT IN ('in_progress', 'completed') THEN
    RAISE EXCEPTION 'guard_failed: settle a job once the move has started or is completed'
      USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (SELECT 1 FROM public.invoices
              WHERE job_id = p_job_id AND status <> 'void' AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'guard_failed: this job already has an invoice' USING ERRCODE = 'check_violation';
  END IF;

  IF v_job.quote_id IS NOT NULL THEN
    SELECT * INTO v_quote FROM public.quotes WHERE id = v_job.quote_id;
  END IF;

  SELECT preferred_language INTO v_language FROM public.customers WHERE id = v_job.customer_id;
  SELECT default_payment_terms_days INTO v_terms FROM public.company_settings WHERE company_id = v_job.company_id;

  IF v_job.actual_start_at IS NOT NULL AND v_job.actual_end_at > v_job.actual_start_at THEN
    v_hours := ceil(extract(epoch FROM v_job.actual_end_at - v_job.actual_start_at) / 900) / 4.0;
  END IF;

  INSERT INTO public.invoices (
    company_id, job_id, customer_id, quote_id, created_by, status, title, language,
    service_date, payment_terms_days, cost_cap_cents, notes
  ) VALUES (
    v_job.company_id, v_job.id, v_job.customer_id, v_quote.id,
    CASE WHEN public.is_user_request() THEN auth.uid() END,
    'draft',
    v_quote.title,
    coalesce(v_quote.language, CASE WHEN v_language IN ('de', 'fr', 'it', 'en') THEN v_language END, 'de'),
    v_job.scheduled_date,
    coalesce(v_terms, 30),
    v_quote.cost_cap_cents,
    v_quote.customer_notes
  )
  RETURNING id INTO v_id;

  IF v_quote.id IS NOT NULL THEN
    INSERT INTO public.invoice_items (
      company_id, invoice_id, quote_item_id, service_catalog_id, item_type, name, description,
      pricing_mode, quantity, quoted_quantity, unit, unit_price_cents, discount_type, discount_value,
      vat_rate_percent, customer_notes, sort_order
    )
    SELECT qi.company_id, v_id, qi.id, qi.service_catalog_id, qi.item_type, qi.name, qi.description,
           qi.pricing_mode,
           CASE WHEN qi.pricing_mode = 'hourly' AND v_hours IS NOT NULL THEN v_hours ELSE qi.quantity END,
           qi.quantity,
           qi.unit, qi.unit_price_cents, qi.discount_type, qi.discount_value,
           qi.vat_rate_percent, qi.customer_notes, qi.sort_order
      FROM public.quote_items qi
     WHERE qi.quote_id = v_quote.id
     ORDER BY qi.sort_order;
  END IF;

  RETURN v_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_invoice_from_job(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_invoice_from_job(uuid) TO authenticated, service_role;

-- =============================================================
-- 9. replace_invoice_items()
-- =============================================================

CREATE OR REPLACE FUNCTION public.replace_invoice_items(p_invoice_id uuid, p_items jsonb)
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
    FROM public.invoices
   WHERE id = p_invoice_id AND deleted_at IS NULL;

  IF v_company_id IS NULL
     OR (public.is_user_request() AND v_company_id IS DISTINCT FROM public.auth_company_id()) THEN
    RAISE EXCEPTION 'not_found: invoice %', p_invoice_id USING ERRCODE = 'no_data_found';
  END IF;
  IF v_status <> 'draft' THEN
    RAISE EXCEPTION 'invoice_locked: lines of an issued invoice cannot be changed; void it and settle again'
      USING ERRCODE = 'check_violation';
  END IF;
  IF jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) > 200 THEN
    RAISE EXCEPTION 'invalid_line: expected up to 200 lines' USING ERRCODE = 'check_violation';
  END IF;

  DELETE FROM public.invoice_items WHERE invoice_id = p_invoice_id;

  INSERT INTO public.invoice_items (
    company_id, invoice_id, quote_item_id, service_catalog_id, item_type, name, description,
    pricing_mode, quantity, quoted_quantity, unit, unit_price_cents, discount_type, discount_value,
    vat_rate_percent, customer_notes, sort_order
  )
  SELECT
    v_company_id, p_invoice_id,
    (SELECT q.id FROM public.quote_items q
      WHERE q.id = nullif(i ->> 'quote_item_id', '')::uuid AND q.company_id = v_company_id),
    (SELECT s.id FROM public.service_catalog s
      WHERE s.id = nullif(i ->> 'service_catalog_id', '')::uuid AND s.company_id = v_company_id),
    coalesce(nullif(i ->> 'item_type', ''), 'other')::line_item_type,
    i ->> 'name',
    nullif(i ->> 'description', ''),
    coalesce(nullif(i ->> 'pricing_mode', ''), 'quantity')::pricing_mode,
    (i ->> 'quantity')::numeric,
    nullif(i ->> 'quoted_quantity', '')::numeric,
    nullif(i ->> 'unit', ''),
    (i ->> 'unit_price_cents')::integer,
    nullif(i ->> 'discount_type', '')::discount_type,
    nullif(i ->> 'discount_value', '')::numeric,
    coalesce((i ->> 'vat_rate_percent')::numeric, 0),
    nullif(i ->> 'customer_notes', ''),
    ord::integer
  FROM jsonb_array_elements(p_items) WITH ORDINALITY AS t(i, ord);

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.replace_invoice_items(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.replace_invoice_items(uuid, jsonb) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.sync_invoice_payment_status(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_invoice_payment_status(uuid) TO service_role;

-- =============================================================
-- 10. Transitions
-- =============================================================

UPDATE workflow_transitions
   SET reason_column = 'void_reason', stamp_column = 'voided_at'
 WHERE entity_type = 'invoice' AND to_status = 'void';

UPDATE workflow_transitions
   SET reason_column = 'write_off_reason'
 WHERE entity_type = 'invoice' AND to_status = 'write_off';

INSERT INTO workflow_transitions (entity_type, from_status, to_status, system_only, reason_column, stamp_column) VALUES
  -- A wrongly recorded payment is cancelled (guarded by the money rules)
  ('invoice', 'paid',           'partially_paid', false, NULL, NULL),
  ('invoice', 'paid',           'sent',           false, NULL, NULL),
  ('invoice', 'paid',           'overdue',        false, NULL, NULL),
  ('invoice', 'partially_paid', 'sent',           false, NULL, NULL),
  ('invoice', 'overdue',        'void',           false, 'void_reason', 'voided_at'),
  ('payment', 'completed',      'cancelled',      false, 'cancellation_reason', NULL)
ON CONFLICT DO NOTHING;

-- =============================================================
-- 11. System tasks — payment reminders
-- =============================================================
-- invoice.overdue now asks for the next reminder: right away when an
-- invoice becomes overdue, then 10 days after each reminder. After the
-- third reminder it asks to decide on debt collection (Betreibung).

CREATE OR REPLACE VIEW public.system_task_candidates
WITH (security_invoker = true)
AS
  SELECT l.company_id, 'lead.uncontacted'::text AS rule_key, 'lead'::text AS entity_type, l.id AS entity_id,
         format('Contact new lead %s %s', l.first_name, l.last_name) AS title,
         'high'::task_priority AS priority, l.created_at + interval '24 hours' AS due_at
    FROM leads l
   WHERE l.status = 'new' AND l.deleted_at IS NULL
     AND l.created_at < now() - interval '24 hours'
  UNION ALL
  SELECT a.company_id, 'appointment.unconfirmed', 'appointment', a.id,
         'Confirm appointment with customer',
         'medium', a.scheduled_at - interval '24 hours'
    FROM appointments a
   WHERE a.status = 'scheduled' AND a.deleted_at IS NULL
     AND a.scheduled_at BETWEEN now() AND now() + interval '48 hours'
  UNION ALL
  SELECT q.company_id, 'quote.draft_not_sent', 'quote', q.id,
         format('Send draft quote %s', q.quote_number),
         'medium', q.created_at + interval '24 hours'
    FROM quotes q
   WHERE q.status = 'draft' AND q.deleted_at IS NULL
     AND q.created_at < now() - interval '24 hours'
  UNION ALL
  SELECT q.company_id, 'quote.follow_up', 'quote', q.id,
         format('Follow up on quote %s (not opened yet)', q.quote_number),
         'medium', q.sent_at + interval '48 hours'
    FROM quotes q
   WHERE q.status = 'sent' AND q.deleted_at IS NULL
     AND q.sent_at < now() - interval '48 hours'
  UNION ALL
  SELECT q.company_id, 'quote.expiring', 'quote', q.id,
         format('Quote %s expires soon', q.quote_number),
         'high', q.expires_at
    FROM quotes q
   WHERE q.status IN ('sent', 'viewed') AND q.deleted_at IS NULL
     AND q.expires_at BETWEEN now() AND now() + interval '48 hours'
  UNION ALL
  SELECT q.company_id, 'quote.accepted_without_job', 'quote', q.id,
         format('Create job for accepted quote %s', q.quote_number),
         'urgent', q.accepted_at + interval '4 hours'
    FROM quotes q
   WHERE q.status = 'accepted' AND q.deleted_at IS NULL
     AND NOT EXISTS (SELECT 1 FROM jobs j WHERE j.quote_id = q.id AND j.deleted_at IS NULL)
  UNION ALL
  SELECT j.company_id, 'job.unassigned', 'job', j.id,
         format('Assign crew to job %s', j.job_number),
         'urgent', j.scheduled_date::timestamptz - interval '1 day'
    FROM jobs j
   WHERE j.status IN ('scheduled', 'confirmed') AND j.deleted_at IS NULL
     AND j.scheduled_date <= current_date + 2
     AND NOT EXISTS (SELECT 1 FROM job_assignments ja WHERE ja.job_id = j.id)
  UNION ALL
  -- Changed in migration 031: a settlement draft does not count as invoiced
  SELECT j.company_id, 'job.completed_without_invoice', 'job', j.id,
         format('Create invoice for job %s', j.job_number),
         'high', j.actual_end_at + interval '24 hours'
    FROM jobs j
   WHERE j.status = 'completed' AND j.deleted_at IS NULL
     AND NOT EXISTS (
       SELECT 1 FROM invoices i
        WHERE i.job_id = j.id AND i.deleted_at IS NULL AND i.status NOT IN ('draft', 'void')
     )
  UNION ALL
  -- Changed in migration 031: reminder cadence
  SELECT i.company_id, 'invoice.overdue', 'invoice', i.id,
         CASE WHEN i.reminder_level >= 3
              THEN format('Invoice %s: third reminder unpaid — decide on debt collection', i.invoice_number)
              ELSE format('Invoice %s is overdue — send reminder %s', i.invoice_number, i.reminder_level + 1)
         END,
         CASE WHEN i.reminder_level >= 2 THEN 'urgent' ELSE 'high' END::task_priority,
         coalesce(i.last_reminder_at + interval '10 days', i.due_at)
    FROM invoices i
   WHERE i.status = 'overdue' AND i.deleted_at IS NULL
     AND (i.last_reminder_at IS NULL OR i.last_reminder_at < now() - interval '10 days')
  UNION ALL
  SELECT v.company_id, 'vehicle.inspection_due', 'vehicle', v.id,
         format('Vehicle %s: inspection (MFK) due %s', v.name, to_char(v.next_inspection_on, 'DD.MM.YYYY')),
         'high', v.next_inspection_on::timestamptz
    FROM vehicles v
   WHERE v.deleted_at IS NULL AND v.status <> 'retired'
     AND v.next_inspection_on <= current_date + 30
  UNION ALL
  SELECT v.company_id, 'vehicle.insurance_expiring', 'vehicle', v.id,
         format('Vehicle %s: insurance expires %s', v.name, to_char(v.insurance_expiry, 'DD.MM.YYYY')),
         'high', v.insurance_expiry::timestamptz
    FROM vehicles v
   WHERE v.deleted_at IS NULL AND v.status <> 'retired'
     AND v.insurance_expiry <= current_date + 30
  UNION ALL
  SELECT e.company_id, 'employee.licence_expiring', 'employee', e.id,
         format('%s %s: driving licence expires %s', e.first_name, e.last_name, to_char(e.driver_license_expiry, 'DD.MM.YYYY')),
         'medium', e.driver_license_expiry::timestamptz
    FROM employees e
   WHERE e.deleted_at IS NULL AND e.status = 'active'
     AND e.driver_license_expiry <= current_date + 30;
