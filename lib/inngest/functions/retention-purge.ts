/**
 * Retention Storage Purge Cron (D6 C-012)
 *
 * Weekly cron to purge archived orders past their retention period.
 * Separate from the daily retention job (DST-04) which handles
 * soft-delete and anonymization. This job handles STORAGE purge
 * for orders already processed by the daily job.
 *
 * NOTE: Architecture v2.1 says 180 days, but D5 binding sets
 * retention_expires_at = delivery + 365 days (California statute).
 * This cron respects the actual retention_expires_at value regardless.
 */

import { inngest } from '@/lib/inngest/client';
import { getServiceSupabase } from '@/lib/supabase/admin';
import { STORAGE_BUCKETS } from '@/lib/config/storage';
import { updateOrderColumns } from '@/lib/orders/update-columns';

export const retentionPurgeCron = inngest.createFunction(
  { id: 'retention-storage-purge', retries: 2 },
  { cron: '0 4 * * 0' }, // 4 AM CT every Sunday
  async ({ step }) => {
    const result = await step.run('purge-expired-archives', async () => {
      const supabase = getServiceSupabase();

      const { data: expired } = await supabase
        .from('orders')
        .select('id')
        .lt('retention_expires_at', new Date().toISOString())
        .eq('status', 'COMPLETED')
        .is('legal_hold', null) // Respect legal holds
        .limit(100); // Process in batches

      let purged = 0;
      for (const order of expired ?? []) {
        try {
          // Delete from archive bucket
          const { data: files } = await supabase.storage
            .from(STORAGE_BUCKETS.ORDER_ARCHIVE)
            .list(order.id);

          if (files && files.length > 0) {
            const paths = files.map((f) => `${order.id}/${f.name}`);
            await supabase.storage
              .from(STORAGE_BUCKETS.ORDER_ARCHIVE)
              .remove(paths);
          }

          // Also clean from active documents bucket
          const { data: activeFiles } = await supabase.storage
            .from(STORAGE_BUCKETS.ORDER_DOCUMENTS)
            .list(order.id);

          if (activeFiles && activeFiles.length > 0) {
            const activePaths = activeFiles.map((f) => `${order.id}/${f.name}`);
            await supabase.storage
              .from(STORAGE_BUCKETS.ORDER_DOCUMENTS)
              .remove(activePaths);
          }

          // Mark as purged
          await updateOrderColumns(supabase, order.id, {
            archive_status: 'PURGED',
          }, 'retention-purge');

          purged++;
        } catch (err) {
          console.error(`[retention-purge] Failed for order ${order.id}:`, err);
        }
      }

      console.log(`[retention-purge] Purged ${purged}/${expired?.length ?? 0} orders`);
      return { purged, total: expired?.length ?? 0 };
    });

    return result;
  }
);
