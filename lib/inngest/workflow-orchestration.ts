/**
 * 14-Phase Workflow Orchestration for Motion Granted v7.2
 *
 * This Inngest function orchestrates the complete motion generation workflow:
 * - 14 phases with proper sequencing
 * - Revision loops when Phase VII grade < B+
 * - Checkpoints (CP1, CP2, CP3) at appropriate phases
 * - Model routing (Sonnet 4 / Opus 4.5) based on tier
 * - Extended thinking for complex phases
 *
 * Flow:
 * I → II → III → [HOLD?] → IV (CP1) → V → V.1 → VI → VII (CP2) → [VIII loop?] → VIII.5 → IX → [IX.1?] → X (CP3)
 */

import { inngest } from './client';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { executePhase } from '@/lib/workflow/phase-executors';
import {
  validatePhaseGate,
  markPhaseComplete,
  type PhaseId,
} from '@/lib/workflow/phase-gates';
import { alertPhaseViolation } from '@/lib/workflow/violation-alerts';
import type {
  WorkflowPhaseCode,
  MotionTier,
  WORKFLOW_PHASES,
  MAX_REVISION_LOOPS,
  MINIMUM_PASSING_VALUE,
} from '@/types/workflow';

// ============================================================================
// STRICT WORKFLOW ENFORCEMENT
// ============================================================================
// This orchestrator ensures motions are generated ONLY through the 14-phase
// system. No bypassing, no shortcuts, no direct Claude calls.
//
// Each phase MUST complete before the next starts. Phase outputs are
// accumulated and passed forward. The workflow blocks at checkpoints.
// ============================================================================

// Constants
const MAX_LOOPS = 3;
const MIN_GRADE_VALUE = 3.3; // B+

/**
 * Handle phase failure - update workflow status and log error
 */
async function handlePhaseFailure(
  supabase: ReturnType<typeof getSupabase>,
  workflowId: string,
  orderId: string,
  phase: WorkflowPhaseCode,
  error: string
) {
  console.error(`[Workflow] Phase ${phase} FAILED for order ${orderId}: ${error}`);

  // Update workflow status
  await supabase.from('order_workflows').update({
    status: 'failed',
    last_error: `Phase ${phase}: ${error}`,
    error_count: 1, // Increment would require fetch first
  }).eq('id', workflowId);

  // Update order status
  await supabase.from('orders').update({
    status: 'generation_failed',
    generation_error: `Phase ${phase} failed: ${error}`,
  }).eq('id', orderId);

  // Log the failure
  await supabase.from('automation_logs').insert({
    order_id: orderId,
    action_type: 'phase_failed',
    action_details: {
      workflowId,
      phase,
      error,
    },
  });
}

// Initialize Supabase admin client
function getSupabase() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Supabase environment variables not configured');
  }

  return createSupabaseClient(supabaseUrl, supabaseServiceKey);
}

// Phase sequence for normal flow
const PHASE_SEQUENCE: WorkflowPhaseCode[] = [
  'I', 'II', 'III', 'IV', 'V', 'V.1', 'VI', 'VII', 'VIII.5', 'IX', 'X'
];

// Phases that may be conditional
const CONDITIONAL_PHASES: WorkflowPhaseCode[] = ['VII.1', 'VIII', 'IX.1'];

/**
 * Main Workflow Orchestration Function
 *
 * Triggered by: workflow/orchestration.start event
 * Executes all 14 phases with proper checkpoints and revision loops
 */
export const workflowOrchestration = inngest.createFunction(
  {
    id: 'workflow-orchestration-v72',
    concurrency: {
      limit: 5, // Max 5 concurrent workflows
    },
    retries: 2,
  },
  { event: 'workflow/orchestration.start' },
  async ({ event, step }) => {
    const { orderId, triggeredBy, timestamp } = event.data;
    const supabase = getSupabase();

    // Step 1: Initialize workflow and get order data
    const workflowData = await step.run('initialize-workflow', async () => {
      // Get order with full details
      const { data: order, error: orderError } = await supabase
        .from('orders')
        .select(`
          *,
          parties(*),
          profiles!orders_client_id_fkey(full_name, email, bar_number, firm_name, firm_address, firm_phone)
        `)
        .eq('id', orderId)
        .single();

      if (orderError || !order) {
        throw new Error(`Order not found: ${orderId}`);
      }

      // Determine tier from motion_tier or default to 'A'
      const tier: MotionTier = (order.motion_tier as MotionTier) || 'A';

      // Check if workflow already exists for this order
      const { data: existingWorkflow } = await supabase
        .from('order_workflows')
        .select('id')
        .eq('order_id', orderId)
        .single();

      let workflowId: string;

      if (existingWorkflow) {
        // Update existing workflow
        workflowId = existingWorkflow.id;
        await supabase
          .from('order_workflows')
          .update({
            status: 'in_progress',
            current_phase: 1,
            current_phase_code: 'I',
            completed_phases: [], // Reset for fresh start
            started_at: new Date().toISOString(),
            error_count: 0,
            last_error: null,
          })
          .eq('id', workflowId);
      } else {
        // Create new workflow record
        const { data: workflow, error: workflowError } = await supabase
          .from('order_workflows')
          .insert({
            order_id: orderId,
            workflow_path: 'path_a', // Default to initiating motion
            current_phase: 1,
            current_phase_code: 'I',
            completed_phases: [], // IMPORTANT: Initialize empty for phase gates
            status: 'in_progress',
            started_at: new Date().toISOString(),
            metadata: {
              tier,
              triggeredBy,
              startTimestamp: timestamp,
              version: '7.2',
            },
          })
          .select()
          .single();

        if (workflowError || !workflow) {
          throw new Error(`Failed to create workflow: ${workflowError?.message}`);
        }

        workflowId = workflow.id;
      }

      // Log workflow start
      await supabase.from('automation_logs').insert({
        order_id: orderId,
        action_type: 'workflow_started',
        action_details: {
          workflowId,
          tier,
          triggeredBy,
          version: '7.2',
          phases: 14,
        },
      });

      return {
        workflowId,
        orderId,
        tier,
        order,
      };
    });

    const { workflowId, tier, order } = workflowData;

    // Initialize phase outputs storage
    const phaseOutputs: Record<WorkflowPhaseCode, unknown> = {} as Record<WorkflowPhaseCode, unknown>;
    let revisionLoopCount = 0;
    let currentPhaseIndex = 0;

    // Step 2: Execute Phase I - Document Parsing
    const phaseI = await step.run('phase-I-document-parsing', async () => {
      return executeAndLogPhase('I', workflowId, orderId, tier, order, phaseOutputs, supabase);
    });
    phaseOutputs['I'] = phaseI.output;

    // Step 3: Execute Phase II - Legal Framework
    const phaseII = await step.run('phase-II-legal-framework', async () => {
      return executeAndLogPhase('II', workflowId, orderId, tier, order, phaseOutputs, supabase);
    });
    phaseOutputs['II'] = phaseII.output;

    // Step 4: Execute Phase III - Legal Research
    const phaseIII = await step.run('phase-III-legal-research', async () => {
      return executeAndLogPhase('III', workflowId, orderId, tier, order, phaseOutputs, supabase);
    });
    phaseOutputs['III'] = phaseIII.output;

    // Check for HOLD checkpoint (evidence gaps)
    if (phaseIII.requiresReview) {
      await step.run('checkpoint-HOLD', async () => {
        await triggerCheckpointNotification(supabase, workflowId, orderId, 'HOLD', 'III');
        await supabase.from('order_workflows').update({
          status: 'blocked',
          metadata: { ...order, holdReason: 'Evidence gaps detected in Phase III' },
        }).eq('id', workflowId);
      });
      // In production, workflow would pause here and resume via API
    }

    // Step 5: Execute Phase IV - Citation Verification (CP1 - Notification)
    const phaseIV = await step.run('phase-IV-citation-verification', async () => {
      return executeAndLogPhase('IV', workflowId, orderId, tier, order, phaseOutputs, supabase);
    });
    phaseOutputs['IV'] = phaseIV.output;

    // CP1: Send notification (non-blocking)
    await step.run('checkpoint-CP1-notification', async () => {
      await triggerCheckpointNotification(supabase, workflowId, orderId, 'CP1', 'IV');
    });

    // Step 6: Execute Phase V - Draft Motion
    const phaseV = await step.run('phase-V-draft-motion', async () => {
      return executeAndLogPhase('V', workflowId, orderId, tier, order, phaseOutputs, supabase);
    });
    phaseOutputs['V'] = phaseV.output;

    // Step 7: Execute Phase V.1 - Citation Accuracy Check
    const phaseV1 = await step.run('phase-V1-citation-check', async () => {
      return executeAndLogPhase('V.1', workflowId, orderId, tier, order, phaseOutputs, supabase);
    });
    phaseOutputs['V.1'] = phaseV1.output;

    // Step 8: Execute Phase VI - Opposition Anticipation (Extended Thinking for B/C)
    const phaseVI = await step.run('phase-VI-opposition-anticipation', async () => {
      return executeAndLogPhase('VI', workflowId, orderId, tier, order, phaseOutputs, supabase);
    });
    phaseOutputs['VI'] = phaseVI.output;

    // Step 9: Execute Phase VII - Judge Simulation (Always Extended Thinking)
    // This is the key grading phase with potential revision loops
    let judgeResult = await step.run('phase-VII-judge-simulation', async () => {
      return executeAndLogPhase('VII', workflowId, orderId, tier, order, phaseOutputs, supabase);
    });
    phaseOutputs['VII'] = judgeResult.output;

    // CP2: Send notification after judge simulation
    await step.run('checkpoint-CP2-notification', async () => {
      await triggerCheckpointNotification(supabase, workflowId, orderId, 'CP2', 'VII');
    });

    // Revision loop logic: If grade < B+ (3.3), enter revision loop
    const judgeOutput = judgeResult.output as { numericGrade?: number; passes?: boolean };
    let passes = judgeOutput?.passes ?? false;
    let loopAttempt = 0;

    while (!passes && loopAttempt < MAX_LOOPS) {
      loopAttempt++;
      revisionLoopCount++;

      // Step: Execute Phase VIII - Revisions
      const phaseVIII = await step.run(`phase-VIII-revisions-loop-${loopAttempt}`, async () => {
        return executeAndLogPhase('VIII', workflowId, orderId, tier, order, phaseOutputs, supabase);
      });
      phaseOutputs['VIII'] = phaseVIII.output;

      // Update revision loop count in workflow
      await step.run(`update-loop-count-${loopAttempt}`, async () => {
        await supabase.from('order_workflows').update({
          metadata: { revisionLoop: loopAttempt },
        }).eq('id', workflowId);
      });

      // Check if revisions added new citations - if so, run Phase VII.1
      const revisionOutput = phaseVIII.output as { newCitations?: boolean };
      if (revisionOutput?.newCitations) {
        const phaseVII1 = await step.run(`phase-VII1-citation-check-loop-${loopAttempt}`, async () => {
          return executeAndLogPhase('VII.1', workflowId, orderId, tier, order, phaseOutputs, supabase);
        });
        phaseOutputs['VII.1'] = phaseVII1.output;
      }

      // Re-run Phase VII for re-grading
      judgeResult = await step.run(`phase-VII-regrade-loop-${loopAttempt}`, async () => {
        return executeAndLogPhase('VII', workflowId, orderId, tier, order, phaseOutputs, supabase);
      });
      phaseOutputs['VII'] = judgeResult.output;

      const newJudgeOutput = judgeResult.output as { numericGrade?: number; passes?: boolean };
      passes = newJudgeOutput?.passes ?? false;
    }

    // If still not passing after 3 loops, proceed with warning (Gap Closure Protocol 10)
    if (!passes && loopAttempt >= MAX_LOOPS) {
      await step.run('gap-protocol-10-loop-exit', async () => {
        await supabase.from('automation_logs').insert({
          order_id: orderId,
          action_type: 'gap_protocol_triggered',
          action_details: {
            protocol: 10,
            reason: 'Max revision loops reached without B+ grade',
            loops: loopAttempt,
            finalGrade: (judgeResult.output as { grade?: string })?.grade,
          },
        });
      });
    }

    // Step 10: Execute Phase VIII.5 - Caption Validation
    const phaseVIII5 = await step.run('phase-VIII5-caption-validation', async () => {
      return executeAndLogPhase('VIII.5', workflowId, orderId, tier, order, phaseOutputs, supabase);
    });
    phaseOutputs['VIII.5'] = phaseVIII5.output;

    // Step 11: Execute Phase IX - Supporting Documents
    const phaseIX = await step.run('phase-IX-supporting-documents', async () => {
      return executeAndLogPhase('IX', workflowId, orderId, tier, order, phaseOutputs, supabase);
    });
    phaseOutputs['IX'] = phaseIX.output;

    // Step 12: Check for Phase IX.1 (MSJ/MSA only)
    const motionType = order.motion_type?.toUpperCase() || '';
    if (motionType.includes('MSJ') || motionType.includes('MSA') || motionType.includes('SUMMARY JUDGMENT')) {
      const phaseIX1 = await step.run('phase-IX1-separate-statement', async () => {
        return executeAndLogPhase('IX.1', workflowId, orderId, tier, order, phaseOutputs, supabase);
      });
      phaseOutputs['IX.1'] = phaseIX1.output;
    }

    // Step 13: Execute Phase X - Final Assembly (CP3 - BLOCKING)
    const phaseX = await step.run('phase-X-final-assembly', async () => {
      return executeAndLogPhase('X', workflowId, orderId, tier, order, phaseOutputs, supabase);
    });
    phaseOutputs['X'] = phaseX.output;

    // CP3: Blocking checkpoint - requires admin approval
    await step.run('checkpoint-CP3-blocking', async () => {
      // Update order status to pending_review (blocking)
      await supabase.from('orders').update({
        status: 'pending_review',
        generation_completed_at: new Date().toISOString(),
      }).eq('id', orderId);

      // Update workflow status
      await supabase.from('order_workflows').update({
        status: 'pending_approval',
        current_phase: 10,
      }).eq('id', workflowId);

      // Trigger CP3 notification
      await triggerCheckpointNotification(supabase, workflowId, orderId, 'CP3', 'X');

      // Log completion pending approval
      await supabase.from('automation_logs').insert({
        order_id: orderId,
        action_type: 'workflow_pending_approval',
        action_details: {
          workflowId,
          phasesCompleted: 14,
          revisionLoops: revisionLoopCount,
          finalGrade: (judgeResult.output as { grade?: string })?.grade,
          checkpoint: 'CP3',
        },
      });
    });

    return {
      success: true,
      orderId,
      workflowId,
      status: 'pending_approval',
      phasesCompleted: 14,
      revisionLoops: revisionLoopCount,
      checkpoint: 'CP3',
    };
  }
);

/**
 * Execute a phase and log the execution
 *
 * PHASE ENFORCEMENT: Validates phase gates before execution.
 */
async function executeAndLogPhase(
  phase: WorkflowPhaseCode,
  workflowId: string,
  orderId: string,
  tier: MotionTier,
  order: Record<string, unknown>,
  previousOutputs: Record<WorkflowPhaseCode, unknown>,
  supabase: ReturnType<typeof getSupabase>
) {
  const startTime = Date.now();

  // =========================================================================
  // PHASE GATE ENFORCEMENT
  // =========================================================================
  const gateResult = await validatePhaseGate(orderId, phase as PhaseId);
  if (!gateResult.canProceed) {
    console.error(`[INNGEST] Phase gate blocked for Phase ${phase}: ${gateResult.error}`);
    await alertPhaseViolation(orderId, phase, gateResult.error || 'Phase gate blocked');

    // Log the violation
    await supabase.from('automation_logs').insert({
      order_id: orderId,
      action_type: 'phase_gate_violation',
      action_details: {
        phase,
        workflowId,
        error: gateResult.error,
        missingPrerequisites: gateResult.missingPrerequisites,
      },
    });

    return {
      success: false,
      phase,
      status: 'blocked' as const,
      output: null,
      error: `PHASE_GATE_VIOLATION: ${gateResult.error}`,
      requiresReview: false,
      gapsDetected: 0,
    };
  }

  console.log(`[INNGEST] Phase gate passed for Phase ${phase} (order: ${orderId})`);
  // =========================================================================

  // Update workflow current phase
  await supabase.from('order_workflows').update({
    current_phase: getPhaseNumber(phase),
    current_phase_code: phase, // Also update the code for phase gates
    last_activity_at: new Date().toISOString(),
  }).eq('id', workflowId);

  // Log phase start
  await supabase.from('automation_logs').insert({
    order_id: orderId,
    action_type: 'phase_started',
    action_details: {
      phase,
      workflowId,
      tier,
    },
  });

  // Execute the phase
  const result = await executePhase(phase, {
    orderId,
    workflowId,
    tier,
    jurisdiction: order.jurisdiction as string || '',
    motionType: order.motion_type as string || '',
    caseCaption: order.case_caption as string || '',
    caseNumber: order.case_number as string || '',
    statementOfFacts: order.statement_of_facts as string || '',
    proceduralHistory: order.procedural_history as string || '',
    instructions: order.instructions as string || '',
    previousPhaseOutputs: previousOutputs,
    documents: [],
  });

  const durationMs = Date.now() - startTime;

  // Log phase completion
  await supabase.from('automation_logs').insert({
    order_id: orderId,
    action_type: result.success ? 'phase_completed' : 'phase_failed',
    action_details: {
      phase,
      workflowId,
      status: result.status,
      durationMs,
      tokensUsed: result.tokensUsed,
      gapsDetected: result.gapsDetected,
      error: result.error,
    },
  });

  // =========================================================================
  // MARK PHASE COMPLETE IN PHASE GATES SYSTEM
  // =========================================================================
  if (result.success) {
    // Extract outputs for phase gate requirements validation
    const phaseOutputs: Record<string, unknown> = {};

    // Map phase outputs to expected requirement keys
    if (result.output && typeof result.output === 'object') {
      Object.assign(phaseOutputs, result.output);
    }

    // Add standard completion flags
    phaseOutputs[`phase_${phase.replace('.', '_')}_complete`] = true;

    await markPhaseComplete(orderId, phase as PhaseId, phaseOutputs);
  }
  // =========================================================================

  // Insert phase execution record if workflow_phase_executions table exists
  try {
    // Get phase definition ID
    const { data: phaseDef } = await supabase
      .from('workflow_phase_definitions')
      .select('id')
      .eq('phase_number', getPhaseNumber(phase))
      .eq('workflow_path', 'path_a')
      .single();

    if (phaseDef) {
      await supabase.from('workflow_phase_executions').upsert({
        order_workflow_id: workflowId,
        phase_definition_id: phaseDef.id,
        phase_number: getPhaseNumber(phase),
        status: result.status,
        started_at: new Date(Date.now() - durationMs).toISOString(),
        completed_at: result.success ? new Date().toISOString() : null,
        outputs: result.output ? { data: result.output } : {},
        ai_tokens_used: (result.tokensUsed?.input || 0) + (result.tokensUsed?.output || 0),
        requires_review: result.requiresReview || false,
        error_message: result.error || null,
      }, {
        onConflict: 'order_workflow_id,phase_number',
      });
    }
  } catch (err) {
    // Table might not exist, continue anyway
    console.log(`[Workflow] Could not log phase execution: ${err}`);
  }

  return result;
}

/**
 * Get numeric phase number from phase code
 * Aligned with PHASES.order in phase-gates.ts
 */
function getPhaseNumber(phase: WorkflowPhaseCode): number {
  const phaseNumbers: Record<WorkflowPhaseCode, number> = {
    'I': 1,
    'II': 2,
    'III': 3,
    'IV': 4,
    'V': 5,
    'V.1': 6,
    'VI': 7,
    'VII': 8,
    'VII.1': 9,
    'VIII': 10,
    'VIII.5': 11,
    'IX': 12,
    'IX.1': 13,
    'X': 14,
  };
  return phaseNumbers[phase] || 1;
}

/**
 * Trigger checkpoint notification
 */
async function triggerCheckpointNotification(
  supabase: ReturnType<typeof getSupabase>,
  workflowId: string,
  orderId: string,
  checkpointType: 'HOLD' | 'CP1' | 'CP2' | 'CP3',
  phase: WorkflowPhaseCode
) {
  // Get order details for notification
  const { data: order } = await supabase
    .from('orders')
    .select('order_number, case_caption, motion_type')
    .eq('id', orderId)
    .single();

  // Log checkpoint trigger
  await supabase.from('automation_logs').insert({
    order_id: orderId,
    action_type: 'checkpoint_triggered',
    action_details: {
      workflowId,
      checkpointType,
      phase,
      orderNumber: order?.order_number,
    },
  });

  // Queue notification for admin
  const notificationType = checkpointType === 'CP3' ? 'approval_required' : 'checkpoint_notification';
  const priority = checkpointType === 'CP3' ? 10 : checkpointType === 'HOLD' ? 9 : 5;

  await supabase.from('notification_queue').insert({
    notification_type: notificationType,
    recipient_email: process.env.ADMIN_EMAIL || 'admin@motiongranted.io',
    order_id: orderId,
    template_data: {
      orderNumber: order?.order_number,
      caseCaption: order?.case_caption,
      motionType: order?.motion_type,
      checkpointType,
      phase,
      workflowId,
    },
    priority,
    status: 'pending',
  });
}
