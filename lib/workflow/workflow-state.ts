/**
 * Workflow State Utilities
 *
 * Extracted from workflow-engine.ts. Contains the utility functions for:
 * - Creating workflows (startWorkflow)
 * - Reading workflow progress (getWorkflowProgress)
 * - Approving phase checkpoints (approvePhase)
 * - Quality scoring constants and helpers
 *
 * The dead orchestration functions (executeCurrentPhase, runWorkflow) have been
 * removed. Phase execution is handled exclusively by the Inngest-driven
 * workflow-orchestration.ts pipeline.
 */

import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import {
  type PhaseId,
} from './phase-gates';
import type {
  WorkflowPath,
  PhaseStatus,
  WorkflowProgress,
  StartWorkflowRequest,
  StartWorkflowResponse,
} from '@/types/workflow';
import type { OperationResult } from '@/types/automation';

// ============================================================================
// SUPABASE ADMIN CLIENT
// ============================================================================

/**
 * Create admin client with service role key (bypasses RLS for server-side operations)
 */
function getAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    return null;
  }

  return createSupabaseClient(supabaseUrl, supabaseServiceKey);
}

// ============================================================================
// v6.3 QUALITY CONSTANTS — DO NOT MODIFY WITHOUT APPROVAL
// ============================================================================

/**
 * Minimum passing grade: A- = 87%
 * This is a non-negotiable quality gate. Motions below this threshold
 * MUST be revised before delivery.
 */
export const MINIMUM_PASSING_GRADE = 0.87;

/**
 * Maximum revision loops before escalation
 * After 3 failed attempts to reach A-, the workflow escalates to admin review.
 */
export const MAX_REVISION_LOOPS = 3;

/**
 * Total phases in v6.3 workflow
 * Phases: I, II, III, IV, V, V.1, VI, VII, VII.1, VIII, VIII.5, IX, IX.1, X
 */
export const TOTAL_PHASES = 14;

/**
 * Convert numeric score (0.00-1.00) to letter grade
 * Returns both the letter and whether it passes the minimum threshold
 */
export function scoreToGrade(score: number): { letter: string; passed: boolean } {
  const percent = score * 100;

  if (percent >= 97) return { letter: 'A+', passed: true };
  if (percent >= 93) return { letter: 'A', passed: true };
  if (percent >= 90) return { letter: 'A-', passed: true };
  if (percent >= 87) return { letter: 'B+', passed: true };  // ← MINIMUM PASSING (A-)
  if (percent >= 83) return { letter: 'B', passed: false };
  if (percent >= 80) return { letter: 'B-', passed: false };
  if (percent >= 77) return { letter: 'C+', passed: false };
  if (percent >= 73) return { letter: 'C', passed: false };
  if (percent >= 70) return { letter: 'C-', passed: false };
  if (percent >= 60) return { letter: 'D', passed: false };
  return { letter: 'F', passed: false };
}

/**
 * Check if a score meets the quality threshold
 * Use this instead of hardcoded comparisons
 */
export function meetsQualityThreshold(score: number): boolean {
  return score >= MINIMUM_PASSING_GRADE;
}

// ============================================================================
// WORKFLOW CREATION
// ============================================================================

/**
 * Start a new workflow for an order.
 * Creates workflow record and phase execution records in the database.
 */
export async function startWorkflow(
  request: StartWorkflowRequest
): Promise<OperationResult<StartWorkflowResponse>> {
  const supabase = getAdminClient();
  if (!supabase) {
    return { success: false, error: 'Database not configured' };
  }

  try {
    // Check if workflow already exists
    const { data: existing } = await supabase
      .from('order_workflows')
      .select('id')
      .eq('order_id', request.orderId)
      .single();

    if (existing) {
      return {
        success: false,
        error: 'Workflow already exists for this order',
        data: { success: false, workflowId: existing.id },
      };
    }

    // Create workflow
    const { data: workflow, error: createError } = await supabase
      .from('order_workflows')
      .insert({
        order_id: request.orderId,
        motion_type_id: request.motionTypeId,
        workflow_path: request.workflowPath,
        current_phase: 1,
        current_phase_code: 'I',
        completed_phases: [], // IMPORTANT: Initialize empty for phase gates
        status: 'pending',
        started_at: new Date().toISOString(),
        metadata: request.metadata || {},
      })
      .select()
      .single();

    if (createError) {
      return { success: false, error: createError.message };
    }

    // Get phase definitions for this path
    const { data: phases, error: phasesError } = await supabase
      .from('workflow_phase_definitions')
      .select('*')
      .eq('workflow_path', request.workflowPath)
      .order('phase_number', { ascending: true });

    if (phasesError) {
      return { success: false, error: phasesError.message };
    }

    // Create phase execution records
    interface PhaseRow { id: string; phase_number: number }
    const phaseExecutions = ((phases || []) as PhaseRow[]).map((phase: PhaseRow) => ({
      order_workflow_id: workflow.id,
      phase_definition_id: phase.id,
      phase_number: phase.phase_number,
      status: phase.phase_number === 1 ? 'pending' : 'pending',
    }));

    const { error: execError } = await supabase
      .from('workflow_phase_executions')
      .insert(phaseExecutions);

    if (execError) {
      return { success: false, error: execError.message };
    }

    return {
      success: true,
      data: { success: true, workflowId: workflow.id },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to start workflow',
    };
  }
}

// ============================================================================
// WORKFLOW PROGRESS
// ============================================================================

/**
 * Get the current progress of a workflow.
 * Read-only utility used by admin dashboard and API routes.
 */
export async function getWorkflowProgress(
  workflowId: string
): Promise<OperationResult<WorkflowProgress>> {
  const supabase = getAdminClient();
  if (!supabase) {
    return { success: false, error: 'Database not configured' };
  }

  try {
    const { data: workflow, error: wfError } = await supabase
      .from('order_workflows')
      .select('*')
      .eq('id', workflowId)
      .single();

    if (wfError || !workflow) {
      return { success: false, error: 'Workflow not found' };
    }

    // Get phase definitions count
    const { count: totalPhases } = await supabase
      .from('workflow_phase_definitions')
      .select('*', { count: 'exact', head: true })
      .eq('workflow_path', workflow.workflow_path);

    // Get completed phases count
    const { count: completedPhases } = await supabase
      .from('workflow_phase_executions')
      .select('*', { count: 'exact', head: true })
      .eq('order_workflow_id', workflowId)
      .eq('status', 'completed');

    // Get current phase info
    const { data: currentPhaseDef } = await supabase
      .from('workflow_phase_definitions')
      .select('*')
      .eq('workflow_path', workflow.workflow_path)
      .eq('phase_number', workflow.current_phase)
      .single();

    const { data: currentPhaseExec } = await supabase
      .from('workflow_phase_executions')
      .select('*')
      .eq('order_workflow_id', workflowId)
      .eq('phase_number', workflow.current_phase)
      .single();

    // Calculate remaining time
    const { data: remainingPhases } = await supabase
      .from('workflow_phase_definitions')
      .select('estimated_duration_minutes')
      .eq('workflow_path', workflow.workflow_path)
      .gte('phase_number', workflow.current_phase);

    interface PhaseDurationRow { estimated_duration_minutes: number | null }
    const estimatedRemainingMinutes = ((remainingPhases || []) as PhaseDurationRow[]).reduce(
      (sum: number, p: PhaseDurationRow) => sum + (p.estimated_duration_minutes || 30),
      0
    );

    const progress: WorkflowProgress = {
      workflowId,
      orderId: workflow.order_id,
      totalPhases: totalPhases || 9,
      completedPhases: completedPhases || 0,
      currentPhase: workflow.current_phase,
      currentPhaseName: currentPhaseDef?.phase_name || 'Unknown',
      currentPhaseStatus: (currentPhaseExec?.status as PhaseStatus) || 'pending',
      overallProgress: ((completedPhases || 0) / (totalPhases || 9)) * 100,
      estimatedRemainingMinutes,
      citationCount: workflow.citation_count || 0,
      qualityScore: workflow.quality_score || undefined,
    };

    return { success: true, data: progress };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get workflow progress',
    };
  }
}

// ============================================================================
// PHASE APPROVAL
// ============================================================================

/**
 * Approve a phase requiring review.
 * Used by admin checkpoint approval API route.
 */
export async function approvePhase(
  workflowId: string,
  phaseNumber: number,
  approvedBy: string,
  notes?: string
): Promise<OperationResult> {
  const supabase = getAdminClient();
  if (!supabase) {
    return { success: false, error: 'Database not configured' };
  }

  try {
    const { error } = await supabase
      .from('workflow_phase_executions')
      .update({
        status: 'completed',
        requires_review: false,
        reviewed_by: approvedBy,
        reviewed_at: new Date().toISOString(),
        review_notes: notes,
      })
      .eq('order_workflow_id', workflowId)
      .eq('phase_number', phaseNumber);

    if (error) {
      return { success: false, error: error.message };
    }

    // Advance workflow
    await supabase
      .from('order_workflows')
      .update({
        current_phase: phaseNumber + 1,
        last_activity_at: new Date().toISOString(),
      })
      .eq('id', workflowId);

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to approve phase',
    };
  }
}
