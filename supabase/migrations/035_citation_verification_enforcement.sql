-- ============================================================================
-- CITATION VERIFICATION ENFORCEMENT MIGRATION
-- Motion Granted v7.2.1 - Zero Tolerance for Hallucinated Citations
-- Created: 2026-01-30
-- ============================================================================

-- ============================================================================
-- Add additional columns to citation_verifications for enhanced audit
-- ============================================================================

-- Add phase column to track which workflow phase performed the verification
ALTER TABLE citation_verifications
ADD COLUMN IF NOT EXISTS phase VARCHAR(10);

-- Add api_response column to store raw CourtListener API response
ALTER TABLE citation_verifications
ADD COLUMN IF NOT EXISTS api_response JSONB;

-- Add index for phase-based queries
CREATE INDEX IF NOT EXISTS idx_citation_verifications_phase
ON citation_verifications(phase);

-- ============================================================================
-- PHASE IV SEARCH AUDIT TABLE
-- Tracks all CourtListener searches performed during Phase IV
-- ============================================================================

CREATE TABLE IF NOT EXISTS phase_iv_search_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,

  -- Search details
  search_query TEXT NOT NULL,
  jurisdiction VARCHAR(50),
  for_element TEXT NOT NULL,

  -- Results
  results_count INTEGER NOT NULL DEFAULT 0,
  citations_selected INTEGER NOT NULL DEFAULT 0,
  courtlistener_ids INTEGER[] DEFAULT ARRAY[]::INTEGER[],

  -- Timing
  search_duration_ms INTEGER,
  searched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- API details
  api_endpoint TEXT,
  api_response JSONB,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for search audit
CREATE INDEX IF NOT EXISTS idx_phase_iv_search_order_id
ON phase_iv_search_audit(order_id);

CREATE INDEX IF NOT EXISTS idx_phase_iv_search_element
ON phase_iv_search_audit(for_element);

-- ============================================================================
-- CITATION VERIFICATION SUMMARY VIEW
-- Aggregates verification stats per order
-- ============================================================================

CREATE OR REPLACE VIEW citation_verification_summary AS
SELECT
  order_id,
  COUNT(*) as total_verifications,
  COUNT(*) FILTER (WHERE verification_status = 'VERIFIED') as verified_count,
  COUNT(*) FILTER (WHERE verification_status = 'NOT_FOUND') as not_found_count,
  COUNT(*) FILTER (WHERE verification_status = 'PENDING') as pending_count,
  COUNT(*) FILTER (WHERE courtlistener_id IS NOT NULL) as has_courtlistener_id,
  MIN(stage_1_at) as first_verification,
  MAX(stage_1_at) as last_verification,
  ROUND(
    (COUNT(*) FILTER (WHERE verification_status = 'VERIFIED')::DECIMAL /
     NULLIF(COUNT(*), 0)) * 100, 2
  ) as verification_rate_percent
FROM citation_verifications
GROUP BY order_id;

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE phase_iv_search_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access to phase_iv_search_audit"
  ON phase_iv_search_audit FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Users can view their own phase_iv_search_audit"
  ON phase_iv_search_audit FOR SELECT
  USING (
    order_id IN (
      SELECT id FROM orders WHERE client_id = auth.uid()
    )
  );

-- ============================================================================
-- FUNCTION: Log Phase IV search
-- ============================================================================

CREATE OR REPLACE FUNCTION log_phase_iv_search(
  p_order_id UUID,
  p_search_query TEXT,
  p_jurisdiction VARCHAR(50),
  p_for_element TEXT,
  p_results_count INTEGER,
  p_citations_selected INTEGER,
  p_courtlistener_ids INTEGER[],
  p_search_duration_ms INTEGER DEFAULT NULL,
  p_api_response JSONB DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO phase_iv_search_audit (
    order_id,
    search_query,
    jurisdiction,
    for_element,
    results_count,
    citations_selected,
    courtlistener_ids,
    search_duration_ms,
    api_response
  ) VALUES (
    p_order_id,
    p_search_query,
    p_jurisdiction,
    p_for_element,
    p_results_count,
    p_citations_selected,
    p_courtlistener_ids,
    p_search_duration_ms,
    p_api_response
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- FUNCTION: Validate citation bank has verification proof
-- Used by Phase V to reject unverified citation banks
-- ============================================================================

CREATE OR REPLACE FUNCTION validate_citation_bank_verified(
  p_order_id UUID
)
RETURNS TABLE (
  is_valid BOOLEAN,
  total_citations INTEGER,
  verified_citations INTEGER,
  missing_courtlistener_id INTEGER,
  verification_rate DECIMAL(5,2)
) AS $$
BEGIN
  RETURN QUERY
  WITH bank_citations AS (
    SELECT
      jsonb_array_elements(citations) as citation
    FROM citation_banks
    WHERE order_id = p_order_id AND bank_type = 'CASE'
  )
  SELECT
    (COUNT(*) FILTER (WHERE (citation->>'courtlistener_id') IS NOT NULL) = COUNT(*)) as is_valid,
    COUNT(*)::INTEGER as total_citations,
    COUNT(*) FILTER (WHERE (citation->>'courtlistener_id') IS NOT NULL)::INTEGER as verified_citations,
    COUNT(*) FILTER (WHERE (citation->>'courtlistener_id') IS NULL)::INTEGER as missing_courtlistener_id,
    ROUND(
      (COUNT(*) FILTER (WHERE (citation->>'courtlistener_id') IS NOT NULL)::DECIMAL /
       NULLIF(COUNT(*), 0)) * 100, 2
    ) as verification_rate
  FROM bank_citations;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE phase_iv_search_audit IS 'Audit trail of all CourtListener searches performed during Phase IV citation research';
COMMENT ON VIEW citation_verification_summary IS 'Aggregated citation verification statistics per order';
COMMENT ON FUNCTION log_phase_iv_search IS 'Log a Phase IV CourtListener search for audit purposes';
COMMENT ON FUNCTION validate_citation_bank_verified IS 'Validate that all citations in an order citation bank have courtlistener_id verification proof';
