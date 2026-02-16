/**
 * CP3 Timeout Management
 *
 * SP-4 Task 8 (D5 W3-1): Schedule and cancel CP3 timeout reminders.
 *
 * Timeline:
 *   T+0:    CP3 entered — scheduleCP3Timeouts() called
 *   T+48h:  First reminder email to attorney
 *   T+72h:  Second reminder email
 *   T+14d:  Final notice (Stage 1 → Stage 2 transition)
 *   T+21d:  Auto-cancel with 50% refund
 *
 * Depends on: SP-2 W1-1 (checkpoint_reminders table, pending_inngest_jobs column)
 */

import { SupabaseClient } from '@supabase/supabase-js';

const CP3_SCHEDULE = [
  { type: 'reminder_48h', delay: '48h' },
  { type: 'reminder_72h', delay: '72h' },
  { type: 'final_notice_14d', delay: '14d' },
  { type: 'auto_cancel_21d', delay: '21d' },
] as const;

/**
 * Schedule all CP3 timeout jobs when attorney review begins.
 * Records the schedule in orders.pending_inngest_jobs and checkpoint_reminders.
 *
 * Actual Inngest job dispatch is handled by the workflow orchestrator
 * (Fn2) which reads pending_inngest_jobs and creates step.sleep() calls.
 */
export async function scheduleCP3Timeouts(
  supabase: SupabaseClient,
  orderId: string
): Promise<{ jobIds: string[] }> {
  const schedule = CP3_SCHEDULE.map(s => ({ type: s.type, delay: s.delay }));

  await supabase.from('orders').update({
    pending_inngest_jobs: schedule,
    cp3_entered_at: new Date().toISOString(),
  }).eq('id', orderId);

  // Record in checkpoint_reminders for audit
  await supabase.from('checkpoint_reminders').insert({
    order_id: orderId,
    checkpoint_type: 'CP3',
    job_ids: schedule.map(s => s.type),
  });

  return { jobIds: schedule.map(s => s.type) };
}

/**
 * Cancel all pending CP3 timeout jobs.
 * Called when attorney approves, requests changes, or cancels.
 */
export async function cancelCP3Timeouts(
  supabase: SupabaseClient,
  orderId: string
): Promise<void> {
  await supabase.from('orders').update({
    pending_inngest_jobs: [],
  }).eq('id', orderId);

  await supabase.from('checkpoint_reminders').update({
    cancelled: true,
    cancelled_at: new Date().toISOString(),
  }).match({ order_id: orderId, cancelled: false });
}
