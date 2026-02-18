// app/api/orders/[id]/approve/route.ts
// D6 Directive 1 v2 — COMPLETE REWRITE (SP-8)
// Resolves: C-001 (no phantom table), C-002 (status_version lock), C-003 (workflowId from DB)
// Resolves: C-008 (separate route), C-009 (canonical event payload)
// Status flow: AWAITING_APPROVAL → COMPLETED (no APPROVED intermediate — Conflict 2)

import { NextRequest, NextResponse } from 'next/server';
import { authenticateCP3Request } from '@/lib/api/cp3-auth';
import { inngest } from '@/lib/inngest/client';
import { CANONICAL_EVENTS } from '@/lib/workflow/checkpoint-types';
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

  // Parse request body — only status_version and optional reason
  // [C-003] NO workflowId from client. EVER.
  const body = await req.json().catch(() => ({}));
  const statusVersion = body.status_version;

  if (typeof statusVersion !== 'number') {
    return NextResponse.json(
      { error: 'status_version required' }, { status: 400 }
    );
  }

  // [C-002] Optimistic lock via status_version
  if (order.status_version !== statusVersion) {
    return NextResponse.json(
      { error: 'Concurrent modification. Please refresh and try again.' },
      { status: 409 }
    );
  }

  // Atomic status transition: AWAITING_APPROVAL → COMPLETED
  // No intermediate APPROVED status (Conflict 2 resolution)
  const { data: updated, error: updateErr } = await supabase
    .from('orders')
    .update({
      status: 'COMPLETED',
      status_version: order.status_version + 1,
      completed_at: new Date().toISOString(),
    })
    .eq('id', orderId)
    .eq('status', 'AWAITING_APPROVAL')
    .eq('status_version', statusVersion)
    .select()
    .single();

  if (updateErr || !updated) {
    return NextResponse.json(
      { error: 'Concurrent modification. Please refresh and try again.' },
      { status: 409 }
    );
  }

  // Write CP3 decision to delivery_packages (AUDIT TRAIL, not lock)
  await supabase.from('delivery_packages').update({
    cp3_decision: 'APPROVED',
    cp3_decision_at: new Date().toISOString(),
    cp3_decided_by: userId,
  }).eq('id', pkg.id);

  // [C-009] Emit workflow event with BINDING canonical payload
  // [C-003] workflowId from order.workflow_id (FROM DB), NEVER from client
  await inngest.send({
    name: CANONICAL_EVENTS.WORKFLOW_CHECKPOINT_APPROVED,
    data: {
      orderId,
      workflowId: order.workflow_id,
      packageId: pkg.id,
      tier: order.tier,
      attorneyEmail: order.attorney_email,
      action: 'APPROVE',
    },
  });

  return NextResponse.json({
    success: true,
    orderId,
    status: 'COMPLETED',
    status_version: order.status_version + 1,
  });
}
