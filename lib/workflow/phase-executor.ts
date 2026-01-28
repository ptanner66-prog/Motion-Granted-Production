// /lib/workflow/phase-executor.ts
// Phase execution orchestrator with HOLD and Protocol 10 integration
// VERSION: 2.0 — January 28, 2026

import { createClient } from '@/lib/supabase/server';
import {
  Phase,
  PHASES,
  OrderContext,
  shouldSkipPhase,
  getNextPhase,
  isUserCheckpoint,
  isProtocol10Triggered,
  FAILURE_THRESHOLDS,
} from '@/lib/config/workflow-config';
import { triggerHold } from '@/lib/workflow/hold-service';
import { checkAndHandleRevisionLoop } from '@/lib/workflow/revision-loop';

export interface PhaseExecutionResult {
  success: boolean;
  phase: Phase;
  output?: Record<string, unknown>;
  nextPhase: Phase | null;
  checkpointTriggered: boolean;
  holdTriggered: boolean;
  holdReason?: string;
  protocol10Triggered: boolean;
  error?: string;
  durationMs: number;
}

export interface ExecutePhaseParams {
  orderId: string;
  workflowId: string;
  phase: Phase;
  orderContext: OrderContext;
  input: Record<string, unknown>;
}

/**
 * Execute a single workflow phase with HOLD and checkpoint handling
 */
export async function executePhase(params: ExecutePhaseParams): Promise<PhaseExecutionResult> {
  const { orderId, workflowId, phase, orderContext, input } = params;
  const startTime = Date.now();
  const supabase = await createClient();

  try {
    // Check if phase should be skipped
    const skipCheck = shouldSkipPhase(phase, orderContext);
    if (skipCheck.skip) {
      console.log(`[PhaseExecutor] Skipping phase ${phase}: ${skipCheck.reason}`);
      const nextPhase = getNextPhase(phase, orderContext);
      return {
        success: true,
        phase,
        nextPhase,
        checkpointTriggered: false,
        holdTriggered: false,
        protocol10Triggered: false,
        durationMs: Date.now() - startTime,
      };
    }

    // Log phase start
    await supabase.from('workflow_events').insert({
      order_id: orderId,
      workflow_id: workflowId,
      event_type: 'PHASE_STARTED',
      phase,
      data: { input_keys: Object.keys(input) },
      created_at: new Date().toISOString(),
    });

    // Update order current phase
    await supabase
      .from('orders')
      .update({ current_phase: phase, updated_at: new Date().toISOString() })
      .eq('id', orderId);

    // Execute phase logic (placeholder for actual API call)
    const phaseOutput = await executePhaseLogic(phase, orderContext, input);

    // Check for critical issues that require HOLD
    const holdCheck = await checkForHoldConditions(orderId, phase, phaseOutput);
    if (holdCheck.shouldHold) {
      const holdResult = await triggerHold(orderId, phase, holdCheck.reason);
      return {
        success: false,
        phase,
        output: phaseOutput,
        nextPhase: null,
        checkpointTriggered: false,
        holdTriggered: true,
        holdReason: holdCheck.reason,
        protocol10Triggered: false,
        durationMs: Date.now() - startTime,
      };
    }

    // Check for revision loop (Phase VII/VIII)
    if (phase === 'VII' || phase === 'VIII') {
      const loopResult = await checkAndHandleRevisionLoop(orderId, workflowId);
      if (loopResult.protocol10Triggered) {
        return {
          success: true,
          phase,
          output: phaseOutput,
          nextPhase: 'X', // Skip to final phase with disclosure
          checkpointTriggered: false,
          holdTriggered: false,
          protocol10Triggered: true,
          durationMs: Date.now() - startTime,
        };
      }
    }

    // Log phase completion
    await supabase.from('workflow_events').insert({
      order_id: orderId,
      workflow_id: workflowId,
      event_type: 'PHASE_COMPLETED',
      phase,
      data: { output_keys: Object.keys(phaseOutput) },
      created_at: new Date().toISOString(),
    });

    // Check for user checkpoint
    const checkpointTriggered = isUserCheckpoint(phase);
    if (checkpointTriggered) {
      await supabase.from('workflow_events').insert({
        order_id: orderId,
        workflow_id: workflowId,
        event_type: 'CHECKPOINT_TRIGGERED',
        phase,
        data: { checkpoint_type: getCheckpointType(phase) },
        created_at: new Date().toISOString(),
      });
    }

    const nextPhase = checkpointTriggered ? null : getNextPhase(phase, orderContext);

    return {
      success: true,
      phase,
      output: phaseOutput,
      nextPhase,
      checkpointTriggered,
      holdTriggered: false,
      protocol10Triggered: false,
      durationMs: Date.now() - startTime,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[PhaseExecutor] Phase ${phase} failed:`, errorMessage);

    await supabase.from('workflow_events').insert({
      order_id: orderId,
      workflow_id: workflowId,
      event_type: 'PHASE_FAILED',
      phase,
      data: { error: errorMessage },
      created_at: new Date().toISOString(),
    });

    return {
      success: false,
      phase,
      nextPhase: null,
      checkpointTriggered: false,
      holdTriggered: false,
      protocol10Triggered: false,
      error: errorMessage,
      durationMs: Date.now() - startTime,
    };
  }
}

/**
 * Execute phase-specific logic
 */
async function executePhaseLogic(
  phase: Phase,
  orderContext: OrderContext,
  input: Record<string, unknown>
): Promise<Record<string, unknown>> {
  // This would call the appropriate API/service for each phase
  // Placeholder implementation - actual logic varies by phase
  console.log(`[PhaseExecutor] Executing phase ${phase} logic`);
  return { completed: true, phase, timestamp: new Date().toISOString() };
}

/**
 * Check for conditions that should trigger HOLD
 */
async function checkForHoldConditions(
  orderId: string,
  phase: Phase,
  phaseOutput: Record<string, unknown>
): Promise<{ shouldHold: boolean; reason: string }> {
  // Check for critical gaps or missing evidence
  const criticalGaps = phaseOutput.critical_gaps as string[] | undefined;
  if (criticalGaps && criticalGaps.length > 0) {
    return {
      shouldHold: true,
      reason: `Critical gaps identified: ${criticalGaps.join(', ')}`,
    };
  }

  // Check for missing declarations
  const missingDeclarations = phaseOutput.missing_declarations as string[] | undefined;
  if (missingDeclarations && missingDeclarations.length > 0) {
    return {
      shouldHold: true,
      reason: `Missing declarations: ${missingDeclarations.join(', ')}`,
    };
  }

  return { shouldHold: false, reason: '' };
}

/**
 * Get checkpoint type for a phase
 */
function getCheckpointType(phase: Phase): string {
  const checkpointTypes: Record<Phase, string> = {
    'I': 'none',
    'II': 'none',
    'III': 'none',
    'IV': 'CP1_FACTS_REVIEW',
    'V': 'none',
    'V.1': 'none',
    'VI': 'none',
    'VII': 'CP2_DRAFT_REVIEW',
    'VII.1': 'none',
    'VIII': 'none',
    'VIII.5': 'none',
    'IX': 'none',
    'IX.1': 'none',
    'X': 'CP3_FINAL_DELIVERY',
  };
  return checkpointTypes[phase] || 'none';
}

/**
 * Get progress percentage for a phase
 */
export function getPhaseProgress(currentPhase: Phase, orderContext: OrderContext): number {
  const allPhases = PHASES.filter(p => !shouldSkipPhase(p, orderContext).skip);
  const currentIndex = allPhases.indexOf(currentPhase);
  if (currentIndex === -1) return 0;
  return Math.round(((currentIndex + 1) / allPhases.length) * 100);
}

/**
 * Validate phase transition
 */
export function isValidPhaseTransition(from: Phase, to: Phase, orderContext: OrderContext): boolean {
  const expectedNext = getNextPhase(from, orderContext);
  if (expectedNext === to) return true;

  // Allow jumping to X for Protocol 10
  if (to === 'X') return true;

  // Allow revision loops: VIII -> VII
  if (from === 'VIII' && to === 'VII') return true;

  return false;
}
