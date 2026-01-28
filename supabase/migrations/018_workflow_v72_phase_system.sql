-- ============================================
-- Motion Granted v7.2 Workflow Phase System
-- Migration: 018_workflow_v72_phase_system.sql
--
-- Creates tables for:
-- - phase_prompts: Stores the 14 phase system prompts
-- - phase_executions: Logs every phase execution for audit/recovery
-- - citation_banks: Dual bank system (Case + Statutory)
-- - citation_verifications: 3-stage verification audit trail
-- - workflow_state: Tracks current workflow position and state
-- ============================================

-- ============================================
-- PHASE PROMPTS TABLE
-- Stores the 14 phase system prompts
-- ============================================
CREATE TABLE IF NOT EXISTS phase_prompts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phase VARCHAR(10) NOT NULL UNIQUE,
  phase_name VARCHAR(100) NOT NULL,
  phase_order INT NOT NULL,
  prompt_content TEXT NOT NULL,

  -- Model configuration per tier
  model_tier_a VARCHAR(50) NOT NULL DEFAULT 'claude-sonnet-4-5-20250929',
  model_tier_b VARCHAR(50) NOT NULL DEFAULT 'claude-sonnet-4-5-20250929',
  model_tier_c VARCHAR(50) NOT NULL DEFAULT 'claude-sonnet-4-5-20250929',

  -- Extended thinking per tier (JSONB format: {"enabled": bool, "budget": number})
  extended_thinking_tier_a JSONB DEFAULT '{"enabled": false, "budget": 0}',
  extended_thinking_tier_b JSONB DEFAULT '{"enabled": false, "budget": 0}',
  extended_thinking_tier_c JSONB DEFAULT '{"enabled": false, "budget": 0}',

  -- Checkpoint config
  checkpoint_type VARCHAR(20) DEFAULT NULL,
  checkpoint_blocking BOOLEAN DEFAULT FALSE,

  -- Flow control
  next_phase VARCHAR(10) DEFAULT NULL,

  -- Metadata
  version VARCHAR(20) DEFAULT '7.2.1',
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for active prompts lookup
CREATE INDEX IF NOT EXISTS idx_phase_prompts_active ON phase_prompts(is_active, phase);

-- ============================================
-- PHASE EXECUTIONS TABLE
-- Logs every phase execution for audit/recovery
-- ============================================
CREATE TABLE IF NOT EXISTS phase_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  workflow_id UUID NOT NULL,
  phase VARCHAR(10) NOT NULL,

  -- Execution details
  model_used VARCHAR(50) NOT NULL,
  extended_thinking_used BOOLEAN DEFAULT FALSE,
  extended_thinking_budget INT DEFAULT 0,

  -- Input/Output
  input_data JSONB NOT NULL,
  output_data JSONB,

  -- Status: PENDING, RUNNING, COMPLETE, ERROR
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  error_message TEXT,

  -- Metrics
  input_tokens INT,
  output_tokens INT,
  duration_ms INT,
  cost_cents DECIMAL(10,2),

  -- Timestamps
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_phase_executions_order ON phase_executions(order_id);
CREATE INDEX IF NOT EXISTS idx_phase_executions_workflow ON phase_executions(workflow_id);
CREATE INDEX IF NOT EXISTS idx_phase_executions_status ON phase_executions(status);

-- ============================================
-- CITATION BANKS TABLE
-- Dual bank system: Case + Statutory
-- ============================================
CREATE TABLE IF NOT EXISTS citation_banks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  bank_type VARCHAR(20) NOT NULL CHECK (bank_type IN ('CASE', 'STATUTORY')),
  citations JSONB NOT NULL DEFAULT '[]',

  -- Stats
  total_citations INT DEFAULT 0,
  verified_count INT DEFAULT 0,
  failed_count INT DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Ensure one bank per type per order
  UNIQUE(order_id, bank_type)
);

CREATE INDEX IF NOT EXISTS idx_citation_banks_order ON citation_banks(order_id);

-- ============================================
-- CITATION VERIFICATIONS TABLE
-- 3-stage verification audit trail
-- ============================================
CREATE TABLE IF NOT EXISTS citation_verifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  citation_bank_id UUID REFERENCES citation_banks(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,

  -- Citation info
  citation_text TEXT NOT NULL,
  case_name VARCHAR(500),
  full_citation VARCHAR(500),

  -- 3-stage verification results
  stage_1_existence VARCHAR(20), -- 'found', 'not_found', 'error'
  stage_1_courtlistener_id VARCHAR(100),
  stage_2_opinion_retrieved BOOLEAN DEFAULT FALSE,
  stage_2_opinion_text TEXT,
  stage_3_holding_verified VARCHAR(20), -- 'verified', 'mismatch', 'partial', 'error'

  -- Final status: VERIFIED, NOT_FOUND, HOLDING_MISMATCH, QUOTE_NOT_FOUND, etc.
  verification_status VARCHAR(30) NOT NULL,

  -- Metadata
  verified_at TIMESTAMPTZ,
  notes TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_citation_verifications_order ON citation_verifications(order_id);
CREATE INDEX IF NOT EXISTS idx_citation_verifications_bank ON citation_verifications(citation_bank_id);
CREATE INDEX IF NOT EXISTS idx_citation_verifications_status ON citation_verifications(verification_status);

-- ============================================
-- WORKFLOW STATE TABLE
-- Tracks current workflow position and state
-- ============================================
CREATE TABLE IF NOT EXISTS workflow_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE,

  -- Current position
  current_phase VARCHAR(10) NOT NULL DEFAULT 'I',
  phase_status VARCHAR(20) NOT NULL DEFAULT 'PENDING',

  -- Determinations from Phase I
  tier VARCHAR(1), -- 'A', 'B', 'C'
  path VARCHAR(1), -- 'A' (initiating), 'B' (opposition)

  -- Revision loop tracking (Phase VII/VIII cycle)
  revision_loop_count INT DEFAULT 0,
  revision_grades JSONB DEFAULT '[]', -- Array of grade objects from each loop

  -- Checkpoint state
  checkpoint_pending BOOLEAN DEFAULT FALSE,
  checkpoint_type VARCHAR(20), -- 'HOLD', 'NOTIFICATION', 'BLOCKING'
  checkpoint_data JSONB,

  -- Hold state (Protocol 8)
  hold_triggered BOOLEAN DEFAULT FALSE,
  hold_reason TEXT,
  hold_customer_response VARCHAR(50), -- 'PROVIDE_ADDITIONAL_EVIDENCE', 'PROCEED_WITH_ACKNOWLEDGMENT', 'TERMINATE'

  -- Protocol 10 (Loop 3 Exit)
  loop_3_exit_triggered BOOLEAN DEFAULT FALSE,

  -- Phase outputs (for passing between phases)
  phase_outputs JSONB DEFAULT '{}',

  -- Timestamps
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_workflow_state_order ON workflow_state(order_id);
CREATE INDEX IF NOT EXISTS idx_workflow_state_phase ON workflow_state(current_phase);
CREATE INDEX IF NOT EXISTS idx_workflow_state_checkpoint ON workflow_state(checkpoint_pending) WHERE checkpoint_pending = TRUE;

-- ============================================
-- WORKFLOW NOTIFICATIONS TABLE
-- For non-blocking checkpoint notifications
-- ============================================
CREATE TABLE IF NOT EXISTS workflow_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  workflow_id UUID NOT NULL,
  phase VARCHAR(10) NOT NULL,
  notification_type VARCHAR(30) NOT NULL,
  message TEXT,
  data JSONB,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_workflow_notifications_order ON workflow_notifications(order_id);
CREATE INDEX IF NOT EXISTS idx_workflow_notifications_unread ON workflow_notifications(read_at) WHERE read_at IS NULL;

-- ============================================
-- JUDGE SIMULATION RESULTS TABLE
-- Stores detailed grading from Phase VII
-- ============================================
CREATE TABLE IF NOT EXISTS judge_simulation_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL,
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,

  -- Grade
  grade VARCHAR(2) NOT NULL, -- 'A+', 'A', 'A-', 'B+', etc.
  numeric_grade DECIMAL(3,2) NOT NULL, -- 4.3, 4.0, 3.7, 3.3, etc.
  passes BOOLEAN NOT NULL,

  -- Feedback
  strengths JSONB DEFAULT '[]',
  weaknesses JSONB DEFAULT '[]',
  specific_feedback TEXT,
  revision_suggestions JSONB DEFAULT '[]',

  -- Loop tracking
  loop_number INT NOT NULL DEFAULT 1,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_judge_simulation_workflow ON judge_simulation_results(workflow_id);
CREATE INDEX IF NOT EXISTS idx_judge_simulation_order ON judge_simulation_results(order_id);

-- ============================================
-- HELPER FUNCTION: Update timestamp trigger
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply update trigger to relevant tables
DROP TRIGGER IF EXISTS update_phase_prompts_updated_at ON phase_prompts;
CREATE TRIGGER update_phase_prompts_updated_at
  BEFORE UPDATE ON phase_prompts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_citation_banks_updated_at ON citation_banks;
CREATE TRIGGER update_citation_banks_updated_at
  BEFORE UPDATE ON citation_banks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_workflow_state_updated_at ON workflow_state;
CREATE TRIGGER update_workflow_state_updated_at
  BEFORE UPDATE ON workflow_state
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

-- Enable RLS on all new tables
ALTER TABLE phase_prompts ENABLE ROW LEVEL SECURITY;
ALTER TABLE phase_executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE citation_banks ENABLE ROW LEVEL SECURITY;
ALTER TABLE citation_verifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE judge_simulation_results ENABLE ROW LEVEL SECURITY;

-- Phase prompts: Service role only (read for all authenticated)
CREATE POLICY "Phase prompts are viewable by authenticated users"
  ON phase_prompts FOR SELECT
  TO authenticated
  USING (is_active = TRUE);

-- Phase executions: Service role only for writes, viewable by order owner and admin
CREATE POLICY "Phase executions viewable by order owner"
  ON phase_executions FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM orders o
      WHERE o.id = phase_executions.order_id
      AND (
        o.client_id = auth.uid()
        OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'clerk'))
      )
    )
  );

-- Citation banks: Viewable by order owner and admin
CREATE POLICY "Citation banks viewable by order owner"
  ON citation_banks FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM orders o
      WHERE o.id = citation_banks.order_id
      AND (
        o.client_id = auth.uid()
        OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'clerk'))
      )
    )
  );

-- Citation verifications: Viewable by order owner and admin
CREATE POLICY "Citation verifications viewable by order owner"
  ON citation_verifications FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM orders o
      WHERE o.id = citation_verifications.order_id
      AND (
        o.client_id = auth.uid()
        OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'clerk'))
      )
    )
  );

-- Workflow state: Viewable by order owner and admin
CREATE POLICY "Workflow state viewable by order owner"
  ON workflow_state FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM orders o
      WHERE o.id = workflow_state.order_id
      AND (
        o.client_id = auth.uid()
        OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'clerk'))
      )
    )
  );

-- Workflow notifications: Viewable by order owner and admin
CREATE POLICY "Workflow notifications viewable by order owner"
  ON workflow_notifications FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM orders o
      WHERE o.id = workflow_notifications.order_id
      AND (
        o.client_id = auth.uid()
        OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'clerk'))
      )
    )
  );

-- Judge simulation results: Viewable by order owner and admin
CREATE POLICY "Judge simulation results viewable by order owner"
  ON judge_simulation_results FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM orders o
      WHERE o.id = judge_simulation_results.order_id
      AND (
        o.client_id = auth.uid()
        OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'clerk'))
      )
    )
  );

-- Service role bypass for all tables (needed for server-side operations)
CREATE POLICY "Service role full access to phase_prompts"
  ON phase_prompts FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role full access to phase_executions"
  ON phase_executions FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role full access to citation_banks"
  ON citation_banks FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role full access to citation_verifications"
  ON citation_verifications FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role full access to workflow_state"
  ON workflow_state FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role full access to workflow_notifications"
  ON workflow_notifications FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role full access to judge_simulation_results"
  ON judge_simulation_results FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================
-- END OF MIGRATION
-- ============================================
