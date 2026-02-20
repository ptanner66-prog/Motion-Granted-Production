/**
 * Conflict Auto-Cancel — 7-day timeout (SP-10 AC-1)
 *
 * Source: CC-R3-04 | Priority: P1
 *
 * When an order enters pending_conflict_review (from checkout Step 9),
 * this function waits 7 days. If not resolved, auto-cancels.
 *
 * BINDING: CC-R3-04 — 7 days timeout, NO refund (no payment was captured).
 * The order was flagged at checkout BEFORE payment, so there's nothing to refund.
 *
 * T-89: Fixed email from address (orders@ → notifications@)
 * A5-P1-014: Replaced inline getServiceSupabase with shared import
 * A11-P2-012: Status casing — uses CANCELLED (uppercase, matches DB constraint)
 *
 * @module inngest/functions/conflict-auto-cancel
 */

import { inngest } from '../client';
// A5-P1-014: Use shared getServiceSupabase instead of inline definition
import { getServiceSupabase } from '@/lib/supabase/admin';

export const conflictAutoCancelV2 = inngest.createFunction(
  { id: 'conflict-auto-cancel-v2', name: 'Conflict Auto-Cancel V2 (7-day, no refund)' },
  { event: 'conflict/review-started' },
  async ({ event, step }) => {
    const { orderId } = event.data as { orderId: string };

    // Wait 7 days
    await step.sleep('wait-7-days', '7d');

    // Re-read order status
    const order = await step.run('check-status', async () => {
      const supabase = getServiceSupabase();

      const { data } = await supabase
        .from('orders')
        .select('id, status, case_number, conflict_notes, client_id')
        .eq('id', orderId)
        .single();

      return data;
    });

    // If not still in pending_conflict_review, skip (already resolved)
    // Check both casings for safety
    if (!order || (order.status !== 'pending_conflict_review' && order.status !== 'PENDING_CONFLICT_REVIEW')) {
      return { skipped: true, reason: `Order status is ${order?.status ?? 'not found'}` };
    }

    // Cancel the order (NO Stripe refund — no payment was captured)
    await step.run('cancel-order', async () => {
      const supabase = getServiceSupabase();

      // A11-P2-012: Use CANCELLED (uppercase, matches DB constraint)
      await supabase
        .from('orders')
        .update({
          status: 'CANCELLED',
          conflict_notes: `${order.conflict_notes || ''} | Auto-cancelled at 7-day timeout.`,
          updated_at: new Date().toISOString(),
        })
        .eq('id', orderId);

      // Log payment event
      await supabase.from('payment_events').insert({
        order_id: orderId,
        event_type: 'CONFLICT_AUTO_CANCELLED',
        metadata: {
          timeout_days: 7,
          case_number: order.case_number,
          reason: 'Conflict review not resolved within 7-day window',
        },
      });
    });

    // Send timeout email (BD-PCR-EMAIL-1)
    await step.run('send-email', async () => {
      const supabase = getServiceSupabase();

      // Get client email
      const { data: profile } = await supabase
        .from('profiles')
        .select('email')
        .eq('id', order.client_id)
        .single();

      if (profile?.email) {
        try {
          const { Resend } = await import('resend');
          const resend = new Resend(process.env.RESEND_API_KEY);

          // T-89: Correct from address per binding decision
          await resend.emails.send({
            from: 'Motion Granted <notifications@motion-granted.com>',
            replyTo: 'support@motion-granted.com',
            to: profile.email,
            subject: 'Order Update — Review Period Expired',
            text: `Your order for case ${order.case_number} has been cancelled because the review period has expired. You have not been charged. If you believe this was in error, please contact us at support@motion-granted.com.`,
          });
        } catch (emailError) {
          console.error('[CONFLICT_AUTO_CANCEL] Email send failed (non-fatal):', emailError);
        }
      }
    });

    // Fire cancellation event
    await step.run('emit-cancelled', async () => {
      await inngest.send({
        name: 'order/cancelled' as string,
        data: { orderId, reason: 'conflict_timeout' },
      });
    });

    return { cancelled: true, orderId };
  },
);
