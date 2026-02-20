/**
 * Orphan Sweep + Retention Purge — ST-039 + C-012
 *
 * Runs every Sunday at 3AM CST.
 * 1. Finds storage files with no database record (orphans >24h old)
 * 2. Purges archived files older than 180 days
 *
 * MUST be registered in Inngest serve() per Directive 5.
 *
 * SP-17 D6 Phase 6
 */
import { inngest } from './client';
import { getServiceSupabase } from '@/lib/supabase/admin';
import { createLogger } from '@/lib/security/logger';
import { STORAGE_BUCKETS } from '@/lib/config/storage';

const log = createLogger('orphan-sweep');

export const orphanSweepCron = inngest.createFunction(
  { id: 'orphan-sweep-cron' },
  { cron: 'TZ=America/Chicago 0 3 * * 0' }, // Sunday 3AM CST
  async ({ step }) => {
    // Step 1: Orphan sweep
    const orphanResult = await step.run('sweep-orphans', async () => {
      const supabase = getServiceSupabase();
      const buckets = [
        STORAGE_BUCKETS.ORDER_DOCUMENTS,
        STORAGE_BUCKETS.CLIENT_UPLOADS,
      ];
      let totalOrphans = 0;

      for (const bucket of buckets) {
        const { data: files } = await supabase.storage
          .from(bucket)
          .list('', { limit: 1000 });

        if (!files) continue;

        for (const folder of files) {
          const { data: folderFiles } = await supabase.storage
            .from(bucket)
            .list(folder.name, { limit: 100 });

          // Check if this folder's order has legal_hold before processing files
          const folderOrderId = folder.name;
          const { data: folderOrder } = await supabase
            .from('orders')
            .select('legal_hold')
            .eq('id', folderOrderId)
            .single();

          if (folderOrder?.legal_hold) {
            log.info(`[orphan-sweep] Skipping folder ${folderOrderId} — legal_hold active`);
            continue;
          }

          for (const file of folderFiles || []) {
            // Check if file has a database record
            const filePath = `${bucket}/${folder.name}/${file.name}`;
            const { count } = await supabase
              .from('documents')
              .select('id', { count: 'exact', head: true })
              .eq('file_url', filePath);

            if ((count || 0) === 0) {
              // Check file age (>24h before deletion to avoid race conditions)
              const fileAge =
                Date.now() - new Date(file.created_at || '').getTime();
              if (fileAge > 24 * 60 * 60 * 1000) {
                await supabase.storage
                  .from(bucket)
                  .remove([`${folder.name}/${file.name}`]);
                totalOrphans++;
              }
            }
          }
        }
      }

      log.info('Orphan sweep complete', { totalOrphans });
      return { orphansDeleted: totalOrphans };
    });

    // Step 2: Retention purge (180-day)
    const purgeResult = await step.run(
      'purge-expired-archives',
      async () => {
        const supabase = getServiceSupabase();
        const cutoff = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000);

        const { data: expired } = await supabase
          .from('delivery_packages')
          .select('id, order_id')
          .eq('archive_status', 'ARCHIVED')
          .lt('updated_at', cutoff.toISOString())
          .limit(100);

        let purged = 0;
        for (const pkg of expired || []) {
          try {
            // List and delete archive files
            const { data: archiveFiles } = await supabase.storage
              .from(STORAGE_BUCKETS.ORDER_ARCHIVE)
              .list(pkg.order_id);

            if (archiveFiles && archiveFiles.length > 0) {
              const paths = archiveFiles.map(
                (f: { name: string }) => `${pkg.order_id}/${f.name}`
              );
              await supabase.storage
                .from(STORAGE_BUCKETS.ORDER_ARCHIVE)
                .remove(paths);
            }

            await supabase
              .from('delivery_packages')
              .update({
                archive_status: 'PURGED',
                updated_at: new Date().toISOString(),
              })
              .eq('id', pkg.id);
            purged++;
          } catch (err) {
            log.error('Purge failed for package', {
              packageId: pkg.id,
              error: err instanceof Error ? err.message : String(err),
            });
          }
        }

        log.info('Retention purge complete', { purged });
        return { purged };
      }
    );

    return { orphans: orphanResult, purge: purgeResult };
  }
);
