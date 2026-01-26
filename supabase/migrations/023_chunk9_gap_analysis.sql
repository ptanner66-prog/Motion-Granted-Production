-- Migration: 023_chunk9_gap_analysis.sql
-- Purpose: Add tables for Chunk 9 Gap Analysis Tasks
-- Source: Chunk 9, Tasks 63-68

-- ============================================================================
-- DOCUMENT DOWNLOADS TABLE (Task 68)
-- ============================================================================

CREATE TABLE IF NOT EXISTS document_downloads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
  document_id UUID,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ip_address INET,
  user_agent TEXT,
  downloaded_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE document_downloads IS 'Download audit log for client document downloads (Task 68)';

-- Indexes for document downloads
CREATE INDEX IF NOT EXISTS idx_document_downloads_order_id
ON document_downloads(order_id);

CREATE INDEX IF NOT EXISTS idx_document_downloads_user_id
ON document_downloads(user_id);

CREATE INDEX IF NOT EXISTS idx_document_downloads_downloaded_at
ON document_downloads(downloaded_at DESC);

-- ============================================================================
-- ORDER NOTES TABLE (Task 67)
-- ============================================================================

CREATE TABLE IF NOT EXISTS order_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE NOT NULL,
  note TEXT NOT NULL,
  is_internal BOOLEAN DEFAULT TRUE,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE order_notes IS 'Internal notes for orders (Task 67)';

-- Indexes for order notes
CREATE INDEX IF NOT EXISTS idx_order_notes_order_id
ON order_notes(order_id);

CREATE INDEX IF NOT EXISTS idx_order_notes_created_at
ON order_notes(created_at DESC);

-- ============================================================================
-- PHASE PROMPTS TABLE (Task 65)
-- ============================================================================

CREATE TABLE IF NOT EXISTS phase_prompts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phase_code VARCHAR(10) NOT NULL,
  template_name VARCHAR(100) NOT NULL,
  system_prompt TEXT,
  user_prompt_template TEXT NOT NULL,
  motion_types TEXT[],
  is_default BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(phase_code, is_default) WHERE is_default = TRUE
);

COMMENT ON TABLE phase_prompts IS 'Phase-specific prompt templates for superprompt builder (Task 65)';

-- Index for phase prompts
CREATE INDEX IF NOT EXISTS idx_phase_prompts_phase_code
ON phase_prompts(phase_code);

-- ============================================================================
-- CREDENTIAL CHECK LOG TABLE (Task 63)
-- ============================================================================

CREATE TABLE IF NOT EXISTS credential_check_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service VARCHAR(50) NOT NULL,
  valid BOOLEAN NOT NULL,
  error TEXT,
  checked_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE credential_check_log IS 'API credential verification log (Task 63)';

-- Index for credential checks
CREATE INDEX IF NOT EXISTS idx_credential_check_log_checked_at
ON credential_check_log(checked_at DESC);

-- Cleanup old checks (keep 7 days)
CREATE INDEX IF NOT EXISTS idx_credential_check_log_cleanup
ON credential_check_log(checked_at)
WHERE checked_at < NOW() - INTERVAL '7 days';

-- ============================================================================
-- ADD COLUMNS TO ORDERS TABLE
-- ============================================================================

-- Add revision tracking columns
ALTER TABLE orders
ADD COLUMN IF NOT EXISTS revision_count INTEGER DEFAULT 0;

ALTER TABLE orders
ADD COLUMN IF NOT EXISTS max_revisions INTEGER DEFAULT 2;

ALTER TABLE orders
ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

COMMENT ON COLUMN orders.revision_count IS 'Number of revisions used';
COMMENT ON COLUMN orders.max_revisions IS 'Maximum revisions allowed for this order';
COMMENT ON COLUMN orders.completed_at IS 'When the order was marked complete';

-- ============================================================================
-- ADD COLUMNS TO ORDER_WORKFLOW_STATE
-- ============================================================================

-- Add assigned admin column
ALTER TABLE order_workflow_state
ADD COLUMN IF NOT EXISTS assigned_to UUID REFERENCES auth.users(id);

COMMENT ON COLUMN order_workflow_state.assigned_to IS 'Admin assigned to this order (Task 67)';

-- Index for admin queue
CREATE INDEX IF NOT EXISTS idx_workflow_state_assigned_to
ON order_workflow_state(assigned_to)
WHERE assigned_to IS NOT NULL;

-- ============================================================================
-- VIEW FOR DOWNLOAD STATISTICS
-- ============================================================================

CREATE OR REPLACE VIEW v_download_statistics AS
SELECT
  dd.order_id,
  o.order_number,
  COUNT(*) as download_count,
  COUNT(DISTINCT dd.user_id) as unique_users,
  MAX(dd.downloaded_at) as last_download,
  MIN(dd.downloaded_at) as first_download
FROM document_downloads dd
JOIN orders o ON o.id = dd.order_id
GROUP BY dd.order_id, o.order_number
ORDER BY last_download DESC;

COMMENT ON VIEW v_download_statistics IS 'Download statistics by order for audit';

-- ============================================================================
-- FUNCTION TO LOG CREDENTIAL CHECK
-- ============================================================================

CREATE OR REPLACE FUNCTION log_credential_check(
  p_service VARCHAR(50),
  p_valid BOOLEAN,
  p_error TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO credential_check_log (service, valid, error)
  VALUES (p_service, p_valid, p_error)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION log_credential_check IS 'Log a credential verification result';

-- ============================================================================
-- GRANT PERMISSIONS
-- ============================================================================

-- Document downloads
GRANT SELECT, INSERT ON document_downloads TO authenticated;
GRANT ALL ON document_downloads TO service_role;

-- Order notes
GRANT SELECT, INSERT ON order_notes TO authenticated;
GRANT ALL ON order_notes TO service_role;

-- Phase prompts
GRANT SELECT ON phase_prompts TO authenticated;
GRANT ALL ON phase_prompts TO service_role;

-- Credential check log
GRANT SELECT ON credential_check_log TO service_role;
GRANT INSERT ON credential_check_log TO service_role;

-- Views
GRANT SELECT ON v_download_statistics TO authenticated;
GRANT SELECT ON v_download_statistics TO service_role;

-- Functions
GRANT EXECUTE ON FUNCTION log_credential_check TO service_role;
