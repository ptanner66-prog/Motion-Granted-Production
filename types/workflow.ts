/**
 * Motion Granted v7.2 Workflow Types
 * Complete type definitions for 14-phase workflow, citation verification, and checkpoints
 */

// ============================================================================
// ENUMS
// ============================================================================

export type MotionTier = 'A' | 'B' | 'C' | 'D';

export type WorkflowPath = 'path_a' | 'path_b';

export type PhaseStatus =
  | 'pending'
  | 'in_progress'
  | 'completed'
  | 'completed_with_warning'  // Graceful degradation (e.g., empty citation bank)
  | 'blocked'
  | 'requires_review'
  | 'failed';

export type CitationStatus =
  | 'pending'
  | 'verified'
  | 'invalid'
  | 'needs_update'
  | 'flagged'
  | 'VERIFICATION_DEFERRED';  // V-003: OpenAI circuit breaker OPEN — deferred, not failed

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
    name: 'Procedural/Administrative',
    description: 'Simple procedural motions - Extensions, Continuances, Pro Hac Vice',
  },
  B: {
    name: 'Intermediate',
    description: 'Standard motions with moderate complexity - Motion to Compel, Demurrer, Motion to Dismiss',
  },
  C: {
    name: 'Complex',
    description: 'Complex motions requiring deep analysis - Anti-SLAPP, JNOV, New Trial',
  },
  D: {
    name: 'Highly Complex/Dispositive',
    description: 'Dispositive and highest-complexity motions - MSJ, MSA, Preliminary Injunction, TRO, Class Certification',
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

// ============================================================================
// V7.2 WORKFLOW SYSTEM - 14 PHASES
// ============================================================================

/**
 * The 14 phases of the v7.2 workflow system
 *
 * MAIN FLOW:
 * I → II → III → [HOLD?] → IV* → V → V.1 → VI† → VII*† → VIII.5 → IX → [IX.1?] → X*
 *
 * REVISION LOOP (if Phase VII grade < A-):
 * VII (< A-) → VIII† → [VII.1 if new citations] → VII (regrade)
 *            ↑_____________________________________|
 *            (max 3 loops)
 *
 * * = Checkpoint
 * † = Extended Thinking enabled
 * ? = Conditional
 */
export type WorkflowPhaseCode =
  | 'I'      // Intake & Classification
  | 'II'     // Legal Standards / Motion Deconstruction
  | 'III'    // Evidence Strategy / Issue Identification
  | 'IV'     // Authority Research (Checkpoint: Notification)
  | 'V'      // Draft Motion
  | 'V.1'    // Citation Accuracy Check
  | 'VI'     // Opposition Anticipation (Extended Thinking)
  | 'VII'    // Judge Simulation (Checkpoint: Notification, Extended Thinking)
  | 'VII.1'  // Post-Revision Citation Check
  | 'VIII'   // Revisions (Extended Thinking for B/C)
  | 'VIII.5' // Caption Validation
  | 'IX'     // Supporting Documents
  | 'IX.1'   // Separate Statement Check (MSJ/MSA only)
  | 'X';     // Final Assembly (Checkpoint: BLOCKING)

export const WORKFLOW_PHASES: Record<WorkflowPhaseCode, {
  number: number;
  name: string;
  description: string;
  isCheckpoint: boolean;
  checkpointType?: 'notification' | 'blocking';
  hasExtendedThinking: boolean;
  extendedThinkingBudget?: number;
  isConditional: boolean;
  conditionalTrigger?: string;
}> = {
  'I': {
    number: 1,
    name: 'Intake & Classification',
    description: 'Classifies tier (A/B/C), path (A/B), validates submission',
    isCheckpoint: false,
    hasExtendedThinking: false,
    isConditional: false,
  },
  'II': {
    number: 2,
    name: 'Legal Standards / Motion Deconstruction',
    description: 'PATH A: what standards apply. PATH B: tear apart opponent\'s motion',
    isCheckpoint: false,
    hasExtendedThinking: false,
    isConditional: false,
  },
  'III': {
    number: 3,
    name: 'Evidence Strategy / Issue Identification',
    description: 'Maps evidence to elements. May trigger HOLD if gaps',
    isCheckpoint: false,
    hasExtendedThinking: false,
    isConditional: false,
  },
  'IV': {
    number: 4,
    name: 'Authority Research',
    description: 'Finds case law, builds Citation Banks',
    isCheckpoint: true,
    checkpointType: 'notification',
    hasExtendedThinking: false,
    isConditional: false,
  },
  'V': {
    number: 5,
    name: 'Draft Motion',
    description: 'Writes the actual motion',
    isCheckpoint: false,
    hasExtendedThinking: false,
    isConditional: false,
  },
  'V.1': {
    number: 5.1,
    name: 'Citation Accuracy Check',
    description: 'Verifies every citation via CourtListener + Opus',
    isCheckpoint: false,
    hasExtendedThinking: false,
    isConditional: false,
  },
  'VI': {
    number: 6,
    name: 'Opposition Anticipation',
    description: 'Predicts opposing arguments, prepares counters',
    isCheckpoint: false,
    hasExtendedThinking: true,
    extendedThinkingBudget: 8000,
    isConditional: false,
  },
  'VII': {
    number: 7,
    name: 'Judge Simulation',
    description: 'Grades the motion (needs A- to pass)',
    isCheckpoint: true,
    checkpointType: 'notification',
    hasExtendedThinking: true,
    extendedThinkingBudget: 10000,
    isConditional: false,
  },
  'VII.1': {
    number: 7.1,
    name: 'Post-Revision Citation Check',
    description: 'If Phase VIII added new citations',
    isCheckpoint: false,
    hasExtendedThinking: false,
    isConditional: true,
    conditionalTrigger: 'new_citations_in_revision',
  },
  'VIII': {
    number: 8,
    name: 'Revisions',
    description: 'Fixes weaknesses from Phase VII (max 3 loops)',
    isCheckpoint: false,
    hasExtendedThinking: true,
    extendedThinkingBudget: 8000,
    isConditional: true,
    conditionalTrigger: 'grade_below_b_plus',
  },
  'VIII.5': {
    number: 8.5,
    name: 'Caption Validation',
    description: 'Ensures caption consistency across all documents',
    isCheckpoint: false,
    hasExtendedThinking: false,
    isConditional: false,
  },
  'IX': {
    number: 9,
    name: 'Supporting Documents',
    description: 'Declarations, proposed order, proof of service',
    isCheckpoint: false,
    hasExtendedThinking: false,
    isConditional: false,
  },
  'IX.1': {
    number: 9.1,
    name: 'Separate Statement Check',
    description: 'MSJ/MSA only - verifies Separate Statement citations',
    isCheckpoint: false,
    hasExtendedThinking: false,
    isConditional: true,
    conditionalTrigger: 'motion_type_msj_or_msa',
  },
  'X': {
    number: 10,
    name: 'Final Assembly',
    description: 'Packages everything. Requires admin approval',
    isCheckpoint: true,
    checkpointType: 'blocking',
    hasExtendedThinking: false,
    isConditional: false,
  },
};

export const TOTAL_WORKFLOW_PHASES = 14;

// ============================================================================
// CHECKPOINT SYSTEM
// ============================================================================

export type CheckpointType = 'HOLD' | 'CP1' | 'CP2' | 'CP3';

export interface Checkpoint {
  type: CheckpointType;
  phase: WorkflowPhaseCode;
  isBlocking: boolean;
  description: string;
  triggeredAt?: string;
  resolvedAt?: string;
  resolution?: 'approved' | 'request_changes' | 'cancelled' | 'customer_response';
}

export const CHECKPOINTS: Record<CheckpointType, {
  phase: WorkflowPhaseCode;
  isBlocking: boolean;
  description: string;
}> = {
  'HOLD': {
    phase: 'III',
    isBlocking: true,
    description: 'Critical evidence gaps → workflow pauses until customer responds',
  },
  'CP1': {
    phase: 'IV',
    isBlocking: false,
    description: 'Research Complete → continues automatically',
  },
  'CP2': {
    phase: 'VII',
    isBlocking: false,
    description: 'Judge Simulation grade → continues automatically',
  },
  'CP3': {
    phase: 'X',
    isBlocking: true,
    description: 'Requires admin Approve/Request Changes/Cancel',
  },
};

// ============================================================================
// COURTLISTENER CITATION VERIFICATION
// ============================================================================

export type CitationVerificationStatus =
  | 'VERIFIED'              // Citation confirmed accurate
  | 'VERIFIED_WITH_HISTORY' // Has subsequent treatment - check if still good law
  | 'VERIFIED_WEB_ONLY'     // API down, verified via web
  | 'VERIFIED_UNPUBLISHED'  // Unpublished opinion - check citability rules
  | 'HOLDING_MISMATCH'      // Case doesn't support proposition - Protocol 2: Substitute
  | 'HOLDING_PARTIAL'       // Only partially supports - Protocol 6: Classify A-D
  | 'QUOTE_NOT_FOUND'       // Quoted text not in opinion - Protocol 3: Correct or remove
  | 'NOT_FOUND'             // Citation doesn't exist - possible hallucination
  | 'OVERRULED'             // Case has been overruled - limited historical use only
  | 'EXISTENCE_CONFIRMED'   // Found in CourtListener, pending holding verification
  | 'PENDING'               // Not yet verified
  | 'SKIPPED';              // Intentionally skipped (e.g., statute)

export type CitationBankType = 'CASE' | 'STATUTORY';

export interface CitationBank {
  id: string;
  orderId: string;
  bankType: CitationBankType;
  citations: CitationBankEntry[];
  createdAt: string;
  updatedAt: string;
}

export interface CitationBankEntry {
  citationText: string;
  caseName?: string;
  reporter?: string;
  year?: number;
  court?: string;
  courtListenerId?: string;
  verificationStatus: CitationVerificationStatus;
  holdingVerified: boolean;
  proposition: string;
  pageReference?: string;
  officialSourceUrl?: string; // For statutory citations
}

export interface CourtListenerVerificationResult {
  citationText: string;
  stage1Result: 'found' | 'not_found' | 'error'; // Existence check
  stage2Result?: 'retrieved' | 'not_retrieved' | 'error'; // Opinion retrieval
  stage3Result?: 'verified' | 'mismatch' | 'partial' | 'error'; // Holding verification
  courtListenerId?: string;
  verificationStatus: CitationVerificationStatus;
  opinionText?: string;
  notes?: string;
}

// ============================================================================
// JUDGE SIMULATION GRADES
// ============================================================================

export type LetterGrade = 'A+' | 'A' | 'A-' | 'B+' | 'B' | 'B-' | 'C+' | 'C' | 'D' | 'F';

export const GRADE_VALUES: Record<LetterGrade, number> = {
  'A+': 4.3,
  'A': 4.0,
  'A-': 3.7,
  'B+': 3.3,
  'B': 3.0,
  'B-': 2.7,
  'C+': 2.3,
  'C': 2.0,
  'D': 1.0,
  'F': 0.0,
};

export const MINIMUM_PASSING_GRADE: LetterGrade = 'B+';
export const MINIMUM_PASSING_VALUE = 3.3;
export const MAX_REVISION_LOOPS = 3;

// SC-001 FIX: Tier-specific thresholds per Master Workflow v7.5 Section VII.2
// Tier A (procedural): B (3.0 / 83%) — simpler motions need lower bar
// Tier B/C/D (substantive): B+ (3.3 / 87%) — complex motions need higher quality
export const TIER_A_PASSING_VALUE = 3.0;  // B
export const TIER_BCD_PASSING_VALUE = 3.3; // B+

export function getPassingThreshold(tier?: string): number {
  return tier === 'A' ? TIER_A_PASSING_VALUE : TIER_BCD_PASSING_VALUE;
}

export interface JudgeSimulationResult {
  grade: LetterGrade;
  numericGrade: number;
  passes: boolean;
  strengths: string[];
  weaknesses: string[];
  specificFeedback: string;
  revisionSuggestions?: string[];
  loopNumber: number;
}

export function gradeToNumeric(grade: LetterGrade): number {
  return GRADE_VALUES[grade];
}

export function numericToGrade(value: number): LetterGrade {
  if (value >= 4.15) return 'A+';
  if (value >= 3.85) return 'A';
  if (value >= 3.5) return 'A-';
  if (value >= 3.15) return 'B+';
  if (value >= 2.85) return 'B';
  if (value >= 2.5) return 'B-';
  if (value >= 2.15) return 'C+';
  if (value >= 1.5) return 'C';
  if (value >= 0.5) return 'D';
  return 'F';
}

export function gradePasses(grade: LetterGrade): boolean {
  return GRADE_VALUES[grade] >= MINIMUM_PASSING_VALUE;
}

/**
 * Check if a grade passes the threshold for the given tier.
 * Tier A: B (3.0) | Tier B/C/D: B+ (3.3)
 */
export function gradePassesForTier(grade: LetterGrade, tier?: string): boolean {
  const threshold = getPassingThreshold(tier);
  return GRADE_VALUES[grade] >= threshold;
}

// Model routing lives in lib/config/phase-registry.ts (single source of truth).

// ============================================================================
// GAP CLOSURE PROTOCOLS
// ============================================================================

export type GapClosureProtocol =
  | 1   // Statutory Authority Bank
  | 2   // HOLDING_MISMATCH - Substitute
  | 3   // QUOTE_NOT_FOUND - Correct or remove
  | 4   // Separate Statement Check
  | 5   // Mini Phase IV - Scoped research
  | 6   // HOLDING_PARTIAL - Classify A-D
  | 7   // Failure Threshold - Pause for manual
  | 8   // HOLD Checkpoint
  | 9   // Crash Recovery
  | 10  // Loop 3 Exit
  | 11  // CourtListener Downtime
  | 12  // Page Length QC
  | 13  // Unpublished Opinion
  | 14  // Caption Consistency
  | 15  // Pinpoint Accuracy
  | 16  // Incomplete Submission
  | 17; // Missing Declarant

export interface GapClosureEvent {
  id: string;
  orderId: string;
  protocolNumber: GapClosureProtocol;
  protocolName: string;
  triggerReason: string;
  resolution?: string;
  resolvedAt?: string;
  createdAt: string;
}

export const GAP_CLOSURE_PROTOCOLS: Record<GapClosureProtocol, {
  name: string;
  description: string;
  autoResolvable: boolean;
}> = {
  1: { name: 'Statutory Authority Bank', description: 'Phase IV finds statute/rule - creates separate bank, verifies via official sources', autoResolvable: true },
  2: { name: 'HOLDING_MISMATCH', description: 'Opus says case doesn\'t support proposition - substitutes from bank or triggers mini-research', autoResolvable: true },
  3: { name: 'QUOTE_NOT_FOUND', description: 'Quote not in opinion text - corrects to actual text or removes quote', autoResolvable: true },
  4: { name: 'Separate Statement Check', description: 'MSJ/MSA motion - verifies all SS citations against banks', autoResolvable: true },
  5: { name: 'Mini Phase IV', description: 'Revisions need new authority - scoped research (2/4/6 citations by tier)', autoResolvable: true },
  6: { name: 'HOLDING_PARTIAL', description: 'Case only partially supports - classifies A-D, handles accordingly', autoResolvable: true },
  7: { name: 'Failure Threshold', description: 'Too many verification failures - pauses for manual reassessment', autoResolvable: false },
  8: { name: 'HOLD Checkpoint', description: 'Critical evidence gaps - blocks workflow until customer responds', autoResolvable: false },
  9: { name: 'Crash Recovery', description: 'Any interruption - saves checkpoints after each batch', autoResolvable: true },
  10: { name: 'Loop 3 Exit', description: '3 revision loops, still < A- - delivers with enhanced disclosure/warning', autoResolvable: true },
  11: { name: 'CourtListener Downtime', description: 'Rate limit or API outage - exponential backoff, then web search fallback', autoResolvable: true },
  12: { name: 'Page Length QC', description: 'Motion over/under page limits - triggers revision or blocks delivery', autoResolvable: false },
  13: { name: 'Unpublished Opinion', description: 'Not in CourtListener - secondary verification via web search', autoResolvable: true },
  14: { name: 'Caption Consistency', description: 'Mismatched captions - auto-corrects all documents', autoResolvable: true },
  15: { name: 'Pinpoint Accuracy', description: 'Wrong page citation - auto-corrects within 1-2 pages', autoResolvable: true },
  16: { name: 'Incomplete Submission', description: 'Missing required intake items - flags and requests from customer', autoResolvable: false },
  17: { name: 'Missing Declarant', description: 'Unknown declarant information - pauses and requests details', autoResolvable: false },
};

// ============================================================================
// PRICING CONSTANTS
// ============================================================================

export const CA_PRICING_MULTIPLIER = 1.20; // California = Louisiana × 1.20

export interface TierPricing {
  tier: MotionTier;
  louisiana: { min: number; max: number };
  california: { min: number; max: number };
  turnaroundDays: string;
}

export const TIER_PRICING: TierPricing[] = [
  { tier: 'A', louisiana: { min: 299, max: 299 }, california: { min: 359, max: 359 }, turnaroundDays: '2-3' },
  { tier: 'B', louisiana: { min: 599, max: 599 }, california: { min: 719, max: 719 }, turnaroundDays: '3-4' },
  { tier: 'C', louisiana: { min: 999, max: 999 }, california: { min: 1199, max: 1199 }, turnaroundDays: '4-5' },
  { tier: 'D', louisiana: { min: 1499, max: 1499 }, california: { min: 1799, max: 1799 }, turnaroundDays: '5-7' },
];

// ============================================================================
// COURTLISTENER API CONSTANTS
// ============================================================================

export const COURTLISTENER_BASE_URL = 'https://www.courtlistener.com/api/rest/v4/';
export const COURTLISTENER_CITATION_LOOKUP = 'citation-lookup/';
export const COURTLISTENER_RATE_LIMIT = 60; // per minute
export const COURTLISTENER_MAX_CITATIONS_PER_REQUEST = 128;
export const COURTLISTENER_MAX_CHARS_PER_REQUEST = 64000;

// ============================================================================
// VERIFIED CITATION - ZERO TOLERANCE FOR HALLUCINATIONS
// ============================================================================

/**
 * VerifiedCitation - A citation that has been verified against CourtListener
 *
 * CRITICAL: Every citation in a Motion Granted motion MUST have:
 * - courtlistener_id: Proof the citation exists
 * - verification_timestamp: When it was verified
 * - verification_method: How it was verified ('search' or 'citation_lookup')
 *
 * Citations without these fields are INVALID and will be rejected by Phase V.
 */
export interface VerifiedCitation {
  // Identification
  caseName: string;
  citation: string;

  // VERIFICATION PROOF (REQUIRED - without these, citation is INVALID)
  courtlistener_id: number;
  courtlistener_cluster_id: number;
  verification_timestamp: string;
  verification_method: 'search' | 'citation_lookup';

  // Metadata from CourtListener
  court: string;
  date_filed: string;

  // Usage in motion
  forElement: string;
  proposition: string;
  relevantHolding: string;
  authorityLevel: 'binding' | 'persuasive';
}

/**
 * Check if a citation has valid verification proof
 */
export function isVerifiedCitation(citation: unknown): citation is VerifiedCitation {
  if (!citation || typeof citation !== 'object') return false;
  const c = citation as Record<string, unknown>;
  return (
    typeof c.courtlistener_id === 'number' &&
    typeof c.verification_timestamp === 'string' &&
    (c.verification_method === 'search' || c.verification_method === 'citation_lookup')
  );
}

/**
 * Minimum verified citations required for a motion (hard stop)
 */
export const MINIMUM_VERIFIED_CITATIONS = 4;

/**
 * Phase V.1 citation verification output
 */
export interface PhaseV1VerificationOutput {
  phaseComplete: 'V.1';
  citationVerification: {
    totalInDraft: number;
    verified: number;
    unverified: number;
    removed: number;
    verificationRate: string;
  };
  verificationResults: CitationVerificationResult[];
  unverifiedCitationsRemoved: string[];
  cleanedMotion: Record<string, unknown> | null;
  auditTrail: {
    verifiedViaCourtListenerBank: number;
    verifiedNow: number;
    removed: number;
    timestamp: string;
  };
  overallStatus: 'pass' | 'citations_removed';
}
