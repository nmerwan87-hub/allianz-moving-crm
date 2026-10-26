-- =============================================================
-- Migration 030: Phase 3 — jobs, dispatch, crew, fleet
-- =============================================================
-- See docs/JOBS_DISPATCH.md.
--
--   1. employee_absences — vacation, sickness, other (availability)
--   2. vehicles: m³, payload kg, next inspection (MFK)
--   3. job_vehicles — vehicles per job (independent of crew rows)
--   5. job_resource_conflicts() — double bookings, absences, unavailable
--   6. System task rules: inspection / insurance / licence expiring
-- =============================================================

-- =============================================================
-- 1. Absences
-- =============================================================

CREATE TABLE employee_absences (
  id            uuid          PRIMARY KEY DEFAULT gen_uuid_v7(),
  company_id    uuid          NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  employee_id   uuid          NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  kind          text          NOT NULL CHECK (kind IN ('vacation', 'sick', 'other')),
  starts_on     date          NOT NULL,
  ends_on       date          NOT NULL,
  note          text,
  created_by    uuid          REFERENCES profiles(id) ON DELETE SET NULL,
  created_at    timestamptz   NOT NULL DEFAULT now(),
  CONSTRAINT employee_absences_range CHECK (ends_on >= starts_on)
);

CREATE INDEX idx_employee_absences_lookup ON employee_absences(company_id, employee_id, starts_on, ends_on);

ALTER TABLE employee_absences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "employee_absences_select" ON employee_absences
  FOR SELECT USING (company_id = public.auth_company_id());
GRANT SELECT ON TABLE employee_absences TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE employee_absences TO service_role;

-- =============================================================
-- 2. Vehicles (Swiss units)
-- =============================================================

ALTER TABLE vehicles
  ADD COLUMN capacity_m3          numeric(6,1) CHECK (capacity_m3 IS NULL OR capacity_m3 > 0),
  ADD COLUMN payload_kg           integer      CHECK (payload_kg IS NULL OR payload_kg > 0),
  ADD COLUMN next_inspection_on   date;

COMMENT ON COLUMN vehicles.capacity_cuft IS 'Deprecated (migration 030): use capacity_m3.';
COMMENT ON COLUMN vehicles.max_weight_lbs IS 'Deprecated (migration 030): use payload_kg.';
COMMENT ON COLUMN vehicles.next_inspection_on IS 'Next periodic vehicle inspection (MFK).';

-- =============================================================
-- 3. Vehicles per job
-- =============================================================

CREATE TABLE job_vehicles (
  id            uuid          PRIMARY KEY DEFAULT gen_uuid_v7(),
  company_id    uuid          NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  job_id        uuid          NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  vehicle_id    uuid          NOT NULL REFERENCES vehicles(id) ON DELETE RESTRICT,
  assigned_by   uuid          REFERENCES profiles(id) ON DELETE SET NULL,
  created_at    timestamptz   NOT NULL DEFAULT now(),
  CONSTRAINT job_vehicles_unique UNIQUE (job_id, vehicle_id)
);

CREATE INDEX idx_job_vehicles_vehicle ON job_vehicles(vehicle_id);

ALTER TABLE job_vehicles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "job_vehicles_select" ON job_vehicles
  FOR SELECT USING (company_id = public.auth_company_id());
GRANT SELECT ON TABLE job_vehicles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE job_vehicles TO service_role;

COMMENT ON COLUMN job_assignments.vehicle_id IS 'Deprecated (migration 030): vehicles are assigned in job_vehicles.';

-- (4. One row per employee and job: unique index exists since migration 008.)

-- =============================================================
-- 5. Resource conflicts
-- =============================================================
-- A job occupies its date from scheduled_start_time (default 07:00) for
-- estimated_duration_hours (default 8 h). Conflicts:
--   employee_double_booked / vehicle_double_booked — overlapping active job
--   employee_absent        — absence covering the date
--   employee_inactive      — employee not active
--   vehicle_unavailable    — vehicle in maintenance or retired
--   vehicle_inspection_due — inspection (MFK) date passed before the job

CREATE OR REPLACE FUNCTION public.job_window(p_date date, p_start time, p_hours numeric)
RETURNS tstzrange
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT tstzrange(
    (p_date + coalesce(p_start, time '07:00'))::timestamp AT TIME ZONE 'Europe/Zurich',
    (p_date + coalesce(p_start, time '07:00'))::timestamp AT TIME ZONE 'Europe/Zurich'
      + make_interval(mins => (coalesce(p_hours, 8) * 60)::int),
    '[)'
  );
$$;

CREATE OR REPLACE FUNCTION public.job_resource_conflicts(
  p_job_id        uuid,
  p_employee_ids  uuid[] DEFAULT NULL,
  p_vehicle_ids   uuid[] DEFAULT NULL
)
RETURNS TABLE (
  resource_type  text,
  resource_id    uuid,
  conflict       text,
  other_job_id   uuid,
  other_job_number text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_job public.jobs%ROWTYPE;
  v_window tstzrange;
  v_employees uuid[];
  v_vehicles uuid[];
BEGIN
  SELECT * INTO v_job FROM public.jobs WHERE id = p_job_id AND deleted_at IS NULL;
  IF v_job.id IS NULL
     OR (public.is_user_request() AND v_job.company_id IS DISTINCT FROM public.auth_company_id()) THEN
    RAISE EXCEPTION 'not_found: job %', p_job_id USING ERRCODE = 'no_data_found';
  END IF;

  v_window := public.job_window(v_job.scheduled_date, v_job.scheduled_start_time, v_job.estimated_duration_hours);
  -- Proposed sets (when assigning) or the current assignment
  v_employees := coalesce(p_employee_ids,
    ARRAY(SELECT employee_id FROM public.job_assignments WHERE job_id = p_job_id));
  v_vehicles := coalesce(p_vehicle_ids,
    ARRAY(SELECT vehicle_id FROM public.job_vehicles WHERE job_id = p_job_id));

  RETURN QUERY
  -- employees on another overlapping job
  SELECT 'employee', ja.employee_id, 'employee_double_booked', j.id, j.job_number
    FROM public.job_assignments ja
    JOIN public.jobs j ON j.id = ja.job_id
   WHERE ja.employee_id = ANY (v_employees)
     AND j.id <> p_job_id
     AND j.company_id = v_job.company_id
     AND j.deleted_at IS NULL
     AND j.status NOT IN ('cancelled', 'completed')
     AND public.job_window(j.scheduled_date, j.scheduled_start_time, j.estimated_duration_hours) && v_window
  UNION ALL
  SELECT 'employee', a.employee_id, 'employee_absent', NULL::uuid, NULL::text
    FROM public.employee_absences a
   WHERE a.employee_id = ANY (v_employees)
     AND v_job.scheduled_date BETWEEN a.starts_on AND a.ends_on
  UNION ALL
  SELECT 'employee', e.id, 'employee_inactive', NULL::uuid, NULL::text
    FROM public.employees e
   WHERE e.id = ANY (v_employees) AND (e.status <> 'active' OR e.deleted_at IS NOT NULL)
  UNION ALL
  SELECT 'vehicle', jv.vehicle_id, 'vehicle_double_booked', j.id, j.job_number
    FROM public.job_vehicles jv
    JOIN public.jobs j ON j.id = jv.job_id
   WHERE jv.vehicle_id = ANY (v_vehicles)
     AND j.id <> p_job_id
     AND j.company_id = v_job.company_id
     AND j.deleted_at IS NULL
     AND j.status NOT IN ('cancelled', 'completed')
     AND public.job_window(j.scheduled_date, j.scheduled_start_time, j.estimated_duration_hours) && v_window
  UNION ALL
  SELECT 'vehicle', v.id, 'vehicle_unavailable', NULL::uuid, NULL::text
    FROM public.vehicles v
   WHERE v.id = ANY (v_vehicles) AND (v.status IN ('maintenance', 'retired') OR v.deleted_at IS NOT NULL)
  UNION ALL
  SELECT 'vehicle', v.id, 'vehicle_inspection_due', NULL::uuid, NULL::text
    FROM public.vehicles v
   WHERE v.id = ANY (v_vehicles) AND v.next_inspection_on IS NOT NULL
     AND v.next_inspection_on < v_job.scheduled_date;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.job_resource_conflicts(uuid, uuid[], uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.job_resource_conflicts(uuid, uuid[], uuid[]) TO authenticated, service_role;

-- =============================================================
-- 6. System task rules for fleet and crew documents
-- =============================================================
-- Extends the view from migration 025 (definition repeated in full).

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
   WHERE i.status = 'overdue' AND i.deleted_at IS NULL
  -- New in migration 030 ───────────────────────────────────────
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

ALTER TABLE tasks DROP CONSTRAINT tasks_entity_type_check;
ALTER TABLE tasks ADD CONSTRAINT tasks_entity_type_check
  CHECK (entity_type IN ('lead', 'quote', 'job', 'customer', 'invoice', 'appointment', 'payment', 'vehicle', 'employee'));
