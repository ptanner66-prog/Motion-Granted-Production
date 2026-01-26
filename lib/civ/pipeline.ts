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
      console.log('VPI cache hit, but continuing with full verification for freshness');
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
  modelsUsed.push(config.primaryModel);
  const step2 = await executeHoldingVerification(
    citation.citationString,
    citation.proposition,
    citation.propositionType,
    step1.courtlistenerId,
    undefined, // caselawId deprecated
    false // TODO: Pass tier info
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

  // Step 5: Bad Law Check
  const step5 = await executeBadLawCheck(
    citation.citationString,
    parsed.caseName || citation.caseName || 'Unknown Case',
    step1.courtlistenerId,
    citationDbId,
    citation.motionTypeContext || 'motion_to_compel' // Pass motion type for tier-based model selection
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
 */
export async function verifyBatch(
  request: BatchVerificationRequest
): Promise<BatchVerificationResult> {
  const { orderId, phase, citations, options = {} } = request;
  const {
    parallelLimit = DEFAULT_CIV_CONFIG.maxConcurrentVerifications,
  } = options;

  // Start verification run tracking
  const runResult = await startVerificationRun(orderId, phase, citations.length);
  const runId = runResult.data?.runId;

  const results: FinalVerificationOutput[] = [];
  let cacheHits = 0;

  // Process in batches
  for (let i = 0; i < citations.length; i += parallelLimit) {
    const batch = citations.slice(i, i + parallelLimit);

    const batchResults = await Promise.all(
      batch.map(citation => verifyCitation(citation, orderId, phase))
    );

    results.push(...batchResults);

    // Small delay between batches to avoid rate limiting
    if (i + parallelLimit < citations.length) {
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

  return {
    orderId,
    phase,
    totalCitations: citations.length,
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
  };
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
