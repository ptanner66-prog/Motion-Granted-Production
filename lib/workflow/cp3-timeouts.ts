/**
 * BINDING REFERENCE — CP3 Approval Flow (Domain 5)
 *
 * CP3 Location: Phase X Stage 6 (NOT Phase IX)
 * CP3 Actor: Attorney-only. NO admin gate.
 * Rework Cap: 3 attorney cycles. Re-entry Phase VII.
 * Cost Tracking: RESETS on attorney rework (binding 02/15/26)
 * Timeout: 14d Stage 1 + 7d Stage 2 = 21d total
 * Reminder Sequence: T+48h, T+72h, T+14d FINAL NOTICE, T+21d auto-cancel
 * Refund: 50% flat (CP3_CANCEL and CP3_TIMEOUT_CANCEL)
 * Status Flow: AWAITING_APPROVAL → COMPLETED (no APPROVED intermediate)
 * Fn2 Wait Match: data.orderId (NOT data.workflowId)
 */

import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Schedule CP3 timeouts by recording the checkpoint reminder entry.
 *
 * The actual timeout enforcement is handled by Inngest's waitForEvent
 * with built-in timeout durations (14d Stage 1 + 7d Stage 2).
 * This function creates the checkpoint_reminders row so that
 * cancelCP3Timeouts can mark them cancelled when the attorney acts.
 */
export async function scheduleCP3Timeouts(
  supabase: SupabaseClient,
  orderId: string
): Promise<void> {
  try {
    // Cancel any existing active reminders for this order first
    await supabase
      .from('checkpoint_reminders')
      .update({
        cancelled: true,
        cancelled_at: new Date().toISOString(),
      })
      .match({ order_id: orderId, checkpoint_type: 'CP3', cancelled: false });

    // Create new reminder record
    const { error } = await supabase
      .from('checkpoint_reminders')
      .insert({
        order_id: orderId,
        checkpoint_type: 'CP3',
        job_ids: ['inngest:stage1-14d', 'inngest:stage2-7d', 'inngest:reminder-48h', 'inngest:reminder-72h'],
        cancelled: false,
      });

    if (error) {
      console.error('[cp3-timeouts] Failed to schedule timeouts:', error);
    }
  } catch (err) {
    console.error('[cp3-timeouts] Error scheduling timeouts:', err);
  }
}

/**
 * Cancel all pending CP3 timeouts and reminders for an order.
 *
 * Called when:
 * - Attorney approves (handleApprove)
 * - Attorney requests changes (handleRequestChanges)
 * - Attorney cancels (handleCancel)
 * - External cancellation (checkpoint-cleanup)
 *
 * Failures are logged but never block the calling operation.
 */
export async function cancelCP3Timeouts(
  supabase: SupabaseClient,
  orderId: string
): Promise<void> {
  try {
    const { error } = await supabase
      .from('checkpoint_reminders')
      .update({
        cancelled: true,
        cancelled_at: new Date().toISOString(),
      })
      .match({ order_id: orderId, checkpoint_type: 'CP3', cancelled: false });

    if (error) {
      console.error('[cp3-timeouts] Failed to cancel timeouts:', error);
    }
  } catch (err) {
    console.error('[cp3-timeouts] Error cancelling timeouts:', err);
  }
}
