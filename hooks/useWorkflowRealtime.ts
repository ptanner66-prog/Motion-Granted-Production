'use client';

/**
 * Real-time Workflow Status Hook
 *
 * Provides live updates for workflow progress:
 * - Supabase Realtime subscriptions
 * - Automatic reconnection
 * - Optimistic UI updates
 * - Phase progress tracking
 *
 * v7.2: Updated for 14-phase workflow system
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import type {
  WorkflowPhaseCode,
  PhaseStatus,
  JudgeSimulationResult,
} from '@/types/workflow';

// ============================================================================
// TYPES
// ============================================================================

export interface WorkflowState {
  workflowId: string | null;
  orderId: string;
  status: 'pending' | 'in_progress' | 'completed' | 'blocked' | 'cancelled';
  currentPhase: WorkflowPhaseCode;
  currentPhaseNumber: number;
  totalPhases: number;
  phaseStatuses: Partial<Record<WorkflowPhaseCode, PhaseStatus>>;
  revisionLoop: number;
  progress: number;
  estimatedMinutesRemaining: number | null;
  judgeResult: JudgeSimulationResult | null;
  citationCount: number;
  lastUpdate: Date;
  error: string | null;
}

export interface UseWorkflowRealtimeOptions {
  orderId: string;
  enabled?: boolean;
  onPhaseChange?: (phase: WorkflowPhaseCode, status: PhaseStatus) => void;
  onComplete?: () => void;
  onError?: (error: string) => void;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const PHASE_ORDER: WorkflowPhaseCode[] = [
  'I', 'II', 'III', 'IV', 'V', 'V.1', 'VI', 'VII',
  'VII.1', 'VIII', 'VIII.5', 'IX', 'IX.1', 'X'
];

const PHASE_NUMBER_TO_CODE: Record<number, WorkflowPhaseCode> = {
  1: 'I', 2: 'II', 3: 'III', 4: 'IV', 5: 'V', 6: 'V.1',
  7: 'VI', 8: 'VII', 9: 'VII.1', 10: 'VIII', 11: 'VIII.5',
  12: 'IX', 13: 'IX.1', 14: 'X'
};

const PHASE_DURATIONS: Record<WorkflowPhaseCode, number> = {
  'I': 0.5, 'II': 1, 'III': 2, 'IV': 1.5, 'V': 1, 'V.1': 0.5,
  'VI': 3, 'VII': 2, 'VII.1': 1.5, 'VIII': 1, 'VIII.5': 0.5,
  'IX': 1, 'IX.1': 0.5, 'X': 0.5
};

// ============================================================================
// INITIAL STATE
// ============================================================================

function createInitialState(orderId: string): WorkflowState {
  return {
    workflowId: null,
    orderId,
    status: 'pending',
    currentPhase: 'I',
    currentPhaseNumber: 1,
    totalPhases: 14,
    phaseStatuses: {},
    revisionLoop: 0,
    progress: 0,
    estimatedMinutesRemaining: null,
    judgeResult: null,
    citationCount: 0,
    lastUpdate: new Date(),
    error: null,
  };
}

// ============================================================================
// MAIN HOOK
// ============================================================================

export function useWorkflowRealtime(options: UseWorkflowRealtimeOptions) {
  const { orderId, enabled = true, onPhaseChange, onComplete, onError } = options;

  const [state, setState] = useState<WorkflowState>(() => createInitialState(orderId));
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const supabaseRef = useRef(createClient());
  const channelRef = useRef<ReturnType<typeof supabaseRef.current.channel> | null>(null);

  // ============================================================================
  // FETCH INITIAL STATE
  // ============================================================================

  const fetchWorkflowState = useCallback(async () => {
    const supabase = supabaseRef.current;

    try {
      // Get workflow
      const { data: workflow, error: wfError } = await supabase
        .from('order_workflows')
        .select('*')
        .eq('order_id', orderId)
        .single();

      if (wfError || !workflow) {
        setState(prev => ({ ...prev, error: null }));
        setIsLoading(false);
        return;
      }

      // Get phase executions
      const { data: phases } = await supabase
        .from('workflow_phase_executions')
        .select('phase_number, status')
        .eq('order_workflow_id', workflow.id);

      // Build phase statuses
      const phaseStatuses: Partial<Record<WorkflowPhaseCode, PhaseStatus>> = {};
      phases?.forEach((p: { phase_number: number; status: string }) => {
        const code = PHASE_NUMBER_TO_CODE[p.phase_number];
        if (code) {
          phaseStatuses[code] = p.status as PhaseStatus;
        }
      });

      // Get judge result if available
      const { data: judgeData } = await supabase
        .from('judge_simulation_results')
        .select('*')
        .eq('workflow_id', workflow.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      const judgeResult: JudgeSimulationResult | null = judgeData ? {
        grade: judgeData.grade,
        numericGrade: judgeData.numeric_grade || 0,
        passes: judgeData.passes,
        strengths: judgeData.strengths || [],
        weaknesses: judgeData.weaknesses || [],
        specificFeedback: judgeData.specific_feedback || '',
        revisionSuggestions: judgeData.revision_suggestions || [],
        loopNumber: judgeData.loop_number || 1,
      } : null;

      // Calculate progress
      const completedPhases = Object.values(phaseStatuses).filter(s => s === 'completed').length;
      const progress = Math.round((completedPhases / 14) * 100);

      // Estimate remaining time
      const currentPhaseCode = PHASE_NUMBER_TO_CODE[workflow.current_phase] || 'I';
      const currentIndex = PHASE_ORDER.indexOf(currentPhaseCode);
      const remainingPhases = PHASE_ORDER.slice(currentIndex);
      const estimatedMinutesRemaining = remainingPhases.reduce(
        (sum, phase) => sum + (PHASE_DURATIONS[phase] || 1),
        0
      );

      setState({
        workflowId: workflow.id,
        orderId,
        status: workflow.status,
        currentPhase: currentPhaseCode,
        currentPhaseNumber: workflow.current_phase,
        totalPhases: 14,
        phaseStatuses,
        revisionLoop: workflow.revision_loop || 0,
        progress,
        estimatedMinutesRemaining: workflow.status === 'completed' ? null : estimatedMinutesRemaining,
        judgeResult,
        citationCount: workflow.citation_count || 0,
        lastUpdate: new Date(),
        error: null,
      });

      setIsLoading(false);
    } catch (error) {
      console.error('[useWorkflowRealtime] Fetch error:', error);
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Failed to fetch workflow',
      }));
      setIsLoading(false);
    }
  }, [orderId]);

  // ============================================================================
  // REALTIME SUBSCRIPTION
  // ============================================================================

  useEffect(() => {
    if (!enabled) return;

    const supabase = supabaseRef.current;

    // Initial fetch
    fetchWorkflowState();

    // Set up realtime channel
    const channel = supabase
      .channel(`workflow:${orderId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'order_workflows',
          filter: `order_id=eq.${orderId}`,
        },
        (payload) => {
          console.log('[useWorkflowRealtime] Workflow update:', payload);

          if (payload.new) {
            const newData = payload.new as Record<string, unknown>;
            const newPhaseCode = PHASE_NUMBER_TO_CODE[newData.current_phase as number] || 'I';

            setState(prev => {
              const updated = {
                ...prev,
                workflowId: newData.id as string,
                status: newData.status as WorkflowState['status'],
                currentPhase: newPhaseCode,
                currentPhaseNumber: newData.current_phase as number,
                revisionLoop: (newData.revision_loop as number) || 0,
                citationCount: (newData.citation_count as number) || 0,
                lastUpdate: new Date(),
              };

              // Trigger callbacks
              if (newPhaseCode !== prev.currentPhase) {
                onPhaseChange?.(newPhaseCode, 'in_progress');
              }

              if (newData.status === 'completed' && prev.status !== 'completed') {
                onComplete?.();
              }

              if (newData.status === 'blocked' && newData.error_message) {
                onError?.(newData.error_message as string);
              }

              return updated;
            });
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'workflow_phase_executions',
        },
        (payload) => {
          if (payload.new) {
            const newData = payload.new as Record<string, unknown>;
            const phaseNumber = newData.phase_number as number;
            const phaseCode = PHASE_NUMBER_TO_CODE[phaseNumber];
            const status = newData.status as PhaseStatus;

            if (phaseCode) {
              setState(prev => {
                const newStatuses = { ...prev.phaseStatuses, [phaseCode]: status };
                const completedCount = Object.values(newStatuses).filter(s => s === 'completed').length;

                return {
                  ...prev,
                  phaseStatuses: newStatuses,
                  progress: Math.round((completedCount / 14) * 100),
                  lastUpdate: new Date(),
                };
              });

              onPhaseChange?.(phaseCode, status);
            }
          }
        }
      )
      .subscribe((status) => {
        setIsConnected(status === 'SUBSCRIBED');
        console.log('[useWorkflowRealtime] Subscription status:', status);
      });

    channelRef.current = channel;

    // Cleanup
    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [orderId, enabled, fetchWorkflowState, onPhaseChange, onComplete, onError]);

  // ============================================================================
  // MANUAL REFRESH
  // ============================================================================

  const refresh = useCallback(() => {
    setIsLoading(true);
    fetchWorkflowState();
  }, [fetchWorkflowState]);

  // ============================================================================
  // RETURN VALUE
  // ============================================================================

  return {
    ...state,
    isConnected,
    isLoading,
    refresh,
  };
}

// ============================================================================
// SIMPLIFIED HOOK FOR PROGRESS ONLY
// ============================================================================

export function useWorkflowProgress(orderId: string, enabled = true) {
  const result = useWorkflowRealtime({ orderId, enabled });

  return {
    progress: result.progress,
    currentPhase: result.currentPhase,
    status: result.status,
    isLoading: result.isLoading,
    estimatedMinutes: result.estimatedMinutesRemaining,
  };
}

// ============================================================================
// HOOK FOR MULTIPLE ORDERS (Admin Dashboard)
// ============================================================================

export function useMultipleWorkflowsProgress(orderIds: string[]) {
  const [workflows, setWorkflows] = useState<Map<string, WorkflowState>>(new Map());
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (orderIds.length === 0) {
      setIsLoading(false);
      return;
    }

    const supabase = createClient();

    async function fetchAll() {
      const { data, error } = await supabase
        .from('order_workflows')
        .select('*')
        .in('order_id', orderIds);

      if (error) {
        console.error('[useMultipleWorkflowsProgress] Error:', error);
        setIsLoading(false);
        return;
      }

      const map = new Map<string, WorkflowState>();
      data?.forEach((wf: Record<string, unknown>) => {
        const phaseCode = PHASE_NUMBER_TO_CODE[wf.current_phase as number] || 'I';
        map.set(wf.order_id as string, {
          workflowId: wf.id as string,
          orderId: wf.order_id as string,
          status: wf.status as WorkflowState['status'],
          currentPhase: phaseCode,
          currentPhaseNumber: wf.current_phase as number,
          totalPhases: 14,
          phaseStatuses: {},
          revisionLoop: (wf.revision_loop as number) || 0,
          progress: Math.round(((wf.current_phase as number) / 14) * 100),
          estimatedMinutesRemaining: null,
          judgeResult: null,
          citationCount: (wf.citation_count as number) || 0,
          lastUpdate: new Date(),
          error: null,
        });
      });

      setWorkflows(map);
      setIsLoading(false);
    }

    fetchAll();

    // Subscribe to changes
    const channel = supabase
      .channel('workflows-bulk')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'order_workflows',
          filter: `order_id=in.(${orderIds.join(',')})`,
        },
        (payload) => {
          if (payload.new) {
            const newData = payload.new as Record<string, unknown>;
            const orderId = newData.order_id as string;
            const phaseCode = PHASE_NUMBER_TO_CODE[newData.current_phase as number] || 'I';

            setWorkflows(prev => {
              const updated = new Map(prev);
              updated.set(orderId, {
                workflowId: newData.id as string,
                orderId,
                status: newData.status as WorkflowState['status'],
                currentPhase: phaseCode,
                currentPhaseNumber: newData.current_phase as number,
                totalPhases: 14,
                phaseStatuses: {},
                revisionLoop: (newData.revision_loop as number) || 0,
                progress: Math.round(((newData.current_phase as number) / 14) * 100),
                estimatedMinutesRemaining: null,
                judgeResult: null,
                citationCount: (newData.citation_count as number) || 0,
                lastUpdate: new Date(),
                error: null,
              });
              return updated;
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [orderIds.join(',')]);

  return { workflows, isLoading };
}

export default useWorkflowRealtime;
