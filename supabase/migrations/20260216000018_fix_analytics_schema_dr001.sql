-- ==========================================================================
-- MIGRATION: Fix DR-001 -- Complete anonymized_analytics schema
-- AUDIT REF: DR-001 (P1 HIGH)
-- DATE: 2026-02-16 CST
-- ==========================================================================

ALTER TABLE anonymized_analytics ADD COLUMN IF NOT EXISTS original_order_id UUID;
ALTER TABLE anonymized_analytics ADD COLUMN IF NOT EXISTS order_created_at TIMESTAMPTZ;
ALTER TABLE anonymized_analytics ADD COLUMN IF NOT EXISTS order_delivered_at TIMESTAMPTZ;
ALTER TABLE anonymized_analytics ADD COLUMN IF NOT EXISTS anonymized_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE anonymized_analytics ADD COLUMN IF NOT EXISTS motion_path VARCHAR(1);
ALTER TABLE anonymized_analytics ADD COLUMN IF NOT EXISTS court_type VARCHAR(20);
ALTER TABLE anonymized_analytics ADD COLUMN IF NOT EXISTS state VARCHAR(2);
ALTER TABLE anonymized_analytics ADD COLUMN IF NOT EXISTS judge_simulation_grade_numeric DECIMAL(3,1);

ALTER TABLE anonymized_analytics DROP CONSTRAINT IF EXISTS anonymized_analytics_tier_check;
ALTER TABLE anonymized_analytics ADD CONSTRAINT anonymized_analytics_tier_check
  CHECK (motion_tier IS NULL OR motion_tier IN ('A', 'B', 'C', 'D'));
