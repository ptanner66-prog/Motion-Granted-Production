/**
 * Checkpoint Crash Recovery Cron — D5 W-ADD-2
 *
 * Runs every 15 minutes. Detects and alerts on:
 * 1. Stale HOLD checkpoints (PENDING > 24h) — admin alerted, NOT auto-resolved
 * 2. Orphaned CP3 orders (AWAITING_APPROVAL > 48h with no Fn2 activity)
 * 3. Stale refund locks (refund_in_progress true but not CANCELLED, > 5 min)
 *
 * Each detection step is isolated in its own step.run() —
 * one failure does not block others.
 */

import { inngest } from '@/lib/inngest/client';
import { getServiceSupabase } from '@/lib/supabase/admin';
import { releaseRefundLock } from '@/lib/payments/refund-lock';

export const checkpointRecoveryCron = inngest.createFunction(
  { id: 'checkpoint-recovery-cron', retries: 1 },
  { cron: '*/15 * * * *' }, // Every 15 minutes
  async ({ step }) => {
    const supabase = getServiceSupabase();

    // Scenario 1: Stale HOLD checkpoints
    await step.run('detect-stale-hold-checkpoints', async () => {
      const twentyFourHoursAgo = new Date(
        Date.now() - 24 * 60 * 60 * 1000
      ).toISOString();

      const { data: staleHolds } = await supabase
        .from('checkpoints')
        .select('id, order_id')
        .eq('status', 'PENDING')
        .eq('type', 'HOLD')
        .lt('created_at', twentyFourHoursAgo);

      for (const hold of staleHolds ?? []) {
        console.warn(
          `[recovery] Stale HOLD checkpoint detected: ${hold.id} for order ${hold.order_id}`
        );
        // Alert admin — do NOT auto-resolve
        await supabase.from('email_queue').insert({
          order_id: hold.order_id,
          template_id: 'admin-alert',
          template_data: {
            alertType: 'STALE_HOLD_CHECKPOINT',
            message: `HOLD checkpoint ${hold.id} has been PENDING for >24h`,
          },
          status: 'PENDING',
        });
      }
    });

    // Scenario 2: Orphaned CP3 orders
    await step.run('detect-orphaned-cp3-orders', async () => {
      const fortyEightHoursAgo = new Date(
        Date.now() - 48 * 60 * 60 * 1000
      ).toISOString();

      // Orders in AWAITING_APPROVAL with no recent checkpoint_events
      const { data: orphaned } = await supabase
        .from('orders')
        .select('id, cp3_entered_at')
        .eq('status', 'AWAITING_APPROVAL')
        .lt('cp3_entered_at', fortyEightHoursAgo);

      for (const order of orphaned ?? []) {
        // Check if Fn2 has recent activity
        const { data: recentEvents } = await supabase
          .from('checkpoint_events')
          .select('id')
          .eq('order_id', order.id)
          .gte('created_at', fortyEightHoursAgo)
          .limit(1);

        if (!recentEvents || recentEvents.length === 0) {
          console.warn(
            `[recovery] Orphaned CP3 order detected: ${order.id} — no Fn2 activity in 48h`
          );
          await supabase.from('email_queue').insert({
            order_id: order.id,
            template_id: 'admin-alert',
            template_data: {
              alertType: 'ORPHANED_CP3_ORDER',
              message: `Order ${order.id} in AWAITING_APPROVAL with no Fn2 activity for 48h`,
            },
            status: 'PENDING',
          });
        }
      }
    });

    // Scenario 3: Stale refund locks
    await step.run('clear-stale-refund-locks', async () => {
      const fiveMinutesAgo = new Date(
        Date.now() - 5 * 60 * 1000
      ).toISOString();

      const { data: staleRefunds } = await supabase
        .from('orders')
        .select('id')
        .eq('refund_in_progress', true)
        .neq('status', 'CANCELLED')
        .lt('updated_at', fiveMinutesAgo);

      for (const order of staleRefunds ?? []) {
        console.warn(
          `[recovery] Stale refund lock cleared: order ${order.id}`
        );
        await releaseRefundLock(supabase, order.id);
        await supabase.from('email_queue').insert({
          order_id: order.id,
          template_id: 'admin-alert',
          template_data: {
            alertType: 'STALE_REFUND_LOCK',
            message: `Refund lock cleared by recovery cron for order ${order.id}. Verify order state.`,
          },
          status: 'PENDING',
        });
      }
    });
  }
);
