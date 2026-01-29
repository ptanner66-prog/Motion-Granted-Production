// /lib/workflow/revision-handler.ts
// Revision loop tracking and Protocol 10 handling
// VERSION: 1.0 — January 28, 2026

import { createClient } from '@/lib/supabase/server';
import { MAX_REVISION_LOOPS, type LetterGrade as Grade } from '@/types/workflow';
import { FAILURE_THRESHOLDS, isProtocol10Triggered } from '@/lib/config/workflow-config';

// Helper functions
function shouldTriggerProtocol10(revisionCount: number): boolean {
  return isProtocol10Triggered(revisionCount);
}

function generateProtocol10Disclosure(revisionCount: number, grade?: string): string {
  return `DISCLOSURE (Per Protocol 10):
This motion underwent ${revisionCount} revision cycles during automated QA.
${grade ? `Final automated review grade: ${grade}.` : ''}
Attorney review is recommended before filing.
This disclosure is provided for transparency per Motion Granted's quality protocols.`;
}

async function getRevisionLoopStatus(orderId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from('orders')
    .select('revision_count, protocol_10_triggered_at')
    .eq('id', orderId)
    .single();
  const count = data?.revision_count || 0;
  return { count, max: MAX_REVISION_LOOPS, remaining: Math.max(0, 3 - count), triggered: !!data?.protocol_10_triggered_at };
}

function scoreToGrade(score: number): Grade {
  if (score >= 97) return 'A+';
  if (score >= 93) return 'A';
  if (score >= 90) return 'A-';
  if (score >= 87) return 'B+';
  if (score >= 83) return 'B';
  if (score >= 80) return 'B-';
  if (score >= 77) return 'C+';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}

export interface RevisionResult {
  orderId: string;
  workflowId?: string;
  revisionCount: number;
  protocol10Triggered: boolean;
  disclosure?: string;
  shouldContinue: boolean;
}

export interface RevisionStatus {
  currentLoop: number;
  maxLoops: number;
  remainingLoops: number;
  protocol10Triggered: boolean;
  disclosure: string | null;
}

/**
 * Increment revision count and check for Protocol 10
 */
export async function incrementRevisionCount(
  orderId: string,
  lastGrade: Grade | number,
  workflowId?: string
): Promise<RevisionResult> {
  const supabase = await createClient();
  const now = new Date().toISOString();

  // Get current revision count from order
  const { data: order, error: fetchError } = await supabase
    .from('orders')
    .select('revision_count, protocol_10_triggered')
    .eq('id', orderId)
    .single();

  if (fetchError || !order) {
    throw new Error(`Failed to fetch order ${orderId}: ${fetchError?.message}`);
  }

  // Already triggered Protocol 10 - don't increment further
  if (order.protocol_10_triggered) {
    return {
      orderId,
      workflowId,
      revisionCount: order.revision_count || 0,
      protocol10Triggered: true,
      shouldContinue: false,
    };
  }

  const newCount = (order.revision_count || 0) + 1;
  const gradeString = typeof lastGrade === 'number' ? scoreToGrade(lastGrade) : lastGrade;

  // Check if Protocol 10 should trigger
  if (shouldTriggerProtocol10(newCount)) {
    const disclosure = generateProtocol10Disclosure(newCount, gradeString);

    // Update order with Protocol 10 flag and disclosure
    const { error: updateError } = await supabase
      .from('orders')
      .update({
        revision_count: newCount,
        protocol_10_triggered: true,
        protocol_10_disclosure: disclosure,
        updated_at: now,
      })
      .eq('id', orderId);

    if (updateError) {
      throw new Error(`Failed to update order: ${updateError.message}`);
    }

    // Update workflow if provided
    if (workflowId) {
      await supabase
        .from('order_workflows')
        .update({
          current_loop_count: newCount,
          max_loops_reached: true,
          loop_exit_triggered_at: now,
          protocol_10_disclosure: disclosure,
        })
        .eq('id', workflowId);
    }

    // Log Protocol 10 event
    await supabase
      .from('workflow_events')
      .insert({
        order_id: orderId,
        workflow_id: workflowId || null,
        event_type: 'PROTOCOL_10_TRIGGERED',
        phase: 'VIII',
        data: {
          revision_count: newCount,
          last_grade: gradeString,
          disclosure_added: true,
          triggered_at: now,
        },
        created_at: now,
      });

    console.log(`[RevisionHandler] Protocol 10 triggered for order ${orderId} after ${newCount} revisions`);

    return {
      orderId,
      workflowId,
      revisionCount: newCount,
      protocol10Triggered: true,
      disclosure,
      shouldContinue: false, // Skip further revisions, proceed to delivery
    };
  }

  // Normal revision - increment and continue
  const { error: updateError } = await supabase
    .from('orders')
    .update({
      revision_count: newCount,
      updated_at: now,
    })
    .eq('id', orderId);

  if (updateError) {
    throw new Error(`Failed to update revision count: ${updateError.message}`);
  }

  // Update workflow if provided
  if (workflowId) {
    await supabase
      .from('order_workflows')
      .update({
        current_loop_count: newCount,
      })
      .eq('id', workflowId);
  }

  // Log revision event
  await supabase
    .from('workflow_events')
    .insert({
      order_id: orderId,
      workflow_id: workflowId || null,
      event_type: 'REVISION_LOOP_INCREMENT',
      phase: 'VIII',
      data: {
        revision_count: newCount,
        last_grade: gradeString,
        remaining_loops: MAX_REVISION_LOOPS - newCount,
      },
      created_at: now,
    });

  console.log(`[RevisionHandler] Order ${orderId} revision ${newCount}/${MAX_REVISION_LOOPS}`);

  return {
    orderId,
    workflowId,
    revisionCount: newCount,
    protocol10Triggered: false,
    shouldContinue: true, // Continue with revisions
  };
}

/**
 * Get revision status for an order
 */
export async function getRevisionStatus(orderId: string): Promise<RevisionStatus | null> {
  const supabase = await createClient();

  const { data: order, error } = await supabase
    .from('orders')
    .select('revision_count, protocol_10_triggered, protocol_10_disclosure')
    .eq('id', orderId)
    .single();

  if (error || !order) {
    return null;
  }

  const count = order.revision_count || 0;

  return {
    currentLoop: count,
    maxLoops: MAX_REVISION_LOOPS,
    remainingLoops: Math.max(0, MAX_REVISION_LOOPS - count),
    protocol10Triggered: order.protocol_10_triggered || false,
    disclosure: order.protocol_10_disclosure || null,
  };
}

/**
 * Get revision status from workflow
 */
export async function getWorkflowRevisionStatus(workflowId: string): Promise<RevisionStatus | null> {
  const supabase = await createClient();

  const { data: workflow, error } = await supabase
    .from('order_workflows')
    .select('current_loop_count, max_loops_reached, protocol_10_disclosure')
    .eq('id', workflowId)
    .single();

  if (error || !workflow) {
    return null;
  }

  const count = workflow.current_loop_count || 0;

  return {
    currentLoop: count,
    maxLoops: MAX_REVISION_LOOPS,
    remainingLoops: Math.max(0, MAX_REVISION_LOOPS - count),
    protocol10Triggered: workflow.max_loops_reached || false,
    disclosure: workflow.protocol_10_disclosure || null,
  };
}

/**
 * Reset revision count (for testing or manual override - admin only)
 */
export async function resetRevisionCount(orderId: string): Promise<boolean> {
  const supabase = await createClient();
  const now = new Date().toISOString();

  const { error } = await supabase
    .from('orders')
    .update({
      revision_count: 0,
      protocol_10_triggered: false,
      protocol_10_disclosure: null,
      updated_at: now,
    })
    .eq('id', orderId);

  if (error) {
    console.error(`[RevisionHandler] Failed to reset revision count: ${error.message}`);
    return false;
  }

  // Also reset workflow if exists
  await supabase
    .from('order_workflows')
    .update({
      current_loop_count: 0,
      max_loops_reached: false,
      loop_exit_triggered_at: null,
      protocol_10_disclosure: null,
    })
    .eq('order_id', orderId);

  // Log reset event
  await supabase
    .from('workflow_events')
    .insert({
      order_id: orderId,
      event_type: 'REVISION_COUNT_RESET',
      phase: 'ADMIN',
      data: {
        reset_at: now,
        reason: 'Manual admin reset',
      },
      created_at: now,
    });

  console.log(`[RevisionHandler] Revision count reset for order ${orderId}`);
  return true;
}

/**
 * Check if order can still undergo revisions
 */
export async function canRevise(orderId: string): Promise<{ canRevise: boolean; reason?: string }> {
  const status = await getRevisionStatus(orderId);

  if (!status) {
    return { canRevise: false, reason: 'Order not found' };
  }

  if (status.protocol10Triggered) {
    return { canRevise: false, reason: 'Protocol 10 triggered - max revisions reached' };
  }

  if (status.remainingLoops <= 0) {
    return { canRevise: false, reason: 'No revision loops remaining' };
  }

  return { canRevise: true };
}

/**
 * Get Protocol 10 disclosure for inclusion in deliverables
 */
export async function getProtocol10Disclosure(orderId: string): Promise<string | null> {
  const supabase = await createClient();

  const { data: order } = await supabase
    .from('orders')
    .select('protocol_10_triggered, protocol_10_disclosure')
    .eq('id', orderId)
    .single();

  if (!order?.protocol_10_triggered) {
    return null;
  }

  return order.protocol_10_disclosure;
}

/**
 * Record a revision request from the user
 */
export async function recordRevisionRequest(
  orderId: string,
  revisionNotes: string,
  requestedBy: string
): Promise<{ success: boolean; canRevise: boolean; error?: string }> {
  const supabase = await createClient();
  const now = new Date().toISOString();

  // Check if revision is allowed
  const { canRevise: allowed, reason } = await canRevise(orderId);

  if (!allowed) {
    return { success: false, canRevise: false, error: reason };
  }

  // Update order with revision request
  const { error } = await supabase
    .from('orders')
    .update({
      status: 'revision_requested',
      revision_notes: revisionNotes,
      revision_requested_at: now,
      updated_at: now,
    })
    .eq('id', orderId);

  if (error) {
    return { success: false, canRevise: true, error: error.message };
  }

  // Log revision request event
  await supabase
    .from('workflow_events')
    .insert({
      order_id: orderId,
      event_type: 'REVISION_REQUESTED',
      phase: 'USER',
      data: {
        requested_by: requestedBy,
        revision_notes: revisionNotes,
        requested_at: now,
      },
      created_at: now,
    });

  console.log(`[RevisionHandler] Revision requested for order ${orderId}`);
  return { success: true, canRevise: true };
}
