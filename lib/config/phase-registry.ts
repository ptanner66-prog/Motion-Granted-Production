/**
 * PHASE REGISTRY — Motion Granted
 *
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║  SINGLE SOURCE OF TRUTH for all phase × tier configuration.    ║
 * ║  Every other routing system in the codebase is DELETED.        ║
 * ║  If you need model/ET/batch info, import from HERE.            ║
 * ╚══════════════════════════════════════════════════════════════════╝
 *
 * Authority: Clay's Master Implementation Guide v2.5 (BINDING)
 *   - §1.1  Complete Phase Execution Map (lines 184-242)
 *   - §1.2  Model Routing Table (lines 250-283)
 *   - Batch 2 §A.2  Model Routing Matrix (lines 2373-2396)
 *   - Batch 2 §A.3  Extended Thinking Budget Matrix (lines 2399-2410)
 *   - §1.5 item 8   B+ = 87% quality threshold (line 379)
 *   - §1.5 item 15  Citation batch sizes (line 394)
 *
 * Implements:
 *   DC-001  getModelForPhase() — now getModel()
 *   DC-002  getExtendedThinkingBudget() — now getThinkingBudget()
 *   MR-003  Decision: TypeScript constants (not DB table)
 *   MR-007  Model string validation before API call
 *
 * Supersedes (all routing code in these files is DELETED):
 *   - phase-executors.ts lines 112-132 (local getModelForPhase/getThinkingBudget)
 *   - phase-config.ts getModelForPhase duplicate
 *   - types/workflow.ts MODEL_ROUTING, EXTENDED_THINKING_CONFIG, CITATION_BATCH_SIZES
 *   - model-router.ts shouldUseOpus(), getModelForPhase() wrapper
 *   - prompts/index.ts PHASE_METADATA model/ET fields
 *   - config/models.ts routing functions (EXTENDED_THINKING, TOKEN_LIMITS, getClaudeParams)
 *
 * Design Rationale (MR-003):
 *   TypeScript constants over DB table because:
 *   1. Immutable at runtime — no accidental production changes
 *   2. Version-controlled — every change is in git history
 *   3. Type-safe — compiler catches misconfigurations
 *   4. Testable — unit tests verify all 42 combinations
 *   5. No DB dependency — works even if Supabase is down
 *   6. Reviewable — one file to understand the entire routing system
 */

import { MODELS, validateModelString, type ModelId } from './models';

// ============================================================================
// TYPES
// ============================================================================

/** Motion complexity tiers. NEVER use 1/2/3. */
export type Tier = 'A' | 'B' | 'C' | 'D';

/** All 14 workflow phases in execution order. */
export type WorkflowPhase =
  | 'I' | 'II' | 'III' | 'IV' | 'V' | 'V.1'
  | 'VI' | 'VII' | 'VII.1' | 'VIII' | 'VIII.5'
  | 'IX' | 'IX.1' | 'X';

/** Execution mode for a phase. */
export type ExecutionMode = 'CODE' | 'CHAT';

/**
 * Stages within CODE mode phases that use LLMs as tools.
 * V.1, VII.1, and IX.1 have 3 internal stages with different models.
 */
export type CivStage = 'stage1' | 'stage2' | 'steps3-5';

/** Configuration for a single phase × tier combination. */
interface RouteConfig {
  /** AI model to use. null = no LLM call (CODE mode phases I, VIII.5, X) or SKIP (VI Tier A). */
  model: ModelId | null;
  /** Extended thinking budget in tokens. undefined = no extended thinking. */
  thinkingBudget?: number;
  /** max_tokens for the API call. 64000 for Opus ET phases, 16384 for standard CHAT, 4096 for CODE/JSON. */
  maxTokens: number;
}

/** Per-tier routing for a phase. */
interface TierRouting {
  A: RouteConfig;
  B: RouteConfig;
  C: RouteConfig;
  D: RouteConfig;
}

/** Complete configuration for one phase. */
interface PhaseConfig {
  name: string;
  mode: ExecutionMode;
  /** For CHAT mode phases and simple CODE mode phases (I, VIII.5, X). */
  routing: TierRouting;
  /**
   * For multi-stage CODE mode phases (V.1, VII.1, IX.1).
   * Each stage has its own model routing.
   * When stages is defined, routing contains the Stage 2 (primary) config.
   */
  stages?: Record<CivStage, TierRouting>;
}

// ============================================================================
// CONSTANTS
// ============================================================================

/** Quality threshold. B+ = 0.87 for ALL tiers. (§1.5 item 8) */
export const QUALITY_THRESHOLD = 0.87;

/** Grade scale for display. */
export const GRADE_SCALE = {
  'A+': 0.97,
  'A':  0.93,
  'A-': 0.90,
  'B+': 0.87,
  'B':  0.83,
  'B-': 0.80,
  'C+': 0.77,
  'C':  0.73,
  'F':  0.00,
} as const;

/** Maximum revision loops before forced completion. (§1.5 item 7) */
export const MAX_REVISION_LOOPS = 3;

/**
 * Citation batch sizes per tier. (§1.5 item 15)
 * V.1/VII.1/IX.1 use CIV (2).
 * Standard phases use tier-specific: A=5, B=4, C=3.
 */
export const BATCH_SIZES = {
  A: 5,
  B: 4,
  C: 3,
  D: 2,
  /** V.1, VII.1, IX.1 — always 2 regardless of tier */
  CIV: 2,
} as const;

/** HOLD checkpoint timeout sequence. (§1.5 item 6) */
export const HOLD_TIMEOUTS = {
  REMINDER_1_HOURS: 24,
  ESCALATION_HOURS: 72,
  AUTO_REFUND_DAYS: 7,
} as const;

/** Turnaround times by tier. (§1.5 item 17) */
export const TURNAROUND = {
  A: { days: '2-3', businessDays: 3 },
  B: { days: '3-4', businessDays: 4 },
  C: { days: '4-5', businessDays: 5 },
  D: { days: '5-7', businessDays: 7 },
} as const;

// ============================================================================
// COMMON ROUTE CONFIGS (DRY helpers — not exported)
// ============================================================================

const NO_LLM: RouteConfig = { model: null, maxTokens: 0 };
const SKIP:   RouteConfig = { model: null, maxTokens: 0 };

const SONNET_STANDARD: RouteConfig = {
  model: MODELS.SONNET,
  maxTokens: 16384,
};

const OPUS_STANDARD: RouteConfig = {
  model: MODELS.OPUS,
  maxTokens: 16384,
};

const OPUS_ET_8K: RouteConfig = {
  model: MODELS.OPUS,
  thinkingBudget: 8_000,
  maxTokens: 64_000,
};

const OPUS_ET_10K: RouteConfig = {
  model: MODELS.OPUS,
  thinkingBudget: 10_000,
  maxTokens: 64_000,
};

// ============================================================================
// THE REGISTRY — Every phase × tier combination
// ============================================================================
//
// READ THIS TABLE LIKE A SPREADSHEET:
//   Row    = Phase
//   Column = Tier (A, B, C)
//   Cell   = { model, thinkingBudget?, maxTokens }
//
// If you need to change routing, change it HERE and ONLY here.
//

const PHASE_REGISTRY: Record<WorkflowPhase, PhaseConfig> = {

  // ── Phase I: Intake & Classification ──────────────────────────────
  // MODE: CODE (no LLM). Pure TypeScript business logic.
  // Parses order, validates, looks up tier, calculates deadline.
  'I': {
    name: 'Intake and Classification',
    mode: 'CODE',
    routing: {
      A: NO_LLM,
      B: NO_LLM,
      C: NO_LLM,
      D: NO_LLM,
    },
  },

  // ── Phase II: Document Processing ─────────────────────────────────
  // MODE: CHAT. Sonnet all tiers.
  // Extracts key facts and legal issues from uploaded documents.
  'II': {
    name: 'Document Processing',
    mode: 'CHAT',
    routing: {
      A: SONNET_STANDARD,
      B: SONNET_STANDARD,
      C: SONNET_STANDARD,
      D: SONNET_STANDARD,
    },
  },

  // ── Phase III: Legal Research ──────────────────────────────────────
  // MODE: CHAT. Sonnet A/B, Opus+ET 10K C.
  // Identifies elements, burdens, defenses; builds research framework.
  //
  // UPDATE: Clay confirmed Tier C uses Opus + 10K ET for Phase III.
  // This overrides the 2.5 Batch 2 ET Matrix which omitted Phase III.
  // phase-config.ts also defines III:C as Opus+ET, confirming this.
  'III': {
    name: 'Legal Research',
    mode: 'CHAT',
    routing: {
      A: SONNET_STANDARD,
      B: SONNET_STANDARD,
      C: OPUS_ET_10K,
      D: OPUS_ET_10K,
    },
  },

  // ── Phase IV: Deep Research ───────────────────────────────────────
  // MODE: CHAT. Sonnet A, Opus B/C.
  // CourtListener authority search, case analysis, authority ranking.
  'IV': {
    name: 'Deep Research',
    mode: 'CHAT',
    routing: {
      A: SONNET_STANDARD,
      B: OPUS_STANDARD,
      C: OPUS_STANDARD,
      D: OPUS_STANDARD,
    },
  },

  // ── Phase V: Motion Drafting ──────────────────────────────────────
  // MODE: CHAT. Sonnet A/B, Opus+ET 10K C.
  // Drafts complete motion with legal arguments and citations.
  //
  // UPDATE: Clay confirmed Tier C uses Opus + 10K ET for Phase V.
  // This overrides the 2.5 Batch 2 ET Matrix which omitted Phase V.
  // phase-config.ts also defines V:C as Opus+ET, confirming this.
  'V': {
    name: 'Motion Drafting',
    mode: 'CHAT',
    routing: {
      A: SONNET_STANDARD,
      B: SONNET_STANDARD,
      C: OPUS_ET_10K,
      D: OPUS_ET_10K,
    },
  },

  // ── Phase V.1: Citation Verification ──────────────────────────────
  // MODE: CODE. LLM as tool with 3 internal stages.
  // 7-step pipeline: existence, holding, dicta, quote, bad law, flags.
  //
  // Stage 1: GPT-4 Turbo (holding verification) — ALL tiers
  // Stage 2: Opus (adversarial review) — ALL tiers
  // Steps 3-5: Haiku A/B, Sonnet C (cost optimization per MR-010)
  'V.1': {
    name: 'Citation Verification',
    mode: 'CODE',
    routing: {
      // Primary routing (Stage 2 — used when no stage specified)
      A: { model: MODELS.OPUS, maxTokens: 4096 },
      B: { model: MODELS.OPUS, maxTokens: 4096 },
      C: { model: MODELS.OPUS, maxTokens: 4096 },
      D: { model: MODELS.OPUS, maxTokens: 4096 },
    },
    stages: {
      'stage1': {
        A: { model: MODELS.GPT4_TURBO, maxTokens: 4096 },
        B: { model: MODELS.GPT4_TURBO, maxTokens: 4096 },
        C: { model: MODELS.GPT4_TURBO, maxTokens: 4096 },
        D: { model: MODELS.GPT4_TURBO, maxTokens: 4096 },
      },
      'stage2': {
        A: { model: MODELS.OPUS, maxTokens: 4096 },
        B: { model: MODELS.OPUS, maxTokens: 4096 },
        C: { model: MODELS.OPUS, maxTokens: 4096 },
        D: { model: MODELS.OPUS, maxTokens: 4096 },
      },
      'steps3-5': {
        A: { model: MODELS.HAIKU, maxTokens: 4096 },
        B: { model: MODELS.HAIKU, maxTokens: 4096 },
        C: { model: MODELS.SONNET, maxTokens: 4096 },
        D: { model: MODELS.SONNET, maxTokens: 4096 },
      },
    },
  },

  // ── Phase VI: Opposition Analysis ─────────────────────────────────
  // MODE: CHAT. SKIP A, Opus+ET 8K B/C.
  // Anticipates opposing arguments and prepares responses.
  // Tier A procedural motions skip opposition analysis entirely.
  'VI': {
    name: 'Opposition Analysis',
    mode: 'CHAT',
    routing: {
      A: SKIP,
      B: OPUS_ET_8K,
      C: OPUS_ET_8K,
      D: OPUS_ET_8K,
    },
  },

  // ── Phase VII: Judge Simulation ───────────────────────────────────
  // MODE: CHAT. OPUS ALL TIERS + ET 10K.
  // Quality gate. Skeptical judicial evaluation. B+ minimum.
  // Most judgment-intensive phase. NEVER downgrade the model.
  'VII': {
    name: 'Judge Simulation',
    mode: 'CHAT',
    routing: {
      A: OPUS_ET_10K,
      B: OPUS_ET_10K,
      C: OPUS_ET_10K,
      D: OPUS_ET_10K,
    },
  },

  // ── Phase VII.1: Citation Re-Verification ─────────────────────────
  // MODE: CODE. Same 3-stage structure as V.1.
  // Re-verifies any citations added or modified during revision.
  'VII.1': {
    name: 'Citation Re-Verification',
    mode: 'CODE',
    routing: {
      A: { model: MODELS.OPUS, maxTokens: 4096 },
      B: { model: MODELS.OPUS, maxTokens: 4096 },
      C: { model: MODELS.OPUS, maxTokens: 4096 },
      D: { model: MODELS.OPUS, maxTokens: 4096 },
    },
    stages: {
      'stage1': {
        A: { model: MODELS.GPT4_TURBO, maxTokens: 4096 },
        B: { model: MODELS.GPT4_TURBO, maxTokens: 4096 },
        C: { model: MODELS.GPT4_TURBO, maxTokens: 4096 },
        D: { model: MODELS.GPT4_TURBO, maxTokens: 4096 },
      },
      'stage2': {
        A: { model: MODELS.OPUS, maxTokens: 4096 },
        B: { model: MODELS.OPUS, maxTokens: 4096 },
        C: { model: MODELS.OPUS, maxTokens: 4096 },
        D: { model: MODELS.OPUS, maxTokens: 4096 },
      },
      'steps3-5': {
        A: { model: MODELS.HAIKU, maxTokens: 4096 },
        B: { model: MODELS.HAIKU, maxTokens: 4096 },
        C: { model: MODELS.SONNET, maxTokens: 4096 },
        D: { model: MODELS.SONNET, maxTokens: 4096 },
      },
    },
  },

  // ── Phase VIII: Revisions ─────────────────────────────────────────
  // MODE: CHAT.
  // Sonnet A (no ET), Opus+ET 8K B/C.
  //
  // CONFLICT RESOLUTION: Clay's §1.2 says "Sonnet all tiers" but
  // Batch 2 Matrix says "Sonnet A, OPUS+ET 8K B/C". The Batch 2
  // matrix supersedes because: (1) it's later in the document,
  // (2) ET requires Opus — Sonnet cannot use 8K thinking budgets,
  // (3) the execution code already correctly used Opus for B/C.
  'VIII': {
    name: 'Revisions',
    mode: 'CHAT',
    routing: {
      A: SONNET_STANDARD,
      B: OPUS_ET_8K,
      C: OPUS_ET_8K,
      D: OPUS_ET_8K,
    },
  },

  // ── Phase VIII.5: Caption Validation ──────────────────────────────
  // MODE: CODE (no LLM). Pure TypeScript.
  // String-match caption fields against order context.
  'VIII.5': {
    name: 'Caption Validation',
    mode: 'CODE',
    routing: {
      A: NO_LLM,
      B: NO_LLM,
      C: NO_LLM,
      D: NO_LLM,
    },
  },

  // ── Phase IX: Supporting Documents ────────────────────────────────
  // MODE: CHAT. Sonnet all tiers.
  // Declaration, separate statement, proposed order, memorandum.
  'IX': {
    name: 'Supporting Documents',
    mode: 'CHAT',
    routing: {
      A: SONNET_STANDARD,
      B: SONNET_STANDARD,
      C: SONNET_STANDARD,
      D: SONNET_STANDARD,
    },
  },

  // ── Phase IX.1: Final Citation Sweep ──────────────────────────────
  // MODE: CODE. Same 3-stage structure as V.1/VII.1.
  // Verifies any new citations in supporting documents.
  'IX.1': {
    name: 'Final Citation Sweep',
    mode: 'CODE',
    routing: {
      A: { model: MODELS.OPUS, maxTokens: 4096 },
      B: { model: MODELS.OPUS, maxTokens: 4096 },
      C: { model: MODELS.OPUS, maxTokens: 4096 },
      D: { model: MODELS.OPUS, maxTokens: 4096 },
    },
    stages: {
      'stage1': {
        A: { model: MODELS.GPT4_TURBO, maxTokens: 4096 },
        B: { model: MODELS.GPT4_TURBO, maxTokens: 4096 },
        C: { model: MODELS.GPT4_TURBO, maxTokens: 4096 },
        D: { model: MODELS.GPT4_TURBO, maxTokens: 4096 },
      },
      'stage2': {
        A: { model: MODELS.OPUS, maxTokens: 4096 },
        B: { model: MODELS.OPUS, maxTokens: 4096 },
        C: { model: MODELS.OPUS, maxTokens: 4096 },
        D: { model: MODELS.OPUS, maxTokens: 4096 },
      },
      'steps3-5': {
        A: { model: MODELS.HAIKU, maxTokens: 4096 },
        B: { model: MODELS.HAIKU, maxTokens: 4096 },
        C: { model: MODELS.SONNET, maxTokens: 4096 },
        D: { model: MODELS.SONNET, maxTokens: 4096 },
      },
    },
  },

  // ── Phase X: Final Assembly ───────────────────────────────────────
  // MODE: CODE (no LLM). Pure TypeScript.
  // Compiles filing package, applies formatting, generates deliverables.
  'X': {
    name: 'Final Assembly',
    mode: 'CODE',
    routing: {
      A: NO_LLM,
      B: NO_LLM,
      C: NO_LLM,
      D: NO_LLM,
    },
  },
};

// ============================================================================
// GETTER FUNCTIONS — The only way to access routing config
// ============================================================================

/**
 * Get the AI model for a phase/tier/stage combination.
 * Returns null for CODE phases without LLM or SKIP (Phase VI Tier A).
 *
 * @param phase - Workflow phase (I through X)
 * @param tier - Motion complexity tier (A, B, C)
 * @param stage - Optional CIV stage for V.1/VII.1/IX.1 (stage1, stage2, steps3-5)
 * @returns Model string or null
 *
 * @example
 * getModel('VII', 'B')           // → 'claude-opus-4-5-20251101'
 * getModel('VI', 'A')            // → null (skipped)
 * getModel('V.1', 'C', 'stage1') // → 'gpt-4-turbo'
 */
export function getModel(
  phase: WorkflowPhase,
  tier: Tier,
  stage?: CivStage,
): string | null {
  const config = PHASE_REGISTRY[phase];
  if (!config) {
    throw new Error(`[PHASE_REGISTRY] Unknown phase: "${phase}". Valid: ${PHASES.join(', ')}`);
  }

  let route: RouteConfig;

  if (stage && config.stages) {
    const stageRouting = config.stages[stage];
    if (!stageRouting) {
      throw new Error(
        `[PHASE_REGISTRY] Unknown stage "${stage}" for phase ${phase}. ` +
        `Valid stages: ${Object.keys(config.stages).join(', ')}`
      );
    }
    route = stageRouting[tier];
  } else {
    route = config.routing[tier];
  }

  return route.model;
}

/**
 * Get the extended thinking budget for a phase/tier combination.
 * Returns undefined if phase/tier does not use extended thinking.
 *
 * @example
 * getThinkingBudget('VII', 'A')  // → 10000
 * getThinkingBudget('VI', 'A')   // → undefined (skipped)
 * getThinkingBudget('II', 'B')   // → undefined (no ET)
 */
export function getThinkingBudget(
  phase: WorkflowPhase,
  tier: Tier,
  stage?: CivStage,
): number | undefined {
  const config = PHASE_REGISTRY[phase];
  if (!config) {
    throw new Error(`[PHASE_REGISTRY] Unknown phase: "${phase}"`);
  }

  let route: RouteConfig;

  if (stage && config.stages) {
    const stageRouting = config.stages[stage];
    if (!stageRouting) return undefined;
    route = stageRouting[tier];
  } else {
    route = config.routing[tier];
  }

  return route.thinkingBudget;
}

/**
 * Get max_tokens for a phase/tier combination.
 *
 * @example
 * getMaxTokens('VII', 'C')  // → 64000 (Opus ET phase)
 * getMaxTokens('V', 'A')    // → 16384 (standard CHAT)
 */
export function getMaxTokens(
  phase: WorkflowPhase,
  tier: Tier,
  stage?: CivStage,
): number {
  const config = PHASE_REGISTRY[phase];
  if (!config) {
    throw new Error(`[PHASE_REGISTRY] Unknown phase: "${phase}"`);
  }

  let route: RouteConfig;

  if (stage && config.stages) {
    const stageRouting = config.stages[stage];
    if (!stageRouting) return 4096;
    route = stageRouting[tier];
  } else {
    route = config.routing[tier];
  }

  return route.maxTokens;
}

/**
 * Get citation batch size for a phase/tier combination.
 * CIV phases (V.1, VII.1, IX.1) always return 2.
 * Standard phases return tier-specific: A=5, B=4, C=3.
 */
export function getBatchSize(phase: WorkflowPhase, tier: Tier): number {
  const CIV_PHASES: WorkflowPhase[] = ['V.1', 'VII.1', 'IX.1'];
  if (CIV_PHASES.includes(phase)) {
    return BATCH_SIZES.CIV;
  }
  return BATCH_SIZES[tier];
}

/**
 * Get the execution mode for a phase.
 */
export function getExecutionMode(phase: WorkflowPhase): ExecutionMode {
  const config = PHASE_REGISTRY[phase];
  if (!config) {
    throw new Error(`[PHASE_REGISTRY] Unknown phase: "${phase}"`);
  }
  return config.mode;
}

/**
 * Get the full PhaseConfig for a phase (for debugging/admin views).
 */
export function getPhaseConfig(phase: WorkflowPhase): PhaseConfig {
  const config = PHASE_REGISTRY[phase];
  if (!config) {
    throw new Error(`[PHASE_REGISTRY] Unknown phase: "${phase}"`);
  }
  return config;
}

/**
 * Check if a phase should be skipped for a given tier.
 * Currently only Phase VI is skipped (Tier A only).
 */
export function isPhaseSkipped(phase: WorkflowPhase, tier: Tier): boolean {
  const config = PHASE_REGISTRY[phase];
  if (!config) return false;
  return config.routing[tier].model === null && config.mode === 'CHAT';
}

// ============================================================================
// PHASE LIST — Canonical order
// ============================================================================

export const PHASES: WorkflowPhase[] = [
  'I', 'II', 'III', 'IV', 'V', 'V.1',
  'VI', 'VII', 'VII.1', 'VIII', 'VIII.5',
  'IX', 'IX.1', 'X',
];

export const TOTAL_PHASES = 14;

// ============================================================================
// STARTUP VALIDATION — Runs at import time
// ============================================================================
// Verifies every model string in the registry is a valid MODELS constant.
// If someone fat-fingers a model string, this catches it immediately.

(function validateRegistry(): void {
  for (const phase of PHASES) {
    const config = PHASE_REGISTRY[phase];
    for (const tier of ['A', 'B', 'C', 'D'] as Tier[]) {
      const route = config.routing[tier];
      if (route.model !== null) {
        validateModelString(route.model, `PHASE_REGISTRY[${phase}].routing.${tier}`);
      }
      // Validate stages too
      if (config.stages) {
        for (const [stageName, stageRouting] of Object.entries(config.stages)) {
          const stageRoute = (stageRouting as TierRouting)[tier];
          if (stageRoute.model !== null) {
            validateModelString(
              stageRoute.model,
              `PHASE_REGISTRY[${phase}].stages.${stageName}.${tier}`
            );
          }
        }
      }
    }
  }
})();
