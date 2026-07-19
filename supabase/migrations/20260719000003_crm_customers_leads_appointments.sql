-- =============================================================
-- Migration 003: CRM — customers, leads, appointments
-- =============================================================
-- Depends on: 002 (companies, profiles)
-- Note: appointments.job_id FK to jobs is a forward reference.
--       The FK constraint is added in migration 008 after jobs is created.
-- =============================================================

-- ─── customers ───────────────────────────────────────────────
CREATE TABLE customers (
  id                    uuid          PRIMARY KEY DEFAULT gen_uuid_v7(),
  company_id            uuid          NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,

  -- Identity
  first_name            text          NOT NULL,
  last_name             text          NOT NULL,
  email                 text,
  phone                 text,
  secondary_phone       text,

  -- Acquisition
  source                acquisition_source,
  referral_source       text,
  referral_customer_id  uuid          REFERENCES customers(id) ON DELETE SET NULL,

  -- Denormalized stats (maintained by application)
  total_jobs_count      integer       NOT NULL DEFAULT 0,
  total_revenue_cents   integer       NOT NULL DEFAULT 0,
  last_job_at           timestamptz,

  -- Notes
  internal_notes        text,

  -- Soft delete
  deleted_at            timestamptz,

  -- Timestamps
  created_at            timestamptz   NOT NULL DEFAULT now(),
  updated_at            timestamptz   NOT NULL DEFAULT now()
);

-- ─── leads ───────────────────────────────────────────────────
CREATE TABLE leads (
  id                    uuid          PRIMARY KEY DEFAULT gen_uuid_v7(),
  company_id            uuid          NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  customer_id           uuid          REFERENCES customers(id) ON DELETE SET NULL,
  assigned_to           uuid          REFERENCES profiles(id) ON DELETE SET NULL,

  -- Contact snapshot (pre-conversion; synced with customer after)
  first_name            text          NOT NULL,
  last_name             text          NOT NULL,
  email                 text,
  phone                 text,

  -- Move details
  move_type             move_type,
  requested_date        date,
  date_flexible         boolean       NOT NULL DEFAULT false,
  property_size         property_size,

  -- Origin address
  origin_address        text,
  origin_city           text,
  origin_state          text,
  origin_postal_code    text,
  origin_country        text          DEFAULT 'US',
  origin_floor          smallint      CHECK (origin_floor >= 0 AND origin_floor <= 200),
  origin_has_elevator   boolean       NOT NULL DEFAULT false,
  origin_has_stairs     boolean       NOT NULL DEFAULT false,
  origin_parking_notes  text,

  -- Destination address
  dest_address          text,
  dest_city             text,
  dest_state            text,
  dest_postal_code      text,
  dest_country          text          DEFAULT 'US',
  dest_floor            smallint      CHECK (dest_floor >= 0 AND dest_floor <= 200),
  dest_has_elevator     boolean       NOT NULL DEFAULT false,
  dest_has_stairs       boolean       NOT NULL DEFAULT false,
  dest_parking_notes    text,

  -- Estimated scope
  estimated_volume_cuft   numeric(8,2)  CHECK (estimated_volume_cuft > 0),
  estimated_distance_miles numeric(8,2) CHECK (estimated_distance_miles > 0),

  -- Lifecycle
  status                lead_status   NOT NULL DEFAULT 'new',
  lost_reason           text,
  converted_at          timestamptz,

  -- AI scoring
  ai_score              smallint      CHECK (ai_score >= 0 AND ai_score <= 100),
  ai_score_rationale    text,
  ai_score_computed_at  timestamptz,

  -- Acquisition
  source                acquisition_source,
  utm_source            text,
  utm_medium            text,
  utm_campaign          text,
  referrer_url          text,

  -- Notes
  internal_notes        text,

  -- Soft delete
  deleted_at            timestamptz,

  -- Timestamps
  created_at            timestamptz   NOT NULL DEFAULT now(),
  updated_at            timestamptz   NOT NULL DEFAULT now(),

  CONSTRAINT leads_lost_reason_required
    CHECK (status != 'lost' OR lost_reason IS NOT NULL)
);

-- ─── appointments ────────────────────────────────────────────
-- job_id is a soft reference here; FK constraint added in migration 008.
CREATE TABLE appointments (
  id                    uuid          PRIMARY KEY DEFAULT gen_uuid_v7(),
  company_id            uuid          NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  lead_id               uuid          REFERENCES leads(id) ON DELETE SET NULL,
  customer_id           uuid          REFERENCES customers(id) ON DELETE SET NULL,
  job_id                uuid,         -- FK to jobs(id) added in migration 008
  assigned_to           uuid          REFERENCES profiles(id) ON DELETE SET NULL,

  -- Type and status
  type                  appointment_type    NOT NULL,
  status                appointment_status  NOT NULL DEFAULT 'scheduled',

  -- Timing
  scheduled_at          timestamptz   NOT NULL,
  duration_minutes      integer       NOT NULL DEFAULT 60 CHECK (duration_minutes > 0),
  completed_at          timestamptz,

  -- Notes
  notes                 text,
  cancellation_reason   text,

  -- Soft delete
  deleted_at            timestamptz,

  -- Timestamps
  created_at            timestamptz   NOT NULL DEFAULT now(),
  updated_at            timestamptz   NOT NULL DEFAULT now(),

  CONSTRAINT appointments_at_least_one_parent
    CHECK (lead_id IS NOT NULL OR job_id IS NOT NULL OR customer_id IS NOT NULL),
  CONSTRAINT appointments_cancellation_reason_required
    CHECK (status != 'cancelled' OR cancellation_reason IS NOT NULL)
);
