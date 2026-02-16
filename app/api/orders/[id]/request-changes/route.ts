// app/api/orders/[id]/request-changes/route.ts
// D6 Directive 1 v2 — COMPLETE REWRITE (SP-8)
// Resolves: C-008 (separate route)
// Rework cap: max 3 attorney rework cycles (tracked via payment_events)
// Loop counter resets each attorney rework cycle
// Protocol 10 disables this button after max reworks
// CP3 timeout (14d+7d) RESETS on each rework submission

import { NextRequest, NextResponse } from 'next/server';
import { authenticateCP3Request } from '@/lib/api/cp3-auth';
import { inngest } from '@/lib/inngest/client';
import { CANONICAL_EVENTS, CP3_REWORK_CAP } from '@/lib/workflow/checkpoint-types';
import { checkRateLimit } from '@/lib/security/rate-limiter';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: orderId } = await params;
  const authResult = await authenticateCP3Request(req, orderId);
  if (authResult instanceof NextResponse) return authResult;

  // CP3 rate limit: 5 decisions per minute per user
  const rl = await checkRateLimit(authResult.userId, 'cp3');
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded', retryAfter: rl.reset },
      { status: 429, headers: { 'Retry-After': String(Math.ceil((rl.reset - Date.now()) / 1000)) } }
    );
  }

  const { userId, order, package: pkg, supabase } = authResult;
  const body = await req.json().catch(() => ({}));
  const reason = body.reason;
  const statusVersion = body.status_version;

  // Reason is REQUIRED for request changes
  if (!reason || (typeof reason === 'string' && reason.trim().length === 0)) {
    return NextResponse.json(
      { error: 'Reason for changes is required' }, { status: 400 }
    );
  }
  if (typeof statusVersion !== 'number') {
    return NextResponse.json(
      { error: 'status_version required' }, { status: 400 }
    );
  }

  // Optimistic lock
  if (order.status_version !== statusVersion) {
    return NextResponse.json(
      { error: 'Concurrent modification. Please refresh.' }, { status: 409 }
    );
  }

  // Check attorney rework cap (binding: max 3 rework cycles)
  // Tracked via payment_events, NOT loop_counters (which are internal)
  const { data: reworkHistory } = await supabase
    .from('payment_events')
    .select('id')
    .eq('order_id', orderId)
    .eq('event_type', 'CP3_REQUEST_CHANGES')
    .limit(4);

  if (reworkHistory && reworkHistory.length >= CP3_REWORK_CAP) {
    // Protocol 10: max rework cap reached
    // Dashboard should have already hidden the button (defense-in-depth)
    return NextResponse.json(
      { error: `Maximum revision requests reached (${CP3_REWORK_CAP}). You may approve or cancel.` },
      { status: 422 }
    );
  }

  // Transition: AWAITING_APPROVAL → REVISION_REQ (DB canonical)
  const { data: updated, error: updateErr } = await supabase
    .from('orders')
    .update({
      status: 'REVISION_REQ', // DB canonical per Architecture v2.1 Section 10A
      status_version: order.status_version + 1,
    })
    .eq('id', orderId)
    .eq('status', 'AWAITING_APPROVAL')
    .eq('status_version', statusVersion)
    .select()
    .single();

  if (updateErr || !updated) {
    return NextResponse.json(
      { error: 'Concurrent modification. Please refresh.' }, { status: 409 }
    );
  }

  // Audit trail on delivery_packages
  await supabase.from('delivery_packages').update({
    cp3_decision: 'REQUEST_CHANGES',
    cp3_decision_at: new Date().toISOString(),
    cp3_decided_by: userId,
    cp3_revision_number: (pkg.status_version || 0) + 1,
  }).eq('id', pkg.id);

  // Log rework event for cap tracking
  await supabase.from('payment_events').insert({
    order_id: orderId,
    event_type: 'CP3_REQUEST_CHANGES',
    metadata: { reason, reworkCount: (reworkHistory?.length || 0) + 1 },
  });

  // Emit event — Fn1 re-enters at Phase VII per binding
  // Loop counter resets on attorney rework per binding 02/15
  await inngest.send({
    name: CANONICAL_EVENTS.ORDER_REVISION_REQUESTED,
    data: {
      orderId,
      workflowId: order.workflow_id,
      packageId: pkg.id,
      tier: order.tier,
      attorneyEmail: order.attorney_email,
      action: 'REQUEST_CHANGES',
      reason,
      reworkCount: (reworkHistory?.length || 0) + 1,
    },
  });

  return NextResponse.json({
    success: true,
    orderId,
    status: 'REVISION_REQUESTED', // TypeScript name for frontend
    reworkCount: (reworkHistory?.length || 0) + 1,
    maxReworks: CP3_REWORK_CAP,
  });
}
