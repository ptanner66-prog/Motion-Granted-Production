/**
 * Citation Integrity Verification (CIV) Type Definitions
 *
 * Complete type system for the 7-step CIV pipeline
 * Based on Clay Tanner's specification v1.0 (January 25, 2026)
 */

// ============================================================================
// ENUMS
// ============================================================================

/**
 * Proposition types that determine verification strictness
 */
export type PropositionType = 'PRIMARY_STANDARD' | 'REQUIRED_ELEMENT' | 'SECONDARY' | 'CONTEXT';

/**
 * Overall verification result status
 */
export type VerificationStatus = 'VERIFIED' | 'FLAGGED' | 'REJECTED' | 'BLOCKED';

/**
 * Step 2 holding verification result
 */
export type HoldingVerificationResult = 'VERIFIED' | 'PARTIAL' | 'REJECTED' | 'DICTA_ONLY';

/**
 * Alias for cross-vendor model router compatibility
 */
export type VerificationResult = HoldingVerificationResult;

/**
 * Step 3 dicta classification
 */
export type DictaClassification = 'HOLDING' | 'DICTA' | 'UNCLEAR';

/**
 * Step 4 quote verification result
 */
export type QuoteVerificationResult = 'MATCH' | 'CLOSE_MATCH' | 'PARTIAL_MATCH' | 'NOT_FOUND' | 'N/A';

/**
 * Step 5 bad law status
 */
export type BadLawStatus = 'GOOD_LAW' | 'CAUTION' | 'NEGATIVE_TREATMENT' | 'OVERRULED';

/**
 * Step 6 stability classification
 */
export type StabilityClass = 'LANDMARK' | 'ESTABLISHED' | 'RECENT' | 'DECLINING' | 'CONTROVERSIAL';

/**
 * Step 6 strength assessment
 */
export type StrengthAssessment = 'STRONG' | 'MODERATE' | 'WEAK';

/**
 * Citation trend direction
 */
export type CitationTrend = 'STABLE' | 'INCREASING' | 'DECLINING';

/**
 * Flag types raised during verification
 */
export type FlagType =
  | 'EXISTENCE_FAILED'
  | 'OVERRULED'
  | 'HOLDING_MISMATCH'
  | 'DICTA_AS_HOLDING'
  | 'QUOTE_INACCURATE'
  | 'PARTIAL_SUPPORT'
  | 'UNPUBLISHED'
  | 'DECLINING_AUTHORITY'
  | 'CONTROVERSIAL';

/**
 * Flag severity levels
 */
export type FlagSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

/**
 * Action required based on verification
 */
export type ActionRequired = 'NONE' | 'REVIEW' | 'REPLACE' | 'REMOVE';

// ============================================================================
// STEP OUTPUT INTERFACES
// ============================================================================

/**
 * Step 1: Existence Check Output
 */
export interface ExistenceCheckOutput {
  step: 1;
  name: 'existence_check';
  citationInput: string;
  citationNormalized: string;
  result: 'VERIFIED' | 'NOT_FOUND' | 'UNPUBLISHED';
  sourcesChecked: Array<'courtlistener' | 'pacer' | 'recap'>;
  courtlistenerId?: string;
  courtlistenerUrl?: string;
  pacerCaseId?: string;
  pacerUrl?: string;
  pacerCost?: number;
  isPublished: boolean;
  precedentialStatus?: string;
  confidence: number;
  proceedToStep2: boolean;
  durationMs?: number;
  error?: string;
}

/**
 * Step 2: Holding Verification Output
 */
export interface HoldingVerificationOutput {
  step: 2;
  name: 'holding_verification';
  proposition: string;
  propositionType: PropositionType;
  stage1: {
    model: string;
    result: HoldingVerificationResult;
    confidence: number;
    supportingQuote?: string;
    reasoning: string;
  };
  stage2?: {
    triggered: boolean;
    model?: string;
    result?: 'UPHELD' | 'WEAKENED' | 'REJECTED';
    challengeStrength?: number;
    challengeReasoning?: string;
  };
  finalResult: HoldingVerificationResult;
  finalConfidence: number;
  proceedToStep3: boolean;
}

/**
 * Step 2 Result for cross-vendor implementation
 * Uses snake_case for consistency with model router
 */
export interface Step2Result {
  step: 2;
  name: 'holding_verification';
  proposition: string;
  proposition_type: PropositionType;
  stage_1: {
    model: string;
    result: VerificationResult;
    confidence: number;
    supporting_quote?: string;
    reasoning?: string;
  };
  stage_2: {
    triggered: boolean;
    model?: string;
    result?: 'UPHELD' | 'WEAKENED' | 'REJECTED';
    challenge_strength?: number;
    challenge_reasoning?: string;
  };
  final_result: VerificationResult;
  final_confidence: number;
  proceed_to_step_3: boolean;
}

/**
 * Step 3: Dicta Detection Output
 */
export interface DictaDetectionOutput {
  step: 3;
  name: 'dicta_detection';
  classification: DictaClassification;
  confidence: number;
  reasoning: string;
  actionTaken: 'CONTINUE' | 'FLAG' | 'NOTE';
  proceedToStep4: boolean;
}

/**
 * Step 4: Quote Verification Output
 */
export interface QuoteVerificationOutput {
  step: 4;
  name: 'quote_verification';
  quoteInDraft?: string;
  quoteInOpinion?: string;
  similarityScore?: number;
  result: QuoteVerificationResult;
  actionTaken: 'NONE' | 'AUTO_CORRECTED' | 'FLAGGED' | 'PARAPHRASED';
  correctedQuote?: string;
  ellipsisIssues?: string[]; // SP10: added for CV-109 ellipsis validation
  ellipsisWarnings?: string[]; // SP10: added for CV-109 ellipsis validation
  proceedToStep5: boolean;
}

/**
 * Step 5: Bad Law Check Output
 */
export interface BadLawCheckOutput {
  step: 5;
  name: 'bad_law_check';
  layer1: {
    source: 'courtlistener';
    treatment?: string;
    negativeSignals: string[];
  };
  layer2: {
    searchesRun: number;
    status: BadLawStatus;
    confidence: number;
    concerns: string[];
  };
  layer3: {
    inCuratedList: boolean;
    overruledBy?: string;
  };
  compositeStatus: BadLawStatus;
  confidence: number;
  validUntil: string;
  actionTaken: 'CONTINUE' | 'FLAG' | 'BLOCKED';
  proceedToStep6: boolean;
}

/**
 * Step 6: Authority Strength Output
 */
export interface AuthorityStrengthOutput {
  step: 6;
  name: 'authority_strength';
  stabilityClass: StabilityClass;
  metrics: {
    caseAgeYears: number;
    totalCitations: number;
    citationsLast5Years: number;
    citationsLast10Years: number;
    citationTrend: CitationTrend;
    distinguishCount: number;
    distinguishRate: number;
    criticismCount: number;
  };
  strengthScore: number;
  assessment: StrengthAssessment;
  notes: string;
}

/**
 * Step 7: Final Output Compilation
 */
export interface FinalVerificationOutput {
  verificationId: string;
  citation: {
    input: string;
    normalized: string;
    caseName: string;
    volume?: number;
    reporter?: string;
    page?: number;
    court?: string;
    year?: number;
  };
  proposition: {
    text: string;
    type: PropositionType;
    inCitationBank: boolean;
  };
  verificationResults: {
    step1Existence: ExistenceCheckOutput;
    step2Holding: HoldingVerificationOutput;
    step3Dicta: DictaDetectionOutput;
    step4Quote: QuoteVerificationOutput;
    step5BadLaw: BadLawCheckOutput;
    step6Strength: AuthorityStrengthOutput;
  };
  compositeResult: {
    status: VerificationStatus;
    confidenceScore: number;
    flags: CIVFlag[];
    notes: string[];
    actionRequired: ActionRequired;
  };
  metadata: {
    verifiedAt: string;
    verificationDurationMs: number;
    modelsUsed: string[];
    apiCallsMade: number;
    estimatedCost: number;
    orderId?: string;
    phase: 'V.1' | 'VII.1';
  };
}

// ============================================================================
// SUPPORTING INTERFACES
// ============================================================================

/**
 * Flag raised during verification
 */
export interface CIVFlag {
  type: FlagType;
  severity: FlagSeverity;
  message: string;
  step: number;
  autoResolvable: boolean;
  resolution?: string;
}

/**
 * Citation input for verification
 */
export interface CitationToVerify {
  citationString: string;
  caseName?: string;
  proposition: string;
  propositionType: PropositionType;
  quoteInDraft?: string;
  jurisdictionContext?: string;
  motionTypeContext?: string;
}

/**
 * Batch verification request
 */
export interface BatchVerificationRequest {
  orderId: string;
  phase: 'V.1' | 'VII.1';
  citations: CitationToVerify[];
  options?: {
    skipCached?: boolean;
    parallelLimit?: number;
    timeout?: number;
  };
}

/**
 * Batch verification result
 */
export interface BatchVerificationResult {
  orderId: string;
  phase: 'V.1' | 'VII.1';
  totalCitations: number;
  verified: number;
  flagged: number;
  rejected: number;
  blocked: number;
  results: FinalVerificationOutput[];
  summary: {
    averageConfidence: number;
    totalDurationMs: number;
    totalApiCalls: number;
    estimatedTotalCost: number;
    cacheHits: number;
  };
}

/**
 * VPI Cache check result
 */
export interface VPICacheResult {
  found: boolean;
  cachedVerification?: {
    verificationId: string;
    result: HoldingVerificationResult;
    confidence: number;
    citationString: string;
    supportingQuote?: string;
    reasoning?: string;
    verifiedAt: string;
  };
}

/**
 * Citation normalization result
 */
export interface NormalizedCitation {
  original: string;
  normalized: string;
  caseName?: string;
  volume?: number;
  reporter?: string;
  page?: number;
  court?: string;
  year?: number;
  isValid: boolean;
  parseErrors?: string[];
}

// ============================================================================
// CONFIGURATION
// ============================================================================

/**
 * CIV Pipeline configuration
 */
export interface CIVConfig {
  // Model settings
  primaryModel: string;
  adversarialModel: string;

  // Confidence thresholds
  verifiedThreshold: number; // >= 0.90
  acceptableThreshold: number; // >= 0.80
  borderlineThreshold: number; // >= 0.70

  // Quote matching
  exactMatchThreshold: number; // >= 0.95
  closeMatchThreshold: number; // >= 0.90
  partialMatchThreshold: number; // >= 0.80

  // Stage 2 triggers
  triggerAdversarialOnBorderline: boolean;
  triggerAdversarialForPrimaryStandard: boolean;
  triggerAdversarialForTierC: boolean;

  // Cache settings
  useVPICache: boolean;
  cacheMinConfidence: number;

  // Bad law check validity
  goodLawValidityDays: number;

  // Rate limiting
  maxConcurrentVerifications: number;
  delayBetweenApiCalls: number;
}

/**
 * Default CIV configuration per spec
 */
export const DEFAULT_CIV_CONFIG: CIVConfig = {
  primaryModel: 'claude-sonnet-4-20250514',
  adversarialModel: 'claude-opus-4-5-20251101',

  verifiedThreshold: 0.90,
  acceptableThreshold: 0.80,
  borderlineThreshold: 0.70,

  exactMatchThreshold: 0.95,
  closeMatchThreshold: 0.90,
  partialMatchThreshold: 0.80,

  triggerAdversarialOnBorderline: true,
  triggerAdversarialForPrimaryStandard: true,
  triggerAdversarialForTierC: true,

  useVPICache: true,
  cacheMinConfidence: 0.85,

  goodLawValidityDays: 180,

  maxConcurrentVerifications: 5,
  delayBetweenApiCalls: 100,
};

// ============================================================================
// PROMPT TEMPLATES
// ============================================================================

/**
 * Step 2 Stage 1 prompt template
 */
export const HOLDING_VERIFICATION_PROMPT = `You are a legal research assistant verifying whether a case supports a specific legal proposition.

CASE: {case_name}
CITATION: {citation}
COURT: {court}
YEAR: {year}

OPINION EXCERPT:
{opinion_text_excerpt}

PROPOSITION TO VERIFY:
"{proposition}"

TASK: Determine if this case's HOLDING (not dicta) supports the stated proposition.

Respond with ONLY valid JSON in this exact format:
{
  "VERIFICATION_RESULT": "VERIFIED" | "PARTIAL" | "REJECTED" | "DICTA_ONLY",
  "CONFIDENCE_SCORE": 0.00 to 1.00,
  "SUPPORTING_QUOTE": "The specific language from the opinion that supports/refutes",
  "REASONING": "2-3 sentences explaining your conclusion"
}`;

/**
 * Step 2 Stage 2 adversarial prompt template
 */
export const ADVERSARIAL_VERIFICATION_PROMPT = `You are a skeptical opposing counsel reviewing a citation.

Your task is to find reasons why {case_name} does NOT support the proposition: "{proposition}"

Look for:
1. Is this actually DICTA rather than holding?
2. Does the context limit the scope of this statement?
3. Are there distinguishing facts that make this inapplicable?
4. Is this the majority opinion or a dissent/concurrence?

Respond with ONLY valid JSON in this exact format:
{
  "CHALLENGE_RESULT": "UPHELD" | "WEAKENED" | "REJECTED",
  "CHALLENGE_STRENGTH": 0.00 to 1.00,
  "CHALLENGE_REASONING": "Your best argument against this citation"
}`;

/**
 * Step 3 dicta detection prompt template
 */
export const DICTA_DETECTION_PROMPT = `Analyze whether the following statement from {case_name} is part of the HOLDING or is DICTA.

STATEMENT: "{quoted_or_paraphrased_text}"

CONTEXT: {surrounding_paragraphs}

Indicators of HOLDING:
- Directly addresses the issue before the court
- Necessary to reach the decision
- Forms the basis for the judgment

Indicators of DICTA:
- Hypothetical scenarios ("If the facts were different...")
- General commentary not required for decision
- Discussion of issues not presented
- "In passing" observations

Respond with ONLY valid JSON in this exact format:
{
  "CLASSIFICATION": "HOLDING" | "DICTA" | "UNCLEAR",
  "CONFIDENCE": 0.00 to 1.00,
  "REASONING": "Why you classified it this way"
}`;

/**
 * Step 5 Layer 2 bad law prompt template
 */
export const BAD_LAW_ANALYSIS_PROMPT = `Review the following search results about {case_name}.

Determine if any of these sources indicate that {case_name} has been:
- Overruled
- Abrogated by statute
- Superseded
- Otherwise invalidated

Search Results:
{search_result_snippets}

Respond with ONLY valid JSON in this exact format:
{
  "STATUS": "GOOD_LAW" | "CAUTION" | "NEGATIVE_TREATMENT" | "OVERRULED",
  "CONFIDENCE": 0.00 to 1.00,
  "SOURCE": "Which source indicates the treatment",
  "REASONING": "Brief explanation"
}`;

// ============================================================================
// CONFIDENCE CALCULATION
// ============================================================================

/**
 * Weights for composite confidence calculation
 */
export const CONFIDENCE_WEIGHTS = {
  step1: 0.20,
  step2: 0.35,
  step3: 0.15,
  step4: 0.10,
  step5: 0.20,
  // Step 6 doesn't affect composite - it's informational
};

/**
 * Calculate composite confidence score
 */
export function calculateCompositeConfidence(
  step1Confidence: number,
  step2Confidence: number,
  step3Confidence: number,
  step4Confidence: number | null, // null if N/A
  step5Confidence: number
): number {
  const step4Score = step4Confidence ?? 1.0; // Default to 1.0 if no quote to verify

  const composite =
    step1Confidence * CONFIDENCE_WEIGHTS.step1 +
    step2Confidence * CONFIDENCE_WEIGHTS.step2 +
    step3Confidence * CONFIDENCE_WEIGHTS.step3 +
    step4Score * CONFIDENCE_WEIGHTS.step4 +
    step5Confidence * CONFIDENCE_WEIGHTS.step5;

  // Clamp to 0-1 range
  return Math.max(0, Math.min(1, composite));
}

// ============================================================================
// FLAG MAPPINGS
// ============================================================================

/**
 * Flag severity mapping
 */
export const FLAG_SEVERITY_MAP: Record<FlagType, FlagSeverity> = {
  EXISTENCE_FAILED: 'CRITICAL',
  OVERRULED: 'CRITICAL',
  HOLDING_MISMATCH: 'HIGH',
  DICTA_AS_HOLDING: 'HIGH',
  QUOTE_INACCURATE: 'MEDIUM',
  PARTIAL_SUPPORT: 'MEDIUM',
  UNPUBLISHED: 'MEDIUM',
  DECLINING_AUTHORITY: 'LOW',
  CONTROVERSIAL: 'LOW',
};

/**
 * Flag auto-resolvability mapping
 */
export const FLAG_AUTO_RESOLVABLE: Record<FlagType, boolean> = {
  EXISTENCE_FAILED: false,
  OVERRULED: false,
  HOLDING_MISMATCH: true, // Try Mini Phase IV
  DICTA_AS_HOLDING: true, // Find alternative or soften
  QUOTE_INACCURATE: true, // Auto-paraphrase
  PARTIAL_SUPPORT: true, // Find better or soften
  UNPUBLISHED: true, // Find published alternative
  DECLINING_AUTHORITY: false, // Note only
  CONTROVERSIAL: false, // Note only
};
