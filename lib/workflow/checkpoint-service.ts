/**
 * Checkpoint Service
 *
 * v6.3 Implementation: Manages the three customer checkpoints in the workflow.
 *
 * CHECKPOINTS:
 * - CP1 (After Phase 4 - Research): Customer reviews research direction
 * - CP2 (After Phase 8 - Judge Sim): Customer approves draft or requests revisions
 * - CP3 (After Phase 12 - Assembly): Customer confirms receipt of final package
 *
 * REVISION PRICING (SACRED NUMBERS):
 * - 1 free revision included with every order
 * - Tier A: $75 per additional revision
 * - Tier B: $125 per additional revision
 * - Tier C: $200 per additional revision
 * - Maximum 3 revision loops before escalation
 */

import { createClient } from '@/lib/supabase/server';
import type { OperationResult } from '@/types/automation';

// ============================================================================
// TYPES
// ============================================================================

export type CheckpointType = 'CP1' | 'CP2' | 'CP3' | 'HOLD';

export interface CheckpointData {
  checkpoint: CheckpointType;
  status: 'pending' | 'approved' | 'changes_requested' | 'revisions_requested' | 'confirmed';
  triggeredAt: string;
  respondedAt?: string;
  customerResponse?: {
    action: string;
    notes?: string;
    respondedAt: string;
  };
  // CP-specific data populated based on checkpoint type
  [key: string]: unknown;
}

export interface CheckpointResponse {
  checkpoint: CheckpointType;
  action: 'continue' | 'request_changes' | 'approve' | 'request_revisions' | 'confirm_receipt';
  notes?: string;
}

export interface RevisionInfo {
  round: number;
  freeRemaining: number;
  paidRemaining: number;
  pricePerRevision: number;
  maxAllowed: number;
  totalUsed: number;
}

export interface JudgeSimulationInfo {
  grade: string | null;
  gradeNumeric: number | null;
  passed: boolean;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const CHECKPOINT_STATUSES: Record<CheckpointType, string> = {
  'CP1': 'awaiting_cp1',
  'CP2': 'awaiting_cp2',
  'CP3': 'awaiting_cp3',
  'HOLD': 'on_hold',
};

const CHECKPOINT_PHASES: Record<CheckpointType, number> = {
  'CP1': 4,  // After Authority Research
  'CP2': 8,  // After Judge Simulation
  'CP3': 12, // After Final Assembly
  'HOLD': 3, // Phase III - when critical evidence missing
};

// HOLD checkpoint response types (Protocol 8)
export type HoldResponseType =
  | 'PROVIDE_ADDITIONAL_EVIDENCE'  // Customer uploads more docs
  | 'PROCEED_WITH_ACKNOWLEDGMENT'  // Customer confirms risk understood
  | 'CANCEL_ORDER';                // Full refund issued

export interface HoldCheckpointData extends CheckpointData {
  holdReason: string;
  missingEvidence: string[];
  documentGap: string;
  riskAssessment: string;
  holdTriggeredAt: string;
  reminderSentAt?: string;
  escalatedAt?: string;
  autoCancelScheduledAt?: string;
}

export interface HoldResponse {
  responseType: HoldResponseType;
  acknowledgmentText?: string; // Required for PROCEED_WITH_ACKNOWLEDGMENT
  newDocumentIds?: string[];   // Required for PROVIDE_ADDITIONAL_EVIDENCE
}

// ============================================================================
// TRIGGER CHECKPOINT
// ============================================================================

/**
 * Trigger a checkpoint pause
 * The workflow stops and waits for customer action
 */
export async function triggerCheckpoint(
  workflowId: string,
  checkpoint: CheckpointType,
  data: Partial<CheckpointData>
): Promise<OperationResult> {
  const supabase = await createClient();

  try {
    const checkpointData: CheckpointData = {
      checkpoint,
      status: 'pending',
      triggeredAt: new Date().toISOString(),
      ...data,
    };

    const { error } = await supabase
      .from('order_workflows')
      .update({
        status: CHECKPOINT_STATUSES[checkpoint],
        checkpoint_pending: checkpoint,
        checkpoint_data: checkpointData,
        last_checkpoint_at: new Date().toISOString(),
      })
      .eq('id', workflowId);

    if (error) {
      return { success: false, error: error.message };
    }

    // Create handoff file for checkpoint
    await createCheckpointHandoff(workflowId, checkpoint, checkpointData);

    // TODO: Send notification email to customer
    console.log(`[CHECKPOINT] ${checkpoint} triggered for workflow ${workflowId}`);

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to trigger checkpoint',
    };
  }
}

// ============================================================================
// GET CHECKPOINT DATA
// ============================================================================

/**
 * Get checkpoint data for display to customer
 */
export async function getCheckpointData(
  workflowId: string
): Promise<OperationResult<CheckpointData | null>> {
  const supabase = await createClient();

  try {
    const { data: workflow, error } = await supabase
      .from('order_workflows')
      .select(`
        id,
        checkpoint_pending,
        checkpoint_data,
        revision_count,
        free_revisions_used,
        paid_revisions_used,
        judge_sim_grade,
        judge_sim_grade_numeric,
        judge_sim_passed,
        revision_loop_count,
        orders(order_number, case_caption),
        motion_types(tier, revision_price, free_revisions_included, max_revisions)
      `)
      .eq('id', workflowId)
      .single();

    if (error) {
      return { success: false, error: error.message };
    }

    if (!workflow.checkpoint_pending) {
      return { success: true, data: null };
    }

    const checkpointData = workflow.checkpoint_data as CheckpointData;

    // Add revision info for CP2
    if (workflow.checkpoint_pending === 'CP2') {
      const motionType = workflow.motion_types as {
        tier: string;
        revision_price: number;
        free_revisions_included: number;
        max_revisions: number;
      };

      checkpointData.revisionInfo = {
        round: workflow.revision_count || 0,
        freeRemaining: Math.max(0, (motionType?.free_revisions_included || 1) - (workflow.free_revisions_used || 0)),
        paidRemaining: Math.max(0, (motionType?.max_revisions || 3) - (workflow.revision_count || 0)),
        pricePerRevision: motionType?.revision_price || 200,
        maxAllowed: motionType?.max_revisions || 3,
        totalUsed: workflow.revision_count || 0,
      } as RevisionInfo;

      checkpointData.judgeSimulation = {
        grade: workflow.judge_sim_grade,
        gradeNumeric: workflow.judge_sim_grade_numeric,
        passed: workflow.judge_sim_passed,
      } as JudgeSimulationInfo;
    }

    // Add order info
    const orders = workflow.orders as { order_number: string; case_caption: string } | null;
    if (orders) {
      checkpointData.orderNumber = orders.order_number;
      checkpointData.caseCaption = orders.case_caption;
    }

    return { success: true, data: checkpointData };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get checkpoint data',
    };
  }
}

// ============================================================================
// PROCESS CHECKPOINT RESPONSE
// ============================================================================

/**
 * Process customer response to checkpoint
 */
export async function processCheckpointResponse(
  workflowId: string,
  response: CheckpointResponse
): Promise<OperationResult<{ nextPhase: number; requiresPayment?: boolean; paymentUrl?: string; revisionId?: string }>> {
  const supabase = await createClient();

  try {
    const { data: workflow, error: wfError } = await supabase
      .from('order_workflows')
      .select(`*, motion_types(*), orders(id, order_number)`)
      .eq('id', workflowId)
      .single();

    if (wfError || !workflow) {
      return { success: false, error: 'Workflow not found' };
    }

    if (workflow.checkpoint_pending !== response.checkpoint) {
      return {
        success: false,
        error: `Checkpoint mismatch. Expected ${workflow.checkpoint_pending}, got ${response.checkpoint}`,
      };
    }

    switch (response.checkpoint) {
      case 'CP1':
        return await processCP1Response(workflow, response);
      case 'CP2':
        return await processCP2Response(workflow, response);
      case 'CP3':
        return await processCP3Response(workflow, response);
      default:
        return { success: false, error: 'Invalid checkpoint type' };
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to process checkpoint response',
    };
  }
}

// ============================================================================
// CP1 HANDLER: Research Review
// ============================================================================

/**
 * Process CP1 response
 * Actions: 'continue' → Phase 5, 'request_changes' → Phase 4
 */
async function processCP1Response(
  workflow: Record<string, unknown>,
  response: CheckpointResponse
): Promise<OperationResult<{ nextPhase: number }>> {
  const supabase = await createClient();

  const checkpointData = workflow.checkpoint_data as CheckpointData;
  checkpointData.status = response.action === 'continue' ? 'approved' : 'changes_requested';
  checkpointData.respondedAt = new Date().toISOString();
  checkpointData.customerResponse = {
    action: response.action,
    notes: response.notes,
    respondedAt: new Date().toISOString(),
  };

  // Append to checkpoint responses array
  const existingResponses = (workflow.checkpoint_responses as unknown[]) || [];
  existingResponses.push({
    checkpoint: 'CP1',
    response: checkpointData.customerResponse,
    timestamp: new Date().toISOString(),
  });

  const nextPhase = response.action === 'continue' ? 5 : 4;

  const { error } = await supabase
    .from('order_workflows')
    .update({
      status: 'in_progress',
      checkpoint_pending: null,
      checkpoint_data: checkpointData,
      checkpoint_responses: existingResponses,
      current_phase: nextPhase,
      last_activity_at: new Date().toISOString(),
    })
    .eq('id', workflow.id);

  if (error) {
    return { success: false, error: error.message };
  }

  console.log(`[CP1] Processed: action=${response.action}, nextPhase=${nextPhase}`);
  return { success: true, data: { nextPhase } };
}

// ============================================================================
// CP2 HANDLER: Draft Review / Revisions
// ============================================================================

/**
 * Process CP2 response
 * Actions: 'approve' → Phase 10, 'request_revisions' → Phase 9 (check free vs paid)
 */
async function processCP2Response(
  workflow: Record<string, unknown>,
  response: CheckpointResponse
): Promise<OperationResult<{ nextPhase: number; requiresPayment?: boolean; paymentUrl?: string; revisionId?: string }>> {
  const supabase = await createClient();

  const checkpointData = workflow.checkpoint_data as CheckpointData;
  checkpointData.respondedAt = new Date().toISOString();
  checkpointData.customerResponse = {
    action: response.action,
    notes: response.notes,
    respondedAt: new Date().toISOString(),
  };

  // Append to checkpoint responses
  const existingResponses = (workflow.checkpoint_responses as unknown[]) || [];
  existingResponses.push({
    checkpoint: 'CP2',
    response: checkpointData.customerResponse,
    timestamp: new Date().toISOString(),
  });

  if (response.action === 'approve') {
    // Customer approves draft - proceed to Phase 10 (Caption Validation)
    checkpointData.status = 'approved';

    const { error } = await supabase
      .from('order_workflows')
      .update({
        status: 'in_progress',
        checkpoint_pending: null,
        checkpoint_data: checkpointData,
        checkpoint_responses: existingResponses,
        current_phase: 10, // Phase 10: Caption Validation
        last_activity_at: new Date().toISOString(),
      })
      .eq('id', workflow.id);

    if (error) {
      return { success: false, error: error.message };
    }

    console.log(`[CP2] Approved: proceeding to phase 10`);
    return { success: true, data: { nextPhase: 10 } };
  } else {
    // Customer requested revisions
    checkpointData.status = 'revisions_requested';

    const motionType = workflow.motion_types as {
      tier: string;
      revision_price: number;
      free_revisions_included: number;
      max_revisions: number;
    };

    const freeUsed = (workflow.free_revisions_used as number) || 0;
    const freeIncluded = motionType?.free_revisions_included || 1;
    const totalUsed = (workflow.revision_count as number) || 0;
    const maxAllowed = motionType?.max_revisions || 3;
    const revisionLoopCount = (workflow.revision_loop_count as number) || 0;

    // Check if max revisions reached
    if (totalUsed >= maxAllowed) {
      return {
        success: false,
        error: `Maximum revisions (${maxAllowed}) reached. Please contact support for additional options.`,
      };
    }

    // Check if we should escalate (3 failed revision loops)
    if (revisionLoopCount >= 3) {
      // Create escalation
      await supabase
        .from('order_workflows')
        .update({
          status: 'blocked',
          last_error: 'ESCALATION: 3 revision loops failed to meet quality threshold. Requires admin review.',
        })
        .eq('id', workflow.id);

      return {
        success: false,
        error: 'This order has been escalated for admin review after 3 revision attempts.',
      };
    }

    const isFreeRevision = freeUsed < freeIncluded;

    if (isFreeRevision) {
      // Free revision - proceed immediately to Phase 9
      const { data: revision, error: revError } = await supabase
        .from('workflow_revisions')
        .insert({
          order_workflow_id: workflow.id,
          revision_number: totalUsed + 1,
          revision_type: 'free',
          tier: motionType?.tier || 'B',
          charge_amount: 0,
          payment_status: 'not_required',
          customer_notes: response.notes || '',
          status: 'in_progress',
          started_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (revError) {
        return { success: false, error: revError.message };
      }

      const { error } = await supabase
        .from('order_workflows')
        .update({
          status: 'revision_in_progress',
          checkpoint_pending: null,
          checkpoint_data: checkpointData,
          checkpoint_responses: existingResponses,
          current_phase: 9, // Phase 9: Revisions
          revision_count: totalUsed + 1,
          free_revisions_used: freeUsed + 1,
          revision_loop_count: revisionLoopCount + 1,
          last_activity_at: new Date().toISOString(),
        })
        .eq('id', workflow.id);

      if (error) {
        return { success: false, error: error.message };
      }

      console.log(`[CP2] Free revision: proceeding to phase 9`);
      return { success: true, data: { nextPhase: 9 } };
    } else {
      // Paid revision - require payment first
      const revisionPrice = motionType?.revision_price || 200;

      const { data: revision, error: revError } = await supabase
        .from('workflow_revisions')
        .insert({
          order_workflow_id: workflow.id,
          revision_number: totalUsed + 1,
          revision_type: 'paid',
          tier: motionType?.tier || 'B',
          charge_amount: revisionPrice,
          payment_status: 'pending',
          customer_notes: response.notes || '',
          status: 'pending',
        })
        .select()
        .single();

      if (revError) {
        return { success: false, error: revError.message };
      }

      const { error } = await supabase
        .from('order_workflows')
        .update({
          status: 'revision_requested',
          checkpoint_data: {
            ...checkpointData,
            pendingRevisionId: revision.id,
            pendingRevisionPrice: revisionPrice,
          },
          checkpoint_responses: existingResponses,
          last_activity_at: new Date().toISOString(),
        })
        .eq('id', workflow.id);

      if (error) {
        return { success: false, error: error.message };
      }

      // Generate payment URL
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://motiongranted.com';
      const paymentUrl = `${baseUrl}/api/workflow/revisions/checkout?workflowId=${workflow.id}`;

      console.log(`[CP2] Paid revision required: $${revisionPrice}, revisionId=${revision.id}`);
      return {
        success: true,
        data: {
          nextPhase: 9,
          requiresPayment: true,
          paymentUrl,
          revisionId: revision.id,
        },
      };
    }
  }
}

// ============================================================================
// CP3 HANDLER: Delivery Confirmation
// ============================================================================

/**
 * Process CP3 response
 * Actions: 'confirm_receipt' → completed
 */
async function processCP3Response(
  workflow: Record<string, unknown>,
  response: CheckpointResponse
): Promise<OperationResult<{ nextPhase: number }>> {
  const supabase = await createClient();

  if (response.action !== 'confirm_receipt') {
    return { success: false, error: 'Invalid CP3 action. Must confirm receipt.' };
  }

  const checkpointData = workflow.checkpoint_data as CheckpointData;
  checkpointData.status = 'confirmed';
  checkpointData.respondedAt = new Date().toISOString();
  checkpointData.customerResponse = {
    action: response.action,
    notes: response.notes,
    respondedAt: new Date().toISOString(),
  };

  // Append to checkpoint responses
  const existingResponses = (workflow.checkpoint_responses as unknown[]) || [];
  existingResponses.push({
    checkpoint: 'CP3',
    response: checkpointData.customerResponse,
    timestamp: new Date().toISOString(),
  });

  const { error } = await supabase
    .from('order_workflows')
    .update({
      status: 'completed',
      checkpoint_pending: null,
      checkpoint_data: checkpointData,
      checkpoint_responses: existingResponses,
      completed_at: new Date().toISOString(),
    })
    .eq('id', workflow.id);

  if (error) {
    return { success: false, error: error.message };
  }

  // Also mark the order as completed
  await supabase
    .from('orders')
    .update({
      status: 'completed',
      updated_at: new Date().toISOString(),
    })
    .eq('id', workflow.order_id);

  console.log(`[CP3] Order completed: workflow=${workflow.id}`);
  return { success: true, data: { nextPhase: -1 } }; // -1 indicates complete
}

// ============================================================================
// REVISION PAYMENT
// ============================================================================

/**
 * Process revision payment completion (called by Stripe webhook)
 */
export async function processRevisionPayment(
  workflowId: string,
  revisionId: string,
  paymentIntentId: string
): Promise<OperationResult> {
  const supabase = await createClient();

  try {
    // Update revision record
    await supabase
      .from('workflow_revisions')
      .update({
        payment_status: 'completed',
        stripe_payment_intent_id: paymentIntentId,
        paid_at: new Date().toISOString(),
        status: 'in_progress',
        started_at: new Date().toISOString(),
      })
      .eq('id', revisionId);

    // Get revision details
    const { data: revision } = await supabase
      .from('workflow_revisions')
      .select('revision_number, charge_amount')
      .eq('id', revisionId)
      .single();

    // Get workflow details
    const { data: workflow } = await supabase
      .from('order_workflows')
      .select('revision_count, paid_revisions_used, revision_total_charged, revision_loop_count')
      .eq('id', workflowId)
      .single();

    // Update workflow
    const { error } = await supabase
      .from('order_workflows')
      .update({
        status: 'revision_in_progress',
        checkpoint_pending: null,
        current_phase: 9, // Phase 9: Revisions
        revision_count: (workflow?.revision_count || 0) + 1,
        paid_revisions_used: (workflow?.paid_revisions_used || 0) + 1,
        revision_total_charged: (workflow?.revision_total_charged || 0) + (revision?.charge_amount || 0),
        revision_loop_count: (workflow?.revision_loop_count || 0) + 1,
        last_activity_at: new Date().toISOString(),
      })
      .eq('id', workflowId);

    if (error) {
      return { success: false, error: error.message };
    }

    console.log(`[PAYMENT] Revision payment processed: workflow=${workflowId}, revision=${revisionId}`);
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to process revision payment',
    };
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Create handoff file for checkpoint
 */
async function createCheckpointHandoff(
  workflowId: string,
  checkpoint: CheckpointType,
  data: CheckpointData
): Promise<void> {
  const supabase = await createClient();

  const { data: workflow } = await supabase
    .from('order_workflows')
    .select('current_phase')
    .eq('id', workflowId)
    .single();

  await supabase.from('handoff_files').insert({
    order_workflow_id: workflowId,
    phase_number: workflow?.current_phase || CHECKPOINT_PHASES[checkpoint],
    phase_name: `Checkpoint ${checkpoint}`,
    handoff_type: 'checkpoint',
    content: {
      checkpoint,
      data,
      timestamp: new Date().toISOString(),
    },
  });
}

/**
 * Check if a phase is a checkpoint
 */
export function isCheckpointPhase(phaseNumber: number, workflowPath: string): CheckpointType | null {
  // CP1 is after phase 4, CP2 after phase 8, CP3 after phase 12
  if (phaseNumber === 4) return 'CP1';
  if (phaseNumber === 8) return 'CP2';
  if (phaseNumber === 12) return 'CP3';
  return null;
}

// ============================================================================
// HOLD CHECKPOINT (Protocol 8)
// Triggered at Phase III when critical evidence is missing
// ============================================================================

/**
 * Trigger HOLD checkpoint when critical evidence is missing
 * Customer has 3 options:
 * 1. PROVIDE_ADDITIONAL_EVIDENCE - Upload more documents
 * 2. PROCEED_WITH_ACKNOWLEDGMENT - Confirm risk understood
 * 3. CANCEL_ORDER - Full refund
 *
 * Timers:
 * - 48hr reminder email
 * - 7-day admin escalation
 * - 14-day auto-cancel with refund
 */
export async function triggerHoldCheckpoint(
  workflowId: string,
  reason: string,
  missingEvidence: string[],
  documentGap: string,
  riskAssessment: string
): Promise<OperationResult> {
  const supabase = await createClient();

  try {
    const now = new Date();
    const reminderAt = new Date(now.getTime() + 48 * 60 * 60 * 1000); // 48 hours
    const escalationAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days
    const autoCancelAt = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000); // 14 days

    const holdData: HoldCheckpointData = {
      checkpoint: 'HOLD',
      status: 'pending',
      triggeredAt: now.toISOString(),
      holdReason: reason,
      missingEvidence,
      documentGap,
      riskAssessment,
      holdTriggeredAt: now.toISOString(),
      autoCancelScheduledAt: autoCancelAt.toISOString(),
    };

    // Update workflow to HOLD status
    const { error: wfError } = await supabase
      .from('order_workflows')
      .update({
        status: 'on_hold',
        checkpoint_pending: 'HOLD',
        checkpoint_data: holdData,
        hold_triggered_at: now.toISOString(),
        hold_reason: reason,
        last_checkpoint_at: now.toISOString(),
      })
      .eq('id', workflowId);

    if (wfError) {
      return { success: false, error: wfError.message };
    }

    // Get workflow and order info for notifications
    const { data: workflow } = await supabase
      .from('order_workflows')
      .select('order_id, orders(order_number, client_id, profiles!orders_client_id_fkey(email, full_name))')
      .eq('id', workflowId)
      .single();

    // Log the HOLD event
    await supabase.from('automation_logs').insert({
      order_id: workflow?.order_id,
      action_type: 'hold_checkpoint_triggered',
      action_details: {
        workflowId,
        reason,
        missingEvidence,
        documentGap,
        riskAssessment,
        reminderScheduledAt: reminderAt.toISOString(),
        escalationScheduledAt: escalationAt.toISOString(),
        autoCancelScheduledAt: autoCancelAt.toISOString(),
      },
    });

    // Schedule timers via Inngest
    try {
      const { inngest } = await import('@/lib/inngest/client');

      // 48hr reminder
      await inngest.send({
        name: 'workflow/hold.reminder',
        data: {
          workflowId,
          orderId: workflow?.order_id,
          reminderType: '48hr',
        },
        ts: reminderAt.getTime(),
      });

      // 7-day escalation
      await inngest.send({
        name: 'workflow/hold.escalation',
        data: {
          workflowId,
          orderId: workflow?.order_id,
        },
        ts: escalationAt.getTime(),
      });

      // 14-day auto-cancel
      await inngest.send({
        name: 'workflow/hold.auto-cancel',
        data: {
          workflowId,
          orderId: workflow?.order_id,
        },
        ts: autoCancelAt.getTime(),
      });
    } catch (inngestError) {
      console.error('[HOLD] Failed to schedule timers:', inngestError);
      // Continue - timers are nice-to-have, not critical
    }

    // Send HOLD notification email to customer
    try {
      const { sendHoldNotification } = await import('@/lib/email/email-triggers');

      const ordersData = workflow?.orders as { order_number?: string; client_id?: string; profiles?: { email?: string } | { email?: string }[] } | null;
      const profileData = Array.isArray(ordersData?.profiles) ? ordersData?.profiles?.[0] : ordersData?.profiles;
      const customerEmail = profileData?.email;

      if (customerEmail && ordersData?.order_number) {
        await sendHoldNotification(
          {
            orderId: workflow?.order_id || '',
            orderNumber: ordersData.order_number,
            customerEmail,
          },
          reason,
          missingEvidence || []
        );
        console.log(`[HOLD] Notification email sent to ${customerEmail}`);
      }
    } catch (emailError) {
      console.error('[HOLD] Failed to send notification email:', emailError);
      // Non-blocking — email failure should never prevent HOLD from working
    }

    // Create handoff file
    await createCheckpointHandoff(workflowId, 'HOLD', holdData);

    console.log(`[HOLD] Triggered for workflow ${workflowId}: ${reason}`);
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to trigger HOLD checkpoint',
    };
  }
}

/**
 * Process customer response to HOLD checkpoint
 */
export async function processHoldResponse(
  workflowId: string,
  response: HoldResponse
): Promise<OperationResult<{ nextAction: string; refundInitiated?: boolean }>> {
  const supabase = await createClient();

  try {
    const { data: workflow, error: wfError } = await supabase
      .from('order_workflows')
      .select('*, orders(id, order_number, total_price, stripe_payment_intent_id)')
      .eq('id', workflowId)
      .single();

    if (wfError || !workflow) {
      return { success: false, error: 'Workflow not found' };
    }

    if (workflow.checkpoint_pending !== 'HOLD') {
      return { success: false, error: 'Workflow is not currently on HOLD' };
    }

    // Phase-lock: HOLD checkpoint is only valid during Phase III
    if (workflow.current_phase !== 3 && workflow.current_phase_code !== 'III') {
      console.error(`[HOLD] Stale HOLD response — workflow ${workflowId} is now in Phase ${workflow.current_phase_code || workflow.current_phase}, not Phase III`);
      return { success: false, error: 'HOLD_PHASE_MISMATCH' };
    }

    const now = new Date().toISOString();
    const checkpointData = workflow.checkpoint_data as HoldCheckpointData;

    switch (response.responseType) {
      case 'PROVIDE_ADDITIONAL_EVIDENCE': {
        if (!response.newDocumentIds || response.newDocumentIds.length === 0) {
          return { success: false, error: 'Document IDs required for PROVIDE_ADDITIONAL_EVIDENCE' };
        }

        // Update workflow - resume from Phase III
        await supabase
          .from('order_workflows')
          .update({
            status: 'in_progress',
            checkpoint_pending: null,
            hold_response: 'PROVIDE_ADDITIONAL_EVIDENCE',
            hold_response_at: now,
            checkpoint_data: {
              ...checkpointData,
              status: 'approved',
              respondedAt: now,
              customerResponse: {
                action: 'PROVIDE_ADDITIONAL_EVIDENCE',
                newDocumentIds: response.newDocumentIds,
                respondedAt: now,
              },
            },
            current_phase: 3, // Resume at Phase III with new evidence
            last_activity_at: now,
          })
          .eq('id', workflowId);

        // Log the response
        await supabase.from('automation_logs').insert({
          order_id: workflow.order_id,
          action_type: 'hold_response_additional_evidence',
          action_details: {
            workflowId,
            newDocumentIds: response.newDocumentIds,
          },
        });

        console.log(`[HOLD] Additional evidence provided for workflow ${workflowId}`);
        return { success: true, data: { nextAction: 'resume_phase_3' } };
      }

      case 'PROCEED_WITH_ACKNOWLEDGMENT': {
        if (!response.acknowledgmentText) {
          return { success: false, error: 'Acknowledgment text required for PROCEED_WITH_ACKNOWLEDGMENT' };
        }

        // Update workflow - proceed with risk acknowledged
        await supabase
          .from('order_workflows')
          .update({
            status: 'in_progress',
            checkpoint_pending: null,
            hold_response: 'PROCEED_WITH_ACKNOWLEDGMENT',
            hold_response_at: now,
            hold_acknowledgment_text: response.acknowledgmentText,
            checkpoint_data: {
              ...checkpointData,
              status: 'approved',
              respondedAt: now,
              customerResponse: {
                action: 'PROCEED_WITH_ACKNOWLEDGMENT',
                acknowledgmentText: response.acknowledgmentText,
                respondedAt: now,
              },
            },
            current_phase: 4, // Proceed to Phase IV
            last_activity_at: now,
          })
          .eq('id', workflowId);

        // Log the response
        await supabase.from('automation_logs').insert({
          order_id: workflow.order_id,
          action_type: 'hold_response_proceed_acknowledged',
          action_details: {
            workflowId,
            acknowledgmentText: response.acknowledgmentText,
            riskAccepted: true,
          },
        });

        console.log(`[HOLD] Risk acknowledged for workflow ${workflowId}`);
        return { success: true, data: { nextAction: 'proceed_phase_4' } };
      }

      case 'CANCEL_ORDER': {
        // Initiate full refund
        const order = workflow.orders as { id: string; order_number: string; total_price: number; stripe_payment_intent_id: string };

        // Update workflow to cancelled
        await supabase
          .from('order_workflows')
          .update({
            status: 'cancelled',
            checkpoint_pending: null,
            hold_response: 'CANCEL_ORDER',
            hold_response_at: now,
            checkpoint_data: {
              ...checkpointData,
              status: 'cancelled',
              respondedAt: now,
              customerResponse: {
                action: 'CANCEL_ORDER',
                respondedAt: now,
              },
            },
            completed_at: now,
          })
          .eq('id', workflowId);

        // Update order status
        await supabase
          .from('orders')
          .update({
            status: 'cancelled',
            updated_at: now,
          })
          .eq('id', workflow.order_id);

        // Create refund record
        await supabase.from('refunds').insert({
          order_id: workflow.order_id,
          amount_cents: Math.round(order.total_price * 100),
          reason: 'HOLD_CHECKPOINT_CANCEL',
          refund_type: 'FULL',
          status: 'pending',
        });

        // Log the cancellation
        await supabase.from('automation_logs').insert({
          order_id: workflow.order_id,
          action_type: 'hold_response_cancelled',
          action_details: {
            workflowId,
            refundAmount: order.total_price,
            reason: 'Customer cancelled at HOLD checkpoint',
          },
        });

        console.log(`[HOLD] Order cancelled at HOLD checkpoint for workflow ${workflowId}`);
        return { success: true, data: { nextAction: 'cancelled', refundInitiated: true } };
      }

      default:
        return { success: false, error: 'Invalid HOLD response type' };
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to process HOLD response',
    };
  }
}
