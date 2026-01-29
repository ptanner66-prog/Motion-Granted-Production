// /lib/config/models.ts
// Centralized model string configuration for Motion Granted
// VERSION: 7.4.1 — January 28, 2026

export const MODELS = {
  // ═══════════════════════════════════════════════════════════════
  // ANTHROPIC MODELS
  // ═══════════════════════════════════════════════════════════════

  // Primary model for Judge Simulation (Phase VII), complex reasoning
  OPUS: "claude-opus-4-5-20251101",

  // Standard model for drafting, CODE MODE phases
  SONNET: "claude-sonnet-4-20250514",

  // ═══════════════════════════════════════════════════════════════
  // OPENAI MODELS FOR CITATION VERIFICATION
  // ═══════════════════════════════════════════════════════════════

  // IMPORTANT: The spec references "GPT-5.2" as a conceptual placeholder.
  // OpenAI has NOT released a model called "GPT-5.2" as of January 2026.
  //
  // IMPLEMENTATION OPTIONS:
  //
  // Option 1 (RECOMMENDED): Use GPT-4 Turbo with low temperature
  // - Model: "gpt-4-turbo-2024-04-09" or "gpt-4-turbo"
  // - Parameters: { temperature: 0.1, max_tokens: 64000 }
  //
  // Option 2: Use o1-preview/o1-mini reasoning models (if available)
  // - Model: "o1-preview" or "o1-mini"
  // - Parameters: { reasoning_effort: "high" } (not temperature)
  // - NOTE: o1 models don't support temperature parameter
  //
  // Option 3: Use GPT-4o (latest)
  // - Model: "gpt-4o-2024-05-13" or "gpt-4o"
  // - Parameters: { temperature: 0.1, max_tokens: 64000 }
  //
  // Choose based on your OpenAI API access and cost considerations.
  OPENAI_CITATION_VERIFIER: process.env.OPENAI_CITATION_MODEL || "gpt-4-turbo",

  // Model type determines parameter style
  OPENAI_MODEL_TYPE: process.env.OPENAI_MODEL_TYPE || "standard", // "standard" | "reasoning"

} as const;

// ═══════════════════════════════════════════════════════════════
// EXTENDED THINKING BUDGETS
// ═══════════════════════════════════════════════════════════════

export const EXTENDED_THINKING = {
  // Phase VI: Opposition Anticipation (Tier B/C only)
  PHASE_VI_TIER_BC: 8000,

  // Phase VII: Judge Simulation (ALL TIERS)
  PHASE_VII_ALL: 10000,

  // Phase VIII: Revisions (Tier B/C only)
  PHASE_VIII_TIER_BC: 8000,
} as const;

// ═══════════════════════════════════════════════════════════════
// TOKEN LIMITS
// ═══════════════════════════════════════════════════════════════

export const TOKEN_LIMITS = {
  OPUS_MAX_TOKENS: 128000,
  SONNET_MAX_TOKENS: 64000,
  OPENAI_MAX_TOKENS: 4096,
} as const;

// ═══════════════════════════════════════════════════════════════
// HELPER FUNCTION FOR OPENAI PARAMETERS
// ═══════════════════════════════════════════════════════════════

/**
 * Get OpenAI API parameters based on model type
 */
export function getOpenAIParams(): Record<string, unknown> {
  if (MODELS.OPENAI_MODEL_TYPE === "reasoning") {
    // o1-style reasoning models use reasoning_effort, not temperature
    return {
      model: MODELS.OPENAI_CITATION_VERIFIER,
      reasoning_effort: "high",
      max_tokens: TOKEN_LIMITS.OPENAI_MAX_TOKENS,
    };
  } else {
    // Standard models (GPT-4, GPT-4o, GPT-4-turbo)
    return {
      model: MODELS.OPENAI_CITATION_VERIFIER,
      temperature: 0.1,
      max_tokens: TOKEN_LIMITS.OPENAI_MAX_TOKENS,
    };
  }
}

/**
 * Get Claude API parameters based on tier and phase
 */
export function getClaudeParams(
  tier: 'A' | 'B' | 'C',
  phase: string
): { model: string; maxTokens: number; extendedThinking?: number } {
  // Tier A uses Sonnet, Tier B/C use Opus
  const model = tier === 'A' ? MODELS.SONNET : MODELS.OPUS;
  const maxTokens = tier === 'A' ? TOKEN_LIMITS.SONNET_MAX_TOKENS : TOKEN_LIMITS.OPUS_MAX_TOKENS;

  // Extended thinking for specific phases
  let extendedThinking: number | undefined;
  if (phase === 'VI' && (tier === 'B' || tier === 'C')) {
    extendedThinking = EXTENDED_THINKING.PHASE_VI_TIER_BC;
  } else if (phase === 'VII') {
    extendedThinking = EXTENDED_THINKING.PHASE_VII_ALL;
  } else if (phase === 'VIII' && (tier === 'B' || tier === 'C')) {
    extendedThinking = EXTENDED_THINKING.PHASE_VIII_TIER_BC;
  }

  return { model, maxTokens, extendedThinking };
}

// Type exports
export type ModelKey = keyof typeof MODELS;
export type ExtendedThinkingKey = keyof typeof EXTENDED_THINKING;
export type Tier = 'A' | 'B' | 'C';
