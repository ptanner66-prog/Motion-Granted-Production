// /lib/config/models.ts
// Centralized model string configuration for Motion Granted
// VERSION: 5.0 — January 28, 2026

export const MODELS = {
  // ANTHROPIC MODELS
  OPUS: "claude-opus-4-5-20250514",
  SONNET: "claude-sonnet-4-5-20250514",

  // OPENAI MODELS FOR CITATION VERIFICATION
  // Note: Original spec referenced "GPT-5.2" — INVALID. Use GPT-4 Turbo.
  OPENAI_CITATION_VERIFIER: process.env.OPENAI_CITATION_MODEL || "gpt-4-turbo",
  OPENAI_MODEL_TYPE: process.env.OPENAI_MODEL_TYPE || "standard",
} as const;

export const EXTENDED_THINKING = {
  PHASE_VI_TIER_BC: 8000,
  PHASE_VII_ALL: 10000,
  PHASE_VIII_TIER_BC: 8000,
} as const;

export const TOKEN_LIMITS = {
  OPUS_MAX_TOKENS: 128000,
  SONNET_MAX_TOKENS: 64000,
  OPENAI_MAX_TOKENS: 4096,
} as const;

/**
 * Get OpenAI API parameters based on model type
 */
export function getOpenAIParams(): Record<string, unknown> {
  if (MODELS.OPENAI_MODEL_TYPE === "reasoning") {
    return {
      model: MODELS.OPENAI_CITATION_VERIFIER,
      reasoning_effort: "high",
      max_tokens: TOKEN_LIMITS.OPENAI_MAX_TOKENS,
    };
  }
  return {
    model: MODELS.OPENAI_CITATION_VERIFIER,
    temperature: 0.1,
    max_tokens: TOKEN_LIMITS.OPENAI_MAX_TOKENS,
  };
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

export type ModelKey = keyof typeof MODELS;
export type Tier = 'A' | 'B' | 'C';
