-- =============================================================
-- Migration 014: Analytics — metric_snapshots
-- =============================================================
-- Company-level daily aggregated business metrics.
-- Populated by /api/cron/analytics (Vercel Cron, runs daily at 06:00).
-- Depends on: 002 (companies)
-- =============================================================

CREATE TABLE metric_snapshots (
  id              uuid          PRIMARY KEY DEFAULT gen_uuid_v7(),
  company_id      uuid          NOT NULL REFERENCES companies(id) ON DELETE CASCADE,

  snapshot_date   date          NOT NULL,
  metric_key      text          NOT NULL,
  -- 'leads_received'    | 'quotes_created'       | 'quotes_sent'
  -- 'jobs_scheduled'    | 'jobs_completed'       | 'jobs_cancelled'
  -- 'invoices_issued'   | 'payments_received'    | 'revenue_cents'
  -- 'emails_sent'       | 'emails_opened'        | 'email_open_rate'
  -- 'ai_cost_millicents'| 'ai_tokens_used'       | 'ai_requests'
  -- 'active_customers'  | 'new_customers'
  metric_value    numeric       NOT NULL,

  -- Append-only
  created_at      timestamptz   NOT NULL DEFAULT now()
);

-- One value per (company, date, metric) — the cron job overwrites via DELETE + INSERT
CREATE UNIQUE INDEX idx_metric_snapshots_unique
  ON metric_snapshots(company_id, snapshot_date, metric_key);

-- Used by dashboard to fetch recent history for a given metric
CREATE INDEX idx_metric_snapshots_date
  ON metric_snapshots(company_id, snapshot_date DESC, metric_key);
