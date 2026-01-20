-- Migration: Create handoff_files table
-- Date: January 2026
-- Description: Track workflow handoff files for session continuity and recovery

-- ============================================================================
-- STEP 1: Create handoff_files table
-- ============================================================================

CREATE TABLE IF NOT EXISTS handoff_files (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  order_workflow_id UUID REFERENCES order_workflows(id) ON DELETE CASCADE NOT NULL,

  -- Handoff context
  phase_number INTEGER NOT NULL,
  phase_name TEXT NOT NULL,
  handoff_type TEXT NOT NULL CHECK (handoff_type IN (
    'full',          -- Complete project state (phase completion)
    'transition',    -- Phase-to-phase (same session)
    'incremental',   -- Every 4 citations (CRITICAL: v6.3 batching rule)
    'recovery',      -- Deep Research return, large docs
    'checkpoint'     -- Customer checkpoint pause (CP1, CP2, CP3)
  )),

  -- Content
  content JSONB NOT NULL,
  content_hash TEXT,  -- SHA256 hash for deduplication/verification

  -- File storage (if stored as file instead of JSONB)
  file_path TEXT,
  file_size INTEGER,

  -- Session tracking
  session_id TEXT,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '90 days'),

  -- Recovery tracking
  was_recovered_from BOOLEAN DEFAULT FALSE,
  recovered_at TIMESTAMPTZ,

  -- Index for retrieval
  is_latest BOOLEAN DEFAULT TRUE
);

-- ============================================================================
-- STEP 2: Create indexes
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_handoff_files_workflow
ON handoff_files(order_workflow_id);

CREATE INDEX IF NOT EXISTS idx_handoff_files_latest
ON handoff_files(order_workflow_id, is_latest)
WHERE is_latest = TRUE;

CREATE INDEX IF NOT EXISTS idx_handoff_files_type
ON handoff_files(handoff_type);

CREATE INDEX IF NOT EXISTS idx_handoff_files_phase
ON handoff_files(order_workflow_id, phase_number);

-- ============================================================================
-- STEP 3: Create trigger to mark previous handoffs as not latest
-- ============================================================================

CREATE OR REPLACE FUNCTION mark_previous_handoffs_not_latest()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE handoff_files
  SET is_latest = FALSE
  WHERE order_workflow_id = NEW.order_workflow_id
  AND id != NEW.id
  AND is_latest = TRUE;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_handoff_latest ON handoff_files;
CREATE TRIGGER set_handoff_latest
AFTER INSERT ON handoff_files
FOR EACH ROW
EXECUTE FUNCTION mark_previous_handoffs_not_latest();

-- ============================================================================
-- STEP 4: Create RLS policies
-- ============================================================================

ALTER TABLE handoff_files ENABLE ROW LEVEL SECURITY;

-- Staff can manage handoffs
CREATE POLICY "Staff can manage handoffs"
ON handoff_files FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
    AND role IN ('admin', 'clerk')
  )
);

-- Clients can view their own handoffs (read-only)
CREATE POLICY "Clients can view own handoffs"
ON handoff_files FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM order_workflows ow
    JOIN orders o ON o.id = ow.order_id
    WHERE ow.id = handoff_files.order_workflow_id
    AND o.client_id = auth.uid()
  )
);

-- ============================================================================
-- STEP 5: Create cleanup function for expired handoffs
-- ============================================================================

CREATE OR REPLACE FUNCTION cleanup_expired_handoffs()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM handoff_files
  WHERE expires_at < NOW()
  AND is_latest = FALSE;

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- STEP 6: Add comments
-- ============================================================================

COMMENT ON TABLE handoff_files IS 'v6.3: Tracks workflow handoff files for session continuity. Incremental type used for 4-citation batching rule.';
COMMENT ON COLUMN handoff_files.handoff_type IS 'Type of handoff: full (phase end), transition (phase-to-phase), incremental (every 4 citations), recovery (deep research), checkpoint (CP1/CP2/CP3)';
COMMENT ON COLUMN handoff_files.is_latest IS 'True if this is the most recent handoff for the workflow. Managed by trigger.';
COMMENT ON COLUMN handoff_files.content_hash IS 'SHA256 hash for verifying content integrity and deduplication';
