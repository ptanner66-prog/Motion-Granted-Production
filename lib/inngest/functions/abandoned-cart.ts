/**
 * T-32: Abandoned Cart + 7-Day Stale Order Cleanup
 *
 * Runs daily at 6 AM UTC. Handles:
 * 1. Orders stuck in 'submitted' for 24-48h → send reminder email
 * 2. Orders stuck in 'submitted' for 7+ days → cancel + cleanup
 */

import { inngest } from '../client';
import { getServiceSupabase } from '@/lib/supabase/admin';

export const abandonedCartCleanup = inngest.createFunction(
  {
    id: 'abandoned-cart-cleanup',
    name: 'Abandoned Cart + Stale Order Cleanup',
  },
  { cron: '0 6 * * *' }, // Daily at 6 AM UTC
  async ({ step }) => {
    const supabase = getServiceSupabase();

    // Step 1: Find orders in 'submitted' status for 24-48h (abandoned cart reminder)
    const reminderResults = await step.run('find-abandoned-carts', async () => {
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const fortyEightHoursAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from('orders')
        .select('id, client_id, status, created_at')
        .eq('status', 'submitted')
        .lt('created_at', twentyFourHoursAgo)
        .gt('created_at', fortyEightHoursAgo);

      if (error) {
        console.error('[abandoned-cart] Query failed:', error.message);
        return { count: 0, orders: [] as Array<{ id: string; client_id: string; created_at: string }> };
      }
      return { count: data?.length || 0, orders: data || [] };
    });

    // Step 2: Send reminder emails for abandoned carts
    let reminded = 0;
    if (reminderResults.count > 0) {
      reminded = await step.run('send-cart-reminders', async () => {
        let sent = 0;
        for (const order of reminderResults.orders) {
          try {
            await supabase
              .from('email_queue')
              .insert({
                order_id: order.id,
                template: 'abandoned_cart_reminder',
                to_email: null, // Will be resolved by email queue consumer
                data: { created_at: order.created_at },
                status: 'pending',
              });
            sent++;
          } catch (err) {
            console.warn(`[abandoned-cart] Failed to queue reminder for ${order.id}:`, err);
          }
        }
        console.log(`[abandoned-cart] Queued ${sent} reminder emails`);
        return sent;
      });
    }

    // Step 3: Find and cancel orders stuck in 'submitted' for 7+ days
    const cleanupResults = await step.run('find-stale-orders', async () => {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from('orders')
        .select('id, client_id, status, created_at')
        .eq('status', 'submitted')
        .lt('created_at', sevenDaysAgo);

      if (error) {
        console.error('[abandoned-cart] Cleanup query failed:', error.message);
        return { count: 0, orders: [] as Array<{ id: string }> };
      }
      return { count: data?.length || 0, orders: data || [] };
    });

    // Step 4: Cancel stale orders
    let cancelled = 0;
    if (cleanupResults.count > 0) {
      cancelled = await step.run('cancel-stale-orders', async () => {
        let count = 0;
        for (const order of cleanupResults.orders) {
          try {
            await supabase
              .from('orders')
              .update({
                status: 'cancelled',
                cancellation_type: 'ABANDONED',
                updated_at: new Date().toISOString(),
              })
              .eq('id', order.id);
            count++;
          } catch (err) {
            console.warn(`[abandoned-cart] Failed to cancel stale order ${order.id}:`, err);
          }
        }
        console.log(`[abandoned-cart] Cancelled ${count} stale orders`);
        return count;
      });
    }

    console.log(JSON.stringify({
      level: 'info',
      event: 'abandoned_cart_cleanup_complete',
      reminded,
      cancelled,
      timestamp: new Date().toISOString(),
    }));

    return { reminded, cancelled };
  }
);
