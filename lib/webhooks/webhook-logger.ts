/**
 * Webhook Event Logging (Task 70)
 *
 * Comprehensive webhook event logging for Stripe and Inngest.
 *
 * Log fields:
 * - Timestamp
 * - Source (stripe, inngest)
 * - Event type
 * - Payload hash (not full payload for PII)
 * - Processing status
 * - Processing duration
 * - Error if failed
 *
 * Source: Chunk 10, Task 70 - P2 Pre-Launch
 */

import { createHash } from 'crypto';
import { createClient } from '@/lib/supabase/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

// ============================================================================
// TYPES
// ============================================================================

export interface WebhookLogEntry {
  id: string;
  source: 'stripe' | 'inngest';
  eventType: string;
  eventId: string;
  payloadHash: string;
  status: 'received' | 'processing' | 'success' | 'failed';
  processingDurationMs?: number;
  errorMessage?: string;
  receivedAt: Date;
  processedAt?: Date;
}

export interface WebhookLogFilters {
  source?: string;
  status?: string;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get admin supabase client
 */
function getAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return null;
  }

  return createSupabaseClient(supabaseUrl, supabaseKey);
}

/**
 * Hash payload for logging without storing PII
 * Uses SHA-256 for consistent hashing
 */
export function hashPayload(payload: Record<string, unknown>): string {
  // Sort keys for consistent hashing
  const sortedPayload = JSON.stringify(payload, Object.keys(payload).sort());
  return createHash('sha256').update(sortedPayload).digest('hex');
}

/**
 * Extract relevant event info from payload
 */
function extractEventInfo(
  source: 'stripe' | 'inngest',
  payload: Record<string, unknown>
): { eventType: string; eventId: string } {
  if (source === 'stripe') {
    return {
      eventType: (payload.type as string) || 'unknown',
      eventId: (payload.id as string) || `stripe_${Date.now()}`,
    };
  }

  // Inngest
  return {
    eventType: (payload.name as string) || (payload.event as Record<string, unknown>)?.name as string || 'unknown',
    eventId: (payload.id as string) || (payload.event as Record<string, unknown>)?.id as string || `inngest_${Date.now()}`,
  };
}

// ============================================================================
// LOGGING FUNCTIONS
// ============================================================================

/**
 * Log webhook received
 * Returns the log entry ID for later updates
 */
export async function logWebhookReceived(
  source: 'stripe' | 'inngest',
  eventType: string,
  eventId: string,
  payload: Record<string, unknown>
): Promise<string> {
  const supabase = getAdminClient();

  if (!supabase) {
    console.error('[WebhookLogger] Database not configured');
    return `local_${Date.now()}`;
  }

  const payloadHash = hashPayload(payload);

  try {
    const { data, error } = await supabase
      .from('webhook_log')
      .upsert(
        {
          source,
          event_type: eventType,
          event_id: eventId,
          payload_hash: payloadHash,
          status: 'received',
          received_at: new Date().toISOString(),
        },
        {
          onConflict: 'source,event_id',
          ignoreDuplicates: false,
        }
      )
      .select('id')
      .single();

    if (error) {
      console.error('[WebhookLogger] Failed to log webhook:', error);
      return `error_${Date.now()}`;
    }

    return data.id;
  } catch (error) {
    console.error('[WebhookLogger] Error:', error);
    return `error_${Date.now()}`;
  }
}

/**
 * Update webhook log with processing result
 */
export async function logWebhookProcessed(
  logId: string,
  status: 'success' | 'failed',
  durationMs: number,
  errorMessage?: string
): Promise<void> {
  // Skip local/error IDs
  if (logId.startsWith('local_') || logId.startsWith('error_')) {
    return;
  }

  const supabase = getAdminClient();

  if (!supabase) {
    return;
  }

  try {
    await supabase
      .from('webhook_log')
      .update({
        status,
        processing_duration_ms: durationMs,
        error_message: errorMessage || null,
        processed_at: new Date().toISOString(),
      })
      .eq('id', logId);
  } catch (error) {
    console.error('[WebhookLogger] Failed to update log:', error);
  }
}

/**
 * Mark webhook as processing
 */
export async function logWebhookProcessing(logId: string): Promise<void> {
  if (logId.startsWith('local_') || logId.startsWith('error_')) {
    return;
  }

  const supabase = getAdminClient();

  if (!supabase) {
    return;
  }

  try {
    await supabase
      .from('webhook_log')
      .update({ status: 'processing' })
      .eq('id', logId);
  } catch (error) {
    console.error('[WebhookLogger] Failed to update status:', error);
  }
}

/**
 * Get webhook logs with optional filters
 */
export async function getWebhookLogs(
  filters?: WebhookLogFilters
): Promise<WebhookLogEntry[]> {
  const supabase = getAdminClient();

  if (!supabase) {
    return [];
  }

  try {
    let query = supabase
      .from('webhook_log')
      .select('*')
      .order('received_at', { ascending: false })
      .limit(filters?.limit || 100);

    if (filters?.source) {
      query = query.eq('source', filters.source);
    }

    if (filters?.status) {
      query = query.eq('status', filters.status);
    }

    if (filters?.startDate) {
      query = query.gte('received_at', filters.startDate.toISOString());
    }

    if (filters?.endDate) {
      query = query.lte('received_at', filters.endDate.toISOString());
    }

    const { data, error } = await query;

    if (error || !data) {
      return [];
    }

    return data.map((row) => ({
      id: row.id,
      source: row.source as 'stripe' | 'inngest',
      eventType: row.event_type,
      eventId: row.event_id,
      payloadHash: row.payload_hash,
      status: row.status as WebhookLogEntry['status'],
      processingDurationMs: row.processing_duration_ms,
      errorMessage: row.error_message,
      receivedAt: new Date(row.received_at),
      processedAt: row.processed_at ? new Date(row.processed_at) : undefined,
    }));
  } catch (error) {
    console.error('[WebhookLogger] Failed to fetch logs:', error);
    return [];
  }
}

/**
 * Get webhook statistics
 */
export async function getWebhookStats(since?: Date): Promise<{
  total: number;
  bySource: Record<string, number>;
  byStatus: Record<string, number>;
  avgDurationMs: number;
  failureRate: number;
}> {
  const supabase = getAdminClient();

  if (!supabase) {
    return {
      total: 0,
      bySource: {},
      byStatus: {},
      avgDurationMs: 0,
      failureRate: 0,
    };
  }

  try {
    let query = supabase.from('webhook_log').select('*');

    if (since) {
      query = query.gte('received_at', since.toISOString());
    }

    const { data, error } = await query;

    if (error || !data) {
      return {
        total: 0,
        bySource: {},
        byStatus: {},
        avgDurationMs: 0,
        failureRate: 0,
      };
    }

    const bySource: Record<string, number> = {};
    const byStatus: Record<string, number> = {};
    let totalDuration = 0;
    let durationCount = 0;
    let failedCount = 0;

    for (const row of data) {
      // Count by source
      bySource[row.source] = (bySource[row.source] || 0) + 1;

      // Count by status
      byStatus[row.status] = (byStatus[row.status] || 0) + 1;

      // Track duration
      if (row.processing_duration_ms) {
        totalDuration += row.processing_duration_ms;
        durationCount++;
      }

      // Track failures
      if (row.status === 'failed') {
        failedCount++;
      }
    }

    return {
      total: data.length,
      bySource,
      byStatus,
      avgDurationMs: durationCount > 0 ? totalDuration / durationCount : 0,
      failureRate: data.length > 0 ? failedCount / data.length : 0,
    };
  } catch (error) {
    console.error('[WebhookLogger] Failed to get stats:', error);
    return {
      total: 0,
      bySource: {},
      byStatus: {},
      avgDurationMs: 0,
      failureRate: 0,
    };
  }
}

// ============================================================================
// WEBHOOK HANDLER WRAPPER
// ============================================================================

/**
 * Wrap a webhook handler with automatic logging
 */
export function withWebhookLogging<T>(
  source: 'stripe' | 'inngest',
  handler: (payload: Record<string, unknown>) => Promise<T>
): (payload: Record<string, unknown>) => Promise<T> {
  return async (payload: Record<string, unknown>): Promise<T> => {
    const { eventType, eventId } = extractEventInfo(source, payload);
    const startTime = Date.now();

    // Log receipt
    const logId = await logWebhookReceived(source, eventType, eventId, payload);

    // Mark as processing
    await logWebhookProcessing(logId);

    try {
      // Execute handler
      const result = await handler(payload);

      // Log success
      const durationMs = Date.now() - startTime;
      await logWebhookProcessed(logId, 'success', durationMs);

      return result;
    } catch (error) {
      // Log failure
      const durationMs = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      await logWebhookProcessed(logId, 'failed', durationMs, errorMessage);

      throw error;
    }
  };
}
