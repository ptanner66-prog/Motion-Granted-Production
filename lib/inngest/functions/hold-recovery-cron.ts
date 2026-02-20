/**
 * HOLD Recovery Cron — SP-22 Task 11
 *
 * Runs every 6 hours to detect "stuck" HOLD orders where the timeout
 * function may have crashed. Orders stuck in HOLD_PENDING/on_hold for
 * more than 9 days (2 days beyond the 7-day timeout) get their
 * checkpoint/hold.created event re-emitted to restart the timeout sequence.
 */

import { inngest } from '../client';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { createLogger } from '@/lib/security/logger';

const logger = createLogger('hold-recovery-cron');

function getServiceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase env vars not configured');
  return createSupabaseClient(url, key);
}

// 9 days = 7-day HOLD timeout + 2-day safety margin
const STUCK_THRESHOLD_MS = 9 * 24 * 60 * 60 * 1000;

export const holdRecoveryCron = inngest.createFunction(
  { id: 'checkpoint-hold-recovery-cron' },
  { cron: 'TZ=America/Chicago 0 */6 * * *' }, // Every 6 hours CT
  async ({ step }) => {
    const stuckOrders = await step.run('find-stuck-holds', async () => {
      const supabase = getServiceSupabase();
      const cutoff = new Date(Date.now() - STUCK_THRESHOLD_MS).toISOString();

      const { data } = await supabase
        .from('orders')
        .select('id, status, hold_reason, hold_triggered_at, updated_at, order_number')
        .in('status', ['ON_HOLD', 'HOLD_PENDING'])
        .lt('updated_at', cutoff);

      return data ?? [];
    });

    if (stuckOrders.length === 0) {
      return { stuck: 0 };
    }

    logger.warn('Stuck HOLD orders detected', { count: stuckOrders.length });

    for (const order of stuckOrders) {
      await step.run(`recover-${order.id}`, async () => {
        // Re-emit checkpoint/hold.created to restart the timeout sequence
        await inngest.send({
          name: 'checkpoint/hold.created',
          data: {
            orderId: order.id,
            holdReason: order.hold_reason ?? 'evidence_gap',
            customerEmail: '', // Will be looked up by downstream functions
            createdAt: order.hold_triggered_at ?? order.updated_at,
            details: { type: order.hold_reason ?? 'evidence_gap' },
          },
        });

        // Log recovery
        const supabase = getServiceSupabase();
        await supabase.from('automation_logs').insert({
          order_id: order.id,
          action_type: 'hold_recovery_cron',
          action_details: {
            orderNumber: order.order_number,
            holdReason: order.hold_reason,
            stuckSince: order.updated_at,
            action: 're-emitted_hold_created',
          },
        });

        logger.info('Re-emitted hold event for stuck order', { orderId: order.id });
      });
    }

    return { stuck: stuckOrders.length, recovered: stuckOrders.length };
  }
);
