// /lib/config/workflow-config.ts
// VERSION: 1.0 — January 28, 2026

export const PHASES = [
  'I', 'II', 'III', 'IV', 'V', 'V.1', 'VI', 'VII', 'VII.1', 'VIII', 'VIII.5', 'IX', 'IX.1', 'X'
] as const;

export type Phase = typeof PHASES[number];
export const TOTAL_PHASES = 14;

export interface OrderContext {
  id: string;
  tier: 'A' | 'B' | 'C' | 'D';
  motionType: string;
  jurisdiction: string;
  state: string;
  courtType: 'state' | 'federal';
  judgeOrderedSeparateStatement?: boolean;
}

export interface PhaseSkipRule {
  phase: Phase;
  condition: (order: OrderContext) => boolean;
  reason: string;
}

export const PHASE_SKIP_RULES: PhaseSkipRule[] = [
  {
    phase: 'VI',
    condition: (order) => order.tier === 'A',
    reason: 'Tier A procedural motions skip opposition anticipation',
  },
  {
    phase: 'IX.1',
    condition: (order) => {
      const msjMotions = ['msj', 'msa', 'msj_simple', 'msj_complex', 'partial_sj', 'opposition_msj', 'opposition_msa'];
      if (!msjMotions.includes(order.motionType.toLowerCase())) return true;
      if (order.state !== 'CA' || order.courtType !== 'state') return true;
      // CA state court MSJ/MSA requires separate statement - don't skip
      return false;
    },
    reason: 'Separate statement only for CA state MSJ/MSA',
  },
];

export function shouldSkipPhase(phase: Phase, order: OrderContext): { skip: boolean; reason?: string } {
  const rule = PHASE_SKIP_RULES.find(r => r.phase === phase);
  if (!rule) return { skip: false };
  if (rule.condition(order)) return { skip: true, reason: rule.reason };
  return { skip: false };
}

export function getPhasesForOrder(order: OrderContext): Phase[] {
  return PHASES.filter(phase => !shouldSkipPhase(phase, order).skip);
}

export const HOLD_TIMEOUTS = {
  REMINDER_1_HOURS: 24,
  ESCALATION_HOURS: 72,
  AUTO_REFUND_DAYS: 7,
  EMAIL_TEMPLATES: {
    initial: 'hold_initial_notification',
    reminder_24h: 'hold_reminder_24h',
    escalation_72h: 'hold_escalation_72h',
    auto_refund: 'hold_auto_refund',
  },
} as const;

export type HoldStage = 'initial' | 'reminder_sent' | 'escalated' | 'auto_refunded' | 'resolved';

export function getHoldStageAndNextAction(holdTriggeredAt: Date): {
  currentStage: HoldStage;
  nextAction: string;
  nextActionAt: Date;
  shouldAutoRefund: boolean;
} {
  const now = new Date();
  const hours = (now.getTime() - holdTriggeredAt.getTime()) / (1000 * 60 * 60);
  const days = hours / 24;

  if (days >= HOLD_TIMEOUTS.AUTO_REFUND_DAYS) {
    return { currentStage: 'auto_refunded', nextAction: 'Process auto-refund', nextActionAt: now, shouldAutoRefund: true };
  }
  if (hours >= HOLD_TIMEOUTS.ESCALATION_HOURS) {
    const refundAt = new Date(holdTriggeredAt);
    refundAt.setDate(refundAt.getDate() + HOLD_TIMEOUTS.AUTO_REFUND_DAYS);
    return { currentStage: 'escalated', nextAction: 'Auto-refund if unresolved', nextActionAt: refundAt, shouldAutoRefund: false };
  }
  if (hours >= HOLD_TIMEOUTS.REMINDER_1_HOURS) {
    const escalateAt = new Date(holdTriggeredAt);
    escalateAt.setHours(escalateAt.getHours() + HOLD_TIMEOUTS.ESCALATION_HOURS);
    return { currentStage: 'reminder_sent', nextAction: 'Escalate to admin', nextActionAt: escalateAt, shouldAutoRefund: false };
  }
  const reminderAt = new Date(holdTriggeredAt);
  reminderAt.setHours(reminderAt.getHours() + HOLD_TIMEOUTS.REMINDER_1_HOURS);
  return { currentStage: 'initial', nextAction: 'Send 24h reminder', nextActionAt: reminderAt, shouldAutoRefund: false };
}

export const FAILURE_THRESHOLDS = {
  CITATION_FAILURE: { A: 0.20, B: 0.15, C: 0.10, D: 0.08 },
  JUDGE_GRADE_MINIMUM: { A: 0.83, B: 0.87, C: 0.87, D: 0.87 },
  MAX_REVISION_LOOPS: 3,
  QUALITY_PASSING: 0.87,
} as const;

export function isCitationFailureAcceptable(failureRate: number, tier: 'A' | 'B' | 'C' | 'D'): boolean {
  return failureRate <= FAILURE_THRESHOLDS.CITATION_FAILURE[tier];
}

export function isJudgeGradeAcceptable(grade: number, tier: 'A' | 'B' | 'C' | 'D'): boolean {
  return grade >= FAILURE_THRESHOLDS.JUDGE_GRADE_MINIMUM[tier];
}

export function isProtocol10Triggered(revisionCount: number): boolean {
  return revisionCount >= FAILURE_THRESHOLDS.MAX_REVISION_LOOPS;
}

export const CITATION_BATCH_CONFIG = {
  DEFAULT: 4,
  REDUCED: 2,
  REDUCED_PHASES: ['V.1', 'VII.1'] as Phase[],
} as const;

export function getCitationBatchSize(phase: Phase): number {
  return CITATION_BATCH_CONFIG.REDUCED_PHASES.includes(phase) ? CITATION_BATCH_CONFIG.REDUCED : CITATION_BATCH_CONFIG.DEFAULT;
}

export const USER_CHECKPOINTS: Phase[] = ['IV', 'VII', 'X'];

export function isUserCheckpoint(phase: Phase): boolean {
  return USER_CHECKPOINTS.includes(phase);
}

export function getNextPhase(currentPhase: Phase, order: OrderContext): Phase | null {
  const phases = getPhasesForOrder(order);
  const idx = phases.indexOf(currentPhase);
  return idx === -1 || idx === phases.length - 1 ? null : phases[idx + 1];
}
