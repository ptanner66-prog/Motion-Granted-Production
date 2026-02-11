// /lib/workflow/revision-loop.ts
// VERSION: 1.1 — BUG-11 Atomic Increment Fix
//
// BUG-11 FIX: The previous version used SELECT + JavaScript increment + UPDATE
// which is NOT atomic. Two concurrent requests could both read count=1, both
// increment to 2, and both write 2 — losing an increment.
//
// FIX: Use Supabase RPC for atomic increment. Falls back to optimistic
// concurrency with version check if RPC is not available.

import { createClient } from '@/lib/supabase/server';
import { FAILURE_THRESHOLDS, isProtocol10Triggered } from '@/lib/config/workflow-config';

export interface RevisionResult {
  revisionCount: number;
  protocol10Triggered: boolean;
  disclosure?: string;
  shouldContinue: boolean;
}

export function generateProtocol10Disclosure(loops: number, grade?: string): string {
  return `DISCLOSURE (Per Protocol 10):
This motion underwent ${loops} revision cycles during automated QA.
${grade ? `Final automated review grade: ${grade}.` : ''}
Attorney review is recommended before filing.
This disclosure is provided for transparency per Motion Granted's quality protocols.`;
}

/**
 * Atomically increment the revision loop counter.
 *
 * BUG-11 FIX: Uses Supabase RPC `increment_revision_count` for true
 * database-level atomicity. Falls back to optimistic update with
 * expected-value check if the RPC function is not deployed yet.
 */
export async function incrementRevisionLoop(orderId: string, judgeGrade?: string): Promise<RevisionResult> {
  const supabase = await createClient();

  let newCount: number;

  // ATTEMPT 1: Atomic RPC call (preferred)
  try {
    const { data: rpcResult, error: rpcError } = await supabase
      .rpc('increment_revision_count', { p_order_id: orderId });

    if (!rpcError && rpcResult !== null && rpcResult !== undefined) {
      newCount = typeof rpcResult === 'number' ? rpcResult : Number(rpcResult);
      console.log(`[RevisionLoop] Atomic increment for order ${orderId}: count=${newCount}`);
    } else {
      // RPC not available — fall back to optimistic concurrency
      console.warn(`[RevisionLoop] RPC unavailable (${rpcError?.message}), using optimistic update`);
      newCount = await optimisticIncrement(supabase, orderId);
    }
  } catch {
    // RPC function doesn't exist yet — fall back
    console.warn('[RevisionLoop] RPC function not deployed, using optimistic update');
    newCount = await optimisticIncrement(supabase, orderId);
  }

  const triggered = isProtocol10Triggered(newCount);

  if (triggered) {
    const disclosure = generateProtocol10Disclosure(newCount, judgeGrade);
    await supabase.from('orders').update({
      protocol_10_disclosure: disclosure,
      protocol_10_triggered_at: new Date().toISOString(),
    }).eq('id', orderId);

    await supabase.from('checkpoint_events').insert({
      order_id: orderId,
      event_type: 'PROTOCOL_10_TRIGGERED',
      phase: 'VIII',
      data: { revision_count: newCount, grade: judgeGrade },
      created_at: new Date().toISOString(),
    });

    console.log(`[Protocol 10] Order ${orderId} reached ${newCount} revision loops`);
    return { revisionCount: newCount, protocol10Triggered: true, disclosure, shouldContinue: false };
  }

  return { revisionCount: newCount, protocol10Triggered: false, shouldContinue: true };
}

/**
 * Optimistic concurrency increment.
 * Reads the current count, then updates ONLY IF the count hasn't changed.
 * Retries up to 3 times on conflict.
 */
async function optimisticIncrement(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orderId: string
): Promise<number> {
  const MAX_RETRIES = 3;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const { data: order, error } = await supabase
      .from('orders')
      .select('revision_count, updated_at')
      .eq('id', orderId)
      .single();

    if (error || !order) {
      throw new Error(`Failed to fetch order for revision increment: ${error?.message}`);
    }

    const currentCount = order.revision_count || 0;
    const newCount = currentCount + 1;
    const now = new Date().toISOString();

    // Optimistic update: only succeed if revision_count hasn't changed
    const { data: updated, error: updateError } = await supabase
      .from('orders')
      .update({ revision_count: newCount, updated_at: now })
      .eq('id', orderId)
      .eq('revision_count', currentCount) // Optimistic lock
      .select('revision_count')
      .single();

    if (updateError || !updated) {
      // Conflict — another request incremented first. Retry.
      console.warn(`[RevisionLoop] Optimistic conflict on attempt ${attempt + 1}, retrying...`);
      await new Promise(resolve => setTimeout(resolve, 50 * (attempt + 1)));
      continue;
    }

    return newCount;
  }

  throw new Error(`[RevisionLoop] Failed to increment revision count after ${MAX_RETRIES} attempts (concurrent conflict)`);
}

export async function getRevisionStatus(orderId: string): Promise<{ count: number; max: number; remaining: number; triggered: boolean }> {
  const supabase = await createClient();
  const { data } = await supabase.from('orders').select('revision_count, protocol_10_triggered_at').eq('id', orderId).single();
  const count = data?.revision_count || 0;
  return { count, max: FAILURE_THRESHOLDS.MAX_REVISION_LOOPS, remaining: Math.max(0, 3 - count), triggered: !!data?.protocol_10_triggered_at };
}

export async function resetRevisionLoop(orderId: string): Promise<void> {
  const supabase = await createClient();
  await supabase.from('orders').update({ revision_count: 0, protocol_10_disclosure: null, protocol_10_triggered_at: null }).eq('id', orderId);
}

/**
 * Check and handle revision loop during phase execution
 * Wrapper for phase-executor integration
 */
export async function checkAndHandleRevisionLoop(
  orderId: string,
  workflowId: string
): Promise<RevisionResult> {
  const supabase = await createClient();

  // Get current order state to check for grade
  const { data: order } = await supabase
    .from('orders')
    .select('judge_grade')
    .eq('id', orderId)
    .single();

  const result = await incrementRevisionLoop(orderId, order?.judge_grade);

  // Log revision loop event
  await supabase.from('workflow_events').insert({
    order_id: orderId,
    workflow_id: workflowId,
    event_type: result.protocol10Triggered ? 'PROTOCOL_10_TRIGGERED' : 'REVISION_LOOP_INCREMENT',
    phase: 'VIII',
    data: {
      revision_count: result.revisionCount,
      protocol_10_triggered: result.protocol10Triggered,
    },
    created_at: new Date().toISOString(),
  });

  return result;
}
