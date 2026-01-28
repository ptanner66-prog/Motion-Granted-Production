-- Migration: Add revision pricing to motion_types
-- Date: January 2026
-- Description: Add v6.3 revision pricing columns and set tier-based prices

-- ============================================================================
-- STEP 1: Add revision pricing columns to motion_types
-- ============================================================================

ALTER TABLE motion_types
ADD COLUMN IF NOT EXISTS revision_price DECIMAL(10,2);

ALTER TABLE motion_types
ADD COLUMN IF NOT EXISTS free_revisions_included INTEGER DEFAULT 1;

ALTER TABLE motion_types
ADD COLUMN IF NOT EXISTS max_revisions INTEGER DEFAULT 3;

-- ============================================================================
-- STEP 2: Set revision prices by tier
-- v6.3 SACRED NUMBERS:
--   Tier A = $75
--   Tier B = $125
--   Tier C = $200
-- ============================================================================

-- Tier A motions: Simple, routine ($75/revision)
UPDATE motion_types
SET revision_price = 75.00,
    free_revisions_included = 1,
    max_revisions = 3
WHERE tier = 'A';

-- Tier B motions: Moderate complexity ($125/revision)
UPDATE motion_types
SET revision_price = 125.00,
    free_revisions_included = 1,
    max_revisions = 3
WHERE tier = 'B';

-- Tier C motions: Complex ($200/revision)
UPDATE motion_types
SET revision_price = 200.00,
    free_revisions_included = 1,
    max_revisions = 3
WHERE tier = 'C';

-- ============================================================================
-- STEP 3: Set NOT NULL constraint after populating data
-- ============================================================================

-- Set default for any unset rows
UPDATE motion_types
SET revision_price = 125.00,
    free_revisions_included = 1,
    max_revisions = 3
WHERE revision_price IS NULL;

-- Now add NOT NULL constraint
ALTER TABLE motion_types
ALTER COLUMN revision_price SET NOT NULL;

ALTER TABLE motion_types
ALTER COLUMN free_revisions_included SET NOT NULL;

ALTER TABLE motion_types
ALTER COLUMN max_revisions SET NOT NULL;

-- ============================================================================
-- STEP 4: Add check constraints for valid values
-- ============================================================================

ALTER TABLE motion_types
ADD CONSTRAINT motion_types_revision_price_check
CHECK (revision_price >= 0);

ALTER TABLE motion_types
ADD CONSTRAINT motion_types_free_revisions_check
CHECK (free_revisions_included >= 0 AND free_revisions_included <= 5);

ALTER TABLE motion_types
ADD CONSTRAINT motion_types_max_revisions_check
CHECK (max_revisions >= 1 AND max_revisions <= 10);

-- ============================================================================
-- STEP 5: Create function to get revision price for a workflow
-- ============================================================================

CREATE OR REPLACE FUNCTION get_revision_price(workflow_id UUID)
RETURNS TABLE (
  tier TEXT,
  price DECIMAL(10,2),
  free_remaining INTEGER,
  max_allowed INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    mt.tier,
    mt.revision_price,
    GREATEST(0, mt.free_revisions_included - ow.free_revisions_used) AS free_remaining,
    mt.max_revisions
  FROM order_workflows ow
  JOIN motion_types mt ON mt.id = ow.motion_type_id
  WHERE ow.id = workflow_id;
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================================================
-- STEP 6: Add comments
-- ============================================================================

COMMENT ON COLUMN motion_types.revision_price IS 'v6.3: Price per paid revision. Tier A=$75, B=$125, C=$200.';
COMMENT ON COLUMN motion_types.free_revisions_included IS 'v6.3: Number of free revisions included with order. Default 1.';
COMMENT ON COLUMN motion_types.max_revisions IS 'v6.3: Maximum total revisions allowed. Default 3, then escalate.';
COMMENT ON FUNCTION get_revision_price IS 'v6.3: Returns revision pricing info for a workflow including remaining free revisions.';
