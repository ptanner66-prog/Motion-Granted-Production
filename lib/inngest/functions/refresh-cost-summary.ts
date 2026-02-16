/**
 * Cost Summary Materialized View Refresh — D3 Task 3
 *
 * Inngest cron that refreshes the order_cost_summary materialized view
 * every 5 minutes via Supabase RPC. CONCURRENTLY refresh to avoid locks.
 */

import { inngest } from '@/lib/inngest/client';
import { getServiceSupabase } from '@/lib/supabase/admin';

export const refreshCostSummary = inngest.createFunction(
  {
    id: 'cost-summary-refresh',
    retries: 2,
  },
  { cron: '*/5 * * * *' }, // Every 5 minutes
  async ({ step }) => {
    await step.run('refresh-materialized-view', async () => {
      const supabase = getServiceSupabase();
      const { error } = await supabase.rpc('refresh_cost_summary');
      if (error) {
        throw new Error('Materialized view refresh failed: ' + error.message);
      }
    });
  }
);
