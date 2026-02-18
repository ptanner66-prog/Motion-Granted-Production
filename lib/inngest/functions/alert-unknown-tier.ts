/**
 * Unknown Tier Alert — D3 Task 14
 *
 * Hourly cron that checks for cost_tracking rows with tier=UNKNOWN
 * in the last hour. Alerts admin with sample data for investigation.
 */

import { inngest } from '@/lib/inngest/client';
import { getServiceSupabase } from '@/lib/supabase/admin';

export const alertUnknownTier = inngest.createFunction(
  { id: 'alert-unknown-tier', retries: 1 },
  { cron: '0 * * * *' }, // Hourly
  async ({ step }) => {
    await step.run('check-unknown-tiers', async () => {
      const supabase = getServiceSupabase();
      const oneHourAgo = new Date(Date.now() - 3600000).toISOString();

      const { count } = await supabase
        .from('cost_tracking')
        .select('*', { count: 'exact', head: true })
        .eq('tier', 'UNKNOWN')
        .gte('created_at', oneHourAgo);

      if (count && count > 0) {
        const { data: samples } = await supabase
          .from('cost_tracking')
          .select('order_id, phase, model_used, created_at')
          .eq('tier', 'UNKNOWN')
          .gte('created_at', oneHourAgo)
          .limit(5);

        console.warn('[alert] UNKNOWN tier rows detected:', { count, samples });

        await supabase.from('email_queue').insert({
          order_id: null,
          template: 'admin-alert',
          data: {
            alertType: 'UNKNOWN_TIER_DETECTED',
            message: `${count} cost_tracking rows with tier=UNKNOWN in the last hour`,
            samples,
          },
          status: 'pending',
        });
      }
    });
  }
);
