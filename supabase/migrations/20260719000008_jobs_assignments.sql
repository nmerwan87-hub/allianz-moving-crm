-- =============================================================
-- Migration 008: Jobs & Assignments — jobs, job_assignments
-- =============================================================
-- Depends on: 002 (companies, profiles), 003 (customers),
--             004 (employees, vehicles), 007 (quotes)
-- Resolves forward reference from migration 003:
--   appointments.job_id → jobs(id) ON DELETE SET NULL
-- =============================================================

-- ─── jobs ────────────────────────────────────────────────────
CREATE TABLE jobs (
  id                        uuid          PRIMARY KEY DEFAULT gen_uuid_v7(),
  company_id                uuid          NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  quote_id                  uuid          REFERENCES quotes(id) ON DELETE RESTRICT,
  customer_id               uuid          NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  created_by                uuid          REFERENCES profiles(id) ON DELETE SET NULL,

  -- Human-readable identifier (JB-2026-001)
  job_number                text          NOT NULL,

  -- Lifecycle
  status                    job_status    NOT NULL DEFAULT 'scheduled',

  -- Move details
  move_type                 move_type     NOT NULL,

  -- Scheduling
  scheduled_date            date          NOT NULL,
  scheduled_start_time      time,
  estimated_duration_hours  numeric(4,2)  CHECK (estimated_duration_hours > 0),

  -- Actual timing
  actual_start_at           timestamptz,
  actual_end_at             timestamptz,

  -- Origin
  origin_address            text          NOT NULL,
  origin_city               text          NOT NULL,
  origin_state              text,
  origin_postal_code        text,
  origin_country            text          NOT NULL DEFAULT 'US',
  origin_floor              smallint      CHECK (origin_floor >= 0),
  origin_has_elevator       boolean       NOT NULL DEFAULT false,
  origin_has_stairs         boolean       NOT NULL DEFAULT false,
  origin_parking_notes      text,
  origin_access_notes       text,

  -- Destination
  dest_address              text          NOT NULL,
  dest_city                 text          NOT NULL,
  dest_state                text,
  dest_postal_code          text,
  dest_country              text          NOT NULL DEFAULT 'US',
  dest_floor                smallint      CHECK (dest_floor >= 0),
  dest_has_elevator         boolean       NOT NULL DEFAULT false,
  dest_has_stairs           boolean       NOT NULL DEFAULT false,
  dest_parking_notes        text,
  dest_access_notes         text,

  -- Distance
  distance_miles            numeric(8,2)  CHECK (distance_miles > 0),

  -- Crew requirements
  crew_size_required        smallint      NOT NULL DEFAULT 2 CHECK (crew_size_required > 0),

  -- Financial snapshot from accepted quote
  total_amount_cents        integer       NOT NULL DEFAULT 0 CHECK (total_amount_cents >= 0),
  deposit_amount_cents      integer       NOT NULL DEFAULT 0 CHECK (deposit_amount_cents >= 0),
  deposit_paid_at           timestamptz,

  -- Completion
  completion_notes          text,
  customer_signature_url    text,

  -- Cancellation
  cancelled_at              timestamptz,
  cancellation_reason       text,
  cancelled_by              uuid          REFERENCES profiles(id) ON DELETE SET NULL,

  -- Notes
  internal_notes            text,
  customer_notes            text,
  special_instructions      text,

  -- Soft delete
  deleted_at                timestamptz,

  -- Timestamps
  created_at                timestamptz   NOT NULL DEFAULT now(),
  updated_at                timestamptz   NOT NULL DEFAULT now(),

  CONSTRAINT jobs_cancellation_reason_required
    CHECK (status != 'cancelled' OR cancellation_reason IS NOT NULL),
  CONSTRAINT jobs_cancelled_at_required
    CHECK (status != 'cancelled' OR cancelled_at IS NOT NULL),
  CONSTRAINT jobs_deposit_lte_total
    CHECK (deposit_amount_cents <= total_amount_cents)
);

-- Unique job number per company
CREATE UNIQUE INDEX idx_jobs_number
  ON jobs(company_id, job_number);

-- ─── job_assignments ─────────────────────────────────────────
CREATE TABLE job_assignments (
  id              uuid              PRIMARY KEY DEFAULT gen_uuid_v7(),
  company_id      uuid              NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  job_id          uuid              NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  employee_id     uuid              NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  vehicle_id      uuid              REFERENCES vehicles(id) ON DELETE SET NULL,

  -- Role on this specific job
  role            assignment_role   NOT NULL DEFAULT 'mover',

  -- Who made this assignment
  assigned_by     uuid              REFERENCES profiles(id) ON DELETE SET NULL,
  assigned_at     timestamptz       NOT NULL DEFAULT now(),

  -- Notes
  notes           text,

  -- Timestamps (no soft delete — managed via job lifecycle)
  created_at      timestamptz       NOT NULL DEFAULT now(),
  updated_at      timestamptz       NOT NULL DEFAULT now()
);

-- One assignment per employee per job
CREATE UNIQUE INDEX idx_job_assignments_unique
  ON job_assignments(job_id, employee_id);

-- Only one lead foreman per job
CREATE UNIQUE INDEX idx_job_assignments_one_lead
  ON job_assignments(job_id)
  WHERE role = 'lead';

-- ─── Resolve forward reference from migration 003 ─────────────
-- appointments.job_id was a bare uuid column; add the FK now that jobs exists.
ALTER TABLE appointments
  ADD CONSTRAINT appointments_job_id_fk
    FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE SET NULL;
