/**
 * Extended Thinking Configuration (Task 64)
 *
 * Configures extended thinking for complex Claude API calls.
 *
 * Extended thinking required for:
 * - Phase III (Tier C) — Legal strategy analysis
 * - Phase V (Tier C) — Complex argument drafting
 * - Phase VII (all tiers) — Quality grading
 * - Phase VII.1 — Revision with thinking
 *
 * Source: Chunk 9, Task 64 - Gap Analysis B-2
 */

// ============================================================================
// TYPES
// ============================================================================

export interface ThinkingConfig {
  enabled: boolean;
  budgetTokens: number;
}

import type { MotionTier } from '@/types/workflow';
export type { MotionTier };

// ============================================================================
// CONFIGURATION
// ============================================================================

/**
 * Phases that require extended thinking
 */
export const EXTENDED_THINKING_PHASES = [
  'III',   // Legal strategy (Tier C only)
  'V',     // Drafting (Tier C only)
  'VII',   // Quality grading (all tiers)
  'VII.1', // Revision (all tiers)
];

/**
 * Thinking token budgets by phase and tier
 * null means extended thinking is not enabled for that combination
 */
export const THINKING_BUDGETS: Record<string, Record<MotionTier, number | null>> = {
  'III': { A: null, B: null, C: 10000, D: 10000 },
  'IV': { A: null, B: null, C: null, D: 16000 },
  'V': { A: null, B: null, C: 10000, D: 10000 },
  'VII': { A: 5000, B: 5000, C: 10000, D: 10000 },
  'VII.1': { A: 5000, B: 5000, C: 10000, D: 10000 },
};

// ============================================================================
// FUNCTIONS
// ============================================================================

/**
 * Check if a phase/tier combination should use extended thinking
 */
export function shouldUseExtendedThinking(
  phase: string,
  tier: MotionTier
): boolean {
  const budgets = THINKING_BUDGETS[phase];
  if (!budgets) return false;

  return budgets[tier] !== null;
}

/**
 * Get the thinking configuration for a phase/tier combination
 */
export function getThinkingConfig(
  phase: string,
  tier: MotionTier
): ThinkingConfig {
  const budgets = THINKING_BUDGETS[phase];

  if (!budgets || budgets[tier] === null) {
    return {
      enabled: false,
      budgetTokens: 0,
    };
  }

  return {
    enabled: true,
    budgetTokens: budgets[tier] as number,
  };
}

/**
 * Get thinking budget tokens for a phase/tier
 * Returns 0 if extended thinking is not enabled
 */
export function getThinkingBudget(
  phase: string,
  tier: MotionTier
): number {
  const config = getThinkingConfig(phase, tier);
  return config.budgetTokens;
}

/**
 * Build the thinking parameter for Claude API
 * Returns undefined if thinking is not enabled
 */
export function buildThinkingParam(
  phase: string,
  tier: MotionTier
): { type: 'enabled'; budget_tokens: number } | undefined {
  const config = getThinkingConfig(phase, tier);

  if (!config.enabled) {
    return undefined;
  }

  return {
    type: 'enabled',
    budget_tokens: config.budgetTokens,
  };
}

/**
 * Get all phases that have extended thinking enabled
 */
export function getPhasesWithThinking(): string[] {
  return Object.keys(THINKING_BUDGETS);
}

/**
 * Check if any tier has extended thinking for a phase
 */
export function phaseHasThinking(phase: string): boolean {
  const budgets = THINKING_BUDGETS[phase];
  if (!budgets) return false;

  return Object.values(budgets).some((b) => b !== null);
}

/**
 * Get thinking configuration summary for logging/debugging
 */
export function getThinkingSummary(
  phase: string,
  tier: MotionTier
): string {
  const config = getThinkingConfig(phase, tier);

  if (!config.enabled) {
    return `Phase ${phase} / Tier ${tier}: Extended thinking DISABLED`;
  }

  return `Phase ${phase} / Tier ${tier}: Extended thinking ENABLED (${config.budgetTokens} tokens)`;
}
