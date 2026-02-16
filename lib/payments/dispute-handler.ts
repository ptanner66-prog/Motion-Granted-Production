/**
 * Dispute Evidence Lifecycle (SP-11 AE-3)
 *
 * Source: D7-R3-007 | Priority: P1
 *
 * Handles Stripe dispute webhooks:
 * - charge.dispute.created → DISPUTED status + admin alert + evidence compilation
 * - charge.dispute.updated → log status update
 * - charge.dispute.closed → revert (won) or REFUNDED (lost)
 *
 * BINDING: DISPUTED is NOT terminal — can revert on win (Delta Resolution)
 *
 * @module payments/dispute-handler
 */

import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import { validateTransition } from './payment-status';

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
const stripe = stripeSecretKey && !stripeSecretKey.includes('xxxxx')
  ? new Stripe(stripeSecretKey, {
      apiVersion: '2024-12-18.acacia' as Stripe.LatestApiVersion,
    })
  : null;

// ============================================================
// WEBHOOK HANDLERS
// ============================================================

export async function handleDisputeCreated(dispute: Stripe.Dispute): Promise<void> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // Extract orderId from charge/payment_intent metadata
  let orderId: string | null = null;

  if (dispute.payment_intent) {
    try {
      const pi = await stripe!.paymentIntents.retrieve(dispute.payment_intent as string);
      orderId = pi.metadata?.orderId || pi.metadata?.order_id || null;
    } catch {
      // Continue to fallback
    }
  }

  if (!orderId) {
    // Fallback: search payment_events by payment_intent
    const { data: events } = await supabase
      .from('payment_events')
      .select('order_id')
      .eq('metadata->>payment_intent_id', dispute.payment_intent)
      .limit(1);

    orderId = events?.[0]?.order_id || null;
  }

  if (!orderId) {
    console.error('[DISPUTE] Cannot find orderId for dispute:', dispute.id);
    try {
      const Sentry = await import('@sentry/nextjs');
      Sentry.captureMessage(`Dispute ${dispute.id}: no orderId found`, 'error');
    } catch {
      // Sentry not available
    }
    return;
  }

  // Get current order status to store as pre-dispute status
  const { data: order } = await supabase
    .from('orders')
    .select('status')
    .eq('id', orderId)
    .single();

  // Update order to DISPUTED
  try {
    if (order) {
      validateTransition(order.status, 'disputed');
    }

    await supabase
      .from('orders')
      .update({
        status: 'disputed',
        updated_at: new Date().toISOString(),
      })
      .eq('id', orderId);
  } catch (err) {
    console.warn(`[DISPUTE] Could not transition order ${orderId} to DISPUTED:`, err);
  }

  // Log payment event
  await supabase.from('payment_events').insert({
    order_id: orderId,
    event_type: 'DISPUTE_OPENED',
    metadata: {
      dispute_id: dispute.id,
      dispute_amount: dispute.amount,
      dispute_reason: dispute.reason,
      dispute_status: dispute.status,
      evidence_due_by: dispute.evidence_details?.due_by,
      pre_dispute_status: order?.status,
    },
  });

  // Admin alert
  try {
    const { Resend } = await import('resend');
    const resend = new Resend(process.env.RESEND_API_KEY);
    const dueDate = dispute.evidence_details?.due_by
      ? new Date(dispute.evidence_details.due_by * 1000).toISOString()
      : 'unknown';

    await resend.emails.send({
      from: 'Motion Granted <alerts@motiongranted.com>',
      to: process.env.ADMIN_ALERT_EMAIL || 'admin@motiongranted.com',
      subject: `[URGENT] Dispute Opened — Order ${orderId}`,
      text: `A dispute has been opened for order ${orderId}.\n\nAmount: $${(dispute.amount / 100).toFixed(2)}\nReason: ${dispute.reason}\nEvidence deadline: ${dueDate}\n\nPlease review immediately in the admin dashboard.`,
    });
  } catch (emailErr) {
    console.error('[DISPUTE] Failed to send admin alert email:', emailErr);
  }

  // Begin async evidence compilation via Inngest
  try {
    const { inngest } = await import('@/lib/inngest/client');
    await inngest.send({
      name: 'dispute/evidence-compile',
      data: { orderId, disputeId: dispute.id },
    });
  } catch (inngestErr) {
    console.error('[DISPUTE] Inngest evidence-compile send failed:', inngestErr);
  }
}

export async function handleDisputeUpdated(dispute: Stripe.Dispute): Promise<void> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const orderId = await findOrderIdForDispute(dispute);
  if (!orderId) return;

  await supabase.from('payment_events').insert({
    order_id: orderId,
    event_type: 'DISPUTE_UPDATED',
    metadata: {
      dispute_id: dispute.id,
      dispute_status: dispute.status,
      needs_response: dispute.status === 'needs_response',
    },
  });
}

export async function handleDisputeClosed(dispute: Stripe.Dispute): Promise<void> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const orderId = await findOrderIdForDispute(dispute);
  if (!orderId) return;

  if (dispute.status === 'won') {
    // Revert to pre-dispute status
    const { data: events } = await supabase
      .from('payment_events')
      .select('metadata')
      .eq('order_id', orderId)
      .eq('event_type', 'DISPUTE_OPENED')
      .order('created_at', { ascending: false })
      .limit(1);

    const preDisputeStatus = events?.[0]?.metadata?.pre_dispute_status || 'completed';

    await supabase
      .from('orders')
      .update({
        status: preDisputeStatus,
        updated_at: new Date().toISOString(),
      })
      .eq('id', orderId);

    await supabase.from('payment_events').insert({
      order_id: orderId,
      event_type: 'DISPUTE_WON',
      metadata: { dispute_id: dispute.id, reverted_to: preDisputeStatus },
    });
  } else if (dispute.status === 'lost') {
    // Mark as REFUNDED — Stripe already debited funds
    await supabase
      .from('orders')
      .update({
        status: 'refunded',
        updated_at: new Date().toISOString(),
      })
      .eq('id', orderId);

    await supabase.from('payment_events').insert({
      order_id: orderId,
      event_type: 'DISPUTE_LOST',
      metadata: {
        dispute_id: dispute.id,
        amount_debited: dispute.amount,
      },
    });
  }
}

// ============================================================
// EVIDENCE COMPILATION
// ============================================================

export interface DisputeEvidence {
  orderId: string;
  orderDetails: string;
  deliveryConfirmation: string;
  aisContent: string;
  customerCommunication: string;
  serviceDescription: string;
}

export async function compileDisputeEvidence(orderId: string): Promise<DisputeEvidence> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: order } = await supabase
    .from('orders')
    .select('*')
    .eq('id', orderId)
    .single();

  const { data: deliveryPkg } = await supabase
    .from('delivery_packages')
    .select('*')
    .eq('order_id', orderId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  const { data: paymentEvents } = await supabase
    .from('payment_events')
    .select('*')
    .eq('order_id', orderId)
    .order('created_at', { ascending: true });

  return {
    orderId,
    orderDetails: `Motion Type: ${order?.motion_type}, Tier: ${order?.tier}, Created: ${order?.created_at}, Completed: ${order?.completed_at || 'N/A'}`,
    deliveryConfirmation: deliveryPkg
      ? `Delivered at ${deliveryPkg.created_at}. CP3 approved: ${deliveryPkg.cp3_approved_at || 'N/A'}.`
      : 'No delivery package found.',
    aisContent: 'Attorney Instruction Sheet was provided with delivery package.',
    customerCommunication: `${paymentEvents?.length || 0} payment events recorded. Full history available.`,
    serviceDescription: `Legal motion drafting service — ${order?.motion_type} (Tier ${order?.tier}). Flat-fee service per Terms of Service.`,
  };
}

// ============================================================
// HELPERS
// ============================================================

async function findOrderIdForDispute(dispute: Stripe.Dispute): Promise<string | null> {
  if (dispute.payment_intent) {
    try {
      const pi = await stripe!.paymentIntents.retrieve(dispute.payment_intent as string);
      if (pi.metadata?.orderId) return pi.metadata.orderId;
      if (pi.metadata?.order_id) return pi.metadata.order_id;
    } catch {
      // Continue to fallback
    }
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data } = await supabase
    .from('payment_events')
    .select('order_id')
    .or(`metadata->>dispute_id.eq.${dispute.id}`)
    .limit(1);

  return data?.[0]?.order_id || null;
}
