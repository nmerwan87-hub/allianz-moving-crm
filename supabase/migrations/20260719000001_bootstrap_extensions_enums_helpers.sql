-- =============================================================
-- Migration 001: Bootstrap — Extensions, UUID v7, ENUMs, Helpers
-- =============================================================
-- This migration must be applied before any other migration.
-- Creates: pgcrypto extension, gen_uuid_v7() function, all ENUMs,
--          auth helper functions, update_updated_at trigger function.
-- No tables are created here.
-- =============================================================

-- ─── Extensions ──────────────────────────────────────────────
-- Required by gen_uuid_v7() for gen_random_bytes()
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ─── UUID v7 Generator ───────────────────────────────────────
-- Custom UUID v7 function. PostgreSQL 17 has no native uuidv7().
-- When Supabase supports PG18, replace the body with: SELECT uuidv7();
-- All PRIMARY KEY DEFAULT clauses reference this function exclusively.
-- gen_random_uuid() (UUID v4) is FORBIDDEN throughout the schema.
CREATE OR REPLACE FUNCTION gen_uuid_v7()
RETURNS uuid
LANGUAGE plpgsql
VOLATILE PARALLEL SAFE
AS $$
DECLARE
  ts_ms    BIGINT;
  ts_hex   TEXT;
  rand_hex TEXT;
  variant  TEXT;
BEGIN
  ts_ms    := (EXTRACT(EPOCH FROM clock_timestamp()) * 1000)::BIGINT;
  ts_hex   := lpad(to_hex(ts_ms), 12, '0');
  rand_hex := encode(gen_random_bytes(10), 'hex');
  variant  := to_hex(8 + (get_byte(gen_random_bytes(1), 0) & 3));

  RETURN (
    substr(ts_hex,   1, 8) || '-' ||
    substr(ts_hex,   9, 4) || '-' ||
    '7' || substr(rand_hex, 1, 3) || '-' ||
    variant || substr(rand_hex, 4, 3) || '-' ||
    substr(rand_hex, 7, 12)
  )::uuid;
END;
$$;

-- ─── Auth Helper Functions ────────────────────────────────────
-- Used by all RLS policies for tenant isolation and RBAC.
-- Created in the auth schema so they mirror the built-in auth.uid() convention.

CREATE OR REPLACE FUNCTION auth.company_id()
RETURNS uuid
LANGUAGE sql STABLE
AS $$
  SELECT (auth.jwt() -> 'app_metadata' ->> 'company_id')::uuid;
$$;

CREATE OR REPLACE FUNCTION auth.role()
RETURNS text
LANGUAGE sql STABLE
AS $$
  SELECT (auth.jwt() -> 'app_metadata' ->> 'role')::text;
$$;

-- ─── Trigger: update_updated_at ──────────────────────────────
-- Applied to all business tables with an updated_at column in migration 017.
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ─── ENUMs ───────────────────────────────────────────────────

CREATE TYPE user_role AS ENUM (
  'owner',
  'office'
);

CREATE TYPE move_type AS ENUM (
  'local',
  'long_distance',
  'commercial',
  'international',
  'junk_removal'
);

CREATE TYPE lead_status AS ENUM (
  'new',
  'contacted',
  'surveyed',
  'quoted',
  'booked',
  'lost',
  'duplicate'
);

CREATE TYPE quote_status AS ENUM (
  'draft',
  'sent',
  'viewed',
  'accepted',
  'declined',
  'expired',
  'cancelled'
);

CREATE TYPE job_status AS ENUM (
  'scheduled',
  'confirmed',
  'in_progress',
  'completed',
  'cancelled',
  'on_hold'
);

CREATE TYPE invoice_status AS ENUM (
  'draft',
  'sent',
  'viewed',
  'partially_paid',
  'paid',
  'overdue',
  'void',
  'write_off'
);

CREATE TYPE payment_type AS ENUM (
  'deposit',
  'balance',
  'partial',
  'refund',
  'adjustment'
);

CREATE TYPE payment_method AS ENUM (
  'card',
  'ach',
  'cash',
  'check',
  'bank_transfer',
  'other'
);

CREATE TYPE payment_status AS ENUM (
  'pending',
  'completed',
  'failed',
  'refunded',
  'cancelled'
);

CREATE TYPE appointment_type AS ENUM (
  'survey',
  'virtual_survey',
  'callback',
  'site_visit'
);

CREATE TYPE appointment_status AS ENUM (
  'scheduled',
  'confirmed',
  'completed',
  'no_show',
  'cancelled'
);

CREATE TYPE employee_role AS ENUM (
  'driver',
  'mover',
  'foreman',
  'specialist'
);

CREATE TYPE employee_status AS ENUM (
  'active',
  'inactive',
  'terminated'
);

CREATE TYPE vehicle_type AS ENUM (
  'cargo_van',
  'box_truck_16ft',
  'box_truck_24ft',
  'box_truck_26ft',
  'semi_truck',
  'pickup_truck'
);

CREATE TYPE vehicle_status AS ENUM (
  'available',
  'in_use',
  'maintenance',
  'retired'
);

CREATE TYPE assignment_role AS ENUM (
  'lead',
  'mover'
);

CREATE TYPE document_type AS ENUM (
  'quote_pdf',
  'contract',
  'signed_contract',
  'invoice_pdf',
  'payment_receipt',
  'damage_report',
  'work_order',
  'delivery_receipt',
  'bill_of_lading',
  'credit_note',
  'booking_confirmation',
  'cancellation_confirmation',
  'survey_summary',
  'inventory_summary',
  'inventory_list',
  'photo',
  'license',
  'certification',
  'insurance_certificate',
  'other'
);

CREATE TYPE document_entity_type AS ENUM (
  'quote',
  'job',
  'invoice',
  'customer',
  'employee',
  'vehicle',
  'company'
);

CREATE TYPE document_generation_status AS ENUM (
  'pending',
  'generating',
  'generated',
  'failed',
  'superseded',
  'voided'
);

CREATE TYPE line_item_type AS ENUM (
  'labor',
  'truck',
  'packing',
  'fuel',
  'toll',
  'storage',
  'specialty',
  'surcharge',
  'discount',
  'other'
);

CREATE TYPE task_status AS ENUM (
  'open',
  'in_progress',
  'completed',
  'cancelled'
);

CREATE TYPE task_priority AS ENUM (
  'low',
  'medium',
  'high',
  'urgent'
);

CREATE TYPE email_delivery_status AS ENUM (
  'queued',
  'sent',
  'delivered',
  'opened',
  'clicked',
  'bounced',
  'complained',
  'failed'
);

CREATE TYPE ai_task_type AS ENUM (
  'inventory_parse',
  'lead_score',
  'email_draft',
  'quote_generate',
  'insight'
);

CREATE TYPE ai_result_status AS ENUM (
  'success',
  'failed',
  'partial',
  'fallback'
);

CREATE TYPE subscription_tier AS ENUM (
  'free',
  'starter',
  'pro',
  'business',
  'enterprise'
);

CREATE TYPE subscription_status AS ENUM (
  'trialing',
  'active',
  'past_due',
  'cancelled',
  'paused'
);

CREATE TYPE property_size AS ENUM (
  'studio',
  'one_bedroom',
  'two_bedroom',
  'three_bedroom',
  'four_bedroom',
  'five_plus_bedroom',
  'commercial_small',
  'commercial_medium',
  'commercial_large'
);

CREATE TYPE acquisition_source AS ENUM (
  'web_form',
  'phone_call',
  'referral',
  'marketplace',
  'repeat_customer',
  'social_media',
  'google_ads',
  'organic_search',
  'manual',
  'other'
);

CREATE TYPE pricing_mode AS ENUM (
  'fixed',
  'hourly',
  'quantity',
  'distance',
  'manual'
);

CREATE TYPE discount_type AS ENUM (
  'percent',
  'fixed'
);

CREATE TYPE permission_override_type AS ENUM (
  'grant',
  'deny'
);
