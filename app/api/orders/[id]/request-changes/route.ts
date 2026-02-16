/**
 * CP3 Request Changes Route — D6 C-008
 *
 * POST /api/orders/[id]/request-changes
 *
 * Attorney requests revisions at CP3 checkpoint.
 * Checks Protocol 10 block and rework cap before emitting event.
 * Fn2 handles status transition, cost reset, and Phase VII re-entry.
 *
 * D6 C-001: NO order_workflows table
 * D6 C-002: status_version optimistic lock
 * D6 C-003: workflowId from database only
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getServiceSupabase } from '@/lib/supabase/admin';
import { inngest } from '@/lib/inngest/client';
import { logCheckpointEvent } from '@/lib/workflow/checkpoint-logger';
import { CANONICAL_EVENTS, CP3_REWORK_CAP } from '@/lib/workflow/checkpoint-types';

const MAX_NOTES_LENGTH = 5000;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: orderId } = await params;

  // Gate 1: Auth
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Gate 2: Parse — notes required for request-changes
  let body: { status_version?: number; notes?: string } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { status_version, notes } = body;
  if (typeof status_version !== 'number') {
    return NextResponse.json({ error: 'status_version required' }, { status: 400 });
  }

  // Validate notes
  const trimmedNotes = typeof notes === 'string' ? notes.trim() : '';
  if (trimmedNotes.length > MAX_NOTES_LENGTH) {
    return NextResponse.json(
      { error: `Notes must be ${MAX_NOTES_LENGTH} characters or fewer.` },
      { status: 400 }
    );
  }

  // Gate 3: Ownership + status + P10 + rework cap
  const serviceClient = getServiceSupabase();
  const { data: order, error: orderError } = await serviceClient
    .from('orders')
    .select('id, status, status_version, workflow_id, client_id, protocol_10_triggered, attorney_rework_count')
    .eq('id', orderId)
    .single();

  if (orderError || !order) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  if (order.client_id !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  if (order.status !== 'AWAITING_APPROVAL') {
    return NextResponse.json({ error: `Order is ${order.status}` }, { status: 409 });
  }
  if (order.status_version !== status_version) {
    return NextResponse.json({ error: 'Concurrent modification' }, { status: 409 });
  }

  // Protocol 10 block
  if (order.protocol_10_triggered) {
    return NextResponse.json(
      { error: 'Request Changes is unavailable. Protocol 10 quality gate is active.', code: 'P10_BLOCKED' },
      { status: 422 }
    );
  }

  // Rework cap check
  if ((order.attorney_rework_count ?? 0) >= CP3_REWORK_CAP) {
    return NextResponse.json(
      { error: `Maximum revision cycles (${CP3_REWORK_CAP}) reached.`, code: 'REWORK_CAP_REACHED' },
      { status: 422 }
    );
  }

  // Execute: emit request-changes event
  try {
    await inngest.send({
      name: CANONICAL_EVENTS.WORKFLOW_CHECKPOINT_APPROVED,
      data: {
        orderId,
        workflowId: order.workflow_id, // FROM DATABASE
        action: 'REQUEST_CHANGES' as const,
        notes: trimmedNotes || null,
        attorneyId: user.id,
      },
    });

    await logCheckpointEvent(serviceClient, {
      orderId,
      eventType: 'CP3_REQUEST_CHANGES_REQUESTED',
      actor: user.id,
      metadata: { notes: trimmedNotes || null, reworkCount: (order.attorney_rework_count ?? 0) + 1 },
    });

    return NextResponse.json({
      success: true,
      message: 'Revision request submitted. Your motion will be re-drafted.',
    });
  } catch (error) {
    console.error('[request-changes] Failed:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
