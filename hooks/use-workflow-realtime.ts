/**
 * Workflow Real-time Hook
 *
 * v6.3: React hook for consuming real-time workflow updates.
 * Provides live updates for phase changes, checkpoints, and revisions.
 */

'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  getWorkflowSubscriptionManager,
  type WorkflowUpdate,
  type PhaseChangeEvent,
  type CheckpointEvent,
  type RevisionUpdate,
  type CheckpointType,
} from '@/lib/realtime/workflow-subscription';
import { createClient } from '@/lib/supabase/client';

// ============================================================================
// TYPES
// ============================================================================

export interface WorkflowRealtimeState {
  workflowId: string | null;
  orderId: string | null;
  currentPhase: number;
  totalPhases: number;
  phaseName: string;
  status: string;
  checkpointPending: CheckpointType | null;
  judgeSimulation: {
    grade: string | null;
    gradeNumeric: number | null;
    passed: boolean | null;
  };
  revision: {
    count: number;
    freeRemaining: number;
  };
  progress: number;
  lastUpdate: Date | null;
}

export interface UseWorkflowRealtimeOptions {
  onPhaseChange?: (event: PhaseChangeEvent) => void;
  onCheckpointTriggered?: (event: CheckpointEvent) => void;
  onRevisionCreated?: (revision: RevisionUpdate) => void;
  onRevisionPaymentCompleted?: (revision: RevisionUpdate) => void;
  onWorkflowCompleted?: (workflowId: string, orderId: string) => void;
  onError?: (error: Error) => void;
}

export interface UseWorkflowRealtimeReturn {
  state: WorkflowRealtimeState;
  isConnected: boolean;
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
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

const initialState: WorkflowRealtimeState = {
  workflowId: null,
  orderId: null,
  currentPhase: 1,
  totalPhases: 12,
  phaseName: 'Intake',
  status: 'pending',
  checkpointPending: null,
  judgeSimulation: {
    grade: null,
    gradeNumeric: null,
    passed: null,
  },
  revision: {
    count: 0,
    freeRemaining: 1,
  },
  progress: 0,
  lastUpdate: null,
};

// ============================================================================
// MAIN HOOK
// ============================================================================

export function useWorkflowRealtime(
  orderId: string | null,
  options: UseWorkflowRealtimeOptions = {}
): UseWorkflowRealtimeReturn {
  const [state, setState] = useState<WorkflowRealtimeState>(initialState);
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const unsubscribeRef = useRef<(() => void) | null>(null);
  const supabase = createClient();

  // Fetch initial workflow data
  const fetchWorkflow = useCallback(async () => {
    if (!orderId) {
      setState(initialState);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const { data: workflow, error: fetchError } = await supabase
        .from('order_workflows')
        .select('*')
        .eq('order_id', orderId)
        .single();

      if (fetchError) {
        throw new Error(fetchError.message);
      }

      if (!workflow) {
        throw new Error('Workflow not found');
      }

      const currentPhase = workflow.current_phase ?? 1;
      const totalPhases = workflow.total_phases ?? 12;

      setState({
        workflowId: workflow.id,
        orderId: workflow.order_id,
        currentPhase,
        totalPhases,
        phaseName: PHASE_NAMES[currentPhase] || `Phase ${currentPhase}`,
        status: workflow.status,
        checkpointPending: workflow.checkpoint_pending,
        judgeSimulation: {
          grade: workflow.judge_simulation_grade,
          gradeNumeric: workflow.judge_simulation_grade_numeric,
          passed: workflow.judge_simulation_passed,
        },
        revision: {
          count: workflow.revision_count ?? 0,
          freeRemaining: workflow.free_revisions_remaining ?? 1,
        },
        progress: Math.round(((currentPhase - 1) / totalPhases) * 100),
        lastUpdate: new Date(workflow.updated_at),
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch workflow';
      setError(errorMessage);
      options.onError?.(new Error(errorMessage));
    } finally {
      setIsLoading(false);
    }
  }, [orderId, supabase, options]);

  // Handle workflow updates from real-time subscription
  const handleWorkflowUpdate = useCallback((update: WorkflowUpdate) => {
    setState(prev => ({
      ...prev,
      workflowId: update.workflowId,
      orderId: update.orderId,
      currentPhase: update.currentPhase,
      phaseName: PHASE_NAMES[update.currentPhase] || `Phase ${update.currentPhase}`,
      status: update.status,
      checkpointPending: update.checkpointPending,
      judgeSimulation: {
        grade: update.judgeSimulationGrade,
        gradeNumeric: null, // Would need to be included in update
        passed: update.judgeSimulationPassed,
      },
      revision: {
        count: update.revisionCount,
        freeRemaining: update.freeRevisionsRemaining,
      },
      progress: Math.round(((update.currentPhase - 1) / prev.totalPhases) * 100),
      lastUpdate: new Date(update.updatedAt),
    }));
  }, []);

  // Set up subscription
  useEffect(() => {
    if (!orderId) {
      return;
    }

    // Fetch initial data
    fetchWorkflow();

    // Set up real-time subscription
    const manager = getWorkflowSubscriptionManager();

    const setupSubscription = async () => {
      try {
        const unsubscribe = await manager.subscribeToOrder(orderId, {
          onWorkflowUpdate: handleWorkflowUpdate,
          onPhaseChange: (event) => {
            options.onPhaseChange?.(event);
          },
          onCheckpointTriggered: (event) => {
            options.onCheckpointTriggered?.(event);
          },
          onRevisionCreated: (revision) => {
            options.onRevisionCreated?.(revision);
          },
          onRevisionPaymentCompleted: (revision) => {
            options.onRevisionPaymentCompleted?.(revision);
          },
          onWorkflowCompleted: (workflowId, orderId) => {
            options.onWorkflowCompleted?.(workflowId, orderId);
          },
          onError: (err) => {
            setError(err.message);
            setIsConnected(false);
            options.onError?.(err);
          },
        });

        unsubscribeRef.current = unsubscribe;
        setIsConnected(true);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Subscription failed';
        setError(errorMessage);
        setIsConnected(false);
      }
    };

    setupSubscription();

    // Cleanup on unmount or orderId change
    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
      setIsConnected(false);
    };
  }, [orderId, fetchWorkflow, handleWorkflowUpdate, options]);

  return {
    state,
    isConnected,
    isLoading,
    error,
    refetch: fetchWorkflow,
  };
}

// ============================================================================
// CHECKPOINT-SPECIFIC HOOK
// ============================================================================

export interface UseCheckpointReturn {
  isAtCheckpoint: boolean;
  checkpoint: CheckpointType | null;
  checkpointNumber: number | null;
  grade: string | null;
  passed: boolean | null;
  canRequestFreeRevision: boolean;
  revisionPrice: number | null;
}

export function useCheckpointStatus(
  orderId: string | null
): UseCheckpointReturn & { isLoading: boolean; error: string | null } {
  const { state, isLoading, error } = useWorkflowRealtime(orderId);

  // Determine revision pricing based on tier (would typically come from the order data)
  const revisionPrices: Record<string, number> = {
    A: 75,
    B: 125,
    C: 200,
  };

  return {
    isAtCheckpoint: !!state.checkpointPending,
    checkpoint: state.checkpointPending,
    checkpointNumber: state.checkpointPending
      ? parseInt(state.checkpointPending.replace('CP', ''))
      : null,
    grade: state.judgeSimulation.grade,
    passed: state.judgeSimulation.passed,
    canRequestFreeRevision: state.revision.freeRemaining > 0,
    revisionPrice: state.revision.freeRemaining > 0 ? null : revisionPrices['B'], // Default to B tier
    isLoading,
    error,
  };
}

// ============================================================================
// MULTIPLE WORKFLOWS HOOK
// ============================================================================

export interface WorkflowListItem extends WorkflowRealtimeState {
  orderNumber?: string;
}

export function useMultipleWorkflowsRealtime(
  workflowIds: string[],
  options: UseWorkflowRealtimeOptions = {}
): {
  workflows: Map<string, WorkflowListItem>;
  isConnected: boolean;
  isLoading: boolean;
  error: string | null;
} {
  const [workflows, setWorkflows] = useState<Map<string, WorkflowListItem>>(new Map());
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const unsubscribeRef = useRef<(() => void) | null>(null);
  const supabase = createClient();

  // Fetch initial data for all workflows
  useEffect(() => {
    if (workflowIds.length === 0) {
      setWorkflows(new Map());
      setIsLoading(false);
      return;
    }

    const fetchWorkflows = async () => {
      setIsLoading(true);

      try {
        const { data, error: fetchError } = await supabase
          .from('order_workflows')
          .select('*, orders(order_number)')
          .in('id', workflowIds);

        if (fetchError) {
          throw new Error(fetchError.message);
        }

        const workflowMap = new Map<string, WorkflowListItem>();

        for (const workflow of data || []) {
          const currentPhase = workflow.current_phase ?? 1;
          const totalPhases = workflow.total_phases ?? 12;

          workflowMap.set(workflow.id, {
            workflowId: workflow.id,
            orderId: workflow.order_id,
            orderNumber: (workflow.orders as { order_number?: string })?.order_number,
            currentPhase,
            totalPhases,
            phaseName: PHASE_NAMES[currentPhase] || `Phase ${currentPhase}`,
            status: workflow.status,
            checkpointPending: workflow.checkpoint_pending,
            judgeSimulation: {
              grade: workflow.judge_simulation_grade,
              gradeNumeric: workflow.judge_simulation_grade_numeric,
              passed: workflow.judge_simulation_passed,
            },
            revision: {
              count: workflow.revision_count ?? 0,
              freeRemaining: workflow.free_revisions_remaining ?? 1,
            },
            progress: Math.round(((currentPhase - 1) / totalPhases) * 100),
            lastUpdate: new Date(workflow.updated_at),
          });
        }

        setWorkflows(workflowMap);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch workflows');
      } finally {
        setIsLoading(false);
      }
    };

    fetchWorkflows();

    // Set up subscription
    const manager = getWorkflowSubscriptionManager();
    const unsubscribe = manager.subscribe(workflowIds, {
      onWorkflowUpdate: (update) => {
        setWorkflows(prev => {
          const newMap = new Map(prev);
          const existing = newMap.get(update.workflowId);

          newMap.set(update.workflowId, {
            ...existing,
            workflowId: update.workflowId,
            orderId: update.orderId,
            currentPhase: update.currentPhase,
            totalPhases: existing?.totalPhases ?? 12,
            phaseName: PHASE_NAMES[update.currentPhase] || `Phase ${update.currentPhase}`,
            status: update.status,
            checkpointPending: update.checkpointPending,
            judgeSimulation: {
              grade: update.judgeSimulationGrade,
              gradeNumeric: null,
              passed: update.judgeSimulationPassed,
            },
            revision: {
              count: update.revisionCount,
              freeRemaining: update.freeRevisionsRemaining,
            },
            progress: Math.round(((update.currentPhase - 1) / (existing?.totalPhases ?? 12)) * 100),
            lastUpdate: new Date(update.updatedAt),
          });

          return newMap;
        });
      },
      onPhaseChange: options.onPhaseChange,
      onCheckpointTriggered: options.onCheckpointTriggered,
      onRevisionCreated: options.onRevisionCreated,
      onRevisionPaymentCompleted: options.onRevisionPaymentCompleted,
      onWorkflowCompleted: options.onWorkflowCompleted,
      onError: (err) => {
        setError(err.message);
        setIsConnected(false);
        options.onError?.(err);
      },
    });

    unsubscribeRef.current = unsubscribe;
    setIsConnected(true);

    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
      setIsConnected(false);
    };
  }, [workflowIds.join(','), supabase, options]);

  return {
    workflows,
    isConnected,
    isLoading,
    error,
  };
}

export default useWorkflowRealtime;
