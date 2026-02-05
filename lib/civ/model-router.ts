/**
 * CIV Model Router
 *
 * Cross-vendor model routing for Citation Integrity Verification.
 * Stage 1 (Holding Verification): GPT (OpenAI)
 * Stage 2 (Adversarial): Claude Opus (Anthropic)
 * Steps 3-5: Claude Haiku/Sonnet based on tier
 *
 * CANONICAL SOURCE: lib/config/citation-models.ts (getCitationModel)
 * This file delegates to citation-models.ts for model strings.
 *
 * Tier-based routing per Clay's Part C §3:
 * - Tier A: Simple procedural motions (gpt-4o + haiku)
 * - Tier B: Standard substantive motions (gpt-4o + haiku)
 * - Tier C: Complex/high-stakes motions (gpt-4o fallback + sonnet)
 */

import OpenAI from 'openai';
import { getOpenAIAPIKey } from '@/lib/api-keys';
import { getAnthropicClient } from '@/lib/automation/claude';
import { getCitationModel, CITATION_GPT_MODELS, type Tier as CivTier } from '@/lib/config/citation-models';
import { MODELS } from '@/lib/config/models';

export type MotionTier = 'A' | 'B' | 'C';

// Clay's exact model routing — aligned with citation-models.ts
// gpt-5.2 does NOT exist yet. Using gpt-4o as fallback per Clay's Part C Issue 2.
export const MODEL_ROUTING = {
  tier_a: {
    stage_1_holding: CITATION_GPT_MODELS.STAGE_1_DEFAULT,
    stage_2_adversarial: MODELS.OPUS,
    steps_3_5: MODELS.HAIKU,
  },
  tier_b: {
    stage_1_holding: CITATION_GPT_MODELS.STAGE_1_DEFAULT,
    stage_2_adversarial: MODELS.OPUS,
    steps_3_5: MODELS.HAIKU,
  },
  tier_c: {
    stage_1_holding: CITATION_GPT_MODELS.STAGE_1_TIER_C,
    stage_2_adversarial: MODELS.OPUS,
    steps_3_5: MODELS.SONNET,
  },
} as const;

// Motion type to tier mapping
export const MOTION_TYPE_TO_TIER: Record<string, MotionTier> = {
  // Tier A - Simple procedural
  'extension_of_time': 'A',
  'continuance': 'A',
  'pro_hac_vice': 'A',
  'substitution_of_counsel': 'A',

  // Tier B - Standard substantive
  'motion_to_compel': 'B',
  'motion_for_protective_order': 'B',
  'demurrer': 'B',
  'motion_to_strike': 'B',
  'motion_for_sanctions': 'B',
  'anti_slapp': 'B',
  'motion_to_dismiss': 'B',

  // Tier C - Complex/high-stakes
  'motion_for_summary_judgment': 'C',
  'msj': 'C',
  'preliminary_injunction': 'C',
  'tro': 'C',
  'class_certification': 'C',
  'daubert_motion': 'C',
};

/**
 * Get tier from motion type string
 */
export function getTierFromMotionType(motionType: string): MotionTier {
  const normalized = motionType.toLowerCase().replace(/\s+/g, '_');
  return MOTION_TYPE_TO_TIER[normalized] || 'B';
}

/**
 * Get the appropriate model for a task and tier
 */
export function getModelForTask(
  task: 'stage_1_holding' | 'stage_2_adversarial' | 'steps_3_5',
  tier: MotionTier
): string {
  const tierKey = `tier_${tier.toLowerCase()}` as keyof typeof MODEL_ROUTING;
  return MODEL_ROUTING[tierKey][task];
}

// OpenAI client singleton
let openaiClient: OpenAI | null = null;

/**
 * Get or create OpenAI client
 */
export async function getOpenAIClient(): Promise<OpenAI> {
  if (!openaiClient) {
    const apiKey = await getOpenAIAPIKey();
    openaiClient = new OpenAI({ apiKey });
  }
  return openaiClient;
}

/**
 * Call OpenAI (for Stage 1 holding verification)
 */
export async function callOpenAI(
  model: string,
  prompt: string,
  maxTokens: number = 32000 // Increased from 1000 for comprehensive citation analysis
): Promise<string> {
  const client = await getOpenAIClient();

  const response = await client.chat.completions.create({
    model,
    messages: [{ role: 'user', content: prompt }],
    max_tokens: maxTokens,
    temperature: 0.1,
  });

  return response.choices[0]?.message?.content || '';
}

/**
 * Call Anthropic (for Stage 2 and Steps 3-5)
 */
export async function callAnthropic(
  model: string,
  prompt: string,
  maxTokens: number = 32000 // Increased from 1000 for comprehensive citation analysis
): Promise<string> {
  const client = await getAnthropicClient();

  if (!client) {
    throw new Error('Anthropic client not configured');
  }

  const response = await client.messages.create({
    model,
    max_tokens: maxTokens,
    messages: [{ role: 'user', content: prompt }],
  });

  const textBlock = response.content.find((block) => block.type === 'text');
  return textBlock?.type === 'text' ? textBlock.text : '';
}

/**
 * Stage 2 trigger logic - Clay's Part C §4 BINDING
 *
 * Trigger adversarial verification when:
 * - Confidence is borderline (80-94%) → HOLDING_STAGE_2
 * - Confidence is low (<80%) → HOLDING_FAIL (will also get Stage 2 for audit)
 * - HIGH_STAKES flag is set (always triggers Stage 2 regardless of confidence)
 *
 * ≥95% AND NOT HIGH_STAKES = skip Stage 2 (VERIFIED)
 */
export function shouldTriggerStage2(
  confidence: number,
  flags: string[] = []
): boolean {
  // HIGH_STAKES always triggers Stage 2
  if (flags.includes('HIGH_STAKES')) {
    return true;
  }

  // Convert confidence to 0-1 scale if needed
  const normalizedConf = confidence > 1 ? confidence / 100 : confidence;

  // ≥95% = VERIFIED without Stage 2 (unless HIGH_STAKES)
  if (normalizedConf >= 0.95) {
    return false;
  }

  // 80-94% = trigger Stage 2
  // <80% = HOLDING_MISMATCH but still run Stage 2 for audit trail
  return true;
}

/**
 * Reset OpenAI client (for testing or key rotation)
 */
export function resetOpenAIClient(): void {
  openaiClient = null;
}
