-- =============================================================
-- Migration 004: Workforce & Fleet — employees, vehicles
-- =============================================================
-- Depends on: 002 (companies, profiles)
-- =============================================================

-- ─── employees ───────────────────────────────────────────────
-- Planning records only in V1. Employees do not have login accounts.
CREATE TABLE employees (
  id                      uuid          PRIMARY KEY DEFAULT gen_uuid_v7(),
  company_id              uuid          NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,

  -- Identity
  first_name              text          NOT NULL,
  last_name               text          NOT NULL,
  email                   text,
  phone                   text,

  -- Role and status
  role                    employee_role   NOT NULL DEFAULT 'mover',
  status                  employee_status NOT NULL DEFAULT 'active',

  -- Employment
  employment_type         text          CHECK (employment_type IN ('full_time', 'part_time', 'contractor')),
  hourly_rate_cents       integer       CHECK (hourly_rate_cents >= 0),

  -- Driver qualifications
  driver_license_class    text,
  driver_license_expiry   date,

  -- Skills and notes
  skills                  text[]        NOT NULL DEFAULT '{}',
  notes                   text,

  -- V2+ link: when employees get login accounts
  profile_id              uuid          REFERENCES profiles(id) ON DELETE SET NULL,

  -- Soft delete
  deleted_at              timestamptz,

  -- Timestamps
  created_at              timestamptz   NOT NULL DEFAULT now(),
  updated_at              timestamptz   NOT NULL DEFAULT now()
);

-- ─── vehicles ────────────────────────────────────────────────
CREATE TABLE vehicles (
  id                      uuid          PRIMARY KEY DEFAULT gen_uuid_v7(),
  company_id              uuid          NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,

  -- Identity
  name                    text          NOT NULL,
  type                    vehicle_type  NOT NULL,

  -- Specifications
  make                    text,
  model                   text,
  year                    smallint      CHECK (year >= 1980 AND year <= 2100),
  color                   text,
  license_plate           text,
  vin                     text,

  -- Capacity
  capacity_cuft           integer       CHECK (capacity_cuft > 0),
  max_weight_lbs          integer       CHECK (max_weight_lbs > 0),

  -- Status
  status                  vehicle_status  NOT NULL DEFAULT 'available',

  -- Compliance
  insurance_policy_number text,
  insurance_expiry        date,
  registration_expiry     date,

  -- Notes
  notes                   text,

  -- Soft delete
  deleted_at              timestamptz,

  -- Timestamps
  created_at              timestamptz   NOT NULL DEFAULT now(),
  updated_at              timestamptz   NOT NULL DEFAULT now()
);
