/**
 * Citation Verification Model Routing — SINGLE SOURCE OF TRUTH
 *
 * Authority: Clay's 2.5 Master Implementation Spec, Part C §3
 * Date: February 5, 2026
 *
 * This config is SEPARATE from lib/config/phase-registry.ts.
 * phase-registry.ts handles general phase routing (I-X).
 * This file handles per-STEP routing within citation phases (V.1, VII.1, IX.1).
 *
 * The citation pipeline uses LLMs as TOOLS (Code Mode), not conversational agents.
 * Each citation gets independent context. Business rules live in code, not prompts.
 */

import { MODELS } from './models';

// ============================================================================
// CITATION-SPECIFIC MODEL CONSTANTS
// ============================================================================

/**
 * Citation Step 2 (Holding Verification) uses GPT for Stage 1.
 * Clay's Part C Issue 2 BINDING DECISION:
 *   - Tier A/B: gpt-4o
 *   - Tier C: gpt-5.2 (does not exist yet — using gpt-4o as fallback)
 *
 * NOTE: gpt-4-turbo is WRONG for citation Stage 1 per Clay's spec.
 * The general phase routing uses gpt-4-turbo but citation routing is separate.
 */
export const CITATION_GPT_MODELS = {
  STAGE_1_DEFAULT: 'gpt-4o' as const,      // Tier A/B Stage 1
  STAGE_1_TIER_C: 'gpt-4o' as const,       // Tier C Stage 1 (gpt-5.2 when available)
  // Future: STAGE_1_TIER_C: 'gpt-5.2'     // Uncomment when OpenAI releases gpt-5.2
  TIEBREAKER: 'gpt-4o' as const,           // Tiebreaker model (same as Stage 1)
} as const;

// ============================================================================
// TYPES
// ============================================================================

export type CitationStep = 1 | 2 | 3 | 4 | 5 | 6 | 7;
export type CitationStage = 'stage_1' | 'stage_2' | 'tiebreaker';
export type Tier = 'A' | 'B' | 'C';

export interface CitationModelConfig {
  model: string;
  isAI: boolean;
  provider: 'anthropic' | 'openai' | 'none';
  maxTokens: number;
  temperature: number;
  description: string;
}

// ============================================================================
// ROUTING TABLE
// ============================================================================

/**
 * Get the correct model for a citation verification step and tier.
 *
 * Step 2 is special: it has Stage 1 (GPT), Stage 2 (Opus), and Tiebreaker (GPT).
 * All other steps use a single model.
 *
 * @param step - Citation step (1-7)
 * @param tier - Motion tier (A, B, C)
 * @param stage - For Step 2 only: which stage (default: stage_1)
 * @returns CitationModelConfig with model string and metadata
 *
 * @example
 * getCitationModel(1, 'A')           // No AI — API calls
 * getCitationModel(2, 'B', 'stage_1') // GPT-4o
 * getCitationModel(2, 'B', 'stage_2') // Opus
 * getCitationModel(3, 'A')           // Haiku
 * getCitationModel(3, 'C')           // Sonnet (Tier C upgrade)
 */
export function getCitationModel(
  step: CitationStep,
  tier: Tier,
  stage?: CitationStage
): CitationModelConfig {
  // Steps 1, 6, 7: No AI
  if (step === 1 || step === 6 || step === 7) {
    return {
      model: 'none',
      isAI: false,
      provider: 'none',
      maxTokens: 0,
      temperature: 0,
      description: step === 1 ? 'Existence Check (API calls)' :
                   step === 6 ? 'Authority Strength (algorithm)' :
                                'Flag Compilation (code)',
    };
  }

  // Step 2: Two-Stage Holding Verification
  if (step === 2) {
    const resolvedStage = stage || 'stage_1';

    if (resolvedStage === 'stage_1') {
      return {
        model: tier === 'C' ? CITATION_GPT_MODELS.STAGE_1_TIER_C : CITATION_GPT_MODELS.STAGE_1_DEFAULT,
        isAI: true,
        provider: 'openai',
        maxTokens: 4096,
        temperature: 0.1,  // Low temp for consistency (v75-G16)
        description: `Stage 1 Holding Verification (GPT-4o, Tier ${tier})`,
      };
    }

    if (resolvedStage === 'stage_2') {
      return {
        model: MODELS.OPUS,
        isAI: true,
        provider: 'anthropic',
        maxTokens: 8192,
        temperature: 0,
        description: `Stage 2 Adversarial Review (Opus, Tier ${tier})`,
      };
    }

    // Tiebreaker
    return {
      model: CITATION_GPT_MODELS.TIEBREAKER,
      isAI: true,
      provider: 'openai',
      maxTokens: 4096,
      temperature: 0.1,
      description: `Tiebreaker (GPT-4o, Tier ${tier})`,
    };
  }

  // Steps 3-5: Haiku (A/B), Sonnet (C)
  if (step >= 3 && step <= 5) {
    const isTierC = tier === 'C';
    const stepNames: Record<number, string> = {
      3: 'Dicta Detection',
      4: 'Quote Verification',
      5: 'Bad Law Check',
    };

    return {
      model: isTierC ? MODELS.SONNET : MODELS.HAIKU,
      isAI: true,
      provider: 'anthropic',
      maxTokens: 4096,
      temperature: 0,
      description: `${stepNames[step]} (${isTierC ? 'Sonnet' : 'Haiku'}, Tier ${tier})`,
    };
  }

  // Should never reach here
  throw new Error(`[CIV_ROUTER] Invalid citation step: ${step}`);
}

// ============================================================================
// LOGGING WRAPPER (CIV-012)
// ============================================================================

/**
 * Get citation model with structured logging.
 * Every routing decision is logged for audit trail.
 */
export function getCitationModelWithLogging(
  step: CitationStep,
  tier: Tier,
  stage?: CitationStage,
  context?: { orderId: string; citationId: string }
): CitationModelConfig {
  const config = getCitationModel(step, tier, stage);

  console.log(
    `[CIV_ROUTER] step=${step} tier=${tier}` +
    (stage ? ` stage=${stage}` : '') +
    ` → model=${config.model} provider=${config.provider}` +
    (context ? ` order=${context.orderId} citation=${context.citationId}` : '')
  );

  return config;
}

// ============================================================================
// CONFIDENCE THRESHOLDS (Clay's Part C §4 — BINDING)
// ============================================================================

export const CITATION_THRESHOLDS = {
  /** ≥95% = VERIFIED without Stage 2 */
  HOLDING_PASS: 0.95,
  /** 80-94% = Trigger Stage 2 adversarial review */
  HOLDING_STAGE_2: 0.80,
  /** <80% = HOLDING_MISMATCH → Protocol 2 */
  HOLDING_FAIL: 0.80,

  /** Step 3: Dicta confidence below this = UNCLEAR */
  DICTA_UNCLEAR: 0.60,
  /** Step 3: Dicta >= this % AND high-value prop = Protocol 18 */
  DICTA_OVERRELIANCE: 0.60,

  /** Step 7: Composite confidence below this = overall FAIL */
  COMPOSITE_FAIL: 0.70,
} as const;

// ============================================================================
// HIGH_STAKES RULES (Clay's Part C §4 — BINDING)
// ============================================================================

export type PropositionType =
  | 'PRIMARY_STANDARD'
  | 'DISPOSITIVE_ELEMENT'
  | 'REQUIRED_ELEMENT'
  | 'SUPPORTING'
  | 'CONTEXT'
  | 'PROCEDURAL'
  | 'SECONDARY';

export interface HighStakesInput {
  propositionType: PropositionType;
  motionTier: Tier;
  isSoleAuthority: boolean;
  caseAge: number;         // years
  citationsDeclining: boolean;
  hasNegativeTreatment: boolean;
}

/**
 * Determine if a citation is HIGH_STAKES.
 * HIGH_STAKES citations ALWAYS trigger Stage 2 regardless of Stage 1 confidence.
 *
 * 6 conditions — ANY one triggers HIGH_STAKES:
 */
export function isHighStakes(input: HighStakesInput): {
  isHighStakes: boolean;
  triggeredRules: number[];
  reasons: string[];
} {
  const triggeredRules: number[] = [];
  const reasons: string[] = [];

  // Rule 1: Primary legal standard
  if (input.propositionType === 'PRIMARY_STANDARD') {
    triggeredRules.push(1);
    reasons.push('Primary legal standard — entire motion fails if wrong');
  }

  // Rule 2: Dispositive element
  if (input.propositionType === 'DISPOSITIVE_ELEMENT') {
    triggeredRules.push(2);
    reasons.push('Dispositive element — determines case outcome');
  }

  // Rule 3: Complex motion (Tier C)
  if (input.motionTier === 'C') {
    triggeredRules.push(3);
    reasons.push('Tier C complex motion — highest malpractice exposure');
  }

  // Rule 4: Sole authority
  if (input.isSoleAuthority) {
    triggeredRules.push(4);
    reasons.push('Sole authority for proposition — no backup if fails');
  }

  // Rule 5: Old declining authority
  if (input.caseAge > 30 && input.citationsDeclining) {
    triggeredRules.push(5);
    reasons.push(`Case age ${input.caseAge} years with declining citations`);
  }

  // Rule 6: Negative treatment
  if (input.hasNegativeTreatment) {
    triggeredRules.push(6);
    reasons.push('Has negative treatment flags — needs adversarial review');
  }

  return {
    isHighStakes: triggeredRules.length > 0,
    triggeredRules,
    reasons,
  };
}

// ============================================================================
// HOLDING CLASSIFICATIONS (Clay's Part C Issue 11 — BINDING)
// ============================================================================

export type HoldingClassification =
  | 'EXACT'       // Directly states proposition
  | 'CONSISTENT'  // Supports with different language
  | 'OVERSTATED'  // Goes beyond holding
  | 'PARTIAL'     // Supports part
  | 'CONTRARY';   // Contradicts

// ============================================================================
// PROTOCOL 7 FAILURE THRESHOLDS (Clay's Part C Issue 6 — BINDING)
// ============================================================================

/**
 * Failure types that count toward Protocol 7 thresholds.
 * Failures = EXISTENCE_FAILED + HOLDING_MISMATCH + QUOTE_NOT_FOUND
 */
export const PROTOCOL_7_FAILURE_TYPES = [
  'EXISTENCE_FAILED',
  'HOLDING_MISMATCH',
  'QUOTE_NOT_FOUND',
] as const;

export const PROTOCOL_7_THRESHOLDS: Record<Tier, number> = {
  A: 2,  // 2+ failures → PAUSE
  B: 4,  // 4+ failures → PAUSE
  C: 6,  // 6+ failures → PAUSE
};

// ============================================================================
// CITATION BATCH SIZES
// ============================================================================

export const CITATION_BATCH_SIZES: Record<Tier, number> = {
  A: 5,
  B: 4,
  C: 3,
};

/** Phases V.1, VII.1, IX.1 always use batch size 2 */
export const CIV_BATCH_SIZE = 2;

/** Minimum verified citations required to pass gate */
export const CITATION_HARD_STOP_MINIMUM = 4;

// ============================================================================
// PROTOCOL FLAGS
// ============================================================================

export type ProtocolFlag =
  // Step 2 (Holding)
  | 'HOLDING_MISMATCH'
  | 'NEEDS_REVIEW'
  // Step 3 (Dicta)
  | 'DICTA_OVERRELIANCE'
  // Step 4 (Quote)
  | 'QUOTE_NOT_FOUND'
  // Step 5 (Bad Law)
  | 'OVERRULED'
  | 'EN_BANC_SUPERSEDED'
  | 'CIRCUIT_SPLIT'
  | 'PLURALITY_NOT_BINDING'
  | 'LEGISLATIVELY_SUPERSEDED'
  | 'DATA_SOURCE_CONFLICT'
  | 'AMENDED_OPINION'
  | 'WITHDRAWN_OPINION'
  // Step 1 (Existence)
  | 'EXISTENCE_FAILED'
  | 'INCOMPLETE_CITATION';

export type FlagSeverity = 'BLOCK' | 'FLAG' | 'NOTE';

export const FLAG_SEVERITY: Record<ProtocolFlag, FlagSeverity> = {
  // BLOCK = cannot use citation, must replace
  HOLDING_MISMATCH: 'BLOCK',
  QUOTE_NOT_FOUND: 'BLOCK',
  OVERRULED: 'BLOCK',
  WITHDRAWN_OPINION: 'BLOCK',
  EXISTENCE_FAILED: 'BLOCK',
  INCOMPLETE_CITATION: 'BLOCK',

  // FLAG = attorney must review before use
  NEEDS_REVIEW: 'FLAG',
  DICTA_OVERRELIANCE: 'FLAG',
  EN_BANC_SUPERSEDED: 'FLAG',
  PLURALITY_NOT_BINDING: 'FLAG',
  LEGISLATIVELY_SUPERSEDED: 'FLAG',
  DATA_SOURCE_CONFLICT: 'FLAG',
  CIRCUIT_SPLIT: 'FLAG',

  // NOTE = informational, citation can be used
  AMENDED_OPINION: 'NOTE',
};

// ============================================================================
// VERIFICATION STATUS CODES
// ============================================================================

export type CitationVerificationStatus =
  | 'VERIFIED'
  | 'VERIFIED_WITH_NOTES'
  | 'NEEDS_REVIEW'
  | 'FLAGGED'
  | 'BLOCKED'
  | 'EXISTENCE_FAILED'
  | 'HOLDING_MISMATCH'
  | 'QUOTE_NOT_FOUND'
  | 'OVERRULED'
  | 'PENDING'
  | 'SKIPPED'
  | 'API_ERROR';    // NOTE: api_error does NOT count toward verified minimums

/**
 * Only these statuses count toward the minimum citation requirement.
 * api_error and pending do NOT count.
 */
export const VERIFIED_STATUSES: CitationVerificationStatus[] = [
  'VERIFIED',
  'VERIFIED_WITH_NOTES',
];

// ============================================================================
// AUTHORITY LEVELS (CIV-009)
// ============================================================================

export type AuthorityLevel = 'BINDING' | 'PERSUASIVE';
export type FilingContext = 'STATE' | 'FEDERAL';

export interface AuthorityConfig {
  court: string;
  courtId: string;
  stateLevel: AuthorityLevel;
  federalLevel: AuthorityLevel;
}

/**
 * Authority matrix for Louisiana jurisdiction.
 * Per Clay's Part C §6 — BINDING.
 */
export const LOUISIANA_AUTHORITY_MATRIX: AuthorityConfig[] = [
  { court: 'U.S. Supreme Court', courtId: 'scotus', stateLevel: 'BINDING', federalLevel: 'BINDING' },
  { court: 'LA Supreme Court', courtId: 'la', stateLevel: 'BINDING', federalLevel: 'BINDING' },
  { court: 'LA Ct. App. (same circuit)', courtId: 'lactapp', stateLevel: 'BINDING', federalLevel: 'PERSUASIVE' },
  { court: 'LA Ct. App. (diff circuit)', courtId: 'lactapp_other', stateLevel: 'PERSUASIVE', federalLevel: 'PERSUASIVE' },
  { court: 'Fifth Circuit', courtId: 'ca5', stateLevel: 'PERSUASIVE', federalLevel: 'BINDING' },
  { court: 'Fed District (EDLA/MDLA/WDLA)', courtId: 'laed,lamd,lawd', stateLevel: 'PERSUASIVE', federalLevel: 'PERSUASIVE' },
];

/**
 * Determine authority level for a given court in a given filing context.
 */
export function getAuthorityLevel(
  courtId: string,
  filingContext: FilingContext
): AuthorityLevel {
  const entry = LOUISIANA_AUTHORITY_MATRIX.find(a =>
    a.courtId.split(',').some(id => courtId.toLowerCase().includes(id))
  );

  if (!entry) return 'PERSUASIVE'; // Unknown courts default to persuasive

  return filingContext === 'STATE' ? entry.stateLevel : entry.federalLevel;
}

// ============================================================================
// RELEVANCE SCORING WEIGHTS (CIV-006)
// ============================================================================

export const RELEVANCE_WEIGHTS = {
  KEYWORD_MATCH: 0.40,   // 40% — how well the case matches search terms
  COURT_WEIGHT: 0.30,    // 30% — binding > persuasive, higher court > lower
  RECENCY: 0.30,         // 30% — newer decisions preferred
} as const;

// ============================================================================
// HIGH_STAKES TIEBREAKER MATRIX (Clay's Part C — BINDING)
// ============================================================================

export type TiebreakerResult = 'VERIFIED' | 'VERIFIED_WITH_NOTES' | 'NEEDS_REVIEW' | 'HOLDING_MISMATCH';

/**
 * Resolve Stage 1 + Stage 2 results per the BINDING tiebreaker matrix.
 *
 * | Stage 1 (GPT)       | Stage 2 (Opus)  | Result            |
 * |---------------------|-----------------|-------------------|
 * | APPROVE (≥95%)      | APPROVE         | VERIFIED          |
 * | APPROVE (≥95%)      | FLAG/REJECT     | NEEDS_REVIEW      |
 * | UNCERTAIN (80-94%)  | APPROVE         | VERIFIED w/ note  |
 * | UNCERTAIN (80-94%)  | FLAG/REJECT     | NEEDS_REVIEW      |
 * | FAIL (<80%)         | Any             | HOLDING_MISMATCH  |
 */
export function resolveTiebreaker(
  stage1Confidence: number,
  stage2Approved: boolean,
  isHighStakes: boolean
): { result: TiebreakerResult; reason: string } {
  // Stage 1 FAIL
  if (stage1Confidence < CITATION_THRESHOLDS.HOLDING_FAIL) {
    return {
      result: 'HOLDING_MISMATCH',
      reason: `Stage 1 confidence ${stage1Confidence} below ${CITATION_THRESHOLDS.HOLDING_FAIL} threshold`,
    };
  }

  // Stage 1 APPROVE (≥95%)
  if (stage1Confidence >= CITATION_THRESHOLDS.HOLDING_PASS) {
    if (stage2Approved) {
      return { result: 'VERIFIED', reason: 'Both stages approve' };
    }
    // Stage 1 approve + Stage 2 flag/reject = NEEDS_REVIEW for HIGH_STAKES
    return {
      result: 'NEEDS_REVIEW',
      reason: 'Stage 1 approved but Stage 2 flagged — never auto-approve over Opus objection',
    };
  }

  // Stage 1 UNCERTAIN (80-94%)
  if (stage2Approved) {
    return {
      result: 'VERIFIED_WITH_NOTES',
      reason: `Stage 1 uncertain (${stage1Confidence}%) but Stage 2 approved`,
    };
  }

  return {
    result: 'NEEDS_REVIEW',
    reason: `Stage 1 uncertain (${stage1Confidence}%) and Stage 2 flagged`,
  };
}

// ============================================================================
// PROTOCOL RESULT INTERFACE
// ============================================================================

export interface ProtocolResult {
  protocol: number;
  triggered: boolean;
  flag?: ProtocolFlag;
  severity?: FlagSeverity;
  details: string;
  evidence: unknown;
}

// ============================================================================
// IMPORT-TIME VALIDATION
// ============================================================================

(function validateCitationConfig() {
  // Verify all thresholds are in valid range
  const { HOLDING_PASS, HOLDING_STAGE_2, HOLDING_FAIL } = CITATION_THRESHOLDS;
  if (HOLDING_PASS < HOLDING_STAGE_2) {
    throw new Error('[CIV_CONFIG] HOLDING_PASS must be >= HOLDING_STAGE_2');
  }
  if (HOLDING_STAGE_2 < HOLDING_FAIL) {
    throw new Error('[CIV_CONFIG] HOLDING_STAGE_2 must be >= HOLDING_FAIL');
  }

  // Verify relevance weights sum to 1.0
  const totalWeight = Object.values(RELEVANCE_WEIGHTS).reduce((a, b) => a + b, 0);
  if (Math.abs(totalWeight - 1.0) > 0.001) {
    throw new Error(`[CIV_CONFIG] Relevance weights must sum to 1.0, got ${totalWeight}`);
  }

  // Verify Protocol 7 thresholds increase with tier complexity
  if (PROTOCOL_7_THRESHOLDS.A >= PROTOCOL_7_THRESHOLDS.B ||
      PROTOCOL_7_THRESHOLDS.B >= PROTOCOL_7_THRESHOLDS.C) {
    throw new Error('[CIV_CONFIG] Protocol 7 thresholds must increase A < B < C');
  }

  // Verify batch sizes decrease with tier complexity
  if (CITATION_BATCH_SIZES.A <= CITATION_BATCH_SIZES.B ||
      CITATION_BATCH_SIZES.B <= CITATION_BATCH_SIZES.C) {
    throw new Error('[CIV_CONFIG] Batch sizes must decrease A > B > C');
  }
})();
