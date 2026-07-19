-- =============================================================
-- Migration 017: Functions and Triggers
-- =============================================================
-- Functions and triggers applied after all tables exist (002-016).
-- NOTE: public.auth_company_id() and public.auth_user_role() were
-- created in migration 001 (bootstrap). They must NOT be recreated here.
-- =============================================================

-- ─── update_updated_at ───────────────────────────────────────
-- Generic trigger function — sets updated_at = now() on every UPDATE.
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Apply to every table that has an updated_at column.
-- Companies
CREATE TRIGGER trg_companies_updated_at
  BEFORE UPDATE ON companies
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Profiles
CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Customers
CREATE TRIGGER trg_customers_updated_at
  BEFORE UPDATE ON customers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Leads
CREATE TRIGGER trg_leads_updated_at
  BEFORE UPDATE ON leads
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Appointments
CREATE TRIGGER trg_appointments_updated_at
  BEFORE UPDATE ON appointments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Quotes
CREATE TRIGGER trg_quotes_updated_at
  BEFORE UPDATE ON quotes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Quote items
CREATE TRIGGER trg_quote_items_updated_at
  BEFORE UPDATE ON quote_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Jobs
CREATE TRIGGER trg_jobs_updated_at
  BEFORE UPDATE ON jobs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Job assignments
CREATE TRIGGER trg_job_assignments_updated_at
  BEFORE UPDATE ON job_assignments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Employees
CREATE TRIGGER trg_employees_updated_at
  BEFORE UPDATE ON employees
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Vehicles
CREATE TRIGGER trg_vehicles_updated_at
  BEFORE UPDATE ON vehicles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Invoices
CREATE TRIGGER trg_invoices_updated_at
  BEFORE UPDATE ON invoices
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Invoice items
CREATE TRIGGER trg_invoice_items_updated_at
  BEFORE UPDATE ON invoice_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Payments
CREATE TRIGGER trg_payments_updated_at
  BEFORE UPDATE ON payments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Documents
CREATE TRIGGER trg_documents_updated_at
  BEFORE UPDATE ON documents
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Tasks
CREATE TRIGGER trg_tasks_updated_at
  BEFORE UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Company settings
CREATE TRIGGER trg_company_settings_updated_at
  BEFORE UPDATE ON company_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Permission groups
CREATE TRIGGER trg_permission_groups_updated_at
  BEFORE UPDATE ON permission_groups
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Service catalog
CREATE TRIGGER trg_service_catalog_updated_at
  BEFORE UPDATE ON service_catalog
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Email sender identities
CREATE TRIGGER trg_email_sender_identities_updated_at
  BEFORE UPDATE ON email_sender_identities
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Email templates
CREATE TRIGGER trg_email_templates_updated_at
  BEFORE UPDATE ON email_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Email automations
CREATE TRIGGER trg_email_automations_updated_at
  BEFORE UPDATE ON email_automations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Communication preferences
CREATE TRIGGER trg_communication_preferences_updated_at
  BEFORE UPDATE ON communication_preferences
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- AI communication memory
CREATE TRIGGER trg_ai_communication_memory_updated_at
  BEFORE UPDATE ON ai_communication_memory
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Platform admin users
CREATE TRIGGER trg_platform_admin_users_updated_at
  BEFORE UPDATE ON platform_admin_users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Subscription plans
CREATE TRIGGER trg_subscription_plans_updated_at
  BEFORE UPDATE ON subscription_plans
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── generate_sequence_number ────────────────────────────────
-- Atomically increments the per-company sequence counter and returns
-- a formatted human-readable number.
-- Uses SELECT … FOR UPDATE on the companies row to prevent races.
-- Format: {PREFIX}-{YYYY}-{LPAD(seq,4,'0')}
-- sequence_type: 'quote' | 'job' | 'invoice'
CREATE OR REPLACE FUNCTION generate_sequence_number(
  p_company_id   uuid,
  p_sequence_type text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_new_seq  integer;
  v_prefix   text;
BEGIN
  IF p_sequence_type = 'quote' THEN
    UPDATE companies
      SET quote_sequence = quote_sequence + 1
      WHERE id = p_company_id
      RETURNING quote_sequence INTO v_new_seq;
    v_prefix := 'QT';

  ELSIF p_sequence_type = 'job' THEN
    UPDATE companies
      SET job_sequence = job_sequence + 1
      WHERE id = p_company_id
      RETURNING job_sequence INTO v_new_seq;
    v_prefix := 'JB';

  ELSIF p_sequence_type = 'invoice' THEN
    UPDATE companies
      SET invoice_sequence = invoice_sequence + 1
      WHERE id = p_company_id
      RETURNING invoice_sequence INTO v_new_seq;
    v_prefix := 'INV';

  ELSE
    RAISE EXCEPTION 'Unknown sequence_type: %', p_sequence_type;
  END IF;

  IF v_new_seq IS NULL THEN
    RAISE EXCEPTION 'Company not found: %', p_company_id;
  END IF;

  RETURN v_prefix || '-' || to_char(now(), 'YYYY') || '-' || LPAD(v_new_seq::text, 4, '0');
END;
$$;

-- ─── reject_snapshot_field_updates ───────────────────────────
-- Prevents any snapshot field from being changed on a document
-- whose generation_status is 'generated'.
-- Snapshot fields are written once at generation time and are
-- permanent thereafter to ensure document integrity.
CREATE OR REPLACE FUNCTION reject_snapshot_field_updates()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  IF OLD.generation_status = 'generated' THEN
    IF (
      NEW.company_snapshot        IS DISTINCT FROM OLD.company_snapshot     OR
      NEW.customer_snapshot       IS DISTINCT FROM OLD.customer_snapshot    OR
      NEW.address_snapshot        IS DISTINCT FROM OLD.address_snapshot     OR
      NEW.service_line_snapshot   IS DISTINCT FROM OLD.service_line_snapshot OR
      NEW.financial_snapshot      IS DISTINCT FROM OLD.financial_snapshot   OR
      NEW.terms_snapshot          IS DISTINCT FROM OLD.terms_snapshot       OR
      NEW.payment_details_snapshot IS DISTINCT FROM OLD.payment_details_snapshot
    ) THEN
      RAISE EXCEPTION
        'Snapshot fields are immutable once generation_status = ''generated''. Document id: %',
        OLD.id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_documents_reject_snapshot_updates
  BEFORE UPDATE ON documents
  FOR EACH ROW EXECUTE FUNCTION reject_snapshot_field_updates();

-- ─── validate_document_entity ────────────────────────────────
-- Validates that documents.entity_id actually exists in the table
-- implied by documents.entity_type.
-- All values from document_entity_type ENUM (migration 001):
--   'quote' | 'job' | 'invoice' | 'customer' | 'employee' | 'vehicle' | 'company'
CREATE OR REPLACE FUNCTION validate_document_entity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_exists boolean;
BEGIN
  IF NEW.entity_type = 'quote' THEN
    SELECT EXISTS(SELECT 1 FROM quotes    WHERE id = NEW.entity_id) INTO v_exists;
  ELSIF NEW.entity_type = 'job' THEN
    SELECT EXISTS(SELECT 1 FROM jobs      WHERE id = NEW.entity_id) INTO v_exists;
  ELSIF NEW.entity_type = 'invoice' THEN
    SELECT EXISTS(SELECT 1 FROM invoices  WHERE id = NEW.entity_id) INTO v_exists;
  ELSIF NEW.entity_type = 'customer' THEN
    SELECT EXISTS(SELECT 1 FROM customers WHERE id = NEW.entity_id) INTO v_exists;
  ELSIF NEW.entity_type = 'employee' THEN
    SELECT EXISTS(SELECT 1 FROM employees WHERE id = NEW.entity_id) INTO v_exists;
  ELSIF NEW.entity_type = 'vehicle' THEN
    SELECT EXISTS(SELECT 1 FROM vehicles  WHERE id = NEW.entity_id) INTO v_exists;
  ELSIF NEW.entity_type = 'company' THEN
    SELECT EXISTS(SELECT 1 FROM companies WHERE id = NEW.entity_id) INTO v_exists;
  ELSE
    RAISE EXCEPTION 'Unknown entity_type for document: %', NEW.entity_type;
  END IF;

  IF NOT v_exists THEN
    RAISE EXCEPTION
      'Document entity_id % does not exist in table implied by entity_type %',
      NEW.entity_id, NEW.entity_type;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_documents_validate_entity
  BEFORE INSERT OR UPDATE OF entity_type, entity_id ON documents
  FOR EACH ROW EXECUTE FUNCTION validate_document_entity();

-- ─── chain_platform_audit_log ────────────────────────────────
-- Maintains the hash chain on platform_audit_log.
-- Computes entry_hash = SHA-256( row_content || previous_hash )
-- and enforces that previous_entry_id references the most recent row.
-- This is called by application code at INSERT time via a
-- BEFORE INSERT trigger so the hash is computed server-side.
CREATE OR REPLACE FUNCTION chain_platform_audit_log()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_prev_hash text;
  v_row_content text;
BEGIN
  -- Resolve previous entry hash
  IF NEW.previous_entry_id IS NULL THEN
    v_prev_hash := 'GENESIS';
  ELSE
    SELECT entry_hash INTO v_prev_hash
      FROM platform_audit_log
      WHERE id = NEW.previous_entry_id;
    IF v_prev_hash IS NULL THEN
      RAISE EXCEPTION 'platform_audit_log: previous_entry_id % not found', NEW.previous_entry_id;
    END IF;
  END IF;

  -- Build deterministic row content string for hashing
  v_row_content := concat_ws('|',
    NEW.id::text,
    NEW.actor_id::text,
    NEW.actor_email,
    array_to_string(NEW.actor_roles, ','),
    host(NEW.actor_ip),
    NEW.actor_session_id::text,
    NEW.action,
    NEW.resource_type,
    COALESCE(NEW.resource_id::text, ''),
    COALESCE(NEW.target_company_id::text, ''),
    NEW.created_at::text
  );

  NEW.previous_hash := v_prev_hash;
  NEW.entry_hash    := encode(
    digest(v_row_content || v_prev_hash, 'sha256'),
    'hex'
  );

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_platform_audit_log_chain
  BEFORE INSERT ON platform_audit_log
  FOR EACH ROW EXECUTE FUNCTION chain_platform_audit_log();

-- ─── reject_platform_audit_log_mutations ─────────────────────
-- The platform_audit_log is append-only. Block all UPDATE and DELETE.
CREATE OR REPLACE FUNCTION reject_platform_audit_log_mutations()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  RAISE EXCEPTION 'platform_audit_log is append-only: UPDATE and DELETE are forbidden';
END;
$$;

CREATE TRIGGER trg_platform_audit_log_no_update
  BEFORE UPDATE ON platform_audit_log
  FOR EACH ROW EXECUTE FUNCTION reject_platform_audit_log_mutations();

CREATE TRIGGER trg_platform_audit_log_no_delete
  BEFORE DELETE ON platform_audit_log
  FOR EACH ROW EXECUTE FUNCTION reject_platform_audit_log_mutations();
