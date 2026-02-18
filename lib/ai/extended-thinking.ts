/**
 * Extended Thinking Configuration
 *
 * DELEGATES to lib/config/phase-registry.ts (SINGLE SOURCE OF TRUTH).
 * This module provides convenience wrappers for thinking budget lookups.
 * DO NOT duplicate thinking budget values here — they live in phase-registry.ts.
 */

import { getThinkingBudget as registryGetThinkingBudget } from '@/lib/config/phase-registry';
import type { MotionTier } from '@/types/workflow';
export type { MotionTier };

// ============================================================================
// TYPES
// ============================================================================

export interface ThinkingConfig {
  enabled: boolean;
  budgetTokens: number;
}

// ============================================================================
// FUNCTIONS — all delegate to phase-registry.ts
// ============================================================================

/**
 * Check if a phase/tier combination should use extended thinking.
 * Delegates to phase-registry.ts getThinkingBudget().
 */
export function shouldUseExtendedThinking(
  phase: string,
  tier: MotionTier
): boolean {
  try {
    const budget = registryGetThinkingBudget(phase as Parameters<typeof registryGetThinkingBudget>[0], tier);
    return budget !== undefined && budget > 0;
  } catch {
    return false;
  }
}

/**
 * Get the thinking configuration for a phase/tier combination.
 * Delegates to phase-registry.ts getThinkingBudget().
 */
export function getThinkingConfig(
  phase: string,
  tier: MotionTier
): ThinkingConfig {
  try {
    const budget = registryGetThinkingBudget(phase as Parameters<typeof registryGetThinkingBudget>[0], tier);
    if (!budget || budget <= 0) {
      return { enabled: false, budgetTokens: 0 };
    }
    return { enabled: true, budgetTokens: budget };
  } catch {
    return { enabled: false, budgetTokens: 0 };
  }
}

/**
 * Get thinking budget tokens for a phase/tier.
 * Returns 0 if extended thinking is not enabled.
 * Delegates to phase-registry.ts getThinkingBudget().
 */
export function getThinkingBudget(
  phase: string,
  tier: MotionTier
): number {
  const config = getThinkingConfig(phase, tier);
  return config.budgetTokens;
}

/**
 * Build the thinking parameter for Claude API.
 * Returns undefined if thinking is not enabled.
 * Delegates to phase-registry.ts getThinkingBudget().
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
 * Get thinking configuration summary for logging/debugging.
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
