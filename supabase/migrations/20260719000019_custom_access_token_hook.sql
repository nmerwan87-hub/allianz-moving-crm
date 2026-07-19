-- =============================================================
-- Migration 019: Custom Access Token Hook
-- =============================================================
-- Creates the hook function that injects company_id + role into
-- the Supabase JWT app_metadata on every token issue.
-- This is what makes triple-layer tenant isolation possible:
--   JWT claim → public.auth_company_id() → RLS policies
--   JWT claim → public.auth_user_role()  → permission checks
--
-- SECURITY:
--   - Function is SECURITY DEFINER so it can read profiles
--     without the caller needing direct table access.
--   - REVOKE EXECUTE from authenticated/anon — only supabase_auth_admin
--     may call this function.
--   - Never expose service-role key to clients.
--   - Never trust company_id from browser input — always derive from JWT.
--
-- After applying this migration, wire it in supabase/config.toml:
--   [auth.hook.custom_access_token]
--   enabled = true
--   uri = "pg-functions://postgres/public/custom_access_token_hook"
-- =============================================================

CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_user_id   uuid;
  v_company_id uuid;
  v_role      text;
  v_claims    jsonb;
BEGIN
  -- Extract the authenticated user's UUID from the hook event
  v_user_id := (event ->> 'user_id')::uuid;

  -- Look up the user's tenant and role from profiles
  -- profiles.id = auth.users.id (guaranteed by onboarding hook)
  SELECT company_id, role::text
    INTO v_company_id, v_role
    FROM public.profiles
    WHERE id = v_user_id
      AND deleted_at IS NULL
      AND is_active = true;

  -- Build the claims object, preserving all existing claims
  v_claims := event -> 'claims';

  IF v_company_id IS NOT NULL THEN
    -- Inject company_id and role into app_metadata
    v_claims := jsonb_set(
      v_claims,
      '{app_metadata}',
      COALESCE(v_claims -> 'app_metadata', '{}'::jsonb)
        || jsonb_build_object(
             'company_id', v_company_id,
             'role',       v_role
           )
    );
  END IF;
  -- If no profile found (e.g., platform admin or incomplete signup),
  -- return claims unchanged — the middleware will reject the request.

  RETURN jsonb_build_object('claims', v_claims);
END;
$$;

-- Grant execution rights to supabase_auth_admin only.
-- This is the internal Supabase role that fires auth hooks.
GRANT USAGE ON SCHEMA public TO supabase_auth_admin;
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook TO supabase_auth_admin;

-- Revoke from all other roles — this function must never be called directly.
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook FROM authenticated, anon;

-- supabase_auth_admin needs to read profiles to resolve company + role.
GRANT SELECT ON TABLE public.profiles TO supabase_auth_admin;
