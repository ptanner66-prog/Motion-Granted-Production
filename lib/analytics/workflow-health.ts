/**
 * Workflow Health Metrics
 *
 * Returns workflow system health data matching the WorkflowHealthCard interface.
 */

import { createClient } from '@/lib/supabase/server';

export interface WorkflowHealthResponse {
  activeOrders: number;
  completedToday: number;
  avgProcessingTime: number; // hours
  failedWorkflows: number;
  pendingCheckpoints: number;
  phaseDistribution: Record<string, number>;
  healthStatus: 'healthy' | 'degraded' | 'unhealthy';
}

export async function getWorkflowHealth(): Promise<WorkflowHealthResponse> {
  const supabase = await createClient();

  // Fetch active workflows
  const { count: activeCount } = await supabase
    .from('order_workflows')
    .select('*', { count: 'exact', head: true })
    .in('status', ['pending', 'in_progress']);

  // Fetch workflows completed today
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const { count: completedTodayCount } = await supabase
    .from('order_workflows')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'completed')
    .gte('completed_at', todayStart.toISOString());

  // Fetch failed workflows
  const { count: failedCount } = await supabase
    .from('order_workflows')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'failed');

  // Calculate avg processing time from completed workflows (last 90 days)
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
  const { data: completedWorkflows } = await supabase
    .from('order_workflows')
    .select('created_at, completed_at')
    .eq('status', 'completed')
    .not('completed_at', 'is', null)
    .gte('completed_at', ninetyDaysAgo)
    .limit(500);

  type WorkflowRow = { created_at: string; completed_at: string };
  let avgProcessingTime = 0;
  if (completedWorkflows && completedWorkflows.length > 0) {
    const rows = completedWorkflows as WorkflowRow[];
    const totalHours = rows.reduce((sum: number, w: WorkflowRow) => {
      const created = new Date(w.created_at).getTime();
      const completed = new Date(w.completed_at).getTime();
      return sum + (completed - created) / (1000 * 60 * 60);
    }, 0);
    avgProcessingTime = Math.round((totalHours / rows.length) * 10) / 10;
  }

  // Get pending checkpoints from workflow_state
  const { count: pendingCheckpointCount } = await supabase
    .from('workflow_state')
    .select('*', { count: 'exact', head: true })
    .eq('checkpoint_pending', true);

  // Get phase distribution from active workflow states
  const { data: activeStates } = await supabase
    .from('workflow_state')
    .select('current_phase')
    .not('current_phase', 'is', null)
    .in('phase_status', ['in_progress', 'pending', 'waiting_checkpoint']);

  type PhaseRow = { current_phase: string | null };
  const phaseDistribution: Record<string, number> = {};
  (activeStates as PhaseRow[] | null)?.forEach((state: PhaseRow) => {
    if (state.current_phase) {
      phaseDistribution[state.current_phase] =
        (phaseDistribution[state.current_phase] || 0) + 1;
    }
  });

  // Determine health status
  const activeOrders = activeCount || 0;
  const failedWorkflows = failedCount || 0;
  let healthStatus: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';

  if (failedWorkflows > 5 || (activeOrders > 0 && failedWorkflows / activeOrders > 0.2)) {
    healthStatus = 'unhealthy';
  } else if (failedWorkflows > 0 || (pendingCheckpointCount || 0) > 3) {
    healthStatus = 'degraded';
  }

  return {
    activeOrders,
    completedToday: completedTodayCount || 0,
    avgProcessingTime,
    failedWorkflows,
    pendingCheckpoints: pendingCheckpointCount || 0,
    phaseDistribution,
    healthStatus,
  };
}
