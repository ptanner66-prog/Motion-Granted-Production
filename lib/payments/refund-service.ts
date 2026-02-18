/**
 * Refund Processing Service
 *
 * Handles refunds for various workflow scenarios:
 * - HOLD timeout (14-day auto-cancel)
 * - Loop 3 exit (Protocol 10)
 * - Conflict cancellation
 * - Customer-requested cancellation
 *
 * Uses the refunds table created in Chunk 1 (Task 31).
 *
 * Source: Gap Analysis A-4
 */

import Stripe from 'stripe';
import { createClient } from '@/lib/supabase/server';
import type { OperationResult } from '@/types/automation';

import { createLogger } from '@/lib/security/logger';

const log = createLogger('payments-refund-service');
// ============================================================================
// TYPES
// ============================================================================

export type RefundReason =
  | 'HOLD_TIMEOUT'
  | 'HOLD_CUSTOMER_CANCEL'
  | 'LOOP_3_EXIT'
  | 'CONFLICT_CANCELLATION'
  | 'CUSTOMER_REQUEST'
  | 'QUALITY_ISSUE'
  | 'ADMIN_OVERRIDE'
  | 'AUTO_CANCEL';

export type RefundType = 'FULL' | 'PARTIAL';

export interface RefundRequest {
  orderId: string;
  reason: RefundReason;
  refundType: RefundType;
  amountCents?: number; // Required for partial refunds
  notes?: string;
  requestedBy?: string; // User ID who requested the refund
}

export interface RefundResult {
  refundId: string;
  stripeRefundId?: string;
  amountCents: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  error?: string;
}

// ============================================================================
// STRIPE CLIENT
// ============================================================================

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
const stripe = stripeSecretKey && !stripeSecretKey.includes('xxxxx')
  ? new Stripe(stripeSecretKey, { apiVersion: '2026-01-28.clover' })
  : null;

// ============================================================================
// REFUND AMOUNTS BY REASON
// ============================================================================

/**
 * Get refund percentage based on reason and order status
 * Per cancellation policy
 */
function getRefundPercentage(reason: RefundReason, orderStatus: string): number {
  switch (reason) {
    case 'HOLD_TIMEOUT':
    case 'HOLD_CUSTOMER_CANCEL':
      // Full refund for HOLD-related cancellations (no work delivered)
      return 100;

    case 'CONFLICT_CANCELLATION':
      // Full refund for conflict (our fault)
      return 100;

    case 'QUALITY_ISSUE':
      // Full refund for quality issues
      return 100;

    case 'LOOP_3_EXIT':
      // Partial refund - work was attempted, customer may keep draft
      return 50;

    case 'CUSTOMER_REQUEST':
      // Depends on order status
      if (orderStatus === 'under_review' || orderStatus === 'in_progress') {
        return 80; // 80% refund before draft delivered
      } else if (orderStatus === 'pending_review' || orderStatus === 'draft_delivered') {
        return 50; // 50% refund after draft delivered
      }
      return 0; // No refund after completion

    case 'AUTO_CANCEL':
      return 100;

    case 'ADMIN_OVERRIDE':
      return 100; // Admin can override

    default:
      return 0;
  }
}

// ============================================================================
// MAIN REFUND FUNCTION
// ============================================================================

/**
 * Process a refund request
 */
export async function processRefund(request: RefundRequest): Promise<OperationResult<RefundResult>> {
  const supabase = await createClient();

  try {
    // Get order details
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('id, order_number, total_price, status, stripe_payment_intent_id, client_id, profiles!orders_client_id_fkey(email, full_name)')
      .eq('id', request.orderId)
      .single();

    if (orderError || !order) {
      return { success: false, error: 'Order not found' };
    }

    if (!order.stripe_payment_intent_id) {
      return { success: false, error: 'No payment found for this order' };
    }

    // Calculate refund amount
    let refundAmountCents: number;

    if (request.refundType === 'PARTIAL' && request.amountCents) {
      refundAmountCents = request.amountCents;
    } else if (request.refundType === 'FULL') {
      refundAmountCents = Math.round(order.total_price * 100);
    } else {
      // Calculate based on reason and policy
      const percentage = getRefundPercentage(request.reason, order.status);
      refundAmountCents = Math.round(order.total_price * 100 * (percentage / 100));
    }

    if (refundAmountCents <= 0) {
      return { success: false, error: 'Refund amount must be greater than 0' };
    }

    // Create refund record in database (pending status)
    const { data: refundRecord, error: insertError } = await supabase
      .from('refunds')
      .insert({
        order_id: request.orderId,
        amount_cents: refundAmountCents,
        reason: request.reason,
        refund_type: request.refundType,
        status: 'pending',
        requested_by: request.requestedBy,
        notes: request.notes,
      })
      .select()
      .single();

    if (insertError || !refundRecord) {
      return { success: false, error: `Failed to create refund record: ${insertError?.message}` };
    }

    // Process refund via Stripe
    if (!stripe) {
      // Stripe not configured - mark as pending for manual processing
      await supabase
        .from('refunds')
        .update({
          status: 'pending',
          error_message: 'Stripe not configured - requires manual processing',
        })
        .eq('id', refundRecord.id);

      log.warn(`[Refund] Stripe not configured. Refund ${refundRecord.id} requires manual processing.`);

      return {
        success: true,
        data: {
          refundId: refundRecord.id,
          amountCents: refundAmountCents,
          status: 'pending',
          error: 'Stripe not configured - requires manual processing',
        },
      };
    }

    // Update status to processing
    await supabase
      .from('refunds')
      .update({ status: 'processing' })
      .eq('id', refundRecord.id);

    try {
      // Create Stripe refund
      const stripeRefund = await stripe.refunds.create({
        payment_intent: order.stripe_payment_intent_id,
        amount: refundAmountCents,
        reason: 'requested_by_customer',
        metadata: {
          order_id: request.orderId,
          order_number: order.order_number,
          refund_id: refundRecord.id,
          reason: request.reason,
        },
      });

      // Update refund record with Stripe details
      await supabase
        .from('refunds')
        .update({
          stripe_refund_id: stripeRefund.id,
          status: 'completed',
          processed_at: new Date().toISOString(),
        })
        .eq('id', refundRecord.id);

      // Update order payment status
      const isFullRefund = refundAmountCents >= Math.round(order.total_price * 100);
      await supabase
        .from('orders')
        .update({
          stripe_payment_status: isFullRefund ? 'refunded' : 'partially_refunded',
          status: isFullRefund ? 'CANCELLED' : order.status,
        })
        .eq('id', request.orderId);

      // Log the refund
      await supabase.from('automation_logs').insert({
        order_id: request.orderId,
        action_type: 'refund_processed',
        action_details: {
          refundId: refundRecord.id,
          stripeRefundId: stripeRefund.id,
          amountCents: refundAmountCents,
          reason: request.reason,
          refundType: request.refundType,
          isFullRefund,
        },
      });

      // Send notification email
      await sendRefundNotification(order, refundAmountCents, request.reason);

      log.info(`[Refund] Processed: order=${order.order_number}, amount=$${(refundAmountCents / 100).toFixed(2)}, stripe=${stripeRefund.id}`);

      return {
        success: true,
        data: {
          refundId: refundRecord.id,
          stripeRefundId: stripeRefund.id,
          amountCents: refundAmountCents,
          status: 'completed',
        },
      };
    } catch (stripeError) {
      const errorMessage = stripeError instanceof Error ? stripeError.message : 'Stripe refund failed';

      // Update refund record with error
      await supabase
        .from('refunds')
        .update({
          status: 'failed',
          error_message: errorMessage,
        })
        .eq('id', refundRecord.id);

      log.error(`[Refund] Stripe error for order ${order.order_number}:`, errorMessage);

      return {
        success: false,
        error: `Stripe refund failed: ${errorMessage}`,
        data: {
          refundId: refundRecord.id,
          amountCents: refundAmountCents,
          status: 'failed',
          error: errorMessage,
        },
      };
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Refund processing failed',
    };
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Send refund notification email to customer
 */
async function sendRefundNotification(
  order: {
    order_number: string;
    client_id: string;
    profiles: { email: string; full_name: string } | null;
  },
  amountCents: number,
  reason: RefundReason
): Promise<void> {
  try {
    const profile = order.profiles;
    if (!profile?.email) {
      log.warn(`[Refund] No email for customer, skipping notification`);
      return;
    }

    const { Resend } = await import('resend');
    const resend = new Resend(process.env.RESEND_API_KEY);

    const reasonText = {
      HOLD_TIMEOUT: 'The order was automatically cancelled due to incomplete evidence after 14 days',
      HOLD_CUSTOMER_CANCEL: 'You requested cancellation during the evidence review process',
      LOOP_3_EXIT: 'The order was cancelled after multiple revision attempts',
      CONFLICT_CANCELLATION: 'A conflict of interest was identified',
      CUSTOMER_REQUEST: 'You requested a cancellation',
      QUALITY_ISSUE: 'We identified a quality issue and have refunded your order',
      ADMIN_OVERRIDE: 'An administrative refund was processed',
      AUTO_CANCEL: 'The order was automatically cancelled',
    }[reason] || 'Your refund has been processed';

    await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL || 'noreply@motiongranted.com',
      to: profile.email,
      subject: `[Motion Granted] Refund Processed - Order ${order.order_number}`,
      text: `
Dear ${profile.full_name || 'Valued Client'},

Your refund has been processed for Order ${order.order_number}.

Refund Amount: $${(amountCents / 100).toFixed(2)}
Reason: ${reasonText}

The refund will appear on your original payment method within 5-10 business days.

If you have any questions, please contact our support team.

---
Motion Granted
Refund Notification
      `.trim(),
    });

    log.info(`[Refund] Notification sent to ${profile.email} for order ${order.order_number}`);
  } catch (emailError) {
    log.error(`[Refund] Failed to send notification email:`, emailError);
    // Don't fail the refund if email fails
  }
}

/**
 * Get refund history for an order
 */
export async function getOrderRefunds(orderId: string): Promise<OperationResult<unknown[]>> {
  const supabase = await createClient();

  try {
    const { data: refunds, error } = await supabase
      .from('refunds')
      .select('*')
      .eq('order_id', orderId)
      .order('created_at', { ascending: false });

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, data: refunds || [] };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get refunds',
    };
  }
}

/**
 * Retry a failed refund
 */
export async function retryRefund(refundId: string): Promise<OperationResult<RefundResult>> {
  const supabase = await createClient();

  try {
    const { data: refund, error: refundError } = await supabase
      .from('refunds')
      .select('*, orders(order_number, total_price, stripe_payment_intent_id)')
      .eq('id', refundId)
      .single();

    if (refundError || !refund) {
      return { success: false, error: 'Refund not found' };
    }

    if (refund.status !== 'failed' && refund.status !== 'pending') {
      return { success: false, error: `Cannot retry refund with status: ${refund.status}` };
    }

    // Reprocess the refund
    return processRefund({
      orderId: refund.order_id,
      reason: refund.reason as RefundReason,
      refundType: refund.refund_type as RefundType,
      amountCents: refund.amount_cents,
      notes: `Retry of refund ${refundId}`,
    });
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to retry refund',
    };
  }
}

/**
 * Process HOLD timeout refund (called by auto-cancel Inngest job)
 */
export async function processHoldTimeoutRefund(orderId: string): Promise<OperationResult<RefundResult>> {
  return processRefund({
    orderId,
    reason: 'HOLD_TIMEOUT',
    refundType: 'FULL',
    notes: 'Automatic refund due to 14-day HOLD timeout',
  });
}

/**
 * Process Loop 3 exit refund (Protocol 10)
 */
export async function processLoop3ExitRefund(orderId: string): Promise<OperationResult<RefundResult>> {
  return processRefund({
    orderId,
    reason: 'LOOP_3_EXIT',
    refundType: 'PARTIAL',
    notes: 'Partial refund due to Loop 3 exit (Protocol 10)',
  });
}

/**
 * Process conflict cancellation refund
 */
export async function processConflictRefund(orderId: string): Promise<OperationResult<RefundResult>> {
  return processRefund({
    orderId,
    reason: 'CONFLICT_CANCELLATION',
    refundType: 'FULL',
    notes: 'Full refund due to conflict of interest',
  });
}
