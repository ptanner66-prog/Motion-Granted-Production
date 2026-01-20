-- Migration: Update phase definitions to v6.3 (12 phases)
-- Date: January 2026
-- Description: Update from 9-phase to 12-phase workflow with checkpoints

-- ============================================================================
-- STEP 1: Add new columns to workflow_phase_definitions
-- ============================================================================

ALTER TABLE workflow_phase_definitions
ADD COLUMN IF NOT EXISTS is_checkpoint BOOLEAN DEFAULT FALSE;

ALTER TABLE workflow_phase_definitions
ADD COLUMN IF NOT EXISTS checkpoint_type TEXT
CHECK (checkpoint_type IN ('CP1', 'CP2', 'CP3'));

ALTER TABLE workflow_phase_definitions
ADD COLUMN IF NOT EXISTS phase_code TEXT;

-- ============================================================================
-- STEP 2: Archive existing definitions (don't delete, version instead)
-- ============================================================================

-- Add version column if not exists
ALTER TABLE workflow_phase_definitions
ADD COLUMN IF NOT EXISTS version TEXT DEFAULT 'v6.2';

-- Mark existing as v6.2
UPDATE workflow_phase_definitions
SET version = 'v6.2'
WHERE version IS NULL OR version = 'v6.2';

-- ============================================================================
-- STEP 3: Insert v6.3 Phase Definitions for Path A (Filing Motion)
-- ============================================================================

INSERT INTO workflow_phase_definitions
(workflow_path, phase_number, phase_name, phase_code, description, ai_task_type,
 estimated_duration_minutes, requires_review, is_checkpoint, checkpoint_type, version)
VALUES
-- Phase 1: Intake
('path_a', 1, 'Intake & Document Processing', 'INTAKE',
 'Parse uploaded documents, extract case information, classify motion tier, validate jurisdiction',
 'document_parsing', 15, FALSE, FALSE, NULL, 'v6.3'),

-- Phase 2: Legal Standards
('path_a', 2, 'Legal Standard Identification', 'LEGAL_STANDARDS',
 'Identify applicable legal standards, elements, and burdens for the motion type',
 'legal_analysis', 30, FALSE, FALSE, NULL, 'v6.3'),

-- Phase 3: Evidence Mapping (NEW in v6.3)
('path_a', 3, 'Evidence Mapping', 'EVIDENCE_MAPPING',
 'Map available evidence to legal elements, identify evidentiary gaps, flag authentication issues',
 'evidence_analysis', 25, FALSE, FALSE, NULL, 'v6.3'),

-- Phase 4: Authority Research → CP1
('path_a', 4, 'Authority Research', 'AUTHORITY_RESEARCH',
 'Research and gather legal authorities supporting each element. CHECKPOINT 1 triggers after completion.',
 'legal_research', 45, FALSE, TRUE, 'CP1', 'v6.3'),

-- Phase 5: Draft Motion
('path_a', 5, 'Draft Motion', 'DRAFT_MOTION',
 'Generate complete motion draft using SUPERPROMPT system. Incorporates all previous phase outputs.',
 'document_generation', 60, FALSE, FALSE, NULL, 'v6.3'),

-- Phase 6: Citation Verification (4-citation batching)
('path_a', 6, 'Citation Accuracy Check', 'CITATION_CHECK',
 'Verify all citations in draft using 4-citation batch rule. Creates incremental handoff every 4 citations.',
 'citation_verification', 30, FALSE, FALSE, NULL, 'v6.3'),

-- Phase 7: Opposition Anticipation (NEW in v6.3)
('path_a', 7, 'Opposition Anticipation', 'OPPOSITION_ANTICIPATION',
 'Analyze likely opposing arguments and prepare strategic responses. Identifies weaknesses to address.',
 'argument_analysis', 30, FALSE, FALSE, NULL, 'v6.3'),

-- Phase 8: Judge Simulation → CP2
('path_a', 8, 'Judge Simulation', 'JUDGE_SIMULATION',
 'Evaluate motion from judicial perspective. Requires B+ (87%) minimum to pass. CHECKPOINT 2 triggers.',
 'quality_review', 20, TRUE, TRUE, 'CP2', 'v6.3'),

-- Phase 9: Revisions
('path_a', 9, 'Revisions', 'REVISIONS',
 'Apply revisions based on judge simulation or customer feedback. Max 3 loops before escalation.',
 'document_revision', 45, FALSE, FALSE, NULL, 'v6.3'),

-- Phase 10: Caption Validation (NEW in v6.3)
('path_a', 10, 'Caption Validation', 'CAPTION_VALIDATION',
 'Verify caption consistency across all documents, check for placeholders, validate party names.',
 'validation', 10, FALSE, FALSE, NULL, 'v6.3'),

-- Phase 11: Supporting Documents (Expanded in v6.3)
('path_a', 11, 'Supporting Documents', 'SUPPORTING_DOCS',
 'Generate declarations, proposed order, proof of service, separate statements (if MSJ), exhibits list.',
 'document_generation', 30, FALSE, FALSE, NULL, 'v6.3'),

-- Phase 12: Final Assembly → CP3
('path_a', 12, 'Final Assembly', 'FINAL_ASSEMBLY',
 'Assemble complete filing package for delivery. CHECKPOINT 3 triggers for customer confirmation.',
 'document_assembly', 15, TRUE, TRUE, 'CP3', 'v6.3')

ON CONFLICT (workflow_path, phase_number)
WHERE version = 'v6.3'
DO UPDATE SET
  phase_name = EXCLUDED.phase_name,
  phase_code = EXCLUDED.phase_code,
  description = EXCLUDED.description,
  ai_task_type = EXCLUDED.ai_task_type,
  estimated_duration_minutes = EXCLUDED.estimated_duration_minutes,
  requires_review = EXCLUDED.requires_review,
  is_checkpoint = EXCLUDED.is_checkpoint,
  checkpoint_type = EXCLUDED.checkpoint_type;

-- ============================================================================
-- STEP 4: Insert v6.3 Phase Definitions for Path B (Opposition/Response)
-- ============================================================================

INSERT INTO workflow_phase_definitions
(workflow_path, phase_number, phase_name, phase_code, description, ai_task_type,
 estimated_duration_minutes, requires_review, is_checkpoint, checkpoint_type, version)
VALUES
-- Phase 1: Intake & Deconstruction
('path_b', 1, 'Intake & Motion Deconstruction', 'INTAKE',
 'Parse opponent motion, extract their arguments and citations, classify response requirements',
 'document_parsing', 20, FALSE, FALSE, NULL, 'v6.3'),

-- Phase 2: Motion Analysis
('path_b', 2, 'Motion Deconstruction', 'MOTION_DECONSTRUCTION',
 'Deep analysis of opponent arguments, identify logical flaws, misapplied law, factual errors',
 'legal_analysis', 35, FALSE, FALSE, NULL, 'v6.3'),

-- Phase 3: Issue Identification
('path_b', 3, 'Issue Identification', 'ISSUE_IDENTIFICATION',
 'Identify genuine disputes of material fact (for MSJ), legal issues to challenge',
 'evidence_analysis', 25, FALSE, FALSE, NULL, 'v6.3'),

-- Phase 4: Counter-Research → CP1
('path_b', 4, 'Counter-Authority Research', 'COUNTER_RESEARCH',
 'Research authorities to counter opponent, distinguish their cases, find better precedent. CHECKPOINT 1.',
 'legal_research', 50, FALSE, TRUE, 'CP1', 'v6.3'),

-- Phase 5: Draft Opposition
('path_b', 5, 'Draft Opposition', 'DRAFT_OPPOSITION',
 'Generate complete opposition using SUPERPROMPT system with counter-argument framework',
 'document_generation', 60, FALSE, FALSE, NULL, 'v6.3'),

-- Phase 6: Citation Check
('path_b', 6, 'Citation Accuracy Check', 'CITATION_CHECK',
 'Verify all citations using 4-citation batch rule. Verify opponent citations for accuracy too.',
 'citation_verification', 30, FALSE, FALSE, NULL, 'v6.3'),

-- Phase 7: Reply Anticipation
('path_b', 7, 'Reply Anticipation', 'REPLY_ANTICIPATION',
 'Anticipate opponent reply arguments, prepare preemptive responses in opposition',
 'argument_analysis', 30, FALSE, FALSE, NULL, 'v6.3'),

-- Phase 8: Judge Simulation → CP2
('path_b', 8, 'Judge Simulation', 'JUDGE_SIMULATION',
 'Evaluate opposition from judicial perspective. Requires B+ (87%) minimum. CHECKPOINT 2.',
 'quality_review', 20, TRUE, TRUE, 'CP2', 'v6.3'),

-- Phase 9: Revisions
('path_b', 9, 'Revisions', 'REVISIONS',
 'Apply revisions based on simulation or customer feedback. Max 3 loops before escalation.',
 'document_revision', 45, FALSE, FALSE, NULL, 'v6.3'),

-- Phase 10: Caption Validation
('path_b', 10, 'Caption Validation', 'CAPTION_VALIDATION',
 'Verify caption consistency, check response caption matches motion caption exactly',
 'validation', 10, FALSE, FALSE, NULL, 'v6.3'),

-- Phase 11: Supporting Documents
('path_b', 11, 'Supporting Documents', 'SUPPORTING_DOCS',
 'Generate statement of genuine disputes (MSJ opp), evidentiary objections, declarations',
 'document_generation', 35, FALSE, FALSE, NULL, 'v6.3'),

-- Phase 12: Final Assembly → CP3
('path_b', 12, 'Final Assembly', 'FINAL_ASSEMBLY',
 'Assemble complete response package for delivery. CHECKPOINT 3.',
 'document_assembly', 15, TRUE, TRUE, 'CP3', 'v6.3')

ON CONFLICT (workflow_path, phase_number)
WHERE version = 'v6.3'
DO UPDATE SET
  phase_name = EXCLUDED.phase_name,
  phase_code = EXCLUDED.phase_code,
  description = EXCLUDED.description,
  ai_task_type = EXCLUDED.ai_task_type,
  estimated_duration_minutes = EXCLUDED.estimated_duration_minutes,
  requires_review = EXCLUDED.requires_review,
  is_checkpoint = EXCLUDED.is_checkpoint,
  checkpoint_type = EXCLUDED.checkpoint_type;

-- ============================================================================
-- STEP 5: Create index for phase lookups
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_phase_definitions_checkpoint
ON workflow_phase_definitions(is_checkpoint, checkpoint_type)
WHERE is_checkpoint = TRUE;

CREATE INDEX IF NOT EXISTS idx_phase_definitions_version
ON workflow_phase_definitions(version);

CREATE INDEX IF NOT EXISTS idx_phase_definitions_code
ON workflow_phase_definitions(phase_code);

-- ============================================================================
-- STEP 6: Add comments
-- ============================================================================

COMMENT ON COLUMN workflow_phase_definitions.phase_code IS 'v6.3: Unique code for phase type (INTAKE, LEGAL_STANDARDS, etc.)';
COMMENT ON COLUMN workflow_phase_definitions.is_checkpoint IS 'v6.3: True if this phase triggers a customer checkpoint';
COMMENT ON COLUMN workflow_phase_definitions.checkpoint_type IS 'v6.3: Which checkpoint (CP1, CP2, CP3) this phase triggers';
COMMENT ON COLUMN workflow_phase_definitions.version IS 'Workflow version (v6.2 = 9 phases, v6.3 = 12 phases)';
