/**
 * Motion Granted v7.2 Phase Configuration
 *
 * Centralized configuration for the 14-phase workflow system.
 * Defines model routing, extended thinking budgets, and phase flow.
 *
 * IMPORTANT: This file is the source of truth for phase configuration.
 * Changes here affect the entire workflow system.
 */

// ============================================================================
// MODEL CONSTANTS
// ============================================================================

export const MODELS = {
  SONNET: 'claude-sonnet-4-20250514',
  OPUS: 'claude-opus-4-5-20251101',
} as const;

export type ModelKey = keyof typeof MODELS;

// ============================================================================
// TIER AND PATH TYPES
// ============================================================================

export type Tier = 'A' | 'B' | 'C';
export type Path = 'A' | 'B'; // A = Initiating, B = Opposition

// ============================================================================
// CHECKPOINT TYPES
// ============================================================================

export interface CheckpointConfig {
  type: 'HOLD' | 'NOTIFICATION' | 'BLOCKING';
  blocking: boolean;
  condition?: string;
  actions?: string[];
}

// ============================================================================
// PHASE CONFIGURATION
// ============================================================================

export interface PhaseConfig {
  name: string;
  order: number;
  model: Record<Tier, ModelKey>;
  extendedThinking: Record<Tier, boolean>;
  budget: number;
  checkpoint: CheckpointConfig | null;
  next: string | null;
  // Optional properties for special phase handling
  failNext?: string;
  nextNoCitations?: string;
  nextNonMSJ?: string;
  minGrade?: number;
  maxLoops?: number;
  citationBatchSize?: number;
  appliesTo?: string[];
}

// ============================================================================
// 14 PHASES DEFINITION
// ============================================================================

export const PHASES = {
  'I': {
    name: 'Intake & Document Processing',
    order: 1,
    model: { A: 'SONNET', B: 'SONNET', C: 'SONNET' },
    extendedThinking: { A: false, B: false, C: false },
    budget: 0,
    checkpoint: null,
    next: 'II',
  },
  'II': {
    name: 'Legal Standards / Motion Deconstruction',
    order: 2,
    model: { A: 'SONNET', B: 'SONNET', C: 'SONNET' },
    extendedThinking: { A: false, B: false, C: false },
    budget: 0,
    checkpoint: null,
    next: 'III',
  },
  'III': {
    name: 'Evidence Strategy / Issue Identification',
    order: 3,
    model: { A: 'SONNET', B: 'SONNET', C: 'SONNET' },
    extendedThinking: { A: false, B: false, C: false },
    budget: 0,
    checkpoint: { type: 'HOLD', blocking: true, condition: 'critical_evidence_gaps' },
    next: 'IV',
  },
  'IV': {
    name: 'Authority Research',
    order: 4,
    model: { A: 'SONNET', B: 'OPUS', C: 'OPUS' },
    extendedThinking: { A: false, B: false, C: false },
    budget: 0,
    checkpoint: { type: 'NOTIFICATION', blocking: false },
    next: 'V',
  },
  'V': {
    name: 'Drafting',
    order: 5,
    model: { A: 'SONNET', B: 'SONNET', C: 'SONNET' },
    extendedThinking: { A: false, B: false, C: false },
    budget: 0,
    checkpoint: null,
    next: 'V.1',
  },
  'V.1': {
    name: 'Citation Accuracy Check',
    order: 6,
    model: { A: 'SONNET', B: 'SONNET', C: 'SONNET' },
    extendedThinking: { A: false, B: false, C: false },
    budget: 0,
    checkpoint: null,
    next: 'VI',
    citationBatchSize: 2, // ALWAYS 2 for citation check phases
  },
  'VI': {
    name: 'Opposition Anticipation',
    order: 7,
    model: { A: 'SONNET', B: 'OPUS', C: 'OPUS' },
    extendedThinking: { A: false, B: true, C: true },
    budget: 8000,
    checkpoint: null,
    next: 'VII',
  },
  'VII': {
    name: 'Judge Simulation',
    order: 8,
    model: { A: 'OPUS', B: 'OPUS', C: 'OPUS' }, // ALWAYS OPUS
    extendedThinking: { A: true, B: true, C: true }, // ALWAYS ENABLED
    budget: 10000,
    checkpoint: { type: 'NOTIFICATION', blocking: false },
    next: 'VIII.5', // if passes (grade >= B+)
    failNext: 'VIII', // if grade < B+
    minGrade: 3.3, // B+ = 3.3/4.0
    maxLoops: 3,
  },
  'VII.1': {
    name: 'Post-Revision Citation Check',
    order: 9,
    model: { A: 'SONNET', B: 'SONNET', C: 'SONNET' },
    extendedThinking: { A: false, B: false, C: false },
    budget: 0,
    checkpoint: null,
    next: 'VII', // Back to judge simulation
    citationBatchSize: 2, // ALWAYS 2 for citation check phases
  },
  'VIII': {
    name: 'Revisions',
    order: 10,
    model: { A: 'SONNET', B: 'OPUS', C: 'OPUS' }, // Opus for B/C to enable extended thinking
    extendedThinking: { A: false, B: true, C: true },
    budget: 8000,
    checkpoint: null,
    next: 'VII.1', // if new citations added
    nextNoCitations: 'VII', // if no new citations
  },
  'VIII.5': {
    name: 'Caption Validation',
    order: 11,
    model: { A: 'SONNET', B: 'SONNET', C: 'SONNET' },
    extendedThinking: { A: false, B: false, C: false },
    budget: 0,
    checkpoint: null,
    next: 'IX',
  },
  'IX': {
    name: 'Supporting Documents',
    order: 12,
    model: { A: 'SONNET', B: 'SONNET', C: 'SONNET' },
    extendedThinking: { A: false, B: false, C: false },
    budget: 0,
    checkpoint: null,
    next: 'IX.1', // for MSJ/MSA
    nextNonMSJ: 'X',
  },
  'IX.1': {
    name: 'Separate Statement Check',
    order: 13,
    model: { A: 'SONNET', B: 'SONNET', C: 'SONNET' },
    extendedThinking: { A: false, B: false, C: false },
    budget: 0,
    checkpoint: null,
    next: 'X',
    appliesTo: ['Motion for Summary Judgment', 'Motion for Summary Adjudication'],
  },
  'X': {
    name: 'Final Assembly',
    order: 14,
    model: { A: 'SONNET', B: 'SONNET', C: 'SONNET' },
    extendedThinking: { A: false, B: false, C: false },
    budget: 0,
    checkpoint: {
      type: 'BLOCKING',
      blocking: true,
      actions: ['APPROVE', 'REQUEST_CHANGES', 'CANCEL'],
    },
    next: null, // End of workflow
  },
} as const satisfies Record<string, PhaseConfig>;

export type PhaseId = keyof typeof PHASES;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

// ── ROUTING FUNCTIONS REMOVED ──
// getModelForPhase(), getExtendedThinkingBudget(), and usesExtendedThinking()
// have been DELETED from this file. All routing is now in:
//   import { getModel, getThinkingBudget } from '@/lib/config/phase-registry';
// See: Clay's Master Implementation Guide v2.5, DC-001/DC-002

/**
 * Get the next phase based on current phase and conditions
 */
export function getNextPhase(
  currentPhase: PhaseId,
  options: {
    gradePasses?: boolean;
    newCitationsAdded?: boolean;
    motionType?: string;
    revisionLoopCount?: number;
  } = {}
): PhaseId | null {
  const config = PHASES[currentPhase];

  // Phase VII: Check if grade passes
  if (currentPhase === 'VII') {
    const passes = options.gradePasses ?? false;  // NEVER default to passing. Require explicit grade.

    if (passes) {
      return 'VIII.5';
    }

    // Check if max loops reached (Protocol 10)
    if ((options.revisionLoopCount ?? 0) >= 3) {
      return 'X'; // Skip to final assembly with warning
    }

    return ((config as { failNext?: string }).failNext as PhaseId | undefined) ?? 'VIII';
  }

  // Phase VIII: Check if new citations were added
  if (currentPhase === 'VIII') {
    const newCitations = options.newCitationsAdded ?? false;
    return newCitations ? 'VII.1' : 'VII';
  }

  // Phase IX: Check if MSJ/MSA motion
  if (currentPhase === 'IX') {
    const motionType = options.motionType ?? '';
    const isMSJ = motionType.includes('Summary Judgment') ||
                  motionType.includes('Summary Adjudication');
    return isMSJ ? 'IX.1' : 'X';
  }

  return config.next as PhaseId | null;
}

/**
 * Get phase configuration
 */
export function getPhaseConfig(phase: PhaseId): PhaseConfig {
  return PHASES[phase];
}

/**
 * Get all phases in order
 */
export function getAllPhasesInOrder(): Array<{ id: PhaseId; config: PhaseConfig }> {
  return (Object.entries(PHASES) as Array<[PhaseId, PhaseConfig]>)
    .sort((a, b) => a[1].order - b[1].order)
    .map(([id, config]) => ({ id, config }));
}

/**
 * Get citation batch size for a phase
 * Phases V.1 and VII.1 always use 2 for memory efficiency
 */
export function getCitationBatchSize(phase: PhaseId): number {
  const config = PHASES[phase];
  return (config as { citationBatchSize?: number }).citationBatchSize ?? 5;
}

/**
 * Check if phase has a checkpoint
 */
export function hasCheckpoint(phase: PhaseId): boolean {
  return PHASES[phase].checkpoint !== null;
}

/**
 * Check if phase checkpoint is blocking
 */
export function isBlockingCheckpoint(phase: PhaseId): boolean {
  const checkpoint = PHASES[phase].checkpoint;
  return checkpoint?.blocking ?? false;
}

// ============================================================================
// GRADE CONSTANTS
// ============================================================================

export const GRADE_VALUES: Record<string, number> = {
  'A+': 4.3,
  'A': 4.0,
  'A-': 3.7,
  'B+': 3.3, // MINIMUM PASSING
  'B': 3.0,
  'B-': 2.7,
  'C+': 2.3,
  'C': 2.0,
  'C-': 1.7,
  'D': 1.0,
  'F': 0.0,
};

export const MINIMUM_PASSING_GRADE = 3.3; // B+
export const MAX_REVISION_LOOPS = 3;

/**
 * Check if a numeric grade passes (>= B+)
 */
export function gradePasses(numericGrade: number): boolean {
  return numericGrade >= MINIMUM_PASSING_GRADE;
}

/**
 * Convert letter grade to numeric
 */
export function letterToNumeric(letter: string): number {
  return GRADE_VALUES[letter] ?? 0;
}

/**
 * Convert numeric grade to letter
 */
export function numericToLetter(numeric: number): string {
  if (numeric >= 4.15) return 'A+';
  if (numeric >= 3.85) return 'A';
  if (numeric >= 3.5) return 'A-';
  if (numeric >= 3.15) return 'B+';
  if (numeric >= 2.85) return 'B';
  if (numeric >= 2.5) return 'B-';
  if (numeric >= 2.15) return 'C+';
  if (numeric >= 1.5) return 'C';
  if (numeric >= 0.5) return 'D';
  return 'F';
}

// ============================================================================
// TOTAL PHASES CONSTANT
// ============================================================================

export const TOTAL_PHASES = 14;
