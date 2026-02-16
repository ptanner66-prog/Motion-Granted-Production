/**
 * CP3 Request Changes API
 *
 * POST /api/orders/[id]/request-changes
 *
 * Attorney requests changes to a delivered motion at CP3.
 * Three-gate auth: authenticate → verify ownership → validate status.
 * Transitions AWAITING_APPROVAL → REVISION_REQ (NOT REVISION_REQUESTED).
 *
 * Guards:
 * - Protocol 10 block: If cost cap triggered, changes not allowed.
 * - Rework cap: Maximum 3 rework cycles (BD-04).
 * - Notes required.
 *
 * SP-4 Task 2 (R4-06)
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticateAndLoadOrder, validateOptimisticLock } from '@/lib/orders/status-guards';
import { updateOrderStatus } from '@/lib/orders/status-machine';
import { logCheckpointEvent } from '@/lib/workflow/checkpoint-logger';
import { cancelCP3Timeouts } from '@/lib/workflow/cp3-timeouts';
import { getServiceSupabase } from '@/lib/supabase/admin';
import { inngest } from '@/lib/inngest/client';
import { CP3_REWORK_CAP } from '@/lib/workflow/checkpoint-types';

const MAX_NOTES_LENGTH = 5000;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: orderId } = await params;

  let body: { notes?: unknown; status_version?: unknown; package_id?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  // Validate status_version
  const statusVersion = typeof body.status_version === 'number' ? body.status_version : undefined;
  if (statusVersion === undefined) {
    return NextResponse.json({ error: 'status_version is required' }, { status: 400 });
  }

  // Validate notes
  const notes = typeof body.notes === 'string' ? body.notes.trim() : '';
  if (notes.length === 0) {
    return NextResponse.json(
      { error: 'Change notes are required' },
      { status: 400 }
    );
  }
  if (notes.length > MAX_NOTES_LENGTH) {
    return NextResponse.json(
      { error: `Notes must be ${MAX_NOTES_LENGTH} characters or fewer. Current: ${notes.length}` },
      { status: 400 }
    );
  }

  // Three-gate auth (accepts legacy statuses)
  const result = await authenticateAndLoadOrder(orderId, [
    'AWAITING_APPROVAL', 'draft_delivered', 'pending_review',
  ]);
  if (result instanceof NextResponse) return result;
  const { order, userId } = result;

  // Optimistic lock
  const lockError = validateOptimisticLock(order, statusVersion);
  if (lockError) return lockError;

  // Protocol 10 check
  if (order.protocol_10_triggered) {
    return NextResponse.json(
      { error: 'Request Changes blocked by Protocol 10', code: 'P10_BLOCKED' },
      { status: 422 }
    );
  }

  // Rework cap check (BD-04: max 3)
  if (order.attorney_rework_count >= CP3_REWORK_CAP) {
    return NextResponse.json(
      { error: `Maximum rework cycles (${CP3_REWORK_CAP}) reached`, code: 'REWORK_CAP_REACHED' },
      { status: 422 }
    );
  }

  const adminClient = getServiceSupabase();

  // Transition to REVISION_REQ (NOT REVISION_REQUESTED)
  const statusResult = await updateOrderStatus(
    adminClient, orderId, 'REVISION_REQ', order.status_version
  );

  if (!statusResult.success) {
    return NextResponse.json({ error: statusResult.error }, { status: 409 });
  }

  // Update rework metadata
  await adminClient.from('orders').update({
    attorney_rework_count: order.attorney_rework_count + 1,
    cp3_change_notes: notes,
  }).eq('id', orderId);

  // Record rejection in cp3_rejections
  const packageId = typeof body.package_id === 'string' ? body.package_id : null;
  await adminClient.from('cp3_rejections').insert({
    order_id: orderId,
    package_id: packageId,
    attorney_id: userId,
    change_notes: notes,
    rejection_number: order.attorney_rework_count + 1,
  });

  // Cancel CP3 timeouts
  await cancelCP3Timeouts(adminClient, orderId);

  // Log checkpoint event (immutable audit)
  await logCheckpointEvent(adminClient, {
    orderId,
    eventType: 'CP3_CHANGES_REQUESTED',
    actor: 'attorney',
    metadata: { notes, rejectionNumber: order.attorney_rework_count + 1 },
  });

  // Emit revision event — separate from DB ops (D5 W3-2 durability rule)
  await inngest.send({
    name: 'order/revision-requested',
    data: {
      orderId,
      workflowId: order.workflow_id,
      action: 'REQUEST_CHANGES',
      notes,
      attorneyId: userId,
    },
  });

  return NextResponse.json({
    success: true,
    status: 'revision_requested',
    status_version: statusResult.statusVersion,
  });
}
