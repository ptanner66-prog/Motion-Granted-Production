// /lib/services/webhook-logger.ts
// Centralized webhook failure logging for Stripe webhooks
// Task 13: Webhook Null Safety
// VERSION: 1.0 — January 28, 2026

import { createClient } from '@/lib/supabase/server';
import { headers } from 'next/headers';

import { createLogger } from '@/lib/security/logger';

const log = createLogger('services-webhook-logger');
/**
 * Webhook failure types for classification
 */
export type WebhookFailureType =
  | 'MISSING_SIGNATURE'
  | 'INVALID_SIGNATURE'
  | 'MISSING_DATA'
  | 'MISSING_METADATA'
  | 'MISSING_ORDER_ID'
  | 'DB_UPDATE_FAILED'
  | 'PAYMENT_FAILED'
  | 'HANDLER_ERROR'
  | 'UNKNOWN_ERROR';

/**
 * Webhook failure log entry
 */
export interface WebhookFailureEntry {
  failure_type: WebhookFailureType;
  stripe_event_id?: string | null;
  stripe_event_type?: string | null;
  details?: string;
  error_message?: string;
  order_id?: string | null;
  user_id?: string | null;
  request_headers?: Record<string, string>;
}

/**
 * Log a webhook failure to the database
 *
 * This function is designed to never throw - it logs errors internally
 * and returns a boolean indicating success/failure.
 *
 * @param entry - The failure details to log
 * @returns true if logged successfully, false otherwise
 */
export async function logWebhookFailure(entry: WebhookFailureEntry): Promise<boolean> {
  try {
    const supabase = await createClient();
    const headersList = await headers();

    // Capture request context
    const ip = headersList.get('x-forwarded-for')?.split(',')[0]?.trim()
      || headersList.get('x-real-ip')
      || null;
    const userAgent = headersList.get('user-agent') || null;

    // Build sanitized headers object (exclude sensitive data)
    const safeHeaders: Record<string, string> = {};
    const safeHeaderNames = [
      'content-type',
      'stripe-signature',
      'user-agent',
      'x-forwarded-for',
      'x-real-ip',
    ];

    for (const name of safeHeaderNames) {
      const value = headersList.get(name);
      if (value) {
        // Truncate stripe-signature for privacy
        safeHeaders[name] = name === 'stripe-signature'
          ? value.substring(0, 50) + '...'
          : value;
      }
    }

    const { error } = await supabase.from('webhook_failures').insert({
      failure_type: entry.failure_type,
      stripe_event_id: entry.stripe_event_id || null,
      stripe_event_type: entry.stripe_event_type || null,
      details: entry.details || null,
      error_message: entry.error_message || null,
      order_id: entry.order_id || null,
      user_id: entry.user_id || null,
      ip_address: ip,
      user_agent: userAgent,
      request_headers: safeHeaders,
    });

    if (error) {
      // Log to console as fallback - never let logging failure crash the webhook
      log.error('[WebhookLogger] Failed to log webhook failure to database:', error);
      log.error('[WebhookLogger] Original failure:', JSON.stringify(entry, null, 2));
      return false;
    }

    log.info(`[WebhookLogger] Logged ${entry.failure_type} failure for event ${entry.stripe_event_id || 'unknown'}`);
    return true;

  } catch (e) {
    // Absolute fallback - log to console
    log.error('[WebhookLogger] Exception while logging webhook failure:', e);
    log.error('[WebhookLogger] Original failure:', JSON.stringify(entry, null, 2));
    return false;
  }
}

/**
 * Get recent webhook failures for admin dashboard
 *
 * @param limit - Maximum number of failures to return (default 50)
 * @param unresolvedOnly - Only return unresolved failures
 * @returns Array of webhook failures
 */
export async function getRecentWebhookFailures(
  limit: number = 50,
  unresolvedOnly: boolean = false
): Promise<WebhookFailureEntry[]> {
  const supabase = await createClient();

  let query = supabase
    .from('webhook_failures')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (unresolvedOnly) {
    query = query.is('resolved_at', null);
  }

  const { data, error } = await query;

  if (error) {
    log.error('[WebhookLogger] Failed to fetch webhook failures:', error);
    return [];
  }

  return data || [];
}

/**
 * Mark a webhook failure as resolved
 *
 * @param failureId - UUID of the failure to resolve
 * @param resolvedBy - User ID of the admin resolving
 * @param notes - Optional resolution notes
 */
export async function resolveWebhookFailure(
  failureId: string,
  resolvedBy: string,
  notes?: string
): Promise<boolean> {
  const supabase = await createClient();

  const { error } = await supabase
    .from('webhook_failures')
    .update({
      resolved_at: new Date().toISOString(),
      resolved_by: resolvedBy,
      resolution_notes: notes || null,
    })
    .eq('id', failureId);

  if (error) {
    log.error('[WebhookLogger] Failed to resolve webhook failure:', error);
    return false;
  }

  return true;
}
