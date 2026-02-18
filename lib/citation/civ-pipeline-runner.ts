/**
 * CIV Pipeline Runner — Production Wrapper
 *
 * WHAT THIS DOES:
 * Takes raw citation strings extracted from a motion draft,
 * deduplicates them, then runs EACH citation through the full
 * 7-step CIV pipeline:
 *
 *   Step 1: EXISTENCE CHECK (CourtListener v4 → v3 → Case.law)
 *   Step 2: HOLDING VERIFICATION (GPT-4 Turbo Stage 1, Opus Stage 2)
 *   Step 3: DICTA DETECTION (Protocol 18)
 *   Step 4: QUOTE VERIFICATION (verbatim match)
 *   Step 5: BAD LAW CHECK (Protocols 19-23)
 *   Step 6: AUTHORITY STRENGTH
 *   Step 7: OUTPUT JSON
 *
 * WHY THIS FILE EXISTS:
 * The CIV pipeline at lib/citation/civ/pipeline.ts is BUILT but was
 * not reliably reaching the workflow. Phase V.1 had a fallback path
 * that silently degraded to shallow CourtListener existence checks
 * when the pipeline errored. This wrapper:
 * 1. Calls deduplication FIRST (prevents BUG 2: phantom duplicates)
 * 2. Calls the FULL pipeline via verifyBatch() (fixes BUG 1: pipeline bypass)
 * 3. Returns structured results with proposition verification status
 * 4. Enforces hard gates (no motion passes with unverified propositions)
 * 5. NEVER falls back to shallow checks — errors are propagated, not hidden
 *
 * AUDIT TRAIL: Every decision logged with order_id, citation, step, result.
 *
 * EMERGENCY FIX: 2026-02-17 — Addresses AUDIT-002 / A5-001
 */

import { verifyBatch } from '@/lib/civ';
import { deduplicateCitations, type DeduplicationResult } from '@/lib/civ/deduplication';
import type {
  CitationToVerify,
  BatchVerificationResult,
  FinalVerificationOutput,
  VerificationStatus,
  HoldingVerificationResult as CIVHoldingResult,
  PropositionType,
} from '@/lib/citation/civ/types';

// ============================================================================
// TYPES
// ============================================================================

export type HoldingClassification =
  | 'EXACT'       // Directly states proposition (maps from VERIFIED)
  | 'CONSISTENT'  // Supports with different language (maps from VERIFIED with lower confidence)
  | 'OVERSTATED'  // Goes beyond holding (maps from PARTIAL with overstated flags)
  | 'PARTIAL'     // Supports part of proposition (maps from PARTIAL)
  | 'CONTRARY'    // Contradicts proposition (maps from REJECTED)
  | 'UNVERIFIED'  // Could not verify (opinion text unavailable)
  | 'NOT_FOUND';  // Case does not exist in any database

export interface PropositionVerification {
  citation: string;
  proposition: string;
  classification: HoldingClassification;
  confidence: number;
  stage2Triggered: boolean;
  stage2Result?: {
    classification: HoldingClassification;
    reasoning: string;
    overrodeStage1: boolean;
  };
  isHighStakes: boolean;
}

export interface CIVStepResult {
  step: number;
  stepName: string;
  passed: boolean;
  details: Record<string, unknown>;
  duration_ms: number;
}

export interface CitationVerificationResult {
  citation: string;
  caseName: string;
  courtlistenerId: string | null;
  opinionUrl: string | null;
  exists: boolean;
  propositionVerification: PropositionVerification | null;
  dictaClassification: 'HOLDING' | 'DICTUM' | 'AMBIGUOUS' | null;
  quoteVerified: boolean | null;
  badLawFlags: string[];
  overallStatus: 'PASS' | 'FAIL' | 'FLAG' | 'NOT_FOUND';
  failReasons: string[];
  flagReasons: string[];
  steps: CIVStepResult[];
  isHighStakes: boolean;
}

export interface CIVPipelineOutput {
  orderId: string;
  phase: 'V.1' | 'VII.1' | 'IX.1';
  tier: 'A' | 'B' | 'C' | 'D';
  timestamp: string;
  durationMs: number;

  // Deduplication results
  dedup: {
    inputCount: number;
    uniqueCount: number;
    duplicatesRemoved: number;
    incompleteRemoved: number;
  };

  // Per-citation results
  results: CitationVerificationResult[];

  // Aggregate
  summary: {
    total: number;
    passed: number;
    failed: number;
    flagged: number;
    notFound: number;
    holdingMismatches: number;
    verificationRate: string;
  };

  // Hard gate
  passesHardGate: boolean;
  hardGateFailReasons: string[];

  // Full pipeline ran?
  usedCIVPipeline: true; // ALWAYS true from this runner. Literal `true`, not a variable.

  // Raw batch result from canonical pipeline (for audit)
  rawBatchResult: BatchVerificationResult | null;
}

// ============================================================================
// HIGH_STAKES IDENTIFICATION
// ============================================================================

/**
 * Identify if a citation is HIGH_STAKES per Architecture Section 8.
 * HIGH_STAKES citations ALWAYS get Stage 2 adversarial review.
 */
export function isHighStakesCitation(
  citation: string,
  context: {
    isFirstForStandard: boolean;
    isSoleAuthority: boolean;
    establishesJurisdiction: boolean;
    establishesElements: boolean;
    occurrenceCount: number;
    tier: 'A' | 'B' | 'C' | 'D';
  }
): boolean {
  if (context.tier === 'C' || context.tier === 'D') return true;
  if (context.isFirstForStandard) return true;
  if (context.isSoleAuthority) return true;
  if (context.establishesJurisdiction) return true;
  if (context.establishesElements) return true;
  if (context.occurrenceCount > 1) return true;
  return false;
}

// ============================================================================
// PROPOSITION EXTRACTOR
// ============================================================================

/**
 * Extract the proposition that the motion claims each citation supports.
 *
 * Scans the draft text for each citation and extracts the sentence(s)
 * immediately before or containing the citation, which represent the legal
 * proposition the citation is being used to support.
 *
 * CRITICAL: Without proposition extraction, we can only verify case EXISTENCE,
 * not that the case actually SUPPORTS what the motion claims. This is the
 * exact gap that caused BUG 1.
 */
export function extractPropositions(
  draftText: string,
  citations: string[]
): Map<string, string> {
  const propositions = new Map<string, string>();

  for (const citation of citations) {
    const escapedCit = citation.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const citRegex = new RegExp(escapedCit, 'i');
    const match = citRegex.exec(draftText);

    if (!match) {
      propositions.set(citation, '[PROPOSITION NOT FOUND IN DRAFT]');
      continue;
    }

    const effectiveIndex = match.index;

    // Extract surrounding context (2 sentences before, 1 after)
    const beforeText = draftText.substring(
      Math.max(0, effectiveIndex - 500),
      effectiveIndex
    );
    const afterText = draftText.substring(
      effectiveIndex,
      Math.min(draftText.length, effectiveIndex + 200)
    );

    // Get the last 1-2 sentences before the citation
    const sentences = beforeText.split(/(?<=[.!?])\s+/);
    const relevantSentences = sentences.slice(-2).join(' ').trim();

    if (relevantSentences.length > 0) {
      propositions.set(citation, relevantSentences);
    } else {
      // Fallback: use text around the citation
      propositions.set(citation, afterText.substring(0, 200).trim());
    }
  }

  return propositions;
}

// ============================================================================
// TYPE MAPPERS — Canonical CIV types → CIV Pipeline Runner types
// ============================================================================

/**
 * Map canonical CIV HoldingVerificationResult to our HoldingClassification.
 */
function mapHoldingResult(
  civResult: CIVHoldingResult,
  confidence: number,
  flags: FinalVerificationOutput['compositeResult']['flags']
): HoldingClassification {
  const hasOverstatedFlag = flags.some(f => f.type === 'PARTIAL_SUPPORT');
  const hasHoldingMismatch = flags.some(f => f.type === 'HOLDING_MISMATCH');

  if (hasHoldingMismatch) return 'CONTRARY';

  switch (civResult) {
    case 'VERIFIED':
      return confidence >= 0.90 ? 'EXACT' : 'CONSISTENT';
    case 'PARTIAL':
      return hasOverstatedFlag ? 'OVERSTATED' : 'PARTIAL';
    case 'REJECTED':
      return 'CONTRARY';
    case 'DICTA_ONLY':
      return 'PARTIAL';
    default:
      return 'UNVERIFIED';
  }
}

/**
 * Map canonical CIV VerificationStatus to our overallStatus.
 */
function mapOverallStatus(
  civStatus: VerificationStatus,
  existenceResult: string
): CitationVerificationResult['overallStatus'] {
  if (existenceResult === 'NOT_FOUND') return 'NOT_FOUND';

  switch (civStatus) {
    case 'VERIFIED':
      return 'PASS';
    case 'FLAGGED':
      return 'FLAG';
    case 'REJECTED':
    case 'BLOCKED':
      return 'FAIL';
    default:
      return 'FAIL';
  }
}

/**
 * Map a FinalVerificationOutput to our CitationVerificationResult.
 */
function mapCIVResult(
  civOutput: FinalVerificationOutput,
  proposition: string,
  highStakes: boolean
): CitationVerificationResult {
  const {
    citation,
    verificationResults: vr,
    compositeResult,
  } = civOutput;

  const exists = vr.step1Existence.result !== 'NOT_FOUND';
  const failReasons: string[] = [];
  const flagReasons: string[] = [];

  // Step 1: Existence
  if (!exists) {
    failReasons.push(`Citation not found in any legal database: ${citation.input}`);
  }

  // Step 2: Holding
  const holdingClassification = exists
    ? mapHoldingResult(
        vr.step2Holding.finalResult,
        vr.step2Holding.finalConfidence,
        compositeResult.flags
      )
    : 'NOT_FOUND';

  if (holdingClassification === 'CONTRARY') {
    failReasons.push(
      'HOLDING_MISMATCH: Case contradicts the proposition it\'s cited for'
    );
  }
  if (holdingClassification === 'OVERSTATED') {
    flagReasons.push(
      'OVERSTATED: Proposition goes beyond what the case actually holds'
    );
  }
  if (holdingClassification === 'PARTIAL') {
    flagReasons.push(
      'PARTIAL: Case only partially supports the cited proposition'
    );
  }

  // Step 3: Dicta
  const dictaClass = vr.step3Dicta.classification === 'HOLDING'
    ? 'HOLDING' as const
    : vr.step3Dicta.classification === 'DICTA'
      ? 'DICTUM' as const
      : 'AMBIGUOUS' as const;

  if (dictaClass === 'DICTUM') {
    flagReasons.push('DICTA: Cited passage is dicta, not a holding');
  }

  // Step 4: Quote
  const quoteVerified = vr.step4Quote.result === 'MATCH'
    ? true
    : vr.step4Quote.result === 'N/A'
      ? null
      : vr.step4Quote.result === 'CLOSE_MATCH'
        ? true
        : false;

  if (quoteVerified === false) {
    flagReasons.push(`QUOTE_MISMATCH: Quote verification result: ${vr.step4Quote.result}`);
  }

  // Step 5: Bad law
  const badLawFlags: string[] = [];
  if (vr.step5BadLaw.compositeStatus === 'OVERRULED') {
    badLawFlags.push('OVERRULED');
    failReasons.push('BAD_LAW: Citation has been overruled');
  }
  if (vr.step5BadLaw.compositeStatus === 'NEGATIVE_TREATMENT') {
    badLawFlags.push('NEGATIVE_TREATMENT');
    flagReasons.push('BAD_LAW_CAUTION: Citation has received negative treatment');
  }
  if (vr.step5BadLaw.compositeStatus === 'CAUTION') {
    badLawFlags.push('CAUTION');
    flagReasons.push('BAD_LAW_CAUTION: Citation flagged for caution');
  }

  // Compile additional flags from compositeResult
  for (const flag of compositeResult.flags) {
    if (flag.type === 'DECLINING_AUTHORITY') {
      flagReasons.push(`DECLINING_AUTHORITY: ${flag.message}`);
    }
    if (flag.type === 'UNPUBLISHED') {
      flagReasons.push(`UNPUBLISHED: ${flag.message}`);
    }
  }

  // Build proposition verification
  const propositionVerification: PropositionVerification | null = exists ? {
    citation: citation.input,
    proposition,
    classification: holdingClassification,
    confidence: vr.step2Holding.finalConfidence,
    stage2Triggered: vr.step2Holding.stage2?.triggered ?? false,
    stage2Result: vr.step2Holding.stage2?.triggered ? {
      classification: holdingClassification,
      reasoning: vr.step2Holding.stage2.challengeReasoning ?? '',
      overrodeStage1: vr.step2Holding.stage2.result === 'REJECTED',
    } : undefined,
    isHighStakes: highStakes,
  } : null;

  // Build step results
  const steps: CIVStepResult[] = [
    {
      step: 1,
      stepName: 'EXISTENCE_CHECK',
      passed: exists,
      details: {
        courtlistenerId: vr.step1Existence.courtlistenerId ?? null,
        courtlistenerUrl: vr.step1Existence.courtlistenerUrl ?? null,
        result: vr.step1Existence.result,
        sourcesChecked: vr.step1Existence.sourcesChecked,
      },
      duration_ms: vr.step1Existence.durationMs ?? 0,
    },
    {
      step: 2,
      stepName: 'HOLDING_VERIFICATION',
      passed: holdingClassification !== 'CONTRARY' && holdingClassification !== 'NOT_FOUND',
      details: {
        classification: holdingClassification,
        confidence: vr.step2Holding.finalConfidence,
        stage2Triggered: vr.step2Holding.stage2?.triggered ?? false,
      },
      duration_ms: 0, // Aggregated in pipeline
    },
    {
      step: 3,
      stepName: 'DICTA_DETECTION',
      passed: dictaClass !== 'DICTUM',
      details: { classification: dictaClass },
      duration_ms: 0,
    },
    {
      step: 4,
      stepName: 'QUOTE_VERIFICATION',
      passed: quoteVerified !== false,
      details: { result: vr.step4Quote.result },
      duration_ms: 0,
    },
    {
      step: 5,
      stepName: 'BAD_LAW_CHECK',
      passed: vr.step5BadLaw.compositeStatus === 'GOOD_LAW',
      details: {
        status: vr.step5BadLaw.compositeStatus,
        confidence: vr.step5BadLaw.confidence,
      },
      duration_ms: 0,
    },
    {
      step: 6,
      stepName: 'AUTHORITY_STRENGTH',
      passed: true, // Informational, doesn't block
      details: {
        stabilityClass: vr.step6Strength.stabilityClass,
        assessment: vr.step6Strength.assessment,
      },
      duration_ms: 0,
    },
  ];

  const overallStatus = !exists
    ? 'NOT_FOUND' as const
    : mapOverallStatus(compositeResult.status, vr.step1Existence.result);

  return {
    citation: citation.input,
    caseName: citation.caseName,
    courtlistenerId: vr.step1Existence.courtlistenerId ?? null,
    opinionUrl: vr.step1Existence.courtlistenerUrl ?? null,
    exists,
    propositionVerification,
    dictaClassification: exists ? dictaClass : null,
    quoteVerified: exists ? quoteVerified : null,
    badLawFlags,
    overallStatus,
    failReasons,
    flagReasons,
    steps,
    isHighStakes: highStakes,
  };
}

// ============================================================================
// MAIN PIPELINE RUNNER
// ============================================================================

/**
 * Run the full CIV pipeline on a set of citations extracted from a draft.
 *
 * EXECUTION ORDER:
 * 1. Deduplicate (prevents BUG 2)
 * 2. Extract propositions (enables Step 2 holding verification)
 * 3. Call canonical verifyBatch() for full 7-step pipeline
 * 4. Map results and apply hard gate
 *
 * HARD GATE RULES:
 * - If ANY citation has overallStatus === 'NOT_FOUND' -> hard gate FAILS
 * - If ANY citation has overallStatus === 'FAIL' (holding mismatch) -> hard gate FAILS
 * - Flagged citations (OVERSTATED, PARTIAL, DICTUM) -> hard gate PASSES with warnings
 *
 * When hard gate fails, the motion CANNOT proceed past Phase V.1.
 * NEVER falls back to shallow checks. Errors are propagated.
 */
export async function runCIVPipeline(input: {
  orderId: string;
  phase: 'V.1' | 'VII.1' | 'IX.1';
  tier: 'A' | 'B' | 'C' | 'D';
  draftText: string;
  rawCitations: string[];
  batchSize?: number;
}): Promise<CIVPipelineOutput> {
  const startTime = Date.now();
  const { orderId, phase, tier, draftText, rawCitations } = input;
  const batchSize = input.batchSize ?? (phase === 'V.1' || phase === 'VII.1' ? 2 : 4);

  console.log(
    `[CIV_PIPELINE] Starting for order=${orderId} phase=${phase} tier=${tier} citations=${rawCitations.length}`
  );

  // ── Step 0: Deduplicate ──────────────────────────────────────────────
  const dedupResult: DeduplicationResult = deduplicateCitations(rawCitations);
  const uniqueCitations = dedupResult.unique.map(c => c.raw);

  console.log(
    `[CIV_PIPELINE] Dedup: ${rawCitations.length} -> ${uniqueCitations.length} unique ` +
    `(removed ${dedupResult.stats.duplicatesRemoved} dupes, ` +
    `${dedupResult.stats.incompleteRemoved} incomplete)`
  );

  if (uniqueCitations.length === 0) {
    return {
      orderId,
      phase,
      tier,
      timestamp: new Date().toISOString(),
      durationMs: Date.now() - startTime,
      dedup: dedupResult.stats,
      results: [],
      summary: {
        total: 0,
        passed: 0,
        failed: 0,
        flagged: 0,
        notFound: 0,
        holdingMismatches: 0,
        verificationRate: 'N/A',
      },
      // No citations = no failures, but Phase VII should still catch missing citations
      passesHardGate: true,
      hardGateFailReasons: [],
      usedCIVPipeline: true,
      rawBatchResult: null,
    };
  }

  // ── Step 0.5: Extract propositions ───────────────────────────────────
  const propositions = extractPropositions(draftText, uniqueCitations);

  // ── Build CitationToVerify[] for canonical pipeline ──────────────────
  const citationsToVerify: CitationToVerify[] = uniqueCitations.map(cit => {
    const proposition = propositions.get(cit) ?? '[PROPOSITION NOT FOUND]';
    const occurrenceCount = (
      draftText.match(new RegExp(cit.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []
    ).length;

    const highStakes = isHighStakesCitation(cit, {
      isFirstForStandard: false,
      isSoleAuthority: uniqueCitations.length <= 3,
      establishesJurisdiction: false,
      establishesElements: false,
      occurrenceCount,
      tier,
    });

    // Map proposition type based on HIGH_STAKES and context
    const propositionType: PropositionType = highStakes
      ? 'PRIMARY_STANDARD'
      : uniqueCitations.length <= 5
        ? 'SECONDARY'
        : 'CONTEXT';

    return {
      citationString: cit,
      proposition,
      propositionType,
      jurisdictionContext: 'LA',
    };
  });

  // ── Steps 1-7: Call canonical verifyBatch() ──────────────────────────
  // This calls the FULL 7-step pipeline. No fallback. No shallow checks.
  let batchResult: BatchVerificationResult;
  try {
    batchResult = await verifyBatch({
      orderId,
      phase: phase, // Pass actual phase for audit trail (IX.1 masquerade fix per P1-CIV-3)
      citations: citationsToVerify,
      options: {
        parallelLimit: batchSize,
      },
    });
  } catch (pipelineError) {
    // DO NOT fall back to shallow checks. Propagate the error.
    // A silent fallback is how BUG 1 happened.
    console.error(
      `[CIV_PIPELINE] FATAL: Pipeline failed for order=${orderId} phase=${phase}:`,
      pipelineError
    );
    throw new Error(
      `CIV pipeline failed for order ${orderId}: ${pipelineError instanceof Error ? pipelineError.message : 'Unknown error'}. ` +
      `NO FALLBACK TO SHALLOW CHECKS. Fix the pipeline error and retry.`
    );
  }

  // ── Map results ──────────────────────────────────────────────────────
  const allResults: CitationVerificationResult[] = batchResult.results.map(civOutput => {
    const citString = civOutput.citation.input;
    const proposition = propositions.get(citString) ?? '[PROPOSITION NOT FOUND]';
    const occurrenceCount = (
      draftText.match(
        new RegExp(citString.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')
      ) || []
    ).length;

    const highStakes = isHighStakesCitation(citString, {
      isFirstForStandard: false,
      isSoleAuthority: uniqueCitations.length <= 3,
      establishesJurisdiction: false,
      establishesElements: false,
      occurrenceCount,
      tier,
    });

    return mapCIVResult(civOutput, proposition, highStakes);
  });

  // ── Compile summary ──────────────────────────────────────────────────
  const passed = allResults.filter(r => r.overallStatus === 'PASS').length;
  const failed = allResults.filter(r => r.overallStatus === 'FAIL').length;
  const flagged = allResults.filter(r => r.overallStatus === 'FLAG').length;
  const notFound = allResults.filter(r => r.overallStatus === 'NOT_FOUND').length;
  const holdingMismatches = allResults.filter(r =>
    r.propositionVerification?.classification === 'CONTRARY' ||
    r.propositionVerification?.classification === 'OVERSTATED'
  ).length;

  // ── Apply hard gate ──────────────────────────────────────────────────
  const hardGateFailReasons: string[] = [];

  if (notFound > 0) {
    hardGateFailReasons.push(
      `${notFound} citation(s) not found in any legal database: ` +
      `${allResults.filter(r => r.overallStatus === 'NOT_FOUND').map(r => r.citation).join(', ')}`
    );
  }

  if (holdingMismatches > 0) {
    hardGateFailReasons.push(
      `${holdingMismatches} citation(s) do not support the propositions they're cited for ` +
      `(HOLDING_MISMATCH): ${allResults.filter(r =>
        r.propositionVerification?.classification === 'CONTRARY' ||
        r.propositionVerification?.classification === 'OVERSTATED'
      ).map(r => r.citation).join(', ')}`
    );
  }

  // Count failures that aren't already accounted for by NOT_FOUND or holding mismatches
  const holdingMismatchFailCount = allResults.filter(r =>
    r.overallStatus === 'FAIL' && (
      r.propositionVerification?.classification === 'CONTRARY' ||
      r.propositionVerification?.classification === 'OVERSTATED'
    )
  ).length;
  const otherFailures = failed - notFound - holdingMismatchFailCount;

  if (otherFailures > 0) {
    hardGateFailReasons.push(
      `${otherFailures} citation(s) failed verification for other reasons (bad law, blocked)`
    );
  }

  const output: CIVPipelineOutput = {
    orderId,
    phase,
    tier,
    timestamp: new Date().toISOString(),
    durationMs: Date.now() - startTime,
    dedup: dedupResult.stats,
    results: allResults,
    summary: {
      total: allResults.length,
      passed,
      failed,
      flagged,
      notFound,
      holdingMismatches,
      verificationRate: allResults.length > 0
        ? `${Math.round((passed / allResults.length) * 100)}%`
        : 'N/A',
    },
    passesHardGate: hardGateFailReasons.length === 0,
    hardGateFailReasons,
    usedCIVPipeline: true, // ALWAYS true. This is the whole point.
    rawBatchResult: batchResult,
  };

  console.log(
    `[CIV_PIPELINE] Complete: order=${orderId} phase=${phase} ` +
    `passed=${passed}/${allResults.length} hardGate=${output.passesHardGate} ` +
    `duration=${output.durationMs}ms`
  );

  return output;
}
