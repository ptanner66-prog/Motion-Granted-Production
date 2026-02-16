/**
 * Checkpoint Type Definitions and Constants
 *
 * SP-3 Task 1 (D5 W2-1): Canonical checkpoint types, actors, constants,
 * and 5 canonical Inngest event names.
 *
 * Depends on: SP-2 W1-1 (checkpoint system tables)
 */

export enum CheckpointType {
  CP1 = 'CP1',   // Phase IV notification to CUSTOMER (non-blocking)
  CP2 = 'CP2',   // Phase VII notification to CUSTOMER (non-blocking)
  CP3 = 'CP3',   // Phase X Stage 6 approval by ATTORNEY (BLOCKING)
  HOLD = 'HOLD'  // Phase III evidence gap (BLOCKING, customer responds)
}

export type CheckpointActor = 'customer' | 'attorney' | 'system';

export const CHECKPOINT_ACTOR_MAP: Record<CheckpointType, CheckpointActor> = {
  [CheckpointType.CP1]: 'system',
  [CheckpointType.CP2]: 'system',
  [CheckpointType.CP3]: 'attorney',  // NOT admin, NOT customer
  [CheckpointType.HOLD]: 'customer',
};

export const CHECKPOINT_PHASE_MAP: Record<string, CheckpointType | null> = {
  PHASE_IV: CheckpointType.CP1,
  PHASE_VII: CheckpointType.CP2,
  PHASE_X_STAGE_6: CheckpointType.CP3,  // NOT Phase IX
};

// ── CP3 Constants (BINDING) ──
export const CP3_REWORK_CAP = 3;
export const CP3_TIMEOUT_STAGE1_DAYS = 14;
export const CP3_TIMEOUT_STAGE2_DAYS = 7;
export const CP3_TOTAL_TIMEOUT_DAYS = 21;  // 14 + 7
export const CP3_REMINDER_48H_MS = 48 * 60 * 60 * 1000;
export const CP3_REMINDER_72H_MS = 72 * 60 * 60 * 1000;
export const CP3_REFUND_PERCENTAGE = 50;
export const RETENTION_DAYS = 365;  // California 1-year malpractice discovery statute

// ── Canonical Events (Inngest event names) ──
export const CANONICAL_EVENTS = {
  ORDER_SUBMITTED: 'order/submitted',
  ORDER_REVISION_REQUESTED: 'order/revision-requested',
  ORDER_PROTOCOL_10_EXIT: 'order/protocol-10-exit',
  CHECKPOINT_CP3_REACHED: 'checkpoint/cp3.reached',
  WORKFLOW_CHECKPOINT_APPROVED: 'workflow/checkpoint-approved',
  // SP-22: HOLD checkpoint events
  HOLD_CREATED: 'checkpoint/hold.created',
  HOLD_RESOLVED: 'checkpoint/hold.resolved',
  HOLD_24H_REMINDER: 'checkpoint/hold.24h-reminder',
  HOLD_72H_ESCALATION: 'checkpoint/hold.72h-escalation',
  HOLD_7D_TERMINAL: 'checkpoint/hold.7d-terminal-action',
} as const;

/**
 * CANONICAL EVENT PAYLOAD: checkpoint/cp3.reached (D6 C-009)
 * Binding specification — ALL emitters and consumers MUST conform.
 *
 * Emitted by: Fn1 completion step (lib/inngest/workflow-orchestration.ts)
 * Consumed by: Fn2 trigger + step.waitForEvent
 *
 * REQUIRED fields:
 *   orderId    — orders.id (Fn2 matches on data.orderId)
 *   workflowId — orders.workflow_id (required for event correlation)
 *   packageId  — delivery_packages.id (current delivery package)
 *
 * RECOMMENDED fields:
 *   tier           — for Fn2 timeout/behavior configuration
 *   attorneyEmail  — for reminder emails (avoids DB lookup)
 */
export interface CP3ReachedPayload {
  orderId: string;
  workflowId: string;
  packageId: string;
  tier?: string;
  attorneyEmail?: string;
}

export type CP3Action = 'APPROVE' | 'REQUEST_CHANGES' | 'CANCEL';

export interface CP3DecisionPayload {
  orderId: string;
  workflowId: string;
  action: CP3Action;
  notes: string | null;
  attorneyId: string;
}

export interface CheckpointConfig {
  type: CheckpointType;
  actor: CheckpointActor;
  blocking: boolean;
  timeoutDays: number | null;
  refundPercentage: number | null;
}

export const CHECKPOINT_CONFIGS: Record<CheckpointType, CheckpointConfig> = {
  [CheckpointType.CP1]: {
    type: CheckpointType.CP1,
    actor: 'system',
    blocking: false,
    timeoutDays: null,
    refundPercentage: null,
  },
  [CheckpointType.CP2]: {
    type: CheckpointType.CP2,
    actor: 'system',
    blocking: false,
    timeoutDays: null,
    refundPercentage: null,
  },
  [CheckpointType.CP3]: {
    type: CheckpointType.CP3,
    actor: 'attorney',
    blocking: true,
    timeoutDays: CP3_TOTAL_TIMEOUT_DAYS,
    refundPercentage: CP3_REFUND_PERCENTAGE,
  },
  [CheckpointType.HOLD]: {
    type: CheckpointType.HOLD,
    actor: 'customer',
    blocking: true,
    timeoutDays: 7,  // Auto-refund after 7 days
    refundPercentage: 100,
  },
};
