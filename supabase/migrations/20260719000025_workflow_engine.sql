-- =============================================================
-- Migration 025: Workflow Engine
-- =============================================================
-- State machines, status history, transactional domain events and
-- system-generated tasks. See docs/WORKFLOW_ENGINE.md.
--
--   workflow_transitions      allowed status changes per entity (config)
--   enforce_status_transition rejects anything else (BEFORE trigger)
--   record_status_change      status_history + domain_events (AFTER trigger)
--   transition_status()       the one entry point for the app
--   claim/complete/fail_domain_event()   outbox processing
--   sync_system_tasks()       opens / auto-resolves rule-based tasks
--   apply_time_based_transitions()      quote expiry, invoice overdue
-- =============================================================

-- =============================================================
-- 1. Entity ↔ table mapping
-- =============================================================

CREATE OR REPLACE FUNCTION public.workflow_entity_for_table(p_table text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_table
    WHEN 'leads'        THEN 'lead'
    WHEN 'appointments' THEN 'appointment'
    WHEN 'quotes'       THEN 'quote'
    WHEN 'jobs'         THEN 'job'
    WHEN 'invoices'     THEN 'invoice'
    WHEN 'payments'     THEN 'payment'
  END;
$$;

-- =============================================================
-- 2. Transition configuration
-- =============================================================

CREATE TABLE workflow_transitions (
  entity_type    text      NOT NULL,
  from_status    text      NOT NULL,
  to_status      text      NOT NULL,
  system_only    boolean   NOT NULL DEFAULT false,
  reason_column  text,
  stamp_column   text,

  PRIMARY KEY (entity_type, from_status, to_status)
);

ALTER TABLE workflow_transitions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "workflow_transitions_select" ON workflow_transitions FOR SELECT USING (true);
GRANT SELECT ON TABLE workflow_transitions TO authenticated;
GRANT SELECT ON TABLE workflow_transitions TO service_role;

INSERT INTO workflow_transitions (entity_type, from_status, to_status, system_only, reason_column, stamp_column) VALUES
  -- lead
  ('lead', 'new',        'contacted', false, NULL,          NULL),
  ('lead', 'new',        'surveyed',  false, NULL,          NULL),
  ('lead', 'new',        'quoted',    false, NULL,          NULL),
  ('lead', 'new',        'lost',      false, 'lost_reason', NULL),
  ('lead', 'new',        'duplicate', false, NULL,          NULL),
  ('lead', 'contacted',  'surveyed',  false, NULL,          NULL),
  ('lead', 'contacted',  'quoted',    false, NULL,          NULL),
  ('lead', 'contacted',  'lost',      false, 'lost_reason', NULL),
  ('lead', 'contacted',  'duplicate', false, NULL,          NULL),
  ('lead', 'surveyed',   'quoted',    false, NULL,          NULL),
  ('lead', 'surveyed',   'lost',      false, 'lost_reason', NULL),
  ('lead', 'quoted',     'booked',    true,  NULL,          'converted_at'),
  ('lead', 'quoted',     'lost',      false, 'lost_reason', NULL),
  ('lead', 'lost',       'new',       false, NULL,          NULL),
  -- appointment
  ('appointment', 'scheduled', 'confirmed', false, NULL,                  NULL),
  ('appointment', 'scheduled', 'completed', false, NULL,                  'completed_at'),
  ('appointment', 'scheduled', 'no_show',   false, NULL,                  NULL),
  ('appointment', 'scheduled', 'cancelled', false, 'cancellation_reason', NULL),
  ('appointment', 'confirmed', 'completed', false, NULL,                  'completed_at'),
  ('appointment', 'confirmed', 'no_show',   false, NULL,                  NULL),
  ('appointment', 'confirmed', 'cancelled', false, 'cancellation_reason', NULL),
  -- quote
  ('quote', 'draft',  'sent',      false, NULL,              'sent_at'),
  ('quote', 'draft',  'cancelled', false, NULL,              NULL),
  ('quote', 'sent',   'viewed',    true,  NULL,              'viewed_at'),
  ('quote', 'sent',   'accepted',  false, NULL,              'accepted_at'),
  ('quote', 'sent',   'declined',  false, 'declined_reason', 'declined_at'),
  ('quote', 'sent',   'expired',   true,  NULL,              NULL),
  ('quote', 'sent',   'cancelled', false, NULL,              NULL),
  ('quote', 'viewed', 'accepted',  false, NULL,              'accepted_at'),
  ('quote', 'viewed', 'declined',  false, 'declined_reason', 'declined_at'),
  ('quote', 'viewed', 'expired',   true,  NULL,              NULL),
  ('quote', 'viewed', 'cancelled', false, NULL,              NULL),
  -- job
  ('job', 'scheduled',   'confirmed',   false, NULL,                  NULL),
  ('job', 'scheduled',   'on_hold',     false, NULL,                  NULL),
  ('job', 'scheduled',   'cancelled',   false, 'cancellation_reason', 'cancelled_at'),
  ('job', 'confirmed',   'in_progress', false, NULL,                  'actual_start_at'),
  ('job', 'confirmed',   'on_hold',     false, NULL,                  NULL),
  ('job', 'confirmed',   'cancelled',   false, 'cancellation_reason', 'cancelled_at'),
  ('job', 'in_progress', 'completed',   false, NULL,                  'actual_end_at'),
  ('job', 'in_progress', 'on_hold',     false, NULL,                  NULL),
  ('job', 'on_hold',     'scheduled',   false, NULL,                  NULL),
  ('job', 'on_hold',     'confirmed',   false, NULL,                  NULL),
  ('job', 'on_hold',     'cancelled',   false, 'cancellation_reason', 'cancelled_at'),
  -- invoice
  ('invoice', 'draft',          'sent',           false, NULL, 'sent_at'),
  ('invoice', 'draft',          'void',           false, NULL, NULL),
  ('invoice', 'sent',           'viewed',         true,  NULL, 'viewed_at'),
  ('invoice', 'sent',           'partially_paid', false, NULL, NULL),
  ('invoice', 'sent',           'paid',           false, NULL, 'paid_at'),
  ('invoice', 'sent',           'overdue',        true,  NULL, NULL),
  ('invoice', 'sent',           'void',           false, NULL, NULL),
  ('invoice', 'sent',           'write_off',      false, NULL, NULL),
  ('invoice', 'viewed',         'partially_paid', false, NULL, NULL),
  ('invoice', 'viewed',         'paid',           false, NULL, 'paid_at'),
  ('invoice', 'viewed',         'overdue',        true,  NULL, NULL),
  ('invoice', 'viewed',         'void',           false, NULL, NULL),
  ('invoice', 'viewed',         'write_off',      false, NULL, NULL),
  ('invoice', 'partially_paid', 'paid',           false, NULL, 'paid_at'),
  ('invoice', 'partially_paid', 'overdue',        true,  NULL, NULL),
  ('invoice', 'partially_paid', 'write_off',      false, NULL, NULL),
  ('invoice', 'overdue',        'partially_paid', false, NULL, NULL),
  ('invoice', 'overdue',        'paid',           false, NULL, 'paid_at'),
  ('invoice', 'overdue',        'write_off',      false, NULL, NULL),
  -- payment
  ('payment', 'pending',   'completed', false, NULL, 'paid_at'),
  ('payment', 'pending',   'failed',    false, NULL, NULL),
  ('payment', 'pending',   'cancelled', false, NULL, NULL),
  ('payment', 'completed', 'refunded',  false, NULL, NULL);

-- =============================================================
-- 3. Status history (append-only)
-- =============================================================

CREATE TABLE status_history (
  id            uuid          PRIMARY KEY DEFAULT gen_uuid_v7(),
  company_id    uuid          NOT NULL,  -- no FK: append-only log
  entity_type   text          NOT NULL,
  entity_id     uuid          NOT NULL,
  from_status   text,                    -- NULL on creation
  to_status     text          NOT NULL,
  actor_id      uuid,                    -- NULL for system changes
  actor_type    text          NOT NULL CHECK (actor_type IN ('user', 'system')),
  reason        text,
  created_at    timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX idx_status_history_entity  ON status_history(entity_type, entity_id, created_at);
CREATE INDEX idx_status_history_company ON status_history(company_id, created_at);

ALTER TABLE status_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "status_history_select" ON status_history
  FOR SELECT USING (company_id = public.auth_company_id());

GRANT SELECT ON TABLE status_history TO authenticated;
GRANT SELECT, INSERT ON TABLE status_history TO service_role;

CREATE OR REPLACE FUNCTION public.reject_status_history_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'status_history is append-only' USING ERRCODE = 'insufficient_privilege';
END;
$$;

CREATE TRIGGER trg_status_history_no_update
  BEFORE UPDATE OR DELETE ON status_history
  FOR EACH ROW EXECUTE FUNCTION public.reject_status_history_mutation();

-- =============================================================
-- 4. Enforce transitions (BEFORE UPDATE OF status)
-- =============================================================
-- System-only transitions are refused for requests made with a user
-- JWT. Service role, cron and direct database connections count as
-- the system.

CREATE OR REPLACE FUNCTION public.is_user_request()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT coalesce(auth.jwt() ->> 'role', '') = 'authenticated';
$$;

CREATE OR REPLACE FUNCTION public.enforce_status_transition()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_entity  text := public.workflow_entity_for_table(TG_TABLE_NAME);
  v_from    text := OLD.status::text;
  v_to      text := NEW.status::text;
  v_rule    public.workflow_transitions%ROWTYPE;
  v_row     jsonb;
  v_reason  text := nullif(current_setting('bivro.transition_reason', true), '');
BEGIN
  IF v_from IS NOT DISTINCT FROM v_to THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_rule
    FROM public.workflow_transitions
   WHERE entity_type = v_entity AND from_status = v_from AND to_status = v_to;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'invalid_transition: % % -> %', v_entity, v_from, v_to
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_rule.system_only AND public.is_user_request() THEN
    RAISE EXCEPTION 'system_only_transition: % % -> %', v_entity, v_from, v_to
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Reason: take it from transition_status() if the column is still empty
  IF v_rule.reason_column IS NOT NULL THEN
    v_row := to_jsonb(NEW);
    IF nullif(trim(v_row ->> v_rule.reason_column), '') IS NULL AND v_reason IS NOT NULL THEN
      NEW := jsonb_populate_record(NEW, jsonb_build_object(v_rule.reason_column, v_reason));
    END IF;
    IF nullif(trim(to_jsonb(NEW) ->> v_rule.reason_column), '') IS NULL THEN
      RAISE EXCEPTION 'reason_required: % % -> % requires %', v_entity, v_from, v_to, v_rule.reason_column
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  -- Entity guards
  v_row := to_jsonb(NEW);
  IF v_entity = 'quote' AND v_to = 'sent' THEN
    IF v_row ->> 'customer_id' IS NULL THEN
      RAISE EXCEPTION 'guard_failed: quote needs a customer before it is sent' USING ERRCODE = 'check_violation';
    END IF;
    IF coalesce((v_row ->> 'total_amount_cents')::bigint, 0) <= 0 THEN
      RAISE EXCEPTION 'guard_failed: quote total must be greater than zero' USING ERRCODE = 'check_violation';
    END IF;
  ELSIF v_entity = 'job' AND v_to = 'in_progress' THEN
    IF NOT EXISTS (SELECT 1 FROM public.job_assignments WHERE job_id = (v_row ->> 'id')::uuid) THEN
      RAISE EXCEPTION 'guard_failed: job needs at least one crew assignment' USING ERRCODE = 'check_violation';
    END IF;
  ELSIF v_entity = 'invoice' AND v_to = 'sent' THEN
    IF coalesce((v_row ->> 'total_amount_cents')::bigint, 0) <= 0 THEN
      RAISE EXCEPTION 'guard_failed: invoice total must be greater than zero' USING ERRCODE = 'check_violation';
    END IF;
  ELSIF v_entity = 'invoice' AND v_to = 'paid' THEN
    IF coalesce((v_row ->> 'balance_due_cents')::bigint, 0) <> 0 THEN
      RAISE EXCEPTION 'guard_failed: invoice still has a balance due' USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  -- Lifecycle timestamp
  IF v_rule.stamp_column IS NOT NULL AND v_row ->> v_rule.stamp_column IS NULL THEN
    NEW := jsonb_populate_record(NEW, jsonb_build_object(v_rule.stamp_column, now()));
  END IF;

  RETURN NEW;
END;
$$;

-- =============================================================
-- 5. Record changes: status_history + domain_events (AFTER)
-- =============================================================

CREATE OR REPLACE FUNCTION public.record_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_catalog
AS $$
DECLARE
  v_entity   text := public.workflow_entity_for_table(TG_TABLE_NAME);
  v_from     text;
  v_to       text := NEW.status::text;
  v_actor    uuid := CASE WHEN public.is_user_request() THEN auth.uid() END;
  v_reason   text := nullif(current_setting('bivro.transition_reason', true), '');
  v_payload  jsonb;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    v_from := OLD.status::text;
    IF v_from IS NOT DISTINCT FROM v_to THEN
      RETURN NULL;
    END IF;
  END IF;

  INSERT INTO public.status_history (
    company_id, entity_type, entity_id, from_status, to_status, actor_id, actor_type, reason
  ) VALUES (
    NEW.company_id, v_entity, NEW.id, v_from, v_to, v_actor,
    CASE WHEN v_actor IS NULL THEN 'system' ELSE 'user' END, v_reason
  );

  v_payload := jsonb_build_object(
    'id', NEW.id,
    'from_status', v_from,
    'to_status', v_to,
    'actor_id', v_actor,
    'reason', v_reason
  );

  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.domain_events (company_id, event_type, aggregate_type, aggregate_id, payload)
    VALUES (NEW.company_id, v_entity || '.created', v_entity, NEW.id, v_payload);
  ELSE
    INSERT INTO public.domain_events (company_id, event_type, aggregate_type, aggregate_id, payload)
    VALUES
      (NEW.company_id, v_entity || '.status_changed', v_entity, NEW.id, v_payload),
      (NEW.company_id, v_entity || '.' || v_to,        v_entity, NEW.id, v_payload);
  END IF;

  RETURN NULL;
END;
$$;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['leads', 'appointments', 'quotes', 'jobs', 'invoices', 'payments'] LOOP
    EXECUTE format(
      'CREATE TRIGGER trg_%1$s_enforce_status BEFORE UPDATE OF status ON %1$I
         FOR EACH ROW EXECUTE FUNCTION public.enforce_status_transition()', t);
    EXECUTE format(
      'CREATE TRIGGER trg_%1$s_record_status AFTER INSERT OR UPDATE OF status ON %1$I
         FOR EACH ROW EXECUTE FUNCTION public.record_status_change()', t);
  END LOOP;
END;
$$;

-- =============================================================
-- 6. transition_status() — the app's entry point
-- =============================================================
-- SECURITY INVOKER: RLS decides whether the caller may see and update
-- the row. A row that is invisible is reported as not found.

CREATE OR REPLACE FUNCTION public.transition_status(
  p_entity    text,
  p_id        uuid,
  p_to_status text,
  p_reason    text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_table text;
  v_enum  text;
  v_rows  integer;
BEGIN
  SELECT t, e INTO v_table, v_enum
    FROM (VALUES
      ('lead', 'leads', 'lead_status'),
      ('appointment', 'appointments', 'appointment_status'),
      ('quote', 'quotes', 'quote_status'),
      ('job', 'jobs', 'job_status'),
      ('invoice', 'invoices', 'invoice_status'),
      ('payment', 'payments', 'payment_status')
    ) AS m(entity, t, e)
   WHERE m.entity = p_entity;

  IF v_table IS NULL THEN
    RAISE EXCEPTION 'unknown_entity: %', p_entity USING ERRCODE = 'invalid_parameter_value';
  END IF;

  PERFORM set_config('bivro.transition_reason', coalesce(p_reason, ''), true);

  EXECUTE format('UPDATE public.%I SET status = $1::public.%I WHERE id = $2 AND deleted_at IS NULL', v_table, v_enum)
    USING p_to_status, p_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;

  PERFORM set_config('bivro.transition_reason', '', true);

  IF v_rows = 0 THEN
    RAISE EXCEPTION 'not_found: % %', p_entity, p_id USING ERRCODE = 'no_data_found';
  END IF;

  RETURN p_to_status;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.transition_status(text, uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.transition_status(text, uuid, text, text) TO authenticated, service_role;

-- =============================================================
-- 7. Domain event processing (transactional outbox)
-- =============================================================

ALTER TABLE domain_events
  ADD COLUMN attempts         integer      NOT NULL DEFAULT 0,
  ADD COLUMN next_attempt_at  timestamptz  NOT NULL DEFAULT now(),
  ADD COLUMN locked_until     timestamptz,
  ADD COLUMN dead_at          timestamptz;

CREATE INDEX idx_domain_events_pending
  ON domain_events(next_attempt_at)
  WHERE processed_at IS NULL AND dead_at IS NULL;

GRANT UPDATE (attempts, next_attempt_at, locked_until, dead_at, processed_at, processing_error)
  ON TABLE domain_events TO service_role;

CREATE TABLE domain_event_handler_runs (
  event_id      uuid          NOT NULL,
  handler       text          NOT NULL,
  completed_at  timestamptz   NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id, handler)
);

ALTER TABLE domain_event_handler_runs ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT ON TABLE domain_event_handler_runs TO service_role;

-- Lock a batch of due events for 5 minutes. SKIP LOCKED lets several
-- workers run side by side without processing an event twice.
CREATE OR REPLACE FUNCTION public.claim_domain_events(p_limit integer DEFAULT 50)
RETURNS SETOF public.domain_events
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  UPDATE public.domain_events e
     SET locked_until = now() + interval '5 minutes',
         attempts = e.attempts + 1
   WHERE e.id IN (
     SELECT id
       FROM public.domain_events
      WHERE processed_at IS NULL
        AND dead_at IS NULL
        AND next_attempt_at <= now()
        AND (locked_until IS NULL OR locked_until < now())
      ORDER BY created_at
      LIMIT p_limit
      FOR UPDATE SKIP LOCKED
   )
  RETURNING e.*;
$$;

CREATE OR REPLACE FUNCTION public.complete_domain_event(p_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  UPDATE public.domain_events
     SET processed_at = now(), locked_until = NULL, processing_error = NULL
   WHERE id = p_id;
$$;

-- Exponential backoff: 1, 2, 4 … 128 minutes; dead after 8 attempts.
CREATE OR REPLACE FUNCTION public.fail_domain_event(p_id uuid, p_error text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  UPDATE public.domain_events
     SET processing_error = left(p_error, 2000),
         locked_until = NULL,
         next_attempt_at = now() + make_interval(mins => power(2, least(attempts, 8) - 1)::int),
         dead_at = CASE WHEN attempts >= 8 THEN now() END
   WHERE id = p_id;
$$;

REVOKE EXECUTE ON FUNCTION public.claim_domain_events(integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.complete_domain_event(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fail_domain_event(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_domain_events(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_domain_event(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.fail_domain_event(uuid, text) TO service_role;

-- =============================================================
-- 8. System tasks
-- =============================================================

ALTER TABLE tasks
  ADD COLUMN source            text         NOT NULL DEFAULT 'manual'
                                            CHECK (source IN ('manual', 'system')),
  ADD COLUMN rule_key          text,
  ADD COLUMN auto_resolved_at  timestamptz,
  ADD CONSTRAINT tasks_system_has_rule CHECK (source = 'manual' OR rule_key IS NOT NULL);

ALTER TABLE tasks DROP CONSTRAINT tasks_entity_type_check;
ALTER TABLE tasks ADD CONSTRAINT tasks_entity_type_check
  CHECK (entity_type IN ('lead', 'quote', 'job', 'customer', 'invoice', 'appointment', 'payment'));

-- At most one open system task per rule and entity
CREATE UNIQUE INDEX idx_tasks_system_open
  ON tasks(company_id, rule_key, entity_id)
  WHERE source = 'system' AND status IN ('open', 'in_progress');

CREATE INDEX idx_tasks_company_open
  ON tasks(company_id, status, due_at)
  WHERE deleted_at IS NULL;

-- Rule candidates. One row per (company, rule, entity) that needs attention.
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
  SELECT j.company_id, 'job.completed_without_invoice', 'job', j.id,
         format('Create invoice for job %s', j.job_number),
         'high', j.actual_end_at + interval '24 hours'
    FROM jobs j
   WHERE j.status = 'completed' AND j.deleted_at IS NULL
     AND NOT EXISTS (
       SELECT 1 FROM invoices i
        WHERE i.job_id = j.id AND i.deleted_at IS NULL AND i.status NOT IN ('void')
     )
  UNION ALL
  SELECT i.company_id, 'invoice.overdue', 'invoice', i.id,
         format('Invoice %s is overdue', i.invoice_number),
         'high', i.due_at
    FROM invoices i
   WHERE i.status = 'overdue' AND i.deleted_at IS NULL;

REVOKE ALL ON public.system_task_candidates FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.system_task_candidates TO service_role;

-- Opens missing system tasks and auto-resolves tasks whose condition no
-- longer holds. A system task a person closed (completed or cancelled
-- by hand) is not reopened for the same entity.
CREATE OR REPLACE FUNCTION public.sync_system_tasks(p_company_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_catalog
AS $$
DECLARE
  v_opened   integer;
  v_resolved integer;
BEGIN
  -- Serialise concurrent runs (cron + event processor)
  PERFORM pg_advisory_xact_lock(hashtext('bivro.sync_system_tasks'));

  CREATE TEMP TABLE _candidates ON COMMIT DROP AS
    SELECT * FROM public.system_task_candidates c
     WHERE p_company_id IS NULL OR c.company_id = p_company_id;

  INSERT INTO public.tasks (company_id, source, rule_key, entity_type, entity_id, title, priority, due_at)
  SELECT c.company_id, 'system', c.rule_key, c.entity_type, c.entity_id, c.title, c.priority, c.due_at
    FROM _candidates c
   WHERE NOT EXISTS (
     SELECT 1 FROM public.tasks t
      WHERE t.company_id = c.company_id
        AND t.source = 'system'
        AND t.rule_key = c.rule_key
        AND t.entity_id = c.entity_id
        AND t.deleted_at IS NULL
        AND (t.status IN ('open', 'in_progress') OR t.auto_resolved_at IS NULL)
   )
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_opened = ROW_COUNT;

  UPDATE public.tasks t
     SET status = 'completed', completed_at = now(), auto_resolved_at = now()
   WHERE t.source = 'system'
     AND t.status IN ('open', 'in_progress')
     AND t.deleted_at IS NULL
     AND (p_company_id IS NULL OR t.company_id = p_company_id)
     AND NOT EXISTS (
       SELECT 1 FROM _candidates c
        WHERE c.company_id = t.company_id AND c.rule_key = t.rule_key AND c.entity_id = t.entity_id
     );
  GET DIAGNOSTICS v_resolved = ROW_COUNT;

  DROP TABLE _candidates;

  RETURN jsonb_build_object('opened', v_opened, 'resolved', v_resolved);
END;
$$;

-- Time-based transitions. Runs as the system (system-only transitions allowed).
CREATE OR REPLACE FUNCTION public.apply_time_based_transitions()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_catalog
AS $$
DECLARE
  v_quotes   integer;
  v_invoices integer;
BEGIN
  UPDATE public.quotes
     SET status = 'expired'
   WHERE status IN ('sent', 'viewed')
     AND expires_at < now()
     AND deleted_at IS NULL;
  GET DIAGNOSTICS v_quotes = ROW_COUNT;

  UPDATE public.invoices
     SET status = 'overdue'
   WHERE status IN ('sent', 'viewed', 'partially_paid')
     AND due_at < now()
     AND balance_due_cents > 0
     AND deleted_at IS NULL;
  GET DIAGNOSTICS v_invoices = ROW_COUNT;

  RETURN jsonb_build_object('quotes_expired', v_quotes, 'invoices_overdue', v_invoices);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.sync_system_tasks(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.apply_time_based_transitions() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_system_tasks(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.apply_time_based_transitions() TO service_role;

-- =============================================================
-- 9. One job per quote
-- =============================================================
-- jobs.create_from_quote is idempotent through domain_event_handler_runs;
-- this index makes a duplicate job impossible even under concurrency.

CREATE UNIQUE INDEX idx_jobs_one_per_quote
  ON jobs(quote_id)
  WHERE quote_id IS NOT NULL AND deleted_at IS NULL;
