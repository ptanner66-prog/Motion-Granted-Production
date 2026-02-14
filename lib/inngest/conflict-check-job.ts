// lib/inngest/conflict-check-job.ts
// Inngest job to run conflict check on new orders
// VERSION: 1.0.0

import { inngest } from './client';
import { checkForConflicts } from '@/lib/conflicts';
import { createClient } from '@/lib/supabase/server';
import { createLogger } from '@/lib/security/logger';

const log = createLogger('inngest-conflict-check');

/**
 * Conflict check job - runs when new order is created
 */
export const conflictCheckJob = inngest.createFunction(
  {
    id: 'conflict-check',
    name: 'Conflict Check',
    retries: 3,
  },
  { event: 'order/created' },
  async ({ event, step }) => {
    const orderId = event.data.orderId;

    // Step 1: Fetch order details
    const order = await step.run('fetch-order', async () => {
      const supabase = await createClient();
      const { data, error } = await supabase
        .from('orders')
        .select('id, case_number, party_name, opposing_party_name, attorney_id, court, jurisdiction')
        .eq('id', orderId)
        .single();

      if (error) throw new Error(`Failed to fetch order: ${error.message}`);
      return data;
    });

    // Step 2: Run conflict check
    const result = await step.run('check-conflicts', async () => {
      return await checkForConflicts({
        orderId: order.id,
        caseNumber: order.case_number || '',
        partyName: order.party_name || '',
        opposingParty: order.opposing_party_name || '',
        attorneyId: order.attorney_id,
        court: order.court || '',
        jurisdiction: order.jurisdiction || ''
      });
    });

    // Step 3: Handle blocking conflicts
    if (result.hasBlockingConflicts) {
      await step.run('handle-blocking', async () => {
        const supabase = await createClient();

        // Update order status
        await supabase
          .from('orders')
          .update({
            status: 'CONFLICT_REVIEW',
            updated_at: new Date().toISOString()
          })
          .eq('id', orderId);

        // Log blocking conflict
        log.warn('Blocking conflict detected', { orderId, conflicts: result.summary });
      });
    }

    return {
      orderId,
      conflicts: result.summary,
      hasBlockingConflicts: result.hasBlockingConflicts
    };
  }
);
