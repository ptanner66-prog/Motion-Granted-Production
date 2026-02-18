// /lib/workflow/hold-service.ts
// VERSION: 1.0 — January 28, 2026

import { createClient } from '@/lib/supabase/server';
import { HOLD_TIMEOUTS, getHoldStageAndNextAction, type Phase } from '@/lib/config/workflow-config';
import { createLogger } from '@/lib/security/logger';
import { inngest } from '@/lib/inngest/client';

const log = createLogger('workflow-hold-service');

export interface HoldResult { success: boolean; holdId?: string; error?: string; }

export async function triggerHold(orderId: string, phase: Phase, reason: string): Promise<HoldResult> {
  try {
    const supabase = await createClient();
    const now = new Date().toISOString();

    const { error: orderError } = await supabase
      .from('orders')
      .update({ status: 'HOLD_PENDING', hold_triggered_at: now, hold_phase: phase, hold_reason: reason, updated_at: now })
      .eq('id', orderId);

    if (orderError) return { success: false, error: orderError.message };

    const { data: event } = await supabase
      .from('checkpoint_events')
      .insert({ order_id: orderId, event_type: 'HOLD_TRIGGERED', phase, data: { reason, triggered_at: now }, created_at: now })
      .select('id')
      .single();

    await supabase.from('email_queue').insert({ order_id: orderId, template: HOLD_TIMEOUTS.EMAIL_TEMPLATES.initial, data: { reason }, status: 'pending', created_at: now });

    log.info('Order placed on HOLD', { orderId, phase });
    return { success: true, holdId: event?.id };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

export async function resumeFromHold(orderId: string): Promise<HoldResult> {
  try {
    const supabase = await createClient();
    const now = new Date().toISOString();

    const { data: order, error: fetchError } = await supabase
      .from('orders')
      .select('status, hold_phase')
      .eq('id', orderId)
      .single();

    if (fetchError || !order) return { success: false, error: 'Order not found' };
    // SP12-07 FIX: Accept both 'hold_pending' (from hold-service triggerHold) and 'on_hold'
    // (from workflow-orchestration HOLD handler). Without this, resumeFromHold() always failed
    // for orders placed on hold by the workflow because it set status='on_hold', not 'hold_pending'.
    if (order.status !== 'HOLD_PENDING' && order.status !== 'hold_pending' && order.status !== 'on_hold' && order.status !== 'ON_HOLD') return { success: false, error: 'Order not on hold' };

    await supabase.from('orders').update({ status: 'IN_PROGRESS', hold_resolved_at: now, updated_at: now }).eq('id', orderId);
    await supabase.from('checkpoint_events').insert({ order_id: orderId, event_type: 'HOLD_RESOLVED', phase: order.hold_phase, data: { resolved_at: now }, created_at: now });

    // FIX-E FIX 10: Emit checkpoint/hold.resolved so the orchestrator's waitForEvent unblocks
    await inngest.send({
      name: 'checkpoint/hold.resolved',
      data: {
        orderId,
        action: 'RESUMED',
        holdReason: 'customer_resolved',
        resolvedBy: 'customer',
      },
    });

    log.info('Order resumed from HOLD (event emitted)', { orderId });
    return { success: true };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

export async function processHoldAutoRefund(orderId: string): Promise<HoldResult> {
  try {
    const supabase = await createClient();
    const now = new Date().toISOString();

    await supabase.from('orders').update({ status: 'REFUNDED', refund_reason: 'hold_timeout', refunded_at: now, updated_at: now }).eq('id', orderId);
    await supabase.from('checkpoint_events').insert({ order_id: orderId, event_type: 'HOLD_AUTO_REFUND', data: { refunded_at: now }, created_at: now });
    await supabase.from('email_queue').insert({ order_id: orderId, template: HOLD_TIMEOUTS.EMAIL_TEMPLATES.auto_refund, data: { reason: 'hold_timeout_7_days' }, status: 'pending', created_at: now });

    log.info('Order auto-refunded after HOLD timeout', { orderId });
    return { success: true };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

export async function processHoldTimeouts(): Promise<{ processed: number; errors: string[] }> {
  const supabase = await createClient();
  const errors: string[] = [];
  let processed = 0;

  // SP12-07 FIX: Also include 'on_hold' status (set by workflow orchestration)
  const { data: orders } = await supabase
    .from('orders')
    .select('id, hold_triggered_at, hold_reminder_sent, hold_escalated')
    .in('status', ['hold_pending', 'on_hold'])
    .not('hold_triggered_at', 'is', null);

  for (const order of orders || []) {
    try {
      const { currentStage, shouldAutoRefund } = getHoldStageAndNextAction(new Date(order.hold_triggered_at));
      if (shouldAutoRefund) { await processHoldAutoRefund(order.id); processed++; continue; }
      if (currentStage === 'escalated' && !order.hold_escalated) {
        await supabase.from('orders').update({ hold_escalated: true }).eq('id', order.id);
        await supabase.from('email_queue').insert({ order_id: order.id, template: HOLD_TIMEOUTS.EMAIL_TEMPLATES.escalation_72h, data: {}, status: 'pending', created_at: new Date().toISOString() });
        processed++;
      } else if (currentStage === 'reminder_sent' && !order.hold_reminder_sent) {
        await supabase.from('orders').update({ hold_reminder_sent: true }).eq('id', order.id);
        await supabase.from('email_queue').insert({ order_id: order.id, template: HOLD_TIMEOUTS.EMAIL_TEMPLATES.reminder_24h, data: {}, status: 'pending', created_at: new Date().toISOString() });
        processed++;
      }
    } catch (e) { errors.push(`${order.id}: ${e}`); }
  }
  return { processed, errors };
}
