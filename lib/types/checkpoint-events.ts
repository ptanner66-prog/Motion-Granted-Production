/**
 * Checkpoint Event Types — shared across Fn1, Fn2, and dashboard.
 * CP3ApprovalEvent is the canonical event shape for checkpoint/cp3.reached.
 */

export interface CP3ApprovalEvent {
  orderId: string;
  packageId: string;
  workflowId: string;
  grade: number;
  tier: string;
  protocol10Triggered: boolean;
}

export interface CP3DecisionEvent {
  orderId: string;
  workflowId: string;
  action: 'APPROVE' | 'REQUEST_CHANGES' | 'CANCEL';
  userId: string;
  userEmail: string;
  packageId: string;
  notes?: string;
  reason?: string;
}

export interface CheckpointEventRecord {
  id: string;
  order_id: string;
  event_name: string;
  event_data: Record<string, any>;
  checkpoint_type: 'CP1' | 'CP2' | 'CP3' | 'HOLD';
  actor_id: string | null;
  created_at: string;
  expires_at: string;
}

export type CheckpointEventName =
  | 'checkpoint/cp1.intake-confirmed'
  | 'checkpoint/cp2.draft-ready'
  | 'checkpoint/cp3.reached'
  | 'checkpoint/cp3.approved'
  | 'checkpoint/cp3.rejected'
  | 'checkpoint/cp3.cancelled'
  | 'checkpoint/cp3.timeout'
  | 'checkpoint/hold.created'
  | 'checkpoint/hold.resolved'
  | 'checkpoint/hold.24h-reminder'
  | 'checkpoint/hold.72h-escalation'
  | 'checkpoint/hold.7d-terminal-action';
