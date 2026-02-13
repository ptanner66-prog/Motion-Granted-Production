/**
 * @deprecated LEGACY PATH B — Use lib/civ/ (Path A) instead.
 * This file is retained for reference only. Do not import in new code.
 * See CIV Pipeline Master Plan, Part 11: Dual Code Path Audit.
 *
 * Confidence Calculator (Task 36)
 *
 * Weighted Composite Confidence Score Calculation
 *
 * Weighting Strategy:
 * - Steps 1, 2, 5 at 2x weight (critical steps: existence, holding, bad law)
 * - Steps 3, 4, 6 at 1x weight (supporting steps: dicta, quotes, strength)
 *
 * Final score: 0-1 representing overall verification confidence
 *
 * Source: Chunk 5, Task 36 - Binding Citation Decisions
 */

// ============================================================================
// TYPES
// ============================================================================

export interface StepConfidences {
  step1_existence: number; // 0-1, binary (found or not)
  step2_holding: number; // 0-1, AI confidence in holding match
  step3_dicta?: number; // 0-1, confidence this is holding not dicta
  step4_quotes?: number; // 0-1, quote accuracy (similarity score)
  step5_bad_law: number; // 0-1, confidence case is good law
  step6_strength?: number; // 0-1, authority strength score
  step7_composite?: number; // Final output confidence (if already calculated)
}

export interface ConfidenceWeights {
  step1: number;
  step2: number;
  step3: number;
  step4: number;
  step5: number;
  step6: number;
}

export interface ConfidenceResult {
  compositeScore: number; // 0-1 final confidence
  weightedBreakdown: {
    step: string;
    rawScore: number;
    weight: number;
    weightedScore: number;
  }[];
  totalWeight: number;
  confidenceLevel: ConfidenceLevel;
  interpretation: string;
  thresholdsMet: {
    verification: boolean; // ≥0.70
    highConfidence: boolean; // ≥0.85
    criticalStepsPass: boolean; // Steps 1, 2, 5 all ≥0.60
  };
}

export type ConfidenceLevel = 'VERY_HIGH' | 'HIGH' | 'MODERATE' | 'LOW' | 'VERY_LOW';

// ============================================================================
// CONFIGURATION
// ============================================================================

// Default weights: Critical steps (1, 2, 5) at 2x, Supporting steps (3, 4, 6) at 1x
export const DEFAULT_WEIGHTS: ConfidenceWeights = {
  step1: 2.0, // Existence (critical)
  step2: 2.0, // Holding verification (critical)
  step3: 1.0, // Dicta detection (supporting)
  step4: 1.0, // Quote accuracy (supporting)
  step5: 2.0, // Bad law check (critical)
  step6: 1.0, // Authority strength (supporting)
};

// Confidence thresholds
const THRESHOLDS = {
  VERIFICATION_PASS: 0.70, // Minimum for verified status
  HIGH_CONFIDENCE: 0.85, // High confidence threshold
  CRITICAL_STEP_MIN: 0.60, // Minimum for critical steps
  VERY_HIGH: 0.90,
  HIGH: 0.75,
  MODERATE: 0.60,
  LOW: 0.40,
};

// ============================================================================
// MAIN CALCULATION FUNCTIONS
// ============================================================================

/**
 * Calculate weighted composite confidence score
 *
 * Formula: Σ(step_score × weight) / Σ(weights for included steps)
 */
export function calculateCompositeConfidence(
  confidences: StepConfidences,
  weights: ConfidenceWeights = DEFAULT_WEIGHTS
): ConfidenceResult {
  const breakdown: ConfidenceResult['weightedBreakdown'] = [];
  let weightedSum = 0;
  let totalWeight = 0;

  // Step 1: Existence (required, critical)
  if (typeof confidences.step1_existence === 'number') {
    const weighted = confidences.step1_existence * weights.step1;
    breakdown.push({
      step: 'step1_existence',
      rawScore: confidences.step1_existence,
      weight: weights.step1,
      weightedScore: weighted,
    });
    weightedSum += weighted;
    totalWeight += weights.step1;
  }

  // Step 2: Holding (required, critical)
  if (typeof confidences.step2_holding === 'number') {
    const weighted = confidences.step2_holding * weights.step2;
    breakdown.push({
      step: 'step2_holding',
      rawScore: confidences.step2_holding,
      weight: weights.step2,
      weightedScore: weighted,
    });
    weightedSum += weighted;
    totalWeight += weights.step2;
  }

  // Step 3: Dicta (optional, supporting)
  if (typeof confidences.step3_dicta === 'number') {
    const weighted = confidences.step3_dicta * weights.step3;
    breakdown.push({
      step: 'step3_dicta',
      rawScore: confidences.step3_dicta,
      weight: weights.step3,
      weightedScore: weighted,
    });
    weightedSum += weighted;
    totalWeight += weights.step3;
  }

  // Step 4: Quotes (optional, supporting)
  if (typeof confidences.step4_quotes === 'number') {
    const weighted = confidences.step4_quotes * weights.step4;
    breakdown.push({
      step: 'step4_quotes',
      rawScore: confidences.step4_quotes,
      weight: weights.step4,
      weightedScore: weighted,
    });
    weightedSum += weighted;
    totalWeight += weights.step4;
  }

  // Step 5: Bad Law (required, critical)
  if (typeof confidences.step5_bad_law === 'number') {
    const weighted = confidences.step5_bad_law * weights.step5;
    breakdown.push({
      step: 'step5_bad_law',
      rawScore: confidences.step5_bad_law,
      weight: weights.step5,
      weightedScore: weighted,
    });
    weightedSum += weighted;
    totalWeight += weights.step5;
  }

  // Step 6: Strength (optional, supporting)
  if (typeof confidences.step6_strength === 'number') {
    const weighted = confidences.step6_strength * weights.step6;
    breakdown.push({
      step: 'step6_strength',
      rawScore: confidences.step6_strength,
      weight: weights.step6,
      weightedScore: weighted,
    });
    weightedSum += weighted;
    totalWeight += weights.step6;
  }

  // Calculate composite score
  const compositeScore = totalWeight > 0 ? weightedSum / totalWeight : 0;

  // Determine confidence level
  const confidenceLevel = getConfidenceLevel(compositeScore);

  // Check thresholds
  const criticalStepsPass =
    (confidences.step1_existence >= THRESHOLDS.CRITICAL_STEP_MIN) &&
    (confidences.step2_holding >= THRESHOLDS.CRITICAL_STEP_MIN) &&
    (confidences.step5_bad_law >= THRESHOLDS.CRITICAL_STEP_MIN);

  return {
    compositeScore: Math.round(compositeScore * 1000) / 1000, // Round to 3 decimals
    weightedBreakdown: breakdown,
    totalWeight,
    confidenceLevel,
    interpretation: getInterpretation(compositeScore, confidenceLevel, criticalStepsPass),
    thresholdsMet: {
      verification: compositeScore >= THRESHOLDS.VERIFICATION_PASS,
      highConfidence: compositeScore >= THRESHOLDS.HIGH_CONFIDENCE,
      criticalStepsPass,
    },
  };
}

/**
 * Get confidence level from score
 */
function getConfidenceLevel(score: number): ConfidenceLevel {
  if (score >= THRESHOLDS.VERY_HIGH) return 'VERY_HIGH';
  if (score >= THRESHOLDS.HIGH) return 'HIGH';
  if (score >= THRESHOLDS.MODERATE) return 'MODERATE';
  if (score >= THRESHOLDS.LOW) return 'LOW';
  return 'VERY_LOW';
}

/**
 * Get human-readable interpretation
 */
function getInterpretation(
  score: number,
  level: ConfidenceLevel,
  criticalStepsPass: boolean
): string {
  const scorePercent = Math.round(score * 100);

  if (!criticalStepsPass) {
    return `${scorePercent}% confidence (${level}). WARNING: One or more critical steps (existence, holding, bad law) below minimum threshold.`;
  }

  switch (level) {
    case 'VERY_HIGH':
      return `${scorePercent}% confidence (${level}). Citation is strongly verified across all checks.`;
    case 'HIGH':
      return `${scorePercent}% confidence (${level}). Citation passes verification with good confidence.`;
    case 'MODERATE':
      return `${scorePercent}% confidence (${level}). Citation verification is acceptable but not strong. Consider additional review.`;
    case 'LOW':
      return `${scorePercent}% confidence (${level}). Citation has verification concerns. Attorney review recommended.`;
    case 'VERY_LOW':
      return `${scorePercent}% confidence (${level}). Citation fails verification. Should not be used without significant review.`;
  }
}

// ============================================================================
// SPECIALIZED CALCULATIONS
// ============================================================================

/**
 * Calculate quick confidence from minimal inputs
 * Used when not all steps have been completed
 */
export function calculateQuickConfidence(
  existence: boolean,
  holdingConfidence: number,
  isBadLaw: boolean
): number {
  // Simple weighted average of critical steps only
  const step1 = existence ? 1.0 : 0.0;
  const step2 = holdingConfidence;
  const step5 = isBadLaw ? 0.0 : 1.0;

  // Using critical weights only
  return (step1 * 2 + step2 * 2 + step5 * 2) / 6;
}

/**
 * Calculate confidence penalty for flags
 */
export function calculateFlagPenalty(flags: string[]): number {
  let penalty = 0;

  const PENALTY_VALUES: Record<string, number> = {
    // Blocking flags - severe penalty
    'BAD_LAW': 0.4,
    'HOLDING_MISMATCH': 0.3,
    'NOT_FOUND': 0.5,
    'FABRICATED': 0.5,
    'UNAUTHORIZED_CITATION': 0.4,

    // Review flags - moderate penalty
    'DICTA_WARNING': 0.15,
    'QUOTE_MISMATCH': 0.2,
    'WEAK_SUPPORT': 0.2,
    'UNPUBLISHED_OPINION': 0.1,

    // Info flags - minor penalty
    'AUTHORITY_DECLINING': 0.05,
    'NEGATIVE_TREATMENT': 0.1,
    'CITATION_FORMAT_WARNING': 0.02,
  };

  for (const flag of flags) {
    const flagPenalty = PENALTY_VALUES[flag] || 0;
    penalty = Math.min(1, penalty + flagPenalty); // Cap at 1
  }

  return penalty;
}

/**
 * Apply flag penalties to confidence score
 */
export function applyFlagPenalties(
  baseConfidence: number,
  flags: string[]
): { adjustedConfidence: number; penalty: number; penaltyBreakdown: Record<string, number> } {
  const penaltyBreakdown: Record<string, number> = {};
  let totalPenalty = 0;

  const PENALTY_VALUES: Record<string, number> = {
    'BAD_LAW': 0.4,
    'HOLDING_MISMATCH': 0.3,
    'NOT_FOUND': 0.5,
    'FABRICATED': 0.5,
    'UNAUTHORIZED_CITATION': 0.4,
    'DICTA_WARNING': 0.15,
    'QUOTE_MISMATCH': 0.2,
    'WEAK_SUPPORT': 0.2,
    'UNPUBLISHED_OPINION': 0.1,
    'AUTHORITY_DECLINING': 0.05,
    'NEGATIVE_TREATMENT': 0.1,
    'CITATION_FORMAT_WARNING': 0.02,
  };

  for (const flag of flags) {
    const penalty = PENALTY_VALUES[flag] || 0;
    if (penalty > 0) {
      penaltyBreakdown[flag] = penalty;
      totalPenalty += penalty;
    }
  }

  // Cap total penalty at 80% reduction
  totalPenalty = Math.min(0.8, totalPenalty);

  const adjustedConfidence = Math.max(0, baseConfidence * (1 - totalPenalty));

  return {
    adjustedConfidence: Math.round(adjustedConfidence * 1000) / 1000,
    penalty: totalPenalty,
    penaltyBreakdown,
  };
}

// ============================================================================
// TIER-BASED ADJUSTMENTS
// ============================================================================

/**
 * Adjust confidence thresholds based on motion tier
 * Tier C (high-stakes) has higher threshold requirements
 */
export function getTierThresholds(tier: 'A' | 'B' | 'C'): {
  verificationPass: number;
  highConfidence: number;
  criticalStepMin: number;
} {
  switch (tier) {
    case 'C':
      // Tier C: Higher stakes, stricter thresholds
      return {
        verificationPass: 0.80, // 80% minimum (vs 70% default)
        highConfidence: 0.90, // 90% for high (vs 85% default)
        criticalStepMin: 0.70, // 70% min for critical (vs 60% default)
      };
    case 'B':
      // Tier B: Standard thresholds
      return {
        verificationPass: 0.75,
        highConfidence: 0.87,
        criticalStepMin: 0.65,
      };
    case 'A':
    default:
      // Tier A: Default thresholds
      return {
        verificationPass: THRESHOLDS.VERIFICATION_PASS,
        highConfidence: THRESHOLDS.HIGH_CONFIDENCE,
        criticalStepMin: THRESHOLDS.CRITICAL_STEP_MIN,
      };
  }
}

/**
 * Check if confidence meets tier requirements
 */
export function meetsConfidenceRequirements(
  confidences: StepConfidences,
  tier: 'A' | 'B' | 'C'
): { meets: boolean; failures: string[] } {
  const thresholds = getTierThresholds(tier);
  const failures: string[] = [];

  // Calculate composite
  const result = calculateCompositeConfidence(confidences);

  // Check verification pass
  if (result.compositeScore < thresholds.verificationPass) {
    failures.push(
      `Composite score ${(result.compositeScore * 100).toFixed(1)}% below ` +
      `tier ${tier} minimum ${(thresholds.verificationPass * 100).toFixed(1)}%`
    );
  }

  // Check critical steps
  if (confidences.step1_existence < thresholds.criticalStepMin) {
    failures.push(`Step 1 (existence) below tier ${tier} minimum`);
  }
  if (confidences.step2_holding < thresholds.criticalStepMin) {
    failures.push(`Step 2 (holding) below tier ${tier} minimum`);
  }
  if (confidences.step5_bad_law < thresholds.criticalStepMin) {
    failures.push(`Step 5 (bad law) below tier ${tier} minimum`);
  }

  return {
    meets: failures.length === 0,
    failures,
  };
}

// ============================================================================
// AGGREGATE CALCULATIONS
// ============================================================================

/**
 * Calculate aggregate confidence for multiple citations
 */
export function calculateAggregateConfidence(
  citations: Array<{ confidence: number; weight?: number }>
): {
  average: number;
  minimum: number;
  maximum: number;
  median: number;
  standardDeviation: number;
  belowThreshold: number; // Count below verification threshold
} {
  if (citations.length === 0) {
    return {
      average: 0,
      minimum: 0,
      maximum: 0,
      median: 0,
      standardDeviation: 0,
      belowThreshold: 0,
    };
  }

  const scores = citations.map(c => c.confidence);
  const sorted = [...scores].sort((a, b) => a - b);

  // Weighted average
  let totalWeight = 0;
  let weightedSum = 0;
  for (const c of citations) {
    const w = c.weight || 1;
    weightedSum += c.confidence * w;
    totalWeight += w;
  }
  const average = weightedSum / totalWeight;

  // Standard deviation
  const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
  const squaredDiffs = scores.map(s => Math.pow(s - mean, 2));
  const avgSquaredDiff = squaredDiffs.reduce((a, b) => a + b, 0) / scores.length;
  const standardDeviation = Math.sqrt(avgSquaredDiff);

  // Median
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];

  // Count below threshold
  const belowThreshold = scores.filter(s => s < THRESHOLDS.VERIFICATION_PASS).length;

  return {
    average: Math.round(average * 1000) / 1000,
    minimum: sorted[0],
    maximum: sorted[sorted.length - 1],
    median: Math.round(median * 1000) / 1000,
    standardDeviation: Math.round(standardDeviation * 1000) / 1000,
    belowThreshold,
  };
}

/**
 * Get confidence summary for order
 */
export function getOrderConfidenceSummary(
  citationResults: Array<{ citation: string; confidence: number; flags: string[] }>
): {
  overallConfidence: number;
  distribution: Record<ConfidenceLevel, number>;
  blockingCount: number;
  reviewCount: number;
  passCount: number;
  lowestCitation: { citation: string; confidence: number } | null;
} {
  const aggregate = calculateAggregateConfidence(
    citationResults.map(c => ({ confidence: c.confidence }))
  );

  const distribution: Record<ConfidenceLevel, number> = {
    'VERY_HIGH': 0,
    'HIGH': 0,
    'MODERATE': 0,
    'LOW': 0,
    'VERY_LOW': 0,
  };

  let blockingCount = 0;
  let reviewCount = 0;
  let passCount = 0;
  let lowestCitation: { citation: string; confidence: number } | null = null;

  for (const result of citationResults) {
    const level = getConfidenceLevel(result.confidence);
    distribution[level]++;

    // Track lowest
    if (!lowestCitation || result.confidence < lowestCitation.confidence) {
      lowestCitation = { citation: result.citation, confidence: result.confidence };
    }

    // Categorize
    if (result.confidence >= THRESHOLDS.VERIFICATION_PASS) {
      passCount++;
    } else if (result.confidence >= THRESHOLDS.LOW) {
      reviewCount++;
    } else {
      blockingCount++;
    }
  }

  return {
    overallConfidence: aggregate.average,
    distribution,
    blockingCount,
    reviewCount,
    passCount,
    lowestCitation,
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  calculateCompositeConfidence,
  calculateQuickConfidence,
  calculateFlagPenalty,
  applyFlagPenalties,
  getTierThresholds,
  meetsConfidenceRequirements,
  calculateAggregateConfidence,
  getOrderConfidenceSummary,
  DEFAULT_WEIGHTS,
};
