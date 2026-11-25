-- =============================================================
-- 035 — Customer portal
-- =============================================================
-- Customers open their quote or invoice through a secret link (no login).
-- portal_token holds the SHA-256 hash of the link token, never the token
-- itself; the app derives the token with an HMAC so the same link can be
-- sent again. Accepting online records who accepted (typed name).

ALTER TABLE quotes
  ADD COLUMN accepted_by_name text
    CONSTRAINT quotes_accepted_by_name_length CHECK (char_length(accepted_by_name) <= 200);

-- The name may be set after sending (it is part of the acceptance)
CREATE OR REPLACE FUNCTION public.reject_locked_quote_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  -- Columns that may still change after sending (lifecycle and internal fields)
  v_mutable text[] := ARRAY[
    'status', 'updated_at', 'sent_at', 'viewed_at', 'view_count', 'accepted_at',
    'declined_at', 'declined_reason', 'portal_token', 'portal_token_expires_at',
    'terms_accepted', 'terms_accepted_at', 'signature_url', 'internal_notes',
    'deleted_at', 'lead_id', 'accepted_by_name'
  ];
BEGIN
  IF OLD.status = 'draft' THEN
    RETURN NEW;
  END IF;
  IF (to_jsonb(NEW) - v_mutable) IS DISTINCT FROM (to_jsonb(OLD) - v_mutable) THEN
    RAISE EXCEPTION 'quote_locked: a % quote cannot be edited; create a new version', OLD.status
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

-- Actions the customer takes in the portal are logged as actor 'customer'
ALTER TABLE activity_logs DROP CONSTRAINT IF EXISTS activity_logs_actor_type_check;
ALTER TABLE activity_logs
  ADD CONSTRAINT activity_logs_actor_type_check
  CHECK (actor_type IN ('user', 'system', 'api', 'customer'));
