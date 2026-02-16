-- ============================================================================
-- D3 Task 19: Document tier-at-call-time Behavior
-- Date: 2026-02-16
--
-- The `tier` column in cost_tracking records the order's tier AT THE TIME
-- of each API call. If a tier reclassification occurs mid-workflow (e.g.,
-- B -> C), earlier rows will have tier='B' and later rows tier='C'.
-- This is intentional and correct.
-- ============================================================================

COMMENT ON COLUMN cost_tracking.tier IS
  'Tier at API call time, NOT current order tier. '
  'Tier reclassification creates mixed values per order. '
  'Use orders.tier for current tier. '
  'See lib/ai/normalize-usage.ts and workflow-orchestration.ts for cost tracking pipeline.';
