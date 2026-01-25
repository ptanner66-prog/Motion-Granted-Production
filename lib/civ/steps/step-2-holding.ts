/**
 * CIV Step 2: Holding Verification
 *
 * Two-stage verification to confirm cited case supports stated proposition.
 * Stage 1: Primary verification with Claude Sonnet 4.5
 * Stage 2: Adversarial verification with Claude Opus 4.5 (conditional)
 *
 * This catches mischaracterized holdings - the most dangerous citation error.
 */

import { getAnthropicClient } from '@/lib/automation/claude';
import { getOpinionWithText } from '@/lib/courtlistener/client';
import { getCaseText } from '@/lib/caselaw/client';
import {
  DEFAULT_CIV_CONFIG,
  HOLDING_VERIFICATION_PROMPT,
  ADVERSARIAL_VERIFICATION_PROMPT,
  type HoldingVerificationOutput,
  type HoldingVerificationResult,
  type PropositionType,
} from '../types';

/**
 * Execute Step 2: Holding Verification
 *
 * Flow:
 * 1. Retrieve opinion text
 * 2. Run Stage 1 verification with Sonnet
 * 3. If borderline (70-89%) or high-stakes, run Stage 2 adversarial
 * 4. Reconcile results
 */
export async function executeHoldingVerification(
  citation: string,
  proposition: string,
  propositionType: PropositionType,
  courtlistenerId?: string,
  caselawId?: string,
  isTierC: boolean = false
): Promise<HoldingVerificationOutput> {
  const config = DEFAULT_CIV_CONFIG;

  // Initialize result
  const result: HoldingVerificationOutput = {
    step: 2,
    name: 'holding_verification',
    proposition,
    propositionType,
    stage1: {
      model: config.primaryModel,
      result: 'REJECTED',
      confidence: 0,
      reasoning: '',
    },
    finalResult: 'REJECTED',
    finalConfidence: 0,
    proceedToStep3: false,
  };

  try {
    // Step 1: Get opinion text
    const opinionText = await getOpinionText(courtlistenerId, caselawId);

    if (!opinionText) {
      result.stage1.reasoning = 'Could not retrieve opinion text for verification';
      return result;
    }

    // Extract case metadata from citation
    const { caseName, court, year } = parseCitationForPrompt(citation);

    // Step 2: Run Stage 1 verification
    const stage1Result = await runStage1Verification(
      caseName,
      citation,
      court,
      year,
      opinionText,
      proposition,
      config.primaryModel
    );

    result.stage1 = stage1Result;

    // Step 3: Determine if Stage 2 is needed
    const needsStage2 = shouldTriggerStage2(
      stage1Result.confidence,
      propositionType,
      isTierC,
      config
    );

    if (needsStage2) {
      // Run Stage 2 adversarial verification
      const stage2Result = await runStage2Verification(
        caseName,
        proposition,
        opinionText,
        config.adversarialModel
      );

      result.stage2 = {
        triggered: true,
        ...stage2Result,
      };

      // Reconcile results
      const reconciled = reconcileStages(stage1Result, stage2Result);
      result.finalResult = reconciled.result;
      result.finalConfidence = reconciled.confidence;
    } else {
      result.stage2 = { triggered: false };
      result.finalResult = stage1Result.result;
      result.finalConfidence = stage1Result.confidence;
    }

    // Determine if we proceed to Step 3
    result.proceedToStep3 =
      result.finalResult === 'VERIFIED' ||
      (result.finalResult === 'PARTIAL' && result.finalConfidence >= config.borderlineThreshold);

    return result;
  } catch (error) {
    console.error('Holding verification error:', error);
    result.stage1.reasoning = `Verification error: ${error instanceof Error ? error.message : 'Unknown error'}`;
    return result;
  }
}

/**
 * Get opinion text from CourtListener or Case.law
 */
async function getOpinionText(
  courtlistenerId?: string,
  caselawId?: string
): Promise<string | null> {
  // Try CourtListener first
  if (courtlistenerId) {
    const clResult = await getOpinionWithText(courtlistenerId);
    if (clResult.success && clResult.data?.plain_text) {
      return clResult.data.plain_text;
    }
  }

  // Fallback to Case.law
  if (caselawId) {
    const caseLawResult = await getCaseText(caselawId);
    if (caseLawResult.success && caseLawResult.data?.opinions?.length) {
      // Combine all opinion texts
      return caseLawResult.data.opinions
        .map(op => `[${op.type || 'OPINION'}${op.author ? ` by ${op.author}` : ''}]\n${op.text}`)
        .join('\n\n---\n\n');
    }
  }

  return null;
}

/**
 * Parse citation to extract components for prompt
 */
function parseCitationForPrompt(citation: string): {
  caseName: string;
  court: string;
  year: string;
} {
  // Extract case name (before comma)
  const caseNameMatch = citation.match(/^([^,]+)/);
  const caseName = caseNameMatch ? caseNameMatch[1].trim() : citation;

  // Extract year (in parentheses)
  const yearMatch = citation.match(/\(([^)]*?)(\d{4})\)/);
  const year = yearMatch ? yearMatch[2] : 'Unknown';
  const court = yearMatch && yearMatch[1] ? yearMatch[1].trim() : 'Unknown Court';

  return { caseName, court, year };
}

/**
 * Run Stage 1 verification with Claude Sonnet
 */
async function runStage1Verification(
  caseName: string,
  citation: string,
  court: string,
  year: string,
  opinionText: string,
  proposition: string,
  model: string
): Promise<{
  model: string;
  result: HoldingVerificationResult;
  confidence: number;
  supportingQuote?: string;
  reasoning: string;
}> {
  // Truncate opinion text to fit in context (roughly 50k chars for Sonnet)
  const maxOpinionLength = 50000;
  const truncatedOpinion =
    opinionText.length > maxOpinionLength
      ? opinionText.substring(0, maxOpinionLength) + '\n\n[... Opinion truncated for length ...]'
      : opinionText;

  const prompt = HOLDING_VERIFICATION_PROMPT
    .replace('{case_name}', caseName)
    .replace('{citation}', citation)
    .replace('{court}', court)
    .replace('{year}', year)
    .replace('{opinion_text_excerpt}', truncatedOpinion)
    .replace('{proposition}', proposition);

  try {
    const anthropic = await getAnthropicClient();
    if (!anthropic) {
      throw new Error('Anthropic client not configured');
    }

    const response = await anthropic.messages.create({
      model,
      max_tokens: 2000,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    });

    // Parse response
    const content = response.content[0];
    if (content.type !== 'text') {
      throw new Error('Unexpected response type');
    }

    const parsed = parseStage1Response(content.text);

    return {
      model,
      result: parsed.result,
      confidence: parsed.confidence,
      supportingQuote: parsed.supportingQuote,
      reasoning: parsed.reasoning,
    };
  } catch (error) {
    console.error('Stage 1 verification error:', error);
    return {
      model,
      result: 'REJECTED',
      confidence: 0,
      reasoning: `API error: ${error instanceof Error ? error.message : 'Unknown'}`,
    };
  }
}

/**
 * Parse Stage 1 response JSON
 */
function parseStage1Response(responseText: string): {
  result: HoldingVerificationResult;
  confidence: number;
  supportingQuote?: string;
  reasoning: string;
} {
  try {
    // Extract JSON from response (may have surrounding text)
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in response');
    }

    const parsed = JSON.parse(jsonMatch[0]);

    // Validate and map result
    const resultMap: Record<string, HoldingVerificationResult> = {
      VERIFIED: 'VERIFIED',
      PARTIAL: 'PARTIAL',
      REJECTED: 'REJECTED',
      DICTA_ONLY: 'DICTA_ONLY',
    };

    const result = resultMap[parsed.VERIFICATION_RESULT] || 'REJECTED';
    const confidence = Math.max(0, Math.min(1, parseFloat(parsed.CONFIDENCE_SCORE) || 0));

    return {
      result,
      confidence,
      supportingQuote: parsed.SUPPORTING_QUOTE,
      reasoning: parsed.REASONING || 'No reasoning provided',
    };
  } catch (error) {
    console.error('Failed to parse Stage 1 response:', error, responseText);
    return {
      result: 'REJECTED',
      confidence: 0,
      reasoning: 'Failed to parse verification response',
    };
  }
}

/**
 * Determine if Stage 2 adversarial verification should run
 */
function shouldTriggerStage2(
  stage1Confidence: number,
  propositionType: PropositionType,
  isTierC: boolean,
  config: typeof DEFAULT_CIV_CONFIG
): boolean {
  // Borderline confidence (70-89%)
  if (
    config.triggerAdversarialOnBorderline &&
    stage1Confidence >= config.borderlineThreshold &&
    stage1Confidence < config.verifiedThreshold
  ) {
    return true;
  }

  // High-stakes proposition types
  if (
    config.triggerAdversarialForPrimaryStandard &&
    (propositionType === 'PRIMARY_STANDARD' || propositionType === 'REQUIRED_ELEMENT')
  ) {
    return true;
  }

  // Tier C motion (complex, high stakes)
  if (config.triggerAdversarialForTierC && isTierC) {
    return true;
  }

  return false;
}

/**
 * Run Stage 2 adversarial verification with Claude Opus
 */
async function runStage2Verification(
  caseName: string,
  proposition: string,
  opinionText: string,
  model: string
): Promise<{
  model: string;
  result: 'UPHELD' | 'WEAKENED' | 'REJECTED';
  challengeStrength: number;
  challengeReasoning: string;
}> {
  // Provide relevant excerpt for adversarial review
  const maxExcerpt = 30000;
  const excerpt =
    opinionText.length > maxExcerpt
      ? opinionText.substring(0, maxExcerpt) + '\n\n[... Excerpt truncated ...]'
      : opinionText;

  const prompt = ADVERSARIAL_VERIFICATION_PROMPT
    .replace('{case_name}', caseName)
    .replace('{proposition}', proposition)
    + `\n\nOPINION EXCERPT:\n${excerpt}`;

  try {
    const anthropic = await getAnthropicClient();
    if (!anthropic) {
      throw new Error('Anthropic client not configured');
    }

    const response = await anthropic.messages.create({
      model,
      max_tokens: 2000,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    });

    const content = response.content[0];
    if (content.type !== 'text') {
      throw new Error('Unexpected response type');
    }

    return parseStage2Response(content.text, model);
  } catch (error) {
    console.error('Stage 2 verification error:', error);
    return {
      model,
      result: 'UPHELD', // On error, don't override Stage 1
      challengeStrength: 0,
      challengeReasoning: `API error: ${error instanceof Error ? error.message : 'Unknown'}`,
    };
  }
}

/**
 * Parse Stage 2 response JSON
 */
function parseStage2Response(
  responseText: string,
  model: string
): {
  model: string;
  result: 'UPHELD' | 'WEAKENED' | 'REJECTED';
  challengeStrength: number;
  challengeReasoning: string;
} {
  try {
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in response');
    }

    const parsed = JSON.parse(jsonMatch[0]);

    const resultMap: Record<string, 'UPHELD' | 'WEAKENED' | 'REJECTED'> = {
      UPHELD: 'UPHELD',
      WEAKENED: 'WEAKENED',
      REJECTED: 'REJECTED',
    };

    return {
      model,
      result: resultMap[parsed.CHALLENGE_RESULT] || 'UPHELD',
      challengeStrength: Math.max(0, Math.min(1, parseFloat(parsed.CHALLENGE_STRENGTH) || 0)),
      challengeReasoning: parsed.CHALLENGE_REASONING || 'No reasoning provided',
    };
  } catch (error) {
    console.error('Failed to parse Stage 2 response:', error);
    return {
      model,
      result: 'UPHELD',
      challengeStrength: 0,
      challengeReasoning: 'Failed to parse challenge response',
    };
  }
}

/**
 * Reconcile Stage 1 and Stage 2 results
 */
function reconcileStages(
  stage1: {
    result: HoldingVerificationResult;
    confidence: number;
  },
  stage2: {
    result: 'UPHELD' | 'WEAKENED' | 'REJECTED';
    challengeStrength: number;
  }
): {
  result: HoldingVerificationResult;
  confidence: number;
} {
  // If Stage 2 upholds, average confidences
  if (stage2.result === 'UPHELD') {
    return {
      result: stage1.result,
      confidence: (stage1.confidence + (1 - stage2.challengeStrength)) / 2,
    };
  }

  // If Stage 2 rejects, trust the adversarial review
  if (stage2.result === 'REJECTED') {
    return {
      result: 'REJECTED',
      confidence: stage2.challengeStrength,
    };
  }

  // If Stage 2 weakens, downgrade result
  if (stage2.result === 'WEAKENED') {
    // If original was VERIFIED, downgrade to PARTIAL
    if (stage1.result === 'VERIFIED') {
      return {
        result: 'PARTIAL',
        confidence: (stage1.confidence + (1 - stage2.challengeStrength)) / 2,
      };
    }

    // Otherwise keep original result with reduced confidence
    return {
      result: stage1.result,
      confidence: stage1.confidence * (1 - stage2.challengeStrength * 0.5),
    };
  }

  // Default: trust Stage 1
  return {
    result: stage1.result,
    confidence: stage1.confidence,
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
): Promise<HoldingVerificationOutput> {
  let lastResult = await executeHoldingVerification(
    citation,
    proposition,
    propositionType,
    courtlistenerId,
    caselawId
  );

  // If confidence is borderline but Stage 2 wasn't triggered, retry with different framing
  let retryCount = 0;

  while (
    lastResult.finalConfidence >= 0.7 &&
    lastResult.finalConfidence < 0.9 &&
    !lastResult.stage2?.triggered &&
    retryCount < maxRetries
  ) {
    retryCount++;

    // Retry with slightly different proposition framing
    const reframedProposition = reframeProposition(proposition, retryCount);

    const retryResult = await executeHoldingVerification(
      citation,
      reframedProposition,
      propositionType,
      courtlistenerId,
      caselawId,
      true // Force Stage 2 on retry
    );

    // Use better result
    if (retryResult.finalConfidence > lastResult.finalConfidence) {
      lastResult = retryResult;
    }
  }

  return lastResult;
}

/**
 * Reframe proposition for retry
 */
function reframeProposition(proposition: string, retryCount: number): string {
  const prefixes = [
    'In the context of this case, ',
    'According to this court\'s holding, ',
    'This case establishes that ',
  ];

  return prefixes[retryCount % prefixes.length] + proposition;
}
