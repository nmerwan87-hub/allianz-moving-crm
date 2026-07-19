-- =============================================================
-- Migration 011: Tasks & Notifications
-- =============================================================
-- Depends on: 002 (companies, profiles)
-- =============================================================

-- ─── tasks ───────────────────────────────────────────────────
CREATE TABLE tasks (
  id              uuid            PRIMARY KEY DEFAULT gen_uuid_v7(),
  company_id      uuid            NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  created_by      uuid            REFERENCES profiles(id) ON DELETE SET NULL,
  assigned_to     uuid            REFERENCES profiles(id) ON DELETE SET NULL,

  -- Context (what this task relates to)
  entity_type     text            CHECK (entity_type IN ('lead', 'quote', 'job', 'customer', 'invoice')),
  entity_id       uuid,

  -- Task details
  title           text            NOT NULL,
  description     text,
  status          task_status     NOT NULL DEFAULT 'open',
  priority        task_priority   NOT NULL DEFAULT 'medium',

  -- Timing
  due_at          timestamptz,
  completed_at    timestamptz,
  completed_by    uuid            REFERENCES profiles(id) ON DELETE SET NULL,

  -- Soft delete
  deleted_at      timestamptz,

  -- Timestamps
  created_at      timestamptz     NOT NULL DEFAULT now(),
  updated_at      timestamptz     NOT NULL DEFAULT now()
);

-- ─── notifications ───────────────────────────────────────────
-- In-app notifications. Supabase Realtime broadcasts on INSERT.
-- Append-only per design — no updated_at, no deleted_at.
-- (Only read_at is updated to track read state.)
CREATE TABLE notifications (
  id              uuid            PRIMARY KEY DEFAULT gen_uuid_v7(),
  company_id      uuid            NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id         uuid            NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

  -- Type (maps to a notification template in the application)
  type            text            NOT NULL,

  -- Display content
  title           text            NOT NULL,
  body            text            NOT NULL,

  -- Deep link
  entity_type     text,
  entity_id       uuid,
  action_url      text,

  -- Read state
  read_at         timestamptz,

  -- Append-only
  created_at      timestamptz     NOT NULL DEFAULT now()
);
