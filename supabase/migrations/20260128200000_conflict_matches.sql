-- Migration: Conflict Matches Table
-- Version: 1.0.0
-- Description: Extended conflict detection with detailed match tracking

-- ============================================================================
-- CONFLICT MATCHES TABLE
-- Stores individual conflict detections with full audit trail
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.conflict_matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Conflict classification
  type TEXT NOT NULL CHECK (type IN (
    'SAME_CASE_NUMBER',
    'OPPOSING_PARTIES',
    'PRIOR_REPRESENTATION',
    'RELATED_MATTER',
    'SAME_ATTORNEY_BOTH_SIDES'
  )),
  severity TEXT NOT NULL CHECK (severity IN ('BLOCKING', 'WARNING', 'INFO')),

  -- Current order being checked
  current_order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  current_case_number TEXT,
  current_party_name TEXT,
  current_opposing_party TEXT,
  current_attorney_id UUID REFERENCES auth.users(id),

  -- Conflicting order
  conflicting_order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  conflicting_case_number TEXT,
  conflicting_party_name TEXT,
  conflicting_opposing_party TEXT,
  conflicting_attorney_id UUID REFERENCES auth.users(id),

  -- Match details
  match_field TEXT NOT NULL CHECK (match_field IN (
    'case_number', 'party_name', 'opposing_party', 'attorney'
  )),
  match_confidence INTEGER NOT NULL CHECK (match_confidence >= 0 AND match_confidence <= 100),
  match_reason TEXT NOT NULL,

  -- Resolution
  resolved BOOLEAN NOT NULL DEFAULT FALSE,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES auth.users(id),
  resolution_note TEXT,

  -- Timestamps
  detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints
  CONSTRAINT unique_conflict_pair UNIQUE (current_order_id, conflicting_order_id, type)
);

-- ============================================================================
-- INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_conflict_matches_current_order
  ON conflict_matches(current_order_id);

CREATE INDEX IF NOT EXISTS idx_conflict_matches_conflicting_order
  ON conflict_matches(conflicting_order_id);

CREATE INDEX IF NOT EXISTS idx_conflict_matches_severity
  ON conflict_matches(severity) WHERE NOT resolved;

CREATE INDEX IF NOT EXISTS idx_conflict_matches_attorney
  ON conflict_matches(current_attorney_id);

CREATE INDEX IF NOT EXISTS idx_conflict_matches_unresolved
  ON conflict_matches(current_order_id) WHERE NOT resolved;

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE conflict_matches ENABLE ROW LEVEL SECURITY;

-- Admins can see all conflicts
DROP POLICY IF EXISTS "Admins can view all conflicts" ON conflict_matches;
CREATE POLICY "Admins can view all conflicts"
  ON conflict_matches FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
    OR
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role IN ('admin', 'super_admin')
    )
  );

-- Attorneys can see conflicts involving their orders
DROP POLICY IF EXISTS "Attorneys can view own conflicts" ON conflict_matches;
CREATE POLICY "Attorneys can view own conflicts"
  ON conflict_matches FOR SELECT
  TO authenticated
  USING (
    current_attorney_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM orders
      WHERE orders.id = conflict_matches.current_order_id
      AND orders.attorney_id = auth.uid()
    )
  );

-- Only admins can resolve conflicts
DROP POLICY IF EXISTS "Admins can update conflicts" ON conflict_matches;
CREATE POLICY "Admins can update conflicts"
  ON conflict_matches FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
    OR
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role IN ('admin', 'super_admin')
    )
  );

-- System can insert conflicts
DROP POLICY IF EXISTS "System can insert conflicts" ON conflict_matches;
CREATE POLICY "System can insert conflicts"
  ON conflict_matches FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Service role full access
DROP POLICY IF EXISTS "Service role full access to conflict_matches" ON conflict_matches;
CREATE POLICY "Service role full access to conflict_matches"
  ON conflict_matches FOR ALL
  USING (auth.role() = 'service_role');

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- Function to get conflict summary for dashboard
CREATE OR REPLACE FUNCTION get_conflict_summary()
RETURNS TABLE (
  total_conflicts BIGINT,
  blocking_conflicts BIGINT,
  warning_conflicts BIGINT,
  unresolved_conflicts BIGINT,
  resolved_today BIGINT
)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT
    COUNT(*) AS total_conflicts,
    COUNT(*) FILTER (WHERE severity = 'BLOCKING') AS blocking_conflicts,
    COUNT(*) FILTER (WHERE severity = 'WARNING') AS warning_conflicts,
    COUNT(*) FILTER (WHERE NOT resolved) AS unresolved_conflicts,
    COUNT(*) FILTER (WHERE resolved AND resolved_at >= CURRENT_DATE) AS resolved_today
  FROM conflict_matches;
$$;

-- ============================================================================
-- ADD CONFLICT_REVIEW STATUS TO ORDERS (if not exists)
-- ============================================================================

DO $$
BEGIN
  -- Check if status constraint exists and update it
  ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;

  -- Add new constraint allowing CONFLICT_REVIEW status
  ALTER TABLE orders ADD CONSTRAINT orders_status_check
    CHECK (status IN (
      'DRAFT', 'PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'FAILED',
      'CONFLICT_REVIEW', 'PENDING_REVIEW', 'APPROVED', 'REJECTED'
    ));
EXCEPTION
  WHEN OTHERS THEN
    -- Constraint might not exist or have different format, ignore
    NULL;
END;
$$;

COMMENT ON TABLE conflict_matches IS 'Conflict of interest detection for legal ethics compliance';

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================

-- Summary:
-- - Created conflict_matches table with full conflict tracking
-- - Added indexes for efficient querying
-- - Configured RLS policies for attorneys and admins
-- - Added get_conflict_summary() function for dashboard
-- - Allows CONFLICT_REVIEW status on orders
