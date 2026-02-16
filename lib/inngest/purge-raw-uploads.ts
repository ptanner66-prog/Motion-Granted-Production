/**
 * ST6-02: Raw Upload Purge Job
 *
 * Purges raw client uploads 7 days after order completion.
 * Only purges for COMPLETED orders to prevent destroying source files
 * that may be needed for revisions in active states.
 *
 * Sets raw_uploads_purged = true so revision workflows can detect
 * when original evidence is unavailable and inject a disclaimer.
 *
 * Runs daily at 3 AM Central (after auto-delete at 2 AM).
 */

import { inngest } from './client';
import { getServiceSupabase } from '@/lib/supabase/admin';
import { createLogger } from '@/lib/security/logger';

const log = createLogger('purge-raw-uploads');

const RAW_UPLOADS_PURGE_DAYS = 7;
const CLIENT_UPLOADS_BUCKET = 'client-uploads';

export const purgeRawUploads = inngest.createFunction(
  {
    id: 'retention-purge-raw-uploads',
    name: 'Purge Raw Client Uploads',
    retries: 2,
  },
  { cron: 'TZ=America/Chicago 0 3 * * *' }, // 3 AM Central daily
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async ({ step, logger }: { step: any; logger: any }) => {
    const candidates = await step.run('fetch-purge-candidates', async () => {
      const supabase = getServiceSupabase();
      const cutoffDate = new Date(Date.now() - RAW_UPLOADS_PURGE_DAYS * 86_400_000).toISOString();

      // Only purge for COMPLETED orders past the 7-day window.
      // Do NOT purge orders in active states (REVISION_REQ, PROCESSING, etc.)
      const { data, error } = await supabase
        .from('orders')
        .select('id')
        .eq('status', 'COMPLETED')
        .eq('raw_uploads_purged', false)
        .lte('completed_at', cutoffDate)
        .is('deleted_at', null);

      if (error) {
        log.error('[RAW-PURGE] Query failed — skipping cycle', { error: error.message });
        throw error; // Let Inngest retry
      }

      return data ?? [];
    });

    logger.info(`Found ${candidates.length} orders for raw upload purge`);

    if (candidates.length === 0) {
      return { total: 0, purged: 0, failed: 0 };
    }

    const results = { total: candidates.length, purged: 0, failed: 0 };

    for (const order of candidates) {
      const success = await step.run(`purge-${order.id}`, async () => {
        const supabase = getServiceSupabase();

        try {
          // List raw uploads for this order
          const { data: files } = await supabase.storage
            .from(CLIENT_UPLOADS_BUCKET)
            .list(order.id);

          if (files && files.length > 0) {
            const filePaths = files.map((f: { name: string }) => `${order.id}/${f.name}`);
            const { error: removeError } = await supabase.storage
              .from(CLIENT_UPLOADS_BUCKET)
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

          log.info('[RAW-PURGE] Raw uploads purged', {
            orderId: order.id,
            fileCount: files?.length ?? 0,
          });
          return true;
        } catch (err) {
          log.error('[RAW-PURGE] Purge failed', {
            orderId: order.id,
            error: err instanceof Error ? err.message : err,
          });
          return false;
        }
      });

      if (success) {
        results.purged++;
      } else {
        results.failed++;
      }
    }

    logger.info(`Raw upload purge complete: ${results.purged} purged, ${results.failed} failed`);
    return results;
  }
);
