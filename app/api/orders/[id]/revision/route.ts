/**
 * Revision API
 *
 * POST /api/orders/[id]/revision — Resume workflow from REVISION_REQ → PROCESSING
 * GET  /api/orders/[id]/revision — Revision history for the order
 *
 * SP-4 Task 2 (R4-06): POST rewritten with three-gate pattern.
 * GET handler preserved for revision history.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { authenticateAndLoadOrder, validateOptimisticLock } from '@/lib/orders/status-guards';
import { updateOrderStatus } from '@/lib/orders/status-machine';
import { getServiceSupabase } from '@/lib/supabase/admin';
import { extendRetentionOnReentry } from '@/lib/retention/extend-retention-on-reentry';
import { createLogger } from '@/lib/security/logger';

const log = createLogger('api-orders-revision');

/**
 * POST /api/orders/[id]/revision
 *
 * Transitions REVISION_REQ → PROCESSING to resume workflow after CP3 changes.
 * Uses three-gate auth pattern + optimistic locking.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: orderId } = await params;

  let body: { status_version?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const statusVersion = typeof body.status_version === 'number' ? body.status_version : undefined;
  if (statusVersion === undefined) {
    return NextResponse.json({ error: 'status_version is required' }, { status: 400 });
  }

  // Only from REVISION_REQ status
  const result = await authenticateAndLoadOrder(orderId, ['REVISION_REQ']);
  if (result instanceof NextResponse) return result;
  const { order } = result;

  // Optimistic lock
  const lockError = validateOptimisticLock(order, statusVersion);
  if (lockError) return lockError;

  const adminClient = getServiceSupabase();

  const statusResult = await updateOrderStatus(
    adminClient, orderId, 'PROCESSING', order.status_version
  );

  if (!statusResult.success) {
    return NextResponse.json({ error: statusResult.error }, { status: 409 });
  }

  // ST6-01: Extend retention on re-entry to prevent deletion during active revision
  try {
    await extendRetentionOnReentry(adminClient, orderId);
  } catch (retentionError) {
    // Non-blocking: log but don't fail the revision transition
    log.error('Failed to extend retention on revision re-entry', {
      orderId,
      error: retentionError instanceof Error ? retentionError.message : retentionError,
    });
  }

  return NextResponse.json({
    success: true,
    status: 'revision_started',
    status_version: statusResult.statusVersion,
  });
}

/**
 * GET /api/orders/[id]/revision
 * Get revision history for an order
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: orderId } = await params;
    const supabase = await createClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('id, client_id, revision_count, revision_notes, revision_requested_at, attorney_rework_count')
      .eq('id', orderId)
      .single();

    if (orderError || !order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    if (order.client_id !== user.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const { data: revisionLogs } = await supabase
      .from('automation_logs')
      .select('action_type, action_details, created_at')
      .eq('order_id', orderId)
      .in('action_type', ['revision_requested', 'revision_completed', 'checkpoint_changes_requested'])
      .order('created_at', { ascending: false });

    return NextResponse.json(
      {
        revisionCount: order.revision_count ?? 0,
        attorneyReworkCount: order.attorney_rework_count ?? 0,
        maxFreeRevisions: 1,
        remainingRevisions: Math.max(0, 1 - (order.revision_count ?? 0)),
        currentRevisionNotes: order.revision_notes,
        lastRevisionRequestedAt: order.revision_requested_at,
        history: revisionLogs ?? [],
      },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    log.error('Revision API error', { error: error instanceof Error ? error.message : error });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
