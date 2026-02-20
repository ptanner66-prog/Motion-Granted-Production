/**
 * CIV Step 2: Holding Verification (Cross-Vendor)
 *
 * Two-stage cross-vendor verification to confirm cited case supports stated proposition.
 * Stage 1: GPT-4o (OpenAI) - Primary verification with holding classification
 * Stage 2: Claude Opus (Anthropic) - Adversarial verification (conditional)
 *
 * CIV-003: Two-stage verification flow (GPT → threshold → Opus → tiebreaker)
 * BUG-FIX-03: Correct confidence thresholds (80/95, was 70/90)
 *
 * Clay's Part C §3-4 BINDING:
 * - ≥95% → VERIFIED (skip Stage 2)
 * - 80-94% → trigger Stage 2
 * - <80% → HOLDING_MISMATCH → Protocol 2
 */

import {
  callCIVOpenAI as callOpenAI,
  callCIVAnthropic as callAnthropic,
  getCIVModelForTask as getModelForTask,
  getTierFromMotionType,
  shouldTriggerStage2,
  type MotionTier,
} from '@/lib/ai/model-router';
import type { Step2Result, PropositionType, VerificationResult } from '../types';
import { createLogger } from '@/lib/security/logger';
import { checkOpenAICircuit, recordOpenAISuccess, recordOpenAIFailure, DEFERRED_RESULT } from '@/lib/ai/openai-circuit-breaker';

const log = createLogger('citation-civ-steps-step-2-holding');
import {
  getCitationModelWithLogging,
  resolveTiebreaker,
  CITATION_THRESHOLDS,
  type HoldingClassification,
  type Tier,
} from '@/lib/config/citation-models';

/**
 * Stage 1: GPT-4o (OpenAI) - Primary holding verification
 *
 * CIV-003: Updated prompt to include holding classifications (EXACT/CONSISTENT/OVERSTATED/PARTIAL/CONTRARY)
 * and is_from_majority detection for Protocol 20 (Plurality Opinion).
 */
async function runStage1(
  caseName: string,
  citation: string,
  opinionText: string,
  proposition: string,
  tier: MotionTier,
  context?: { orderId?: string; citationId?: string }
): Promise<{
  result: VerificationResult;
  confidence: number;
  classification: HoldingClassification;
  isFromMajority: boolean;
  quote?: string;
  reasoning?: string;
}> {
  const modelConfig = getCitationModelWithLogging(2, tier as Tier, 'stage_1', context ? {
    orderId: context.orderId || 'unknown',
    citationId: context.citationId || 'unknown',
  } : undefined);

  const prompt = `You are analyzing a legal citation for accuracy. Given the following:

CITATION: ${citation}
CASE: ${caseName}
PROPOSITION: "${proposition}"

OPINION TEXT:
${opinionText ? opinionText.substring(0, 8000) : 'Opinion text not available.'}

Determine if the cited case actually supports the stated proposition.

Respond in JSON format ONLY:
{
  "confidence": <0 to 100>,
  "classification": "EXACT" | "CONSISTENT" | "OVERSTATED" | "PARTIAL" | "CONTRARY",
  "is_from_majority": true | false,
  "verification_result": "VERIFIED" | "PARTIAL" | "REJECTED" | "DICTA_ONLY",
  "supporting_quote": "specific language from the opinion",
  "reasoning": "2-3 sentences explaining your conclusion"
}

Classification definitions:
- EXACT: Directly states the proposition
- CONSISTENT: Supports proposition with different language
- OVERSTATED: Goes beyond what the holding actually says
- PARTIAL: Supports only part of the proposition
- CONTRARY: Contradicts the proposition`;

  // A2-DEC-5: Check OpenAI circuit breaker before call
  const circuitCheck = await checkOpenAICircuit();
  if (!circuitCheck.allowed) {
    log.warn('[CIV Step 2] OpenAI circuit breaker OPEN — returning VERIFICATION_DEFERRED');
    return {
      result: DEFERRED_RESULT.status as unknown as VerificationResult,
      confidence: 0,
      classification: 'PARTIAL' as HoldingClassification,
      isFromMajority: true,
      reasoning: DEFERRED_RESULT.reason,
    };
  }

  let response: string;
  try {
    response = await callOpenAI(modelConfig.model, prompt, 4096);
    await recordOpenAISuccess();
  } catch (openAiError) {
    await recordOpenAIFailure(openAiError instanceof Error ? openAiError : new Error(String(openAiError)));
    throw openAiError;
  }

  try {
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        result: parsed.verification_result as VerificationResult,
        confidence: parsed.confidence ?? 50,
        classification: parsed.classification ?? 'PARTIAL',
        isFromMajority: parsed.is_from_majority ?? true,
        quote: parsed.supporting_quote,
        reasoning: parsed.reasoning,
      };
    }
  } catch {
    // Parse error - return conservative default
  }

  // BUG-FIX A10-P0-004 (related): Parse error must default to RESTRICTIVE values.
  // Confidence 50 on 0-100 scale = 0.50 normalized → borderline.
  // Set to 0 to ensure this citation is flagged for manual review.
  return {
    result: 'PARTIAL',
    confidence: 0,
    classification: 'PARTIAL',
    isFromMajority: true,
    reasoning: 'Stage 1 parse error — defaulting to zero confidence (conservative)',
  };
}

/**
 * Stage 2: Claude Opus (Anthropic) - Adversarial verification
 *
 * CIV-003: Updated prompt to include Stage 1 analysis for adversarial review.
 */
async function runStage2(
  caseName: string,
  opinionText: string,
  proposition: string,
  tier: MotionTier,
  stage1Analysis: { result: VerificationResult; confidence: number; classification: HoldingClassification; reasoning?: string },
  context?: { orderId?: string; citationId?: string }
): Promise<{
  result: 'UPHELD' | 'WEAKENED' | 'REJECTED';
  strength: number;
  classification: HoldingClassification;
  agreesWithStage1: boolean;
  disagreementReasons: string[];
  reasoning?: string;
}> {
  const modelConfig = getCitationModelWithLogging(2, tier as Tier, 'stage_2', context ? {
    orderId: context.orderId || 'unknown',
    citationId: context.citationId || 'unknown',
  } : undefined);

  const prompt = `You are a skeptical appellate judge reviewing citation accuracy. Your job is ADVERSARIAL — find reasons why this citation might NOT support its proposition.

CITATION CASE: ${caseName}
PROPOSITION: "${proposition}"

OPINION TEXT:
${opinionText ? opinionText.substring(0, 8000) : 'Not available'}

STAGE 1 ANALYSIS:
- Result: ${stage1Analysis.result}
- Confidence: ${stage1Analysis.confidence}%
- Classification: ${stage1Analysis.classification}
- Reasoning: ${stage1Analysis.reasoning || 'N/A'}

Evaluate whether the Stage 1 analysis is correct. Look for:
- Overstated holdings
- Dicta presented as holdings
- Narrow holdings applied broadly
- Missing context that changes meaning
- Superseded or modified holdings
- Whether this is from majority, concurrence, or dissent

Respond in JSON format ONLY:
{
  "confidence": <0 to 100>,
  "classification": "EXACT" | "CONSISTENT" | "OVERSTATED" | "PARTIAL" | "CONTRARY",
  "agrees_with_stage_1": true | false,
  "challenge_result": "UPHELD" | "WEAKENED" | "REJECTED",
  "challenge_strength": <0 to 100>,
  "disagreement_reasons": ["reason1", "reason2"],
  "challenge_reasoning": "your best argument against this citation"
}`;

  const response = await callAnthropic(modelConfig.model, prompt, 8192);

  try {
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        // BUG-FIX: Missing challenge_result must default to WEAKENED (restrictive), not UPHELD (permissive).
        // UPHELD means "citation is fine" — defaulting to that on missing data is a cardinal sin.
        result: parsed.challenge_result || 'WEAKENED',
        strength: parsed.challenge_strength ?? 50,
        classification: parsed.classification ?? stage1Analysis.classification,
        // BUG-FIX: Missing agrees_with_stage_1 must default to false (restrictive), not true (permissive).
        agreesWithStage1: parsed.agrees_with_stage_1 ?? false,
        disagreementReasons: parsed.disagreement_reasons ?? [],
        reasoning: parsed.challenge_reasoning,
      };
    }
  } catch {
    // Parse error - return conservative default
  }

  // BUG-FIX A10-P0-004: Parse error must NOT default to UPHELD.
  // UPHELD = "citation is fine" which is the PERMISSIVE default.
  // Safety gate must default to RESTRICTIVE: WEAKENED triggers manual review.
  return {
    result: 'WEAKENED',
    strength: 50,
    classification: stage1Analysis.classification,
    agreesWithStage1: false,
    disagreementReasons: ['Stage 2 adversarial review returned unparseable response'],
    reasoning: 'Stage 2 parse error — defaulting to WEAKENED (conservative)',
  };
}

/**
 * Main Step 2 function: Cross-vendor holding verification
 *
 * CIV-003: Two-stage verification flow with correct thresholds
 */
export async function step2HoldingVerification(
  caseName: string,
  citation: string,
  opinionText: string | undefined,
  proposition: string,
  propositionType: PropositionType,
  motionType: string,
  flags: string[] = [],
  _reserved?: unknown,
  context?: { orderId?: string; citationId?: string }
): Promise<Step2Result> {
  const tier = getTierFromMotionType(motionType);

  // T-23: If proposition text is not available, skip proposition check
  if (!proposition || !proposition.trim()) {
    log.warn(`[CIV_STEP2] citation=${citation.substring(0, 50)} — no proposition text, marking INCONCLUSIVE`);
    return {
      step: 2,
      name: 'holding_verification',
      proposition: proposition || '',
      proposition_type: propositionType,
      stage_1: { model: 'skipped', result: 'VERIFICATION_DEFERRED' as VerificationResult, confidence: 0 },
      stage_2: { triggered: false },
      final_result: 'VERIFICATION_DEFERRED' as VerificationResult,
      final_confidence: 0,
      propositionSupported: 'INCONCLUSIVE',
      proceed_to_step_3: true, // Don't block pipeline on missing proposition
    };
  }

  // Stage 1: GPT-4o
  const stage1 = await runStage1(
    caseName,
    citation,
    opinionText || '',
    proposition,
    tier,
    context
  );

  // Log Stage 1 result
  log.info(
    `[CIV_STEP2] citation=${citation.substring(0, 50)} stage=1 ` +
    `confidence=${stage1.confidence} classification=${stage1.classification} ` +
    `result=${stage1.result} is_majority=${stage1.isFromMajority}`
  );

  // D2-007: Persist GPT-4 Stage 1 results for audit trail
  if (context?.orderId) {
    try {
      const { getServiceSupabase } = await import('@/lib/supabase/admin');
      const svc = getServiceSupabase();
      await svc.from('automation_logs').insert({
        order_id: context.orderId,
        action_type: 'civ_stage_1_result',
        action_details: {
          citation: citation.substring(0, 200),
          caseName,
          stage: 'STAGE_1',
          result: stage1.result,
          confidence: stage1.confidence,
          classification: stage1.classification,
          isFromMajority: stage1.isFromMajority,
          reasoning: stage1.reasoning?.substring(0, 500),
          citationId: context.citationId,
          tier,
          verified_at: new Date().toISOString(),
        },
        confidence_score: stage1.confidence / 100,
      });
    } catch (persistErr) {
      // Non-fatal: audit persistence failure shouldn't break CIV pipeline
      log.warn('[CIV_STEP2] Failed to persist Stage 1 result:', persistErr);
    }
  }

  // CIV-003: Threshold-based routing — canonical normalization
  const { normalizeConfidence } = await import('@/lib/citation/utils');
  const normalizedConf = normalizeConfidence(stage1.confidence);

  // Check if Stage 2 needed using confidence thresholds
  const needsStage2 = shouldTriggerStage2(stage1.confidence, flags);

  let stage2Result: Awaited<ReturnType<typeof runStage2>> | undefined;
  let finalResult = stage1.result;
  let finalConfidence = stage1.confidence;

  if (needsStage2) {
    // Stage 2: Claude Opus — Adversarial review
    stage2Result = await runStage2(
      caseName,
      opinionText || '',
      proposition,
      tier,
      {
        result: stage1.result,
        confidence: stage1.confidence,
        classification: stage1.classification,
        reasoning: stage1.reasoning,
      },
      context
    );

    // Log Stage 2 result
    log.info(
      `[CIV_STEP2] citation=${citation.substring(0, 50)} stage=2 ` +
      `result=${stage2Result.result} strength=${stage2Result.strength} ` +
      `agrees=${stage2Result.agreesWithStage1} classification=${stage2Result.classification}`
    );

    // CIV-003: Apply tiebreaker matrix
    const stage2Approved = stage2Result.result === 'UPHELD';
    const tiebreakerResult = resolveTiebreaker(
      normalizedConf,
      stage2Approved
    );

    log.info(
      `[CIV_STEP2] citation=${citation.substring(0, 50)} tiebreaker=${tiebreakerResult.result} ` +
      `reason="${tiebreakerResult.reason}"`
    );

    // Map tiebreaker result to verification result
    switch (tiebreakerResult.result) {
      case 'VERIFIED':
        finalResult = 'VERIFIED';
        finalConfidence = Math.min(100, stage1.confidence + 5);
        break;
      case 'VERIFIED_WITH_NOTES':
        finalResult = 'VERIFIED';
        finalConfidence = stage1.confidence; // Keep original confidence
        break;
      case 'NEEDS_REVIEW':
        finalResult = 'PARTIAL';
        finalConfidence = Math.min(stage1.confidence, 100 - stage2Result.strength);
        break;
      case 'HOLDING_MISMATCH':
        finalResult = 'REJECTED';
        finalConfidence = Math.min(stage1.confidence, 100 - stage2Result.strength);
        break;
    }
  } else if (normalizedConf >= CITATION_THRESHOLDS.HOLDING_PASS) {
    // ≥95% → VERIFIED without Stage 2
    finalResult = 'VERIFIED';
    finalConfidence = stage1.confidence;
  }

  // BUG-FIX-03: Use correct threshold (80, was 70)
  const proceedThreshold = CITATION_THRESHOLDS.HOLDING_FAIL * 100; // 80

  return {
    step: 2,
    name: 'holding_verification',
    proposition,
    proposition_type: propositionType,
    stage_1: {
      model: getModelForTask('stage_1_holding', tier),
      result: stage1.result,
      confidence: stage1.confidence,
      supporting_quote: stage1.quote,
      reasoning: stage1.reasoning,
    },
    stage_2: needsStage2
      ? {
          triggered: true,
          model: getModelForTask('stage_2_adversarial', tier),
          result: stage2Result?.result,
          challenge_strength: stage2Result?.strength,
          challenge_reasoning: stage2Result?.reasoning,
        }
      : { triggered: false },
    final_result: finalResult,
    final_confidence: finalConfidence,
    // T-23: Proposition supported if holding is VERIFIED or PARTIAL (not REJECTED/DICTA_ONLY)
    propositionSupported: finalResult === 'VERIFIED' || finalResult === 'PARTIAL',
    proceed_to_step_3: finalResult !== 'REJECTED' && finalConfidence >= proceedThreshold,
  };
}

/**
 * Legacy function for backward compatibility
 * Maps to new cross-vendor implementation
 */
export async function executeHoldingVerification(
  citation: string,
  proposition: string,
  propositionType: PropositionType,
  courtlistenerId?: string,
  _caselawId?: string, // @deprecated Case.law API sunset September 5, 2024
  isTierC: boolean = false
): Promise<{
  step: 2;
  name: 'holding_verification';
  proposition: string;
  propositionType: PropositionType;
  stage1: {
    model: string;
    result: VerificationResult;
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
  finalResult: VerificationResult;
  finalConfidence: number;
  proceedToStep3: boolean;
}> {
  // Import opinion text retrieval functions
  const { getOpinionWithText } = await import('@/lib/courtlistener/client');

  // Get opinion text (CourtListener only - Case.law sunset September 5, 2024)
  let opinionText: string | undefined;

  if (courtlistenerId) {
    const clResult = await getOpinionWithText(courtlistenerId);
    if (clResult.success && clResult.data?.plain_text) {
      opinionText = clResult.data.plain_text;
    }
  }

  // Extract case name from citation
  const caseNameMatch = citation.match(/^([^,]+)/);
  const caseName = caseNameMatch ? caseNameMatch[1].trim() : citation;

  // Determine motion type - use Tier C if specified
  const motionType = isTierC ? 'motion_for_summary_judgment' : 'motion_to_compel';

  // Call the new cross-vendor implementation
  const result = await step2HoldingVerification(
    caseName,
    citation,
    opinionText,
    proposition,
    propositionType,
    motionType
  );

  // Map to legacy format
  return {
    step: 2 as const,
    name: 'holding_verification' as const,
    proposition: result.proposition,
    propositionType: result.proposition_type,
    stage1: {
      model: result.stage_1.model,
      result: result.stage_1.result,
      confidence: result.stage_1.confidence,
      supportingQuote: result.stage_1.supporting_quote,
      reasoning: result.stage_1.reasoning || '',
    },
    stage2: result.stage_2.triggered
      ? {
          triggered: true,
          model: result.stage_2.model,
          result: result.stage_2.result,
          challengeStrength: result.stage_2.challenge_strength,
          challengeReasoning: result.stage_2.challenge_reasoning,
        }
      : { triggered: false },
    finalResult: result.final_result,
    finalConfidence: result.final_confidence,
    proceedToStep3: result.proceed_to_step_3,
  };
}

/**
 * Retry logic for borderline results
 */
export async function retryHoldingVerification(
  citation: string,
  proposition: string,
  propositionType: PropositionType,
  courtlistenerId?: string,
  _caselawId?: string, // @deprecated Case.law API sunset September 5, 2024
  maxRetries: number = 2
): Promise<ReturnType<typeof executeHoldingVerification>> {
  let lastResult = await executeHoldingVerification(
    citation,
    proposition,
    propositionType,
    courtlistenerId,
    undefined // caselawId deprecated
  );

  let retryCount = 0;

  // BUG-FIX-03: Updated thresholds — 80 (was 70) and 95 (was 90)
  while (
    lastResult.finalConfidence >= 80 &&
    lastResult.finalConfidence < 95 &&
    !lastResult.stage2?.triggered &&
    retryCount < maxRetries
  ) {
    retryCount++;

    // Retry with slightly different proposition framing
    const prefixes = [
      'In the context of this case, ',
      "According to this court's holding, ",
      'This case establishes that ',
    ];

    const reframedProposition = prefixes[retryCount % prefixes.length] + proposition;

    const retryResult = await executeHoldingVerification(
      citation,
      reframedProposition,
      propositionType,
      courtlistenerId,
      undefined, // caselawId deprecated
      true // Force Tier C on retry
    );

    if (retryResult.finalConfidence > lastResult.finalConfidence) {
      lastResult = retryResult;
    }
  }

  return lastResult;
}
