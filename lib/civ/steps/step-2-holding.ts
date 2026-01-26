/**
 * CIV Step 2: Holding Verification (Cross-Vendor)
 *
 * Two-stage cross-vendor verification to confirm cited case supports stated proposition.
 * Stage 1: GPT (OpenAI) - Primary verification
 * Stage 2: Claude Opus (Anthropic) - Adversarial verification (conditional)
 *
 * This catches mischaracterized holdings - the most dangerous citation error.
 */

import {
  callOpenAI,
  callAnthropic,
  getModelForTask,
  getTierFromMotionType,
  shouldTriggerStage2,
  type MotionTier,
} from '../model-router';
import type { Step2Result, PropositionType, VerificationResult } from '../types';

/**
 * Stage 1: GPT (OpenAI) - Primary holding verification
 */
async function runStage1(
  caseName: string,
  citation: string,
  opinionText: string,
  proposition: string,
  tier: MotionTier
): Promise<{ result: VerificationResult; confidence: number; quote?: string; reasoning?: string }> {
  const model = getModelForTask('stage_1_holding', tier);

  const prompt = `You are a legal research assistant verifying whether a case supports a specific legal proposition.

CASE: ${caseName}
CITATION: ${citation}

OPINION EXCERPT:
${opinionText ? opinionText.substring(0, 8000) : 'Opinion text not available.'}

PROPOSITION TO VERIFY:
"${proposition}"

Determine if this case's HOLDING (not dicta) supports the stated proposition.

Respond in JSON format ONLY:
{
  "verification_result": "VERIFIED" | "PARTIAL" | "REJECTED" | "DICTA_ONLY",
  "confidence_score": 0 to 100,
  "supporting_quote": "specific language from opinion",
  "reasoning": "2-3 sentences"
}`;

  const response = await callOpenAI(model, prompt, 1000);

  try {
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        result: parsed.verification_result as VerificationResult,
        confidence: parsed.confidence_score,
        quote: parsed.supporting_quote,
        reasoning: parsed.reasoning,
      };
    }
  } catch {
    // Parse error - return default
  }

  return { result: 'PARTIAL', confidence: 50, reasoning: 'Parse error' };
}

/**
 * Stage 2: Claude Opus (Anthropic) - Adversarial verification
 */
async function runStage2(
  caseName: string,
  opinionText: string,
  proposition: string,
  tier: MotionTier
): Promise<{ result: 'UPHELD' | 'WEAKENED' | 'REJECTED'; strength: number; reasoning?: string }> {
  const model = getModelForTask('stage_2_adversarial', tier);

  const prompt = `You are opposing counsel reviewing a citation skeptically.

Find reasons why ${caseName} does NOT support: "${proposition}"

Look for:
1. Is this DICTA rather than holding?
2. Does context limit the scope?
3. Are there distinguishing facts?
4. Is this majority or dissent?

OPINION EXCERPT:
${opinionText ? opinionText.substring(0, 8000) : 'Not available'}

Respond in JSON format ONLY:
{
  "challenge_result": "UPHELD" | "WEAKENED" | "REJECTED",
  "challenge_strength": 0 to 100,
  "challenge_reasoning": "your best argument against"
}`;

  const response = await callAnthropic(model, prompt, 1000);

  try {
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        result: parsed.challenge_result,
        strength: parsed.challenge_strength,
        reasoning: parsed.challenge_reasoning,
      };
    }
  } catch {
    // Parse error - return default
  }

  return { result: 'UPHELD', strength: 50 };
}

/**
 * Main Step 2 function: Cross-vendor holding verification
 */
export async function step2HoldingVerification(
  caseName: string,
  citation: string,
  opinionText: string | undefined,
  proposition: string,
  propositionType: PropositionType,
  motionType: string,
  flags: string[] = []
): Promise<Step2Result> {
  const tier = getTierFromMotionType(motionType);

  // Stage 1: GPT
  const stage1 = await runStage1(
    caseName,
    citation,
    opinionText || '',
    proposition,
    tier
  );

  // Check if Stage 2 needed
  const needsStage2 = shouldTriggerStage2(stage1.confidence, flags);

  let stage2Result: { result: 'UPHELD' | 'WEAKENED' | 'REJECTED'; strength: number; reasoning?: string } | undefined;
  let finalResult = stage1.result;
  let finalConfidence = stage1.confidence;

  if (needsStage2) {
    // Stage 2: Claude Opus
    stage2Result = await runStage2(caseName, opinionText || '', proposition, tier);

    // Reconcile results
    if (stage2Result.result === 'REJECTED') {
      finalResult = 'REJECTED';
      finalConfidence = Math.min(stage1.confidence, 100 - stage2Result.strength);
    } else if (stage2Result.result === 'WEAKENED') {
      if (stage1.result === 'VERIFIED') finalResult = 'PARTIAL';
      finalConfidence = (stage1.confidence + (100 - stage2Result.strength)) / 2;
    } else {
      // UPHELD - agreement boosts confidence
      finalConfidence = Math.min(100, stage1.confidence + 5);
    }
  }

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
    proceed_to_step_3: finalResult !== 'REJECTED' && finalConfidence >= 70,
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
  caselawId?: string,
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
  const { getCaseText } = await import('@/lib/caselaw/client');

  // Get opinion text
  let opinionText: string | undefined;

  if (courtlistenerId) {
    const clResult = await getOpinionWithText(courtlistenerId);
    if (clResult.success && clResult.data?.plain_text) {
      opinionText = clResult.data.plain_text;
    }
  }

  if (!opinionText && caselawId) {
    const caseLawResult = await getCaseText(caselawId);
    if (caseLawResult.success && caseLawResult.data?.opinions?.length) {
      opinionText = caseLawResult.data.opinions
        .map(op => `[${op.type || 'OPINION'}${op.author ? ` by ${op.author}` : ''}]\n${op.text}`)
        .join('\n\n---\n\n');
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
  caselawId?: string,
  maxRetries: number = 2
): Promise<ReturnType<typeof executeHoldingVerification>> {
  let lastResult = await executeHoldingVerification(
    citation,
    proposition,
    propositionType,
    courtlistenerId,
    caselawId
  );

  let retryCount = 0;

  while (
    lastResult.finalConfidence >= 70 &&
    lastResult.finalConfidence < 90 &&
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
      caselawId,
      true // Force Tier C on retry
    );

    if (retryResult.finalConfidence > lastResult.finalConfidence) {
      lastResult = retryResult;
    }
  }

  return lastResult;
}
