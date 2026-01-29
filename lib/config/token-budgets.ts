// /lib/config/token-budgets.ts
// Extended thinking and token budget configuration
// UPDATED: January 29, 2026 — Maximized for production legal workloads
// VERSION: 2.0

/**
 * Extended Thinking Token Budgets
 *
 * This is an automated law firm. These motions go to real courts.
 * Give Claude the headroom it needs to reason properly.
 *
 * MAX (128K): Complex legal reasoning phases
 * HALF (64K): Supporting/procedural phases
 */

export const EXTENDED_THINKING_BUDGETS: Record<string, number> = {
  // ═══════════════════════════════════════════════════════════════════
  // MAXIMUM BUDGET (128K) — Complex Legal Reasoning
  // ═══════════════════════════════════════════════════════════════════

  // Phase IV: Strategy Development
  // Needs deep thinking for case strategy, argument structure
  'IV': 128000,

  // Phase VI: Opposition Anticipation
  // Must anticipate every counter-argument opponent might raise
  'VI': 128000,

  // Phase VII: Judge Simulation
  // Simulates judicial review — needs maximum reasoning capacity
  'VII': 128000,

  // Phase VIII: Revisions
  // Comprehensive review and improvement of draft
  'VIII': 128000,

  // ═══════════════════════════════════════════════════════════════════
  // HALF BUDGET (64K) — Supporting Phases
  // ═══════════════════════════════════════════════════════════════════

  // Phase I: Intake & Classification
  'I': 64000,

  // Phase II: Document Gathering & Analysis
  'II': 64000,

  // Phase III: Legal Analysis
  'III': 64000,

  // Phase V: Research
  'V': 64000,

  // Phase V.1: Citation Verification
  'V.1': 64000,

  // Phase VII.1: Post-Revision Citation Check
  'VII.1': 64000,

  // Phase VIII.5: Quality Gate
  'VIII.5': 64000,

  // Phase IX: Final Assembly
  'IX': 64000,

  // Phase IX.1: Document Generation
  'IX.1': 64000,

  // Phase X: Delivery
  'X': 64000,
} as const;

/**
 * Output token limits by phase
 * These control the maximum response length
 */
export const OUTPUT_TOKEN_LIMITS: Record<string, number> = {
  // Complex drafting phases — max output
  'V': 128000,   // Full motion draft
  'VI': 32000,   // Full opposition brief
  'VII': 16000,  // Judge simulation feedback
  'VIII': 32000, // Revised draft
  'IX': 32000,   // Final assembly
  'IX.1': 32000, // Document generation
  'X': 128000,   // Final QA and deliverables

  // Analysis phases — substantial output
  'III': 16000,  // Legal analysis
  'IV': 80000,   // Strategy + citation research

  // Lighter phases — moderate output
  'I': 8000,     // Classification
  'II': 8000,    // Document summaries
  'V.1': 8000,   // Citation results
  'VII.1': 8000, // Post-revision citations
  'VIII.5': 8000, // Quality assessment
} as const;

/**
 * Get extended thinking budget for a phase
 */
export function getThinkingBudget(phase: string): number {
  return EXTENDED_THINKING_BUDGETS[phase] ?? 64000; // Default to half-max
}

/**
 * Get output token limit for a phase
 */
export function getOutputLimit(phase: string): number {
  return OUTPUT_TOKEN_LIMITS[phase] ?? 16000; // Default reasonable
}

/**
 * Check if phase should use extended thinking
 * Extended thinking is enabled for ALL phases now
 */
export function shouldUseExtendedThinking(_phase: string): boolean {
  // All phases benefit from extended thinking in legal work
  return true;
}

/**
 * Get complete token configuration for a phase
 */
export function getPhaseTokenConfig(phase: string): {
  thinkingBudget: number;
  outputLimit: number;
  useExtendedThinking: boolean;
} {
  return {
    thinkingBudget: getThinkingBudget(phase),
    outputLimit: getOutputLimit(phase),
    useExtendedThinking: shouldUseExtendedThinking(phase),
  };
}

/**
 * Get thinking budget for phase + tier combination
 * Some phases only use extended thinking for B/C tiers
 * With maximized budgets, ALL tiers get extended thinking
 */
export function getThinkingBudgetForTier(
  phase: string,
  _tier: 'A' | 'B' | 'C'
): number {
  // With maximized budgets, all tiers benefit from extended thinking
  return getThinkingBudget(phase);
}

// Type exports
export type PhaseCode = keyof typeof EXTENDED_THINKING_BUDGETS;
