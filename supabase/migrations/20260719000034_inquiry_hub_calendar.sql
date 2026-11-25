-- =============================================================
-- Migration 034: Inquiry hub and calendar (Bixin structure)
-- =============================================================
-- The inquiry (lead) becomes the centre of a move, as in Bixin:
-- contact, move, quotes, questionnaire, inventory, wished services,
-- media, private notes and the home visit — all on one page.
--
--   1. leads: rooms, questionnaire (access per address), inventory,
--      wished services
--   2. attachments: files for inquiries, customers, quotes, jobs
--      (private bucket 'attachments')
--   3. appointments: own events with a title (no parent needed),
--      type 'other', confirmation can be withdrawn
-- =============================================================

-- =============================================================
-- 1. Inquiry details
-- =============================================================

ALTER TABLE leads
  ADD COLUMN rooms            numeric(3,1) CHECK (rooms IS NULL OR (rooms > 0 AND rooms <= 30)),
  ADD COLUMN questionnaire    jsonb        NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN inventory        jsonb        NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN wished_services  jsonb        NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE leads ADD CONSTRAINT leads_questionnaire_object CHECK (jsonb_typeof(questionnaire) = 'object');
ALTER TABLE leads ADD CONSTRAINT leads_inventory_array CHECK (jsonb_typeof(inventory) = 'array');
ALTER TABLE leads ADD CONSTRAINT leads_wished_services_array CHECK (jsonb_typeof(wished_services) = 'array');

COMMENT ON COLUMN leads.questionnaire IS
  'Access per address: {origin|dest: {dwelling, liftSize, parkingDistanceM, outsideSteps, comment}, boxes}. Validated by the API (modules/leads).';
COMMENT ON COLUMN leads.inventory IS 'Rows {room, item, quantity, note}.';
COMMENT ON COLUMN leads.wished_services IS 'Services the customer asked for: {serviceId, name, quantity}.';

ALTER TABLE leads ALTER COLUMN origin_country SET DEFAULT 'CH';
ALTER TABLE leads ALTER COLUMN dest_country   SET DEFAULT 'CH';

-- =============================================================
-- 2. Attachments
-- =============================================================

CREATE TABLE attachments (
  id            uuid          PRIMARY KEY DEFAULT gen_uuid_v7(),
  company_id    uuid          NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  entity_type   text          NOT NULL CHECK (entity_type IN ('lead', 'customer', 'quote', 'job')),
  entity_id     uuid          NOT NULL,
  file_name     text          NOT NULL CHECK (length(file_name) BETWEEN 1 AND 255),
  storage_path  text          NOT NULL UNIQUE,
  mime_type     text          NOT NULL,
  size_bytes    integer       NOT NULL CHECK (size_bytes > 0),
  uploaded_by   uuid          REFERENCES profiles(id) ON DELETE SET NULL,
  deleted_at    timestamptz,
  created_at    timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX idx_attachments_entity ON attachments(company_id, entity_type, entity_id) WHERE deleted_at IS NULL;

ALTER TABLE attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "attachments_select" ON attachments
  FOR SELECT USING (company_id = public.auth_company_id());
CREATE POLICY "attachments_insert" ON attachments
  FOR INSERT WITH CHECK (company_id = public.auth_company_id());
CREATE POLICY "attachments_update" ON attachments
  FOR UPDATE USING (company_id = public.auth_company_id());

GRANT SELECT, INSERT, UPDATE ON attachments TO authenticated;
GRANT ALL ON attachments TO service_role;

-- Files are read and written by the server with the service role after its
-- own access check; users get short-lived signed URLs.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('attachments', 'attachments', false, 26214400,
        ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf', 'video/mp4', 'video/quicktime'])
ON CONFLICT (id) DO NOTHING;

-- =============================================================
-- 3. Calendar events
-- =============================================================

ALTER TYPE appointment_type ADD VALUE IF NOT EXISTS 'other';

ALTER TABLE appointments
  ADD COLUMN title text CHECK (title IS NULL OR length(title) <= 200);

-- Own events ("Personalisierter Termin") need no inquiry, customer or job
ALTER TABLE appointments DROP CONSTRAINT appointments_at_least_one_parent;

COMMENT ON COLUMN appointments.title IS 'Shown in the calendar; e.g. "Hausbesuch Muster".';

-- Confirmation can be withdrawn ("Bestätigung aufheben")
INSERT INTO workflow_transitions (entity_type, from_status, to_status, system_only, reason_column, stamp_column)
VALUES ('appointment', 'confirmed', 'scheduled', false, NULL, NULL)
ON CONFLICT DO NOTHING;
