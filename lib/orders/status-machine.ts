/**
 * Order Status Machine
 *
 * D6 C-007: Canonical status guard with optimistic locking.
 * Every status change in the system MUST go through updateOrderStatus().
 *
 * Uses status_version column (D1-021 migration) for optimistic concurrency:
 * the UPDATE only succeeds if the version hasn't changed since we read it.
 * If another process changed the status first, we get 0 rows affected.
 *
 * IMPORTANT: Uses 'REVISION_REQ' — never 'REVISION_REQUESTED'.
 */

import { SupabaseClient } from '@supabase/supabase-js';
import {
  OrderStatus,
  isValidStatus,
  isValidTransition,
  isTerminalStatus,
} from '@/lib/config/status-transitions';

// ============================================================================
// TYPES
// ============================================================================

export interface StatusUpdateResult {
  success: boolean;
  previousStatus?: OrderStatus;
  newStatus?: OrderStatus;
  error?: string;
}

interface OrderStatusRow {
  id: string;
  status: string;
  status_version: number;
}

// ============================================================================
// STATUS MACHINE
// ============================================================================

/**
 * Update an order's status with transition validation and optimistic locking.
 *
 * Steps:
 * 1. Read current status + status_version
 * 2. Validate the transition is allowed
 * 3. Attempt UPDATE with WHERE status_version = expected
 * 4. If 0 rows affected → concurrent modification, return error
 *
 * The status_version column auto-increments via the DB trigger
 * (20260216100004_status_version_trigger.sql), so we don't set it here.
 *
 * @param supabase - Supabase client (service_role for Inngest, user-scoped for API)
 * @param orderId - The order to update
 * @param newStatus - Target status (must be a valid OrderStatus)
 * @param actor - Who is making the change (for audit trail)
 * @returns StatusUpdateResult with success/failure details
 */
export async function updateOrderStatus(
  supabase: SupabaseClient,
  orderId: string,
  newStatus: OrderStatus,
  actor: string
): Promise<StatusUpdateResult> {
  // 1. Validate target status
  if (!isValidStatus(newStatus)) {
    return {
      success: false,
      error: `Invalid target status: '${newStatus}'`,
    };
  }

  // 2. Read current state
  const { data: order, error: readError } = await supabase
    .from('orders')
    .select('id, status, status_version')
    .eq('id', orderId)
    .single<OrderStatusRow>();

  if (readError || !order) {
    return {
      success: false,
      error: readError?.message ?? `Order '${orderId}' not found`,
    };
  }

  const currentStatus = order.status as OrderStatus;

  // 3. Validate current status is known
  if (!isValidStatus(currentStatus)) {
    return {
      success: false,
      previousStatus: currentStatus,
      error: `Order has unknown status: '${currentStatus}'`,
    };
  }

  // 4. Check terminal state
  if (isTerminalStatus(currentStatus)) {
    return {
      success: false,
      previousStatus: currentStatus,
      error: `Cannot transition from terminal status '${currentStatus}'`,
    };
  }

  // 5. Validate transition
  if (!isValidTransition(currentStatus, newStatus)) {
    return {
      success: false,
      previousStatus: currentStatus,
      error: `Invalid transition: '${currentStatus}' → '${newStatus}'`,
    };
  }

  // 6. Optimistic lock: UPDATE only if status_version hasn't changed
  const { data: updated, error: updateError } = await supabase
    .from('orders')
    .update({
      status: newStatus,
      updated_at: new Date().toISOString(),
    })
    .match({
      id: orderId,
      status_version: order.status_version,
    })
    .select('id, status')
    .single();

  if (updateError || !updated) {
    // Concurrent modification — another process changed status first
    return {
      success: false,
      previousStatus: currentStatus,
      error: `Concurrent modification detected on order '${orderId}'. ` +
        `Expected version ${order.status_version}. Retry the operation.`,
    };
  }

  console.info(
    `[status-machine] ${orderId}: ${currentStatus} → ${newStatus} (actor: ${actor})`
  );

  return {
    success: true,
    previousStatus: currentStatus,
    newStatus,
  };
}
