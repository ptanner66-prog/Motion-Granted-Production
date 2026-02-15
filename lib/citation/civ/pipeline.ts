/**
 * CIV Pipeline Orchestrator
 *
 * The central orchestration layer for Citation Integrity Verification.
 * Processes each citation through the 7-step verification pipeline.
 *
 * CRITICAL: Each citation is verified in ISOLATION (separate API calls)
 * to ensure full attention and prevent context degradation.
 */

import { getOpinionWithText } from '@/lib/courtlistener/client';
// NOTE: Case.law API was sunset September 5, 2024
// import { getCaseText } from '@/lib/caselaw/client';
import {
  checkVPICache,
  getCitationByNormalized,
  startVerificationRun,
  completeVerificationRun,
  recordPropositionVerification,
} from './database';
import { executeExistenceCheck, normalizeAndParseCitation } from './steps/step-1-existence';
import { executeHoldingVerification } from './steps/step-2-holding';
import { executeDictaDetection, extractSurroundingContext } from './steps/step-3-dicta';
import { executeQuoteVerification } from './steps/step-4-quote';
import { executeBadLawCheck } from './steps/step-5-bad-law';
import { executeAuthorityStrength } from './steps/step-6-strength';
import { compileVerificationOutput, generateVerificationSummary } from './steps/step-7-output';
import {
  DEFAULT_CIV_CONFIG,
  type CitationToVerify,
  type BatchVerificationRequest,
  type BatchVerificationResult,
  type FinalVerificationOutput,
  type CIVConfig,
} from './types';
import {
  PROTOCOL_7_FAILURE_TYPES,
  PROTOCOL_7_THRESHOLDS,
  VERIFIED_STATUSES,
  type Tier,
  type CitationVerificationStatus,
} from '@/lib/config/citation-models';
import { getTierFromMotionType } from '@/lib/ai/model-router';
import { deduplicateCitations } from '@/lib/civ/deduplication';

import { createLogger } from '@/lib/security/logger';

const log = createLogger('citation-civ-pipeline');
/**
 * Verify a single citation through all 7 steps
 *
 * This is the core verification function that processes one citation in isolation.
 */
export async function verifyCitation(
  citation: CitationToVerify,
  orderId?: string,
  phase: 'V.1' | 'VII.1' = 'V.1',
  config: CIVConfig = DEFAULT_CIV_CONFIG
): Promise<FinalVerificationOutput> {
  const startTime = Date.now();
  const modelsUsed: string[] = [];
  let apiCallsMade = 0;

  // Check VPI cache first (if enabled)
  if (config.useVPICache) {
    const cacheResult = await checkVPICache(citation.proposition, citation.jurisdictionContext);

    if (cacheResult.success && cacheResult.data?.found) {
      // Cache hit - but still need to run bad law check (validity expires)
      // For now, log and continue with full verification
      // In future, implement partial cache usage
      log.info('VPI cache hit, but continuing with full verification for freshness');
    }
  }

  // Step 1: Existence Check
  const step1 = await executeExistenceCheck(citation.citationString, citation.caseName);
  apiCallsMade += step1.sourcesChecked.length;

  // If citation doesn't exist, short-circuit
  if (!step1.proceedToStep2) {
    // Create minimal outputs for remaining steps
    const minimalStep2 = {
      step: 2 as const,
      name: 'holding_verification' as const,
      proposition: citation.proposition,
      propositionType: citation.propositionType,
      stage1: {
        model: 'N/A',
        result: 'REJECTED' as const,
        confidence: 0,
        reasoning: 'Citation existence check failed',
      },
      finalResult: 'REJECTED' as const,
      finalConfidence: 0,
      proceedToStep3: false,
    };

    const minimalStep3 = {
      step: 3 as const,
      name: 'dicta_detection' as const,
      classification: 'UNCLEAR' as const,
      confidence: 0,
      reasoning: 'Skipped - citation not found',
      actionTaken: 'FLAG' as const,
      proceedToStep4: false,
    };

    const minimalStep4 = {
      step: 4 as const,
      name: 'quote_verification' as const,
      result: 'N/A' as const,
      actionTaken: 'NONE' as const,
      proceedToStep5: false,
    };

    const minimalStep5 = {
      step: 5 as const,
      name: 'bad_law_check' as const,
      layer1: { source: 'courtlistener' as const, negativeSignals: [] },
      layer2: { searchesRun: 0, status: 'GOOD_LAW' as const, confidence: 0, concerns: ['Citation not found'] },
      layer3: { inCuratedList: false },
      compositeStatus: 'GOOD_LAW' as const,
      confidence: 0,
      validUntil: '',
      actionTaken: 'FLAG' as const,
      proceedToStep6: false,
    };

    const minimalStep6 = {
      step: 6 as const,
      name: 'authority_strength' as const,
      stabilityClass: 'RECENT' as const,
      metrics: {
        caseAgeYears: 0,
        totalCitations: 0,
        citationsLast5Years: 0,
        citationsLast10Years: 0,
        citationTrend: 'STABLE' as const,
        distinguishCount: 0,
        distinguishRate: 0,
        criticismCount: 0,
      },
      strengthScore: 0,
      assessment: 'WEAK' as const,
      notes: 'Citation not found - no authority assessment possible',
    };

    return compileVerificationOutput(
      citation.citationString,
      citation.proposition,
      citation.propositionType,
      true, // Assume in citation bank
      step1,
      minimalStep2,
      minimalStep3,
      minimalStep4,
      minimalStep5,
      minimalStep6,
      {
        orderId,
        phase,
        startTime,
        modelsUsed,
        apiCallsMade,
      }
    );
  }

  // Get opinion text for subsequent steps
  // Primary source: CourtListener (Case.law API was sunset September 5, 2024)
  let opinionText: string | null = null;

  if (step1.courtlistenerId) {
    const clResult = await getOpinionWithText(step1.courtlistenerId);
    apiCallsMade++;
    if (clResult.success && clResult.data?.plain_text) {
      opinionText = clResult.data.plain_text;
    }
  }

  // NOTE: Case.law fallback removed - API sunset September 5, 2024
  // PACER does not provide full text, only document access

  // Get citation DB ID for recording
  let citationDbId: string | undefined;
  const dbCitation = await getCitationByNormalized(citation.citationString);
  if (dbCitation.success && dbCitation.data) {
    citationDbId = dbCitation.data.id;
  }

  // Parse citation for metadata
  const parsed = normalizeAndParseCitation(citation.citationString);

  // Step 2: Holding Verification
  // NOTE: caselawId parameter removed - Case.law API sunset September 5, 2024
  const citationTier = getTierFromMotionType(citation.motionTypeContext || 'motion_to_compel');
  modelsUsed.push(config.primaryModel);
  const step2 = await executeHoldingVerification(
    citation.citationString,
    citation.proposition,
    citation.propositionType,
    step1.courtlistenerId,
    undefined, // caselawId deprecated
    citationTier === 'C'
  );
  apiCallsMade++;

  if (step2.stage2?.triggered) {
    modelsUsed.push(config.adversarialModel);
    apiCallsMade++;
  }

  // Record proposition verification in VPI
  if (citationDbId) {
    await recordPropositionVerification({
      citationId: citationDbId,
      propositionText: citation.proposition,
      propositionType: citation.propositionType,
      jurisdictionContext: citation.jurisdictionContext,
      motionTypeContext: citation.motionTypeContext,
      verificationResult: step2.finalResult,
      confidenceScore: step2.finalConfidence,
      holdingVsDicta: step2.finalResult === 'DICTA_ONLY' ? 'DICTA' : 'HOLDING',
      supportingQuote: step2.stage1.supportingQuote,
      reasoning: step2.stage1.reasoning,
      stage1Result: step2.stage1.result,
      stage1Confidence: step2.stage1.confidence,
      stage2Triggered: step2.stage2?.triggered,
      stage2Result: step2.stage2?.result,
      stage2Confidence: step2.stage2?.challengeStrength,
      aiModelUsed: step2.stage2?.triggered ? config.adversarialModel : config.primaryModel,
      sourceOrderId: orderId,
    });
  }

  // Step 3: Dicta Detection
  modelsUsed.push(config.primaryModel);
  const surroundingContext = opinionText && step2.stage1.supportingQuote
    ? extractSurroundingContext(opinionText, step2.stage1.supportingQuote)
    : '';

  const step3 = await executeDictaDetection(
    parsed.caseName || citation.caseName || 'Unknown Case',
    step2.stage1.supportingQuote || citation.proposition,
    surroundingContext,
    citation.propositionType,
    citation.motionTypeContext || 'motion_to_compel' // Pass motion type for tier-based model selection
  );
  apiCallsMade++;

  // Step 4: Quote Verification
  const step4 = await executeQuoteVerification(citation.quoteInDraft, opinionText || undefined);
  // No API calls for quote verification (code-only)

  // Step 5: Bad Law Check + Protocols 18-23
  const step5 = await executeBadLawCheck(
    citation.citationString,
    parsed.caseName || citation.caseName || 'Unknown Case',
    step1.courtlistenerId,
    citationDbId,
    citation.motionTypeContext || 'motion_to_compel', // Pass motion type for tier-based model selection
    {
      // Protocol context from earlier steps
      isFromMajority: (step2 as any).stage_1?.is_from_majority ?? true,  // P20
      metadataConflict: false,  // P22: Step 1 doesn't currently detect this
      dictaConfidence: step3.confidence,  // P18
      propositionType: citation.propositionType,  // P18
    }
  );
  apiCallsMade += step5.layer2.searchesRun > 0 ? 1 : 0;

  // Short-circuit if overruled
  if (!step5.proceedToStep6) {
    const minimalStep6 = {
      step: 6 as const,
      name: 'authority_strength' as const,
      stabilityClass: 'DECLINING' as const,
      metrics: {
        caseAgeYears: parsed.year ? new Date().getFullYear() - parsed.year : 0,
        totalCitations: 0,
        citationsLast5Years: 0,
        citationsLast10Years: 0,
        citationTrend: 'DECLINING' as const,
        distinguishCount: 0,
        distinguishRate: 0,
        criticismCount: 0,
      },
      strengthScore: 0,
      assessment: 'WEAK' as const,
      notes: 'Case is no longer good law',
    };

    return compileVerificationOutput(
      citation.citationString,
      citation.proposition,
      citation.propositionType,
      true,
      step1,
      step2,
      step3,
      step4,
      step5,
      minimalStep6,
      {
        orderId,
        phase,
        startTime,
        modelsUsed,
        apiCallsMade,
      }
    );
  }

  // Step 6: Authority Strength
  // NOTE: caselawId parameter removed - Case.law API sunset September 5, 2024
  const step6 = await executeAuthorityStrength(
    citation.citationString,
    parsed.year || new Date().getFullYear(),
    step1.courtlistenerId,
    undefined, // caselawId deprecated
    citationDbId
  );
  apiCallsMade++;

  // Step 7: Compile Output
  return compileVerificationOutput(
    citation.citationString,
    citation.proposition,
    citation.propositionType,
    true, // Assume in citation bank for now
    step1,
    step2,
    step3,
    step4,
    step5,
    step6,
    {
      orderId,
      phase,
      startTime,
      modelsUsed,
      apiCallsMade,
    }
  );
}

/**
 * Verify a batch of citations
 *
 * Processes citations in parallel with configurable concurrency.
 * Each citation is verified in ISOLATION (separate API calls).
 *
 * CIV-008: Protocol 7 auto-pause when failure count exceeds tier threshold.
 * Failure types: EXISTENCE_FAILED + HOLDING_MISMATCH + QUOTE_NOT_FOUND
 * Thresholds: Tier A=2, Tier B=4, Tier C=6
 */
export async function verifyBatch(
  request: BatchVerificationRequest
): Promise<BatchVerificationResult & { protocol7?: Protocol7Result }> {
  const { orderId, phase, citations, options = {} } = request;
  const {
    parallelLimit = DEFAULT_CIV_CONFIG.maxConcurrentVerifications,
  } = options;

  // BUG-FIX-02: Deduplicate citations before CIV pipeline entry
  const rawCitationStrings = citations.map(c => c.citationString);
  const dedupResult = deduplicateCitations(rawCitationStrings);

  if (dedupResult.stats.duplicatesRemoved > 0 || dedupResult.stats.incompleteRemoved > 0) {
    log.info(
      `[CIV_PIPELINE] Deduplication: input=${dedupResult.stats.inputCount} ` +
      `unique=${dedupResult.stats.uniqueCount} ` +
      `duplicates_removed=${dedupResult.stats.duplicatesRemoved} ` +
      `incomplete_removed=${dedupResult.stats.incompleteRemoved}`
    );
  }

  // Filter citations to only include deduplicated unique ones
  const uniqueCitationStrings = new Set(dedupResult.unique.map(u => u.raw));
  const dedupedCitations = citations.filter(c => uniqueCitationStrings.has(c.citationString.trim()));

  // Determine tier from first citation's motion type (all should be same order)
  const motionType = dedupedCitations[0]?.motionTypeContext || 'motion_to_compel';
  const tier = getTierFromMotionType(motionType) as Tier;
  const failureThreshold = PROTOCOL_7_THRESHOLDS[tier];

  // Start verification run tracking (use deduped count)
  const runResult = await startVerificationRun(orderId, phase, dedupedCitations.length);
  const runId = runResult.data?.runId;

  const results: FinalVerificationOutput[] = [];
  const cacheHits = 0;

  // CIV-008: Protocol 7 failure tracking
  let failureCount = 0;
  let protocol7Paused = false;
  let pausedAtCitation = -1;

  // Process in batches (using deduplicated citations)
  for (let i = 0; i < dedupedCitations.length; i += parallelLimit) {
    // CIV-008: Check Protocol 7 threshold before processing batch
    if (failureCount >= failureThreshold) {
      protocol7Paused = true;
      pausedAtCitation = i;
      log.info(
        `[CIV_PIPELINE] PROTOCOL_7_PAUSE order=${orderId} tier=${tier} ` +
        `failures=${failureCount} threshold=${failureThreshold} ` +
        `paused_at_citation=${i}/${dedupedCitations.length}`
      );
      break;
    }

    const batch = dedupedCitations.slice(i, i + parallelLimit);

    const batchResults = await Promise.all(
      batch.map(citation => verifyCitation(citation, orderId, phase))
    );

    results.push(...batchResults);

    // CIV-008: Count failures in this batch
    for (const batchResult of batchResults) {
      const status = batchResult.compositeResult.status;
      if (isProtocol7Failure(status, batchResult)) {
        failureCount++;
      }
    }

    // Small delay between batches to avoid rate limiting
    if (i + parallelLimit < dedupedCitations.length) {
      await new Promise(resolve => setTimeout(resolve, DEFAULT_CIV_CONFIG.delayBetweenApiCalls));
    }
  }

  // Generate summary
  const summary = generateVerificationSummary(results);

  // Complete verification run tracking
  if (runId) {
    await completeVerificationRun(runId, {
      verifiedCount: summary.verified,
      flaggedCount: summary.flagged,
      rejectedCount: summary.rejected,
      blockedCount: summary.blocked,
      averageConfidence: summary.averageConfidence,
      totalApiCalls: results.reduce((sum, r) => sum + r.metadata.apiCallsMade, 0),
      totalCostEstimate: summary.estimatedTotalCost,
      fullResults: results,
    });
  }

  // CIV-008: Protocol 7 result
  const protocol7: Protocol7Result | undefined = protocol7Paused
    ? {
        triggered: true,
        failureCount,
        threshold: failureThreshold,
        tier,
        pausedAtCitation,
        totalCitations: dedupedCitations.length,
        processedCitations: results.length,
        remainingCitations: dedupedCitations.length - results.length,
        message: `Protocol 7 PAUSE: ${failureCount} failures (threshold: ${failureThreshold} for Tier ${tier}). ` +
          `Processed ${results.length}/${dedupedCitations.length} citations. Manual review required.`,
      }
    : undefined;

  if (protocol7Paused) {
    log.info(
      `[CIV_PIPELINE] Protocol 7 summary: ${protocol7!.message}`
    );
  }

  return {
    orderId,
    phase,
    totalCitations: dedupedCitations.length,
    verified: summary.verified,
    flagged: summary.flagged,
    rejected: summary.rejected,
    blocked: summary.blocked,
    results,
    summary: {
      averageConfidence: summary.averageConfidence,
      totalDurationMs: summary.totalDurationMs,
      totalApiCalls: results.reduce((sum, r) => sum + r.metadata.apiCallsMade, 0),
      estimatedTotalCost: summary.estimatedTotalCost,
      cacheHits,
    },
    protocol7,
  };
}

/**
 * Protocol 7 result interface
 */
export interface Protocol7Result {
  triggered: boolean;
  failureCount: number;
  threshold: number;
  tier: Tier;
  pausedAtCitation: number;
  totalCitations: number;
  processedCitations: number;
  remainingCitations: number;
  message: string;
}

/**
 * CIV-008: Determine if a verification result counts as a Protocol 7 failure.
 * Failure types: EXISTENCE_FAILED, HOLDING_MISMATCH, QUOTE_NOT_FOUND
 */
function isProtocol7Failure(
  status: string,
  result: FinalVerificationOutput
): boolean {
  // Check composite status against Protocol 7 failure types
  if (status === 'REJECTED' || status === 'BLOCKED') {
    // Check specific failure reasons from step results
    const step1Failed = result.verificationResults.step1Existence.result === 'NOT_FOUND';
    const step2Failed = result.verificationResults.step2Holding.finalResult === 'REJECTED';
    const step4Failed = result.verificationResults.step4Quote.result === 'NOT_FOUND';

    return step1Failed || step2Failed || step4Failed;
  }
  return false;
}

/**
 * Verify only NEW citations (for Phase VII.1)
 *
 * Compares citations against existing verified set and only
 * verifies those that are new.
 */
export async function verifyNewCitations(
  orderId: string,
  allCitations: CitationToVerify[],
  previouslyVerified: string[]
): Promise<BatchVerificationResult> {
  // Filter to only new citations
  const newCitations = allCitations.filter(
    c => !previouslyVerified.includes(c.citationString.toLowerCase())
  );

  if (newCitations.length === 0) {
    return {
      orderId,
      phase: 'VII.1',
      totalCitations: 0,
      verified: 0,
      flagged: 0,
      rejected: 0,
      blocked: 0,
      results: [],
      summary: {
        averageConfidence: 1,
        totalDurationMs: 0,
        totalApiCalls: 0,
        estimatedTotalCost: 0,
        cacheHits: 0,
      },
    };
  }

  return verifyBatch({
    orderId,
    phase: 'VII.1',
    citations: newCitations,
  });
}

/**
 * Quick verification for unauthorized citations
 *
 * When Claude cites a case NOT in the Citation Bank,
 * run a quick mini Phase IV verification.
 */
export async function verifyUnauthorizedCitation(
  citationString: string,
  proposition: string,
  orderId: string
): Promise<{
  approved: boolean;
  result: FinalVerificationOutput;
}> {
  const result = await verifyCitation(
    {
      citationString,
      proposition,
      propositionType: 'SECONDARY', // Conservative
    },
    orderId,
    'V.1'
  );

  // Approved if VERIFIED with confidence >= 80%
  const approved =
    result.compositeResult.status === 'VERIFIED' &&
    result.compositeResult.confidenceScore >= 0.80;

  return { approved, result };
}

// Re-export types for convenience
export type { CitationToVerify, BatchVerificationRequest, BatchVerificationResult, FinalVerificationOutput };
