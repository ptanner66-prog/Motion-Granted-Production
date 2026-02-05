/**
 * Phase Registry — Single Source of Truth for Model Routing & Configuration
 *
 * VERSION: 1.0 — February 5, 2026
 * AUTHOR: Chen (Routing Unification Audit)
 *
 * This file is the ONLY authority for:
 *   - Model selection per phase × tier
 *   - Extended thinking budgets per phase × tier
 *   - Max token limits
 *   - Citation batch sizes
 *   - Prompt file keys
 *
 * ALL other files that previously defined routing (phase-executors.ts,
 * phase-config.ts, types/workflow.ts, model-router.ts, config/models.ts)
 * MUST import from here. No local overrides. No duplicates.
 *
 * Ground truth source: Clay's Workflow Audit §7.1, §7.2, §8.3
 *
 * OPEN QUESTION (requires Clay): Phase VII.1 spec says Sonnet + ET budgets.
 * Extended thinking at 5K/10K budget levels requires Opus. The registry
 * follows the spec literally (Sonnet + ET) but this may fail at runtime
 * if the Anthropic API rejects ET on Sonnet. If so, change VII.1 model
 * to OPUS for tiers that have ET enabled.
 */

// ============================================================================
// MODEL STRING CONSTANTS
// ============================================================================

export const CLAUDE_MODELS = {
  SONNET: 'claude-sonnet-4-20250514',
  OPUS: 'claude-opus-4-5-20251101',
} as const;

export const OPENAI_MODELS = {
  CITATION_VERIFIER: 'gpt-4-turbo',
} as const;

export type ClaudeModelId = typeof CLAUDE_MODELS[keyof typeof CLAUDE_MODELS];
export type Tier = 'A' | 'B' | 'C';

// ============================================================================
// PHASE CODES
// ============================================================================

export const PHASE_CODES = [
  'I', 'II', 'III', 'IV', 'V', 'V.1', 'VI', 'VII', 'VII.1',
  'VIII', 'VIII.5', 'IX', 'IX.1', 'X',
] as const;

export type PhaseCode = typeof PHASE_CODES[number];
export const TOTAL_PHASES = 14;

// ============================================================================
// PHASE TIER CONFIG TYPE
// ============================================================================

interface PhaseTierConfig {
  model: ClaudeModelId;
  extendedThinking: number | null; // null = disabled, number = budget_tokens
  maxTokens: number;               // 64000 (no ET) or 128000 (with ET)
}

interface PhaseEntry {
  name: string;
  order: number;
  promptKey: string;
  tiers: Record<Tier, PhaseTierConfig>;
  citationBatchSize: Record<Tier, number>;
}

// ============================================================================
// TOKEN LIMITS
// ============================================================================

const MAX_TOKENS_STANDARD = 64_000;
const MAX_TOKENS_EXTENDED = 128_000;

// ============================================================================
// HELPER: Build a tier config
// ============================================================================

function tc(model: ClaudeModelId, et: number | null): PhaseTierConfig {
  return {
    model,
    extendedThinking: et,
    maxTokens: et !== null ? MAX_TOKENS_EXTENDED : MAX_TOKENS_STANDARD,
  };
}

const S = CLAUDE_MODELS.SONNET;
const O = CLAUDE_MODELS.OPUS;

// ============================================================================
// STANDARD BATCH SIZES (from Clay's Workflow Audit §8.3)
// ============================================================================

const STANDARD_BATCH: Record<Tier, number> = { A: 5, B: 4, C: 3 };
const CIV_CHECK_BATCH: Record<Tier, number> = { A: 2, B: 2, C: 2 };

// ============================================================================
// THE REGISTRY — 14 PHASES × 3 TIERS
//
// Ground truth from Clay's Workflow Audit:
//   §7.1 — Model Selection
//   §7.2 — Extended Thinking Budgets
//   §8.3 — Citation Batch Sizes
//
// ET budget values:
//   Phase III  — Tier C only:     10,000
//   Phase V    — Tier C only:     10,000
//   Phase VI   — Tier B/C:         8,000
//   Phase VII  — Tier A/B: 5,000   Tier C: 10,000
//   Phase VII.1— Tier A/B: 5,000   Tier C: 10,000
//   Phase VIII — Tier B/C:         8,000
//   All others: null (disabled)
//
// Model selection:
//   Phase VII:        ALWAYS Opus (all tiers)
//   Phase IV B/C:     Opus
//   Phase VI B/C:     Opus
//   Phase VIII B/C:   Opus (ET requires Opus)
//   Everything else:  Sonnet
// ============================================================================

export const PHASE_REGISTRY: Record<PhaseCode, PhaseEntry> = {
  'I': {
    name: 'Intake & Document Processing',
    order: 1,
    promptKey: 'PHASE_I',
    tiers: {
      A: tc(S, null),
      B: tc(S, null),
      C: tc(S, null),
    },
    citationBatchSize: STANDARD_BATCH,
  },
  'II': {
    name: 'Legal Standards / Motion Deconstruction',
    order: 2,
    promptKey: 'PHASE_II',
    tiers: {
      A: tc(S, null),
      B: tc(S, null),
      C: tc(S, null),
    },
    citationBatchSize: STANDARD_BATCH,
  },
  'III': {
    name: 'Evidence Strategy / Issue Identification',
    order: 3,
    promptKey: 'PHASE_III',
    tiers: {
      A: tc(S, null),
      B: tc(S, null),
      C: tc(S, 10_000),  // Tier C: extended thinking for legal strategy
    },
    citationBatchSize: STANDARD_BATCH,
  },
  'IV': {
    name: 'Authority Research',
    order: 4,
    promptKey: 'PHASE_IV',
    tiers: {
      A: tc(S, null),
      B: tc(O, null),     // Opus for complex research
      C: tc(O, null),     // Opus for complex research
    },
    citationBatchSize: STANDARD_BATCH,
  },
  'V': {
    name: 'Drafting',
    order: 5,
    promptKey: 'PHASE_V',
    tiers: {
      A: tc(S, null),
      B: tc(S, null),
      C: tc(S, 10_000),  // Tier C: extended thinking for complex drafting
    },
    citationBatchSize: STANDARD_BATCH,
  },
  'V.1': {
    name: 'Citation Accuracy Check',
    order: 6,
    promptKey: 'PHASE_V1',
    tiers: {
      A: tc(S, null),
      B: tc(S, null),
      C: tc(S, null),
    },
    citationBatchSize: CIV_CHECK_BATCH,  // Always 2 for citation check phases
  },
  'VI': {
    name: 'Opposition Anticipation',
    order: 7,
    promptKey: 'PHASE_VI',
    tiers: {
      A: tc(S, null),     // Tier A: skipped per PHASE_SKIP_RULES, but if it runs: Sonnet, no ET
      B: tc(O, 8_000),    // Opus + ET for opposition analysis
      C: tc(O, 8_000),    // Opus + ET for opposition analysis
    },
    citationBatchSize: STANDARD_BATCH,
  },
  'VII': {
    name: 'Judge Simulation',
    order: 8,
    promptKey: 'PHASE_VII',
    tiers: {
      A: tc(O, 5_000),    // Always Opus — reduced ET for simpler motions
      B: tc(O, 5_000),    // Always Opus — standard ET
      C: tc(O, 10_000),   // Always Opus — maximum ET for complex motions
    },
    citationBatchSize: STANDARD_BATCH,
  },
  'VII.1': {
    name: 'Post-Revision Citation Check',
    order: 9,
    promptKey: 'PHASE_VII1',
    tiers: {
      // NOTE: Spec says Sonnet but ET budgets (5K/10K) may require Opus.
      // If Anthropic API rejects ET on Sonnet at these levels, change to Opus.
      // See OPEN QUESTION in file header.
      A: tc(S, 5_000),
      B: tc(S, 5_000),
      C: tc(S, 10_000),
    },
    citationBatchSize: CIV_CHECK_BATCH,  // Always 2 for citation check phases
  },
  'VIII': {
    name: 'Revisions',
    order: 10,
    promptKey: 'PHASE_VIII',
    tiers: {
      A: tc(S, null),
      B: tc(O, 8_000),    // Opus required for ET
      C: tc(O, 8_000),    // Opus required for ET
    },
    citationBatchSize: STANDARD_BATCH,
  },
  'VIII.5': {
    name: 'Caption Validation',
    order: 11,
    promptKey: 'PHASE_VIII5',
    tiers: {
      A: tc(S, null),
      B: tc(S, null),
      C: tc(S, null),
    },
    citationBatchSize: STANDARD_BATCH,
  },
  'IX': {
    name: 'Supporting Documents',
    order: 12,
    promptKey: 'PHASE_IX',
    tiers: {
      A: tc(S, null),
      B: tc(S, null),
      C: tc(S, null),
    },
    citationBatchSize: STANDARD_BATCH,
  },
  'IX.1': {
    name: 'Separate Statement Check',
    order: 13,
    promptKey: 'PHASE_IX1',
    tiers: {
      A: tc(S, null),
      B: tc(S, null),
      C: tc(S, null),
    },
    citationBatchSize: STANDARD_BATCH,
  },
  'X': {
    name: 'Final Assembly',
    order: 14,
    promptKey: 'PHASE_X',
    tiers: {
      A: tc(S, null),
      B: tc(S, null),
      C: tc(S, null),
    },
    citationBatchSize: STANDARD_BATCH,
  },
};

// ============================================================================
// GETTER FUNCTIONS — Drop-in replacements for existing routing functions
// ============================================================================

/**
 * Get the Claude model ID for a phase × tier combination.
 *
 * Replaces:
 *   - phase-executors.ts:112    getModelForPhase() (local)
 *   - phase-config.ts:216       getModelForPhase() (exported)
 *   - types/workflow.ts:873     getModelForPhase() (exported)
 *   - model-router.ts:97        getModelId()
 */
export function getModelForPhase(phase: PhaseCode, tier: Tier): ClaudeModelId {
  const entry = PHASE_REGISTRY[phase];
  if (!entry) {
    throw new Error(`[phase-registry] Unknown phase: ${phase}`);
  }
  return entry.tiers[tier].model;
}

/**
 * Get the extended thinking budget for a phase × tier combination.
 * Returns null if ET is disabled for this combination.
 *
 * Replaces:
 *   - phase-executors.ts:128    getThinkingBudget() (local)
 *   - phase-config.ts:226       getExtendedThinkingBudget() (exported)
 *   - types/workflow.ts:909     getExtendedThinkingBudget() (exported)
 *   - model-router.ts:104       getThinkingBudget()
 */
export function getETBudget(phase: PhaseCode, tier: Tier): number | null {
  const entry = PHASE_REGISTRY[phase];
  if (!entry) {
    throw new Error(`[phase-registry] Unknown phase: ${phase}`);
  }
  return entry.tiers[tier].extendedThinking;
}

/**
 * Get the max_tokens for a phase × tier combination.
 * 128,000 when ET is enabled, 64,000 otherwise.
 *
 * Replaces hardcoded constants scattered across multiple files.
 */
export function getMaxTokens(phase: PhaseCode, tier: Tier): number {
  const entry = PHASE_REGISTRY[phase];
  if (!entry) {
    throw new Error(`[phase-registry] Unknown phase: ${phase}`);
  }
  return entry.tiers[tier].maxTokens;
}

/**
 * Get the citation batch size for a phase × tier combination.
 *
 * Standard phases: Tier A=5, B=4, C=3
 * Citation check phases (V.1, VII.1): Always 2
 *
 * Replaces:
 *   - types/workflow.ts:929     getCitationBatchSize()
 *   - workflow-config.ts:124    getCitationBatchSize()
 *   - phase-config.ts:308       getCitationBatchSize()
 */
export function getBatchSize(phase: PhaseCode, tier: Tier): number {
  const entry = PHASE_REGISTRY[phase];
  if (!entry) {
    throw new Error(`[phase-registry] Unknown phase: ${phase}`);
  }
  return entry.citationBatchSize[tier];
}

/**
 * Check if extended thinking is enabled for a phase × tier combination.
 */
export function hasExtendedThinking(phase: PhaseCode, tier: Tier): boolean {
  return getETBudget(phase, tier) !== null;
}

/**
 * Get the full tier config for a phase × tier combination.
 */
export function getTierConfig(phase: PhaseCode, tier: Tier): PhaseTierConfig {
  const entry = PHASE_REGISTRY[phase];
  if (!entry) {
    throw new Error(`[phase-registry] Unknown phase: ${phase}`);
  }
  return entry.tiers[tier];
}

/**
 * Get the phase entry (full config for all tiers).
 */
export function getPhaseEntry(phase: PhaseCode): PhaseEntry {
  const entry = PHASE_REGISTRY[phase];
  if (!entry) {
    throw new Error(`[phase-registry] Unknown phase: ${phase}`);
  }
  return entry;
}

/**
 * Get all phases in execution order.
 */
export function getAllPhasesInOrder(): Array<{ code: PhaseCode; entry: PhaseEntry }> {
  return PHASE_CODES.map(code => ({ code, entry: PHASE_REGISTRY[code] }));
}

// ============================================================================
// QUALITY THRESHOLDS
//
// Centralized here to eliminate the 3 competing grade scale systems.
// Uses 0-1 decimal scale ONLY. No more 4.0 GPA confusion.
//
// B+ = 0.87 for ALL tiers (spec says uniform).
// NOTE: workflow-config.ts has Tier A = 0.83. If Clay confirms that's
// intentional, update JUDGE_GRADE_MINIMUM.A below.
// ============================================================================

export const QUALITY_THRESHOLDS = {
  /** Minimum judge simulation grade to pass (0-1 scale, B+ = 0.87) */
  JUDGE_GRADE_MINIMUM: { A: 0.87, B: 0.87, C: 0.87 } as Record<Tier, number>,

  /** Maximum acceptable citation failure rate */
  CITATION_FAILURE_MAX: { A: 0.20, B: 0.15, C: 0.10 } as Record<Tier, number>,

  /** Hard stop: minimum citations before workflow can proceed */
  HARD_STOP_MINIMUM: 4,

  /** Maximum revision loops before Protocol 10 escalation */
  MAX_REVISION_LOOPS: 3,
} as const;

/**
 * Check if a judge grade (0-1 scale) passes for a given tier.
 */
export function judgeGradePasses(grade: number, tier: Tier): boolean {
  return grade >= QUALITY_THRESHOLDS.JUDGE_GRADE_MINIMUM[tier];
}

/**
 * Check if a citation failure rate is acceptable for a given tier.
 */
export function citationFailureAcceptable(failureRate: number, tier: Tier): boolean {
  return failureRate <= QUALITY_THRESHOLDS.CITATION_FAILURE_MAX[tier];
}
