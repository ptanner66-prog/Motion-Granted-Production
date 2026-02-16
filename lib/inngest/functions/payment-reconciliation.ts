/**
 * Stripe-to-Supabase Daily Reconciliation Sweep (SP-10 AA-5)
 *
 * Source: D7-R3-001 | Priority: P0 CRITICAL
 *
 * Runs at 3:00 AM CT daily. Cross-references Stripe charges from the past
 * 48 hours against Supabase orders. Detects:
 * - Unmatched charges (no order in DB)
 * - Amount mismatches (Stripe vs amount_paid_cents)
 * - Unmatched refunds (Stripe shows refund but no REFUND_PROCESSED event)
 * - Stale refund locks (refund_in_progress=true for >10 minutes)
 *
 * @module inngest/functions/payment-reconciliation
 */

import { inngest } from '../client';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

interface ReconciliationMismatch {
  type: 'unmatched_charge' | 'unmatched_order' | 'amount_mismatch' | 'unmatched_refund' | 'stale_refund_lock';
  details: Record<string, unknown>;
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
}

function getStripeClient(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key || key.includes('xxxxx')) return null;
  return new Stripe(key, { apiVersion: '2026-01-28.clover' as Stripe.LatestApiVersion });
}

function getServiceSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export const paymentReconciliation = inngest.createFunction(
  { id: 'payment-reconciliation', name: 'Daily Payment Reconciliation' },
  { cron: '0 3 * * *' }, // 3:00 AM CT daily
  async ({ step }) => {
    const stripe = getStripeClient();
    if (!stripe) {
      return { skipped: true, reason: 'Stripe not configured' };
    }

    // Step 1: Fetch Stripe charges from past 48 hours
    const charges = await step.run('fetch-stripe-charges', async () => {
      const cutoff = Math.floor(Date.now() / 1000) - (48 * 60 * 60);
      const allCharges: Array<{
        id: string;
        amount: number;
        metadata: Stripe.Metadata;
        paymentIntentId: string;
        created: number;
        refunded: boolean;
        amountRefunded: number;
      }> = [];

      for await (const charge of stripe.charges.list({
        created: { gte: cutoff },
        limit: 100,
      })) {
        allCharges.push({
          id: charge.id,
          amount: charge.amount,
          metadata: charge.metadata,
          paymentIntentId: charge.payment_intent as string,
          created: charge.created,
          refunded: charge.refunded,
          amountRefunded: charge.amount_refunded,
        });
      }
      return allCharges;
    });

    // Step 2: Cross-reference with Supabase orders
    const mismatches = await step.run('cross-reference', async () => {
      const supabase = getServiceSupabase();
      const results: ReconciliationMismatch[] = [];

      for (const charge of charges) {
        const orderId = charge.metadata?.orderId || charge.metadata?.order_id;

        if (!orderId) {
          results.push({
            type: 'unmatched_charge',
            details: { chargeId: charge.id, amount: charge.amount, reason: 'No orderId in metadata' },
            severity: 'WARNING',
          });
          continue;
        }

        const { data: order } = await supabase
          .from('orders')
          .select('id, status, amount_paid_cents, stripe_payment_status')
          .eq('id', orderId)
          .single();

        if (!order) {
          results.push({
            type: 'unmatched_charge',
            details: { chargeId: charge.id, orderId, amount: charge.amount, reason: 'Order not found' },
            severity: 'CRITICAL',
          });
          continue;
        }

        // Amount mismatch check
        if (order.amount_paid_cents !== null) {
          const diff = Math.abs(order.amount_paid_cents - charge.amount);
          if (diff > 1) { // > $0.01
            results.push({
              type: 'amount_mismatch',
              details: {
                orderId,
                chargeId: charge.id,
                stripeAmount: charge.amount,
                supabaseAmount: order.amount_paid_cents,
                diff,
              },
              severity: diff > 100 ? 'CRITICAL' : 'WARNING',
            });
          }
        }

        // Unmatched refund check
        if (charge.refunded || charge.amountRefunded > 0) {
          const { data: refundEvents } = await supabase
            .from('payment_events')
            .select('id')
            .eq('order_id', orderId)
            .eq('event_type', 'REFUND_PROCESSED');

          if (!refundEvents || refundEvents.length === 0) {
            results.push({
              type: 'unmatched_refund',
              details: {
                orderId,
                chargeId: charge.id,
                amountRefunded: charge.amountRefunded,
                reason: 'Stripe shows refund but no REFUND_PROCESSED event',
              },
              severity: 'WARNING',
            });
          }
        }
      }

      // Check for stale refund locks (> 10 minutes)
      const { data: staleLocks } = await supabase
        .from('orders')
        .select('id, updated_at')
        .eq('refund_in_progress', true);

      if (staleLocks) {
        const tenMinutesAgo = Date.now() - (10 * 60 * 1000);
        for (const order of staleLocks) {
          if (new Date(order.updated_at).getTime() < tenMinutesAgo) {
            await supabase
              .from('orders')
              .update({ refund_in_progress: false })
              .eq('id', order.id);

            results.push({
              type: 'stale_refund_lock',
              details: {
                orderId: order.id,
                staleMinutes: Math.round((Date.now() - new Date(order.updated_at).getTime()) / 60000),
              },
              severity: 'WARNING',
            });
          }
        }
      }

      return results;
    });

    // Step 3: Write report
    const report = await step.run('write-report', async () => {
      const supabase = getServiceSupabase();

      const { data } = await supabase.from('reconciliation_reports').insert({
        total_charges_checked: charges.length,
        total_refunds_checked: charges.filter((c: { refunded: boolean }) => c.refunded).length,
        mismatches: JSON.stringify(mismatches),
      }).select('id').single();

      return { reportId: data?.id, mismatchCount: mismatches.length };
    });

    // Step 4: Alert on mismatches
    if (mismatches.length > 0) {
      await step.run('alert-admin', async () => {
        const criticalCount = mismatches.filter((m: ReconciliationMismatch) => m.severity === 'CRITICAL').length;

        try {
          const { Resend } = await import('resend');
          const resend = new Resend(process.env.RESEND_API_KEY);

          await resend.emails.send({
            from: 'Motion Granted <alerts@motiongranted.com>',
            to: process.env.ADMIN_ALERT_EMAIL || 'admin@motiongranted.com',
            subject: `[${criticalCount > 0 ? 'CRITICAL' : 'WARNING'}] Payment Reconciliation: ${mismatches.length} mismatch(es)`,
            text: `Daily reconciliation found ${mismatches.length} mismatches (${criticalCount} critical).\n\nReport ID: ${report.reportId}\n\nDetails:\n${JSON.stringify(mismatches, null, 2)}`,
          });
        } catch (emailError) {
          console.error('[RECONCILIATION] Failed to send alert email:', emailError);
        }

        if (criticalCount > 0) {
          try {
            const Sentry = await import('@sentry/nextjs');
            Sentry.captureMessage(`Payment reconciliation: ${criticalCount} CRITICAL mismatches`, 'error');
          } catch {
            // Sentry not available — non-fatal
          }
        }
      });
    }

    return {
      chargesChecked: charges.length,
      mismatchCount: mismatches.length,
      reportId: report.reportId,
    };
  },
);
