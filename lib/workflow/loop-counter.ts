/**
 * Loop Counter — D3 Task 18
 *
 * Manages loop_counters and loop_sources for audit trail.
 * Records cost cap exits with Inngest retry fallback via
 * 'order/audit-trail-retry' event.
 *
 * BINDING DECISION (02/11/2026): Loop counter increments ONLY on
 * Phase VII grade failure or CP3 rejection. Protocol 5 Mini Phase IV
 * routes (VII.1 -> VII) are sub-processes within the current loop
 * and do NOT increment the counter.
 */

import { getServiceSupabase } from '@/lib/supabase/admin';
import { inngest } from '@/lib/inngest/client';
import { getCostCap } from '@/lib/config/cost-caps';

/**
 * Record a cost cap exit event in the loop audit trail.
 * On failure, emits 'order/audit-trail-retry' for async retry.
 */
export async function recordCostCapExit(
  orderId: string,
  details: string
): Promise<void> {
  const supabase = getServiceSupabase();

  try {
    const { data: loopCounter } = await supabase
      .from('loop_counters')
      .select('id')
      .eq('order_id', orderId)
      .single();

    if (!loopCounter) {
      console.warn(`[loop-counter] No loop_counter for order ${orderId}, creating one`);
      const { data: newCounter, error: insertError } = await supabase
        .from('loop_counters')
        .insert({ order_id: orderId })
        .select('id')
        .single();

      if (insertError || !newCounter) {
        throw new Error(`Failed to create loop_counter: ${insertError?.message}`);
      }

      await supabase.from('loop_sources').insert({
        loop_counter_id: newCounter.id,
        trigger: 'COST_CAP_EXCEEDED',
        details,
      });
      return;
    }

    const { error } = await supabase.from('loop_sources').insert({
      loop_counter_id: loopCounter.id,
      trigger: 'COST_CAP_EXCEEDED',
      details,
    });

    if (error) {
      throw new Error(`loop_sources INSERT failed: ${error.message}`);
    }
  } catch (err) {
    console.error('[loop-counter] Failed to record cost cap exit, emitting retry event:', err);
    try {
      await inngest.send({
        name: 'order/audit-trail-retry',
        data: {
          orderId,
          trigger: 'COST_CAP_EXCEEDED',
          details,
          originalError: (err as Error).message,
        },
      });
    } catch (retryErr) {
      console.error('[loop-counter] Audit trail retry event also failed:', retryErr);
    }
  }
}

/**
 * Record an arbitrary loop source event.
 */
export async function recordLoopSource(
  orderId: string,
  trigger: string,
  details: string
): Promise<void> {
  const supabase = getServiceSupabase();

  const { data: loopCounter } = await supabase
    .from('loop_counters')
    .select('id')
    .eq('order_id', orderId)
    .single();

  if (!loopCounter) {
    console.warn(`[loop-counter] No loop_counter for order ${orderId}`);
    return;
  }

  const { error } = await supabase.from('loop_sources').insert({
    loop_counter_id: loopCounter.id,
    trigger,
    details,
  });

  if (error) {
    console.error('[loop-counter] Failed to record loop source:', error);
  }
}

/**
 * Check sub-loop cost cap.
 * MUST filter is_rework_reset = false per D4 Task D-5.
 *
 * @returns Whether the cap is exceeded, current total, and the cap value.
 */
export async function checkSubLoopCostCap(
  orderId: string,
  tier: string
): Promise<{ exceeded: boolean; totalCost: number; cap: number }> {
  const supabase = getServiceSupabase();
  const cap = getCostCap(tier);

  const { data } = await supabase
    .from('cost_tracking')
    .select('total_cost')
    .eq('order_id', orderId)
    .eq('is_rework_reset', false); // R4 CORRECTION: exclude reset rows

  const totalCost = (data ?? []).reduce(
    (sum: number, row: { total_cost: number | null }) => sum + (row.total_cost ?? 0),
    0
  );

  return { exceeded: totalCost >= cap, totalCost, cap };
}

/**
 * Idempotent Protocol 10 trigger.
 * D3 Task 13: Only fires once per order (checks protocol_10_triggered flag).
 *
 * Protocol 10 is the cost-cap exit path: when AI costs exceed the tier cap,
 * the workflow exits the sub-loop and proceeds to final assembly with a
 * cost-cap disclosure notice.
 */
export async function triggerProtocol10(
  orderId: string,
  phase: string,
  tier: string,
  totalCost: number
): Promise<{ triggered: boolean; alreadyTriggered: boolean }> {
  const supabase = getServiceSupabase();

  // Idempotency check: only trigger once per order
  const { data: order } = await supabase
    .from('orders')
    .select('protocol_10_triggered')
    .eq('id', orderId)
    .single();

  if (order?.protocol_10_triggered) {
    return { triggered: false, alreadyTriggered: true };
  }

  // Set the flag atomically
  const { data: updated, error } = await supabase
    .from('orders')
    .update({ protocol_10_triggered: true })
    .match({ id: orderId, protocol_10_triggered: false })
    .select('id')
    .single();

  if (error || !updated) {
    // Another process set the flag first
    return { triggered: false, alreadyTriggered: true };
  }

  // Record cost cap exit in audit trail
  await recordCostCapExit(orderId, `Protocol 10: tier=${tier}, cost=$${totalCost.toFixed(2)}, cap=$${getCostCap(tier)}, phase=${phase}`);

  console.info(
    `[protocol-10] Triggered for order ${orderId}: tier=${tier}, cost=$${totalCost.toFixed(2)}, cap=$${getCostCap(tier)}`
  );

  return { triggered: true, alreadyTriggered: false };
}
