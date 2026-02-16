/**
 * HOLD 24h Reminder — SP-22 Task 9
 *
 * Sends a gentle reminder email 24 hours after HOLD is created.
 * Auto-cancelled if checkpoint/hold.resolved arrives before 24h.
 */

import { inngest } from '../client';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { createLogger } from '@/lib/security/logger';

const logger = createLogger('hold-24h-reminder');

function getServiceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase env vars not configured');
  return createSupabaseClient(url, key);
}

export const hold24hReminder = inngest.createFunction(
  {
    id: 'checkpoint-hold-24h-reminder',
    cancelOn: [{ event: 'checkpoint/hold.resolved', match: 'data.orderId' }],
  },
  { event: 'checkpoint/hold.created' },
  async ({ event, step }) => {
    await step.sleep('wait-24h', '24h');

    const order = await step.run('check-status', async () => {
      const supabase = getServiceSupabase();
      const { data, error } = await supabase
        .from('orders')
        .select('id, status, hold_reason, order_number, profiles!orders_client_id_fkey(email, full_name)')
        .eq('id', event.data.orderId)
        .single();

      if (error || !data) throw new Error(`Order not found: ${event.data.orderId}`);
      return data;
    });

    // Skip if no longer on hold
    if (order.status !== 'on_hold' && order.status !== 'hold_pending') {
      return { skipped: true, reason: `status_${order.status}` };
    }

    await step.run('send-reminder', async () => {
      const supabase = getServiceSupabase();

      // Queue 24h reminder email
      await supabase.from('email_queue').insert({
        order_id: event.data.orderId,
        template: 'hold_reminder_24h',
        data: {
          orderId: event.data.orderId,
          holdReason: event.data.holdReason ?? order.hold_reason,
          orderNumber: order.order_number,
        },
        status: 'pending',
        created_at: new Date().toISOString(),
      });

      // Mark reminder as sent on orders table
      await supabase
        .from('orders')
        .update({ hold_reminder_sent: true })
        .eq('id', event.data.orderId);

      logger.info('24h HOLD reminder queued', { orderId: event.data.orderId });
    });

    return { sent: true };
  }
);
