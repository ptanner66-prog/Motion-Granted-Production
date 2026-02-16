-- ============================================================================
-- SP-2 Task 9 (D3 Task 10): anonymized_analytics Cost Columns
-- Date: 2026-02-16
--
-- Adds 5 cost columns for aggregate cost analytics.
-- All nullable — existing rows unaffected.
-- ============================================================================

ALTER TABLE anonymized_analytics ADD COLUMN IF NOT EXISTS total_api_cost DECIMAL(10,4);
ALTER TABLE anonymized_analytics ADD COLUMN IF NOT EXISTS opus_cost DECIMAL(10,4);
ALTER TABLE anonymized_analytics ADD COLUMN IF NOT EXISTS sonnet_cost DECIMAL(10,4);
ALTER TABLE anonymized_analytics ADD COLUMN IF NOT EXISTS openai_cost DECIMAL(10,4);
ALTER TABLE anonymized_analytics ADD COLUMN IF NOT EXISTS gross_margin_pct DECIMAL(5,1);
