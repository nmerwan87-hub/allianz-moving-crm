-- =============================================================
-- Migration 016: Performance Indexes
-- =============================================================
-- Non-unique performance indexes only.
-- Unique indexes (+ the partial unique idx on profiles.email)
-- were created inline in their respective table migrations (002-015).
-- Must run after all tables exist (migrations 002-015).
-- Source: DATABASE_ARCHITECTURE.md §10
-- =============================================================

-- ─── profiles ────────────────────────────────────────────────
-- idx_profiles_email_per_company already created in migration 002
CREATE INDEX idx_profiles_company_id ON profiles(company_id);

-- ─── customers ───────────────────────────────────────────────
CREATE INDEX idx_customers_company_id  ON customers(company_id);
CREATE INDEX idx_customers_email       ON customers(company_id, email) WHERE deleted_at IS NULL;
CREATE INDEX idx_customers_phone       ON customers(company_id, phone) WHERE deleted_at IS NULL;
CREATE INDEX idx_customers_created_at  ON customers(company_id, created_at DESC);

-- ─── leads ───────────────────────────────────────────────────
CREATE INDEX idx_leads_company_id     ON leads(company_id);
CREATE INDEX idx_leads_status         ON leads(company_id, status) WHERE deleted_at IS NULL;
CREATE INDEX idx_leads_assigned_to    ON leads(company_id, assigned_to) WHERE deleted_at IS NULL;
CREATE INDEX idx_leads_customer_id    ON leads(customer_id) WHERE customer_id IS NOT NULL;
CREATE INDEX idx_leads_requested_date ON leads(company_id, requested_date) WHERE deleted_at IS NULL;
CREATE INDEX idx_leads_created_at     ON leads(company_id, created_at DESC);
CREATE INDEX idx_leads_ai_score       ON leads(company_id, ai_score DESC NULLS LAST) WHERE deleted_at IS NULL;

-- ─── appointments ────────────────────────────────────────────
CREATE INDEX idx_appointments_company_id   ON appointments(company_id);
CREATE INDEX idx_appointments_lead_id      ON appointments(lead_id) WHERE lead_id IS NOT NULL;
CREATE INDEX idx_appointments_job_id       ON appointments(job_id) WHERE job_id IS NOT NULL;
CREATE INDEX idx_appointments_assigned_to  ON appointments(company_id, assigned_to, scheduled_at);
CREATE INDEX idx_appointments_scheduled_at ON appointments(company_id, scheduled_at) WHERE deleted_at IS NULL;

-- ─── quotes ──────────────────────────────────────────────────
-- idx_quotes_portal_token and idx_quotes_number already created in migration 007
CREATE INDEX idx_quotes_company_id     ON quotes(company_id);
CREATE INDEX idx_quotes_lead_id        ON quotes(lead_id) WHERE lead_id IS NOT NULL;
CREATE INDEX idx_quotes_customer_id    ON quotes(customer_id) WHERE customer_id IS NOT NULL;
CREATE INDEX idx_quotes_status         ON quotes(company_id, status) WHERE deleted_at IS NULL;
CREATE INDEX idx_quotes_created_at     ON quotes(company_id, created_at DESC);
CREATE INDEX idx_quotes_scheduled_date ON quotes(company_id, scheduled_date) WHERE deleted_at IS NULL;

-- ─── quote_items ─────────────────────────────────────────────
CREATE INDEX idx_quote_items_quote_id   ON quote_items(quote_id);
CREATE INDEX idx_quote_items_company_id ON quote_items(company_id);

-- ─── quote_versions ──────────────────────────────────────────
-- idx_quote_versions_number already created in migration 007
CREATE INDEX idx_quote_versions_quote_id ON quote_versions(quote_id);

-- ─── jobs ────────────────────────────────────────────────────
-- idx_jobs_number already created in migration 008
CREATE INDEX idx_jobs_company_id     ON jobs(company_id);
CREATE INDEX idx_jobs_customer_id    ON jobs(customer_id);
CREATE INDEX idx_jobs_quote_id       ON jobs(quote_id) WHERE quote_id IS NOT NULL;
CREATE INDEX idx_jobs_status         ON jobs(company_id, status) WHERE deleted_at IS NULL;
CREATE INDEX idx_jobs_scheduled_date ON jobs(company_id, scheduled_date) WHERE deleted_at IS NULL;
CREATE INDEX idx_jobs_created_at     ON jobs(company_id, created_at DESC);

-- ─── job_assignments ─────────────────────────────────────────
-- idx_job_assignments_unique and idx_job_assignments_one_lead created in migration 008
CREATE INDEX idx_job_assignments_job_id      ON job_assignments(job_id);
CREATE INDEX idx_job_assignments_employee_id ON job_assignments(employee_id);
CREATE INDEX idx_job_assignments_company_id  ON job_assignments(company_id);

-- ─── employees ───────────────────────────────────────────────
CREATE INDEX idx_employees_company_id ON employees(company_id);
CREATE INDEX idx_employees_status     ON employees(company_id, status) WHERE deleted_at IS NULL;

-- ─── vehicles ────────────────────────────────────────────────
CREATE INDEX idx_vehicles_company_id ON vehicles(company_id);
CREATE INDEX idx_vehicles_status     ON vehicles(company_id, status) WHERE deleted_at IS NULL;

-- ─── invoices ────────────────────────────────────────────────
-- idx_invoices_number and idx_invoices_portal_token created in migration 009
CREATE INDEX idx_invoices_company_id  ON invoices(company_id);
CREATE INDEX idx_invoices_job_id      ON invoices(job_id);
CREATE INDEX idx_invoices_customer_id ON invoices(customer_id);
CREATE INDEX idx_invoices_status      ON invoices(company_id, status) WHERE deleted_at IS NULL;
CREATE INDEX idx_invoices_due_at      ON invoices(company_id, due_at) WHERE deleted_at IS NULL;

-- ─── invoice_items ───────────────────────────────────────────
CREATE INDEX idx_invoice_items_invoice_id ON invoice_items(invoice_id);

-- ─── payments ────────────────────────────────────────────────
-- idx_payments_stripe_intent already created in migration 009
CREATE INDEX idx_payments_company_id  ON payments(company_id);
CREATE INDEX idx_payments_job_id      ON payments(job_id);
CREATE INDEX idx_payments_invoice_id  ON payments(invoice_id) WHERE invoice_id IS NOT NULL;
CREATE INDEX idx_payments_customer_id ON payments(customer_id);
CREATE INDEX idx_payments_paid_at     ON payments(company_id, paid_at DESC) WHERE paid_at IS NOT NULL;

-- ─── documents ───────────────────────────────────────────────
-- idx_doc_templates_current and idx_doc_templates_version created in migration 010
CREATE INDEX idx_documents_company_id        ON documents(company_id);
CREATE INDEX idx_documents_entity            ON documents(entity_type, entity_id);
CREATE INDEX idx_documents_type_current      ON documents(company_id, document_type, entity_id)
  WHERE deleted_at IS NULL AND generation_status = 'generated';
CREATE INDEX idx_documents_type_status       ON documents(company_id, document_type, generation_status);
CREATE INDEX idx_documents_customer_visible  ON documents(entity_id, is_customer_visible)
  WHERE is_customer_visible = true AND deleted_at IS NULL;
CREATE INDEX idx_documents_supersedes        ON documents(supersedes_id) WHERE supersedes_id IS NOT NULL;
CREATE INDEX idx_doc_templates_type          ON document_templates(document_type, language);

-- ─── tasks ───────────────────────────────────────────────────
CREATE INDEX idx_tasks_company_id  ON tasks(company_id);
CREATE INDEX idx_tasks_assigned_to ON tasks(company_id, assigned_to, status) WHERE deleted_at IS NULL;
CREATE INDEX idx_tasks_entity      ON tasks(entity_type, entity_id) WHERE entity_id IS NOT NULL;
CREATE INDEX idx_tasks_due_at      ON tasks(company_id, due_at)
  WHERE deleted_at IS NULL AND status != 'completed';

-- ─── notifications ───────────────────────────────────────────
CREATE INDEX idx_notifications_user_unread ON notifications(user_id, created_at DESC) WHERE read_at IS NULL;
CREATE INDEX idx_notifications_company_id  ON notifications(company_id);

-- ─── email_logs ──────────────────────────────────────────────
CREATE INDEX idx_email_logs_company_id ON email_logs(company_id);
CREATE INDEX idx_email_logs_entity     ON email_logs(entity_type, entity_id) WHERE entity_id IS NOT NULL;
CREATE INDEX idx_email_logs_resend_id  ON email_logs(resend_id) WHERE resend_id IS NOT NULL;
CREATE INDEX idx_email_logs_created_at ON email_logs(company_id, created_at DESC);

-- ─── ai_logs ─────────────────────────────────────────────────
CREATE INDEX idx_ai_logs_company_id ON ai_logs(company_id);
CREATE INDEX idx_ai_logs_entity     ON ai_logs(entity_type, entity_id) WHERE entity_id IS NOT NULL;
CREATE INDEX idx_ai_logs_task_type  ON ai_logs(company_id, task_type);
CREATE INDEX idx_ai_logs_created_at ON ai_logs(company_id, created_at DESC);

-- ─── activity_logs ───────────────────────────────────────────
CREATE INDEX idx_activity_logs_company_id ON activity_logs(company_id);
CREATE INDEX idx_activity_logs_entity     ON activity_logs(entity_type, entity_id);
CREATE INDEX idx_activity_logs_actor_id   ON activity_logs(actor_id) WHERE actor_id IS NOT NULL;
CREATE INDEX idx_activity_logs_created_at ON activity_logs(company_id, created_at DESC);

-- ─── domain_events ───────────────────────────────────────────
CREATE INDEX idx_domain_events_company_id  ON domain_events(company_id);
CREATE INDEX idx_domain_events_unprocessed ON domain_events(company_id, created_at) WHERE processed_at IS NULL;
CREATE INDEX idx_domain_events_aggregate   ON domain_events(aggregate_type, aggregate_id);
CREATE INDEX idx_domain_events_event_type  ON domain_events(event_type);

-- ─── permission_groups ───────────────────────────────────────
CREATE INDEX idx_permission_groups_company_id ON permission_groups(company_id) WHERE deleted_at IS NULL;

-- ─── permission_group_assignments ────────────────────────────
CREATE INDEX idx_pga_group_id   ON permission_group_assignments(group_id);
CREATE INDEX idx_pga_company_id ON permission_group_assignments(company_id);

-- ─── user_permission_groups ──────────────────────────────────
CREATE INDEX idx_upg_user_id    ON user_permission_groups(user_id);
CREATE INDEX idx_upg_company_id ON user_permission_groups(company_id);

-- ─── user_permission_overrides ───────────────────────────────
CREATE INDEX idx_upo_user_id    ON user_permission_overrides(user_id);
CREATE INDEX idx_upo_company_id ON user_permission_overrides(company_id);

-- ─── service_catalog ─────────────────────────────────────────
CREATE INDEX idx_service_catalog_company_id ON service_catalog(company_id, is_active) WHERE deleted_at IS NULL;
CREATE INDEX idx_service_catalog_category   ON service_catalog(company_id, category) WHERE is_active = true AND deleted_at IS NULL;

-- ─── ai_quote_recommendations ────────────────────────────────
CREATE INDEX idx_ai_quote_recs_quote_id   ON ai_quote_recommendations(quote_id);
CREATE INDEX idx_ai_quote_recs_company_id ON ai_quote_recommendations(company_id);

-- ─── user_invitations ────────────────────────────────────────
-- token_hash has table-level UNIQUE constraint (created in migration 006).
-- This partial index accelerates the pending-invite lookup path.
-- idx_invitations_token_hash ON user_invitations(token_hash) WHERE status = 'pending'
-- is semantically covered by the table UNIQUE; keeping a non-unique performance index:
CREATE INDEX idx_invitations_company    ON user_invitations(company_id, status);
CREATE INDEX idx_invitations_email_pending ON user_invitations(email) WHERE status = 'pending';
CREATE INDEX idx_invitations_expires_at ON user_invitations(expires_at) WHERE status = 'pending';
