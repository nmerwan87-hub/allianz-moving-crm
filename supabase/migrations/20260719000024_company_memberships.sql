-- =============================================================
-- Migration 024: Company Memberships (Multi-Company Access)
-- =============================================================
-- One person (profiles.id = auth.users.id) can belong to several
-- companies, each with its own role. See docs/MULTI_COMPANY_ACCESS.md.
--
--   profiles            → the person; profiles.company_id is the
--                          ACTIVE company (what the JWT carries)
--   company_memberships → the person in a company (role, is_active);
--                          source of truth for role and access
--
-- Tenant isolation is unchanged: every business-table RLS policy
-- still compares company_id with public.auth_company_id() from the
-- signed JWT. Only the hook (which company goes into the JWT) and
-- the profile/team visibility change.
--
-- SECURITY FIX (pre-existing): authenticated had UPDATE on every
-- column of its own profile row, including role and is_active.
-- An office user could promote itself to owner. Column grants below
-- restrict self-service updates to personal fields, and role now
-- comes from company_memberships, which authenticated cannot write.
-- =============================================================

-- =============================================================
-- 1. Table
-- =============================================================

CREATE TABLE company_memberships (
  id            uuid          PRIMARY KEY DEFAULT gen_uuid_v7(),
  company_id    uuid          NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id       uuid          NOT NULL REFERENCES profiles(id)  ON DELETE CASCADE,
  role          user_role     NOT NULL DEFAULT 'office',
  is_active     boolean       NOT NULL DEFAULT true,
  last_used_at  timestamptz,
  created_at    timestamptz   NOT NULL DEFAULT now(),
  updated_at    timestamptz   NOT NULL DEFAULT now(),

  CONSTRAINT company_memberships_unique UNIQUE (company_id, user_id)
);

CREATE INDEX idx_company_memberships_user_id ON company_memberships(user_id);

CREATE TRIGGER trg_company_memberships_updated_at
  BEFORE UPDATE ON company_memberships
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- =============================================================
-- 2. Backfill — one membership per existing profile
-- =============================================================

INSERT INTO company_memberships (company_id, user_id, role, is_active, last_used_at)
SELECT company_id, id, role, is_active, now()
  FROM profiles
 WHERE deleted_at IS NULL
ON CONFLICT (company_id, user_id) DO NOTHING;

-- =============================================================
-- 3. Profile insert → first membership
-- =============================================================
-- Every existing creation path (registration, invitation, seed,
-- tests) inserts a profile with company_id + role. This trigger
-- turns that into the person's first membership, so those paths
-- need no change.

CREATE OR REPLACE FUNCTION public.create_membership_for_new_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_catalog
AS $$
BEGIN
  INSERT INTO public.company_memberships (company_id, user_id, role, is_active, last_used_at)
  VALUES (NEW.company_id, NEW.id, NEW.role, NEW.is_active, now())
  ON CONFLICT (company_id, user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_profiles_create_membership
  AFTER INSERT ON profiles
  FOR EACH ROW EXECUTE FUNCTION public.create_membership_for_new_profile();

-- =============================================================
-- 4. Membership change → mirror onto profile (active company only)
-- =============================================================
-- profiles.role / profiles.is_active are legacy mirrors of the active
-- membership. One-way only: membership → profile. Never the reverse,
-- otherwise a profile write could change a membership role.

CREATE OR REPLACE FUNCTION public.mirror_membership_to_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  UPDATE public.profiles
     SET role = NEW.role,
         is_active = NEW.is_active
   WHERE id = NEW.user_id
     AND company_id = NEW.company_id
     AND (role IS DISTINCT FROM NEW.role OR is_active IS DISTINCT FROM NEW.is_active);
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_company_memberships_mirror
  AFTER UPDATE OF role, is_active ON company_memberships
  FOR EACH ROW EXECUTE FUNCTION public.mirror_membership_to_profile();

-- =============================================================
-- 5. Every company keeps at least one active owner
-- =============================================================
-- Applies to direct demotion, deactivation and deletion of a
-- membership. Cascaded deletes (the company or the profile itself is
-- being deleted) are allowed: by the time the cascade fires, the
-- parent row no longer exists.

CREATE OR REPLACE FUNCTION public.enforce_company_has_owner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  IF OLD.role <> 'owner' OR NOT OLD.is_active THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.role = 'owner' AND NEW.is_active THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' AND (
       NOT EXISTS (SELECT 1 FROM public.companies WHERE id = OLD.company_id)
    OR NOT EXISTS (SELECT 1 FROM public.profiles  WHERE id = OLD.user_id)
  ) THEN
    RETURN OLD;
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM public.company_memberships
     WHERE company_id = OLD.company_id
       AND id <> OLD.id
       AND role = 'owner'
       AND is_active
  ) THEN
    RAISE EXCEPTION 'A company must keep at least one active owner'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER trg_company_memberships_owner_guard
  BEFORE UPDATE OF role, is_active OR DELETE ON company_memberships
  FOR EACH ROW EXECUTE FUNCTION public.enforce_company_has_owner();

-- =============================================================
-- 6. RLS
-- =============================================================

ALTER TABLE company_memberships ENABLE ROW LEVEL SECURITY;

-- Own memberships (company switcher) + memberships of the active
-- company (team list). No write policies: writes go through the
-- service role on the server or the SECURITY DEFINER functions below.
CREATE POLICY "company_memberships_select" ON company_memberships
  FOR SELECT USING (
    user_id = auth.uid()
    OR company_id = public.auth_company_id()
  );

GRANT SELECT ON TABLE company_memberships TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE company_memberships TO service_role;
GRANT SELECT ON TABLE company_memberships TO supabase_auth_admin;

-- Profiles: visible when the person is a member of the active company
-- (also while they are working in another of their companies), plus
-- the caller's own row.
DROP POLICY "profiles_select" ON profiles;
CREATE POLICY "profiles_select" ON profiles
  FOR SELECT USING (
    deleted_at IS NULL
    AND (
      id = auth.uid()
      OR EXISTS (
        SELECT 1
          FROM public.company_memberships m
         WHERE m.user_id = profiles.id
           AND m.company_id = public.auth_company_id()
      )
    )
  );

-- Self-service profile updates: personal fields only.
REVOKE UPDATE ON TABLE profiles FROM authenticated;
GRANT UPDATE (first_name, last_name, phone, avatar_url, last_seen_at)
  ON TABLE profiles TO authenticated;

-- =============================================================
-- 7. switch_active_company()
-- =============================================================
-- Called by the server (tRPC iam.session.switchCompany) with the
-- user's own JWT. Verifies membership and company status, then sets
-- the active company. The client must refresh its session afterwards
-- so the hook issues a token for the new company.

CREATE OR REPLACE FUNCTION public.switch_active_company(p_company_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_catalog
AS $$
DECLARE
  v_user_id  uuid := auth.uid();
  v_role     user_role;
  v_previous uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT m.role
    INTO v_role
    FROM public.company_memberships m
    JOIN public.companies c ON c.id = m.company_id
   WHERE m.user_id = v_user_id
     AND m.company_id = p_company_id
     AND m.is_active
     AND c.company_status = 'active'
     AND c.deleted_at IS NULL;

  IF v_role IS NULL THEN
    RAISE EXCEPTION 'No active membership in this company' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT company_id INTO v_previous FROM public.profiles WHERE id = v_user_id;

  UPDATE public.profiles
     SET company_id = p_company_id,
         role = v_role,
         is_active = true
   WHERE id = v_user_id;

  UPDATE public.company_memberships
     SET last_used_at = now()
   WHERE user_id = v_user_id
     AND company_id = p_company_id;

  IF v_previous IS DISTINCT FROM p_company_id THEN
    INSERT INTO public.activity_logs (
      company_id, actor_id, actor_type, action, entity_type, entity_id, metadata
    ) VALUES (
      p_company_id, v_user_id, 'user', 'company.switched_in', 'profile', v_user_id,
      jsonb_build_object('from_company_id', v_previous)
    );
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.switch_active_company(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.switch_active_company(uuid) TO authenticated;

-- =============================================================
-- 8. custom_access_token_hook — membership-aware
-- =============================================================
-- Replaces the version from migration 021.
--   1. Active company = profiles.company_id, if the person still has
--      an active membership there.
--   2. Otherwise fall back to the most recently used active membership
--      in an active company (e.g. after being removed from a company).
--   3. Role comes from the membership, never from profiles.role.
--   4. No usable membership → claims unchanged → middleware rejects.
-- The hook is STABLE and cannot write; the fallback is persisted by
-- the next switch_active_company() call from the app.

CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_user_id        uuid;
  v_company_id     uuid;
  v_role           text;
  v_company_status text;
  v_claims         jsonb;
BEGIN
  v_user_id := (event ->> 'user_id')::uuid;

  -- Preferred: the profile's active company.
  SELECT m.company_id, m.role::text, c.company_status::text
    INTO v_company_id, v_role, v_company_status
    FROM public.profiles p
    JOIN public.company_memberships m ON m.user_id = p.id AND m.company_id = p.company_id
    JOIN public.companies c ON c.id = m.company_id
   WHERE p.id = v_user_id
     AND p.deleted_at IS NULL
     AND m.is_active;

  -- Fallback: most recently used active membership in an active company.
  IF v_company_id IS NULL THEN
    SELECT m.company_id, m.role::text, c.company_status::text
      INTO v_company_id, v_role, v_company_status
      FROM public.profiles p
      JOIN public.company_memberships m ON m.user_id = p.id
      JOIN public.companies c ON c.id = m.company_id
     WHERE p.id = v_user_id
       AND p.deleted_at IS NULL
       AND m.is_active
       AND c.company_status = 'active'
     ORDER BY m.last_used_at DESC NULLS LAST, m.created_at
     LIMIT 1;
  END IF;

  v_claims := event -> 'claims';

  IF v_company_id IS NOT NULL THEN
    v_claims := jsonb_set(
      v_claims,
      '{app_metadata}',
      COALESCE(v_claims -> 'app_metadata', '{}'::jsonb)
        || jsonb_build_object(
             'company_id',     v_company_id,
             'role',           v_role,
             'company_status', v_company_status
           )
    );
  END IF;

  RETURN jsonb_build_object('claims', v_claims);
END;
$$;

GRANT EXECUTE ON FUNCTION public.custom_access_token_hook TO supabase_auth_admin;
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook FROM authenticated, anon;
