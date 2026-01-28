/**
 * Motion Granted v7.2 Phase Executor
 *
 * Executes individual workflow phases by calling the Claude API
 * with appropriate model, extended thinking, and system prompts.
 */

import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import {
  MODELS,
  PhaseId,
  Tier,
  getModelForPhase,
  getExtendedThinkingBudget,
  usesExtendedThinking,
} from './phase-config';

// ============================================================================
// TYPES
// ============================================================================

export interface ExecutePhaseParams {
  phase: PhaseId;
  tier: Tier;
  orderId: string;
  workflowId: string;
  input: Record<string, unknown>;
  systemPromptOverride?: string; // Optional override for testing
}

export interface PhaseExecutionResult {
  success: boolean;
  output: Record<string, unknown>;
  usage?: {
    input_tokens: number;
    output_tokens: number;
  };
  durationMs: number;
  error?: string;
}

// ============================================================================
// ANTHROPIC CLIENT
// ============================================================================

function getAnthropicClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY environment variable is not set');
  }
  return new Anthropic({ apiKey });
}

function getAdminSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error('Supabase environment variables not set');
  }
  return createAdminClient(url, serviceKey);
}

// ============================================================================
// PHASE EXECUTOR
// ============================================================================

/**
 * Execute a single workflow phase
 *
 * 1. Fetches phase prompt from database
 * 2. Determines model and extended thinking config based on tier
 * 3. Calls Claude API with appropriate parameters
 * 4. Parses and returns JSON output
 */
export async function executePhase(params: ExecutePhaseParams): Promise<PhaseExecutionResult> {
  const { phase, tier, orderId, workflowId, input, systemPromptOverride } = params;
  const startTime = Date.now();

  const supabase = getAdminSupabase();
  const anthropic = getAnthropicClient();

  try {
    // Get phase prompt from database
    let systemPrompt: string;

    if (systemPromptOverride) {
      systemPrompt = systemPromptOverride;
    } else {
      const { data: phasePrompt, error: promptError } = await supabase
        .from('phase_prompts')
        .select('prompt_content')
        .eq('phase', phase)
        .eq('is_active', true)
        .single();

      if (promptError || !phasePrompt) {
        throw new Error(`Phase prompt not found for phase ${phase}: ${promptError?.message}`);
      }

      systemPrompt = phasePrompt.prompt_content;
    }

    // Determine model and extended thinking settings
    const model = getModelForPhase(phase, tier);
    const useExtendedThinking = usesExtendedThinking(phase, tier);
    const thinkingBudget = getExtendedThinkingBudget(phase, tier);

    // Build user message with input data
    const userMessage = `Process this order for Phase ${phase}:

\`\`\`json
${JSON.stringify(input, null, 2)}
\`\`\`

Return ONLY valid JSON as specified in your instructions. Do not include markdown fences or any other text.`;

    // Build API parameters
    const apiParams: Anthropic.Messages.MessageCreateParams = {
      model,
      max_tokens: 16000,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    };

    // Add extended thinking if enabled
    if (useExtendedThinking && thinkingBudget > 0) {
      (apiParams as unknown as Record<string, unknown>).thinking = {
        type: 'enabled',
        budget_tokens: thinkingBudget,
      };
    }

    // Execute API call
    console.log(`[PhaseExecutor] Executing phase ${phase} for order ${orderId} with model ${model}`);
    if (useExtendedThinking) {
      console.log(`[PhaseExecutor] Extended thinking enabled with budget: ${thinkingBudget}`);
    }

    const response = await anthropic.messages.create(apiParams);

    // Extract text content
    let outputText = '';
    for (const block of response.content) {
      if (block.type === 'text') {
        outputText += block.text;
      }
    }

    // Parse JSON output
    let output: Record<string, unknown>;
    try {
      outputText = cleanJsonResponse(outputText);
      output = JSON.parse(outputText);
    } catch (parseError) {
      console.error(`[PhaseExecutor] Failed to parse phase ${phase} output:`, outputText.substring(0, 500));
      throw new Error(`Phase ${phase} did not return valid JSON: ${parseError}`);
    }

    const durationMs = Date.now() - startTime;

    console.log(`[PhaseExecutor] Phase ${phase} completed in ${durationMs}ms`);

    return {
      success: true,
      output,
      usage: {
        input_tokens: response.usage.input_tokens,
        output_tokens: response.usage.output_tokens,
      },
      durationMs,
    };
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    console.error(`[PhaseExecutor] Phase ${phase} failed:`, errorMessage);

    return {
      success: false,
      output: {},
      durationMs,
      error: errorMessage,
    };
  }
}

/**
 * Clean JSON response by removing markdown fences and extra text
 */
function cleanJsonResponse(text: string): string {
  let cleaned = text.trim();

  // Remove markdown code fences
  if (cleaned.startsWith('```json')) {
    cleaned = cleaned.slice(7);
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.slice(3);
  }

  if (cleaned.endsWith('```')) {
    cleaned = cleaned.slice(0, -3);
  }

  return cleaned.trim();
}

// ============================================================================
// BATCH EXECUTION
// ============================================================================

/**
 * Execute multiple phases in sequence
 * Useful for testing or manual execution
 */
export async function executePhaseSequence(
  phases: PhaseId[],
  params: Omit<ExecutePhaseParams, 'phase'>
): Promise<Map<PhaseId, PhaseExecutionResult>> {
  const results = new Map<PhaseId, PhaseExecutionResult>();
  let currentInput = params.input;

  for (const phase of phases) {
    const result = await executePhase({
      ...params,
      phase,
      input: currentInput,
    });

    results.set(phase, result);

    if (!result.success) {
      console.error(`[PhaseExecutor] Sequence stopped at phase ${phase} due to error`);
      break;
    }

    // Pass output as input to next phase
    currentInput = {
      ...currentInput,
      previous_phases: {
        ...(currentInput.previous_phases as Record<string, unknown> || {}),
        [phase]: result.output,
      },
    };
  }

  return results;
}

// ============================================================================
// HOLDING VERIFICATION (Stage 3)
// ============================================================================

/**
 * Verify that a citation's holding supports the stated proposition
 * This is Stage 3 of the 3-stage citation verification process
 */
export async function verifyHolding(params: {
  citationText: string;
  opinionText: string;
  proposition: string;
}): Promise<{
  verified: boolean;
  status: 'verified' | 'mismatch' | 'partial';
  explanation: string;
}> {
  const anthropic = getAnthropicClient();

  const systemPrompt = `You are a legal research assistant verifying citation accuracy.

Your task is to verify whether the cited case actually supports the proposition for which it is cited.

Analyze the opinion text and determine:
1. Does the case actually hold what is claimed?
2. Is the holding fully supported, partially supported, or mismatched?

Return JSON:
{
  "status": "verified" | "mismatch" | "partial",
  "explanation": "Brief explanation of your finding",
  "actual_holding": "What the case actually holds",
  "cited_proposition": "What it was cited for"
}`;

  const userMessage = `Citation: ${params.citationText}

Claimed proposition: ${params.proposition}

Opinion text (excerpt):
${params.opinionText.substring(0, 10000)}

Verify if this case supports the claimed proposition.`;

  try {
    const response = await anthropic.messages.create({
      model: MODELS.OPUS, // Always use Opus for holding verification
      max_tokens: 2000,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    });

    let outputText = '';
    for (const block of response.content) {
      if (block.type === 'text') {
        outputText += block.text;
      }
    }

    const result = JSON.parse(cleanJsonResponse(outputText));

    return {
      verified: result.status === 'verified',
      status: result.status,
      explanation: result.explanation,
    };
  } catch (error) {
    console.error('[PhaseExecutor] Holding verification error:', error);
    return {
      verified: false,
      status: 'mismatch',
      explanation: `Verification failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

// ============================================================================
// COST CALCULATION
// ============================================================================

/**
 * Calculate execution cost in cents
 * Based on Anthropic pricing (approximate)
 */
export function calculateCost(
  model: string,
  inputTokens: number,
  outputTokens: number
): number {
  // Pricing per 1M tokens (as of 2025)
  const pricing: Record<string, { input: number; output: number }> = {
    [MODELS.SONNET]: { input: 3, output: 15 },
    [MODELS.OPUS]: { input: 15, output: 75 },
  };

  const modelPricing = pricing[model] || pricing[MODELS.SONNET];

  const inputCost = (inputTokens / 1_000_000) * modelPricing.input;
  const outputCost = (outputTokens / 1_000_000) * modelPricing.output;

  // Convert to cents
  return Math.round((inputCost + outputCost) * 100);
}
