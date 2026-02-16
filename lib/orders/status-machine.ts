/**
 * Order Status Machine
 *
 * D6 C-007 + SP-4 R4-06: Canonical status guard with optimistic locking.
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
  type OrderStatus,
  isValidStatus,
  isValidTransition,
} from '@/lib/config/status-transitions';

// ============================================================================
// TYPES
// ============================================================================

export interface StatusUpdateResult {
  success: boolean;
  previousStatus?: string;
  newStatus?: OrderStatus;
  statusVersion?: number;
  error?: string;
}

// ============================================================================
// STATUS MACHINE
// ============================================================================

/**
 * Update an order's status with transition validation and optimistic locking.
 *
 * Caller is responsible for:
 * 1. Authenticating the user (Gate 1)
 * 2. Loading the order and verifying ownership (Gate 2)
 * 3. Validating status precondition (Gate 3)
 * 4. Verifying optimistic lock (validateOptimisticLock)
 *
 * This function:
 * 1. Reads current status for transition validation
 * 2. Validates the transition is allowed
 * 3. Attempts UPDATE with WHERE status_version = expectedVersion
 * 4. Returns the new status_version from the DB trigger
 *
 * @param supabase - Supabase client (service_role for Inngest, user-scoped for API)
 * @param orderId - The order to update
 * @param newStatus - Target status (must be a valid OrderStatus)
 * @param expectedVersion - The status_version from the caller's read (optimistic lock)
 * @param extraFields - Optional additional fields to set on the order row
 * @returns StatusUpdateResult with success/failure details and new statusVersion
 */
export async function updateOrderStatus(
  supabase: SupabaseClient,
  orderId: string,
  newStatus: OrderStatus,
  expectedVersion: number,
  extraFields?: Record<string, unknown>
): Promise<StatusUpdateResult> {
  // 1. Validate target status
  if (!isValidStatus(newStatus)) {
    return {
      success: false,
      error: `Invalid target status: '${newStatus}'`,
    };
  }

  // 2. Read current status for transition validation
  const { data: order, error: readError } = await supabase
    .from('orders')
    .select('id, status, status_version')
    .eq('id', orderId)
    .single();

  if (readError || !order) {
    return {
      success: false,
      error: readError?.message ?? `Order '${orderId}' not found`,
    };
  }

  const currentStatus = order.status;

  // 3. Validate transition (if current status is in our canonical model)
  if (isValidStatus(currentStatus)) {
    if (!isValidTransition(currentStatus as OrderStatus, newStatus)) {
      return {
        success: false,
        previousStatus: currentStatus,
        error: `Invalid transition: '${currentStatus}' → '${newStatus}'`,
      };
    }
  }
  // If current status is a legacy value (e.g. 'draft_delivered'), allow transition
  // since the route already validated the precondition via allowedStatuses

  // 4. Optimistic lock: UPDATE only if status_version matches expected
  const updatePayload: Record<string, unknown> = {
    status: newStatus,
    updated_at: new Date().toISOString(),
    ...extraFields,
  };

  const { data: updated, error: updateError } = await supabase
    .from('orders')
    .update(updatePayload)
    .match({
      id: orderId,
      status_version: expectedVersion,
    })
    .select('id, status, status_version')
    .single();

  if (updateError || !updated) {
    return {
      success: false,
      previousStatus: currentStatus,
      error: `Concurrent modification detected on order '${orderId}'. ` +
        `Expected version ${expectedVersion}. Retry the operation.`,
    };
  }

  console.info(
    `[status-machine] ${orderId}: ${currentStatus} → ${newStatus} (v${expectedVersion} → v${updated.status_version})`
  );

  return {
    success: true,
    previousStatus: currentStatus,
    newStatus,
    statusVersion: updated.status_version,
  };
}
