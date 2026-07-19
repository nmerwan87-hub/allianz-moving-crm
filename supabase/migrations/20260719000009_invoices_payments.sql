-- =============================================================
-- Migration 009: Invoices & Payments — invoices, invoice_items, payments
-- =============================================================
-- Depends on: 002 (companies, profiles), 003 (customers),
--             007 (quote_items), 008 (jobs)
-- =============================================================

-- ─── invoices ────────────────────────────────────────────────
CREATE TABLE invoices (
  id                          uuid            PRIMARY KEY DEFAULT gen_uuid_v7(),
  company_id                  uuid            NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  job_id                      uuid            NOT NULL REFERENCES jobs(id) ON DELETE RESTRICT,
  customer_id                 uuid            NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  created_by                  uuid            REFERENCES profiles(id) ON DELETE SET NULL,

  -- Human-readable identifier (INV-2026-001)
  invoice_number              text            NOT NULL,

  -- Lifecycle
  status                      invoice_status  NOT NULL DEFAULT 'draft',

  -- Amounts (all in cents)
  subtotal_cents              integer         NOT NULL DEFAULT 0 CHECK (subtotal_cents >= 0),
  discount_cents              integer         NOT NULL DEFAULT 0 CHECK (discount_cents >= 0),
  tax_cents                   integer         NOT NULL DEFAULT 0 CHECK (tax_cents >= 0),
  total_amount_cents          integer         NOT NULL DEFAULT 0 CHECK (total_amount_cents >= 0),
  deposit_applied_cents       integer         NOT NULL DEFAULT 0 CHECK (deposit_applied_cents >= 0),
  amount_paid_cents           integer         NOT NULL DEFAULT 0 CHECK (amount_paid_cents >= 0),

  -- Derived: balance_due = total - deposit_applied - amount_paid
  balance_due_cents           integer GENERATED ALWAYS AS
                                (total_amount_cents - deposit_applied_cents - amount_paid_cents)
                                STORED,

  -- Dates
  issued_at                   timestamptz,
  due_at                      timestamptz,
  paid_at                     timestamptz,

  -- Communication tracking
  sent_at                     timestamptz,
  viewed_at                   timestamptz,
  view_count                  integer         NOT NULL DEFAULT 0,

  -- Stripe (for online payment)
  stripe_payment_intent_id    text,
  stripe_invoice_id           text,

  -- Customer portal
  portal_token                text,
  portal_token_expires_at     timestamptz,

  -- Notes
  notes                       text,
  internal_notes              text,

  -- Soft delete
  deleted_at                  timestamptz,

  -- Timestamps
  created_at                  timestamptz     NOT NULL DEFAULT now(),
  updated_at                  timestamptz     NOT NULL DEFAULT now()
);

-- Unique invoice number per company
CREATE UNIQUE INDEX idx_invoices_number
  ON invoices(company_id, invoice_number);

-- Unique portal token (partial: only non-null tokens)
CREATE UNIQUE INDEX idx_invoices_portal_token
  ON invoices(portal_token)
  WHERE portal_token IS NOT NULL;

-- ─── invoice_items ───────────────────────────────────────────
-- Line items on an invoice. Cascade-deleted with their invoice.
CREATE TABLE invoice_items (
  id                  uuid            PRIMARY KEY DEFAULT gen_uuid_v7(),
  company_id          uuid            NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  invoice_id          uuid            NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  quote_item_id       uuid            REFERENCES quote_items(id) ON DELETE SET NULL,

  -- Item definition (copied from quote, editable)
  item_type           line_item_type  NOT NULL,
  name                text            NOT NULL,
  description         text,
  quantity            numeric(8,2)    NOT NULL DEFAULT 1 CHECK (quantity != 0),
  unit                text,
  unit_price_cents    integer         NOT NULL,
  total_price_cents   integer         NOT NULL,

  -- Display
  sort_order          integer         NOT NULL DEFAULT 0,

  -- Timestamps
  created_at          timestamptz     NOT NULL DEFAULT now(),
  updated_at          timestamptz     NOT NULL DEFAULT now()
);

-- ─── payments ────────────────────────────────────────────────
CREATE TABLE payments (
  id                          uuid            PRIMARY KEY DEFAULT gen_uuid_v7(),
  company_id                  uuid            NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  job_id                      uuid            NOT NULL REFERENCES jobs(id) ON DELETE RESTRICT,
  invoice_id                  uuid            REFERENCES invoices(id) ON DELETE SET NULL,
  customer_id                 uuid            NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  recorded_by                 uuid            REFERENCES profiles(id) ON DELETE SET NULL,
  -- recorded_by = NULL means online payment (processed automatically)

  -- Classification
  payment_type                payment_type    NOT NULL,
  method                      payment_method  NOT NULL,
  status                      payment_status  NOT NULL DEFAULT 'pending',

  -- Amount (positive = received, negative = refund)
  amount_cents                integer         NOT NULL CHECK (amount_cents != 0),
  currency                    text            NOT NULL DEFAULT 'USD',

  -- Manual payment reference
  reference_number            text,
  notes                       text,

  -- Stripe fields (populated for online payments)
  stripe_payment_intent_id    text,
  stripe_charge_id            text,
  stripe_refund_id            text,

  -- Timing
  paid_at                     timestamptz,

  -- Soft delete (rare — prefer adjustment entries for corrections)
  deleted_at                  timestamptz,

  -- Timestamps
  created_at                  timestamptz     NOT NULL DEFAULT now(),
  updated_at                  timestamptz     NOT NULL DEFAULT now()
);

-- Stripe idempotency (partial: only non-null payment intents)
CREATE UNIQUE INDEX idx_payments_stripe_intent
  ON payments(stripe_payment_intent_id)
  WHERE stripe_payment_intent_id IS NOT NULL;
