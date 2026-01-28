/**
 * Step 7: Output Compilation
 *
 * CIV Spec Section 10
 *
 * Aggregates results from Steps 1-6 and produces final verification status.
 *
 * Final status logic:
 * - step_1 = NOT_FOUND → BLOCKED (hallucinated citation)
 * - step_5 = OVERRULED → BLOCKED (bad law)
 * - step_2 = REJECTED → REJECTED (holding doesn't support proposition)
 * - step_3 = DICTA for PRIMARY_STANDARD → FLAGGED
 * - else → VERIFIED
 *
 * Calculates composite_confidence_score:
 * - Steps 1, 2, 5 weighted 2x (critical steps)
 * - Steps 3, 4, 6 weighted 1x (supporting steps)
 *
 * Writes to citation_verification_log table
 */

import { createClient } from '@/lib/supabase/server';
import type { Step1Result } from './step-1-existence';
import type { Step2Result } from './step-2-holding';
import type { Step3Result } from './step-3-dicta';
import type { Step4Result } from './step-4-quotes';
import type { Step5Result } from './step-5-bad-law';
import type { Step6Result } from './step-6-strength';

// ============================================================================
// TYPES
// ============================================================================

export type CompositeStatus = 'VERIFIED' | 'FLAGGED' | 'REJECTED' | 'BLOCKED';

export interface VerificationSteps {
  step_1: Step1Result;
  step_2: Step2Result;
  step_3: Step3Result;
  step_4: Step4Result | null; // null if no quote
  step_5: Step5Result;
  step_6: Step6Result;
}

export interface Step7Result {
  citation_string: string;
  normalized_citation: string;
  composite_status: CompositeStatus;
  composite_confidence: number; // 0-1
  blocking_reason: string | null;
  flags: string[];
  steps: VerificationSteps;
  recommendations: string[];
  verification_duration_ms: number;
  models_used: string[];
  api_calls_made: number;
  estimated_cost: number;
  logged_to_db: boolean;
}

// ============================================================================
// WEIGHT CONFIGURATION
// ============================================================================

const STEP_WEIGHTS = {
  step_1: 2.0, // Critical - existence
  step_2: 2.0, // Critical - holding verification
  step_3: 1.0, // Supporting - dicta detection
  step_4: 1.0, // Supporting - quote verification
  step_5: 2.0, // Critical - bad law check
  step_6: 1.0, // Supporting - authority strength
};

// ============================================================================
// STATUS DETERMINATION
// ============================================================================

function determineCompositeStatus(steps: VerificationSteps): {
  status: CompositeStatus;
  blockingReason: string | null;
  flags: string[];
} {
  const flags: string[] = [];
  let blockingReason: string | null = null;

  // BLOCKED: Step 1 NOT_FOUND (hallucinated citation)
  if (steps.step_1.result === 'NOT_FOUND' || steps.step_1.result === 'ERROR') {
    return {
      status: 'BLOCKED',
      blockingReason: 'Citation not found - possible hallucination. Verify citation exists.',
      flags: ['CITATION_NOT_FOUND'],
    };
  }

  // BLOCKED: Step 5 OVERRULED (bad law)
  if (steps.step_5.status === 'OVERRULED') {
    return {
      status: 'BLOCKED',
      blockingReason: `Case overruled by ${steps.step_5.overruled_by}. Do not cite.`,
      flags: ['CASE_OVERRULED'],
    };
  }

  // REJECTED: Step 2 REJECTED (holding doesn't support proposition)
  if (steps.step_2.result === 'REJECTED') {
    return {
      status: 'REJECTED',
      blockingReason: "Case holding does not support the claimed proposition.",
      flags: ['HOLDING_MISMATCH'],
    };
  }

  // FLAGGED: Step 3 DICTA for PRIMARY_STANDARD or REQUIRED_ELEMENT
  if (steps.step_3.classification !== 'HOLDING' && steps.step_3.action === 'FLAG') {
    flags.push('DICTA_WARNING');
    flags.push(`DICTA_${steps.step_3.classification}`);
  }

  // FLAGGED: Step 4 quote issues
  if (steps.step_4) {
    if (steps.step_4.result === 'NOT_FOUND') {
      flags.push('QUOTE_NOT_FOUND');
    } else if (steps.step_4.result === 'PARTIAL_MATCH') {
      flags.push('QUOTE_PARTIAL_MATCH');
    }
  }

  // FLAGGED: Step 5 negative treatment
  if (steps.step_5.status === 'NEGATIVE_TREATMENT') {
    flags.push('NEGATIVE_TREATMENT');
  } else if (steps.step_5.status === 'CAUTION') {
    flags.push('TREATMENT_CAUTION');
  }

  // FLAGGED: Step 6 low authority
  if (steps.step_6.classification === 'DECLINING') {
    flags.push('DECLINING_AUTHORITY');
  } else if (steps.step_6.classification === 'CONTROVERSIAL') {
    flags.push('CONTROVERSIAL_AUTHORITY');
  }

  // FLAGGED: Step 2 uncertain
  if (steps.step_2.result === 'UNCERTAIN') {
    flags.push('HOLDING_UNCERTAIN');
  }

  // FLAGGED: Unpublished opinion
  if (steps.step_1.result === 'UNPUBLISHED') {
    flags.push('UNPUBLISHED_OPINION');
  }

  // Determine final status based on flags
  if (flags.some(f => f.includes('DICTA') && steps.step_3.proposition_type !== 'SECONDARY' && steps.step_3.proposition_type !== 'CONTEXT')) {
    return {
      status: 'FLAGGED',
      blockingReason: null,
      flags,
    };
  }

  if (flags.includes('QUOTE_NOT_FOUND')) {
    return {
      status: 'FLAGGED',
      blockingReason: null,
      flags,
    };
  }

  if (flags.includes('NEGATIVE_TREATMENT')) {
    return {
      status: 'FLAGGED',
      blockingReason: null,
      flags,
    };
  }

  if (flags.length > 2) {
    return {
      status: 'FLAGGED',
      blockingReason: null,
      flags,
    };
  }

  // VERIFIED: No blocking issues
  return {
    status: 'VERIFIED',
    blockingReason: null,
    flags,
  };
}

// ============================================================================
// CONFIDENCE CALCULATION
// ============================================================================

function calculateCompositeConfidence(steps: VerificationSteps): number {
  let weightedSum = 0;
  let totalWeight = 0;

  // Step 1: Existence (binary - 1.0 if found, 0.0 if not)
  const step1Confidence = steps.step_1.result === 'VERIFIED' || steps.step_1.result === 'UNPUBLISHED' ? 1.0 : 0.0;
  weightedSum += step1Confidence * STEP_WEIGHTS.step_1;
  totalWeight += STEP_WEIGHTS.step_1;

  // Step 2: Holding verification
  weightedSum += steps.step_2.confidence * STEP_WEIGHTS.step_2;
  totalWeight += STEP_WEIGHTS.step_2;

  // Step 3: Dicta detection
  const step3Confidence = steps.step_3.classification === 'HOLDING' ? steps.step_3.confidence : steps.step_3.confidence * 0.7;
  weightedSum += step3Confidence * STEP_WEIGHTS.step_3;
  totalWeight += STEP_WEIGHTS.step_3;

  // Step 4: Quote verification (if applicable)
  if (steps.step_4) {
    const step4Confidence = steps.step_4.similarity_score / 100;
    weightedSum += step4Confidence * STEP_WEIGHTS.step_4;
    totalWeight += STEP_WEIGHTS.step_4;
  }

  // Step 5: Bad law check
  const step5Confidence = steps.step_5.status === 'GOOD_LAW' ? steps.step_5.confidence :
                          steps.step_5.status === 'CAUTION' ? steps.step_5.confidence * 0.7 :
                          steps.step_5.status === 'NEGATIVE_TREATMENT' ? 0.3 : 0.0;
  weightedSum += step5Confidence * STEP_WEIGHTS.step_5;
  totalWeight += STEP_WEIGHTS.step_5;

  // Step 6: Authority strength
  const step6Confidence = steps.step_6.strength_score / 100;
  weightedSum += step6Confidence * STEP_WEIGHTS.step_6;
  totalWeight += STEP_WEIGHTS.step_6;

  return Math.round((weightedSum / totalWeight) * 100) / 100;
}

// ============================================================================
// RECOMMENDATIONS GENERATION
// ============================================================================

function generateRecommendations(
  steps: VerificationSteps,
  status: CompositeStatus,
  flags: string[]
): string[] {
  const recommendations: string[] = [];

  // Based on status
  switch (status) {
    case 'BLOCKED':
      if (steps.step_1.result === 'NOT_FOUND') {
        recommendations.push('REMOVE citation or verify it exists in a legal database.');
        recommendations.push('Consider searching for the case by name if citation format may be incorrect.');
      }
      if (steps.step_5.status === 'OVERRULED') {
        recommendations.push(`REPLACE with current authority. ${steps.step_5.overruled_by} overruled this case.`);
        recommendations.push('If historical citation needed, add explicit note about overruling.');
      }
      break;

    case 'REJECTED':
      recommendations.push('REPLACE citation - holding does not support the proposition.');
      if (steps.step_3.alternative_citations?.length) {
        recommendations.push(`Consider alternatives: ${steps.step_3.alternative_citations.join(', ')}`);
      }
      break;

    case 'FLAGGED':
      if (flags.includes('DICTA_WARNING')) {
        recommendations.push(`REVIEW: Cited language appears to be ${steps.step_3.classification.toLowerCase()}, not holding.`);
        if (steps.step_3.proposition_type === 'PRIMARY_STANDARD') {
          recommendations.push('Find case where this is the actual holding for primary standards.');
        }
      }
      if (flags.includes('QUOTE_NOT_FOUND') && steps.step_4) {
        recommendations.push(`VERIFY quote: "${steps.step_4.original_quote.slice(0, 50)}..." not found in source.`);
        recommendations.push('Remove quote or verify page/citation reference.');
      }
      if (flags.includes('QUOTE_PARTIAL_MATCH') && steps.step_4?.corrected_quote) {
        recommendations.push(`CORRECT quote to: "${steps.step_4.corrected_quote.slice(0, 50)}..."`);
      }
      if (flags.includes('NEGATIVE_TREATMENT')) {
        recommendations.push(`CAUTION: Case has negative treatment. ${steps.step_5.recommendation}`);
      }
      if (flags.includes('UNPUBLISHED_OPINION')) {
        recommendations.push('NOTE: Unpublished opinion - check local rules for citability.');
      }
      break;

    case 'VERIFIED':
      if (steps.step_6.strength_score >= 80) {
        recommendations.push('Strong citation. Proceed with confidence.');
      } else if (steps.step_6.strength_score >= 60) {
        recommendations.push('Good citation. Consider adding supporting authority for key points.');
      } else {
        recommendations.push('Citation verified but authority strength is moderate. Add supporting citations if available.');
      }
      break;
  }

  // Add authority-specific recommendations
  if (steps.step_6.recommendation) {
    recommendations.push(steps.step_6.recommendation);
  }

  return recommendations;
}

// ============================================================================
// COST AND METRICS CALCULATION
// ============================================================================

function calculateMetrics(steps: VerificationSteps): {
  totalCost: number;
  modelsUsed: string[];
  apiCalls: number;
  totalDuration: number;
} {
  const modelsUsed = new Set<string>();
  let totalCost = 0;
  let apiCalls = 0;
  let totalDuration = 0;

  // Step 1
  totalDuration += steps.step_1.duration_ms;
  apiCalls += steps.step_1.pacer_used ? 2 : 1;

  // Step 2
  totalDuration += steps.step_2.duration_ms;
  totalCost += steps.step_2.total_cost;
  steps.step_2.models_used.forEach(m => modelsUsed.add(m));
  apiCalls += steps.step_2.stage_2_triggered ? (steps.step_2.tiebreaker_result ? 3 : 2) : 1;

  // Step 3
  totalDuration += steps.step_3.duration_ms;
  totalCost += steps.step_3.cost;
  modelsUsed.add(steps.step_3.model_used);
  apiCalls += 1;

  // Step 4
  if (steps.step_4) {
    totalDuration += steps.step_4.duration_ms;
    // Step 4 is algorithmic, no API cost
  }

  // Step 5
  totalDuration += steps.step_5.duration_ms;
  if (steps.step_5.layer_3_result) {
    totalCost += steps.step_5.layer_3_result.cost;
    modelsUsed.add(steps.step_5.layer_3_result.model_used);
    apiCalls += 1;
  }
  apiCalls += 2; // CourtListener calls for Layer 1

  // Step 6
  totalDuration += steps.step_6.duration_ms;
  apiCalls += 2; // CourtListener calls

  return {
    totalCost,
    modelsUsed: Array.from(modelsUsed),
    apiCalls,
    totalDuration,
  };
}

// ============================================================================
// MAIN OUTPUT COMPILATION FUNCTION
// ============================================================================

/**
 * Step 7: Compile verification output from all steps
 *
 * @param citationString - Original citation string
 * @param steps - Results from Steps 1-6
 * @param orderId - Order ID for logging
 * @param options - Additional options
 */
export async function compileVerificationOutput(
  citationString: string,
  steps: VerificationSteps,
  orderId: string,
  options?: {
    logToDb?: boolean;
  }
): Promise<Step7Result> {
  const startTime = Date.now();

  // Determine composite status
  const { status, blockingReason, flags } = determineCompositeStatus(steps);

  // Calculate composite confidence
  const compositeConfidence = calculateCompositeConfidence(steps);

  // Generate recommendations
  const recommendations = generateRecommendations(steps, status, flags);

  // Calculate metrics
  const metrics = calculateMetrics(steps);

  const result: Step7Result = {
    citation_string: citationString,
    normalized_citation: steps.step_1.normalized_citation,
    composite_status: status,
    composite_confidence: compositeConfidence,
    blocking_reason: blockingReason,
    flags,
    steps,
    recommendations,
    verification_duration_ms: metrics.totalDuration,
    models_used: metrics.modelsUsed,
    api_calls_made: metrics.apiCalls,
    estimated_cost: metrics.totalCost,
    logged_to_db: false,
  };

  // Log to database
  if (options?.logToDb) {
    try {
      await logFinalVerification(orderId, result);
      result.logged_to_db = true;
    } catch (error) {
      console.error('[Step7] Failed to log to database:', error);
    }
  }

  console.log(`[Step7] ${citationString.slice(0, 40)}...: ${status} (confidence: ${Math.round(compositeConfidence * 100)}%, cost: $${metrics.totalCost.toFixed(4)})`);

  return result;
}

// ============================================================================
// DATABASE LOGGING
// ============================================================================

async function logFinalVerification(
  orderId: string,
  result: Step7Result
): Promise<void> {
  const supabase = await createClient();

  // Log to citation_verification_log
  await supabase.from('citation_verification_log').insert({
    order_id: orderId,
    citation_text: result.citation_string,
    normalized_citation: result.normalized_citation,
    step_number: 7,
    step_name: 'output_compilation',
    status: result.composite_status,
    confidence: result.composite_confidence,
    duration_ms: result.verification_duration_ms,
    models_used: result.models_used,
    total_cost: result.estimated_cost,
    flags: result.flags,
    raw_response: {
      composite_status: result.composite_status,
      composite_confidence: result.composite_confidence,
      blocking_reason: result.blocking_reason,
      flags: result.flags,
      recommendations: result.recommendations,
      api_calls_made: result.api_calls_made,
      step_summaries: {
        step_1: { result: result.steps.step_1.result, source: result.steps.step_1.source },
        step_2: { result: result.steps.step_2.result, confidence: result.steps.step_2.confidence },
        step_3: { classification: result.steps.step_3.classification, action: result.steps.step_3.action },
        step_4: result.steps.step_4 ? { result: result.steps.step_4.result, similarity: result.steps.step_4.similarity_score } : null,
        step_5: { status: result.steps.step_5.status, overruled_by: result.steps.step_5.overruled_by },
        step_6: { classification: result.steps.step_6.classification, score: result.steps.step_6.strength_score },
      },
    },
  });

  // Also update verified_citations table for VPI cache
  if (result.composite_status === 'VERIFIED') {
    await supabase.from('verified_citations').upsert({
      normalized_citation: result.normalized_citation,
      original_citation: result.citation_string,
      courtlistener_id: result.steps.step_1.courtlistener_id,
      courtlistener_url: result.steps.step_1.courtlistener_url,
      case_name: result.steps.step_1.case_name,
      court: result.steps.step_1.court,
      vpi_verified: true,
      composite_confidence: result.composite_confidence,
      authority_classification: result.steps.step_6.classification,
      authority_score: result.steps.step_6.strength_score,
      verification_count: 1,
      last_verified_at: new Date().toISOString(),
    }, {
      onConflict: 'normalized_citation',
    });
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Check if a verification result is usable (not blocked or rejected)
 */
export function isUsable(result: Step7Result): boolean {
  return result.composite_status === 'VERIFIED' || result.composite_status === 'FLAGGED';
}

/**
 * Check if a verification result requires human review
 */
export function requiresReview(result: Step7Result): boolean {
  return result.composite_status === 'FLAGGED' ||
         result.flags.length > 0 ||
         result.composite_confidence < 0.7;
}

/**
 * Get severity level for a verification result
 */
export function getSeverity(result: Step7Result): 'critical' | 'warning' | 'info' | 'success' {
  switch (result.composite_status) {
    case 'BLOCKED':
      return 'critical';
    case 'REJECTED':
      return 'critical';
    case 'FLAGGED':
      return 'warning';
    case 'VERIFIED':
      return result.flags.length > 0 ? 'info' : 'success';
  }
}

/**
 * Format result for display
 */
export function formatResultSummary(result: Step7Result): string {
  const lines: string[] = [];

  lines.push(`Citation: ${result.citation_string}`);
  lines.push(`Status: ${result.composite_status} (${Math.round(result.composite_confidence * 100)}% confidence)`);

  if (result.blocking_reason) {
    lines.push(`Reason: ${result.blocking_reason}`);
  }

  if (result.flags.length > 0) {
    lines.push(`Flags: ${result.flags.join(', ')}`);
  }

  if (result.recommendations.length > 0) {
    lines.push('Recommendations:');
    result.recommendations.forEach(r => lines.push(`  - ${r}`));
  }

  return lines.join('\n');
}

export default {
  compileVerificationOutput,
  isUsable,
  requiresReview,
  getSeverity,
  formatResultSummary,
};
