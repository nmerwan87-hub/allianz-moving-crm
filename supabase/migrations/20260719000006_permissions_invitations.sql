-- =============================================================
-- Migration 006: Permissions & Invitations
-- =============================================================
-- Tables: permission_definitions, permission_groups,
--         permission_group_assignments, user_permission_groups,
--         user_permission_overrides, user_invitations
-- Depends on: 002 (companies, profiles)
-- =============================================================

-- ─── permission_definitions ──────────────────────────────────
-- System-level reference table. No company_id. No RLS.
-- Populated by migration 020 (seed_defaults).
CREATE TABLE permission_definitions (
  key             text          PRIMARY KEY,
  resource        text          NOT NULL,
  action          text          NOT NULL,
  description     text          NOT NULL,
  is_sensitive    boolean       NOT NULL DEFAULT false,
  created_at      timestamptz   NOT NULL DEFAULT now()
);

-- ─── permission_groups ───────────────────────────────────────
CREATE TABLE permission_groups (
  id              uuid          PRIMARY KEY DEFAULT gen_uuid_v7(),
  company_id      uuid          NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name            text          NOT NULL,
  description     text,
  color           text,
  is_default      boolean       NOT NULL DEFAULT false,
  deleted_at      timestamptz,
  created_at      timestamptz   NOT NULL DEFAULT now(),
  updated_at      timestamptz   NOT NULL DEFAULT now()
);

-- Unique group name per company (excludes soft-deleted groups)
CREATE UNIQUE INDEX idx_permission_groups_unique_name
  ON permission_groups(company_id, name)
  WHERE deleted_at IS NULL;

-- ─── permission_group_assignments ────────────────────────────
-- Which permission strings are granted by each group.
-- Changes are delete + insert (no UPDATE). No updated_at.
CREATE TABLE permission_group_assignments (
  id              uuid          PRIMARY KEY DEFAULT gen_uuid_v7(),
  company_id      uuid          NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  group_id        uuid          NOT NULL REFERENCES permission_groups(id) ON DELETE CASCADE,
  permission_key  text          NOT NULL REFERENCES permission_definitions(key) ON DELETE CASCADE,
  created_by      uuid          REFERENCES profiles(id) ON DELETE SET NULL,
  created_at      timestamptz   NOT NULL DEFAULT now()
);

-- A group cannot grant the same permission twice
CREATE UNIQUE INDEX idx_pga_unique_grant
  ON permission_group_assignments(group_id, permission_key);

-- ─── user_permission_groups ──────────────────────────────────
-- Which permission groups an Office user belongs to.
CREATE TABLE user_permission_groups (
  id              uuid          PRIMARY KEY DEFAULT gen_uuid_v7(),
  company_id      uuid          NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id         uuid          NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  group_id        uuid          NOT NULL REFERENCES permission_groups(id) ON DELETE CASCADE,
  assigned_by     uuid          REFERENCES profiles(id) ON DELETE SET NULL,
  assigned_at     timestamptz   NOT NULL DEFAULT now()
);

-- A user belongs to a group at most once
CREATE UNIQUE INDEX idx_upg_unique_membership
  ON user_permission_groups(user_id, group_id);

-- ─── user_permission_overrides ───────────────────────────────
-- Individual grant or deny overrides on top of group assignments.
CREATE TABLE user_permission_overrides (
  id              uuid                    PRIMARY KEY DEFAULT gen_uuid_v7(),
  company_id      uuid                    NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id         uuid                    NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  permission_key  text                    NOT NULL REFERENCES permission_definitions(key) ON DELETE CASCADE,
  override_type   permission_override_type NOT NULL,
  reason          text,
  set_by          uuid                    REFERENCES profiles(id) ON DELETE SET NULL,
  set_at          timestamptz             NOT NULL DEFAULT now(),
  created_at      timestamptz             NOT NULL DEFAULT now()
);

-- One override per permission per user
CREATE UNIQUE INDEX idx_upo_unique_override
  ON user_permission_overrides(user_id, permission_key);

-- ─── user_invitations ────────────────────────────────────────
CREATE TABLE user_invitations (
  id                      uuid          PRIMARY KEY DEFAULT gen_uuid_v7(),
  company_id              uuid          NOT NULL REFERENCES companies(id) ON DELETE CASCADE,

  email                   text          NOT NULL,
  role                    user_role     NOT NULL,
  permission_group_ids    uuid[]        NOT NULL DEFAULT '{}',

  -- Only the SHA-256 hash of the raw token is stored. Raw token sent in email only.
  token_hash              text          NOT NULL UNIQUE,

  -- Inviting party (one of the two will be non-null)
  invited_by              uuid          REFERENCES profiles(id) ON DELETE SET NULL,
  invited_by_platform     uuid,         -- soft ref to platform_admin_users.id; no FK

  -- Status
  status                  text          NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending', 'accepted', 'expired', 'revoked')),

  -- Timing
  expires_at              timestamptz   NOT NULL DEFAULT (now() + INTERVAL '7 days'),
  accepted_at             timestamptz,
  accepted_by_auth_uid    uuid,         -- auth.users.id of accepting user

  -- Revocation
  revoked_at              timestamptz,
  revoked_by              uuid          REFERENCES profiles(id) ON DELETE SET NULL,
  revocation_reason       text,

  created_at              timestamptz   NOT NULL DEFAULT now()
);

-- Only one active invite per email per company
CREATE UNIQUE INDEX idx_invitations_one_pending_per_email
  ON user_invitations(company_id, email)
  WHERE status = 'pending';
