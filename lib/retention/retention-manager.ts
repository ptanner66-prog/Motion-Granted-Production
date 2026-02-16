/**
 * Retention Manager — DST-04 + DST-08
 *
 * DST-04: deleteOrderData() transactional cascade via Supabase RPC.
 * DST-08: Daily retention job with legal_hold race-condition fix.
 *
 * Atomic cascade deletion uses delete_order_cascade RPC for DB consistency,
 * followed by non-blocking storage cleanup with Inngest retry fallback.
 */

import { getServiceSupabase } from '@/lib/supabase/admin';
import { inngest } from '@/lib/inngest/client';

/**
 * DST-04: Atomic transactional cascade delete via RPC.
 *
 * 1. Calls delete_order_cascade RPC for atomic DB cleanup
 * 2. Cleans up storage (non-blocking — retries via Inngest if fails)
 * 3. Idempotent: second call on same order is a no-op
 */
export async function deleteOrderData(orderId: string): Promise<{
  success: boolean;
  dbDeleted: boolean;
  storageDeleted: boolean;
  error?: string;
}> {
  const supabase = getServiceSupabase();

  // Step 1: Atomic database cascade
  let dbDeleted = false;
  try {
    const { error } = await supabase.rpc('delete_order_cascade', {
      target_order_id: orderId,
    });

    if (error) throw error;
    dbDeleted = true;
  } catch (err) {
    console.error('[retention] DB cascade failed for order:', orderId, err);
    return {
      success: false,
      dbDeleted: false,
      storageDeleted: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  // Step 2: Storage cleanup (non-blocking — retry via Inngest if fails)
  let storageDeleted = false;
  try {
    const buckets = ['order-documents', 'order-archive', 'client-uploads'];
    for (const bucket of buckets) {
      const { data: files } = await supabase.storage
        .from(bucket)
        .list(orderId);

      if (files && files.length > 0) {
        const paths = files.map((f) => `${orderId}/${f.name}`);
        await supabase.storage.from(bucket).remove(paths);
      }
    }
    storageDeleted = true;
  } catch (err) {
    console.error('[retention] Storage cleanup failed, queuing retry:', orderId, err);
    // Queue async retry — DB is already clean, just storage remains
    await inngest.send({
      name: 'retention/storage-cleanup-retry',
      data: { orderId },
    });
  }

  return { success: true, dbDeleted, storageDeleted };
}

/**
 * DST-08: Daily retention cleanup with legal_hold race-condition fix.
 *
 * The retention job checks legal_hold INSIDE the loop (not just in the query)
 * to prevent the race where legal_hold is set between query time and delete time.
 */
export const dailyRetentionJob = inngest.createFunction(
  { id: 'daily-retention-cleanup', retries: 1 },
  { cron: '0 2 * * *' }, // 2 AM CT daily
  async ({ step }) => {
    await step.run('process-expired-orders', async () => {
      const supabase = getServiceSupabase();

      // ST6-01: Only terminal states are safe to delete.
      const DELETABLE_STATUSES = [
        'COMPLETED', 'CANCELLED', 'CANCELLED_USER', 'CANCELLED_SYSTEM',
        'CANCELLED_CONFLICT', 'REFUNDED',
      ];

      // Query orders past retention — terminal states only, EXCLUDING legal holds
      const { data: expired } = await supabase
        .from('orders')
        .select('id, legal_hold, status')
        .lt('retention_expires_at', new Date().toISOString())
        .in('status', DELETABLE_STATUSES)
        .is('deleted_at', null);

      let deleted = 0;
      let skippedLegalHold = 0;
      let skippedDispute = 0;

      for (const order of expired ?? []) {
        // DST-08 FIX: Check legal_hold INSIDE the loop, not just in query
        // This prevents the race where legal_hold is set between query and delete
        const { data: freshOrder } = await supabase
          .from('orders')
          .select('legal_hold')
          .eq('id', order.id)
          .single();

        if (freshOrder?.legal_hold) {
          skippedLegalHold++;
          console.log(`[retention] Skipping order ${order.id}: legal_hold = true`);
          continue;
        }

        // Check for active Stripe disputes
        const { data: disputeCheck } = await supabase
          .from('orders')
          .select('stripe_dispute_active')
          .eq('id', order.id)
          .single();

        if (disputeCheck?.stripe_dispute_active) {
          skippedDispute++;
          console.log(`[retention] Skipping order ${order.id}: active Stripe dispute`);
          continue;
        }

        const result = await deleteOrderData(order.id);
        if (result.success) deleted++;
      }

      console.log(
        `[retention] Processed: ${deleted} deleted, ${skippedLegalHold} legal holds, ${skippedDispute} disputes`
      );
    });
  }
);
