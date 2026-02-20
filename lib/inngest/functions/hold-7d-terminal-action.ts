/**
 * HOLD 7-Day Terminal Action — SP-22 Task 5
 *
 * Triggered by checkpoint/hold.created, fires after 7 days.
 * Cancelled if checkpoint/hold.resolved arrives first.
 *
 * BRANCHING LOGIC (BINDING 02/15/26):
 *   evidence_gap              → auto-cancel with 100% refund
 *   tier_reclassification     → admin escalation (do NOT auto-cancel completed work)
 *   revision_stall            → admin escalation
 *   citation_critical_failure → admin escalation
 */

import { inngest } from '../client';
import { handleHoldTimeout } from '../checkpoint-timeout';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { createLogger } from '@/lib/security/logger';

const logger = createLogger('hold-7d-terminal');

function getServiceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase env vars not configured');
  return createSupabaseClient(url, key);
}

const HOLD_TIMEOUT_TEMPLATES: Record<string, string> = {
  'evidence_gap': 'hold_auto_refund',
  'revision_stall': 'hold_escalation_72h',
  'citation_critical_failure': 'hold_escalation_72h',
  'tier_reclassification': 'hold_escalation_72h',
};

export const hold7dTerminalAction = inngest.createFunction(
  {
    id: 'checkpoint-hold-7d-terminal',
    cancelOn: [{ event: 'checkpoint/hold.resolved', match: 'data.orderId' }],
  },
  { event: 'checkpoint/hold.created' },
  async ({ event, step }) => {
    await step.sleep('wait-7-days', '7d');

    const order = await step.run('get-order', async () => {
      const supabase = getServiceSupabase();
      const { data, error } = await supabase
        .from('orders')
        .select('id, status, hold_reason, stripe_payment_intent_id, amount_paid_cents, total_price, current_phase')
        .eq('id', event.data.orderId)
        .single();

      if (error || !data) throw new Error(`Order not found: ${event.data.orderId}`);
      return data;
    });

    // Accept both on_hold and hold_pending (SP12-07 FIX)
    if (order.status !== 'ON_HOLD' && order.status !== 'HOLD_PENDING') {
      return { skipped: true, reason: `status_${order.status}` };
    }

    // Get active checkpoint for this order
    const checkpoint = await step.run('get-checkpoint', async () => {
      const supabase = getServiceSupabase();
      const { data } = await supabase
        .from('checkpoint_events')
        .select('id')
        .eq('order_id', event.data.orderId)
        .eq('event_type', 'HOLD_TRIGGERED')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      return data ?? { id: 'unknown' };
    });

    // Read CURRENT hold_reason from DB (not event payload — may have changed)
    const holdReason = order.hold_reason ?? 'evidence_gap';

    if (holdReason === 'evidence_gap') {
      // Auto-cancel with 100% refund (Binding Decision 02/15/26)
      await step.run('auto-cancel', async () => {
        await handleHoldTimeout(checkpoint.id, order.id);
      });
      logger.info('HOLD evidence_gap auto-cancelled at 7d', { orderId: order.id });
    } else {
      // Admin escalation (revision_stall, citation_critical_failure, tier_reclassification)
      await step.run('admin-escalate', async () => {
        const supabase = getServiceSupabase();
        const adminEmail = process.env.ADMIN_EMAIL || process.env.ALERT_EMAIL;

        // Queue admin notification
        await supabase.from('notification_queue').insert({
          notification_type: 'hold_admin_escalation',
          recipient_email: adminEmail,
          order_id: order.id,
          template_data: {
            holdReason,
            daysPending: 7,
            requiresManualReview: true,
          },
          priority: 10,
          status: 'pending',
        });

        // Log escalation
        await supabase.from('automation_logs').insert({
          order_id: order.id,
          action_type: 'hold_admin_escalation',
          action_details: {
            holdReason,
            daysPending: 7,
            checkpointId: checkpoint.id,
            escalationType: '7d_terminal',
          },
        });
      });
      logger.info('HOLD escalated to admin at 7d', { orderId: order.id, holdReason });
    }

    // Queue type-specific email to attorney
    const templateId = HOLD_TIMEOUT_TEMPLATES[holdReason] ?? 'hold_auto_refund';
    await step.run('send-email', async () => {
      const supabase = getServiceSupabase();

      // Get attorney email
      const { data: orderWithProfile } = await supabase
        .from('orders')
        .select('profiles!orders_client_id_fkey(email)')
        .eq('id', order.id)
        .single();

      const profileData = orderWithProfile?.profiles;
      const attorneyEmail = Array.isArray(profileData) ? profileData[0]?.email : (profileData as { email?: string } | null | undefined)?.email;

      if (attorneyEmail) {
        await supabase.from('email_queue').insert({
          order_id: order.id,
          template: templateId,
          data: { orderId: order.id, holdReason },
          status: 'pending',
          created_at: new Date().toISOString(),
        });
      }
    });

    return {
      action: holdReason === 'evidence_gap' ? 'auto_cancel' : 'admin_escalate',
      holdReason,
    };
  }
);
