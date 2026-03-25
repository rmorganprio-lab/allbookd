-- ============================================================
-- Migration: audit_controls_schema
-- 2026-03-25
--
-- Covers:
--   1. Per-org sequential numbering (invoices, quotes, credit notes)
--   2. Soft delete / void infrastructure (invoices, quotes, payments)
--   3. Credit notes table
--   4. Tax fields (invoices, organisations, credit notes)
--   5. Date locking preparation (invoices.sent_at)
--   6. Lock down hard deletes on financial records
--
-- NOTE: payments.invoice_id already exists (migration 20260316211928).
--       No action taken for that requirement.
-- ============================================================


-- ============================================================
-- SECTION 1: ORG SEQUENCES TABLE
--
-- A single table tracks per-org counters for each document type.
-- Using INSERT ... ON CONFLICT DO UPDATE with RETURNING makes the
-- increment atomic — no race conditions, no reused numbers.
-- ============================================================

CREATE TABLE IF NOT EXISTS org_sequences (
  org_id        uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  sequence_name text NOT NULL,
  current_value integer NOT NULL DEFAULT 0,
  PRIMARY KEY (org_id, sequence_name)
);

ALTER TABLE org_sequences ENABLE ROW LEVEL SECURITY;

-- Org members can read their own sequences (needed for display)
CREATE POLICY "org_sequences_select" ON org_sequences
  FOR SELECT USING (org_id = user_org_id());

-- Only the trigger functions (SECURITY DEFINER) write to this table,
-- so no INSERT/UPDATE policies are needed for normal users.

-- Platform admins can see all sequences
CREATE POLICY "org_sequences_platform_admin" ON org_sequences
  FOR ALL USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND is_platform_admin = true)
  );


-- ============================================================
-- SECTION 2: SEQUENTIAL NUMBERING — INVOICES
--
-- invoice_seq: the raw integer (1, 2, 3 …) per org, never reused.
-- invoice_number (text, already exists): reformatted by trigger to
--   INV-0001, INV-0002, etc.
-- ============================================================

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS invoice_seq integer;

-- Trigger function: fires BEFORE INSERT, assigns the next number
CREATE OR REPLACE FUNCTION fn_set_invoice_number()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  next_val integer;
BEGIN
  -- Atomically upsert the counter and return the new value
  INSERT INTO org_sequences (org_id, sequence_name, current_value)
    VALUES (NEW.org_id, 'invoice', 1)
    ON CONFLICT (org_id, sequence_name)
    DO UPDATE SET current_value = org_sequences.current_value + 1
    RETURNING current_value INTO next_val;

  NEW.invoice_seq    := next_val;
  NEW.invoice_number := 'INV-' || LPAD(next_val::text, 4, '0');
  RETURN NEW;
END;
$$;

-- Only fires when invoice_seq is not already set (allows manual seeding)
CREATE TRIGGER trg_set_invoice_number
  BEFORE INSERT ON invoices
  FOR EACH ROW
  WHEN (NEW.invoice_seq IS NULL)
  EXECUTE FUNCTION fn_set_invoice_number();

-- Backfill invoice_seq for any existing rows (assigns 1, 2, 3 … per org by created_at)
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (PARTITION BY org_id ORDER BY created_at) AS rn
  FROM invoices
  WHERE invoice_seq IS NULL
)
UPDATE invoices
SET invoice_seq    = ranked.rn,
    invoice_number = 'INV-' || LPAD(ranked.rn::text, 4, '0')
FROM ranked
WHERE invoices.id = ranked.id;

-- Seed the sequences table to match backfilled data so the next auto-number is correct
INSERT INTO org_sequences (org_id, sequence_name, current_value)
SELECT org_id, 'invoice', COUNT(*)
FROM invoices
GROUP BY org_id
ON CONFLICT (org_id, sequence_name) DO UPDATE
  SET current_value = EXCLUDED.current_value;


-- ============================================================
-- SECTION 3: SEQUENTIAL NUMBERING — QUOTES
--
-- quote_seq: raw integer per org.
-- quote_number (text, already exists): reformatted to QT-0001.
-- ============================================================

ALTER TABLE quotes
  ADD COLUMN IF NOT EXISTS quote_seq integer;

CREATE OR REPLACE FUNCTION fn_set_quote_number()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  next_val integer;
BEGIN
  INSERT INTO org_sequences (org_id, sequence_name, current_value)
    VALUES (NEW.org_id, 'quote', 1)
    ON CONFLICT (org_id, sequence_name)
    DO UPDATE SET current_value = org_sequences.current_value + 1
    RETURNING current_value INTO next_val;

  NEW.quote_seq    := next_val;
  NEW.quote_number := 'QT-' || LPAD(next_val::text, 4, '0');
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_set_quote_number
  BEFORE INSERT ON quotes
  FOR EACH ROW
  WHEN (NEW.quote_seq IS NULL)
  EXECUTE FUNCTION fn_set_quote_number();

-- Backfill existing quotes
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (PARTITION BY org_id ORDER BY created_at) AS rn
  FROM quotes
  WHERE quote_seq IS NULL
)
UPDATE quotes
SET quote_seq    = ranked.rn,
    quote_number = 'QT-' || LPAD(ranked.rn::text, 4, '0')
FROM ranked
WHERE quotes.id = ranked.id;

-- Seed sequences
INSERT INTO org_sequences (org_id, sequence_name, current_value)
SELECT org_id, 'quote', COUNT(*)
FROM quotes
GROUP BY org_id
ON CONFLICT (org_id, sequence_name) DO UPDATE
  SET current_value = EXCLUDED.current_value;


-- ============================================================
-- SECTION 4: CREDIT NOTES TABLE
--
-- Records partial or full credits against a posted invoice.
-- Has its own per-org sequential numbering in CN-0001 format.
-- Intentionally has no DELETE RLS policy — credit notes are
-- permanent financial records.
-- ============================================================

CREATE TABLE credit_notes (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              uuid        NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  invoice_id          uuid        NOT NULL REFERENCES invoices(id) ON DELETE RESTRICT,
  credit_note_number  text        NOT NULL,
  credit_note_seq     integer,
  amount              numeric     NOT NULL DEFAULT 0,
  tax_rate            numeric,
  tax_amount          numeric     NOT NULL DEFAULT 0,
  total               numeric     NOT NULL DEFAULT 0,
  reason              text        NOT NULL,  -- required — must explain why credit was issued
  status              text        NOT NULL DEFAULT 'draft'
                                    CHECK (status IN ('draft', 'sent', 'applied')),
  created_by          uuid        REFERENCES users(id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- Trigger to keep updated_at current
CREATE OR REPLACE FUNCTION fn_update_credit_notes_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_credit_notes_updated_at
  BEFORE UPDATE ON credit_notes
  FOR EACH ROW EXECUTE FUNCTION fn_update_credit_notes_updated_at();

-- Sequential numbering for credit notes
CREATE OR REPLACE FUNCTION fn_set_credit_note_number()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  next_val integer;
BEGIN
  INSERT INTO org_sequences (org_id, sequence_name, current_value)
    VALUES (NEW.org_id, 'credit_note', 1)
    ON CONFLICT (org_id, sequence_name)
    DO UPDATE SET current_value = org_sequences.current_value + 1
    RETURNING current_value INTO next_val;

  NEW.credit_note_seq    := next_val;
  NEW.credit_note_number := 'CN-' || LPAD(next_val::text, 4, '0');
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_set_credit_note_number
  BEFORE INSERT ON credit_notes
  FOR EACH ROW
  EXECUTE FUNCTION fn_set_credit_note_number();

-- RLS: mirrors the invoices pattern — scoped by org_id
ALTER TABLE credit_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "credit_notes_select" ON credit_notes
  FOR SELECT USING (org_id = user_org_id());

CREATE POLICY "credit_notes_insert" ON credit_notes
  FOR INSERT WITH CHECK (org_id = user_org_id());

CREATE POLICY "credit_notes_update" ON credit_notes
  FOR UPDATE USING (org_id = user_org_id())
  WITH CHECK (org_id = user_org_id());

-- No DELETE policy — credit notes cannot be hard-deleted.

CREATE POLICY "credit_notes_platform_admin" ON credit_notes
  FOR ALL USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND is_platform_admin = true)
  );


-- ============================================================
-- SECTION 5: VOID INFRASTRUCTURE — INVOICES
--
-- voided_at:   timestamp when the invoice was voided (null = active)
-- voided_by:   user who voided it
-- void_reason: required explanation recorded at void time
--
-- 'voided' is also added to the status CHECK constraint so the
-- app can set status = 'voided' alongside voided_at.
-- ============================================================

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS voided_at   timestamptz,
  ADD COLUMN IF NOT EXISTS voided_by   uuid REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS void_reason text;

-- Extend status to allow 'voided'
-- The constraint name 'invoices_status_check' is the Postgres default
-- for a CHECK defined inline on the column; adjust if yours differs.
ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_status_check;
ALTER TABLE invoices
  ADD CONSTRAINT invoices_status_check
  CHECK (status IN ('draft', 'sent', 'paid', 'overdue', 'voided'));


-- ============================================================
-- SECTION 6: VOID INFRASTRUCTURE — QUOTES
--
-- Same three columns as invoices. 'voided' added to status.
-- ============================================================

ALTER TABLE quotes
  ADD COLUMN IF NOT EXISTS voided_at   timestamptz,
  ADD COLUMN IF NOT EXISTS voided_by   uuid REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS void_reason text;

ALTER TABLE quotes DROP CONSTRAINT IF EXISTS quotes_status_check;
ALTER TABLE quotes
  ADD CONSTRAINT quotes_status_check
  CHECK (status IN ('draft', 'sent', 'approved', 'declined', 'expired', 'voided'));


-- ============================================================
-- SECTION 7: PAYMENT REVERSAL INFRASTRUCTURE
--
-- reversed_at:         when the reversal was recorded
-- reversed_by:         user who recorded it
-- reversal_reason:     required explanation
-- reversal_payment_id: points to the new offsetting payment entry
--                      (self-referencing FK on payments)
-- ============================================================

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS reversed_at          timestamptz,
  ADD COLUMN IF NOT EXISTS reversed_by          uuid REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reversal_reason      text,
  ADD COLUMN IF NOT EXISTS reversal_payment_id  uuid REFERENCES payments(id) ON DELETE SET NULL;


-- ============================================================
-- SECTION 8: LOCK DOWN HARD DELETES ON FINANCIAL RECORDS
--
-- Financial records (invoices, quotes, payments) must never be
-- hard-deleted. We void/reverse them instead.
--
-- Drop all known DELETE policies on these tables. No new DELETE
-- policies are created — this makes hard-delete impossible via
-- the client, even for platform admins via RLS.
--
-- If your existing policy names differ, add DROP statements here.
-- ============================================================

-- All three tables have discrete per-command policies (no broad ALL policies),
-- so dropping these only removes DELETE — SELECT/INSERT/UPDATE are unaffected.

DROP POLICY IF EXISTS "Owners can delete invoices"   ON invoices;
DROP POLICY IF EXISTS "Owners can delete payments"   ON payments;
DROP POLICY IF EXISTS "Managers can delete quotes"   ON quotes;


-- ============================================================
-- SECTION 9: PAYMENT-TO-INVOICE LINKING
--
-- payments.invoice_id was already added in migration
-- 20260316211928 (type: uuid, nullable, FK to invoices).
-- No action required here.
-- ============================================================


-- ============================================================
-- SECTION 10: TAX FIELDS — INVOICES
--
-- tax_rate: the rate applied when this invoice was generated.
-- (tax_amount already exists on invoices — no change needed.)
-- ============================================================

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS tax_rate numeric;


-- ============================================================
-- SECTION 11: TAX FIELDS — ORGANISATIONS
--
-- default_tax_rate: org-level default copied to new invoices/quotes.
-- tax_label:        display name for the tax line (GST, VAT, Sales Tax …).
-- vat_number:       registration number shown on invoices for orgs
--                   that operate under a VAT/GST regime.
-- ============================================================

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS default_tax_rate numeric,
  ADD COLUMN IF NOT EXISTS tax_label        text NOT NULL DEFAULT 'Tax',
  ADD COLUMN IF NOT EXISTS vat_number       text;


-- ============================================================
-- SECTION 12: DATE LOCKING PREPARATION — INVOICES
--
-- sent_at: timestamp recorded when the invoice is first delivered
-- to the client. The UI should lock issue_date once this is set
-- (prevents backdating after the client has seen the invoice).
-- ============================================================

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS sent_at timestamptz;


-- ============================================================
-- SECTION 13: INDEXES
-- ============================================================

-- Fast lookup of invoices/quotes by org + sequence number
CREATE INDEX IF NOT EXISTS idx_invoices_org_seq
  ON invoices (org_id, invoice_seq);

CREATE INDEX IF NOT EXISTS idx_quotes_org_seq
  ON quotes (org_id, quote_seq);

-- Credit notes lookup
CREATE INDEX IF NOT EXISTS idx_credit_notes_org_id
  ON credit_notes (org_id);

CREATE INDEX IF NOT EXISTS idx_credit_notes_invoice_id
  ON credit_notes (invoice_id);

-- Partial indexes for voided/reversed records (sparse — most rows are null)
CREATE INDEX IF NOT EXISTS idx_invoices_voided
  ON invoices (org_id, voided_at) WHERE voided_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_payments_reversed
  ON payments (org_id, reversed_at) WHERE reversed_at IS NOT NULL;
