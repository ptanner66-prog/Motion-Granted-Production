-- ============================================================================
-- Motion Granted v7.2 Workflow System Migration
-- Adds citation banks, verification tracking, and gap closure events
-- ============================================================================

-- ============================================================================
-- CITATION VERIFICATION STATUS ENUM
-- ============================================================================

CREATE TYPE citation_verification_status AS ENUM (
  'VERIFIED',
  'VERIFIED_WITH_HISTORY',
  'VERIFIED_WEB_ONLY',
  'VERIFIED_UNPUBLISHED',
  'HOLDING_MISMATCH',
  'HOLDING_PARTIAL',
  'QUOTE_NOT_FOUND',
  'NOT_FOUND',
  'OVERRULED',
  'PENDING',
  'SKIPPED'
);

-- ============================================================================
-- CITATION BANK TYPE ENUM
-- ============================================================================

CREATE TYPE citation_bank_type AS ENUM ('CASE', 'STATUTORY');

-- ============================================================================
-- LETTER GRADE ENUM
-- ============================================================================

CREATE TYPE letter_grade AS ENUM (
  'A+', 'A', 'A-',
  'B+', 'B', 'B-',
  'C+', 'C',
  'D', 'F'
);

-- ============================================================================
-- CHECKPOINT TYPE ENUM
-- ============================================================================

CREATE TYPE checkpoint_type AS ENUM ('HOLD', 'CP1', 'CP2', 'CP3');

-- ============================================================================
-- CITATION BANKS TABLE
-- Dual bank system: Case citations and Statutory authorities
-- ============================================================================

CREATE TABLE IF NOT EXISTS citation_banks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  bank_type citation_bank_type NOT NULL,
  citations JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Ensure one bank per type per order
  UNIQUE(order_id, bank_type)
);

-- Index for fast lookups
CREATE INDEX idx_citation_banks_order_id ON citation_banks(order_id);
CREATE INDEX idx_citation_banks_type ON citation_banks(bank_type);

-- ============================================================================
-- CITATION VERIFICATIONS TABLE
-- Audit trail for 3-stage CourtListener verification
-- ============================================================================

CREATE TABLE IF NOT EXISTS citation_verifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  citation_bank_id UUID REFERENCES citation_banks(id) ON DELETE CASCADE,
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE,

  -- Citation details
  citation_text TEXT NOT NULL,
  case_name TEXT,
  reporter TEXT,
  year INTEGER,
  court TEXT,

  -- Stage 1: Existence check
  stage_1_result VARCHAR(20), -- 'found', 'not_found', 'error'
  stage_1_at TIMESTAMPTZ,

  -- Stage 2: Opinion retrieval
  stage_2_result VARCHAR(20), -- 'retrieved', 'not_retrieved', 'error'
  stage_2_at TIMESTAMPTZ,
  opinion_url TEXT,

  -- Stage 3: Holding verification (Opus)
  stage_3_result VARCHAR(20), -- 'verified', 'mismatch', 'partial', 'error'
  stage_3_at TIMESTAMPTZ,
  proposition TEXT,
  holding_analysis TEXT,

  -- Final status
  courtlistener_id VARCHAR(100),
  verification_status citation_verification_status NOT NULL DEFAULT 'PENDING',

  -- Metadata
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for verification lookups
CREATE INDEX idx_citation_verifications_bank_id ON citation_verifications(citation_bank_id);
CREATE INDEX idx_citation_verifications_order_id ON citation_verifications(order_id);
CREATE INDEX idx_citation_verifications_status ON citation_verifications(verification_status);
CREATE INDEX idx_citation_verifications_citation_text ON citation_verifications(citation_text);

-- ============================================================================
-- GAP CLOSURE EVENTS TABLE
-- Tracks when gap closure protocols are triggered and resolved
-- ============================================================================

CREATE TABLE IF NOT EXISTS gap_closure_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,

  -- Protocol info
  protocol_number INTEGER NOT NULL CHECK (protocol_number BETWEEN 1 AND 17),
  protocol_name VARCHAR(100) NOT NULL,

  -- Event details
  trigger_reason TEXT NOT NULL,
  trigger_phase VARCHAR(10),
  trigger_data JSONB,

  -- Resolution
  resolution TEXT,
  resolution_data JSONB,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES auth.users(id),

  -- Status
  is_resolved BOOLEAN NOT NULL DEFAULT FALSE,
  auto_resolved BOOLEAN NOT NULL DEFAULT FALSE,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for gap closure lookups
CREATE INDEX idx_gap_closure_events_order_id ON gap_closure_events(order_id);
CREATE INDEX idx_gap_closure_events_protocol ON gap_closure_events(protocol_number);
CREATE INDEX idx_gap_closure_events_unresolved ON gap_closure_events(order_id) WHERE NOT is_resolved;

-- ============================================================================
-- JUDGE SIMULATION RESULTS TABLE
-- Stores Phase VII grading results
-- ============================================================================

CREATE TABLE IF NOT EXISTS judge_simulation_results (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  order_workflow_id UUID REFERENCES order_workflows(id) ON DELETE CASCADE,

  -- Grade
  grade letter_grade NOT NULL,
  numeric_grade DECIMAL(3,2) NOT NULL,
  passes BOOLEAN NOT NULL,

  -- Feedback
  strengths JSONB NOT NULL DEFAULT '[]',
  weaknesses JSONB NOT NULL DEFAULT '[]',
  specific_feedback TEXT,
  revision_suggestions JSONB,

  -- Loop tracking
  loop_number INTEGER NOT NULL DEFAULT 1,

  -- AI details
  model_used VARCHAR(50),
  thinking_budget INTEGER,
  tokens_used INTEGER,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for judge simulation lookups
CREATE INDEX idx_judge_simulation_order_id ON judge_simulation_results(order_id);
CREATE INDEX idx_judge_simulation_grade ON judge_simulation_results(grade);
CREATE INDEX idx_judge_simulation_loop ON judge_simulation_results(order_id, loop_number);

-- ============================================================================
-- WORKFLOW CHECKPOINTS TABLE
-- Tracks checkpoint triggers and resolutions
-- ============================================================================

CREATE TABLE IF NOT EXISTS workflow_checkpoints (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  order_workflow_id UUID REFERENCES order_workflows(id) ON DELETE CASCADE,

  -- Checkpoint info
  checkpoint_type checkpoint_type NOT NULL,
  phase_code VARCHAR(10) NOT NULL,
  is_blocking BOOLEAN NOT NULL,

  -- Status
  triggered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  resolution VARCHAR(50), -- 'approved', 'request_changes', 'cancelled', 'customer_response'
  resolution_notes TEXT,
  resolved_by UUID REFERENCES auth.users(id),

  -- Customer response (for HOLD checkpoint)
  customer_response TEXT,
  customer_responded_at TIMESTAMPTZ
);

-- Index for checkpoint lookups
CREATE INDEX idx_workflow_checkpoints_order_id ON workflow_checkpoints(order_id);
CREATE INDEX idx_workflow_checkpoints_type ON workflow_checkpoints(checkpoint_type);
CREATE INDEX idx_workflow_checkpoints_unresolved ON workflow_checkpoints(order_id) WHERE resolved_at IS NULL;

-- ============================================================================
-- ADD NEW COLUMNS TO ORDER_WORKFLOWS
-- ============================================================================

ALTER TABLE order_workflows
ADD COLUMN IF NOT EXISTS case_bank_id UUID REFERENCES citation_banks(id),
ADD COLUMN IF NOT EXISTS statutory_bank_id UUID REFERENCES citation_banks(id),
ADD COLUMN IF NOT EXISTS hold_checkpoint_triggered BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS hold_customer_response VARCHAR(50),
ADD COLUMN IF NOT EXISTS loop_3_exit_triggered BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS current_revision_loop INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS latest_grade letter_grade,
ADD COLUMN IF NOT EXISTS extended_thinking_config JSONB,
ADD COLUMN IF NOT EXISTS phase_code VARCHAR(10);

-- ============================================================================
-- UPDATE TRIGGERS
-- ============================================================================

-- Updated timestamp trigger for citation_banks
CREATE TRIGGER update_citation_banks_timestamp
  BEFORE UPDATE ON citation_banks
  FOR EACH ROW
  EXECUTE FUNCTION update_generic_timestamp();

-- Updated timestamp trigger for citation_verifications
CREATE TRIGGER update_citation_verifications_timestamp
  BEFORE UPDATE ON citation_verifications
  FOR EACH ROW
  EXECUTE FUNCTION update_generic_timestamp();

-- ============================================================================
-- ROW LEVEL SECURITY POLICIES
-- ============================================================================

-- Enable RLS
ALTER TABLE citation_banks ENABLE ROW LEVEL SECURITY;
ALTER TABLE citation_verifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE gap_closure_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE judge_simulation_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_checkpoints ENABLE ROW LEVEL SECURITY;

-- Citation banks: Service role full access, users can view their own
CREATE POLICY "Service role full access to citation_banks"
  ON citation_banks FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Users can view their own citation_banks"
  ON citation_banks FOR SELECT
  USING (
    order_id IN (
      SELECT id FROM orders WHERE client_id = auth.uid()
    )
  );

-- Citation verifications: Service role full access
CREATE POLICY "Service role full access to citation_verifications"
  ON citation_verifications FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- Gap closure events: Service role full access
CREATE POLICY "Service role full access to gap_closure_events"
  ON gap_closure_events FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- Judge simulation results: Service role full access, users can view their own
CREATE POLICY "Service role full access to judge_simulation_results"
  ON judge_simulation_results FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Users can view their own judge_simulation_results"
  ON judge_simulation_results FOR SELECT
  USING (
    order_id IN (
      SELECT id FROM orders WHERE client_id = auth.uid()
    )
  );

-- Workflow checkpoints: Service role full access
CREATE POLICY "Service role full access to workflow_checkpoints"
  ON workflow_checkpoints FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Function to get numeric grade value
CREATE OR REPLACE FUNCTION grade_to_numeric(grade letter_grade)
RETURNS DECIMAL(3,2) AS $$
BEGIN
  RETURN CASE grade
    WHEN 'A+' THEN 4.3
    WHEN 'A' THEN 4.0
    WHEN 'A-' THEN 3.7
    WHEN 'B+' THEN 3.3
    WHEN 'B' THEN 3.0
    WHEN 'B-' THEN 2.7
    WHEN 'C+' THEN 2.3
    WHEN 'C' THEN 2.0
    WHEN 'D' THEN 1.0
    WHEN 'F' THEN 0.0
    ELSE 0.0
  END;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to check if grade passes (>= B+)
CREATE OR REPLACE FUNCTION grade_passes(grade letter_grade)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN grade_to_numeric(grade) >= 3.3;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE citation_banks IS 'Dual citation bank system for case law and statutory authorities';
COMMENT ON TABLE citation_verifications IS 'Three-stage CourtListener verification audit trail';
COMMENT ON TABLE gap_closure_events IS 'Tracking for the 17 gap closure protocols';
COMMENT ON TABLE judge_simulation_results IS 'Phase VII judge simulation grading results';
COMMENT ON TABLE workflow_checkpoints IS 'Checkpoint triggers and resolutions (HOLD, CP1-CP3)';
