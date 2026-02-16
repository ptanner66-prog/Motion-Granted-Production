/**
 * Refund Lock Utility
 *
 * SP-3 Task 3 (D5 W2-3): Atomic check-and-set lock to prevent double-refund
 * race condition.
 *
 * Race scenario: Attorney clicks Cancel at T+20d 23h 59m AND 21d Inngest
 * timeout fires within same second. Both read AWAITING_APPROVAL, both refund.
 * Customer receives 100% instead of 50%.
 *
 * Solution: Atomic UPDATE with match condition — only one process succeeds.
 *
 * Depends on: SP-2 W1-1 (refund_in_progress column on orders)
 */

import { SupabaseClient } from '@supabase/supabase-js';

/**
 * Acquire an atomic refund lock for an order.
 * Only one process can hold the lock at a time.
 *
 * @returns { acquired: true } if lock obtained, { acquired: false } otherwise.
 */
export async function acquireRefundLock(
  supabase: SupabaseClient,
  orderId: string
): Promise<{ acquired: boolean; currentStatus: string }> {
  try {
    const { data, error } = await supabase
      .from('orders')
      .update({ refund_in_progress: true })
      .match({ id: orderId, refund_in_progress: false })
      .select('id, status')
      .single();

    if (error || !data) {
      // Lock not acquired — another process already has it
      const { data: current } = await supabase
        .from('orders')
        .select('status')
        .eq('id', orderId)
        .single();
      return { acquired: false, currentStatus: current?.status ?? 'UNKNOWN' };
    }

    return { acquired: true, currentStatus: data.status };
  } catch (err) {
    console.error('[refund-lock] Error acquiring lock:', err);
    return { acquired: false, currentStatus: 'ERROR' };
  }
}

/**
 * Release the refund lock after refund processing completes.
 * MUST be called in a finally block to prevent permanent lock.
 *
 * If this fails, a recovery cron (SP-6) will clear stale locks.
 */
export async function releaseRefundLock(
  supabase: SupabaseClient,
  orderId: string
): Promise<void> {
  try {
    await supabase
      .from('orders')
      .update({ refund_in_progress: false })
      .eq('id', orderId);
  } catch (err) {
    console.error('[refund-lock] Error releasing lock:', err);
    // Recovery cron (SP-6) will clear stale locks
  }
}
