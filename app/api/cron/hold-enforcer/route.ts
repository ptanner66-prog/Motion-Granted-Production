/**
 * CRON: Hold Timeout Enforcer
 *
 * Runs every hour via Vercel Cron. Processes orders stuck in HOLD status:
 * - 24h: Send reminder email to client
 * - 72h: Send escalation email to admin
 * - 7d:  Auto-cancel order, process Stripe refund, send cancellation email
 *
 * All timestamps in America/Chicago.
 * Auth: Vercel sends Authorization: Bearer <CRON_SECRET>
 */

import { NextRequest, NextResponse } from 'next/server';
import { withCronAuth } from '@/lib/security/cron-auth';
import { processHoldTimeouts } from '@/lib/workflow/hold-service';
import { processHoldTimeoutRefund } from '@/lib/payments/refund-service';
import { createClient } from '@supabase/supabase-js';

function getServiceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase not configured');
  return createClient(url, key);
}

export const GET = withCronAuth(async (_request: NextRequest) => {
  const startTime = Date.now();
  const cronErrors: string[] = [];
  let stripeRefundsProcessed = 0;

  try {
    // Step 1: Process hold timeouts — 24h reminders, 72h escalations, 7d auto-mark
    // This handles email queue inserts and status flag updates
    const holdResult = await processHoldTimeouts();

    if (holdResult.errors.length > 0) {
      cronErrors.push(...holdResult.errors);
    }

    // Step 2: Process Stripe refunds for orders auto-cancelled by hold timeout
    // processHoldAutoRefund (called by processHoldTimeouts) marks the order as 'refunded'
    // but does NOT process the actual Stripe refund — we do that here
    const supabase = getServiceSupabase();

    const { data: needsStripeRefund } = await supabase
      .from('orders')
      .select('id, order_number, stripe_payment_intent_id, stripe_payment_status')
      .eq('status', 'refunded')
      .eq('refund_reason', 'hold_timeout')
      .not('stripe_payment_intent_id', 'is', null)
      .neq('stripe_payment_status', 'refunded')
      .limit(10);

    for (const order of needsStripeRefund || []) {
      try {
        // Check if a refund has already been processed for this order
        const { data: existingRefund } = await supabase
          .from('refunds')
          .select('id')
          .eq('order_id', order.id)
          .eq('reason', 'HOLD_TIMEOUT')
          .in('status', ['completed', 'processing'])
          .maybeSingle();

        if (existingRefund) {
          continue; // Already processed
        }

        const refundResult = await processHoldTimeoutRefund(order.id);

        if (refundResult.success) {
          stripeRefundsProcessed++;
          console.log(`[hold-enforcer] Stripe refund processed for ${order.order_number}`);
        } else {
          cronErrors.push(`Stripe refund failed for ${order.order_number}: ${refundResult.error}`);
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        cronErrors.push(`Stripe refund error for ${order.order_number}: ${msg}`);
      }
    }

    const duration = Date.now() - startTime;

    // Log to automation_logs (non-fatal)
    try {
      await supabase.from('automation_logs').insert({
        action_type: 'hold_enforcer_cron',
        action_details: {
          holdTimeoutsProcessed: holdResult.processed,
          holdErrors: holdResult.errors,
          stripeRefundsProcessed,
          cronErrors,
          duration,
          timestamp: new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' }),
        },
      });
    } catch (err) {
      console.error('[hold-enforcer] Failed to log to automation_logs:', err);
    }

    console.log(`[hold-enforcer] Complete: ${holdResult.processed} hold actions, ${stripeRefundsProcessed} refunds, ${cronErrors.length} errors, ${duration}ms`);

    return NextResponse.json({
      success: cronErrors.length === 0,
      holdTimeoutsProcessed: holdResult.processed,
      stripeRefundsProcessed,
      errors: cronErrors,
      duration,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[hold-enforcer] CRON failed:', msg);
    return NextResponse.json(
      { success: false, error: msg },
      { status: 500 }
    );
  }
});
