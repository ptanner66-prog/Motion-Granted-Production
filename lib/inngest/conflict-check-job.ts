// lib/inngest/conflict-check-job.ts
// Inngest job to run conflict check on new orders
// T-86: Fixed ghost columns (party_name→client_id+profiles join, attorney_id→client_id, court→court_name)
// T-90: Added terminal status filter to exclude cancelled/completed orders
// T-91: Emit conflict/review-started when blocking conflicts detected
// GAP-1: Fixed trigger event (order/created→order/submitted)
// VERSION: 2.0.0

import { inngest } from './client';
import { checkForConflicts } from '@/lib/conflicts';
import { getServiceSupabase } from '@/lib/supabase/admin';
import { createLogger } from '@/lib/security/logger';
import { updateOrderColumns } from '@/lib/orders/update-columns';

const log = createLogger('inngest-conflict-check');

/**
 * Conflict check job - runs when new order is submitted
 * GAP-1: Changed trigger from 'order/created' (never emitted) to 'order/submitted'
 */
export const conflictCheckJob = inngest.createFunction(
  {
    id: 'conflict-check',
    name: 'Conflict Check',
    retries: 3,
  },
  { event: 'order/submitted' },
  async ({ event, step }) => {
    const orderId = event.data.orderId;

    // Step 1: Fetch order details
    // T-86: Fixed ghost columns — use client_id (not attorney_id), court_name (not court)
    // Party name comes from profiles via client_id join
    const order = await step.run('fetch-order', async () => {
      const supabase = getServiceSupabase();
      const { data, error } = await supabase
        .from('orders')
        .select('id, case_number, client_id, opposing_party_name, court_name, jurisdiction, status')
        .eq('id', orderId)
        .single();

      if (error) throw new Error(`Failed to fetch order: ${error.message}`);

      // T-90: Skip conflict check for terminal status orders
      if (data.status === 'CANCELLED' ||
          data.status === 'COMPLETED') {
        return { ...data, _skipConflictCheck: true, clientName: '' };
      }

      // Fetch client name from profiles (party_name doesn't exist on orders)
      let clientName = '';
      if (data.client_id) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('full_name')
          .eq('id', data.client_id)
          .single();
        clientName = profile?.full_name || '';
      }

      return { ...data, _skipConflictCheck: false, clientName };
    });

    // T-90: Early exit for terminal status orders
    if (order._skipConflictCheck) {
      return { orderId, skipped: true, reason: `Order status is ${order.status}` };
    }

    // Step 2: Run conflict check
    // T-86: Use correct field names — clientName from profiles, client_id as attorneyId
    const result = await step.run('check-conflicts', async () => {
      return await checkForConflicts({
        orderId: order.id,
        caseNumber: order.case_number || '',
        partyName: order.clientName || '',
        opposingParty: order.opposing_party_name || '',
        attorneyId: order.client_id || '',
        court: order.court_name || '',
        jurisdiction: order.jurisdiction || ''
      });
    });

    // Step 3: Write-back conflict check results to orders table
    await step.run('write-conflict-results', async () => {
      const supabase = getServiceSupabase();

      await updateOrderColumns(supabase, orderId, {
        conflict_checked: true,
        conflict_cleared: !result.hasBlockingConflicts,
        conflict_check_completed_at: new Date().toISOString(),
        conflict_notes: result.hasBlockingConflicts
          ? `Blocking conflicts detected: ${result.summary || 'See conflict details'}`
          : 'No blocking conflicts found',
      }, 'conflict-check-job');
    });

    // Step 4: Handle blocking conflicts
    if (result.hasBlockingConflicts) {
      await step.run('handle-blocking', async () => {
        const supabase = getServiceSupabase();

        // Update order status
        await supabase
          .from('orders')
          .update({
            status: 'pending_conflict_review',
            conflict_flagged: true,
            updated_at: new Date().toISOString()
          })
          .eq('id', orderId);

        // Log blocking conflict
        log.warn('Blocking conflict detected', { orderId, conflicts: result.summary });
      });

      // T-91: Emit event to start auto-cancel timer
      await step.run('emit-review-started', async () => {
        await inngest.send({
          name: 'conflict/review-started',
          data: {
            orderId,
            detectedAt: new Date().toISOString(),
          },
        });
      });
    }

    return {
      orderId,
      conflicts: result.summary,
      hasBlockingConflicts: result.hasBlockingConflicts
    };
  }
);
