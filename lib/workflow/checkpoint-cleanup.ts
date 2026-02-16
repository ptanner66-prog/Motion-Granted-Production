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

import { cancelCP3Timeouts } from '@/lib/workflow/cp3-timeouts';
import { logCheckpointEvent } from '@/lib/workflow/checkpoint-logger';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Clean up all pending checkpoints and reminders when an order
 * is cancelled externally (admin, Stripe, customer support).
 *
 * Call this from any external cancellation path BEFORE or AFTER
 * setting order status to CANCELLED.
 *
 * Failures are logged but never block the external cancellation.
 */
export async function cleanupCheckpointsOnCancellation(
  supabase: SupabaseClient,
  orderId: string
): Promise<void> {
  try {
    // 1. Cancel CP3 timeouts and reminders
    await cancelCP3Timeouts(supabase, orderId);

    // 2. Cancel any pending HOLD checkpoints
    const { data: pendingCheckpoints } = await supabase
      .from('checkpoints')
      .select('id')
      .match({ order_id: orderId, status: 'PENDING' });

    for (const cp of pendingCheckpoints ?? []) {
      await supabase.from('checkpoints').update({
        status: 'CANCELLED',
        resolved_at: new Date().toISOString(),
        resolved_by: 'system:external_cancellation',
      }).eq('id', cp.id);
    }

    // 3. Log cleanup
    await logCheckpointEvent(supabase, {
      orderId,
      eventType: 'CHECKPOINTS_CLEANED_EXTERNAL_CANCEL',
      actor: 'system',
      metadata: {
        cancelledCheckpoints: (pendingCheckpoints ?? []).length,
      },
    });
  } catch (error) {
    // Log but NEVER block external cancellation
    console.error('[checkpoint-cleanup] Cleanup failed for order:', orderId, error);
  }
}
