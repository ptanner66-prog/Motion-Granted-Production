/**
 * Webhook Events Archival Job (SP-11 AF-4)
 *
 * Source: D7-NEW-011 | Priority: P2
 *
 * Daily cron (3:30 AM CT) archives webhook events:
 * - Older than 90 days
 * - Already processed
 * - NOT for active orders
 *
 * "Archive" = null out payload, keep summary fields.
 * Batch size: 500 per run.
 *
 * @module inngest/functions/webhook-archival
 */

import { inngest } from '../client';

export const webhookArchival = inngest.createFunction(
  { id: 'webhook-archival', name: 'Daily Webhook Events Archival' },
  { cron: 'TZ=America/Chicago 30 3 * * *' }, // 3:30 AM CT (offset from reconciliation at 3:00 AM)
  async ({ step }) => {
    let archived = 0;
    let skipped = 0;
    let errors = 0;

    await step.run('archive-stale-events', async () => {
      const { createClient } = await import('@supabase/supabase-js');
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
      );

      const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

      // Active statuses — never archive events for these orders
      const ACTIVE_STATUSES = [
        'PAID', 'PROCESSING', 'AWAITING_APPROVAL',
        'UPGRADE_PENDING', 'PENDING_CONFLICT_REVIEW', 'DISPUTED',
      ];

      // Get candidate events (processed, older than 90 days)
      const { data: candidates } = await supabase
        .from('webhook_events')
        .select('id, order_id')
        .eq('processed', true)
        .lt('created_at', ninetyDaysAgo)
        .limit(500); // Batch processing

      if (!candidates) return;

      for (const event of candidates) {
        try {
          // Check order status — skip active orders
          if (event.order_id) {
            const { data: order } = await supabase
              .from('orders')
              .select('status')
              .eq('id', event.order_id)
              .single();

            if (order && ACTIVE_STATUSES.includes(order.status)) {
              skipped++;
              continue;
            }
          }

          // Archive: null out payload, keep summary fields
          await supabase
            .from('webhook_events')
            .update({ payload: null })
            .eq('id', event.id);

          archived++;
        } catch (err) {
          errors++;
          console.warn(`[ARCHIVAL] Failed to archive event ${event.id}:`, err);
        }
      }
    });

    console.log(`[ARCHIVAL] Complete: archived=${archived}, skipped=${skipped}, errors=${errors}`);
    return { archived, skipped, errors, runDate: new Date() };
  },
);
