-- Migration: Create workflow_files table
-- Date: January 2026
-- Description: General-purpose file storage for Claude's workflow file system
-- This provides a simple file system abstraction for Claude to write HANDOFF files,
-- motion drafts, declarations, and other documents during the generation process.

-- ============================================================================
-- STEP 1: Create workflow_files table
-- ============================================================================

CREATE TABLE IF NOT EXISTS workflow_files (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE NOT NULL,

  -- File identification
  file_path TEXT NOT NULL,  -- Full path as Claude sees it (e.g., /mnt/user-data/outputs/HANDOFF_01202026_1045am.md)
  file_name TEXT NOT NULL,  -- Just the filename

  -- File content
  content TEXT NOT NULL,    -- Full text content of the file

  -- File classification
  file_type TEXT NOT NULL CHECK (file_type IN (
    'handoff',        -- HANDOFF_*.md files for workflow continuity
    'motion',         -- Motion and opposition briefs
    'declaration',    -- Declarations and affidavits
    'citation_report', -- Citation accuracy reports
    'research_memo',  -- Legal research memoranda
    'other'           -- Other document types
  )) DEFAULT 'other',

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Unique constraint: one file per path per order
  UNIQUE(order_id, file_path)
);

-- ============================================================================
-- STEP 2: Create indexes for efficient queries
-- ============================================================================

-- Find files by order
CREATE INDEX IF NOT EXISTS idx_workflow_files_order
ON workflow_files(order_id);

-- Find files by type within an order
CREATE INDEX IF NOT EXISTS idx_workflow_files_order_type
ON workflow_files(order_id, file_type);

-- Find latest handoff efficiently
CREATE INDEX IF NOT EXISTS idx_workflow_files_handoff
ON workflow_files(order_id, file_type, created_at DESC)
WHERE file_type = 'handoff';

-- Find latest motion efficiently
CREATE INDEX IF NOT EXISTS idx_workflow_files_motion
ON workflow_files(order_id, file_type, updated_at DESC)
WHERE file_type = 'motion';

-- ============================================================================
-- STEP 3: Create trigger to update updated_at timestamp
-- ============================================================================

CREATE OR REPLACE FUNCTION update_workflow_files_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_workflow_files_updated_at ON workflow_files;
CREATE TRIGGER set_workflow_files_updated_at
BEFORE UPDATE ON workflow_files
FOR EACH ROW
EXECUTE FUNCTION update_workflow_files_updated_at();

-- ============================================================================
-- STEP 4: Create RLS policies
-- ============================================================================

ALTER TABLE workflow_files ENABLE ROW LEVEL SECURITY;

-- Staff can manage all workflow files
CREATE POLICY "Staff can manage workflow files"
ON workflow_files FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
    AND role IN ('admin', 'clerk')
  )
);

-- Clients can view their own order's files (read-only)
CREATE POLICY "Clients can view own workflow files"
ON workflow_files FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM orders
    WHERE id = workflow_files.order_id
    AND client_id = auth.uid()
  )
);

-- Service role bypass (for server-side operations)
CREATE POLICY "Service role full access to workflow files"
ON workflow_files FOR ALL
USING (auth.role() = 'service_role');

-- ============================================================================
-- STEP 5: Create helper functions
-- ============================================================================

-- Get the latest handoff for an order
CREATE OR REPLACE FUNCTION get_latest_handoff(p_order_id UUID)
RETURNS workflow_files AS $$
  SELECT *
  FROM workflow_files
  WHERE order_id = p_order_id
  AND file_type = 'handoff'
  ORDER BY created_at DESC
  LIMIT 1;
$$ LANGUAGE sql STABLE;

-- Get the latest motion draft for an order
CREATE OR REPLACE FUNCTION get_latest_motion(p_order_id UUID)
RETURNS workflow_files AS $$
  SELECT *
  FROM workflow_files
  WHERE order_id = p_order_id
  AND file_type = 'motion'
  ORDER BY updated_at DESC
  LIMIT 1;
$$ LANGUAGE sql STABLE;

-- Get all files for an order by type
CREATE OR REPLACE FUNCTION get_order_files(p_order_id UUID, p_file_type TEXT DEFAULT NULL)
RETURNS SETOF workflow_files AS $$
  SELECT *
  FROM workflow_files
  WHERE order_id = p_order_id
  AND (p_file_type IS NULL OR file_type = p_file_type)
  ORDER BY created_at DESC;
$$ LANGUAGE sql STABLE;

-- ============================================================================
-- STEP 6: Add comments
-- ============================================================================

COMMENT ON TABLE workflow_files IS 'General-purpose file storage for Claude workflow. Allows Claude to write HANDOFF files, motion drafts, and other documents that persist across sessions.';
COMMENT ON COLUMN workflow_files.file_path IS 'Full virtual path as Claude sees it (e.g., /mnt/user-data/outputs/HANDOFF_01202026_1045am.md)';
COMMENT ON COLUMN workflow_files.file_type IS 'Classification of the file for easy retrieval: handoff, motion, declaration, citation_report, research_memo, other';
COMMENT ON COLUMN workflow_files.content IS 'Full text content of the file. For motions, this could be substantial (10-50KB).';
