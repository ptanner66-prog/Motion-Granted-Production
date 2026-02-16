/**
 * Raw Upload Purge Cron (SP-23 ST6-02)
 *
 * Purges attorney-uploaded raw evidence files from client-uploads bucket
 * 7 days after order completion. Only purges COMPLETED orders.
 *
 * Sets raw_uploads_purged = true so revision workflows can detect
 * when original evidence is unavailable and inject a disclaimer.
 *
 * Separate from retention-purge.ts which handles full storage purge
 * after the 365-day retention period expires.
 */

import { inngest } from '@/lib/inngest/client';
import { getServiceSupabase } from '@/lib/supabase/admin';
import { STORAGE_BUCKETS } from '@/lib/config/storage';
import { createLogger } from '@/lib/security/logger';

const log = createLogger('raw-upload-purge');

const RAW_UPLOAD_PURGE_DAYS = 7;

export const rawUploadPurgeCron = inngest.createFunction(
  {
    id: 'raw-upload-purge',
    name: 'Purge Raw Uploads (7-day post-completion)',
    retries: 2,
  },
  { cron: 'TZ=America/Chicago 0 3 * * *' }, // 3 AM Central daily
  async ({ step, logger }) => {
    const result = await step.run('purge-raw-uploads', async () => {
      const supabase = getServiceSupabase();
      const cutoffDate = new Date(Date.now() - RAW_UPLOAD_PURGE_DAYS * 86_400_000).toISOString();

      // Only purge for COMPLETED orders past the 7-day window
      // Do NOT purge orders in active states (REVISION_REQ, PROCESSING, etc.)
      const { data: orders, error: queryError } = await supabase
        .from('orders')
        .select('id')
        .eq('status', 'COMPLETED')
        .eq('raw_uploads_purged', false)
        .lte('completed_at', cutoffDate)
        .is('deleted_at', null)
        .limit(100); // Process in batches

      if (queryError) {
        log.error('[RAW-PURGE] Query failed — skipping cycle', { error: queryError.message });
        return { purged: 0, failed: 0, total: 0 };
      }

      let purgedCount = 0;
      let failedCount = 0;

      for (const order of orders ?? []) {
        try {
          // List raw uploads for this order in client-uploads bucket
          const { data: files } = await supabase.storage
            .from(STORAGE_BUCKETS.CLIENT_UPLOADS)
            .list(order.id);

          if (files && files.length > 0) {
            const filePaths = files.map((f: { name: string }) => `${order.id}/${f.name}`);
            const { error: removeError } = await supabase.storage
              .from(STORAGE_BUCKETS.CLIENT_UPLOADS)
              .remove(filePaths);

            if (removeError) {
              throw removeError;
            }
          }

          // Mark order as purged
          const { error: updateError } = await supabase
            .from('orders')
            .update({
              raw_uploads_purged: true,
              raw_uploads_purged_at: new Date().toISOString(),
            })
            .eq('id', order.id);

          if (updateError) {
            throw updateError;
          }

          purgedCount++;
          log.info('[RAW-PURGE] Raw uploads purged', {
            orderId: order.id,
            fileCount: files?.length ?? 0,
          });
        } catch (err) {
          failedCount++;
          log.error('[RAW-PURGE] Purge failed', {
            orderId: order.id,
            error: err instanceof Error ? err.message : err,
          });
          // Continue processing remaining orders
        }
      }

      log.info('[RAW-PURGE] Cycle complete', {
        purged: purgedCount,
        failed: failedCount,
        total: orders?.length ?? 0,
      });

      return { purged: purgedCount, failed: failedCount, total: orders?.length ?? 0 };
    });

    logger.info(`Raw upload purge complete: ${result.purged} purged, ${result.failed} failed`);
    return result;
  }
);
