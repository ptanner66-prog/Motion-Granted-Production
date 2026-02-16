/**
 * Audit Trail Retry — D3 Task 18
 *
 * Secondary Inngest event handler for retrying failed audit trail inserts.
 * When recordCostCapExit() fails in loop-counter.ts, it emits
 * 'order/audit-trail-retry' which this function handles with
 * exponential backoff (3 retries, starting at 30s).
 */

import { inngest } from '@/lib/inngest/client';
import { getServiceSupabase } from '@/lib/supabase/admin';

export const retryAuditTrail = inngest.createFunction(
  {
    id: 'retry-audit-trail',
    retries: 3,
    backoff: { type: 'exponential', initialDelay: '30s' },
  },
  { event: 'order/audit-trail-retry' },
  async ({ event, step }) => {
    const { orderId, trigger, details } = event.data;

    await step.run('insert-audit-trail-entry', async () => {
      const supabase = getServiceSupabase();

      const { data: loopCounter } = await supabase
        .from('loop_counters')
        .select('id')
        .eq('order_id', orderId)
        .single();

      if (!loopCounter) {
        console.error(
          `[retry-audit] No loop_counter for order ${orderId}. Creating audit event without loop reference.`
        );
        return;
      }

      const { error } = await supabase.from('loop_sources').insert({
        loop_counter_id: loopCounter.id,
        trigger,
        details: details + ' [RETRIED via audit-trail-retry]',
      });

      if (error) {
        throw new Error(`Audit trail retry INSERT failed: ${error.message}`);
      }

      console.log(`[retry-audit] Successfully inserted audit trail for order ${orderId}`);
    });
  }
);
