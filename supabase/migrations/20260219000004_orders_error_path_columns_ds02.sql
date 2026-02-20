BEGIN;

-- DS-02: Missing orders error-path columns
-- These are written by workflow-orchestration.ts on CIV failures,
-- quality gates, and timeout handlers. Without them, diagnostic
-- data is silently lost.

ALTER TABLE orders ADD COLUMN IF NOT EXISTS hold_details TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS needs_manual_review BOOLEAN DEFAULT false;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS quality_notes TEXT;

-- Partial index for admin queue — only index rows needing review
CREATE INDEX IF NOT EXISTS idx_orders_needs_manual_review
  ON orders(needs_manual_review) WHERE needs_manual_review = true;

COMMIT;
