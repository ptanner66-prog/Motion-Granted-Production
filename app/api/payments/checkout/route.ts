/**
 * POST /api/payments/checkout — FULL REWRITE (SP-10 AB-1)
 *
 * BD-XD-001v3: 14-Step Checkout Route
 *
 * Execution Order:
 *   STEP 1  — Auth (Supabase Auth, NOT Clerk — R4-02 binding)
 *   STEP 2  — Body parse
 *   STEP 3  — Load order (client_id everywhere, NEVER user_id — BD-XD-002)
 *   STEP 4  — Ownership check
 *   STEP 5  — Duplicate session prevention (Stripe Supplemental B.3)
 *   STEP 6  — Already-paid guard
 *   STEP 7  — Rate limiting (10/min per IP — Stripe Supplemental 7.2a)
 *   STEP 8  — State validation + pricing multiplier (single states query)
 *   STEP 9  — Conflict check (CC-R3-02)
 *   STEP 10 — Payment bypass (AFTER conflict check — CC-R3-03)
 *   STEP 11 — Stripe null guard
 *   STEP 12 — Price guard
 *   STEP 12.5 — Price consistency (BD-XD-001v3)
 *   STEP 13 — Create Stripe session
 *
 * Returns:
 *   { url: string }             — redirect URL to Stripe Checkout
 *   { bypassed: true, orderId } — when payment is not required
 *   409                         — conflict detected or price mismatch
 *
 * @module checkout-route
 */

import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { stripe } from '@/lib/stripe';
import { createClient } from '@/lib/supabase/server';
import { validatePriceConsistency } from '@/lib/payments/checkout-validation';
import { calculatePriceSync } from '@/lib/payments/price-calculator-core';
import type { RushType } from '@/lib/payments/price-calculator-core';
import { inngest } from '@/lib/inngest/client';
import { checkRateLimit } from '@/lib/security/rate-limiter';

export async function POST(req: Request) {
  const startTime = Date.now();
  const stepTimings: Record<string, number> = {};
  let stepStart: number;

  try {
    // ================================================================
    // STEP 1 — AUTH (Supabase Auth, NOT Clerk — R4-02 binding)
    // ================================================================
    stepStart = Date.now();
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    stepTimings['auth'] = Date.now() - stepStart;

    // ================================================================
    // STEP 2 — BODY PARSE
    // ================================================================
    stepStart = Date.now();
    let body: { orderId?: string; displayed_price_cents?: number };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const { orderId, displayed_price_cents } = body;

    if (!orderId || typeof orderId !== 'string') {
      return NextResponse.json({ error: 'orderId is required' }, { status: 400 });
    }

    // UUID format validation
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(orderId)) {
      return NextResponse.json({ error: 'Invalid orderId format' }, { status: 400 });
    }
    stepTimings['body_parse'] = Date.now() - stepStart;

    // ================================================================
    // STEP 3 — LOAD ORDER (client_id everywhere, NEVER user_id — BD-XD-002)
    // ================================================================
    stepStart = Date.now();
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select(`
        id, order_number, total_price, motion_type, rush_option,
        client_id, stripe_payment_status, stripe_checkout_session_id,
        case_number, filing_deadline, status, state_code, tier,
        jurisdiction, court_division
      `)
      .eq('id', orderId)
      .single();

    if (orderError || !order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }
    stepTimings['load_order'] = Date.now() - stepStart;

    // ================================================================
    // STEP 4 — OWNERSHIP CHECK
    // ================================================================
    stepStart = Date.now();
    if (order.client_id !== user.id) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }
    stepTimings['ownership'] = Date.now() - stepStart;

    // ================================================================
    // STEP 5 — DUPLICATE SESSION PREVENTION (Stripe Supplemental B.3)
    // ================================================================
    stepStart = Date.now();
    if (order.stripe_checkout_session_id) {
      try {
        if (stripe) {
          const existingSession = await stripe.checkout.sessions.retrieve(
            order.stripe_checkout_session_id,
          );

          if (existingSession.status === 'open' && existingSession.url) {
            // Session still active — return existing URL
            stepTimings['duplicate_check'] = Date.now() - stepStart;
            return NextResponse.json({ url: existingSession.url });
          }
        }
      } catch {
        // Session expired or not found — clear and proceed
      }

      // Clear stale session ID
      await supabase
        .from('orders')
        .update({ stripe_checkout_session_id: null })
        .eq('id', orderId);
    }
    stepTimings['duplicate_check'] = Date.now() - stepStart;

    // ================================================================
    // STEP 6 — ALREADY-PAID GUARD
    // ================================================================
    stepStart = Date.now();
    if (order.stripe_payment_status === 'succeeded') {
      return NextResponse.json({ error: 'Order already paid' }, { status: 400 });
    }
    stepTimings['paid_guard'] = Date.now() - stepStart;

    // ================================================================
    // STEP 7 — RATE LIMITING (10/min per IP — Stripe Supplemental 7.2a)
    // ================================================================
    stepStart = Date.now();
    const headersList = await headers();
    const clientIp =
      headersList.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      headersList.get('x-real-ip') ||
      'unknown';

    const rateLimitResult = await checkRateLimit(clientIp, 'api');
    if (!rateLimitResult.allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please wait a moment.' },
        { status: 429 },
      );
    }
    stepTimings['rate_limit'] = Date.now() - stepStart;

    // ================================================================
    // STEP 8 — STATE VALIDATION + PRICING MULTIPLIER (single states query)
    // ================================================================
    stepStart = Date.now();
    // Derive state code from order (prefer state_code, fall back to jurisdiction)
    const stateCode = order.state_code || deriveStateCode(order.jurisdiction || '');
    let pricingMultiplier = 1.0;

    if (stateCode) {
      const { data: stateRow, error: stateError } = await supabase
        .from('states')
        .select('id, name, enabled, pricing_multiplier')
        .eq('code', stateCode)
        .single();

      if (stateError || !stateRow) {
        return NextResponse.json({ error: 'Invalid state configuration' }, { status: 400 });
      }

      if (!stateRow.enabled) {
        return NextResponse.json(
          { error: `Orders from ${stateRow.name} are not currently accepted.` },
          { status: 400 },
        );
      }

      pricingMultiplier = stateRow.pricing_multiplier ?? 1.0;
    }
    stepTimings['state_validation'] = Date.now() - stepStart;

    // ================================================================
    // STEP 9 — CONFLICT CHECK (CC-R3-02)
    // ================================================================
    stepStart = Date.now();
    const conflictCheckStart = Date.now();

    if (order.case_number && order.case_number !== 'Not Yet Filed' && order.case_number !== 'NOT_YET_FILED') {
      // Normalize: strip spaces, hyphens, dashes → uppercase
      const normalized = order.case_number
        .replace(/[\s\-\u2013\u2014]/g, '')
        .toUpperCase();

      // A-020: Use getServiceSupabase() for cross-user query (bypasses RLS)
      const { getServiceSupabase } = await import('@/lib/supabase/admin');
      const serviceSupabase = getServiceSupabase();

      const { data: conflicts } = await serviceSupabase
        .from('orders')
        .select('id, order_number, client_id')
        .eq('case_number_normalized', normalized)
        .neq('id', orderId)
        .neq('client_id', user.id)
        .not('status', 'in', '("cancelled","refunded")');

      if (conflicts && conflicts.length > 0) {
        // Set order to PENDING_CONFLICT_REVIEW
        const matchingOrderNumbers = conflicts.map((c: { order_number: string }) => c.order_number).join(', ');
        const deadlineUrgent = order.filing_deadline &&
          new Date(order.filing_deadline).getTime() - Date.now() < 14 * 24 * 60 * 60 * 1000;

        const conflictNotes = [
          deadlineUrgent ? `URGENT: Filing deadline ${order.filing_deadline}.` : '',
          `Case number match: ${order.case_number} matches Order(s) #${matchingOrderNumbers} (different attorney).`,
          `Filing deadline: ${order.filing_deadline || 'none'}.`,
        ].filter(Boolean).join(' ');

        await serviceSupabase
          .from('orders')
          .update({
            status: 'pending_conflict_review',
            conflict_flagged: true,
            conflict_notes: conflictNotes,
          })
          .eq('id', orderId);

        // Fire Inngest event for 7-day auto-cancel timer
        try {
          await inngest.send({
            name: 'conflict/review-started',
            data: {
              orderId,
              matchingOrderIds: conflicts.map((c: { id: string }) => c.id),
              caseNumber: order.case_number,
            },
          });
        } catch (inngestErr) {
          // Non-fatal: the timer failing shouldn't block the conflict response
          console.error('[CHECKOUT] Failed to send conflict/review-started event:', inngestErr);
        }

        stepTimings['conflict_check'] = Date.now() - stepStart;

        // Return generic 409 (BD-CONFLICT-MSG — never reveal specific match details)
        return NextResponse.json(
          { error: 'Your order requires additional review before processing.' },
          { status: 409 },
        );
      }
    }

    // Timing equalization: pad no-conflict path to ~50ms (D7-R5-010-TIMING)
    const conflictElapsed = Date.now() - conflictCheckStart;
    if (conflictElapsed < 50) {
      await new Promise(resolve => setTimeout(resolve, 50 - conflictElapsed));
    }
    stepTimings['conflict_check'] = Date.now() - stepStart;

    // ================================================================
    // STEP 10 — PAYMENT BYPASS (AFTER conflict check — CC-R3-03)
    // ================================================================
    stepStart = Date.now();
    if (process.env.STRIPE_PAYMENT_REQUIRED?.toLowerCase().trim() === 'false') {
      stepTimings['bypass_check'] = Date.now() - stepStart;
      emitCheckoutLatency(orderId, stepTimings, startTime);
      return NextResponse.json({ bypassed: true, orderId });
    }
    stepTimings['bypass_check'] = Date.now() - stepStart;

    // ================================================================
    // STEP 11 — STRIPE NULL GUARD
    // ================================================================
    stepStart = Date.now();
    if (!stripe) {
      return NextResponse.json(
        { error: 'Payment system not configured' },
        { status: 500 },
      );
    }
    stepTimings['stripe_guard'] = Date.now() - stepStart;

    // ================================================================
    // STEP 12 — PRICE GUARD
    // ================================================================
    stepStart = Date.now();
    const rushOption = (order.rush_option || 'standard') as RushType;
    const priceResult = calculatePriceSync(
      order.motion_type || '',
      rushOption,
      stateCode || 'LA',
      pricingMultiplier, // reuse stateRow.pricing_multiplier from Step 8 (D7-R5-008)
    );

    // Convert subtotal (dollars) to cents
    const totalCents = Math.round(priceResult.subtotal * 100);

    if (totalCents <= 0) {
      return NextResponse.json({ error: 'Invalid order amount' }, { status: 400 });
    }
    stepTimings['price_guard'] = Date.now() - stepStart;

    // ================================================================
    // STEP 12.5 — PRICE CONSISTENCY (BD-XD-001v3)
    // ================================================================
    stepStart = Date.now();
    if (displayed_price_cents !== undefined && displayed_price_cents !== null) {
      const consistency = validatePriceConsistency(
        displayed_price_cents,
        totalCents,
        100, // $1.00 tolerance
      );

      if (!consistency.consistent) {
        stepTimings['price_consistency'] = Date.now() - stepStart;
        return NextResponse.json(
          { error: 'Pricing has been updated. Please refresh and try again.' },
          { status: 409 },
        );
      }
    } else {
      // Legacy frontend: no displayed_price_cents
      console.warn(`[CHECKOUT] Legacy frontend: displayed_price_cents not provided for order ${orderId}`);
    }
    stepTimings['price_consistency'] = Date.now() - stepStart;

    // ================================================================
    // STEP 13 — CREATE STRIPE SESSION
    // ================================================================
    stepStart = Date.now();

    // Derive court metadata
    const courtType = deriveCourtType(order.jurisdiction || '', order.court_division || '');
    const federalDistrict = order.court_division || '';

    const origin =
      process.env.NEXT_PUBLIC_APP_URL ||
      process.env.NEXT_PUBLIC_SITE_URL ||
      'https://motion-granted.com';

    try {
      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        line_items: [
          {
            price_data: {
              currency: 'usd',
              product_data: {
                name: `${order.motion_type} (Tier ${order.tier || 'B'})`,
                description: `Order #${order.order_number}`,
              },
              unit_amount: totalCents,
            },
            quantity: 1,
          },
        ],
        metadata: {
          // 12-field metadata (D7-R5-004)
          orderId: order.id,
          motionType: order.motion_type || '',
          tier: order.tier || '',
          jurisdiction: stateCode || '',
          rushType: order.rush_option || 'STANDARD',
          motionPath: 'A', // Default, updated by intake if applicable
          stateCode: stateCode || '',
          courtType: courtType,
          federalDistrict: federalDistrict,
          pricingMultiplier: String(pricingMultiplier),
          clientId: user.id,
          orderNumber: order.order_number,
          // T-65: AI disclosure preference
          ai_disclosure_requested: String(order.include_ai_disclosure ?? false),
          // Session type (D7-R5-005-META)
          session_type: 'initial',
        },
        allow_promotion_codes: true, // CC-R3-05 + Stripe B.2
        customer_email: user.email,
        client_reference_id: orderId,
        success_url: `${origin}/orders/${orderId}?payment=success`,
        cancel_url: `${origin}/orders/${orderId}?payment=cancelled`,
      });

      if (!session.url) {
        return NextResponse.json(
          { error: 'Failed to create checkout session' },
          { status: 500 },
        );
      }

      // Save session ID to order
      await supabase
        .from('orders')
        .update({
          stripe_checkout_session_id: session.id,
          stripe_payment_status: 'pending',
        })
        .eq('id', orderId);

      stepTimings['create_session'] = Date.now() - stepStart;
      emitCheckoutLatency(orderId, stepTimings, startTime);

      return NextResponse.json({ url: session.url });
    } catch (stripeError: unknown) {
      stepTimings['create_session'] = Date.now() - stepStart;
      const errorMessage = stripeError instanceof Error ? stripeError.message : 'Unknown error';
      console.error('[CHECKOUT] Stripe session creation failed:', {
        orderId,
        error: errorMessage,
      });
      return NextResponse.json(
        { error: 'Payment provider temporarily unavailable' },
        { status: 502 },
      );
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[CHECKOUT] Unexpected error:', {
      error: errorMessage,
    });
    return NextResponse.json(
      { error: 'An unexpected error occurred' },
      { status: 500 },
    );
  }
}

// ============================================================
// HELPERS
// ============================================================

/**
 * Derive state code from jurisdiction string.
 * Handles legacy jurisdiction IDs (e.g., 'LA_STATE', 'CA_ED').
 */
function deriveStateCode(jurisdictionId: string): string {
  if (!jurisdictionId) return '';
  // If it looks like a 2-char state code already, return it
  if (/^[A-Z]{2}$/.test(jurisdictionId)) return jurisdictionId;
  // Extract first 2 chars (e.g., 'la_state' -> 'LA')
  return jurisdictionId.slice(0, 2).toUpperCase();
}

/**
 * Derive court type from jurisdiction string.
 */
function deriveCourtType(jurisdictionId: string, courtDivision: string): string {
  if (!jurisdictionId) return '';
  const lower = jurisdictionId.toLowerCase();
  if (lower.includes('state') || lower === 'la_state' || lower === 'ca_state') {
    return 'STATE';
  }
  if (lower.includes('federal') || lower.includes('_ed') || lower.includes('_md') || lower.includes('_wd') || courtDivision) {
    return 'FEDERAL';
  }
  return 'STATE'; // Default
}

// ============================================================
// LATENCY METRIC (D7-R5-003-METRIC)
// ============================================================
function emitCheckoutLatency(
  orderId: string,
  steps: Record<string, number>,
  startTime: number,
): void {
  try {
    const totalMs = Date.now() - startTime;
    console.log(JSON.stringify({
      type: 'CHECKOUT_LATENCY',
      orderId,
      totalMs,
      steps,
      timestamp: new Date().toISOString(),
    }));
  } catch {
    // Timing instrumentation NEVER causes checkout failure
  }
}
