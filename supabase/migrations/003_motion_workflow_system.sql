-- ============================================================================
-- Motion Granted v5.0 Workflow System
-- Complete schema for motion types, workflow phases, and citation tracking
-- ============================================================================

-- ============================================================================
-- MOTION TYPES AND TIERS
-- ============================================================================

-- Motion complexity tiers
CREATE TYPE motion_tier AS ENUM ('A', 'B', 'C');
-- Tier A: Complex strategic motions requiring extensive legal analysis
-- Tier B: Standard procedural motions with moderate complexity
-- Tier C: Routine motions with straightforward requirements

-- Workflow path types
CREATE TYPE workflow_path AS ENUM ('path_a', 'path_b');
-- Path A: Initiating Motions (offensive/proactive)
-- Path B: Opposition/Response (defensive/reactive)

-- Workflow phase status
CREATE TYPE phase_status AS ENUM (
  'pending',
  'in_progress',
  'completed',
  'blocked',
  'requires_review',
  'failed'
);

-- Citation verification status
CREATE TYPE citation_status AS ENUM (
  'pending',
  'verified',
  'invalid',
  'needs_update',
  'flagged'
);

-- Motion types table
CREATE TABLE motion_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  tier motion_tier NOT NULL,

  -- Jurisdiction applicability
  federal_applicable BOOLEAN DEFAULT true,
  state_applicable BOOLEAN DEFAULT true,

  -- Court types where this motion applies
  applicable_courts JSONB DEFAULT '[]'::jsonb,

  -- Workflow configuration
  default_path workflow_path DEFAULT 'path_a',
  supports_opposition BOOLEAN DEFAULT true,

  -- Timing requirements
  typical_turnaround_days INTEGER DEFAULT 5,
  rush_available BOOLEAN DEFAULT true,
  min_turnaround_days INTEGER DEFAULT 2,

  -- Pricing
  base_price_cents INTEGER NOT NULL,
  rush_multiplier NUMERIC(3,2) DEFAULT 1.5,
  complexity_factors JSONB DEFAULT '{}'::jsonb,

  -- Requirements
  required_documents JSONB DEFAULT '[]'::jsonb,
  required_information JSONB DEFAULT '[]'::jsonb,

  -- Output specifications
  typical_page_range JSONB DEFAULT '{"min": 5, "max": 15}'::jsonb,
  requires_exhibits BOOLEAN DEFAULT false,
  requires_proposed_order BOOLEAN DEFAULT true,
  requires_certificate_of_service BOOLEAN DEFAULT true,

  -- AI generation hints
  generation_prompts JSONB DEFAULT '{}'::jsonb,
  citation_requirements JSONB DEFAULT '{"minimum": 4, "hard_stop": true}'::jsonb,

  -- Metadata
  is_active BOOLEAN DEFAULT true,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- WORKFLOW PHASES
-- ============================================================================

-- Workflow phase definitions (templates)
CREATE TABLE workflow_phase_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_path workflow_path NOT NULL,
  phase_number INTEGER NOT NULL,
  phase_code VARCHAR(50) NOT NULL,
  phase_name VARCHAR(255) NOT NULL,
  description TEXT,

  -- Phase requirements
  required_inputs JSONB DEFAULT '[]'::jsonb,
  expected_outputs JSONB DEFAULT '[]'::jsonb,

  -- AI configuration
  ai_task_type VARCHAR(100),
  ai_prompt_template TEXT,
  ai_validation_rules JSONB DEFAULT '[]'::jsonb,

  -- Timing
  estimated_duration_minutes INTEGER DEFAULT 30,
  can_run_parallel BOOLEAN DEFAULT false,
  depends_on_phases JSONB DEFAULT '[]'::jsonb,

  -- Quality gates
  requires_human_review BOOLEAN DEFAULT false,
  auto_approve_threshold NUMERIC(3,2) DEFAULT 0.85,

  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(workflow_path, phase_number)
);

-- Order workflow instances (actual execution)
CREATE TABLE order_workflows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  motion_type_id UUID NOT NULL REFERENCES motion_types(id),
  workflow_path workflow_path NOT NULL,

  -- Current state
  current_phase INTEGER DEFAULT 1,
  status VARCHAR(50) DEFAULT 'pending',

  -- Progress tracking
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  last_activity_at TIMESTAMPTZ DEFAULT NOW(),

  -- Results
  final_document_id UUID,
  quality_score NUMERIC(3,2),
  citation_count INTEGER DEFAULT 0,

  -- Error handling
  error_count INTEGER DEFAULT 0,
  last_error TEXT,

  -- Metadata
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(order_id)
);

-- Individual phase executions
CREATE TABLE workflow_phase_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_workflow_id UUID NOT NULL REFERENCES order_workflows(id) ON DELETE CASCADE,
  phase_definition_id UUID NOT NULL REFERENCES workflow_phase_definitions(id),
  phase_number INTEGER NOT NULL,

  -- Execution state
  status phase_status DEFAULT 'pending',
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,

  -- Input/Output
  inputs JSONB DEFAULT '{}'::jsonb,
  outputs JSONB DEFAULT '{}'::jsonb,

  -- AI processing
  ai_request_id VARCHAR(255),
  ai_tokens_used INTEGER DEFAULT 0,
  ai_response JSONB,

  -- Quality metrics
  quality_score NUMERIC(3,2),
  validation_results JSONB DEFAULT '[]'::jsonb,

  -- Review
  requires_review BOOLEAN DEFAULT false,
  reviewed_by UUID REFERENCES profiles(id),
  reviewed_at TIMESTAMPTZ,
  review_notes TEXT,

  -- Error handling
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(order_workflow_id, phase_number)
);

-- ============================================================================
-- CITATION TRACKING SYSTEM
-- ============================================================================

-- Citations table
CREATE TABLE workflow_citations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_workflow_id UUID NOT NULL REFERENCES order_workflows(id) ON DELETE CASCADE,
  phase_execution_id UUID REFERENCES workflow_phase_executions(id),

  -- Citation details
  citation_text TEXT NOT NULL,
  case_name VARCHAR(500),
  case_number VARCHAR(100),
  court VARCHAR(255),
  year INTEGER,
  reporter VARCHAR(100),
  volume VARCHAR(50),
  page_start VARCHAR(50),
  page_end VARCHAR(50),

  -- Classification
  citation_type VARCHAR(50), -- 'case', 'statute', 'regulation', 'secondary'
  relevance_category VARCHAR(100), -- what the citation supports

  -- Verification
  status citation_status DEFAULT 'pending',
  verified_at TIMESTAMPTZ,
  verification_source VARCHAR(255),
  verification_notes TEXT,

  -- Quality metrics
  relevance_score NUMERIC(3,2),
  authority_level VARCHAR(50), -- 'binding', 'persuasive', 'secondary'

  -- Position in document
  document_section VARCHAR(100),
  paragraph_number INTEGER,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Citation verification log
CREATE TABLE citation_verification_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  citation_id UUID NOT NULL REFERENCES workflow_citations(id) ON DELETE CASCADE,

  verification_type VARCHAR(50) NOT NULL, -- 'automated', 'manual', 'external_api'
  status citation_status NOT NULL,

  -- Results
  found_match BOOLEAN,
  match_confidence NUMERIC(3,2),
  source_url TEXT,
  source_response JSONB,

  -- Notes
  notes TEXT,
  verified_by UUID REFERENCES profiles(id),

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- DOCUMENT PARSING
-- ============================================================================

-- Parsed document structure
CREATE TABLE parsed_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,

  -- Document classification
  document_type VARCHAR(100), -- 'complaint', 'motion', 'opposition', 'brief', etc.
  document_subtype VARCHAR(100),

  -- Parsing results
  parsed_at TIMESTAMPTZ DEFAULT NOW(),
  parser_version VARCHAR(50),

  -- Extracted content
  full_text TEXT,
  summary TEXT,
  key_facts JSONB DEFAULT '[]'::jsonb,
  legal_issues JSONB DEFAULT '[]'::jsonb,
  parties JSONB DEFAULT '[]'::jsonb,
  dates JSONB DEFAULT '[]'::jsonb,
  amounts JSONB DEFAULT '[]'::jsonb,

  -- Structure
  sections JSONB DEFAULT '[]'::jsonb,
  headings JSONB DEFAULT '[]'::jsonb,
  page_count INTEGER,
  word_count INTEGER,

  -- Extracted citations
  citations_found JSONB DEFAULT '[]'::jsonb,

  -- Quality metrics
  parse_confidence NUMERIC(3,2),
  completeness_score NUMERIC(3,2),

  -- Error handling
  parse_errors JSONB DEFAULT '[]'::jsonb,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- INDEXES
-- ============================================================================

CREATE INDEX idx_motion_types_tier ON motion_types(tier);
CREATE INDEX idx_motion_types_active ON motion_types(is_active) WHERE is_active = true;
CREATE INDEX idx_motion_types_code ON motion_types(code);

CREATE INDEX idx_workflow_phase_defs_path ON workflow_phase_definitions(workflow_path);
CREATE INDEX idx_workflow_phase_defs_number ON workflow_phase_definitions(workflow_path, phase_number);

CREATE INDEX idx_order_workflows_order ON order_workflows(order_id);
CREATE INDEX idx_order_workflows_status ON order_workflows(status);
CREATE INDEX idx_order_workflows_motion_type ON order_workflows(motion_type_id);

CREATE INDEX idx_phase_executions_workflow ON workflow_phase_executions(order_workflow_id);
CREATE INDEX idx_phase_executions_status ON workflow_phase_executions(status);
CREATE INDEX idx_phase_executions_review ON workflow_phase_executions(requires_review) WHERE requires_review = true;

CREATE INDEX idx_citations_workflow ON workflow_citations(order_workflow_id);
CREATE INDEX idx_citations_status ON workflow_citations(status);
CREATE INDEX idx_citations_type ON workflow_citations(citation_type);

CREATE INDEX idx_parsed_docs_document ON parsed_documents(document_id);
CREATE INDEX idx_parsed_docs_order ON parsed_documents(order_id);
CREATE INDEX idx_parsed_docs_type ON parsed_documents(document_type);

-- ============================================================================
-- TRIGGERS
-- ============================================================================

CREATE OR REPLACE FUNCTION update_workflow_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  NEW.last_activity_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_order_workflows_timestamp
  BEFORE UPDATE ON order_workflows
  FOR EACH ROW
  EXECUTE FUNCTION update_workflow_timestamp();

CREATE OR REPLACE FUNCTION update_generic_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_phase_executions_timestamp
  BEFORE UPDATE ON workflow_phase_executions
  FOR EACH ROW
  EXECUTE FUNCTION update_generic_timestamp();

CREATE TRIGGER update_citations_timestamp
  BEFORE UPDATE ON workflow_citations
  FOR EACH ROW
  EXECUTE FUNCTION update_generic_timestamp();

CREATE TRIGGER update_parsed_docs_timestamp
  BEFORE UPDATE ON parsed_documents
  FOR EACH ROW
  EXECUTE FUNCTION update_generic_timestamp();

CREATE TRIGGER update_motion_types_timestamp
  BEFORE UPDATE ON motion_types
  FOR EACH ROW
  EXECUTE FUNCTION update_generic_timestamp();

-- ============================================================================
-- SEED DATA: MOTION TYPES
-- ============================================================================

-- Tier A: Complex Strategic Motions
INSERT INTO motion_types (code, name, description, tier, base_price_cents, typical_turnaround_days, required_documents, generation_prompts) VALUES
('MTD_12B6', 'Motion to Dismiss (12(b)(6))', 'Motion to dismiss for failure to state a claim under FRCP 12(b)(6)', 'A', 89900, 7,
  '["complaint", "relevant_contracts", "prior_court_orders"]'::jsonb,
  '{"focus": "legal insufficiency of claims", "key_analysis": "elements of each cause of action"}'::jsonb),

('MSJ', 'Motion for Summary Judgment', 'Motion for summary judgment under FRCP 56', 'A', 149900, 10,
  '["complaint", "answer", "discovery_responses", "deposition_transcripts", "exhibits"]'::jsonb,
  '{"focus": "undisputed material facts", "key_analysis": "no genuine issue of material fact"}'::jsonb),

('MTD_12B1', 'Motion to Dismiss (Lack of Jurisdiction)', 'Motion to dismiss for lack of subject matter jurisdiction under FRCP 12(b)(1)', 'A', 79900, 7,
  '["complaint", "jurisdictional_documents"]'::jsonb,
  '{"focus": "jurisdictional defects", "key_analysis": "standing, ripeness, mootness"}'::jsonb),

('MTD_12B2', 'Motion to Dismiss (Personal Jurisdiction)', 'Motion to dismiss for lack of personal jurisdiction under FRCP 12(b)(2)', 'A', 79900, 7,
  '["complaint", "affidavits_re_contacts", "corporate_documents"]'::jsonb,
  '{"focus": "minimum contacts analysis", "key_analysis": "purposeful availment, fair play"}'::jsonb),

('MCOMPEL', 'Motion to Compel Discovery', 'Motion to compel discovery responses or deposition attendance', 'A', 69900, 5,
  '["discovery_requests", "responses_or_objections", "meet_and_confer_correspondence"]'::jsonb,
  '{"focus": "discovery obligations", "key_analysis": "relevance, proportionality, good cause"}'::jsonb),

('MSANCTIONS', 'Motion for Sanctions', 'Motion for sanctions under FRCP 11 or inherent court powers', 'A', 79900, 7,
  '["offending_pleading_or_conduct", "supporting_evidence", "fee_records"]'::jsonb,
  '{"focus": "sanctionable conduct", "key_analysis": "bad faith, frivolousness, improper purpose"}'::jsonb),

('MPRELIM', 'Motion for Preliminary Injunction', 'Motion for preliminary injunction or TRO', 'A', 119900, 5,
  '["complaint", "declarations", "evidence_of_harm", "proposed_order"]'::jsonb,
  '{"focus": "injunctive relief factors", "key_analysis": "likelihood of success, irreparable harm, balance of equities"}'::jsonb),

('MCLASS', 'Motion for Class Certification', 'Motion for class certification under FRCP 23', 'A', 179900, 14,
  '["complaint", "class_evidence", "expert_reports", "discovery_responses"]'::jsonb,
  '{"focus": "class action requirements", "key_analysis": "numerosity, commonality, typicality, adequacy"}'::jsonb),

('MREMAND', 'Motion to Remand', 'Motion to remand case to state court', 'A', 69900, 5,
  '["complaint", "removal_notice", "jurisdictional_evidence"]'::jsonb,
  '{"focus": "removal defects", "key_analysis": "federal question, diversity, timeliness, procedure"}'::jsonb);

-- Tier B: Standard Procedural Motions
INSERT INTO motion_types (code, name, description, tier, base_price_cents, typical_turnaround_days, required_documents) VALUES
('MTC', 'Motion to Continue/Postpone', 'Motion to continue trial or hearing date', 'B', 34900, 3,
  '["current_scheduling_order", "reason_documentation"]'::jsonb),

('MSTRIKE', 'Motion to Strike', 'Motion to strike pleadings or portions thereof under FRCP 12(f)', 'B', 49900, 5,
  '["target_pleading", "legal_basis"]'::jsonb),

('MAMEND', 'Motion for Leave to Amend', 'Motion for leave to amend pleading', 'B', 44900, 5,
  '["current_pleading", "proposed_amended_pleading"]'::jsonb),

('MQUASH', 'Motion to Quash Subpoena', 'Motion to quash or modify subpoena', 'B', 49900, 5,
  '["subpoena", "basis_for_objection"]'::jsonb),

('MSEAL', 'Motion to Seal', 'Motion to seal documents or proceedings', 'B', 44900, 5,
  '["documents_to_seal", "confidentiality_basis"]'::jsonb),

('MPROTECT', 'Motion for Protective Order', 'Motion for protective order regarding discovery', 'B', 54900, 5,
  '["discovery_at_issue", "harm_evidence"]'::jsonb),

('MDEFAULT', 'Motion for Default Judgment', 'Motion for entry of default judgment', 'B', 44900, 5,
  '["complaint", "proof_of_service", "clerk_default_entry", "damages_evidence"]'::jsonb),

('MVACATE', 'Motion to Vacate/Set Aside', 'Motion to vacate judgment or order under FRCP 60', 'B', 59900, 5,
  '["judgment_or_order", "grounds_documentation"]'::jsonb),

('MSTAY', 'Motion to Stay', 'Motion to stay proceedings or enforcement', 'B', 49900, 5,
  '["order_to_stay", "basis_documentation"]'::jsonb),

('MTRANSFER', 'Motion to Transfer Venue', 'Motion to transfer venue under 28 USC 1404 or 1406', 'B', 59900, 5,
  '["complaint", "venue_evidence", "convenience_factors"]'::jsonb),

('MWITHDRAW', 'Motion to Withdraw', 'Motion to withdraw as counsel', 'B', 34900, 3,
  '["engagement_letter", "withdrawal_basis"]'::jsonb),

('MRECONSIDER', 'Motion for Reconsideration', 'Motion for reconsideration of court order', 'B', 54900, 5,
  '["order_at_issue", "new_grounds"]'::jsonb),

('MLIMINE', 'Motion in Limine', 'Motion in limine to exclude evidence at trial', 'B', 49900, 5,
  '["evidence_at_issue", "exclusion_basis"]'::jsonb);

-- Tier C: Routine Motions
INSERT INTO motion_types (code, name, description, tier, base_price_cents, typical_turnaround_days, required_documents) VALUES
('MEXT', 'Motion for Extension of Time', 'Motion for extension of time to respond or comply', 'C', 24900, 2,
  '["deadline_documentation", "reason_statement"]'::jsonb),

('MSUBSTITUTE', 'Motion to Substitute Party', 'Motion to substitute party', 'C', 29900, 3,
  '["substitution_basis", "proposed_party_info"]'::jsonb),

('MCONSOLIDATE', 'Motion to Consolidate', 'Motion to consolidate cases', 'C', 34900, 3,
  '["related_case_info", "commonality_evidence"]'::jsonb),

('MINTERVENE', 'Motion to Intervene', 'Motion to intervene in action', 'C', 44900, 5,
  '["interest_documentation", "proposed_pleading"]'::jsonb),

('MBIFURCATE', 'Motion to Bifurcate', 'Motion to bifurcate trial', 'C', 34900, 3,
  '["trial_issues", "efficiency_argument"]'::jsonb),

('MPRO_HAC', 'Motion for Pro Hac Vice Admission', 'Motion for admission pro hac vice', 'C', 24900, 2,
  '["attorney_credentials", "sponsoring_counsel_info"]'::jsonb),

('MTELE', 'Motion to Appear Telephonically/Remotely', 'Motion to appear by telephone or video', 'C', 19900, 2,
  '["hearing_info", "reason_for_remote"]'::jsonb),

('MSERVE', 'Motion for Alternative Service', 'Motion for alternative method of service', 'C', 29900, 3,
  '["service_attempts", "proposed_alternative"]'::jsonb),

('MFEES', 'Motion for Attorney Fees', 'Motion for award of attorney fees', 'C', 49900, 5,
  '["fee_basis", "billing_records", "fee_agreement"]'::jsonb),

('MCOSTS', 'Motion to Tax Costs', 'Motion to tax costs', 'C', 34900, 3,
  '["bill_of_costs", "cost_documentation"]'::jsonb);

-- ============================================================================
-- SEED DATA: WORKFLOW PHASE DEFINITIONS
-- ============================================================================

-- Path A: Initiating Motions (9 Phases)
INSERT INTO workflow_phase_definitions (workflow_path, phase_number, phase_code, phase_name, description, ai_task_type, estimated_duration_minutes, required_inputs, expected_outputs) VALUES
('path_a', 1, 'PA_INTAKE', 'Document Intake & Classification', 'Parse and classify all uploaded documents, extract key information', 'document_parsing', 15,
  '["uploaded_documents"]'::jsonb,
  '["parsed_documents", "document_summary", "extracted_facts"]'::jsonb),

('path_a', 2, 'PA_ANALYSIS', 'Legal Analysis', 'Analyze legal issues, identify applicable law and standards', 'legal_analysis', 30,
  '["parsed_documents", "motion_type", "jurisdiction"]'::jsonb,
  '["legal_issues", "applicable_standards", "analysis_outline"]'::jsonb),

('path_a', 3, 'PA_RESEARCH', 'Legal Research', 'Research relevant case law, statutes, and authority', 'legal_research', 45,
  '["legal_issues", "jurisdiction", "applicable_standards"]'::jsonb,
  '["citations", "case_summaries", "authority_analysis"]'::jsonb),

('path_a', 4, 'PA_CITE_VERIFY', 'Citation Verification', 'Verify all citations for accuracy and current validity (HARD STOP: minimum 4 verified citations)', 'citation_verification', 20,
  '["citations"]'::jsonb,
  '["verified_citations", "verification_report"]'::jsonb),

('path_a', 5, 'PA_OUTLINE', 'Argument Outline', 'Create detailed outline of motion arguments and structure', 'argument_structuring', 20,
  '["legal_analysis", "verified_citations", "motion_type"]'::jsonb,
  '["argument_outline", "section_structure"]'::jsonb),

('path_a', 6, 'PA_DRAFT', 'Initial Draft Generation', 'Generate initial draft of the motion', 'document_generation', 45,
  '["argument_outline", "verified_citations", "motion_type", "jurisdiction"]'::jsonb,
  '["draft_document", "draft_exhibits"]'::jsonb),

('path_a', 7, 'PA_REVIEW', 'Quality Review', 'Review draft for quality, accuracy, and completeness', 'quality_review', 20,
  '["draft_document"]'::jsonb,
  '["review_feedback", "quality_score", "revision_suggestions"]'::jsonb),

('path_a', 8, 'PA_REVISE', 'Revision & Polish', 'Apply revisions and polish final document', 'document_revision', 30,
  '["draft_document", "review_feedback"]'::jsonb,
  '["revised_document"]'::jsonb),

('path_a', 9, 'PA_FINAL', 'Final Assembly', 'Assemble final motion package with exhibits and certificate of service', 'document_assembly', 15,
  '["revised_document", "exhibits", "motion_type"]'::jsonb,
  '["final_motion", "proposed_order", "certificate_of_service"]'::jsonb);

-- Path B: Opposition/Response Motions (9 Phases)
INSERT INTO workflow_phase_definitions (workflow_path, phase_number, phase_code, phase_name, description, ai_task_type, estimated_duration_minutes, required_inputs, expected_outputs) VALUES
('path_b', 1, 'PB_INTAKE', 'Document Intake & Classification', 'Parse opposing motion and all relevant documents', 'document_parsing', 15,
  '["opposing_motion", "supporting_documents"]'::jsonb,
  '["parsed_documents", "opponent_arguments", "opponent_citations"]'::jsonb),

('path_b', 2, 'PB_ANALYSIS', 'Opposing Argument Analysis', 'Analyze opponent arguments and identify weaknesses', 'argument_analysis', 30,
  '["parsed_documents", "opponent_arguments"]'::jsonb,
  '["argument_weaknesses", "counterargument_opportunities", "factual_disputes"]'::jsonb),

('path_b', 3, 'PB_RESEARCH', 'Counter-Research', 'Research authority to counter opposing arguments', 'legal_research', 45,
  '["argument_weaknesses", "opponent_citations", "jurisdiction"]'::jsonb,
  '["counter_citations", "distinguishing_cases", "supporting_authority"]'::jsonb),

('path_b', 4, 'PB_CITE_VERIFY', 'Citation Verification', 'Verify all citations including checking opponent citations for errors (HARD STOP: minimum 4 verified citations)', 'citation_verification', 25,
  '["counter_citations", "opponent_citations"]'::jsonb,
  '["verified_citations", "opponent_citation_errors", "verification_report"]'::jsonb),

('path_b', 5, 'PB_OUTLINE', 'Response Outline', 'Create detailed outline of response arguments', 'argument_structuring', 20,
  '["argument_weaknesses", "verified_citations", "factual_disputes"]'::jsonb,
  '["response_outline", "section_structure"]'::jsonb),

('path_b', 6, 'PB_DRAFT', 'Initial Draft Generation', 'Generate initial draft of the opposition/response', 'document_generation', 45,
  '["response_outline", "verified_citations", "opponent_arguments"]'::jsonb,
  '["draft_document", "draft_exhibits"]'::jsonb),

('path_b', 7, 'PB_REVIEW', 'Quality Review', 'Review draft for quality, accuracy, and effective rebuttal', 'quality_review', 20,
  '["draft_document", "opponent_arguments"]'::jsonb,
  '["review_feedback", "quality_score", "revision_suggestions"]'::jsonb),

('path_b', 8, 'PB_REVISE', 'Revision & Polish', 'Apply revisions and polish final document', 'document_revision', 30,
  '["draft_document", "review_feedback"]'::jsonb,
  '["revised_document"]'::jsonb),

('path_b', 9, 'PB_FINAL', 'Final Assembly', 'Assemble final opposition package with exhibits', 'document_assembly', 15,
  '["revised_document", "exhibits"]'::jsonb,
  '["final_opposition", "certificate_of_service"]'::jsonb);

-- ============================================================================
-- RLS POLICIES
-- ============================================================================

ALTER TABLE motion_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_phase_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_workflows ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_phase_executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_citations ENABLE ROW LEVEL SECURITY;
ALTER TABLE citation_verification_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE parsed_documents ENABLE ROW LEVEL SECURITY;

-- Motion types are public read
CREATE POLICY "Motion types are viewable by all authenticated users"
  ON motion_types FOR SELECT
  TO authenticated
  USING (is_active = true);

-- Workflow phase definitions are public read
CREATE POLICY "Workflow phase definitions are viewable by all authenticated users"
  ON workflow_phase_definitions FOR SELECT
  TO authenticated
  USING (true);

-- Order workflows - clients can view their own, admins can view all
CREATE POLICY "Users can view own order workflows"
  ON order_workflows FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM orders o
      WHERE o.id = order_workflows.order_id
      AND (o.client_id = auth.uid() OR EXISTS (
        SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'clerk')
      ))
    )
  );

CREATE POLICY "Admins can manage order workflows"
  ON order_workflows FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'clerk'))
  );

-- Similar policies for phase executions, citations, parsed docs
CREATE POLICY "Users can view own phase executions"
  ON workflow_phase_executions FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM order_workflows ow
      JOIN orders o ON o.id = ow.order_id
      WHERE ow.id = workflow_phase_executions.order_workflow_id
      AND (o.client_id = auth.uid() OR EXISTS (
        SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'clerk')
      ))
    )
  );

CREATE POLICY "Admins can manage phase executions"
  ON workflow_phase_executions FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'clerk'))
  );

CREATE POLICY "Users can view own citations"
  ON workflow_citations FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM order_workflows ow
      JOIN orders o ON o.id = ow.order_id
      WHERE ow.id = workflow_citations.order_workflow_id
      AND (o.client_id = auth.uid() OR EXISTS (
        SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'clerk')
      ))
    )
  );

CREATE POLICY "Admins can manage citations"
  ON workflow_citations FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'clerk'))
  );

CREATE POLICY "Users can view own parsed documents"
  ON parsed_documents FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM orders o
      WHERE o.id = parsed_documents.order_id
      AND (o.client_id = auth.uid() OR EXISTS (
        SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'clerk')
      ))
    )
  );

CREATE POLICY "Admins can manage parsed documents"
  ON parsed_documents FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'clerk'))
  );

CREATE POLICY "Admins can manage citation verification log"
  ON citation_verification_log FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'clerk'))
  );

-- Admins can manage motion types
CREATE POLICY "Admins can manage motion types"
  ON motion_types FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );
