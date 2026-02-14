/**
 * @deprecated LEGACY PATH B — Use lib/civ/ (Path A) instead.
 * This file is retained for reference only. Do not import in new code.
 * See CIV Pipeline Master Plan, Part 11: Dual Code Path Audit.
 *
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
import FlagManager from './flag-manager';
import { handleUnverifiable } from './decision-handlers';

import { createLogger } from '@/lib/security/logger';

const log = createLogger('citation-verification-pipeline');
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
  enableCaching?: boolean;
  retryConfig?: RetryConfig;
  flagManager?: FlagManager;
}

export interface BatchVerificationOptions extends VerificationOptions {
  concurrency?: number;
  onBatchProgress?: (completed: number, total: number) => void;
}

// ============================================================================
// RETRY CONFIGURATION (Task 38)
// ============================================================================

export interface RetryConfig {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  jitterPercent: number;
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelayMs: 1000, // 1 second
  maxDelayMs: 32000, // 32 seconds
  jitterPercent: 20, // ±20%
};

// Errors that are transient and should be retried
const RETRYABLE_ERRORS = [
  'ETIMEDOUT',
  'ECONNRESET',
  'ECONNREFUSED',
  'ENOTFOUND',
  'EAI_AGAIN',
  'socket hang up',
  'network timeout',
  'rate limit',
  '429',
  '503',
  '502',
  '504',
];

/**
 * Calculate delay with exponential backoff and jitter
 */
function calculateRetryDelay(
  attempt: number,
  config: RetryConfig = DEFAULT_RETRY_CONFIG
): number {
  // Exponential backoff: baseDelay * 2^attempt
  const exponentialDelay = config.baseDelayMs * Math.pow(2, attempt);
  const cappedDelay = Math.min(exponentialDelay, config.maxDelayMs);

  // Add jitter (±jitterPercent)
  const jitterMultiplier = 1 + (Math.random() - 0.5) * 2 * (config.jitterPercent / 100);
  const finalDelay = Math.round(cappedDelay * jitterMultiplier);

  return finalDelay;
}

/**
 * Check if error is retryable
 */
function isRetryableError(error: unknown): boolean {
  if (!error) return false;

  const errorMessage = error instanceof Error
    ? error.message.toLowerCase()
    : String(error).toLowerCase();

  return RETRYABLE_ERRORS.some(retryable =>
    errorMessage.includes(retryable.toLowerCase())
  );
}

/**
 * Execute function with retry logic
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  context: string,
  config: RetryConfig = DEFAULT_RETRY_CONFIG
): Promise<{ result: T | null; error?: Error; attempts: number }> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    try {
      const result = await fn();
      if (attempt > 0) {
        log.info(`[Pipeline] ${context} succeeded on attempt ${attempt + 1}`);
      }
      return { result, attempts: attempt + 1 };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (!isRetryableError(error) || attempt >= config.maxRetries) {
        log.error(`[Pipeline] ${context} failed after ${attempt + 1} attempts:`, lastError.message);
        return { result: null, error: lastError, attempts: attempt + 1 };
      }

      const delay = calculateRetryDelay(attempt, config);
      log.warn(`[Pipeline] ${context} failed (attempt ${attempt + 1}/${config.maxRetries + 1}), retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  return { result: null, error: lastError, attempts: config.maxRetries + 1 };
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
    log.info(`[Pipeline] Deduplicating request for: ${citation.slice(0, 40)}...`);
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
  const retryConfig = options?.retryConfig || DEFAULT_RETRY_CONFIG;
  const flagManager = options?.flagManager || await FlagManager.load(orderId);

  log.info(`[Pipeline] Starting verification for: ${citation.slice(0, 50)}...`);

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
    // STEP 1: Existence Check (with retry)
    // ========================================================================
    progress(1, 'Checking citation existence...');

    // Check cache first
    if (!options?.skipCache && options?.enableCaching !== false) {
      const cached = await getCachedExistenceResult(citation);
      if (cached) {
        log.info(`[Pipeline] Cache hit for: ${citation.slice(0, 40)}...`);
        step1Result = cached;
      } else {
        // Execute with retry logic
        const { result: step1WithRetry, error: step1Error, attempts: step1Attempts } = await withRetry(
          () => checkCitationExistence(citation, orderId, { logToDb: options?.logToDb }),
          'Step 1 (Existence)',
          retryConfig
        );

        if (step1WithRetry) {
          step1Result = step1WithRetry;
          // Cache successful results
          if (step1Result.result === 'VERIFIED' || step1Result.result === 'UNPUBLISHED') {
            await cacheExistenceResult(step1Result, orderId);
          }
        } else if (step1Error) {
          // Handle unverifiable - Decision 7
          const unverifiableResult = handleUnverifiable({
            citation,
            errorType: isRetryableError(step1Error) ? 'TIMEOUT' : 'API_ERROR',
            errorMessage: step1Error.message,
            retryCount: step1Attempts,
            maxRetries: retryConfig.maxRetries + 1,
          });
          if (unverifiableResult.flagCode) {
            flagManager.addFlag(unverifiableResult.flagCode, { citation, step: 1 });
          }
        }
      }
    } else {
      const { result: step1WithRetry, error: step1Error, attempts: step1Attempts } = await withRetry(
        () => checkCitationExistence(citation, orderId, { logToDb: options?.logToDb }),
        'Step 1 (Existence)',
        retryConfig
      );

      if (step1WithRetry) {
        step1Result = step1WithRetry;
      } else if (step1Error) {
        const unverifiableResult = handleUnverifiable({
          citation,
          errorType: isRetryableError(step1Error) ? 'TIMEOUT' : 'API_ERROR',
          errorMessage: step1Error.message,
          retryCount: step1Attempts,
          maxRetries: retryConfig.maxRetries + 1,
        });
        if (unverifiableResult.flagCode) {
          flagManager.addFlag(unverifiableResult.flagCode, { citation, step: 1 });
        }
      }
    }

    // Early termination if citation not found
    if (step1Result.result === 'NOT_FOUND' || step1Result.result === 'ERROR') {
      log.info(`[Pipeline] Early termination - citation not found: ${citation.slice(0, 40)}...`);

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
    // STEP 2: Holding Verification (with retry)
    // ========================================================================
    progress(2, 'Verifying holding supports proposition...');

    const opinionText = step1Result.opinion_text || '';
    const { result: step2WithRetry, error: step2Error } = await withRetry(
      () => verifyHolding(
        citation,
        proposition,
        opinionText,
        tier,
        orderId,
        { highStakes: options?.highStakes, logToDb: options?.logToDb }
      ),
      'Step 2 (Holding)',
      retryConfig
    );

    if (step2WithRetry) {
      step2Result = step2WithRetry;
    } else if (step2Error) {
      log.warn(`[Pipeline] Step 2 failed for ${citation.slice(0, 40)}..., continuing with defaults`);
      flagManager.addFlag('VERIFICATION_FAILED', {
        citation,
        step: 2,
        details: { error: step2Error.message },
      });
    }

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
    // STEP 5: Bad Law Check (with retry - critical step)
    // ========================================================================
    progress(5, 'Checking for bad law...');

    const { result: step5WithRetry, error: step5Error } = await withRetry(
      () => checkBadLaw(
        citation,
        step1Result.courtlistener_id,
        step1Result.case_name || null,
        opinionText,
        tier,
        orderId,
        { logToDb: options?.logToDb }
      ),
      'Step 5 (Bad Law)',
      retryConfig
    );

    if (step5WithRetry) {
      step5Result = step5WithRetry;
    } else if (step5Error) {
      log.warn(`[Pipeline] Step 5 failed for ${citation.slice(0, 40)}..., marking for review`);
      flagManager.addFlag('VERIFICATION_FAILED', {
        citation,
        step: 5,
        details: { error: step5Error.message },
      });
    }

    // Early termination if overruled
    if (step5Result.status === 'OVERRULED') {
      log.info(`[Pipeline] Early termination - case overruled: ${citation.slice(0, 40)}...`);
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

    // Add flags from verification result to flag manager
    for (const flag of compiled.flags) {
      if (!flagManager.hasFlag(flag, citation)) {
        flagManager.addFlag(flag, { citation });
      }
    }

    // Save flag manager state if modified
    if (flagManager.isModified()) {
      await flagManager.save();
    }

    const totalDuration = Date.now() - startTime;
    log.info(`[Pipeline] Completed in ${totalDuration}ms: ${citation.slice(0, 40)}... → ${compiled.composite_status}`);

    return {
      ...compiled,
      verified: compiled.composite_status === 'VERIFIED',
      canProceed: compiled.composite_status === 'VERIFIED' || compiled.composite_status === 'FLAGGED',
    };

  } catch (error) {
    log.error(`[Pipeline] Error verifying citation: ${error}`);

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

  log.info(`[Pipeline] Starting batch verification: ${citations.length} citations, concurrency ${concurrency}`);

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

  log.info(`[Pipeline] Batch complete: ${verified} verified, ${flagged} flagged, ${rejected} rejected, ${blocked} blocked`);
  log.info(`[Pipeline] Total cost: $${totalCost.toFixed(4)}`);

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
