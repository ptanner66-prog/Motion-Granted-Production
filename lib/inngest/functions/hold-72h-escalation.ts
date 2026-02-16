/**
 * HOLD 72h Escalation — SP-22 Task 10
 *
 * Sends an urgent escalation email 72 hours after HOLD is created.
 * Also notifies admin that a HOLD has been unresolved for 3 days.
 * Auto-cancelled if checkpoint/hold.resolved arrives before 72h.
 */

import { inngest } from '../client';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { createLogger } from '@/lib/security/logger';

const logger = createLogger('hold-72h-escalation');

function getServiceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase env vars not configured');
  return createSupabaseClient(url, key);
}

export const hold72hEscalation = inngest.createFunction(
  {
    id: 'checkpoint-hold-72h-escalation',
    cancelOn: [{ event: 'checkpoint/hold.resolved', match: 'data.orderId' }],
  },
  { event: 'checkpoint/hold.created' },
  async ({ event, step }) => {
    await step.sleep('wait-72h', '72h');

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

    // Send escalation email to attorney
    await step.run('send-escalation', async () => {
      const supabase = getServiceSupabase();

      await supabase.from('email_queue').insert({
        order_id: event.data.orderId,
        template: 'hold_escalation_72h',
        data: {
          orderId: event.data.orderId,
          holdReason: event.data.holdReason ?? order.hold_reason,
          hoursRemaining: 96, // 7d - 3d = 4d = 96h remaining
          orderNumber: order.order_number,
        },
        status: 'pending',
        created_at: new Date().toISOString(),
      });

      // Mark escalated on orders table
      await supabase
        .from('orders')
        .update({ hold_escalated: true })
        .eq('id', event.data.orderId);

      logger.info('72h HOLD escalation email queued', { orderId: event.data.orderId });
    });

    // Also notify admin
    await step.run('notify-admin', async () => {
      const supabase = getServiceSupabase();
      const adminEmail = process.env.ADMIN_EMAIL || process.env.ALERT_EMAIL;

      if (adminEmail) {
        await supabase.from('notification_queue').insert({
          notification_type: 'hold_72h_admin_alert',
          recipient_email: adminEmail,
          order_id: event.data.orderId,
          template_data: {
            holdReason: event.data.holdReason ?? order.hold_reason,
            orderNumber: order.order_number,
            hoursOnHold: 72,
          },
          priority: 9,
          status: 'pending',
        });
      }

      logger.info('72h HOLD admin notification queued', { orderId: event.data.orderId });
    });

    return { escalated: true };
  }
);
