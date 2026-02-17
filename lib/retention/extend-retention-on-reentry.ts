/**
 * Extend retention on order re-entry (ST6-01 Layer 2)
 *
 * Extends retention_expires_at when an order re-enters active processing.
 * Uses the LATER of: existing expiry vs. now + REVISION_RETENTION_EXTENSION_DAYS.
 * Resets deletion_reminder_sent so attorney gets a fresh reminder on next terminal state.
 *
 * MUST be called from:
 *   - POST /api/orders/[id]/revision (post-approval revision)
 *   - Fn2 REQUEST_CHANGES path (CP3 rework)
 *   - Fn1 Protocol 10 re-entry path
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { createLogger } from '@/lib/security/logger';

const log = createLogger('retention-extend-on-reentry');

const REVISION_RETENTION_EXTENSION_DAYS = 30;

export interface RetentionExtensionResult {
  previousExpiresAt: string | null;
  newExpiresAt: string;
  wasExtended: boolean;
}

/**
 * Extends retention_expires_at when an order re-enters active processing.
 * Uses the LATER of: existing expiry vs. now + 30 days.
 * Resets deletion_reminder_sent so attorney gets fresh reminder on next terminal state.
 *
 * @param supabase - Supabase admin client (service role, not user-scoped RLS client)
 * @param orderId - UUID of the order re-entering active processing
 * @returns Object with previous and new retention_expires_at values, and whether extension occurred
 * @throws Error if the order does not exist or the update fails
 */
export async function extendRetentionOnReentry(
  supabase: SupabaseClient,
  orderId: string
): Promise<RetentionExtensionResult> {
  // Step 1: Read current retention_expires_at
  const { data: order, error: readError } = await supabase
    .from('orders')
    .select('retention_expires_at')
    .eq('id', orderId)
    .single();

  if (readError || !order) {
    throw new Error(`Order ${orderId} not found: ${readError?.message ?? 'null result'}`);
  }

  const previousExpiresAt: string | null = order.retention_expires_at;
  const extensionMs = REVISION_RETENTION_EXTENSION_DAYS * 86_400_000;
  const minimumExpiry = new Date(Date.now() + extensionMs);

  // Guard: if retention_expires_at is null or invalid (pre-migration order),
  // default to full retention window from now.
  let currentExpiry: Date;
  if (!previousExpiresAt || isNaN(new Date(previousExpiresAt).getTime())) {
    currentExpiry = new Date(0); // Force extension
    log.warn('Order has null/invalid retention_expires_at — forcing extension', { orderId });
  } else {
    currentExpiry = new Date(previousExpiresAt);
  }

  // Use the LATER of the two dates: existing expiry or minimum extension
  const newExpiry = currentExpiry.getTime() > minimumExpiry.getTime()
    ? currentExpiry
    : minimumExpiry;

  const wasExtended = newExpiry.getTime() !== currentExpiry.getTime();

  // Step 2: Update retention and reset reminder flag
  const { error: updateError } = await supabase
    .from('orders')
    .update({
      retention_expires_at: newExpiry.toISOString(),
      deletion_reminder_sent: false,
      deletion_reminder_sent_at: null,
    })
    .eq('id', orderId);

  if (updateError) {
    throw new Error(`Retention extension failed for ${orderId}: ${updateError.message}`);
  }

  if (wasExtended) {
    log.info('Retention extended on re-entry', {
      orderId,
      previousExpiresAt,
      newExpiresAt: newExpiry.toISOString(),
    });
  }

  return {
    previousExpiresAt,
    newExpiresAt: newExpiry.toISOString(),
    wasExtended,
  };
}
