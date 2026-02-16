/**
 * Orphaned cost_tracking Reconciliation — D3 Task 21
 *
 * Daily cron (3 AM CT) that detects cost_tracking rows where the parent
 * order no longer exists. Does NOT auto-delete — preserves for forensics.
 * Alerts admin via email_queue with sample order IDs.
 */

import { inngest } from '@/lib/inngest/client';
import { getServiceSupabase } from '@/lib/supabase/admin';

export const reconcileCostTracking = inngest.createFunction(
  { id: 'reconcile-cost-tracking', retries: 2 },
  { cron: '0 3 * * *' }, // Daily at 3 AM CT
  async ({ step }) => {
    await step.run('find-orphaned-rows', async () => {
      const supabase = getServiceSupabase();

      const { data: orphans, error } = await supabase.rpc(
        'find_orphaned_cost_tracking'
      );

      if (error) {
        throw new Error('Orphan detection query failed: ' + error.message);
      }

      if (!orphans || orphans.length === 0) {
        console.log('[reconcile] No orphaned cost_tracking rows found');
        return;
      }

      console.warn('[reconcile] Orphaned cost_tracking rows detected', {
        count: orphans.length,
        sampleOrderIds: orphans.slice(0, 10).map((r: { order_id: string }) => r.order_id),
        totalCost: orphans.reduce(
          (sum: number, r: { total_cost: number }) => sum + (r.total_cost || 0),
          0
        ),
      });

      // DO NOT auto-delete. Preserve for forensics.
      await supabase.from('email_queue').insert({
        order_id: null,
        template_id: 'admin-alert',
        template_data: {
          alertType: 'ORPHANED_COST_TRACKING',
          message: `${orphans.length} orphaned cost_tracking rows found. Manual investigation required.`,
          sampleOrderIds: orphans.slice(0, 5).map((r: { order_id: string }) => r.order_id),
        },
        status: 'PENDING',
      });
    });
  }
);
