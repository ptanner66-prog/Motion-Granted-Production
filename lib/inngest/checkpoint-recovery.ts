/**
 * Checkpoint Recovery Cron — SP-21 Group 5
 *
 * Runs every 6 hours to find orders stuck in AWAITING_APPROVAL
 * with no active Fn2 (workflow-checkpoint-approval) running.
 * Re-emits checkpoint/cp3.reached to restart the approval flow.
 *
 * Safety: Only recovers orders >24h stale to avoid interfering
 * with active workflows. Limited to 10 orders per run.
 */

import { inngest } from './client';
import { getServiceSupabase } from '@/lib/supabase/admin';
import { CANONICAL_EVENTS } from '@/lib/workflow/checkpoint-types';
import { createLogger } from '@/lib/security/logger';

const log = createLogger('checkpoint-recovery-cron');

export const checkpointRecoveryCron = inngest.createFunction(
  {
    id: 'checkpoint-recovery-cron',
    retries: 1,
  },
  { cron: 'TZ=America/Chicago 0 */6 * * *' }, // Every 6 hours
  async ({ step }) => {
    // Step 1: Find stuck orders
    const stuckOrders = await step.run('find-stuck-orders', async () => {
      const supabase = getServiceSupabase();
      const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24h ago

      const { data, error } = await supabase
        .from('orders')
        .select('id, status, workflow_id, updated_at, cp3_entered_at')
        .eq('status', 'AWAITING_APPROVAL')
        .lt('updated_at', cutoff.toISOString())
        .limit(10);

      if (error) {
        log.error('Failed to query stuck orders', { error: error.message });
        return [];
      }

      return data || [];
    });

    if (stuckOrders.length === 0) {
      return { recovered: 0, message: 'No stuck orders found' };
    }

    log.warn('Stuck orders detected at CP3', {
      count: stuckOrders.length,
      orderIds: stuckOrders.map((o: { id: string }) => o.id),
    });

    // Step 2: Attempt recovery for each stuck order
    let recoveredCount = 0;
    for (const order of stuckOrders) {
      const typedOrder = order as {
        id: string;
        status: string;
        workflow_id: string;
        updated_at: string;
        cp3_entered_at: string | null;
      };

      const recovered = await step.run(`recover-${typedOrder.id}`, async () => {
        const supabase = getServiceSupabase();

        // Double-check order is still stuck (may have been resolved between steps)
        const { data: current } = await supabase
          .from('orders')
          .select('status')
          .eq('id', typedOrder.id)
          .single();

        if (!current || current.status !== 'AWAITING_APPROVAL') {
          log.info('Order no longer stuck, skipping recovery', {
            orderId: typedOrder.id,
            currentStatus: current?.status,
          });
          return false;
        }

        // Get the latest delivery package for this order
        const { data: pkg } = await supabase
          .from('delivery_packages')
          .select('id')
          .eq('order_id', typedOrder.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .single();

        // Re-emit checkpoint/cp3.reached to restart Fn2
        await inngest.send({
          name: CANONICAL_EVENTS.CHECKPOINT_CP3_REACHED,
          data: {
            orderId: typedOrder.id,
            workflowId: typedOrder.workflow_id,
            packageId: pkg?.id ?? '',
          },
        });

        // Log recovery attempt
        await supabase.from('automation_logs').insert({
          order_id: typedOrder.id,
          action_type: 'cp3_recovery_attempted',
          action_details: {
            stuckSince: typedOrder.updated_at,
            cp3EnteredAt: typedOrder.cp3_entered_at,
            recoveryTriggeredAt: new Date().toISOString(),
          },
        });

        log.warn('CP3 recovery event emitted', { orderId: typedOrder.id });
        return true;
      });

      if (recovered) recoveredCount++;
    }

    return {
      recovered: recoveredCount,
      total: stuckOrders.length,
      message: `Recovered ${recoveredCount}/${stuckOrders.length} stuck orders`,
    };
  }
);
