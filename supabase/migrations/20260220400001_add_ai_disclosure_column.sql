-- T-64: Add AI disclosure toggle column to orders table
-- IW-001-DEC: Advisory only. Default false. Attorney controls.
-- No RLS changes needed — existing orders RLS covers all columns.
-- No index needed — not queried in hot paths.

ALTER TABLE orders ADD COLUMN IF NOT EXISTS include_ai_disclosure BOOLEAN DEFAULT false;

COMMENT ON COLUMN orders.include_ai_disclosure IS
  'Attorney preference for AI disclosure page in filing package. Advisory only per IW-001-DEC.';
