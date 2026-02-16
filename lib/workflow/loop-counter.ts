/**
 * Loop Counter — D3 Task 18
 *
 * Manages loop_counters and loop_sources for audit trail.
 * Records cost cap exits with Inngest retry fallback via
 * 'order/audit-trail-retry' event.
 */

import { getServiceSupabase } from '@/lib/supabase/admin';
import { inngest } from '@/lib/inngest/client';

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
