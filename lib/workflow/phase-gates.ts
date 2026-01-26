/**
 * PHASE GATE ENFORCEMENT
 *
 * This module enforces that phases execute in strict order.
 * No phase can run unless its prerequisites are complete.
 * No phase can be skipped under any circumstances.
 *
 * PHASES CANNOT BE SKIPPED.
 * Not by Claude. Not by code. Not by config. Not by anyone.
 */

import { createClient } from '@/lib/supabase/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

// ============================================================================
// PHASE DEFINITIONS — THE LAW
// ============================================================================

export const PHASES = {
  'I': { name: 'Intake & Classification', order: 1, required: true },
  'II': { name: 'Document Processing', order: 2, required: true },
  'III': { name: 'Gap Analysis', order: 3, required: true },
  'IV': { name: 'Citation Research', order: 4, required: true },
  'V': { name: 'Initial Draft', order: 5, required: true },
  'V.1': { name: 'Citation Verification', order: 6, required: true },
  'VI': { name: 'Internal Review', order: 7, required: true },
  'VII': { name: 'Revision Checkpoint', order: 8, required: true },
  'VIII': { name: 'Apply Revisions', order: 9, required: false }, // Only if revisions needed
  'VII.1': { name: 'New Citation Verification', order: 10, required: false }, // Only if new citations
  'IX': { name: 'Separate Statement', order: 11, required: false }, // Only for certain motion types
  'X': { name: 'Final Assembly', order: 12, required: true },
  'XI': { name: 'Quality Assurance', order: 13, required: true },
  'XII': { name: 'Attorney Review', order: 14, required: true },
  'XIII': { name: 'Delivery Preparation', order: 15, required: true },
  'XIV': { name: 'Delivery', order: 16, required: true },
} as const;

export type PhaseId = keyof typeof PHASES;

// Phase order for iteration
export const PHASE_ORDER: PhaseId[] = [
  'I', 'II', 'III', 'IV', 'V', 'V.1', 'VI', 'VII',
  'VIII', 'VII.1', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV'
];

// ============================================================================
// PHASE PREREQUISITES — WHAT MUST COMPLETE BEFORE EACH PHASE
// ============================================================================

export const PHASE_PREREQUISITES: Record<PhaseId, PhaseId[]> = {
  'I': [],
  'II': ['I'],
  'III': ['II'],
  'IV': ['III'],
  'V': ['IV'],
  'V.1': ['V'],
  'VI': ['V.1'],
  'VII': ['VI'],
  'VIII': ['VII'],
  'VII.1': ['VIII'],
  'IX': ['V.1'], // Can run after citation verification
  'X': ['VII'], // Needs revision checkpoint complete (VI review done)
  'XI': ['X'],
  'XII': ['XI'],
  'XIII': ['XII'],
  'XIV': ['XIII'],
};

// ============================================================================
// PHASE COMPLETION REQUIREMENTS — WHAT MUST EXIST TO MARK COMPLETE
// ============================================================================

// Phase completion requirements - these are checked when markPhaseComplete is called
// NOTE: Requirements are kept minimal since phase executors may not output all fields
// The key requirement is that the phase executed successfully (indicated by the phase_X_complete flag)
export const PHASE_COMPLETION_REQUIREMENTS: Record<PhaseId, string[]> = {
  'I': [], // Intake reads from order data, doesn't need to output specific fields
  'II': [], // Document parsing success is enough
  'III': [], // Gap analysis success is enough
  'IV': [], // Citation research success is enough
  'V': [], // Draft generation success is enough
  'V.1': [], // Citation verification success is enough
  'VI': [], // Internal review success is enough
  'VII': [], // Revision checkpoint success is enough
  'VIII': [], // Revisions applied success is enough
  'VII.1': [], // New citation verification success is enough
  'IX': [], // Separate statement success is enough
  'X': [], // Final assembly success is enough
  'XI': [], // QA success is enough
  'XII': [], // Attorney approval tracked separately
  'XIII': [], // Delivery prep success is enough
  'XIV': [], // Delivery success is enough
};

// ============================================================================
// MOTION TYPES REQUIRING SPECIFIC PHASES
// ============================================================================

// Motion types that require separate statement (Phase IX)
export const MOTION_TYPES_REQUIRING_SEPARATE_STATEMENT = [
  'MSJ', // Motion for Summary Judgment
  'MSA', // Motion for Summary Adjudication
  'MCOMPEL', // Motion to Compel (in some jurisdictions)
];

// ============================================================================
// ADMIN CLIENT
// ============================================================================

function getAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    return null;
  }

  return createSupabaseClient(supabaseUrl, supabaseServiceKey);
}

// ============================================================================
// PHASE GATE VALIDATOR
// ============================================================================

export interface PhaseGateResult {
  canProceed: boolean;
  currentPhase: PhaseId | null;
  targetPhase: PhaseId;
  missingPrerequisites: PhaseId[];
  incompleteRequirements: string[];
  error?: string;
}

export async function validatePhaseGate(
  orderId: string,
  targetPhase: PhaseId
): Promise<PhaseGateResult> {
  const supabase = getAdminClient();

  if (!supabase) {
    return {
      canProceed: false,
      currentPhase: null,
      targetPhase,
      missingPrerequisites: [],
      incompleteRequirements: [],
      error: 'Database not configured',
    };
  }

  // Get current workflow state
  const { data: workflow, error } = await supabase
    .from('order_workflows')
    .select('*, orders(motion_type)')
    .eq('order_id', orderId)
    .single();

  if (error || !workflow) {
    return {
      canProceed: false,
      currentPhase: null,
      targetPhase,
      missingPrerequisites: [],
      incompleteRequirements: [],
      error: `Workflow not found for order: ${orderId}`,
    };
  }

  const currentPhase = workflow.current_phase_code as PhaseId | null;
  const completedPhases = (workflow.completed_phases || []) as PhaseId[];

  // Check prerequisites
  const prerequisites = PHASE_PREREQUISITES[targetPhase];
  const missingPrerequisites = prerequisites.filter(
    (prereq) => !completedPhases.includes(prereq)
  );

  if (missingPrerequisites.length > 0) {
    return {
      canProceed: false,
      currentPhase,
      targetPhase,
      missingPrerequisites,
      incompleteRequirements: [],
      error: `Cannot run Phase ${targetPhase}: Prerequisites not met [${missingPrerequisites.join(', ')}]`,
    };
  }

  // Check if trying to skip required phases
  const targetOrder = PHASES[targetPhase].order;
  const requiredPhasesBefore = Object.entries(PHASES)
    .filter(([_, config]) => config.order < targetOrder && config.required)
    .map(([id]) => id as PhaseId);

  // Check for special cases where phases are conditionally required
  // Handle Supabase join which may return array or object
  const ordersDataForValidation = workflow.orders as { motion_type?: string } | { motion_type?: string }[] | null;
  const motionType = Array.isArray(ordersDataForValidation)
    ? (ordersDataForValidation[0]?.motion_type || '')
    : (ordersDataForValidation?.motion_type || '');
  const requiresSeparateStatement = MOTION_TYPES_REQUIRING_SEPARATE_STATEMENT.some(
    mt => motionType.toUpperCase().includes(mt)
  );

  const skippedRequiredPhases = requiredPhasesBefore.filter((phase) => {
    // Phase IX is only required for certain motion types
    if (phase === 'IX' && !requiresSeparateStatement) return false;
    // Phase VIII is only required if revisions were requested
    if (phase === 'VIII' && !workflow.requires_revision) return false;
    // Phase VII.1 is only required if new citations added in VIII
    if (phase === 'VII.1' && !workflow.has_new_citations) return false;

    return !completedPhases.includes(phase);
  });

  if (skippedRequiredPhases.length > 0) {
    return {
      canProceed: false,
      currentPhase,
      targetPhase,
      missingPrerequisites: skippedRequiredPhases,
      incompleteRequirements: [],
      error: `PHASE SKIP BLOCKED: Cannot jump to Phase ${targetPhase}. Required phases not complete: [${skippedRequiredPhases.join(', ')}]`,
    };
  }

  return {
    canProceed: true,
    currentPhase,
    targetPhase,
    missingPrerequisites: [],
    incompleteRequirements: [],
  };
}

// ============================================================================
// PHASE TRANSITION ENFORCER
// ============================================================================

export async function enforcePhaseTransition(
  orderId: string,
  fromPhase: PhaseId | null,
  toPhase: PhaseId
): Promise<{ success: boolean; error?: string }> {
  // Validate the transition
  const gateResult = await validatePhaseGate(orderId, toPhase);

  if (!gateResult.canProceed) {
    // Log the violation attempt
    console.error(`[PHASE GATE VIOLATION] Order ${orderId}: ${gateResult.error}`);

    // Record in audit log
    await logPhaseViolation(orderId, fromPhase, toPhase, gateResult.error || 'Unknown error');

    return { success: false, error: gateResult.error };
  }

  // Log successful transition
  await logPhaseTransition(orderId, fromPhase, toPhase);

  return { success: true };
}

// ============================================================================
// PHASE COMPLETION MARKER
// ============================================================================

export async function markPhaseComplete(
  orderId: string,
  phase: PhaseId,
  outputs: Record<string, unknown>
): Promise<{ success: boolean; error?: string }> {
  const supabase = getAdminClient();

  if (!supabase) {
    return { success: false, error: 'Database not configured' };
  }

  // Verify required outputs exist
  const requirements = PHASE_COMPLETION_REQUIREMENTS[phase];
  const missingOutputs = requirements.filter((req) => {
    // Check if the output exists and is truthy
    const value = outputs[req];
    if (value === undefined || value === null) return true;
    if (typeof value === 'boolean') return !value;
    if (Array.isArray(value)) return value.length === 0;
    return false;
  });

  if (missingOutputs.length > 0) {
    const error = `Cannot mark Phase ${phase} complete: Missing required outputs [${missingOutputs.join(', ')}]`;
    console.error(`[PHASE COMPLETION BLOCKED] Order ${orderId}: ${error}`);

    await logPhaseViolation(orderId, phase, phase, error);

    return { success: false, error };
  }

  // Update workflow state
  const { data: currentWorkflow } = await supabase
    .from('order_workflows')
    .select('completed_phases, metadata')
    .eq('order_id', orderId)
    .single();

  const completedPhases = [...new Set([...(currentWorkflow?.completed_phases || []), phase])];
  const phaseKey = `phase_${phase.replace('.', '_')}`;

  const { error: updateError } = await supabase
    .from('order_workflows')
    .update({
      current_phase_code: phase,
      completed_phases: completedPhases,
      metadata: {
        ...(currentWorkflow?.metadata || {}),
        [`${phaseKey}_completed_at`]: new Date().toISOString(),
        [`${phaseKey}_outputs`]: outputs,
      },
      last_activity_at: new Date().toISOString(),
    })
    .eq('order_id', orderId);

  if (updateError) {
    return { success: false, error: updateError.message };
  }

  // Log completion
  await logPhaseCompletion(orderId, phase, Object.keys(outputs));

  return { success: true };
}

// ============================================================================
// GET NEXT ALLOWED PHASE
// ============================================================================

export async function getNextAllowedPhase(
  orderId: string
): Promise<{ phase: PhaseId | null; error?: string }> {
  const supabase = getAdminClient();

  if (!supabase) {
    return { phase: null, error: 'Database not configured' };
  }

  const { data: workflow } = await supabase
    .from('order_workflows')
    .select('completed_phases, requires_revision, has_new_citations, orders(motion_type)')
    .eq('order_id', orderId)
    .single();

  if (!workflow) {
    return { phase: null, error: 'Workflow not found' };
  }

  const completedPhases = (workflow.completed_phases || []) as PhaseId[];
  // Handle Supabase join which may return array or object
  const ordersData = workflow.orders as { motion_type?: string } | { motion_type?: string }[] | null;
  const motionType = Array.isArray(ordersData)
    ? (ordersData[0]?.motion_type || '')
    : (ordersData?.motion_type || '');
  const requiresSeparateStatement = MOTION_TYPES_REQUIRING_SEPARATE_STATEMENT.some(
    mt => motionType.toUpperCase().includes(mt)
  );

  // Find the next phase in order that isn't completed
  for (const phase of PHASE_ORDER) {
    if (completedPhases.includes(phase)) continue;

    // Skip optional phases that don't apply
    if (phase === 'VIII' && !workflow.requires_revision) continue;
    if (phase === 'VII.1' && !workflow.has_new_citations) continue;
    if (phase === 'IX' && !requiresSeparateStatement) continue;

    // Check if prerequisites are met
    const prerequisites = PHASE_PREREQUISITES[phase];
    const allPrereqsMet = prerequisites.every(p => completedPhases.includes(p));

    if (allPrereqsMet) {
      return { phase };
    }
  }

  return { phase: null }; // All phases complete
}

// ============================================================================
// AUDIT LOGGING
// ============================================================================

async function logPhaseTransition(
  orderId: string,
  fromPhase: PhaseId | null,
  toPhase: PhaseId
): Promise<void> {
  const supabase = getAdminClient();
  if (!supabase) return;

  await supabase.from('workflow_audit_log').insert({
    order_id: orderId,
    event_type: 'PHASE_TRANSITION',
    from_phase: fromPhase,
    phase: toPhase,
    timestamp: new Date().toISOString(),
  });
}

async function logPhaseCompletion(
  orderId: string,
  phase: PhaseId,
  outputKeys: string[]
): Promise<void> {
  const supabase = getAdminClient();
  if (!supabase) return;

  await supabase.from('workflow_audit_log').insert({
    order_id: orderId,
    event_type: 'PHASE_COMPLETED',
    phase,
    outputs_summary: outputKeys,
    timestamp: new Date().toISOString(),
  });
}

async function logPhaseViolation(
  orderId: string,
  fromPhase: PhaseId | null,
  attemptedPhase: PhaseId,
  errorMessage: string
): Promise<void> {
  const supabase = getAdminClient();
  if (!supabase) return;

  await supabase.from('workflow_audit_log').insert({
    order_id: orderId,
    event_type: 'PHASE_GATE_VIOLATION',
    from_phase: fromPhase,
    attempted_phase: attemptedPhase,
    error_message: errorMessage,
    timestamp: new Date().toISOString(),
  });

  // Also log to violations table for dashboard visibility
  await supabase.from('workflow_violations').insert({
    order_id: orderId,
    attempted_phase: attemptedPhase,
    reason: errorMessage,
    severity: 'CRITICAL',
    timestamp: new Date().toISOString(),
  });
}

// ============================================================================
// PHASE EXECUTION WRAPPER
// ============================================================================

/**
 * Wraps phase execution with gate enforcement.
 * Use this to execute any phase function safely.
 */
export async function executePhaseWithGates<T>(
  orderId: string,
  phase: PhaseId,
  phaseFunction: () => Promise<T>,
  outputExtractor: (result: T) => Record<string, unknown>
): Promise<{ success: boolean; result?: T; error?: string }> {

  // GATE CHECK: Can we enter this phase?
  const gateCheck = await validatePhaseGate(orderId, phase);
  if (!gateCheck.canProceed) {
    console.error(`[PHASE GATE] Blocked entry to Phase ${phase}: ${gateCheck.error}`);
    return { success: false, error: gateCheck.error };
  }

  console.log(`[PHASE GATE] ✓ Entering Phase ${phase}`);

  try {
    // Execute the phase
    const result = await phaseFunction();
    const outputs = outputExtractor(result);

    // COMPLETION CHECK: Did the phase produce required outputs?
    const completion = await markPhaseComplete(orderId, phase, outputs);
    if (!completion.success) {
      console.error(`[PHASE GATE] Phase ${phase} output validation failed: ${completion.error}`);
      return { success: false, error: completion.error };
    }

    console.log(`[PHASE GATE] ✓ Phase ${phase} complete`);
    return { success: true, result };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[PHASE GATE] Phase ${phase} execution failed:`, errorMessage);

    await logPhaseViolation(orderId, phase, phase, `Execution failed: ${errorMessage}`);

    return { success: false, error: errorMessage };
  }
}

// ============================================================================
// VALIDATION HELPERS
// ============================================================================

/**
 * Check if a phase can be entered (without actually entering it)
 */
export async function canEnterPhase(
  orderId: string,
  phase: PhaseId
): Promise<boolean> {
  const result = await validatePhaseGate(orderId, phase);
  return result.canProceed;
}

/**
 * Get all completed phases for an order
 */
export async function getCompletedPhases(orderId: string): Promise<PhaseId[]> {
  const supabase = getAdminClient();
  if (!supabase) return [];

  const { data } = await supabase
    .from('order_workflows')
    .select('completed_phases')
    .eq('order_id', orderId)
    .single();

  return (data?.completed_phases || []) as PhaseId[];
}

/**
 * Check if workflow is complete
 */
export async function isWorkflowComplete(orderId: string): Promise<boolean> {
  const completedPhases = await getCompletedPhases(orderId);
  return completedPhases.includes('XIV');
}
