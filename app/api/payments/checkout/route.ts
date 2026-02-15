/**
 * POST /api/payments/checkout
 *
 * Creates a Stripe Checkout Session for order payment.
 * Togglable via STRIPE_PAYMENT_REQUIRED env var (default: true).
 *
 * BD-XD-001: Three-way merge of 50-State spec, Conflict Check R3, and Stripe Supplemental Audit.
 *
 * 13-Step Execution Order:
 *   1. Auth
 *   2. Body parse
 *   3. Load order (client_id, NOT user_id — SA-003)
 *   4. Ownership check (client_id — SA-003)
 *   5. Duplicate session prevention (Stripe B.3)
 *   6. Already-paid guard
 *   7. Rate limiting (50-State 7.2a)
 *   8. State validation + pricing multiplier (50-State 7.2)
 *   9. Conflict check (CC-R3-02)
 *  10. Payment bypass (CC-R3-03)
 *  11. Stripe null guard
 *  12. Price guard
 *  13. Create Stripe session (12-field metadata, allow_promotion_codes)
 *
 * Returns:
 *   { url: string }                — redirect URL to Stripe Checkout
 *   { bypassed: true, orderId }    — when payment is not required
 *   { conflict: true, orderId }    — when case_number conflict detected (409)
 *
 * @module checkout-route
 */

import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { stripe } from '@/lib/stripe';
import { createClient } from '@/lib/supabase/server';
import { normalizeCaseNumber } from '@/lib/conflicts/normalize';
import { JURISDICTIONS } from '@/lib/workflow/jurisdiction-filter';
import { inngest } from '@/lib/inngest/client';

// ── Rate Limiting (50-State Step 7.2a) ─────────────────────────────────────
// In-memory rate limiter: 10 requests per minute per IP.
// In production, middleware.ts also enforces Redis-backed rate limits.
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + 60000 });
    return true;
  }
  if (entry.count >= 10) return false;
  entry.count++;
  return true;
}

/**
 * Derive state/court metadata from the order's jurisdiction field.
 * Maps jurisdiction IDs (e.g. 'LA_STATE', 'FEDERAL_5TH') to structured metadata.
 */
function deriveJurisdictionMetadata(jurisdictionId: string): {
  stateCode: string;
  courtType: string;
  federalCircuit: string;
  federalDistrict: string;
  legacyJurisdiction: string;
} {
  const jurisdiction = JURISDICTIONS.find(j => j.id === jurisdictionId);

  if (jurisdiction) {
    return {
      stateCode: jurisdiction.stateCode,
      courtType: jurisdiction.courtType,
      federalCircuit: jurisdiction.courtType === 'FEDERAL'
        ? (jurisdiction.id.includes('5TH') ? '5th' : jurisdiction.id.includes('9TH') ? '9th' : '')
        : '',
      federalDistrict: '', // District is stored in court_division on the order
      legacyJurisdiction: jurisdictionId,
    };
  }

  // Fallback: try to parse legacy jurisdiction IDs (la_state, la_ed, etc.)
  const lower = jurisdictionId.toLowerCase();
  if (lower.startsWith('la')) {
    return {
      stateCode: 'LA',
      courtType: lower === 'la_state' ? 'STATE' : 'FEDERAL',
      federalCircuit: lower !== 'la_state' ? '5th' : '',
      federalDistrict: lower === 'la_ed' ? 'Eastern' : lower === 'la_md' ? 'Middle' : lower === 'la_wd' ? 'Western' : '',
      legacyJurisdiction: jurisdictionId,
    };
  }
  if (lower.startsWith('ca')) {
    return {
      stateCode: 'CA',
      courtType: lower === 'ca_state' ? 'STATE' : 'FEDERAL',
      federalCircuit: lower !== 'ca_state' ? '9th' : '',
      federalDistrict: '',
      legacyJurisdiction: jurisdictionId,
    };
  }

  // Unknown jurisdiction — pass through with defaults
  return {
    stateCode: jurisdictionId.slice(0, 2).toUpperCase(),
    courtType: 'STATE',
    federalCircuit: '',
    federalDistrict: '',
    legacyJurisdiction: jurisdictionId,
  };
}

export async function POST(req: Request) {
  // ══════════════════════════════════════════════════════════════════════════
  // STEP 1: Auth (CC-R3-03 — moved up from previous position)
  // ══════════════════════════════════════════════════════════════════════════
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // STEP 2: Body parse (CC-R3-03)
  // ══════════════════════════════════════════════════════════════════════════
  let body: { orderId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { orderId } = body;
  if (!orderId || typeof orderId !== 'string') {
    return NextResponse.json(
      { error: 'orderId is required' },
      { status: 400 },
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // STEP 3: Load order — SA-003: use client_id, NOT user_id
  // ══════════════════════════════════════════════════════════════════════════
  const { data: order, error: orderError } = await supabase
    .from('orders')
    .select('id, order_number, total_price, motion_type, rush_option, client_id, stripe_payment_status, stripe_checkout_session_id, case_number, filing_deadline, tier, jurisdiction, court_division')
    .eq('id', orderId)
    .single();

  if (orderError || !order) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // STEP 4: Ownership check — SA-003: client_id, NOT user_id
  // BD-XD-002: The string 'user_id' must NOT appear in order queries or ownership checks.
  // ══════════════════════════════════════════════════════════════════════════
  if (order.client_id !== user.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // STEP 5: Duplicate session prevention — Stripe B.3
  // ══════════════════════════════════════════════════════════════════════════
  if (order.stripe_checkout_session_id && order.stripe_payment_status === 'pending') {
    try {
      // stripe may be null if not configured — guarded later in step 11
      if (stripe) {
        const existingSession = await stripe.checkout.sessions.retrieve(
          order.stripe_checkout_session_id,
        );
        if (existingSession.status === 'open' && existingSession.url) {
          console.log(`[Checkout] Returning existing session for order ${orderId}`);
          return NextResponse.json({ url: existingSession.url });
        }
      }
    } catch {
      // Existing session is invalid/expired — fall through to create new one
      console.log(`[Checkout] Existing session invalid, creating new for order ${orderId}`);
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // STEP 6: Already-paid guard
  // ══════════════════════════════════════════════════════════════════════════
  if (order.stripe_payment_status === 'succeeded') {
    return NextResponse.json(
      { error: 'Order already paid' },
      { status: 409 },
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // STEP 7: Rate limiting — 50-State Step 7.2a (10 req/min/IP)
  // ══════════════════════════════════════════════════════════════════════════
  const headersList = await headers();
  const clientIp =
    headersList.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    headersList.get('x-real-ip') ||
    'unknown';

  if (!checkRateLimit(clientIp)) {
    return NextResponse.json(
      { error: 'Too many requests. Please wait a moment.' },
      { status: 429 },
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // STEP 8: State validation + pricing multiplier — 50-State Step 7.2
  // ══════════════════════════════════════════════════════════════════════════
  const jurisdictionMeta = deriveJurisdictionMetadata(order.jurisdiction || '');
  const stateCode = jurisdictionMeta.stateCode;
  const courtType = jurisdictionMeta.courtType;
  const federalCircuit = jurisdictionMeta.federalCircuit;
  const federalDistrict = jurisdictionMeta.federalDistrict || order.court_division || '';
  const legacyJurisdiction = jurisdictionMeta.legacyJurisdiction;

  // Validate state is enabled — query the states table
  let pricingMultiplier = 1.0;
  if (stateCode) {
    const { data: stateRecord } = await supabase
      .from('states')
      .select('code, pricing_multiplier, enabled, federal_circuits')
      .eq('code', stateCode)
      .eq('enabled', true)
      .single();

    if (!stateRecord) {
      return NextResponse.json(
        { error: `State ${stateCode} is not currently available` },
        { status: 400 },
      );
    }
    pricingMultiplier = stateRecord.pricing_multiplier ?? 1.0;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // STEP 9: Conflict check — CC-R3-02
  // Inline case_number matching against existing orders from other clients.
  // ══════════════════════════════════════════════════════════════════════════
  if (order.case_number && order.case_number !== 'NOT_YET_FILED') {
    const normalizedCase = normalizeCaseNumber(order.case_number);

    if (normalizedCase) {
      const { data: potentialConflicts } = await supabase
        .from('orders')
        .select('id, order_number, case_number, client_id, status')
        .neq('client_id', user.id)
        .not('status', 'in', '("cancelled","cancelled_timeout")')
        .neq('id', order.id);

      const matches = (potentialConflicts || []).filter(
        (c: { id: string; case_number: string | null; client_id: string; status: string }) =>
          c.case_number && normalizeCaseNumber(c.case_number) === normalizedCase,
      );

      if (matches.length > 0) {
        // Hold order for conflict review
        await supabase
          .from('orders')
          .update({ status: 'pending_conflict_review' })
          .eq('id', order.id);

        // CC-R3-04: Start 7-day auto-cancel timer via Inngest
        try {
          await inngest.send({
            name: 'conflict/review-started',
            data: { orderId: order.id },
          });
        } catch (inngestErr) {
          // Non-fatal: the timer failing shouldn't block the conflict response
          console.error('[Checkout] Failed to send conflict/review-started event:', inngestErr);
        }

        console.log(
          `[Checkout] Conflict detected for order ${orderId}: case_number matches ${matches.length} existing order(s)`,
        );

        return NextResponse.json(
          { conflict: true, orderId: order.id },
          { status: 409 },
        );
      }
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // STEP 10: Payment bypass — CC-R3-03 (moved from top to after conflict check)
  // ══════════════════════════════════════════════════════════════════════════
  const paymentRequired =
    process.env.STRIPE_PAYMENT_REQUIRED?.toLowerCase().trim() !== 'false';

  if (!paymentRequired) {
    return NextResponse.json({
      bypassed: true,
      orderId: order.id,
      message: 'Payment not required',
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // STEP 11: Stripe null guard — only runs when payment IS required
  // ══════════════════════════════════════════════════════════════════════════
  if (!stripe) {
    return NextResponse.json(
      { error: 'Stripe is not configured' },
      { status: 503 },
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // STEP 12: Price guard
  // ══════════════════════════════════════════════════════════════════════════
  const amount = order.total_price;
  if (!amount || amount <= 0) {
    return NextResponse.json(
      { error: 'Order has no payable amount' },
      { status: 400 },
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // STEP 13: Create Stripe Checkout Session
  // 12-field metadata + allow_promotion_codes + currency: 'usd'
  // ══════════════════════════════════════════════════════════════════════════
  const origin =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    'https://motiongranted.com';

  const successUrl = `${origin}/orders/${orderId}?payment=success`;
  const cancelUrl = `${origin}/orders/${orderId}?payment=cancelled`;

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      allow_promotion_codes: true, // CC-R3-05 + Stripe B.2
      line_items: [
        {
          price_data: {
            currency: 'usd', // Gap 36
            unit_amount: Math.round(amount * 100),
            product_data: {
              name: `Motion Granted — Order #${order.order_number}`,
              description: order.motion_type
                ? `${order.motion_type}${order.rush_option && order.rush_option !== 'standard' ? ` (${order.rush_option})` : ''}`
                : 'Legal Motion Drafting',
            },
          },
          quantity: 1,
        },
      ],
      metadata: {
        order_id: order.id,
        order_number: order.order_number,
        motion_type: order.motion_type || '',
        tier: order.tier || '',
        rush_type: order.rush_option || 'standard',
        client_id: order.client_id, // SA-003: was user_id
        state_code: stateCode,
        court_type: courtType,
        federal_circuit: federalCircuit,
        federal_district: federalDistrict,
        jurisdiction_legacy: legacyJurisdiction,
        pricing_multiplier: String(pricingMultiplier),
      },
      client_reference_id: orderId,
      customer_email: user.email,
      success_url: successUrl,
      cancel_url: cancelUrl,
    });

    if (!session.url) {
      return NextResponse.json(
        { error: 'Failed to create checkout session' },
        { status: 500 },
      );
    }

    // Store checkout session ID on the order for reconciliation and duplicate prevention
    const { error: updateError } = await supabase
      .from('orders')
      .update({
        stripe_checkout_session_id: session.id,
        stripe_payment_status: 'pending',
      })
      .eq('id', orderId);

    if (updateError) {
      console.error('[Checkout] Failed to store session ID:', updateError);
      // Continue anyway — session was created successfully
    }

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error('[Checkout] Stripe error:', err);
    return NextResponse.json(
      {
        error: 'Failed to create checkout session',
        details: err instanceof Error ? err.message : 'Unknown error',
      },
      { status: 500 },
    );
  }
}
