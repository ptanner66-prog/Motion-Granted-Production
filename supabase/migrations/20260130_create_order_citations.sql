-- ============================================================================
-- Migration: 20260130_create_order_citations.sql
-- Citation Viewer Feature: Order Citations Table
--
-- Stores citations associated with each order for the Citation Viewer feature.
-- This enables users and admins to click on citations and see full case details.
-- ============================================================================

-- order_citations table: Citations used in each order's motion
CREATE TABLE IF NOT EXISTS order_citations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,

  -- Citation identification
  citation_string VARCHAR(255) NOT NULL,        -- "806 F.3d 289"
  case_name TEXT NOT NULL,                       -- "Brumfield v. Louisiana State Board of Education"
  case_name_short VARCHAR(255),                  -- "Brumfield"

  -- CourtListener IDs (for fetching full data)
  courtlistener_opinion_id VARCHAR(50),          -- Opinion ID
  courtlistener_cluster_id VARCHAR(50),          -- Cluster ID
  courtlistener_url TEXT,                        -- Direct URL

  -- Case metadata
  court VARCHAR(255),                            -- "Court of Appeals for the Fifth Circuit"
  court_short VARCHAR(50),                       -- "5th Cir."
  date_filed DATE,
  date_filed_display VARCHAR(50),                -- "2015"

  -- How citation was used
  citation_type VARCHAR(20) NOT NULL DEFAULT 'case',  -- 'case' | 'statute' | 'regulation'
  proposition TEXT,                              -- What this citation supports
  location_in_motion TEXT,                       -- "Argument I, paragraph 3"
  authority_level VARCHAR(20),                   -- 'binding' | 'persuasive'

  -- Verification
  verification_status VARCHAR(20) DEFAULT 'verified',  -- 'verified' | 'unverified' | 'flagged'
  verification_timestamp TIMESTAMP WITH TIME ZONE,
  verification_method VARCHAR(50),               -- 'courtlistener_search' | 'courtlistener_lookup'

  -- Admin review
  admin_reviewed BOOLEAN DEFAULT FALSE,
  admin_reviewed_at TIMESTAMP WITH TIME ZONE,
  admin_reviewed_by UUID REFERENCES profiles(id),
  admin_notes TEXT,

  -- Display order
  display_order INTEGER DEFAULT 0,

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_order_citations_order_id ON order_citations(order_id);
CREATE INDEX IF NOT EXISTS idx_order_citations_cl_opinion_id ON order_citations(courtlistener_opinion_id);
CREATE INDEX IF NOT EXISTS idx_order_citations_cl_cluster_id ON order_citations(courtlistener_cluster_id);
CREATE INDEX IF NOT EXISTS idx_order_citations_type ON order_citations(citation_type);
CREATE INDEX IF NOT EXISTS idx_order_citations_verification ON order_citations(verification_status);

-- Unique constraint: one citation per order (by citation string)
CREATE UNIQUE INDEX IF NOT EXISTS idx_order_citations_unique
  ON order_citations(order_id, citation_string);

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_order_citations_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_order_citations_updated_at ON order_citations;
CREATE TRIGGER update_order_citations_updated_at
  BEFORE UPDATE ON order_citations
  FOR EACH ROW EXECUTE FUNCTION update_order_citations_timestamp();

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE order_citations ENABLE ROW LEVEL SECURITY;

-- Clients can view citations for their own orders
CREATE POLICY "Users can view own order citations"
  ON order_citations FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM orders o
      WHERE o.id = order_citations.order_id
      AND (
        o.client_id = auth.uid()
        OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'clerk'))
      )
    )
  );

-- Admins can manage all citations
CREATE POLICY "Admins can manage order citations"
  ON order_citations FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'clerk'))
  );

-- Service role bypass for server-side operations
CREATE POLICY "Service role full access to order_citations"
  ON order_citations FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
