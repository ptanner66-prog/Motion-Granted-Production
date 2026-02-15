-- ============================================
-- MOTION GRANTED: Orders Table — State Columns + Backfill
-- Migration: 20260215100003_orders_state_columns_and_backfill.sql
-- SP-C Tasks 4, 4-FIX | BD-21: Backfill ALL orders in single UPDATE
-- ============================================

-- Add new jurisdiction columns to orders
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS state CHAR(2) REFERENCES states(code),
  ADD COLUMN IF NOT EXISTS court_type TEXT CHECK (court_type IN ('STATE', 'FEDERAL')),
  ADD COLUMN IF NOT EXISTS federal_district TEXT,
  ADD COLUMN IF NOT EXISTS pricing_multiplier_applied NUMERIC(4,2);

-- Column comments
COMMENT ON COLUMN orders.state IS 'Two-letter state code. FK to states.code. Added for 50-state expansion.';
COMMENT ON COLUMN orders.court_type IS 'STATE or FEDERAL. Determines formatting and motion availability.';
COMMENT ON COLUMN orders.federal_district IS 'Federal district court name (e.g. C.D. Cal.). NULL for state court orders.';
COMMENT ON COLUMN orders.pricing_multiplier_applied IS 'Pricing multiplier from states table at time of checkout. Immutable after payment.';

-- Indexes for state-based queries
CREATE INDEX IF NOT EXISTS idx_orders_state ON orders(state);
CREATE INDEX IF NOT EXISTS idx_orders_court_type ON orders(court_type);
CREATE INDEX IF NOT EXISTS idx_orders_state_court_type ON orders(state, court_type);

-- ============================================
-- BACKFILL: BD-21 — Single UPDATE WHERE state IS NULL
-- Derive state/court_type from legacy jurisdiction field
-- ============================================
UPDATE orders SET
  state = CASE jurisdiction
    WHEN 'la_state' THEN 'LA'
    WHEN 'la_ed' THEN 'LA'
    WHEN 'la_md' THEN 'LA'
    WHEN 'la_wd' THEN 'LA'
    WHEN 'ca_state' THEN 'CA'
    WHEN 'ca_superior' THEN 'CA'
    WHEN 'ca_federal' THEN 'CA'
    WHEN 'federal_5th' THEN 'LA'
    WHEN 'federal_9th' THEN 'CA'
    WHEN 'CA' THEN 'CA'
    WHEN 'LA' THEN 'LA'
    WHEN 'FED_5TH' THEN 'LA'
    WHEN 'FED_9TH' THEN 'CA'
    ELSE 'LA'
  END,
  court_type = CASE
    WHEN jurisdiction LIKE 'federal_%' THEN 'FEDERAL'
    WHEN jurisdiction LIKE 'FED_%' THEN 'FEDERAL'
    WHEN jurisdiction LIKE '%_federal' THEN 'FEDERAL'
    WHEN jurisdiction IN ('la_ed', 'la_md', 'la_wd') THEN 'FEDERAL'
    ELSE 'STATE'
  END,
  federal_district = CASE jurisdiction
    WHEN 'la_ed' THEN 'E.D. La.'
    WHEN 'la_md' THEN 'M.D. La.'
    WHEN 'la_wd' THEN 'W.D. La.'
    WHEN 'ca_federal' THEN NULL
    ELSE NULL
  END,
  pricing_multiplier_applied = CASE
    WHEN jurisdiction IN ('la_state', 'la_ed', 'la_md', 'la_wd', 'LA', 'FED_5TH', 'federal_5th') THEN 1.00
    WHEN jurisdiction IN ('ca_state', 'ca_superior', 'ca_federal', 'CA', 'FED_9TH', 'federal_9th') THEN 1.20
    ELSE 1.00
  END
WHERE state IS NULL;

-- ============================================
-- ADD ai_disclosure columns to states table
-- ============================================
ALTER TABLE states
  ADD COLUMN IF NOT EXISTS ai_disclosure_required BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS ai_disclosure_text TEXT;

COMMENT ON COLUMN states.ai_disclosure_required IS 'Whether this state requires AI-generated content disclosure in legal filings.';
COMMENT ON COLUMN states.ai_disclosure_text IS 'State-specific AI disclosure language to include in filings.';
