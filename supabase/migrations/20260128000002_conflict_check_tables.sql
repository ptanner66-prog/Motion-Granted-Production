-- ============================================================================
-- Migration: Conflict Check System Tables
-- Version: 1.0
-- Date: January 28, 2026
-- ============================================================================

-- ============================================================================
-- PART 1: Create conflict_parties table
-- Stores party information for each order for conflict matching
-- ============================================================================

CREATE TABLE IF NOT EXISTS conflict_parties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  party_name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  party_role TEXT NOT NULL,
  aliases TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for efficient conflict searching
CREATE INDEX IF NOT EXISTS idx_conflict_parties_order ON conflict_parties(order_id);
CREATE INDEX IF NOT EXISTS idx_conflict_parties_normalized ON conflict_parties(normalized_name);
CREATE INDEX IF NOT EXISTS idx_conflict_parties_role ON conflict_parties(party_role);

-- GIN index for alias searching
CREATE INDEX IF NOT EXISTS idx_conflict_parties_aliases ON conflict_parties USING GIN(aliases);

-- Add RLS
ALTER TABLE conflict_parties ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access to conflict_parties" ON conflict_parties;
CREATE POLICY "Service role full access to conflict_parties" ON conflict_parties
  FOR ALL USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Users view own conflict_parties" ON conflict_parties;
CREATE POLICY "Users view own conflict_parties" ON conflict_parties
  FOR SELECT USING (
    order_id IN (
      SELECT o.id FROM orders o
      JOIN clients c ON c.id = o.client_id
      WHERE c.user_id = auth.uid()
    )
  );

COMMENT ON TABLE conflict_parties IS 'Stores party information for conflict of interest checking';
COMMENT ON COLUMN conflict_parties.party_name IS 'Original party name as entered';
COMMENT ON COLUMN conflict_parties.normalized_name IS 'Normalized name for fuzzy matching';
COMMENT ON COLUMN conflict_parties.party_role IS 'Role: plaintiff, defendant, third_party, witness, counsel, other';
COMMENT ON COLUMN conflict_parties.aliases IS 'Array of known aliases for this party';

-- ============================================================================
-- PART 2: Create conflict_checks table
-- Stores conflict check results and review status
-- ============================================================================

CREATE TABLE IF NOT EXISTS conflict_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  check_result JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending_review',
  reviewed_by UUID REFERENCES auth.users(id),
  reviewed_at TIMESTAMPTZ,
  review_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_conflict_checks_order ON conflict_checks(order_id);
CREATE INDEX IF NOT EXISTS idx_conflict_checks_client ON conflict_checks(client_id);
CREATE INDEX IF NOT EXISTS idx_conflict_checks_status ON conflict_checks(status);
CREATE INDEX IF NOT EXISTS idx_conflict_checks_created ON conflict_checks(created_at DESC);

-- Partial index for pending reviews
CREATE INDEX IF NOT EXISTS idx_conflict_checks_pending ON conflict_checks(created_at DESC)
  WHERE status = 'pending_review';

-- Add RLS
ALTER TABLE conflict_checks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access to conflict_checks" ON conflict_checks;
CREATE POLICY "Service role full access to conflict_checks" ON conflict_checks
  FOR ALL USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Users view own conflict_checks" ON conflict_checks;
CREATE POLICY "Users view own conflict_checks" ON conflict_checks
  FOR SELECT USING (
    client_id IN (
      SELECT id FROM clients WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Admins full access to conflict_checks" ON conflict_checks;
CREATE POLICY "Admins full access to conflict_checks" ON conflict_checks
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = auth.uid()
      AND role IN ('admin', 'super_admin')
    )
  );

COMMENT ON TABLE conflict_checks IS 'Stores conflict check results and admin review status';
COMMENT ON COLUMN conflict_checks.check_result IS 'JSON containing severity, matches, and message';
COMMENT ON COLUMN conflict_checks.status IS 'pending_review, approved, rejected, auto_cleared';

-- ============================================================================
-- PART 3: Add constraint for valid status values
-- ============================================================================

ALTER TABLE conflict_checks DROP CONSTRAINT IF EXISTS conflict_checks_status_check;
ALTER TABLE conflict_checks ADD CONSTRAINT conflict_checks_status_check
  CHECK (status IN ('pending_review', 'approved', 'rejected', 'auto_cleared'));

-- ============================================================================
-- PART 4: Create function to auto-run conflict check on new parties
-- ============================================================================

CREATE OR REPLACE FUNCTION notify_conflict_check_needed()
RETURNS TRIGGER AS $$
BEGIN
  -- Notify that a conflict check should be run
  -- This can be picked up by Inngest or another event handler
  PERFORM pg_notify(
    'conflict_check_needed',
    json_build_object(
      'order_id', NEW.order_id,
      'party_id', NEW.id,
      'party_name', NEW.party_name,
      'party_role', NEW.party_role
    )::text
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_conflict_check_needed ON conflict_parties;
CREATE TRIGGER trigger_conflict_check_needed
  AFTER INSERT ON conflict_parties
  FOR EACH ROW
  EXECUTE FUNCTION notify_conflict_check_needed();

-- ============================================================================
-- PART 5: Create view for admin dashboard
-- ============================================================================

CREATE OR REPLACE VIEW conflict_review_queue AS
SELECT
  cc.id,
  cc.order_id,
  o.order_number,
  c.full_name AS client_name,
  cc.check_result->>'severity' AS severity,
  jsonb_array_length(cc.check_result->'matches') AS match_count,
  cc.status,
  cc.created_at,
  cc.reviewed_by,
  cc.reviewed_at
FROM conflict_checks cc
JOIN orders o ON o.id = cc.order_id
JOIN clients c ON c.id = cc.client_id
WHERE cc.status = 'pending_review'
ORDER BY
  CASE
    WHEN cc.check_result->>'severity' = 'HARD' THEN 1
    WHEN cc.check_result->>'severity' = 'SOFT' THEN 2
    ELSE 3
  END,
  cc.created_at ASC;

COMMENT ON VIEW conflict_review_queue IS 'Admin view of conflicts pending review, prioritized by severity';

-- ============================================================================
-- PART 6: Create helper function for similarity check
-- ============================================================================

CREATE OR REPLACE FUNCTION check_party_similarity(
  name1 TEXT,
  name2 TEXT
) RETURNS NUMERIC AS $$
DECLARE
  max_len INTEGER;
  distance INTEGER;
BEGIN
  -- Normalize names
  name1 := lower(trim(regexp_replace(name1, '[^\w\s]', ' ', 'g')));
  name2 := lower(trim(regexp_replace(name2, '[^\w\s]', ' ', 'g')));

  IF name1 = name2 THEN
    RETURN 1.0;
  END IF;

  max_len := GREATEST(length(name1), length(name2));
  IF max_len = 0 THEN
    RETURN 0;
  END IF;

  -- Use Levenshtein distance (requires fuzzystrmatch extension)
  -- If extension not available, fall back to simple equality
  BEGIN
    distance := levenshtein(name1, name2);
    RETURN 1.0 - (distance::NUMERIC / max_len);
  EXCEPTION WHEN undefined_function THEN
    RETURN CASE WHEN name1 = name2 THEN 1.0 ELSE 0 END;
  END;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION check_party_similarity IS 'Calculate similarity score between two party names (0-1)';

-- ============================================================================
-- PART 7: Ensure fuzzystrmatch extension is available
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS fuzzystrmatch;

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================

-- Summary:
-- - Created conflict_parties table for storing party information
-- - Created conflict_checks table for storing check results and reviews
-- - Added RLS policies for security
-- - Created trigger for notifying when conflict checks needed
-- - Created admin view for review queue
-- - Created helper function for similarity checking
-- - Enabled fuzzystrmatch extension for Levenshtein distance
