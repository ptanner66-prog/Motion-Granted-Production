/**
 * Motion Granted v5.0 Workflow Types
 * Complete type definitions for motion types, workflow phases, and citations
 */

// ============================================================================
// ENUMS
// ============================================================================

export type MotionTier = 'A' | 'B' | 'C';

export type WorkflowPath = 'path_a' | 'path_b';

export type PhaseStatus =
  | 'pending'
  | 'in_progress'
  | 'completed'
  | 'blocked'
  | 'requires_review'
  | 'failed';

export type CitationStatus =
  | 'pending'
  | 'verified'
  | 'invalid'
  | 'needs_update'
  | 'flagged';

export type CitationType = 'case' | 'statute' | 'regulation' | 'secondary';

export type AuthorityLevel = 'binding' | 'persuasive' | 'secondary';

export type AITaskType =
  | 'document_parsing'
  | 'legal_analysis'
  | 'legal_research'
  | 'citation_verification'
  | 'argument_structuring'
  | 'document_generation'
  | 'quality_review'
  | 'document_revision'
  | 'document_assembly'
  | 'argument_analysis';

// ============================================================================
// MOTION TYPES
// ============================================================================

export interface MotionType {
  id: string;
  code: string;
  name: string;
  description: string | null;
  tier: MotionTier;

  // Jurisdiction
  federal_applicable: boolean;
  state_applicable: boolean;
  applicable_courts: string[];

  // Workflow
  default_path: WorkflowPath;
  supports_opposition: boolean;

  // Timing
  typical_turnaround_days: number;
  rush_available: boolean;
  min_turnaround_days: number;

  // Pricing
  base_price_cents: number;
  rush_multiplier: number;
  complexity_factors: Record<string, number>;

  // Requirements
  required_documents: string[];
  required_information: string[];

  // Output specs
  typical_page_range: { min: number; max: number };
  requires_exhibits: boolean;
  requires_proposed_order: boolean;
  requires_certificate_of_service: boolean;

  // AI
  generation_prompts: Record<string, string>;
  citation_requirements: {
    minimum: number;
    hard_stop: boolean;
  };

  // Metadata
  is_active: boolean;
  display_order: number;
  created_at: string;
  updated_at: string;
}

export interface MotionTypeListItem {
  id: string;
  code: string;
  name: string;
  tier: MotionTier;
  base_price_cents: number;
  typical_turnaround_days: number;
  rush_available: boolean;
  description: string | null;
}

// ============================================================================
// WORKFLOW PHASES
// ============================================================================

export interface WorkflowPhaseDefinition {
  id: string;
  workflow_path: WorkflowPath;
  phase_number: number;
  phase_code: string;
  phase_name: string;
  description: string | null;

  // Requirements
  required_inputs: string[];
  expected_outputs: string[];

  // AI
  ai_task_type: AITaskType | null;
  ai_prompt_template: string | null;
  ai_validation_rules: ValidationRule[];

  // Timing
  estimated_duration_minutes: number;
  can_run_parallel: boolean;
  depends_on_phases: number[];

  // Quality
  requires_human_review: boolean;
  auto_approve_threshold: number;

  created_at: string;
}

export interface ValidationRule {
  type: string;
  field: string;
  condition: string;
  message: string;
}

// ============================================================================
// ORDER WORKFLOW
// ============================================================================

export interface OrderWorkflow {
  id: string;
  order_id: string;
  motion_type_id: string;
  workflow_path: WorkflowPath;

  // State
  current_phase: number;
  status: string;

  // Progress
  started_at: string | null;
  completed_at: string | null;
  last_activity_at: string;

  // Results
  final_document_id: string | null;
  quality_score: number | null;
  citation_count: number;

  // Errors
  error_count: number;
  last_error: string | null;

  // Metadata
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;

  // Joined data
  motion_type?: MotionType;
  phases?: WorkflowPhaseExecution[];
}

export interface WorkflowPhaseExecution {
  id: string;
  order_workflow_id: string;
  phase_definition_id: string;
  phase_number: number;

  // State
  status: PhaseStatus;
  started_at: string | null;
  completed_at: string | null;

  // I/O
  inputs: Record<string, unknown>;
  outputs: Record<string, unknown>;

  // AI
  ai_request_id: string | null;
  ai_tokens_used: number;
  ai_response: Record<string, unknown> | null;

  // Quality
  quality_score: number | null;
  validation_results: ValidationResult[];

  // Review
  requires_review: boolean;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_notes: string | null;

  // Errors
  error_message: string | null;
  retry_count: number;

  created_at: string;
  updated_at: string;

  // Joined data
  phase_definition?: WorkflowPhaseDefinition;
}

export interface ValidationResult {
  rule: string;
  passed: boolean;
  message: string;
  details?: Record<string, unknown>;
}

// ============================================================================
// CITATIONS
// ============================================================================

export interface WorkflowCitation {
  id: string;
  order_workflow_id: string;
  phase_execution_id: string | null;

  // Citation details
  citation_text: string;
  case_name: string | null;
  case_number: string | null;
  court: string | null;
  year: number | null;
  reporter: string | null;
  volume: string | null;
  page_start: string | null;
  page_end: string | null;

  // Classification
  citation_type: CitationType | null;
  relevance_category: string | null;

  // Verification
  status: CitationStatus;
  verified_at: string | null;
  verification_source: string | null;
  verification_notes: string | null;

  // Quality
  relevance_score: number | null;
  authority_level: AuthorityLevel | null;

  // Position
  document_section: string | null;
  paragraph_number: number | null;

  created_at: string;
  updated_at: string;
}

export interface CitationVerificationLog {
  id: string;
  citation_id: string;
  verification_type: 'automated' | 'manual' | 'external_api';
  status: CitationStatus;

  found_match: boolean | null;
  match_confidence: number | null;
  source_url: string | null;
  source_response: Record<string, unknown> | null;

  notes: string | null;
  verified_by: string | null;
  created_at: string;
}

// ============================================================================
// DOCUMENT PARSING
// ============================================================================

export interface ParsedDocument {
  id: string;
  document_id: string;
  order_id: string;

  // Classification
  document_type: string | null;
  document_subtype: string | null;

  // Parsing
  parsed_at: string;
  parser_version: string | null;

  // Content
  full_text: string | null;
  summary: string | null;
  key_facts: KeyFact[];
  legal_issues: LegalIssue[];
  parties: Party[];
  dates: ExtractedDate[];
  amounts: ExtractedAmount[];

  // Structure
  sections: DocumentSection[];
  headings: string[];
  page_count: number | null;
  word_count: number | null;

  // Citations
  citations_found: ExtractedCitation[];

  // Quality
  parse_confidence: number | null;
  completeness_score: number | null;

  // Errors
  parse_errors: ParseError[];

  created_at: string;
  updated_at: string;
}

export interface KeyFact {
  fact: string;
  source_page?: number;
  importance: 'high' | 'medium' | 'low';
  category?: string;
}

export interface LegalIssue {
  issue: string;
  elements?: string[];
  applicable_law?: string[];
  relevance: string;
}

export interface Party {
  name: string;
  role: string;
  type?: 'individual' | 'corporation' | 'government' | 'other';
}

export interface ExtractedDate {
  date: string;
  context: string;
  type?: 'filing' | 'deadline' | 'event' | 'other';
}

export interface ExtractedAmount {
  amount: number;
  currency: string;
  context: string;
  type?: 'damages' | 'fee' | 'settlement' | 'other';
}

export interface DocumentSection {
  title: string;
  start_page?: number;
  content_summary?: string;
}

export interface ExtractedCitation {
  text: string;
  type: CitationType;
  page?: number;
}

export interface ParseError {
  type: string;
  message: string;
  page?: number;
  recoverable: boolean;
}

// ============================================================================
// WORKFLOW OPERATIONS
// ============================================================================

export interface StartWorkflowRequest {
  orderId: string;
  motionTypeId: string;
  workflowPath: WorkflowPath;
  metadata?: Record<string, unknown>;
}

export interface StartWorkflowResponse {
  success: boolean;
  workflowId?: string;
  error?: string;
}

export interface AdvancePhaseRequest {
  workflowId: string;
  fromPhase: number;
  toPhase: number;
  outputs?: Record<string, unknown>;
}

export interface PhaseResult {
  success: boolean;
  phaseNumber: number;
  status: PhaseStatus;
  outputs: Record<string, unknown>;
  qualityScore?: number;
  requiresReview: boolean;
  error?: string;
}

export interface CitationVerificationResult {
  citationId: string;
  status: CitationStatus;
  verified: boolean;
  confidence: number;
  source?: string;
  notes?: string;
}

export interface WorkflowProgress {
  workflowId: string;
  orderId: string;
  totalPhases: number;
  completedPhases: number;
  currentPhase: number;
  currentPhaseName: string;
  currentPhaseStatus: PhaseStatus;
  overallProgress: number; // percentage
  estimatedRemainingMinutes: number;
  citationCount: number;
  qualityScore?: number;
}

// ============================================================================
// CITATION HARD STOP
// ============================================================================

export const CITATION_HARD_STOP_MINIMUM = 4;

export interface CitationRequirement {
  minimum: number;
  hardStop: boolean;
  currentCount: number;
  verifiedCount: number;
  meetsRequirement: boolean;
  blockedReason?: string;
}

export function checkCitationRequirement(
  citations: WorkflowCitation[],
  minimum: number = CITATION_HARD_STOP_MINIMUM
): CitationRequirement {
  const verifiedCitations = citations.filter(c => c.status === 'verified');
  const meetsRequirement = verifiedCitations.length >= minimum;

  return {
    minimum,
    hardStop: true,
    currentCount: citations.length,
    verifiedCount: verifiedCitations.length,
    meetsRequirement,
    blockedReason: meetsRequirement
      ? undefined
      : `HARD STOP: Only ${verifiedCitations.length} verified citations. Minimum ${minimum} required.`,
  };
}

// ============================================================================
// TIER DESCRIPTIONS
// ============================================================================

export const TIER_DESCRIPTIONS: Record<MotionTier, { name: string; description: string }> = {
  A: {
    name: 'Complex Strategic',
    description: 'Complex strategic motions requiring extensive legal analysis and research',
  },
  B: {
    name: 'Standard Procedural',
    description: 'Standard procedural motions with moderate complexity',
  },
  C: {
    name: 'Routine',
    description: 'Routine motions with straightforward requirements',
  },
};

// ============================================================================
// PATH DESCRIPTIONS
// ============================================================================

export const PATH_DESCRIPTIONS: Record<WorkflowPath, { name: string; description: string }> = {
  path_a: {
    name: 'Initiating Motion',
    description: 'Filing an initiating/offensive motion',
  },
  path_b: {
    name: 'Opposition/Response',
    description: 'Responding to or opposing a motion',
  },
};
