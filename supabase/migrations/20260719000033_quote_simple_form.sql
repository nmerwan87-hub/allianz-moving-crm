-- =============================================================
-- Migration 033: Simple quote form (Bixin-style)
-- =============================================================
-- The quote form asks for the main service the way movers think about it:
-- "by effort" (team × hours, optional cost cap) or "flat price", plus
-- crew size and rooms. The lines remain the single source of the price;
-- these columns let the form show the quote the way it was entered.
--
--   pricing_kind  'hourly' | 'flat'
--   crew_size     movers in the team (→ jobs.crew_size_required)
--   rooms         dwelling size, e.g. 3.5 (Zimmer)
--   rate_card_id  the team rate the main line came from
--
-- System task titles are German from here on (the app speaks German).
-- =============================================================

ALTER TABLE quotes
  ADD COLUMN pricing_kind text         NOT NULL DEFAULT 'hourly'
                                       CHECK (pricing_kind IN ('hourly', 'flat')),
  ADD COLUMN crew_size    smallint     CHECK (crew_size IS NULL OR crew_size BETWEEN 1 AND 30),
  ADD COLUMN rooms        numeric(3,1) CHECK (rooms IS NULL OR (rooms > 0 AND rooms <= 30)),
  ADD COLUMN rate_card_id uuid         REFERENCES rate_cards(id) ON DELETE SET NULL;

COMMENT ON COLUMN quotes.pricing_kind IS 'How the main service is priced: hourly (team × hours, cost cap) or flat.';

-- New versions keep the form fields
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
    customer_notes, internal_notes, title, language, cost_cap_cents, expires_at,
    pricing_kind, crew_size, rooms, rate_card_id
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
      30))::timestamptz,
    v_old.pricing_kind, v_old.crew_size, v_old.rooms, v_old.rate_card_id
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

-- System tasks in German (same rules as migration 031)
CREATE OR REPLACE VIEW public.system_task_candidates
WITH (security_invoker = true)
AS
  SELECT l.company_id, 'lead.uncontacted'::text AS rule_key, 'lead'::text AS entity_type, l.id AS entity_id,
         format('Neue Anfrage von %s %s kontaktieren', l.first_name, l.last_name) AS title,
         'high'::task_priority AS priority, l.created_at + interval '24 hours' AS due_at
    FROM leads l
   WHERE l.status = 'new' AND l.deleted_at IS NULL
     AND l.created_at < now() - interval '24 hours'
  UNION ALL
  SELECT a.company_id, 'appointment.unconfirmed', 'appointment', a.id,
         'Termin mit Kunde bestätigen',
         'medium', a.scheduled_at - interval '24 hours'
    FROM appointments a
   WHERE a.status = 'scheduled' AND a.deleted_at IS NULL
     AND a.scheduled_at BETWEEN now() AND now() + interval '48 hours'
  UNION ALL
  SELECT q.company_id, 'quote.draft_not_sent', 'quote', q.id,
         format('Offerte %s fertigstellen und senden', q.quote_number),
         'medium', q.created_at + interval '24 hours'
    FROM quotes q
   WHERE q.status = 'draft' AND q.deleted_at IS NULL
     AND q.created_at < now() - interval '24 hours'
  UNION ALL
  SELECT q.company_id, 'quote.follow_up', 'quote', q.id,
         format('Bei Kunde nachfassen: Offerte %s noch nicht geöffnet', q.quote_number),
         'medium', q.sent_at + interval '48 hours'
    FROM quotes q
   WHERE q.status = 'sent' AND q.deleted_at IS NULL
     AND q.sent_at < now() - interval '48 hours'
  UNION ALL
  SELECT q.company_id, 'quote.expiring', 'quote', q.id,
         format('Offerte %s läuft bald ab', q.quote_number),
         'high', q.expires_at
    FROM quotes q
   WHERE q.status IN ('sent', 'viewed') AND q.deleted_at IS NULL
     AND q.expires_at BETWEEN now() AND now() + interval '48 hours'
  UNION ALL
  SELECT q.company_id, 'quote.accepted_without_job', 'quote', q.id,
         format('Auftrag für angenommene Offerte %s erstellen', q.quote_number),
         'urgent', q.accepted_at + interval '4 hours'
    FROM quotes q
   WHERE q.status = 'accepted' AND q.deleted_at IS NULL
     AND NOT EXISTS (SELECT 1 FROM jobs j WHERE j.quote_id = q.id AND j.deleted_at IS NULL)
  UNION ALL
  SELECT j.company_id, 'job.unassigned', 'job', j.id,
         format('Team für Auftrag %s einteilen', j.job_number),
         'urgent', j.scheduled_date::timestamptz - interval '1 day'
    FROM jobs j
   WHERE j.status IN ('scheduled', 'confirmed') AND j.deleted_at IS NULL
     AND j.scheduled_date <= current_date + 2
     AND NOT EXISTS (SELECT 1 FROM job_assignments ja WHERE ja.job_id = j.id)
  UNION ALL
    SELECT j.company_id, 'job.completed_without_invoice', 'job', j.id,
         format('Schlussabrechnung für Auftrag %s erstellen', j.job_number),
         'high', j.actual_end_at + interval '24 hours'
    FROM jobs j
   WHERE j.status = 'completed' AND j.deleted_at IS NULL
     AND NOT EXISTS (
       SELECT 1 FROM invoices i
        WHERE i.job_id = j.id AND i.deleted_at IS NULL AND i.status NOT IN ('draft', 'void')
     )
  UNION ALL
    SELECT i.company_id, 'invoice.overdue', 'invoice', i.id,
         CASE WHEN i.reminder_level >= 3
              THEN format('Rechnung %s: nach 3. Mahnung unbezahlt — Betreibung entscheiden', i.invoice_number)
              ELSE format('Rechnung %s überfällig — %s. Mahnung senden', i.invoice_number, i.reminder_level + 1)
         END,
         CASE WHEN i.reminder_level >= 2 THEN 'urgent' ELSE 'high' END::task_priority,
         coalesce(i.last_reminder_at + interval '10 days', i.due_at)
    FROM invoices i
   WHERE i.status = 'overdue' AND i.deleted_at IS NULL
     AND (i.last_reminder_at IS NULL OR i.last_reminder_at < now() - interval '10 days')
  UNION ALL
  SELECT v.company_id, 'vehicle.inspection_due', 'vehicle', v.id,
         format('Fahrzeug %s: MFK fällig am %s', v.name, to_char(v.next_inspection_on, 'DD.MM.YYYY')),
         'high', v.next_inspection_on::timestamptz
    FROM vehicles v
   WHERE v.deleted_at IS NULL AND v.status <> 'retired'
     AND v.next_inspection_on <= current_date + 30
  UNION ALL
  SELECT v.company_id, 'vehicle.insurance_expiring', 'vehicle', v.id,
         format('Fahrzeug %s: Versicherung läuft am %s ab', v.name, to_char(v.insurance_expiry, 'DD.MM.YYYY')),
         'high', v.insurance_expiry::timestamptz
    FROM vehicles v
   WHERE v.deleted_at IS NULL AND v.status <> 'retired'
     AND v.insurance_expiry <= current_date + 30
  UNION ALL
  SELECT e.company_id, 'employee.licence_expiring', 'employee', e.id,
         format('%s %s: Führerausweis läuft am %s ab', e.first_name, e.last_name, to_char(e.driver_license_expiry, 'DD.MM.YYYY')),
         'medium', e.driver_license_expiry::timestamptz
    FROM employees e
   WHERE e.deleted_at IS NULL AND e.status = 'active'
     AND e.driver_license_expiry <= current_date + 30;
