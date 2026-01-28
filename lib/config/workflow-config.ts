// /lib/config/workflow-config.ts
// Complete workflow configuration for Motion Granted
// VERSION: 1.0 — January 28, 2026
//
// This file contains ALL workflow configuration:
// - Phase skip rules
// - HOLD timeout settings
// - Failure thresholds by tier
// - Revision loop limits (Protocol 10)
// - Quality gates

import type { Order } from '@/types';

// =============================================================================
// TYPES
// =============================================================================

export type Tier = 'A' | 'B' | 'C';
export type Phase = 'I' | 'II' | 'III' | 'IV' | 'V' | 'V.1' | 'VI' | 'VII' | 'VII.1' | 'VIII' | 'VIII.5' | 'IX' | 'IX.1' | 'X';
export type HoldStage = 'initial' | 'reminder_24h' | 'reminder_72h' | 'reminder_7d' | 'auto_refund';
export type Grade = 'A+' | 'A' | 'A-' | 'B+' | 'B' | 'B-' | 'C+' | 'C' | 'C-' | 'D+' | 'D' | 'D-' | 'F';

export interface PhaseSkipRule {
  phase: Phase;
  skipCondition: (order: Order) => boolean;
  reason: string;
}

export interface HoldAction {
  stage: HoldStage;
  nextActionAt: Date;
  action: string;
  shouldRefund: boolean;
}

// =============================================================================
// CONSTANTS
// =============================================================================

/**
 * All 14 phases in execution order
 */
export const PHASES: Phase[] = [
  'I', 'II', 'III', 'IV', 'V', 'V.1', 'VI', 'VII', 'VII.1', 'VIII', 'VIII.5', 'IX', 'IX.1', 'X'
];

export const TOTAL_PHASES = 14;

/**
 * User checkpoint phases (require explicit approval)
 */
export const USER_CHECKPOINT_PHASES: Phase[] = ['IV', 'VII', 'X'];

/**
 * Citation verification phases (use smaller batch sizes)
 */
export const CITATION_PHASES: Phase[] = ['V.1', 'VII.1'];

// =============================================================================
// PHASE SKIP RULES
// =============================================================================

/**
 * Get tier from order (handles both string and number formats)
 */
function getOrderTier(order: Order): Tier {
  // Handle string tier format
  if (typeof order.tier === 'string') {
    return order.tier as Tier;
  }
  // Handle numeric motion_tier format (legacy)
  const tierMap: Record<number, Tier> = { 1: 'A', 2: 'B', 3: 'C' };
  return tierMap[order.motion_tier] || 'B';
}

/**
 * Phase skip conditions - determines when phases should be bypassed
 */
export const PHASE_SKIP_RULES: PhaseSkipRule[] = [
  {
    phase: 'VI',
    skipCondition: (order: Order) => getOrderTier(order) === 'A',
    reason: 'Tier A procedural motions skip anticipatory analysis (Phase VI)',
  },
  {
    phase: 'IX.1',
    skipCondition: (order: Order) => {
      // Separate Statement only required for CA state MSJ/MSA
      const msjMotions = ['msj', 'msa', 'msj_simple', 'msj_complex', 'partial_sj', 'opposition_msj', 'opposition_msa'];
      const isMSJ = msjMotions.includes(order.motion_type?.toLowerCase() ?? '');

      if (!isMSJ) return true; // Skip if not MSJ/MSA

      const jurisdiction = order.jurisdiction ?? '';
      const isCaliforniaState = jurisdiction.startsWith('CA_STATE') ||
                                jurisdiction.toLowerCase().includes('california') &&
                                !jurisdiction.toLowerCase().includes('federal');

      if (!isCaliforniaState) return true; // Skip if not CA state court

      // Federal courts skip unless judge ordered separate statement
      const isFederal = jurisdiction.includes('FED') ||
                        jurisdiction.includes('N.D.') ||
                        jurisdiction.includes('C.D.') ||
                        jurisdiction.includes('S.D.') ||
                        jurisdiction.includes('E.D.');

      if (isFederal && !order.judge_ordered_separate_statement) {
        return true;
      }

      return false; // Don't skip - CA state MSJ requires separate statement
    },
    reason: 'Separate statement only required for CA state MSJ/MSA (CRC 3.1350)',
  },
  {
    phase: 'VIII.5',
    skipCondition: (order: Order) => getOrderTier(order) === 'A',
    reason: 'Tier A skips extended revision phase',
  },
];

/**
 * Check if a phase should be skipped for an order
 */
export function shouldSkipPhase(phase: Phase, order: Order): { skip: boolean; reason?: string } {
  const rule = PHASE_SKIP_RULES.find(r => r.phase === phase);

  if (!rule) {
    return { skip: false };
  }

  try {
    if (rule.skipCondition(order)) {
      return { skip: true, reason: rule.reason };
    }
  } catch (error) {
    // If condition check fails, don't skip (safer)
    console.error(`[WorkflowConfig] Error checking skip condition for phase ${phase}:`, error);
    return { skip: false };
  }

  return { skip: false };
}

/**
 * Get the list of phases to execute for an order (excluding skipped phases)
 */
export function getPhasesToExecute(order: Order): Phase[] {
  return PHASES.filter(phase => {
    const { skip } = shouldSkipPhase(phase, order);
    return !skip;
  });
}

// =============================================================================
// HOLD TIMEOUT CONFIGURATION
// =============================================================================

/**
 * HOLD timeout thresholds (in hours)
 */
export const HOLD_TIMEOUT_CONFIG = {
  /** First reminder after 24 hours */
  FIRST_REMINDER_HOURS: 24,

  /** Escalation after 72 hours (3 days) */
  ESCALATION_HOURS: 72,

  /** Final reminder after 7 days */
  FINAL_REMINDER_HOURS: 168, // 7 * 24

  /** Auto-refund after 14 days */
  AUTO_REFUND_HOURS: 336, // 14 * 24

  /** Email template keys */
  EMAIL_TEMPLATES: {
    initial: 'hold_initial_notification',
    reminder_24h: 'hold_reminder_24h',
    reminder_72h: 'hold_reminder_72h',
    reminder_7d: 'hold_reminder_7d',
    auto_refund: 'hold_auto_refund_processed',
  },
} as const;

/**
 * Calculate what action should be taken for a HOLD order
 */
export function getHoldNextAction(holdTriggeredAt: Date | string): HoldAction {
  const holdTime = typeof holdTriggeredAt === 'string' ? new Date(holdTriggeredAt) : holdTriggeredAt;
  const now = new Date();
  const hoursSinceHold = (now.getTime() - holdTime.getTime()) / (1000 * 60 * 60);

  // Auto-refund threshold reached
  if (hoursSinceHold >= HOLD_TIMEOUT_CONFIG.AUTO_REFUND_HOURS) {
    return {
      stage: 'auto_refund',
      nextActionAt: now,
      action: 'Process automatic refund and archive order',
      shouldRefund: true,
    };
  }

  // 7-day reminder
  if (hoursSinceHold >= HOLD_TIMEOUT_CONFIG.FINAL_REMINDER_HOURS) {
    const nextActionAt = new Date(holdTime);
    nextActionAt.setHours(nextActionAt.getHours() + HOLD_TIMEOUT_CONFIG.AUTO_REFUND_HOURS);
    return {
      stage: 'reminder_7d',
      nextActionAt,
      action: 'Send 7-day final warning - auto-refund in 7 days',
      shouldRefund: false,
    };
  }

  // 72-hour escalation
  if (hoursSinceHold >= HOLD_TIMEOUT_CONFIG.ESCALATION_HOURS) {
    const nextActionAt = new Date(holdTime);
    nextActionAt.setHours(nextActionAt.getHours() + HOLD_TIMEOUT_CONFIG.FINAL_REMINDER_HOURS);
    return {
      stage: 'reminder_72h',
      nextActionAt,
      action: 'Send 72-hour escalation - notify operations team',
      shouldRefund: false,
    };
  }

  // 24-hour reminder
  if (hoursSinceHold >= HOLD_TIMEOUT_CONFIG.FIRST_REMINDER_HOURS) {
    const nextActionAt = new Date(holdTime);
    nextActionAt.setHours(nextActionAt.getHours() + HOLD_TIMEOUT_CONFIG.ESCALATION_HOURS);
    return {
      stage: 'reminder_24h',
      nextActionAt,
      action: 'Send 24-hour reminder email',
      shouldRefund: false,
    };
  }

  // Initial state - waiting for first reminder
  const nextActionAt = new Date(holdTime);
  nextActionAt.setHours(nextActionAt.getHours() + HOLD_TIMEOUT_CONFIG.FIRST_REMINDER_HOURS);
  return {
    stage: 'initial',
    nextActionAt,
    action: 'Waiting for 24-hour mark to send first reminder',
    shouldRefund: false,
  };
}

/**
 * Check if an order in HOLD status should be auto-refunded
 */
export function shouldAutoRefund(holdTriggeredAt: Date | string): boolean {
  const { shouldRefund } = getHoldNextAction(holdTriggeredAt);
  return shouldRefund;
}

// =============================================================================
// FAILURE THRESHOLDS BY TIER
// =============================================================================

/**
 * Citation verification failure thresholds by tier
 * Stricter thresholds for higher-stakes motions
 */
export const CITATION_FAILURE_THRESHOLDS: Record<Tier, number> = {
  A: 0.20, // 20% - procedural motions (more lenient)
  B: 0.15, // 15% - intermediate motions
  C: 0.10, // 10% - dispositive motions (strictest)
};

/**
 * Minimum judge simulation grades by tier
 */
export const JUDGE_SIMULATION_MINIMUM_GRADES: Record<Tier, Grade> = {
  A: 'B',   // Tier A: B minimum (0.83)
  B: 'B+',  // Tier B: B+ minimum (0.87)
  C: 'B+',  // Tier C: B+ minimum (0.87)
};

/**
 * Grade to numeric value mapping
 */
export const GRADE_VALUES: Record<Grade, number> = {
  'A+': 0.97,
  'A': 0.93,
  'A-': 0.90,
  'B+': 0.87,
  'B': 0.83,
  'B-': 0.80,
  'C+': 0.77,
  'C': 0.73,
  'C-': 0.70,
  'D+': 0.67,
  'D': 0.63,
  'D-': 0.60,
  'F': 0.50,
};

/**
 * Convert numeric score to letter grade
 */
export function scoreToGrade(score: number): Grade {
  if (score >= 0.97) return 'A+';
  if (score >= 0.93) return 'A';
  if (score >= 0.90) return 'A-';
  if (score >= 0.87) return 'B+';
  if (score >= 0.83) return 'B';
  if (score >= 0.80) return 'B-';
  if (score >= 0.77) return 'C+';
  if (score >= 0.73) return 'C';
  if (score >= 0.70) return 'C-';
  if (score >= 0.67) return 'D+';
  if (score >= 0.63) return 'D';
  if (score >= 0.60) return 'D-';
  return 'F';
}

/**
 * Check if citation failure rate is acceptable for tier
 */
export function isCitationFailureAcceptable(failureRate: number, tier: Tier): boolean {
  const threshold = CITATION_FAILURE_THRESHOLDS[tier];
  return failureRate <= threshold;
}

/**
 * Check if judge simulation grade meets minimum for tier
 */
export function isJudgeGradeAcceptable(grade: Grade | number, tier: Tier): boolean {
  const numericGrade = typeof grade === 'number' ? grade : GRADE_VALUES[grade];
  const minimumGrade = JUDGE_SIMULATION_MINIMUM_GRADES[tier];
  const minimumValue = GRADE_VALUES[minimumGrade];

  return numericGrade >= minimumValue;
}

/**
 * Get the passing threshold for a tier
 */
export function getPassingThreshold(tier: Tier): { grade: Grade; numeric: number } {
  const grade = JUDGE_SIMULATION_MINIMUM_GRADES[tier];
  return { grade, numeric: GRADE_VALUES[grade] };
}

// =============================================================================
// REVISION LOOP LIMITS (PROTOCOL 10)
// =============================================================================

/**
 * Maximum revision loops before Protocol 10 triggers
 * After 3 loops, motion is delivered with disclosure
 */
export const MAX_REVISION_LOOPS = 3;

/**
 * Protocol 10 disclosure text generator
 */
export function generateProtocol10Disclosure(loopCount: number, lastGrade: Grade | string): string {
  return `
═══════════════════════════════════════════════════════════════════════════════
QUALITY DISCLOSURE (Protocol 10)
═══════════════════════════════════════════════════════════════════════════════

This motion underwent ${loopCount} revision cycle${loopCount > 1 ? 's' : ''} during automated quality assurance.

The final automated review grade was: ${lastGrade}

This disclosure is provided for transparency per Motion Granted's quality protocols.
Attorney review is recommended before filing.

Motion Granted stands behind the legal accuracy of all citations and arguments
contained herein. This disclosure relates only to our internal quality scoring
system and does not indicate any deficiency in the work product.

═══════════════════════════════════════════════════════════════════════════════
`.trim();
}

/**
 * Check if Protocol 10 should trigger
 */
export function shouldTriggerProtocol10(revisionCount: number): boolean {
  return revisionCount >= MAX_REVISION_LOOPS;
}

/**
 * Get revision loop status
 */
export function getRevisionLoopStatus(revisionCount: number): {
  currentLoop: number;
  maxLoops: number;
  remainingLoops: number;
  protocol10Triggered: boolean;
} {
  return {
    currentLoop: revisionCount,
    maxLoops: MAX_REVISION_LOOPS,
    remainingLoops: Math.max(0, MAX_REVISION_LOOPS - revisionCount),
    protocol10Triggered: revisionCount >= MAX_REVISION_LOOPS,
  };
}

// =============================================================================
// WORKFLOW STATE HELPERS
// =============================================================================

/**
 * Determine if workflow should continue or stop at current phase
 */
export function shouldContinueWorkflow(
  currentPhase: Phase,
  order: Order,
  phaseResult: { grade?: Grade | number; citationFailureRate?: number; holdTriggered?: boolean }
): { continue: boolean; reason?: string } {
  // HOLD triggered - stop workflow
  if (phaseResult.holdTriggered) {
    return { continue: false, reason: 'HOLD triggered - awaiting user response' };
  }

  // User checkpoint - pause for approval
  if (USER_CHECKPOINT_PHASES.includes(currentPhase)) {
    return { continue: false, reason: `User checkpoint at Phase ${currentPhase} - awaiting approval` };
  }

  // Grade check for judge simulation phases
  if (currentPhase === 'VII' && phaseResult.grade !== undefined) {
    const tier = getOrderTier(order);
    if (!isJudgeGradeAcceptable(phaseResult.grade, tier)) {
      return { continue: true, reason: 'Grade below threshold - routing to revision' };
    }
  }

  // Citation failure check
  if (CITATION_PHASES.includes(currentPhase) && phaseResult.citationFailureRate !== undefined) {
    const tier = getOrderTier(order);
    if (!isCitationFailureAcceptable(phaseResult.citationFailureRate, tier)) {
      return { continue: false, reason: 'Citation failure rate exceeds threshold - manual review required' };
    }
  }

  return { continue: true };
}

/**
 * Get the next phase to execute
 */
export function getNextPhase(currentPhase: Phase, order: Order): Phase | null {
  const phasesToExecute = getPhasesToExecute(order);
  const currentIndex = phasesToExecute.indexOf(currentPhase);

  if (currentIndex === -1 || currentIndex === phasesToExecute.length - 1) {
    return null; // Current phase not found or is last phase
  }

  return phasesToExecute[currentIndex + 1];
}

/**
 * Calculate workflow progress percentage
 */
export function calculateProgress(currentPhase: Phase, order: Order): number {
  const phasesToExecute = getPhasesToExecute(order);
  const currentIndex = phasesToExecute.indexOf(currentPhase);

  if (currentIndex === -1) return 0;

  // +1 because we've completed the current phase
  return Math.round(((currentIndex + 1) / phasesToExecute.length) * 100);
}

// =============================================================================
// EXPORTS SUMMARY
// =============================================================================

export default {
  // Constants
  PHASES,
  TOTAL_PHASES,
  USER_CHECKPOINT_PHASES,
  CITATION_PHASES,
  MAX_REVISION_LOOPS,

  // Config objects
  HOLD_TIMEOUT_CONFIG,
  CITATION_FAILURE_THRESHOLDS,
  JUDGE_SIMULATION_MINIMUM_GRADES,
  GRADE_VALUES,

  // Phase skip
  shouldSkipPhase,
  getPhasesToExecute,

  // HOLD handling
  getHoldNextAction,
  shouldAutoRefund,

  // Failure thresholds
  isCitationFailureAcceptable,
  isJudgeGradeAcceptable,
  scoreToGrade,
  getPassingThreshold,

  // Protocol 10
  shouldTriggerProtocol10,
  generateProtocol10Disclosure,
  getRevisionLoopStatus,

  // Workflow helpers
  shouldContinueWorkflow,
  getNextPhase,
  calculateProgress,
};
