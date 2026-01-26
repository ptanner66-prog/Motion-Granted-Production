/**
 * Step 2: Two-Stage Holding Verification
 *
 * CIV Spec Section 5, API Architecture Spec Section 3.1
 *
 * Stage 1: Initial verification using tier-appropriate model
 * - Tier A/B: GPT-4o
 * - Tier C: GPT-5.2
 *
 * Stage 2: Adversarial verification with Claude Opus 4.5
 * Triggers when:
 * - Stage 1 confidence 70-94%
 * - Stage 1 confidence <70%
 * - HIGH_STAKES flag is set
 *
 * Tiebreaker: GPT-4o if Stage 1 and Stage 2 disagree
 */

import { askOpenAI, type OpenAIResponse } from '@/lib/ai/openai-client';
import { askClaude } from '@/lib/automation/claude';
import { createClient } from '@/lib/supabase/server';
import type { MotionTier } from '@/types/workflow';

// ============================================================================
// TYPES
// ============================================================================

export interface Stage1Result {
  model: string;
  verified: boolean;
  confidence: number;
  reasoning: string;
  supporting_quote: string | null;
  tokens_used: number;
  cost: number;
  duration_ms: number;
}

export interface Stage2Result {
  model: string;
  verified: boolean;
  confidence: number;
  reasoning: string;
  supporting_quote: string | null;
  tokens_used: number;
  cost: number;
  duration_ms: number;
}

export interface TiebreakerResult {
  model: string;
  decision: 'STAGE_1' | 'STAGE_2' | 'UNCERTAIN';
  reasoning: string;
  tokens_used: number;
  cost: number;
}

export interface Step2Result {
  result: 'VERIFIED' | 'REJECTED' | 'UNCERTAIN';
  confidence: number;
  stage_1_result: Stage1Result;
  stage_2_result?: Stage2Result;
  tiebreaker_result?: TiebreakerResult;
  supporting_quote: string | null;
  models_used: string[];
  total_cost: number;
  total_tokens: number;
  duration_ms: number;
  stage_2_triggered: boolean;
  stage_2_reason?: string;
  error?: string;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const STAGE_2_CONFIDENCE_HIGH_THRESHOLD = 0.94;
const STAGE_2_CONFIDENCE_LOW_THRESHOLD = 0.70;

const MODELS = {
  TIER_A_B_STAGE_1: 'gpt-4o',
  TIER_C_STAGE_1: 'gpt-5.2',
  STAGE_2: 'claude-opus-4-5-20251101',
  TIEBREAKER: 'gpt-4o',
};

// ============================================================================
// STAGE 1: INITIAL VERIFICATION
// ============================================================================

async function runStage1(
  citationText: string,
  proposition: string,
  opinionText: string,
  tier: MotionTier
): Promise<Stage1Result> {
  const startTime = Date.now();
  const model = tier === 'C' ? MODELS.TIER_C_STAGE_1 : MODELS.TIER_A_B_STAGE_1;

  const systemPrompt = `You are a legal research assistant specializing in case law analysis.
Your task is to verify whether a cited case's HOLDING (not dicta) supports the stated legal proposition.

CRITICAL DISTINCTIONS:
- HOLDING: The court's actual decision and the legal rule necessary to reach that decision
- DICTA: Statements not necessary to the decision, even if they discuss related law
- CONCURRENCE/DISSENT: Not holdings unless cited for their analytical value

Analyze carefully and respond with a JSON object containing your verification result.`;

  const prompt = `CITATION: ${citationText}

PROPOSITION CLAIMED: "${proposition}"

CASE TEXT (excerpt):
${opinionText.slice(0, 15000)} ${opinionText.length > 15000 ? '...[truncated]' : ''}

Analyze whether the case's HOLDING supports the claimed proposition.

Respond with ONLY a JSON object:
{
  "verification_result": "VERIFIED" | "REJECTED" | "UNCERTAIN",
  "confidence_score": <number 0.0-1.0>,
  "supporting_quote": "<exact quote from case text that supports your conclusion, or null>",
  "reasoning": "<detailed explanation of why the holding does/doesn't support the proposition>"
}`;

  try {
    const response: OpenAIResponse = await askOpenAI(prompt, {
      model,
      maxTokens: 2000,
      temperature: 0.2,
      systemPrompt,
      responseFormat: 'json_object',
    });

    if (!response.success || !response.content) {
      throw new Error(response.error || 'Stage 1 verification failed');
    }

    const parsed = JSON.parse(response.content);

    return {
      model,
      verified: parsed.verification_result === 'VERIFIED',
      confidence: Math.min(1, Math.max(0, parsed.confidence_score || 0)),
      reasoning: parsed.reasoning || '',
      supporting_quote: parsed.supporting_quote || null,
      tokens_used: response.tokensUsed?.total || 0,
      cost: response.cost || 0,
      duration_ms: Date.now() - startTime,
    };
  } catch (error) {
    console.error('[Step2] Stage 1 error:', error);
    return {
      model,
      verified: false,
      confidence: 0,
      reasoning: `Stage 1 error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      supporting_quote: null,
      tokens_used: 0,
      cost: 0,
      duration_ms: Date.now() - startTime,
    };
  }
}

// ============================================================================
// STAGE 2: ADVERSARIAL VERIFICATION
// ============================================================================

async function runStage2(
  citationText: string,
  proposition: string,
  opinionText: string,
  stage1Result: Stage1Result
): Promise<Stage2Result> {
  const startTime = Date.now();
  const model = MODELS.STAGE_2;

  // Adversarial prompt - Claude tries to find reasons the holding DOESN'T support the proposition
  const prompt = `You are a skeptical appellate judge reviewing a citation for accuracy.

CITATION: ${citationText}

PROPOSITION CLAIMED: "${proposition}"

INITIAL VERIFICATION: The citation was ${stage1Result.verified ? 'verified' : 'rejected'} with ${Math.round(stage1Result.confidence * 100)}% confidence.
Initial reasoning: ${stage1Result.reasoning}

CASE TEXT (excerpt):
${opinionText.slice(0, 15000)} ${opinionText.length > 15000 ? '...[truncated]' : ''}

YOUR TASK: Play devil's advocate. Carefully analyze whether the case's HOLDING truly supports the claimed proposition.

Consider:
1. Is the cited language actually part of the HOLDING or is it dicta?
2. Are there limiting factors or exceptions that weren't mentioned?
3. Has the initial verification correctly identified the actual holding?
4. Would a careful opposing counsel be able to distinguish this case?

Respond with ONLY a JSON object:
{
  "verification_result": "VERIFIED" | "REJECTED" | "UNCERTAIN",
  "confidence_score": <number 0.0-1.0>,
  "supporting_quote": "<exact quote that supports your conclusion, or null>",
  "reasoning": "<detailed adversarial analysis>",
  "counterarguments": ["<potential challenges to using this citation>"]
}`;

  try {
    const response = await askClaude({
      prompt,
      maxTokens: 3000,
      systemPrompt: 'You are a skeptical appellate judge. Be thorough and critical in your analysis. Respond with valid JSON only.',
    });

    if (!response.success || !response.result?.content) {
      throw new Error(response.error || 'Stage 2 verification failed');
    }

    // Extract JSON from response
    const jsonMatch = response.result.content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Could not parse Stage 2 response as JSON');
    }

    const parsed = JSON.parse(jsonMatch[0]);

    return {
      model,
      verified: parsed.verification_result === 'VERIFIED',
      confidence: Math.min(1, Math.max(0, parsed.confidence_score || 0)),
      reasoning: parsed.reasoning || '',
      supporting_quote: parsed.supporting_quote || null,
      tokens_used: response.result.tokensUsed || 0,
      cost: 0, // Cost tracking handled at higher level
      duration_ms: Date.now() - startTime,
    };
  } catch (error) {
    console.error('[Step2] Stage 2 error:', error);
    return {
      model,
      verified: stage1Result.verified, // Fall back to Stage 1 result
      confidence: stage1Result.confidence * 0.8, // Reduce confidence
      reasoning: `Stage 2 error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      supporting_quote: stage1Result.supporting_quote,
      tokens_used: 0,
      cost: 0,
      duration_ms: Date.now() - startTime,
    };
  }
}

// ============================================================================
// TIEBREAKER
// ============================================================================

async function runTiebreaker(
  citationText: string,
  proposition: string,
  opinionText: string,
  stage1: Stage1Result,
  stage2: Stage2Result
): Promise<TiebreakerResult> {
  const model = MODELS.TIEBREAKER;

  const prompt = `You are an impartial legal arbiter resolving a disagreement about citation verification.

CITATION: ${citationText}
PROPOSITION: "${proposition}"

STAGE 1 RESULT (${stage1.model}): ${stage1.verified ? 'VERIFIED' : 'REJECTED'} (${Math.round(stage1.confidence * 100)}% confidence)
Reasoning: ${stage1.reasoning}

STAGE 2 RESULT (${stage2.model}): ${stage2.verified ? 'VERIFIED' : 'REJECTED'} (${Math.round(stage2.confidence * 100)}% confidence)
Reasoning: ${stage2.reasoning}

CASE TEXT (excerpt):
${opinionText.slice(0, 10000)} ${opinionText.length > 10000 ? '...[truncated]' : ''}

Based on the case text and both analyses, which conclusion is correct?

Respond with ONLY a JSON object:
{
  "decision": "STAGE_1" | "STAGE_2" | "UNCERTAIN",
  "reasoning": "<explanation of why you side with one analysis or why it's uncertain>"
}`;

  try {
    const response: OpenAIResponse = await askOpenAI(prompt, {
      model,
      maxTokens: 1500,
      temperature: 0.1,
      responseFormat: 'json_object',
    });

    if (!response.success || !response.content) {
      throw new Error(response.error || 'Tiebreaker failed');
    }

    const parsed = JSON.parse(response.content);

    return {
      model,
      decision: parsed.decision || 'UNCERTAIN',
      reasoning: parsed.reasoning || '',
      tokens_used: response.tokensUsed?.total || 0,
      cost: response.cost || 0,
    };
  } catch (error) {
    console.error('[Step2] Tiebreaker error:', error);
    // If tiebreaker fails, go with the more conservative (lower confidence) result
    return {
      model,
      decision: 'UNCERTAIN',
      reasoning: `Tiebreaker error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      tokens_used: 0,
      cost: 0,
    };
  }
}

// ============================================================================
// MAIN VERIFICATION FUNCTION
// ============================================================================

/**
 * Step 2: Two-Stage Holding Verification
 *
 * @param citationText - The citation being verified
 * @param proposition - The legal proposition claimed to be supported
 * @param opinionText - The full or partial text of the case opinion
 * @param tier - Motion tier (A, B, or C)
 * @param orderId - Order ID for logging
 * @param options - Additional options
 */
export async function verifyHolding(
  citationText: string,
  proposition: string,
  opinionText: string,
  tier: MotionTier,
  orderId: string,
  options?: {
    highStakes?: boolean;
    forceStage2?: boolean;
    logToDb?: boolean;
  }
): Promise<Step2Result> {
  const startTime = Date.now();
  const modelsUsed: string[] = [];
  let totalCost = 0;
  let totalTokens = 0;

  // Initialize result
  const result: Step2Result = {
    result: 'UNCERTAIN',
    confidence: 0,
    stage_1_result: {
      model: '',
      verified: false,
      confidence: 0,
      reasoning: '',
      supporting_quote: null,
      tokens_used: 0,
      cost: 0,
      duration_ms: 0,
    },
    supporting_quote: null,
    models_used: [],
    total_cost: 0,
    total_tokens: 0,
    duration_ms: 0,
    stage_2_triggered: false,
  };

  try {
    // STAGE 1: Initial verification
    console.log(`[Step2] Running Stage 1 verification for: ${citationText.slice(0, 50)}...`);
    const stage1 = await runStage1(citationText, proposition, opinionText, tier);

    result.stage_1_result = stage1;
    modelsUsed.push(stage1.model);
    totalCost += stage1.cost;
    totalTokens += stage1.tokens_used;

    // Determine if Stage 2 is needed
    const needsStage2 =
      options?.forceStage2 ||
      options?.highStakes ||
      stage1.confidence < STAGE_2_CONFIDENCE_LOW_THRESHOLD ||
      (stage1.confidence >= STAGE_2_CONFIDENCE_LOW_THRESHOLD &&
        stage1.confidence <= STAGE_2_CONFIDENCE_HIGH_THRESHOLD);

    if (needsStage2) {
      result.stage_2_triggered = true;
      result.stage_2_reason =
        options?.forceStage2 ? 'forced' :
        options?.highStakes ? 'high_stakes' :
        stage1.confidence < STAGE_2_CONFIDENCE_LOW_THRESHOLD ? 'low_confidence' :
        'medium_confidence';

      console.log(`[Step2] Stage 2 triggered (${result.stage_2_reason}): ${citationText.slice(0, 50)}...`);

      // STAGE 2: Adversarial verification
      const stage2 = await runStage2(citationText, proposition, opinionText, stage1);

      result.stage_2_result = stage2;
      modelsUsed.push(stage2.model);
      totalCost += stage2.cost;
      totalTokens += stage2.tokens_used;

      // Check if stages agree
      const stagesAgree = stage1.verified === stage2.verified;

      if (!stagesAgree) {
        console.log(`[Step2] Stages disagree, running tiebreaker: ${citationText.slice(0, 50)}...`);

        // TIEBREAKER
        const tiebreaker = await runTiebreaker(citationText, proposition, opinionText, stage1, stage2);

        result.tiebreaker_result = tiebreaker;
        modelsUsed.push(tiebreaker.model);
        totalCost += tiebreaker.cost;
        totalTokens += tiebreaker.tokens_used;

        // Determine final result based on tiebreaker
        if (tiebreaker.decision === 'STAGE_1') {
          result.result = stage1.verified ? 'VERIFIED' : 'REJECTED';
          result.confidence = stage1.confidence;
          result.supporting_quote = stage1.supporting_quote;
        } else if (tiebreaker.decision === 'STAGE_2') {
          result.result = stage2.verified ? 'VERIFIED' : 'REJECTED';
          result.confidence = stage2.confidence;
          result.supporting_quote = stage2.supporting_quote;
        } else {
          // UNCERTAIN - use weighted average, lean conservative
          result.result = 'UNCERTAIN';
          result.confidence = Math.min(stage1.confidence, stage2.confidence) * 0.7;
          result.supporting_quote = stage1.supporting_quote || stage2.supporting_quote;
        }
      } else {
        // Stages agree - combine confidences
        result.result = stage1.verified ? 'VERIFIED' : 'REJECTED';
        result.confidence = (stage1.confidence + stage2.confidence) / 2;
        result.supporting_quote = stage1.supporting_quote || stage2.supporting_quote;
      }
    } else {
      // No Stage 2 needed - use Stage 1 result
      result.result = stage1.verified ? 'VERIFIED' : 'REJECTED';
      result.confidence = stage1.confidence;
      result.supporting_quote = stage1.supporting_quote;
    }

    result.models_used = modelsUsed;
    result.total_cost = totalCost;
    result.total_tokens = totalTokens;
    result.duration_ms = Date.now() - startTime;

    // Log to database if requested
    if (options?.logToDb) {
      await logStep2Result(orderId, citationText, proposition, result);
    }

    console.log(`[Step2] ${citationText.slice(0, 40)}...: ${result.result} (${Math.round(result.confidence * 100)}%, ${result.duration_ms}ms, $${result.total_cost.toFixed(4)})`);

    return result;

  } catch (error) {
    result.error = error instanceof Error ? error.message : 'Unknown error';
    result.duration_ms = Date.now() - startTime;
    result.models_used = modelsUsed;
    result.total_cost = totalCost;
    result.total_tokens = totalTokens;

    console.error('[Step2] Holding verification error:', result.error);

    if (options?.logToDb) {
      await logStep2Result(orderId, citationText, proposition, result);
    }

    return result;
  }
}

// ============================================================================
// DATABASE LOGGING
// ============================================================================

async function logStep2Result(
  orderId: string,
  citationText: string,
  proposition: string,
  result: Step2Result
): Promise<void> {
  try {
    const supabase = await createClient();

    await supabase.from('citation_verification_log').insert({
      order_id: orderId,
      citation_text: citationText,
      proposition,
      step_number: 2,
      step_name: 'holding_verification',
      status: result.result,
      confidence: result.confidence,
      duration_ms: result.duration_ms,
      models_used: result.models_used,
      total_cost: result.total_cost,
      total_tokens: result.total_tokens,
      stage_2_triggered: result.stage_2_triggered,
      stage_2_reason: result.stage_2_reason,
      error_message: result.error,
      raw_response: {
        stage_1: {
          model: result.stage_1_result.model,
          verified: result.stage_1_result.verified,
          confidence: result.stage_1_result.confidence,
          reasoning: result.stage_1_result.reasoning,
        },
        stage_2: result.stage_2_result ? {
          model: result.stage_2_result.model,
          verified: result.stage_2_result.verified,
          confidence: result.stage_2_result.confidence,
          reasoning: result.stage_2_result.reasoning,
        } : null,
        tiebreaker: result.tiebreaker_result || null,
      },
    });
  } catch (error) {
    console.error('[Step2] Failed to log result to database:', error);
  }
}

export default {
  verifyHolding,
};
