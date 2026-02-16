/**
 * Status Guards Shared Library
 *
 * SP-4 Task 1 (R4-06): Three-gate authentication pattern for CP3 routes.
 * Gate 1: Authenticate user via Supabase JWT
 * Gate 2: Load order + verify ownership via client_id
 * Gate 3: Validate status precondition
 *
 * IMPORTANT: Uses orders.client_id — NEVER user_id.
 */

import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export interface AuthenticatedOrder {
  id: string;
  client_id: string;
  status: string;
  status_version: number;
  tier: string;
  workflow_id: string;
  attorney_rework_count: number;
  protocol_10_triggered: boolean;
  cp3_entered_at: string | null;
  cancellation_type: string | null;
}

/**
 * Gate 1: Authenticate user via Supabase JWT.
 * Gate 2: Load order and verify ownership via client_id.
 * Gate 3: Validate status precondition.
 *
 * Returns the authenticated order + userId on success, or a NextResponse error.
 */
export async function authenticateAndLoadOrder(
  orderId: string,
  allowedStatuses: string[]
): Promise<{ order: AuthenticatedOrder; userId: string } | NextResponse> {
  const supabase = await createClient();

  // Gate 1: Authenticate
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Gate 2: Load order + verify ownership
  const { data: order, error: orderError } = await supabase
    .from('orders')
    .select('id, client_id, status, status_version, tier, workflow_id, attorney_rework_count, protocol_10_triggered, cp3_entered_at, cancellation_type')
    .eq('id', orderId)
    .single();

  if (orderError || !order) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 });
  }

  if (order.client_id !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Gate 3: Status precondition
  if (!allowedStatuses.includes(order.status)) {
    return NextResponse.json(
      { error: `Action not allowed in status: ${order.status}`, current_status: order.status },
      { status: 409 }
    );
  }

  return { order: order as AuthenticatedOrder, userId: user.id };
}

/**
 * Validate optimistic lock (status_version match).
 * Returns null if valid, or an error NextResponse if version mismatch.
 */
export function validateOptimisticLock(
  order: AuthenticatedOrder,
  providedVersion: number
): NextResponse | null {
  if (order.status_version !== providedVersion) {
    return NextResponse.json(
      {
        error: 'Concurrent modification detected',
        expected_version: providedVersion,
        actual_version: order.status_version,
      },
      { status: 409 }
    );
  }
  return null;
}
