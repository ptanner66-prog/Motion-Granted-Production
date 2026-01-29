/**
 * Step 3: Dicta Detection
 *
 * CIV Spec Section 6
 *
 * Model Selection:
 * - Tier A/B: Claude Haiku 4.5
 * - Tier C: Claude Sonnet 4.5
 *
 * Classifies statements as: HOLDING, DICTA, CONCURRENCE, DISSENT
 *
 * Action based on result:
 * - HOLDING = continue (no flag)
 * - DICTA + PRIMARY_STANDARD = FLAG
 * - DICTA + REQUIRED_ELEMENT = FLAG
 * - DICTA + SECONDARY/CONTEXT = NOTE only (informational)
 */

import { askClaude } from '@/lib/automation/claude';
import { createClient } from '@/lib/supabase/server';
import type { MotionTier } from '@/types/workflow';

// ============================================================================
// TYPES
// ============================================================================

export type StatementClassification = 'HOLDING' | 'DICTA' | 'CONCURRENCE' | 'DISSENT';

export type PropositionType = 'PRIMARY_STANDARD' | 'REQUIRED_ELEMENT' | 'SECONDARY' | 'CONTEXT';

export type DictaAction = 'CONTINUE' | 'FLAG' | 'NOTE';

export interface Step3Result {
  classification: StatementClassification;
  proposition_type: PropositionType;
  action: DictaAction;
  confidence: number;
  reasoning: string;
  model_used: string;
  cost: number;
  tokens_used: number;
  duration_ms: number;
  alternative_citations?: string[];
  error?: string;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const MODELS = {
  TIER_A_B: 'claude-haiku-4-5-20250929',
  TIER_C: 'claude-sonnet-4-20250514',
};

// ============================================================================
// DICTA DETECTION
// ============================================================================

/**
 * Step 3: Detect if cited statement is dicta
 *
 * @param citationText - The citation being analyzed
 * @param proposition - The legal proposition claimed to be supported
 * @param opinionText - The case opinion text
 * @param supportingQuote - Quote from the case (from Step 2)
 * @param tier - Motion tier (A, B, or C)
 * @param orderId - Order ID for logging
 * @param options - Additional options
 */
export async function detectDicta(
  citationText: string,
  proposition: string,
  opinionText: string,
  supportingQuote: string | null,
  tier: MotionTier,
  orderId: string,
  options?: {
    logToDb?: boolean;
  }
): Promise<Step3Result> {
  const startTime = Date.now();
  const model = tier === 'C' ? MODELS.TIER_C : MODELS.TIER_A_B;

  const result: Step3Result = {
    classification: 'HOLDING',
    proposition_type: 'SECONDARY',
    action: 'CONTINUE',
    confidence: 0,
    reasoning: '',
    model_used: model,
    cost: 0,
    tokens_used: 0,
    duration_ms: 0,
  };

  try {
    const prompt = `You are an expert legal analyst specializing in distinguishing holdings from dicta.

CITATION: ${citationText}

PROPOSITION BEING SUPPORTED: "${proposition}"

${supportingQuote ? `SUPPORTING QUOTE FROM CASE:
"${supportingQuote}"` : ''}

CASE TEXT (excerpt):
${opinionText.slice(0, 12000)} ${opinionText.length > 12000 ? '...[truncated]' : ''}

TASK: Analyze the portion of the case being cited and determine:

1. STATEMENT CLASSIFICATION:
   - HOLDING: The court's actual decision and the legal rule necessary to reach that decision
   - DICTA: Statements not necessary to the decision, including hypotheticals, asides, or commentary
   - CONCURRENCE: Statement from a concurring opinion (not the majority holding)
   - DISSENT: Statement from a dissenting opinion

2. PROPOSITION TYPE (how is this citation being used?):
   - PRIMARY_STANDARD: Establishes the main legal standard or rule being applied
   - REQUIRED_ELEMENT: Proves a required element of a claim or defense
   - SECONDARY: Supports a secondary point but not essential to the argument
   - CONTEXT: Background information or context only

Respond with ONLY a JSON object:
{
  "classification": "HOLDING" | "DICTA" | "CONCURRENCE" | "DISSENT",
  "proposition_type": "PRIMARY_STANDARD" | "REQUIRED_ELEMENT" | "SECONDARY" | "CONTEXT",
  "confidence": <number 0.0-1.0>,
  "reasoning": "<detailed explanation of why you classified it this way>",
  "is_necessary_to_decision": <boolean - was this statement necessary to the court's decision?>,
  "could_be_distinguished": <boolean - could opposing counsel easily distinguish this?>,
  "alternative_citations": ["<if dicta, suggest better citations if known>"]
}`;

    const response = await askClaude({
      prompt,
      maxTokens: 32000,
      systemPrompt: 'You are a legal analysis expert. Respond with valid JSON only.',
      model,
    });

    if (!response.success || !response.result?.content) {
      throw new Error(response.error || 'Dicta detection failed');
    }

    // Extract JSON from response
    const jsonMatch = response.result.content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Could not parse dicta detection response as JSON');
    }

    const parsed = JSON.parse(jsonMatch[0]);

    result.classification = parsed.classification || 'HOLDING';
    result.proposition_type = parsed.proposition_type || 'SECONDARY';
    result.confidence = Math.min(1, Math.max(0, parsed.confidence || 0));
    result.reasoning = parsed.reasoning || '';
    result.alternative_citations = parsed.alternative_citations;
    result.tokens_used = response.result.tokensUsed || 0;
    result.cost = 0; // Cost tracking handled at higher level

    // Determine action based on classification and proposition type
    result.action = determineAction(result.classification, result.proposition_type);

  } catch (error) {
    result.error = error instanceof Error ? error.message : 'Unknown error';
    result.classification = 'HOLDING'; // Conservative default
    result.action = 'CONTINUE'; // Don't flag on error
    result.confidence = 0;
    result.reasoning = `Error during dicta detection: ${result.error}`;

    console.error('[Step3] Dicta detection error:', result.error);
  }

  result.duration_ms = Date.now() - startTime;

  // Log to database if requested
  if (options?.logToDb) {
    await logStep3Result(orderId, citationText, proposition, result);
  }

  console.log(`[Step3] ${citationText.slice(0, 40)}...: ${result.classification}/${result.proposition_type} → ${result.action} (${result.duration_ms}ms)`);

  return result;
}

// ============================================================================
// ACTION DETERMINATION
// ============================================================================

/**
 * Determine the appropriate action based on classification and proposition type
 *
 * - HOLDING = continue (no flag)
 * - DICTA + PRIMARY_STANDARD = FLAG
 * - DICTA + REQUIRED_ELEMENT = FLAG
 * - DICTA + SECONDARY/CONTEXT = NOTE only
 * - CONCURRENCE/DISSENT + PRIMARY_STANDARD/REQUIRED_ELEMENT = FLAG
 * - CONCURRENCE/DISSENT + SECONDARY/CONTEXT = NOTE
 */
function determineAction(
  classification: StatementClassification,
  propositionType: PropositionType
): DictaAction {
  // Holdings always continue
  if (classification === 'HOLDING') {
    return 'CONTINUE';
  }

  // Critical proposition types need flagging
  if (propositionType === 'PRIMARY_STANDARD' || propositionType === 'REQUIRED_ELEMENT') {
    return 'FLAG';
  }

  // Secondary or context propositions just get noted
  return 'NOTE';
}

// ============================================================================
// BATCH PROCESSING
// ============================================================================

/**
 * Detect dicta for multiple citations
 */
export async function detectDictaBatch(
  citations: Array<{
    citationText: string;
    proposition: string;
    opinionText: string;
    supportingQuote: string | null;
  }>,
  tier: MotionTier,
  orderId: string,
  options?: {
    concurrency?: number;
    logToDb?: boolean;
    onProgress?: (completed: number, total: number) => void;
  }
): Promise<Map<string, Step3Result>> {
  const concurrency = options?.concurrency ?? 3;
  const results = new Map<string, Step3Result>();

  for (let i = 0; i < citations.length; i += concurrency) {
    const batch = citations.slice(i, i + concurrency);

    const batchResults = await Promise.all(
      batch.map(c =>
        detectDicta(
          c.citationText,
          c.proposition,
          c.opinionText,
          c.supportingQuote,
          tier,
          orderId,
          { logToDb: options?.logToDb }
        )
      )
    );

    batch.forEach((c, index) => {
      results.set(c.citationText, batchResults[index]);
    });

    if (options?.onProgress) {
      options.onProgress(Math.min(i + concurrency, citations.length), citations.length);
    }

    // Small delay between batches
    if (i + concurrency < citations.length) {
      await new Promise(resolve => setTimeout(resolve, 150));
    }
  }

  return results;
}

// ============================================================================
// DATABASE LOGGING
// ============================================================================

async function logStep3Result(
  orderId: string,
  citationText: string,
  proposition: string,
  result: Step3Result
): Promise<void> {
  try {
    const supabase = await createClient();

    await supabase.from('citation_verification_log').insert({
      order_id: orderId,
      citation_text: citationText,
      proposition,
      step_number: 3,
      step_name: 'dicta_detection',
      status: result.classification,
      sub_status: result.proposition_type,
      action: result.action,
      confidence: result.confidence,
      duration_ms: result.duration_ms,
      models_used: [result.model_used],
      total_cost: result.cost,
      total_tokens: result.tokens_used,
      error_message: result.error,
      raw_response: {
        classification: result.classification,
        proposition_type: result.proposition_type,
        action: result.action,
        reasoning: result.reasoning,
        alternative_citations: result.alternative_citations,
      },
    });
  } catch (error) {
    console.error('[Step3] Failed to log result to database:', error);
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Check if a result requires human review
 */
export function requiresHumanReview(result: Step3Result): boolean {
  // Flag results that are uncertain or flagged
  return result.action === 'FLAG' || result.confidence < 0.7;
}

/**
 * Get severity level for dicta classification
 */
export function getDictaSeverity(result: Step3Result): 'high' | 'medium' | 'low' | 'none' {
  if (result.classification === 'HOLDING') {
    return 'none';
  }

  if (result.action === 'FLAG') {
    return 'high';
  }

  if (result.action === 'NOTE') {
    return result.classification === 'DISSENT' ? 'medium' : 'low';
  }

  return 'none';
}

export default {
  detectDicta,
  detectDictaBatch,
  determineAction,
  requiresHumanReview,
  getDictaSeverity,
};
