/**
 * Webhook Helpers — Optimistic Concurrency (SP-10 AA-3)
 *
 * Source: D7-NEW-008 | Priority: P1
 *
 * Provides optimistic locking for webhook handlers to prevent
 * race conditions when multiple webhooks arrive for the same order.
 *
 * @module payments/webhook-helpers
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { validateTransition } from './payment-status';

interface OptimisticUpdateResult {
  success: boolean;
  currentStatus?: string;
  currentVersion?: number;
}

/**
 * Update order status with optimistic concurrency control.
 *
 * Uses status_version column as optimistic lock. If another handler
 * updates the order between read and write, the version check fails
 * and we return { success: false }.
 *
 * @param supabase - Supabase client (service_role for webhooks)
 * @param orderId - Order to update
 * @param expectedVersion - The status_version we read earlier
 * @param newStatus - Target status
 * @param additionalFields - Extra columns to update atomically
 */
export async function updateOrderStatusOptimistic(
  supabase: SupabaseClient,
  orderId: string,
  expectedVersion: number,
  newStatus: string,
  additionalFields?: Record<string, unknown>,
): Promise<OptimisticUpdateResult> {
  // Validate transition at application level first
  const { data: currentOrder } = await supabase
    .from('orders')
    .select('status, status_version')
    .eq('id', orderId)
    .single();

  if (!currentOrder) {
    return { success: false, currentStatus: undefined };
  }

  try {
    validateTransition(currentOrder.status, newStatus);
  } catch {
    // Terminal state or invalid transition
    return {
      success: false,
      currentStatus: currentOrder.status,
      currentVersion: currentOrder.status_version,
    };
  }

  // Optimistic lock: UPDATE with version check
  const updatePayload: Record<string, unknown> = {
    status: newStatus,
    status_version: expectedVersion + 1,
    updated_at: new Date().toISOString(),
    ...additionalFields,
  };

  const { data, error } = await supabase
    .from('orders')
    .update(updatePayload)
    .eq('id', orderId)
    .eq('status_version', expectedVersion)
    .select('id, status, status_version')
    .single();

  if (error || !data) {
    // 0 rows affected: another handler updated first
    const { data: reread } = await supabase
      .from('orders')
      .select('status, status_version')
      .eq('id', orderId)
      .single();

    return {
      success: false,
      currentStatus: reread?.status,
      currentVersion: reread?.status_version,
    };
  }

  return { success: true, currentStatus: newStatus, currentVersion: data.status_version };
}
