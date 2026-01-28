// /lib/workflow/hold-service.ts
// HOLD workflow management service
// VERSION: 1.0 — January 28, 2026

import { createClient } from '@/lib/supabase/server';
import {
  getHoldNextAction,
  shouldAutoRefund,
  HOLD_TIMEOUT_CONFIG,
  type HoldStage
} from '@/lib/config/workflow-config';

export interface HoldData {
  orderId: string;
  workflowId?: string;
  phase: string;
  reason: string;
  details: HoldDetail[];
}

export interface HoldDetail {
  type: 'CRITICAL_GAP' | 'MISSING_DECLARATION' | 'EVIDENCE_ISSUE' | 'VERIFICATION_FAILED';
  description: string;
  requiredAction: string;
}

export interface HoldStatus {
  orderId: string;
  isOnHold: boolean;
  holdTriggeredAt: Date | null;
  holdReason: string | null;
  currentStage: HoldStage | null;
  nextAction: string | null;
  nextActionAt: Date | null;
  shouldAutoRefund: boolean;
}

/**
 * Trigger HOLD on an order
 */
export async function triggerHold(holdData: HoldData): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient();
    const now = new Date().toISOString();

    // Update order status
    const { error: updateError } = await supabase
      .from('orders')
      .update({
        status: 'on_hold',
        hold_triggered_at: now,
        hold_reason: holdData.reason,
        current_phase: holdData.phase,
        updated_at: now,
      })
      .eq('id', holdData.orderId);

    if (updateError) {
      console.error('[HoldService] Failed to update order:', updateError);
      return { success: false, error: updateError.message };
    }

    // Update workflow if workflowId provided
    if (holdData.workflowId) {
      await supabase
        .from('order_workflows')
        .update({
          status: 'on_hold',
          checkpoint_pending: 'HOLD',
          hold_triggered_at: now,
          hold_reason: holdData.reason,
          current_phase: holdData.phase,
        })
        .eq('id', holdData.workflowId);
    }

    // Create workflow event for audit trail
    const { error: eventError } = await supabase
      .from('workflow_events')
      .insert({
        order_id: holdData.orderId,
        workflow_id: holdData.workflowId || null,
        event_type: 'HOLD_TRIGGERED',
        phase: holdData.phase,
        data: {
          reason: holdData.reason,
          details: holdData.details,
          triggered_at: now,
        },
        created_at: now,
      });

    if (eventError) {
      console.error('[HoldService] Failed to create event:', eventError);
      // Don't fail the operation - order is already on hold
    }

    // Queue notification email
    await queueHoldNotification(holdData.orderId, 'initial');

    console.log(`[HoldService] Order ${holdData.orderId} placed on HOLD: ${holdData.reason}`);
    return { success: true };
  } catch (error) {
    console.error('[HoldService] Error triggering hold:', error);
    return { success: false, error: String(error) };
  }
}

/**
 * Resume an order from HOLD status
 */
export async function resumeHold(
  orderId: string,
  resumedBy: string,
  acknowledgmentText?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient();
    const now = new Date().toISOString();

    // Get current order state
    const { data: order, error: fetchError } = await supabase
      .from('orders')
      .select('status, hold_triggered_at, current_phase')
      .eq('id', orderId)
      .single();

    if (fetchError || !order) {
      return { success: false, error: 'Order not found' };
    }

    if (order.status !== 'on_hold') {
      return { success: false, error: 'Order is not on hold' };
    }

    // Update order to resume processing
    const { error: updateError } = await supabase
      .from('orders')
      .update({
        status: 'in_progress',
        hold_triggered_at: null,
        hold_reason: null,
        updated_at: now,
      })
      .eq('id', orderId);

    if (updateError) {
      return { success: false, error: updateError.message };
    }

    // Update workflow if exists
    const { data: workflow } = await supabase
      .from('order_workflows')
      .select('id')
      .eq('order_id', orderId)
      .eq('status', 'on_hold')
      .single();

    if (workflow) {
      await supabase
        .from('order_workflows')
        .update({
          status: 'in_progress',
          checkpoint_pending: null,
          hold_response: acknowledgmentText ? 'PROCEED_WITH_ACKNOWLEDGMENT' : 'PROVIDE_ADDITIONAL_EVIDENCE',
          hold_response_at: now,
          hold_acknowledgment_text: acknowledgmentText || null,
        })
        .eq('id', workflow.id);
    }

    // Log resume event
    await supabase
      .from('workflow_events')
      .insert({
        order_id: orderId,
        event_type: 'HOLD_RESUMED',
        phase: order.current_phase,
        data: {
          resumed_by: resumedBy,
          resumed_at: now,
          acknowledgment_text: acknowledgmentText || null,
          hold_duration_hours: order.hold_triggered_at
            ? (Date.now() - new Date(order.hold_triggered_at).getTime()) / (1000 * 60 * 60)
            : null,
        },
        created_at: now,
      });

    console.log(`[HoldService] Order ${orderId} resumed from HOLD by ${resumedBy}`);
    return { success: true };
  } catch (error) {
    console.error('[HoldService] Error resuming hold:', error);
    return { success: false, error: String(error) };
  }
}

/**
 * Process auto-refund for expired HOLD
 */
export async function processAutoRefund(orderId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient();
    const now = new Date().toISOString();

    // Get order details
    const { data: order, error: fetchError } = await supabase
      .from('orders')
      .select('id, client_id, stripe_payment_intent_id, total_price, hold_triggered_at, order_number')
      .eq('id', orderId)
      .single();

    if (fetchError || !order) {
      return { success: false, error: 'Order not found' };
    }

    // Verify auto-refund should happen
    if (!order.hold_triggered_at || !shouldAutoRefund(order.hold_triggered_at)) {
      return { success: false, error: 'Order does not qualify for auto-refund' };
    }

    // Update order status
    const { error: updateError } = await supabase
      .from('orders')
      .update({
        status: 'refunded',
        updated_at: now,
      })
      .eq('id', orderId);

    if (updateError) {
      return { success: false, error: updateError.message };
    }

    // Create refund record
    await supabase
      .from('refunds')
      .insert({
        order_id: orderId,
        amount_cents: Math.round((order.total_price || 0) * 100),
        reason: 'HOLD_TIMEOUT',
        refund_type: 'FULL',
        status: 'pending',
      });

    // Log refund event
    await supabase
      .from('workflow_events')
      .insert({
        order_id: orderId,
        event_type: 'AUTO_REFUND_PROCESSED',
        phase: 'HOLD',
        data: {
          reason: 'HOLD timeout exceeded 14 days',
          hold_triggered_at: order.hold_triggered_at,
          refunded_at: now,
          amount: order.total_price,
        },
        created_at: now,
      });

    // Send refund notification
    await queueHoldNotification(orderId, 'auto_refund');

    console.log(`[HoldService] Auto-refund processed for order ${orderId}`);
    return { success: true };
  } catch (error) {
    console.error('[HoldService] Error processing auto-refund:', error);
    return { success: false, error: String(error) };
  }
}

/**
 * Get current HOLD status for an order
 */
export async function getHoldStatus(orderId: string): Promise<HoldStatus | null> {
  try {
    const supabase = await createClient();

    const { data: order, error } = await supabase
      .from('orders')
      .select('id, status, hold_triggered_at, hold_reason')
      .eq('id', orderId)
      .single();

    if (error || !order) {
      return null;
    }

    const isOnHold = order.status === 'on_hold';

    if (!isOnHold || !order.hold_triggered_at) {
      return {
        orderId,
        isOnHold: false,
        holdTriggeredAt: null,
        holdReason: null,
        currentStage: null,
        nextAction: null,
        nextActionAt: null,
        shouldAutoRefund: false,
      };
    }

    const holdAction = getHoldNextAction(order.hold_triggered_at);

    return {
      orderId,
      isOnHold: true,
      holdTriggeredAt: new Date(order.hold_triggered_at),
      holdReason: order.hold_reason,
      currentStage: holdAction.stage,
      nextAction: holdAction.action,
      nextActionAt: holdAction.nextActionAt,
      shouldAutoRefund: holdAction.shouldRefund,
    };
  } catch (error) {
    console.error('[HoldService] Error getting hold status:', error);
    return null;
  }
}

/**
 * Queue hold notification email
 */
async function queueHoldNotification(
  orderId: string,
  stage: keyof typeof HOLD_TIMEOUT_CONFIG.EMAIL_TEMPLATES
): Promise<void> {
  try {
    const supabase = await createClient();
    const template = HOLD_TIMEOUT_CONFIG.EMAIL_TEMPLATES[stage];

    // Check if email_queue table exists, otherwise log
    const { error } = await supabase
      .from('email_queue')
      .insert({
        order_id: orderId,
        template_id: template,
        status: 'pending',
        created_at: new Date().toISOString(),
      });

    if (error) {
      // Table might not exist - log to automation_logs instead
      console.warn('[HoldService] Failed to queue email, logging to automation_logs:', error.message);
      await supabase
        .from('automation_logs')
        .insert({
          order_id: orderId,
          action_type: 'hold_notification_queued',
          action_details: {
            template,
            stage,
            queued_at: new Date().toISOString(),
          },
        });
    }
  } catch (error) {
    console.error('[HoldService] Failed to queue notification:', error);
  }
}

/**
 * Process all orders on HOLD and send appropriate notifications/refunds
 * This should be called by a cron job
 */
export async function processHoldTimeouts(): Promise<{ processed: number; refunded: number; errors: number }> {
  const supabase = await createClient();
  let processed = 0;
  let refunded = 0;
  let errors = 0;

  // Get all orders on hold
  const { data: holdOrders, error } = await supabase
    .from('orders')
    .select('id, hold_triggered_at, order_number')
    .eq('status', 'on_hold')
    .not('hold_triggered_at', 'is', null);

  if (error || !holdOrders) {
    console.error('[HoldService] Failed to fetch hold orders:', error);
    return { processed: 0, refunded: 0, errors: 1 };
  }

  for (const order of holdOrders) {
    try {
      const holdAction = getHoldNextAction(order.hold_triggered_at);

      if (holdAction.shouldRefund) {
        const result = await processAutoRefund(order.id);
        if (result.success) {
          refunded++;
        } else {
          errors++;
        }
      } else {
        // Log current status
        console.log(`[HoldService] Order ${order.order_number || order.id} at stage ${holdAction.stage}`);
      }

      processed++;
    } catch (error) {
      console.error(`[HoldService] Error processing order ${order.id}:`, error);
      errors++;
    }
  }

  console.log(`[HoldService] Processed ${processed} orders, refunded ${refunded}, errors ${errors}`);
  return { processed, refunded, errors };
}

/**
 * Cancel an order on HOLD (user-initiated)
 */
export async function cancelHoldOrder(
  orderId: string,
  cancelledBy: string,
  reason?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient();
    const now = new Date().toISOString();

    const { error: updateError } = await supabase
      .from('orders')
      .update({
        status: 'cancelled',
        hold_triggered_at: null,
        hold_reason: null,
        updated_at: now,
      })
      .eq('id', orderId)
      .eq('status', 'on_hold');

    if (updateError) {
      return { success: false, error: updateError.message };
    }

    // Log cancellation event
    await supabase
      .from('workflow_events')
      .insert({
        order_id: orderId,
        event_type: 'HOLD_CANCELLED',
        phase: 'HOLD',
        data: {
          cancelled_by: cancelledBy,
          reason: reason || 'User requested cancellation',
          cancelled_at: now,
        },
        created_at: now,
      });

    console.log(`[HoldService] Order ${orderId} cancelled from HOLD by ${cancelledBy}`);
    return { success: true };
  } catch (error) {
    console.error('[HoldService] Error cancelling hold order:', error);
    return { success: false, error: String(error) };
  }
}
