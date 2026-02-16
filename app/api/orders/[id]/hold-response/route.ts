/**
 * Hold Response API
 *
 * POST /api/orders/[id]/hold-response
 *
 * Attorney responds to a HOLD checkpoint (Phase III evidence gap).
 * Three response types:
 *   - EVIDENCE_PROVIDED: Attorney uploaded evidence, continue workflow
 *   - ACKNOWLEDGED: Attorney acknowledges gap, continue anyway
 *   - CANCEL: Attorney cancels due to hold
 *
 * Uses three-gate auth: authenticate → verify ownership → validate IN_PROGRESS.
 * Also verifies an active HOLD checkpoint exists.
 *
 * SP-4 Task 3 (R4-11): BD-R3-02
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticateAndLoadOrder, validateOptimisticLock } from '@/lib/orders/status-guards';
import { logCheckpointEvent } from '@/lib/workflow/checkpoint-logger';
import { getServiceSupabase } from '@/lib/supabase/admin';

const VALID_RESPONSE_TYPES = ['EVIDENCE_PROVIDED', 'ACKNOWLEDGED', 'CANCEL'] as const;
type ResponseType = typeof VALID_RESPONSE_TYPES[number];

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: orderId } = await params;

  let body: {
    status_version?: unknown;
    response_type?: unknown;
    evidence_notes?: unknown;
    evidence_file_keys?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  // Validate required fields
  if (typeof body.status_version !== 'number') {
    return NextResponse.json({ error: 'status_version is required (number)' }, { status: 400 });
  }

  const responseType = body.response_type as string;
  if (!responseType || !VALID_RESPONSE_TYPES.includes(responseType as ResponseType)) {
    return NextResponse.json(
      { error: `Invalid response_type. Must be one of: ${VALID_RESPONSE_TYPES.join(', ')}` },
      { status: 400 }
    );
  }

  // HOLD status is IN_PROGRESS with an active HOLD checkpoint
  // Also accept legacy hold statuses
  const result = await authenticateAndLoadOrder(orderId, [
    'IN_PROGRESS', 'in_progress', 'HOLD_PENDING', 'on_hold',
  ]);
  if (result instanceof NextResponse) return result;
  const { order, userId } = result;

  // Optimistic lock
  const lockError = validateOptimisticLock(order, body.status_version);
  if (lockError) return lockError;

  const adminClient = getServiceSupabase();

  // Verify there's an active HOLD checkpoint
  const { data: activeHold } = await adminClient
    .from('checkpoints')
    .select('id, phase, hold_reason')
    .match({ order_id: orderId, type: 'HOLD', status: 'PENDING' })
    .single();

  if (!activeHold) {
    return NextResponse.json({ error: 'No active HOLD checkpoint found' }, { status: 404 });
  }

  // Process response
  const resolution = responseType === 'CANCEL' ? 'CANCELLED' : 'RESOLVED';

  await adminClient.from('checkpoints').update({
    status: resolution,
    resolved_at: new Date().toISOString(),
    resolved_by: userId,
    resolution_data: {
      response_type: responseType,
      evidence_notes: typeof body.evidence_notes === 'string' ? body.evidence_notes : null,
      evidence_file_keys: Array.isArray(body.evidence_file_keys) ? body.evidence_file_keys : [],
    },
  }).eq('id', activeHold.id);

  // Log checkpoint event (immutable audit)
  await logCheckpointEvent(adminClient, {
    orderId,
    checkpointId: activeHold.id,
    eventType: `HOLD_${responseType}`,
    actor: 'customer',
    metadata: { phase: activeHold.phase, responseType },
  });

  return NextResponse.json({
    success: true,
    status: resolution.toLowerCase(),
    checkpoint_id: activeHold.id,
  });
}
