/**
 * @deprecated LEGACY PATH B — Use lib/civ/ (Path A) instead.
 * This file is retained for reference only. Do not import in new code.
 * See CIV Pipeline Master Plan, Part 11: Dual Code Path Audit.
 *
 * Decision Handlers (Task 35)
 *
 * Handlers for Decisions 5-8 from Stress Testing
 *
 * Decision 5: Quote Accuracy Threshold (≥90% match required, else flag)
 * Decision 6: Partial Support Handling (citation supports only some of proposition - Flag for review)
 * Decision 7: Unverifiable Citation Protocol (API timeout/error - Flag but don't block)
 * Decision 8: Unauthorized Citation Detection (not in bank AND not self-verified - BLOCKING)
 *
 * Source: Chunk 5, Task 35 - Binding Citation Decisions
 */

import { enforceBankOnlyCitation } from '@/lib/citation/citation-bank';
import type { MotionTier } from '@/lib/ai/model-router';

// ============================================================================
// TYPES
// ============================================================================

export type DecisionType = 'QUOTE_ACCURACY' | 'PARTIAL_SUPPORT' | 'UNVERIFIABLE' | 'UNAUTHORIZED';

export type FlagCategory = 'BLOCKING' | 'ATTORNEY_REVIEW' | 'INFO';

export interface DecisionResult {
  decision: DecisionType;
  passed: boolean;
  flagCategory: FlagCategory | null;
  flagCode: string | null;
  reason: string;
  requiresAttorneyAction: boolean;
  blocksPipeline: boolean;
  metadata?: Record<string, unknown>;
}

export interface QuoteAccuracyInput {
  claimedQuote: string;
  actualText: string;
  similarity: number; // 0-1, from Levenshtein calculation
}

export interface PartialSupportInput {
  proposition: string;
  supportedParts: string[];
  unsupportedParts: string[];
  overallSupportPercentage: number; // 0-100
}

export interface UnverifiableInput {
  citation: string;
  errorType: 'TIMEOUT' | 'API_ERROR' | 'RATE_LIMITED' | 'NOT_FOUND' | 'PARSE_ERROR';
  errorMessage: string;
  retryCount: number;
  maxRetries: number;
}

export interface UnauthorizedInput {
  citation: string;
  proposition: string;
  inBank: boolean;
  miniPhaseIVAttempted: boolean;
  miniPhaseIVResult?: {
    verified: boolean;
    confidence: number;
    flags: string[];
  };
}

// ============================================================================
// DECISION 5: QUOTE ACCURACY THRESHOLD
// ============================================================================

// Thresholds for quote accuracy
const QUOTE_EXACT_THRESHOLD = 0.95; // ≥95% = EXACT match
const QUOTE_ACCEPTABLE_THRESHOLD = 0.90; // ≥90% = ACCEPTABLE
const QUOTE_CLOSE_THRESHOLD = 0.80; // ≥80% = CLOSE but needs review

/**
 * Decision 5: Quote Accuracy Threshold
 *
 * Rule: ≥90% match required, else flag for attorney review
 * Thresholds:
 * - ≥95%: EXACT - No flag
 * - 90-94%: ACCEPTABLE - INFO flag (minor discrepancy)
 * - 80-89%: CLOSE - ATTORNEY_REVIEW flag
 * - <80%: FAILED - BLOCKING flag (quote may be fabricated)
 */
export function handleQuoteAccuracy(input: QuoteAccuracyInput): DecisionResult {
  const { similarity, claimedQuote, actualText } = input;

  // EXACT: ≥95% similarity
  if (similarity >= QUOTE_EXACT_THRESHOLD) {
    return {
      decision: 'QUOTE_ACCURACY',
      passed: true,
      flagCategory: null,
      flagCode: null,
      reason: `Quote matches source text (${Math.round(similarity * 100)}% similarity)`,
      requiresAttorneyAction: false,
      blocksPipeline: false,
      metadata: {
        similarity,
        matchLevel: 'EXACT',
      },
    };
  }

  // ACCEPTABLE: 90-94% similarity
  if (similarity >= QUOTE_ACCEPTABLE_THRESHOLD) {
    return {
      decision: 'QUOTE_ACCURACY',
      passed: true,
      flagCategory: 'INFO',
      flagCode: 'QUOTE_MINOR_DISCREPANCY',
      reason: `Quote has minor discrepancy (${Math.round(similarity * 100)}% similarity). ` +
        'May be formatting or punctuation difference.',
      requiresAttorneyAction: false,
      blocksPipeline: false,
      metadata: {
        similarity,
        matchLevel: 'ACCEPTABLE',
        claimedQuote: claimedQuote.substring(0, 100) + '...',
        actualText: actualText.substring(0, 100) + '...',
      },
    };
  }

  // CLOSE: 80-89% similarity - Needs review
  if (similarity >= QUOTE_CLOSE_THRESHOLD) {
    return {
      decision: 'QUOTE_ACCURACY',
      passed: false,
      flagCategory: 'ATTORNEY_REVIEW',
      flagCode: 'QUOTE_MISMATCH',
      reason: `Quote differs from source (${Math.round(similarity * 100)}% similarity). ` +
        'Attorney should verify quote accuracy before submission.',
      requiresAttorneyAction: true,
      blocksPipeline: false,
      metadata: {
        similarity,
        matchLevel: 'CLOSE',
        claimedQuote: claimedQuote.substring(0, 200) + '...',
        actualText: actualText.substring(0, 200) + '...',
      },
    };
  }

  // FAILED: <80% similarity - Potential fabrication
  return {
    decision: 'QUOTE_ACCURACY',
    passed: false,
    flagCategory: 'BLOCKING',
    flagCode: 'QUOTE_FABRICATION_SUSPECTED',
    reason: `Quote significantly differs from source text (${Math.round(similarity * 100)}% similarity). ` +
      'This may be a fabricated or misremembered quote. BLOCKING until attorney verifies.',
    requiresAttorneyAction: true,
    blocksPipeline: true,
    metadata: {
      similarity,
      matchLevel: 'FAILED',
      claimedQuote,
      actualText,
    },
  };
}

// ============================================================================
// DECISION 6: PARTIAL SUPPORT HANDLING
// ============================================================================

// Thresholds for partial support
const PARTIAL_FULL_SUPPORT_THRESHOLD = 90; // ≥90% = Full support
const PARTIAL_ACCEPTABLE_THRESHOLD = 70; // ≥70% = Acceptable
const PARTIAL_MINIMUM_THRESHOLD = 50; // ≥50% = Minimum for review

/**
 * Decision 6: Partial Support Handling
 *
 * Rule: When citation supports only SOME of the proposition:
 * - ≥90%: Full support, no flag
 * - 70-89%: Partial support, INFO flag
 * - 50-69%: Weak support, ATTORNEY_REVIEW flag
 * - <50%: Insufficient support, BLOCKING flag
 */
export function handlePartialSupport(input: PartialSupportInput): DecisionResult {
  const { proposition, supportedParts, unsupportedParts, overallSupportPercentage } = input;

  // Full support: ≥90%
  if (overallSupportPercentage >= PARTIAL_FULL_SUPPORT_THRESHOLD) {
    return {
      decision: 'PARTIAL_SUPPORT',
      passed: true,
      flagCategory: null,
      flagCode: null,
      reason: `Citation fully supports proposition (${overallSupportPercentage}% support)`,
      requiresAttorneyAction: false,
      blocksPipeline: false,
      metadata: {
        supportPercentage: overallSupportPercentage,
        supportLevel: 'FULL',
        supportedParts,
      },
    };
  }

  // Acceptable partial: 70-89%
  if (overallSupportPercentage >= PARTIAL_ACCEPTABLE_THRESHOLD) {
    return {
      decision: 'PARTIAL_SUPPORT',
      passed: true,
      flagCategory: 'INFO',
      flagCode: 'PARTIAL_SUPPORT_DETECTED',
      reason: `Citation provides partial support (${overallSupportPercentage}%). ` +
        'Some elements of the proposition are not directly supported.',
      requiresAttorneyAction: false,
      blocksPipeline: false,
      metadata: {
        supportPercentage: overallSupportPercentage,
        supportLevel: 'PARTIAL_ACCEPTABLE',
        supportedParts,
        unsupportedParts,
        proposition: proposition.substring(0, 200),
      },
    };
  }

  // Weak support: 50-69% - Needs attorney review
  if (overallSupportPercentage >= PARTIAL_MINIMUM_THRESHOLD) {
    return {
      decision: 'PARTIAL_SUPPORT',
      passed: false,
      flagCategory: 'ATTORNEY_REVIEW',
      flagCode: 'WEAK_SUPPORT',
      reason: `Citation provides weak support (${overallSupportPercentage}%). ` +
        'Attorney should consider adding supporting citations or narrowing the proposition.',
      requiresAttorneyAction: true,
      blocksPipeline: false,
      metadata: {
        supportPercentage: overallSupportPercentage,
        supportLevel: 'WEAK',
        supportedParts,
        unsupportedParts,
        proposition,
        suggestion: 'Consider splitting proposition or adding additional citations.',
      },
    };
  }

  // Insufficient: <50% - BLOCKING
  return {
    decision: 'PARTIAL_SUPPORT',
    passed: false,
    flagCategory: 'BLOCKING',
    flagCode: 'INSUFFICIENT_SUPPORT',
    reason: `Citation does not adequately support proposition (${overallSupportPercentage}% support). ` +
      'The citation may be misapplied or the proposition needs reformulation.',
    requiresAttorneyAction: true,
    blocksPipeline: true,
    metadata: {
      supportPercentage: overallSupportPercentage,
      supportLevel: 'INSUFFICIENT',
      supportedParts,
      unsupportedParts,
      proposition,
    },
  };
}

// ============================================================================
// DECISION 7: UNVERIFIABLE CITATION PROTOCOL
// ============================================================================

// Maximum retries before giving up
const MAX_VERIFICATION_RETRIES = 3;

/**
 * Decision 7: Unverifiable Citation Protocol
 *
 * Rule: When API timeout or error prevents verification:
 * - Flag but don't block (allows motion to proceed)
 * - Mark for manual verification
 * - Log error for debugging
 */
export function handleUnverifiable(input: UnverifiableInput): DecisionResult {
  const { citation, errorType, errorMessage, retryCount, maxRetries } = input;

  // Check if we've exhausted retries
  const retriesExhausted = retryCount >= maxRetries;

  // Temporary errors that might succeed on retry
  const isTemporaryError = errorType === 'TIMEOUT' || errorType === 'RATE_LIMITED';

  // If retries not exhausted and it's a temporary error, suggest retry
  if (!retriesExhausted && isTemporaryError) {
    return {
      decision: 'UNVERIFIABLE',
      passed: false,
      flagCategory: 'INFO',
      flagCode: 'VERIFICATION_RETRY_PENDING',
      reason: `Verification temporarily failed (${errorType}). Retry ${retryCount + 1}/${maxRetries} pending.`,
      requiresAttorneyAction: false,
      blocksPipeline: false,
      metadata: {
        citation,
        errorType,
        errorMessage,
        retryCount,
        maxRetries,
        willRetry: true,
      },
    };
  }

  // NOT_FOUND is different - the citation might not exist
  if (errorType === 'NOT_FOUND') {
    return {
      decision: 'UNVERIFIABLE',
      passed: false,
      flagCategory: 'ATTORNEY_REVIEW',
      flagCode: 'CITATION_NOT_FOUND',
      reason: `Citation could not be found in legal databases. ` +
        'Please verify the citation is correct and exists.',
      requiresAttorneyAction: true,
      blocksPipeline: false, // Don't block, but require review
      metadata: {
        citation,
        errorType,
        errorMessage,
        databases_checked: ['CourtListener', 'PACER'],
      },
    };
  }

  // For exhausted retries or persistent errors - flag for manual review
  return {
    decision: 'UNVERIFIABLE',
    passed: false,
    flagCategory: 'ATTORNEY_REVIEW',
    flagCode: 'VERIFICATION_FAILED',
    reason: `Citation could not be verified after ${retryCount} attempts (${errorType}). ` +
      'Flagged for manual verification. Motion can proceed.',
    requiresAttorneyAction: true,
    blocksPipeline: false, // Per Decision 7: Flag but don't block
    metadata: {
      citation,
      errorType,
      errorMessage,
      retryCount,
      maxRetries,
      willRetry: false,
      note: 'Manual verification required before filing',
    },
  };
}

// ============================================================================
// DECISION 8: UNAUTHORIZED CITATION DETECTION
// ============================================================================

/**
 * Decision 8: Unauthorized Citation Detection
 *
 * Rule: Citation not in bank AND not self-verified = BLOCKING
 * This is the enforcement point for Decision 1 (Bank-Only).
 */
export function handleUnauthorized(input: UnauthorizedInput): DecisionResult {
  const { citation, proposition, inBank, miniPhaseIVAttempted, miniPhaseIVResult } = input;

  // If in bank, it's authorized
  if (inBank) {
    return {
      decision: 'UNAUTHORIZED',
      passed: true,
      flagCategory: null,
      flagCode: null,
      reason: 'Citation found in Phase IV citation bank',
      requiresAttorneyAction: false,
      blocksPipeline: false,
      metadata: {
        citation,
        source: 'phase_iv_bank',
      },
    };
  }

  // If Mini Phase IV was attempted and passed, it's authorized
  if (miniPhaseIVAttempted && miniPhaseIVResult?.verified) {
    return {
      decision: 'UNAUTHORIZED',
      passed: true,
      flagCategory: 'INFO',
      flagCode: 'VERIFIED_VIA_MINI_PHASE_IV',
      reason: `Citation verified via Mini Phase IV (${Math.round(miniPhaseIVResult.confidence * 100)}% confidence)`,
      requiresAttorneyAction: false,
      blocksPipeline: false,
      metadata: {
        citation,
        source: 'mini_phase_iv',
        confidence: miniPhaseIVResult.confidence,
        flags: miniPhaseIVResult.flags,
      },
    };
  }

  // Mini Phase IV attempted but failed
  if (miniPhaseIVAttempted && !miniPhaseIVResult?.verified) {
    return {
      decision: 'UNAUTHORIZED',
      passed: false,
      flagCategory: 'BLOCKING',
      flagCode: 'UNAUTHORIZED_CITATION_BLOCKED',
      reason: `Citation not in bank and failed Mini Phase IV verification. ` +
        'BLOCKING: Cannot use unverified citations.',
      requiresAttorneyAction: true,
      blocksPipeline: true,
      metadata: {
        citation,
        proposition,
        miniPhaseIVFlags: miniPhaseIVResult?.flags,
        miniPhaseIVConfidence: miniPhaseIVResult?.confidence,
      },
    };
  }

  // Mini Phase IV not yet attempted - needs verification
  return {
    decision: 'UNAUTHORIZED',
    passed: false,
    flagCategory: 'ATTORNEY_REVIEW',
    flagCode: 'CITATION_NEEDS_VERIFICATION',
    reason: 'Citation not found in Phase IV bank. Mini Phase IV verification required.',
    requiresAttorneyAction: true,
    blocksPipeline: false, // Don't block yet, allow Mini Phase IV attempt
    metadata: {
      citation,
      proposition,
      nextStep: 'Execute Mini Phase IV verification',
    },
  };
}

/**
 * Full unauthorized citation check with Mini Phase IV execution
 */
export async function handleUnauthorizedWithVerification(
  citation: string,
  proposition: string,
  orderId: string,
  tier: MotionTier
): Promise<DecisionResult> {
  // Use citation-bank enforcement which includes Mini Phase IV
  const result = await enforceBankOnlyCitation(citation, proposition, orderId, tier);

  if (result.allowed) {
    return handleUnauthorized({
      citation,
      proposition,
      inBank: !result.miniPhaseIVResult, // If no Mini Phase IV, it was in bank
      miniPhaseIVAttempted: !!result.miniPhaseIVResult,
      miniPhaseIVResult: result.miniPhaseIVResult
        ? {
            verified: result.miniPhaseIVResult.verified,
            confidence: result.miniPhaseIVResult.verificationResult?.confidence || 0,
            flags: result.miniPhaseIVResult.verificationResult?.flags || [],
          }
        : undefined,
    });
  }

  // Not allowed - blocked
  return {
    decision: 'UNAUTHORIZED',
    passed: false,
    flagCategory: 'BLOCKING',
    flagCode: 'UNAUTHORIZED_CITATION_BLOCKED',
    reason: result.reason,
    requiresAttorneyAction: true,
    blocksPipeline: true,
    metadata: {
      citation,
      proposition,
      miniPhaseIVResult: result.miniPhaseIVResult,
    },
  };
}

// ============================================================================
// UNIFIED DECISION HANDLER
// ============================================================================

export type DecisionInput =
  | { type: 'QUOTE_ACCURACY'; data: QuoteAccuracyInput }
  | { type: 'PARTIAL_SUPPORT'; data: PartialSupportInput }
  | { type: 'UNVERIFIABLE'; data: UnverifiableInput }
  | { type: 'UNAUTHORIZED'; data: UnauthorizedInput };

/**
 * Unified handler for all decision types
 */
export function handleDecision(input: DecisionInput): DecisionResult {
  switch (input.type) {
    case 'QUOTE_ACCURACY':
      return handleQuoteAccuracy(input.data);
    case 'PARTIAL_SUPPORT':
      return handlePartialSupport(input.data);
    case 'UNVERIFIABLE':
      return handleUnverifiable(input.data);
    case 'UNAUTHORIZED':
      return handleUnauthorized(input.data);
    default:
      throw new Error(`Unknown decision type: ${(input as DecisionInput).type}`);
  }
}

// ============================================================================
// BATCH PROCESSING
// ============================================================================

/**
 * Process multiple decisions and aggregate results
 */
export function processDecisions(inputs: DecisionInput[]): {
  results: DecisionResult[];
  summary: {
    total: number;
    passed: number;
    failed: number;
    blocking: number;
    requiresAttorney: number;
  };
  blockingFlags: string[];
  reviewFlags: string[];
} {
  const results = inputs.map(input => handleDecision(input));

  const blocking = results.filter(r => r.blocksPipeline);
  const requiresAttorney = results.filter(r => r.requiresAttorneyAction);

  return {
    results,
    summary: {
      total: results.length,
      passed: results.filter(r => r.passed).length,
      failed: results.filter(r => !r.passed).length,
      blocking: blocking.length,
      requiresAttorney: requiresAttorney.length,
    },
    blockingFlags: blocking.map(r => r.flagCode).filter((f): f is string => f !== null),
    reviewFlags: requiresAttorney
      .filter(r => !r.blocksPipeline)
      .map(r => r.flagCode)
      .filter((f): f is string => f !== null),
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  handleQuoteAccuracy,
  handlePartialSupport,
  handleUnverifiable,
  handleUnauthorized,
  handleUnauthorizedWithVerification,
  handleDecision,
  processDecisions,
};
