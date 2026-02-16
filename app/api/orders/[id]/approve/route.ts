/**
 * CP3 Approve Route — Directive 1 v2 Rewrite
 *
 * POST /api/orders/[id]/approve
 *
 * D6 C-001: NO order_workflows table — reads from orders directly
 * D6 C-002: Optimistic lock via status_version (NOT cp3_decision IS NULL)
 * D6 C-003: workflowId from DATABASE, NEVER from client request
 *
 * Attorney-only: order.client_id must match authenticated user.
 * Emits workflow/checkpoint-approved event; Fn2 handles delivery inline.
 * Status goes AWAITING_APPROVAL → COMPLETED (no APPROVED intermediate).
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getServiceSupabase } from '@/lib/supabase/admin';
import { inngest } from '@/lib/inngest/client';
import { logCheckpointEvent } from '@/lib/workflow/checkpoint-logger';
import { CANONICAL_EVENTS } from '@/lib/workflow/checkpoint-types';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: orderId } = await params;

  // === GATE 1: Authentication ===
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // === GATE 2: Parse request body ===
  // C-003 FIX: Only accept status_version from client. NEVER workflowId.
  let body: { status_version?: number } = {};
  try {
    body = await req.json();
  } catch {
    // Empty body — status_version will be validated below
  }

  const { status_version } = body;

  if (typeof status_version !== 'number') {
    return NextResponse.json(
      { error: 'status_version is required (number)' },
      { status: 400 }
    );
  }

  // === GATE 3: Ownership verification ===
  const serviceClient = getServiceSupabase();

  // C-001 FIX: Query orders table directly. NO order_workflows table.
  const { data: order, error: orderError } = await serviceClient
    .from('orders')
    .select('id, status, status_version, workflow_id, client_id, tier')
    .eq('id', orderId)
    .single();

  if (orderError || !order) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 });
  }

  // Ownership: attorney must own the order
  if (order.client_id !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Status: must be AWAITING_APPROVAL
  if (order.status !== 'AWAITING_APPROVAL') {
    return NextResponse.json(
      { error: `Order is ${order.status}, not AWAITING_APPROVAL` },
      { status: 409 }
    );
  }

  // === GATE 4: Optimistic lock via status_version ===
  // C-002 FIX: Use status_version as SOLE optimistic lock. NOT cp3_decision IS NULL.
  if (order.status_version !== status_version) {
    return NextResponse.json(
      {
        error: 'Concurrent modification detected. Please refresh and try again.',
        expected_version: order.status_version,
        received_version: status_version,
      },
      { status: 409 }
    );
  }

  // === EXECUTE: Emit approval event ===
  try {
    // C-003 FIX: workflowId from DATABASE, NEVER from client
    await inngest.send({
      name: CANONICAL_EVENTS.WORKFLOW_CHECKPOINT_APPROVED,
      data: {
        orderId,
        workflowId: order.workflow_id, // FROM DATABASE
        action: 'APPROVE' as const,
        notes: null,
        attorneyId: user.id,
      },
    });

    // Write cp3_decision to delivery_packages (AUDIT TRAIL, not lock)
    const { data: pkg } = await serviceClient
      .from('delivery_packages')
      .select('id')
      .eq('order_id', orderId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (pkg) {
      await serviceClient.from('delivery_packages').update({
        cp3_decision: 'APPROVED',
        cp3_decision_at: new Date().toISOString(),
        cp3_decided_by: user.id,
      }).eq('id', pkg.id);
    }

    // Log the action
    await logCheckpointEvent(serviceClient, {
      orderId,
      packageId: pkg?.id,
      eventType: 'CP3_APPROVE_REQUESTED',
      actor: user.id,
      metadata: { statusVersion: status_version },
    });

    return NextResponse.json({
      success: true,
      message: 'Approval processing. You will receive a delivery email shortly.',
    });
  } catch (error) {
    console.error('[approve] Failed to process approval:', error);
    return NextResponse.json(
      { error: 'Internal server error processing approval' },
      { status: 500 }
    );
  }
}
