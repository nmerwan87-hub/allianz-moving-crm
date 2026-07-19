-- =============================================================
-- Migration 002: Core Entities — companies, profiles
-- =============================================================
-- Depends on: 001 (all ENUMs, gen_uuid_v7, helpers)
-- =============================================================

-- ─── companies ───────────────────────────────────────────────
CREATE TABLE companies (
  id                    uuid          PRIMARY KEY DEFAULT gen_uuid_v7(),
  name                  text          NOT NULL,
  slug                  text          NOT NULL UNIQUE,
  email                 text,
  phone                 text,
  website               text,

  -- Address
  address_line1         text,
  address_line2         text,
  city                  text,
  state                 text,
  postal_code           text,
  country               text          NOT NULL DEFAULT 'US',

  -- Business identity
  timezone              text          NOT NULL DEFAULT 'America/New_York',
  currency              text          NOT NULL DEFAULT 'USD',
  logo_url              text,
  license_number        text,
  usdot_number          text,
  mc_number             text,

  -- Subscription
  subscription_tier     subscription_tier     NOT NULL DEFAULT 'free',
  subscription_status   subscription_status   NOT NULL DEFAULT 'trialing',
  trial_ends_at         timestamptz,
  stripe_customer_id    text,
  current_period_end    timestamptz,

  -- Sequence counters (human-readable number generation)
  quote_sequence        integer       NOT NULL DEFAULT 0,
  job_sequence          integer       NOT NULL DEFAULT 0,
  invoice_sequence      integer       NOT NULL DEFAULT 0,

  -- Soft delete
  deleted_at            timestamptz,

  -- Timestamps
  created_at            timestamptz   NOT NULL DEFAULT now(),
  updated_at            timestamptz   NOT NULL DEFAULT now(),

  CONSTRAINT companies_slug_format
    CHECK (slug ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?$'),
  CONSTRAINT companies_country_length
    CHECK (char_length(country) = 2)
);

-- ─── profiles ────────────────────────────────────────────────
-- id is the same UUID as auth.users.id — no DEFAULT gen_uuid_v7()
CREATE TABLE profiles (
  id                    uuid          PRIMARY KEY,
  company_id            uuid          NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  role                  user_role     NOT NULL DEFAULT 'office',

  -- Identity
  first_name            text          NOT NULL,
  last_name             text          NOT NULL,
  email                 text          NOT NULL,
  phone                 text,
  avatar_url            text,

  -- Status
  is_active             boolean       NOT NULL DEFAULT true,

  -- Invite tracking
  invited_by            uuid          REFERENCES profiles(id) ON DELETE SET NULL,
  invited_at            timestamptz,

  -- Activity
  last_seen_at          timestamptz,

  -- Soft delete
  deleted_at            timestamptz,

  -- Timestamps
  created_at            timestamptz   NOT NULL DEFAULT now(),
  updated_at            timestamptz   NOT NULL DEFAULT now()
);

-- Unique active email per company (enforced via partial unique index)
CREATE UNIQUE INDEX idx_profiles_email_per_company
  ON profiles(company_id, email)
  WHERE deleted_at IS NULL;
