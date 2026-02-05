/**
 * MODEL STRING CONSTANTS — Motion Granted
 *
 * SINGLE SOURCE OF TRUTH for all AI model identifiers.
 * Routing logic is in phase-registry.ts — this file is STRINGS ONLY.
 *
 * Authority: Clay's Master Implementation Guide v2.5, Batch 2 §A.2
 *            Reference: Model Strings (lines 2354-2371)
 *
 * ⚠️  To update a model version:
 *     1. Change the string HERE (and ONLY here)
 *     2. Run: grep -r "claude-\|gpt-" lib/ types/ --include="*.ts" | grep -v node_modules
 *     3. Verify NO hardcoded model strings exist outside this file
 *     4. Run tests: npm test
 *
 * WARNING: Never use gpt-5.2 (does not exist).
 *          Never use claude-sonnet-4-5-20250929 (wrong model ID — that's Sonnet 4.5, not Sonnet 4).
 *
 * NOTE: The megaprompt spec referenced 'claude-opus-4-5-20250514' and
 *       'claude-sonnet-4-5-20250514'. Neither matches the production codebase.
 *       Verified production strings from phase-executors.ts, phase-config.ts,
 *       and ai/model-router.ts are used here. If Clay intends to upgrade to
 *       different model versions, change ONLY this file.
 */

// ============================================================================
// MODEL IDENTIFIERS
// ============================================================================

export const MODELS = {
  /** Complex reasoning: Phase IV B/C, VI B/C, VII all, VIII B/C, V.1/VII.1/IX.1 Stage 2 */
  OPUS: 'claude-opus-4-5-20251101',

  /** Standard drafting: Phase II, III, IV A, V, VIII A, IX, V.1 Steps 3-5 Tier C */
  SONNET: 'claude-sonnet-4-20250514',

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
