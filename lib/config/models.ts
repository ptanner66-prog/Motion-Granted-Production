/**
 * Centralized model string constants for Motion Granted.
 *
 * This file defines the MODELS constant (canonical model strings),
 * validation, and cost data. Routing logic lives in phase-registry.ts,
 * which imports MODELS from here.
 *
 * Imported by:
 * - lib/config/phase-registry.ts (MODELS, validateModelString, ModelId)
 * - lib/workflow/phase-executors.ts (MODELS)
 * - lib/inngest/functions.ts (MODELS)
 * - lib/civ/model-router.ts (MODELS)
 * - __tests__/citations/citation-models.test.ts (MODELS)
 */

// /lib/config/models.ts
// Centralized model string configuration for Motion Granted
// VERSION: 7.4.1 — January 28, 2026

export const MODELS = {
  /** Complex reasoning: Phase IV B/C, VI B/C/D, VII all, VIII B/C/D, V.1/VII.1/IX.1 Stage 2 */
  OPUS: process.env.OPUS_MODEL_VERSION || 'claude-opus-4-6',

  /** Standard drafting: Phase II, III, IV A, V, VIII A, IX, V.1 Steps 3-5 Tier C/D */
  SONNET: process.env.SONNET_MODEL_VERSION || 'claude-sonnet-4-5-20250929',

  /** Fast simple tasks: V.1/VII.1/IX.1 Steps 3-5 Tier A/B (cost optimization) */
  HAIKU: 'claude-haiku-4-5-20251001',

  /** Citation verification Stage 1: holding verification across all tiers */
  GPT4_TURBO: 'gpt-4-turbo',
} as const;

export type ModelId = (typeof MODELS)[keyof typeof MODELS];

// ============================================================================
// MODEL VALIDATION
// ============================================================================

const VALID_MODELS = new Set<string>(Object.values(MODELS));

/**
 * Validates a model string before API call.
 * Implements: MR-007 — Reject invalid strings with clear error.
 *
 * @throws Error if model string is not in the MODELS constant
 */
export function validateModelString(model: string, context: string): void {
  if (!VALID_MODELS.has(model)) {
    throw new Error(
      `[MODEL_VALIDATION] Invalid model string "${model}" in ${context}. ` +
      `Valid models: ${Array.from(VALID_MODELS).join(', ')}. ` +
      `Check lib/config/models.ts for correct values.`
    );
  }
}

// ============================================================================
// MODEL COSTS (for profitability tracking — MR-008)
// ============================================================================

export const MODEL_COSTS: Record<string, { input: number; output: number }> = {
  [MODELS.OPUS]:       { input: 15.00, output: 75.00 },   // per 1M tokens
  [MODELS.SONNET]:     { input: 3.00,  output: 15.00 },
  [MODELS.HAIKU]:      { input: 0.80,  output: 4.00 },
  [MODELS.GPT4_TURBO]: { input: 10.00, output: 30.00 },
};
