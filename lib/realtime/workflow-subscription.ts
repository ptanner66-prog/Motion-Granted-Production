/**
 * Workflow Real-time Subscription Service
 *
 * v6.3: Manages Supabase real-time subscriptions for workflow updates.
 * Provides callbacks for phase changes, checkpoint triggers, and revision events.
 * Updated for Supabase v2 compatibility.
 */

import { createClient } from '@/lib/supabase/client';
import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';

import { createLogger } from '@/lib/security/logger';

const log = createLogger('realtime-workflow-subscription');
// ============================================================================
// TYPES
// ============================================================================

export type CheckpointType = 'CP1' | 'CP2' | 'CP3';

export interface WorkflowUpdate {
  workflowId: string;
  orderId: string;
  previousPhase: number | null;
  currentPhase: number;
  status: string;
  checkpointPending: CheckpointType | null;
  judgeSimulationGrade: string | null;
  judgeSimulationPassed: boolean | null;
  revisionCount: number;
  freeRevisionsRemaining: number;
  updatedAt: string;
}

export interface RevisionUpdate {
  revisionId: string;
  workflowId: string;
  revisionNumber: number;
  revisionType: 'free' | 'paid';
  status: string;
  paymentStatus: string | null;
  createdAt: string;
}

export interface PhaseChangeEvent {
  workflowId: string;
  orderId: string;
  fromPhase: number | null;
  toPhase: number;
  phaseName: string;
  isCheckpoint: boolean;
  checkpointType: CheckpointType | null;
}

export interface CheckpointEvent {
  workflowId: string;
  orderId: string;
  checkpoint: CheckpointType;
  phase: number;
  grade?: string;
  gradeNumeric?: number;
  passed?: boolean;
}

export interface WorkflowSubscriptionCallbacks {
  onPhaseChange?: (event: PhaseChangeEvent) => void;
  onCheckpointTriggered?: (event: CheckpointEvent) => void;
  onWorkflowUpdate?: (update: WorkflowUpdate) => void;
  onRevisionCreated?: (revision: RevisionUpdate) => void;
  onRevisionPaymentCompleted?: (revision: RevisionUpdate) => void;
  onWorkflowCompleted?: (workflowId: string, orderId: string) => void;
  onError?: (error: Error) => void;
}

// Phase name mapping
const PHASE_NAMES: Record<number, string> = {
  1: 'Intake',
  2: 'Legal Standards',
  3: 'Evidence Mapping',
  4: 'Authority Research',
  5: 'Draft Motion',
  6: 'Citation Check',
  7: 'Opposition Anticipation',
  8: 'Judge Simulation',
  9: 'Revisions',
  10: 'Caption Validation',
  11: 'Supporting Docs',
  12: 'Final Assembly',
};

// Checkpoint phases
const CHECKPOINT_PHASES: Record<number, CheckpointType> = {
  4: 'CP1',
  8: 'CP2',
  12: 'CP3',
};

// ============================================================================
// SUBSCRIPTION CLASS
// ============================================================================

export class WorkflowSubscriptionManager {
  private supabase: ReturnType<typeof createClient>;
  private workflowChannel: RealtimeChannel | null = null;
  private revisionChannel: RealtimeChannel | null = null;
  private callbacks: WorkflowSubscriptionCallbacks = {};
  private subscribedWorkflowIds: Set<string> = new Set();

  constructor() {
    this.supabase = createClient();
  }

  /**
   * Subscribe to workflow updates for specific workflow IDs
   */
  subscribe(
    workflowIds: string[],
    callbacks: WorkflowSubscriptionCallbacks
  ): () => void {
    this.callbacks = callbacks;

    // Add new workflow IDs to the set
    workflowIds.forEach(id => this.subscribedWorkflowIds.add(id));

    // Set up workflow channel if not already created
    if (!this.workflowChannel) {
      this.setupWorkflowChannel();
    }

    // Set up revision channel if not already created
    if (!this.revisionChannel) {
      this.setupRevisionChannel();
    }

    // Return unsubscribe function
    return () => {
      workflowIds.forEach(id => this.subscribedWorkflowIds.delete(id));

      // If no more subscriptions, clean up channels
      if (this.subscribedWorkflowIds.size === 0) {
        this.cleanup();
      }
    };
  }

  /**
   * Subscribe to a single order's workflow updates
   */
  async subscribeToOrder(
    orderId: string,
    callbacks: WorkflowSubscriptionCallbacks
  ): Promise<() => void> {
    // Look up the workflow ID for this order
    const { data: workflow, error } = await this.supabase
      .from('order_workflows')
      .select('id')
      .eq('order_id', orderId)
      .single();

    if (error || !workflow) {
      callbacks.onError?.(new Error(`Workflow not found for order: ${orderId}`));
      return () => {};
    }

    return this.subscribe([workflow.id], callbacks);
  }

  /**
   * Set up the workflow channel
   */
  private setupWorkflowChannel(): void {
    this.workflowChannel = this.supabase
      .channel('workflow-updates')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'order_workflows',
        },
        (payload: RealtimePostgresChangesPayload<WorkflowTableRow>) => this.handleWorkflowChange(payload)
      )
      .subscribe((status: string) => {
        if (status === 'SUBSCRIBED') {
          log.info('[Realtime] Workflow channel subscribed');
        } else if (status === 'CHANNEL_ERROR') {
          this.callbacks.onError?.(new Error('Workflow channel error'));
        }
      });
  }

  /**
   * Set up the revision channel
   */
  private setupRevisionChannel(): void {
    this.revisionChannel = this.supabase
      .channel('revision-updates')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'workflow_revisions',
        },
        (payload: RealtimePostgresChangesPayload<RevisionTableRow>) => this.handleRevisionInsert(payload)
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'workflow_revisions',
        },
        (payload: RealtimePostgresChangesPayload<RevisionTableRow>) => this.handleRevisionUpdate(payload)
      )
      .subscribe((status: string) => {
        if (status === 'SUBSCRIBED') {
          log.info('[Realtime] Revision channel subscribed');
        }
      });
  }

  /**
   * Handle workflow table changes
   */
  private handleWorkflowChange(
    payload: RealtimePostgresChangesPayload<WorkflowTableRow>
  ): void {
    const newRow = payload.new as WorkflowTableRow;
    const oldRow = payload.old as Partial<WorkflowTableRow>;

    // Check if this workflow is being subscribed to
    if (!this.subscribedWorkflowIds.has(newRow.id)) {
      return;
    }

    // Build workflow update
    const update: WorkflowUpdate = {
      workflowId: newRow.id,
      orderId: newRow.order_id,
      previousPhase: oldRow.current_phase ?? null,
      currentPhase: newRow.current_phase,
      status: newRow.status,
      checkpointPending: newRow.checkpoint_pending,
      judgeSimulationGrade: newRow.judge_simulation_grade,
      judgeSimulationPassed: newRow.judge_simulation_passed,
      revisionCount: newRow.revision_count ?? 0,
      freeRevisionsRemaining: newRow.free_revisions_remaining ?? 1,
      updatedAt: newRow.updated_at,
    };

    // Emit workflow update
    this.callbacks.onWorkflowUpdate?.(update);

    // Check for phase change
    if (oldRow.current_phase !== undefined && oldRow.current_phase !== newRow.current_phase) {
      const phaseEvent: PhaseChangeEvent = {
        workflowId: newRow.id,
        orderId: newRow.order_id,
        fromPhase: oldRow.current_phase,
        toPhase: newRow.current_phase,
        phaseName: PHASE_NAMES[newRow.current_phase] || `Phase ${newRow.current_phase}`,
        isCheckpoint: !!CHECKPOINT_PHASES[newRow.current_phase],
        checkpointType: CHECKPOINT_PHASES[newRow.current_phase] || null,
      };

      this.callbacks.onPhaseChange?.(phaseEvent);
    }

    // Check for checkpoint trigger
    if (newRow.checkpoint_pending && oldRow.checkpoint_pending !== newRow.checkpoint_pending) {
      const checkpointEvent: CheckpointEvent = {
        workflowId: newRow.id,
        orderId: newRow.order_id,
        checkpoint: newRow.checkpoint_pending,
        phase: newRow.current_phase,
        grade: newRow.judge_simulation_grade ?? undefined,
        gradeNumeric: newRow.judge_simulation_grade_numeric ?? undefined,
        passed: newRow.judge_simulation_passed ?? undefined,
      };

      this.callbacks.onCheckpointTriggered?.(checkpointEvent);
    }

    // Check for workflow completion
    if (newRow.status === 'completed' && oldRow.status !== 'completed') {
      this.callbacks.onWorkflowCompleted?.(newRow.id, newRow.order_id);
    }
  }

  /**
   * Handle revision inserts
   */
  private handleRevisionInsert(
    payload: RealtimePostgresChangesPayload<RevisionTableRow>
  ): void {
    const row = payload.new as RevisionTableRow;

    // Check if this workflow is being subscribed to
    if (!this.subscribedWorkflowIds.has(row.workflow_id)) {
      return;
    }

    const revision: RevisionUpdate = {
      revisionId: row.id,
      workflowId: row.workflow_id,
      revisionNumber: row.revision_number,
      revisionType: row.revision_type,
      status: row.status,
      paymentStatus: row.payment_status,
      createdAt: row.created_at,
    };

    this.callbacks.onRevisionCreated?.(revision);
  }

  /**
   * Handle revision updates
   */
  private handleRevisionUpdate(
    payload: RealtimePostgresChangesPayload<RevisionTableRow>
  ): void {
    const newRow = payload.new as RevisionTableRow;
    const oldRow = payload.old as Partial<RevisionTableRow>;

    // Check if this workflow is being subscribed to
    if (!this.subscribedWorkflowIds.has(newRow.workflow_id)) {
      return;
    }

    // Check if payment was just completed
    if (
      newRow.payment_status === 'paid' &&
      oldRow.payment_status !== 'paid'
    ) {
      const revision: RevisionUpdate = {
        revisionId: newRow.id,
        workflowId: newRow.workflow_id,
        revisionNumber: newRow.revision_number,
        revisionType: newRow.revision_type,
        status: newRow.status,
        paymentStatus: newRow.payment_status,
        createdAt: newRow.created_at,
      };

      this.callbacks.onRevisionPaymentCompleted?.(revision);
    }
  }

  /**
   * Clean up all subscriptions
   */
  cleanup(): void {
    if (this.workflowChannel) {
      this.supabase.removeChannel(this.workflowChannel);
      this.workflowChannel = null;
    }

    if (this.revisionChannel) {
      this.supabase.removeChannel(this.revisionChannel);
      this.revisionChannel = null;
    }

    this.subscribedWorkflowIds.clear();
    this.callbacks = {};

    log.info('[Realtime] Workflow subscriptions cleaned up');
  }
}

// ============================================================================
// TABLE ROW TYPES
// ============================================================================

interface WorkflowTableRow {
  id: string;
  order_id: string;
  status: string;
  current_phase: number;
  total_phases: number;
  workflow_path: string;
  checkpoint_pending: CheckpointType | null;
  revision_count: number | null;
  free_revisions_remaining: number | null;
  judge_simulation_grade: string | null;
  judge_simulation_grade_numeric: number | null;
  judge_simulation_passed: boolean | null;
  updated_at: string;
}

interface RevisionTableRow {
  id: string;
  workflow_id: string;
  revision_number: number;
  revision_type: 'free' | 'paid';
  status: string;
  payment_status: string | null;
  created_at: string;
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

let subscriptionManager: WorkflowSubscriptionManager | null = null;

/**
 * Get the singleton subscription manager instance
 */
export function getWorkflowSubscriptionManager(): WorkflowSubscriptionManager {
  if (!subscriptionManager) {
    subscriptionManager = new WorkflowSubscriptionManager();
  }
  return subscriptionManager;
}

/**
 * Convenience function to subscribe to a single order
 */
export async function subscribeToOrderWorkflow(
  orderId: string,
  callbacks: WorkflowSubscriptionCallbacks
): Promise<() => void> {
  const manager = getWorkflowSubscriptionManager();
  return manager.subscribeToOrder(orderId, callbacks);
}

/**
 * Convenience function to subscribe to multiple workflows
 */
export function subscribeToWorkflows(
  workflowIds: string[],
  callbacks: WorkflowSubscriptionCallbacks
): () => void {
  const manager = getWorkflowSubscriptionManager();
  return manager.subscribe(workflowIds, callbacks);
}

export default WorkflowSubscriptionManager;
