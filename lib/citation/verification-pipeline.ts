/**
 * Citation Verification Pipeline Orchestrator
 *
 * Orchestrates all 7 steps of the CIV pipeline:
 * 1. Existence Check (CourtListener + PACER)
 * 2. Holding Verification (Two-stage AI)
 * 3. Dicta Detection
 * 4. Quote Verification (Levenshtein)
 * 5. Bad Law Check (3-layer)
 * 6. Authority Strength (algorithmic)
 * 7. Output Compilation
 *
 * Features:
 * - Batch processing with configurable concurrency
 * - Early termination (if Step 1 fails, skip Steps 2-6)
 * - Cost tracking across all steps
 * - Progress callbacks for UI updates
 * - Comprehensive error handling
 * - Request deduplication
 */

import { checkCitationExistence, getCachedExistenceResult, cacheExistenceResult, type Step1Result } from './steps/step-1-existence';
import { verifyHolding, type Step2Result } from './steps/step-2-holding';
import { detectDicta, type Step3Result } from './steps/step-3-dicta';
import { verifyQuote, hasDirectQuote, type Step4Result } from './steps/step-4-quotes';
import { checkBadLaw, type Step5Result } from './steps/step-5-bad-law';
import { assessAuthorityStrength, type Step6Result } from './steps/step-6-strength';
import { compileVerificationOutput, type Step7Result, type VerificationSteps } from './steps/step-7-output';
import { createClient } from '@/lib/supabase/server';
import type { MotionTier } from '@/types/workflow';

// ============================================================================
// TYPES
// ============================================================================

export interface CitationInput {
  citation: string;
  proposition: string;
  hasQuote?: boolean;
  quoteText?: string;
}

export interface VerificationOptions {
  highStakes?: boolean;
  skipCache?: boolean;
  logToDb?: boolean;
  onProgress?: (step: number, status: string) => void;
}

export interface BatchVerificationOptions extends VerificationOptions {
  concurrency?: number;
  onBatchProgress?: (completed: number, total: number) => void;
}

export interface VerificationResult extends Step7Result {
  // Aliases for backward compatibility
  verified: boolean;
  canProceed: boolean;
}

// ============================================================================
// IN-FLIGHT REQUEST DEDUPLICATION
// ============================================================================

const inFlightRequests = new Map<string, Promise<VerificationResult>>();

function getRequestKey(citation: string, proposition: string): string {
  return `${citation}::${proposition}`.toLowerCase();
}

// ============================================================================
// SINGLE CITATION VERIFICATION
// ============================================================================

/**
 * Verify a single citation through the full 7-step pipeline
 *
 * @param citation - The citation string to verify
 * @param proposition - The legal proposition claimed to be supported
 * @param orderId - Order ID for logging
 * @param tier - Motion tier (A, B, or C)
 * @param options - Additional options
 */
export async function verifyCitation(
  citation: string,
  proposition: string,
  orderId: string,
  tier: MotionTier,
  options?: VerificationOptions
): Promise<VerificationResult> {
  const requestKey = getRequestKey(citation, proposition);

  // Check for in-flight duplicate request
  const inFlight = inFlightRequests.get(requestKey);
  if (inFlight) {
    console.log(`[Pipeline] Deduplicating request for: ${citation.slice(0, 40)}...`);
    return inFlight;
  }

  // Create and track the request
  const requestPromise = runVerificationPipeline(citation, proposition, orderId, tier, options);
  inFlightRequests.set(requestKey, requestPromise);

  try {
    const result = await requestPromise;
    return result;
  } finally {
    inFlightRequests.delete(requestKey);
  }
}

/**
 * Internal pipeline execution
 */
async function runVerificationPipeline(
  citation: string,
  proposition: string,
  orderId: string,
  tier: MotionTier,
  options?: VerificationOptions
): Promise<VerificationResult> {
  const startTime = Date.now();
  const progress = options?.onProgress || (() => {});

  console.log(`[Pipeline] Starting verification for: ${citation.slice(0, 50)}...`);

  // Initialize step results with defaults
  let step1Result: Step1Result = {
    result: 'ERROR',
    courtlistener_id: null,
    courtlistener_url: null,
    pacer_used: false,
    confidence: 0,
    proceed_to_step_2: false,
    normalized_citation: citation,
    original_citation: citation,
    source: 'not_found',
    duration_ms: 0,
  };
  let step2Result: Step2Result = {
    result: 'UNCERTAIN',
    confidence: 0,
    stage_1_result: { model: '', verified: false, confidence: 0, reasoning: '', supporting_quote: null, tokens_used: 0, cost: 0, duration_ms: 0 },
    supporting_quote: null,
    models_used: [],
    total_cost: 0,
    total_tokens: 0,
    duration_ms: 0,
    stage_2_triggered: false,
  };
  let step3Result: Step3Result = {
    classification: 'HOLDING',
    proposition_type: 'SECONDARY',
    action: 'CONTINUE',
    confidence: 0,
    reasoning: 'Skipped - citation not found',
    model_used: '',
    cost: 0,
    tokens_used: 0,
    duration_ms: 0,
  };
  let step4Result: Step4Result | null = null;
  let step5Result: Step5Result = {
    status: 'GOOD_LAW',
    layer_1_result: { source: 'courtlistener', treatment: null, citing_cases_count: 0, negative_citations: 0, positive_citations: 0, has_subsequent_history: false },
    layer_2_result: { source: 'overruled_cases', match: false },
    layer_3_result: null,
    overruled_by: null,
    overruled_date: null,
    confidence: 0,
    recommendation: 'Skipped - citation not found',
    duration_ms: 0,
  };
  let step6Result: Step6Result = {
    classification: 'UNKNOWN',
    strength_score: 0,
    metrics: {
      total_citations: 0,
      citations_last_5_years: 0,
      citations_last_10_years: 0,
      distinguish_count: 0,
      criticism_count: 0,
      citation_trend: 'STABLE',
      case_age_years: 0,
      court_level: 'unknown',
      is_published: true,
    },
    recommendation: 'Skipped - citation not found',
    duration_ms: 0,
  };

  try {
    // ========================================================================
    // STEP 1: Existence Check
    // ========================================================================
    progress(1, 'Checking citation existence...');

    // Check cache first
    if (!options?.skipCache) {
      const cached = await getCachedExistenceResult(citation);
      if (cached) {
        console.log(`[Pipeline] Cache hit for: ${citation.slice(0, 40)}...`);
        step1Result = cached;
      } else {
        step1Result = await checkCitationExistence(citation, orderId, { logToDb: options?.logToDb });
        // Cache successful results
        if (step1Result.result === 'VERIFIED' || step1Result.result === 'UNPUBLISHED') {
          await cacheExistenceResult(step1Result, orderId);
        }
      }
    } else {
      step1Result = await checkCitationExistence(citation, orderId, { logToDb: options?.logToDb });
    }

    // Early termination if citation not found
    if (step1Result.result === 'NOT_FOUND' || step1Result.result === 'ERROR') {
      console.log(`[Pipeline] Early termination - citation not found: ${citation.slice(0, 40)}...`);

      const steps: VerificationSteps = {
        step_1: step1Result,
        step_2: step2Result,
        step_3: step3Result,
        step_4: null,
        step_5: step5Result,
        step_6: step6Result,
      };

      const compiled = await compileVerificationOutput(citation, steps, orderId, { logToDb: options?.logToDb });

      return {
        ...compiled,
        verified: false,
        canProceed: false,
      };
    }

    // ========================================================================
    // STEP 2: Holding Verification
    // ========================================================================
    progress(2, 'Verifying holding supports proposition...');

    const opinionText = step1Result.opinion_text || '';
    step2Result = await verifyHolding(
      citation,
      proposition,
      opinionText,
      tier,
      orderId,
      { highStakes: options?.highStakes, logToDb: options?.logToDb }
    );

    // ========================================================================
    // STEP 3: Dicta Detection
    // ========================================================================
    progress(3, 'Detecting dicta...');

    step3Result = await detectDicta(
      citation,
      proposition,
      opinionText,
      step2Result.supporting_quote,
      tier,
      orderId,
      { logToDb: options?.logToDb }
    );

    // ========================================================================
    // STEP 4: Quote Verification (if applicable)
    // ========================================================================
    if (options?.highStakes || hasDirectQuote(proposition)) {
      progress(4, 'Verifying quotes...');

      // Extract quote from proposition or use provided quote text
      const quoteToVerify = options?.highStakes && step2Result.supporting_quote
        ? step2Result.supporting_quote
        : extractQuoteFromText(proposition);

      if (quoteToVerify && opinionText) {
        step4Result = await verifyQuote(
          quoteToVerify,
          opinionText,
          citation,
          orderId,
          { logToDb: options?.logToDb }
        );
      }
    }

    // ========================================================================
    // STEP 5: Bad Law Check
    // ========================================================================
    progress(5, 'Checking for bad law...');

    step5Result = await checkBadLaw(
      citation,
      step1Result.courtlistener_id,
      step1Result.case_name || null,
      opinionText,
      tier,
      orderId,
      { logToDb: options?.logToDb }
    );

    // Early termination if overruled
    if (step5Result.status === 'OVERRULED') {
      console.log(`[Pipeline] Early termination - case overruled: ${citation.slice(0, 40)}...`);
    }

    // ========================================================================
    // STEP 6: Authority Strength
    // ========================================================================
    progress(6, 'Assessing authority strength...');

    step6Result = await assessAuthorityStrength(
      citation,
      step1Result.courtlistener_id,
      step1Result.date_filed || null,
      orderId,
      { logToDb: options?.logToDb }
    );

    // ========================================================================
    // STEP 7: Output Compilation
    // ========================================================================
    progress(7, 'Compiling results...');

    const steps: VerificationSteps = {
      step_1: step1Result,
      step_2: step2Result,
      step_3: step3Result,
      step_4: step4Result,
      step_5: step5Result,
      step_6: step6Result,
    };

    const compiled = await compileVerificationOutput(citation, steps, orderId, { logToDb: options?.logToDb });

    const totalDuration = Date.now() - startTime;
    console.log(`[Pipeline] Completed in ${totalDuration}ms: ${citation.slice(0, 40)}... → ${compiled.composite_status}`);

    return {
      ...compiled,
      verified: compiled.composite_status === 'VERIFIED',
      canProceed: compiled.composite_status === 'VERIFIED' || compiled.composite_status === 'FLAGGED',
    };

  } catch (error) {
    console.error(`[Pipeline] Error verifying citation: ${error}`);

    // Return error result
    const steps: VerificationSteps = {
      step_1: step1Result || {
        result: 'ERROR',
        courtlistener_id: null,
        courtlistener_url: null,
        pacer_used: false,
        confidence: 0,
        proceed_to_step_2: false,
        normalized_citation: citation,
        original_citation: citation,
        source: 'not_found',
        duration_ms: 0,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      step_2: step2Result,
      step_3: step3Result,
      step_4: step4Result,
      step_5: step5Result,
      step_6: step6Result,
    };

    const compiled = await compileVerificationOutput(citation, steps, orderId, { logToDb: options?.logToDb });

    return {
      ...compiled,
      verified: false,
      canProceed: false,
    };
  }
}

// ============================================================================
// BATCH VERIFICATION
// ============================================================================

/**
 * Verify multiple citations with configurable concurrency
 *
 * @param citations - Array of citations with their propositions
 * @param orderId - Order ID for logging
 * @param tier - Motion tier
 * @param options - Batch options including concurrency
 */
export async function verifyCitationBatch(
  citations: CitationInput[],
  orderId: string,
  tier: MotionTier,
  options?: BatchVerificationOptions
): Promise<VerificationResult[]> {
  const concurrency = options?.concurrency ?? 5;
  const results: VerificationResult[] = [];

  console.log(`[Pipeline] Starting batch verification: ${citations.length} citations, concurrency ${concurrency}`);

  for (let i = 0; i < citations.length; i += concurrency) {
    const batch = citations.slice(i, i + concurrency);

    const batchResults = await Promise.all(
      batch.map(c =>
        verifyCitation(c.citation, c.proposition, orderId, tier, {
          highStakes: options?.highStakes,
          skipCache: options?.skipCache,
          logToDb: options?.logToDb,
        })
      )
    );

    results.push(...batchResults);

    // Progress callback
    if (options?.onBatchProgress) {
      options.onBatchProgress(Math.min(i + concurrency, citations.length), citations.length);
    }

    // Small delay between batches to prevent overwhelming APIs
    if (i + concurrency < citations.length) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  // Summary logging
  const verified = results.filter(r => r.composite_status === 'VERIFIED').length;
  const flagged = results.filter(r => r.composite_status === 'FLAGGED').length;
  const rejected = results.filter(r => r.composite_status === 'REJECTED').length;
  const blocked = results.filter(r => r.composite_status === 'BLOCKED').length;
  const totalCost = results.reduce((sum, r) => sum + r.estimated_cost, 0);

  console.log(`[Pipeline] Batch complete: ${verified} verified, ${flagged} flagged, ${rejected} rejected, ${blocked} blocked`);
  console.log(`[Pipeline] Total cost: $${totalCost.toFixed(4)}`);

  return results;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Extract quoted text from a string
 */
function extractQuoteFromText(text: string): string | null {
  const quoteMatch = text.match(/"([^"]{20,})"/);
  return quoteMatch ? quoteMatch[1] : null;
}

/**
 * Get verification summary statistics
 */
export function getVerificationSummary(results: VerificationResult[]): {
  total: number;
  verified: number;
  flagged: number;
  rejected: number;
  blocked: number;
  averageConfidence: number;
  totalCost: number;
  totalDuration: number;
  passRate: number;
} {
  const verified = results.filter(r => r.composite_status === 'VERIFIED').length;
  const flagged = results.filter(r => r.composite_status === 'FLAGGED').length;
  const rejected = results.filter(r => r.composite_status === 'REJECTED').length;
  const blocked = results.filter(r => r.composite_status === 'BLOCKED').length;

  const totalConfidence = results.reduce((sum, r) => sum + r.composite_confidence, 0);
  const totalCost = results.reduce((sum, r) => sum + r.estimated_cost, 0);
  const totalDuration = results.reduce((sum, r) => sum + r.verification_duration_ms, 0);

  return {
    total: results.length,
    verified,
    flagged,
    rejected,
    blocked,
    averageConfidence: results.length > 0 ? totalConfidence / results.length : 0,
    totalCost,
    totalDuration,
    passRate: results.length > 0 ? ((verified + flagged) / results.length) * 100 : 0,
  };
}

/**
 * Filter results by status
 */
export function filterByStatus(
  results: VerificationResult[],
  status: 'VERIFIED' | 'FLAGGED' | 'REJECTED' | 'BLOCKED'
): VerificationResult[] {
  return results.filter(r => r.composite_status === status);
}

/**
 * Get citations that need attention (flagged or worse)
 */
export function getCitationsNeedingAttention(results: VerificationResult[]): VerificationResult[] {
  return results.filter(r =>
    r.composite_status === 'FLAGGED' ||
    r.composite_status === 'REJECTED' ||
    r.composite_status === 'BLOCKED'
  );
}

/**
 * Check if all citations in a batch pass
 */
export function allCitationsPass(results: VerificationResult[]): boolean {
  return results.every(r =>
    r.composite_status === 'VERIFIED' ||
    r.composite_status === 'FLAGGED' // Flagged can still proceed with review
  );
}

/**
 * Check if any citation is blocked (hard stop)
 */
export function hasCriticalIssue(results: VerificationResult[]): boolean {
  return results.some(r =>
    r.composite_status === 'BLOCKED' ||
    r.composite_status === 'REJECTED'
  );
}

// ============================================================================
// EXPORTS
// ============================================================================

export {
  type Step1Result,
  type Step2Result,
  type Step3Result,
  type Step4Result,
  type Step5Result,
  type Step6Result,
  type Step7Result,
  type VerificationSteps,
};

export default {
  verifyCitation,
  verifyCitationBatch,
  getVerificationSummary,
  filterByStatus,
  getCitationsNeedingAttention,
  allCitationsPass,
  hasCriticalIssue,
};
