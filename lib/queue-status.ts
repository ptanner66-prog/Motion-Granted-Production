/**
 * Queue Status Helper Functions
 *
 * Utilities for calculating and displaying queue position,
 * estimated completion times, and aggregate queue statistics
 * for client-facing and admin dashboards.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Result of queue statistics computation.
 * null values indicate the underlying query failed — consumers should
 * display an error indicator rather than defaulting to 0.
 */
export interface QueueStatsResult {
  /** Count of orders waiting in queue (submitted / under_review) */
  queue_depth: number | null
  /** Count of orders currently being generated (in_progress) */
  processing_count: number | null
  /** Count of orders completed in the last 24 hours */
  completed_today: number | null
  /** Count of orders with generation_failed status */
  failed_count: number | null
  /** Average generation duration in seconds (last 7 days), 0 if no data */
  avg_generation_seconds: number | null
  /** Minutes since the oldest pending order was created, 0 if none pending */
  oldest_pending_minutes: number | null
}

/**
 * Compute queue statistics using direct Supabase queries.
 *
 * Does NOT rely on the get_queue_stats stored PostgreSQL function,
 * which may not be deployed. Instead uses the same .from('orders')
 * query patterns that power the Active Queue table and Recently
 * Completed section — both of which are known to work.
 *
 * All 6 queries run in parallel via Promise.all for performance (< 500ms).
 * Individual query failures yield null for that stat so the caller
 * can render "Error" instead of a misleading 0.
 *
 * @param supabase - Any Supabase client (SSR or service-role)
 * @returns Queue statistics with null indicating per-stat errors
 */
export async function getQueueStats(
  supabase: SupabaseClient
): Promise<QueueStatsResult> {
  const now = new Date()
  const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()

  const [
    queueDepthResult,
    processingResult,
    completedTodayResult,
    failedResult,
    recentCompletionsResult,
    oldestPendingResult,
  ] = await Promise.all([
    // R-01: Queue Depth — orders waiting for generation
    supabase
      .from('orders')
      .select('*', { count: 'exact', head: true })
      .in('status', ['SUBMITTED', 'UNDER_REVIEW']),

    // R-02: Processing — orders actively being generated
    supabase
      .from('orders')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'PROCESSING'),

    // R-03: Completed Today — matches the Recently Completed section filter
    supabase
      .from('orders')
      .select('*', { count: 'exact', head: true })
      .in('status', ['PENDING_REVIEW', 'DRAFT_DELIVERED', 'COMPLETED'])
      .gte('generation_completed_at', twentyFourHoursAgo),

    // R-04: Failed — matches the Active Queue table's "Failed" badge filter
    supabase
      .from('orders')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'generation_failed'),

    // R-05: Avg Generation Time data — completions from last 7 days
    supabase
      .from('orders')
      .select('generation_started_at, generation_completed_at')
      .not('generation_started_at', 'is', null)
      .not('generation_completed_at', 'is', null)
      .gte('generation_completed_at', sevenDaysAgo)
      .limit(200),

    // R-07: Oldest Pending — oldest order in submitted/under_review
    supabase
      .from('orders')
      .select('created_at')
      .in('status', ['SUBMITTED', 'UNDER_REVIEW'])
      .order('created_at', { ascending: true })
      .limit(1),
  ])

  // R-05: Compute average generation seconds from fetched rows
  let avgGenerationSeconds: number | null = null
  if (!recentCompletionsResult.error && recentCompletionsResult.data?.length) {
    const durations: number[] = []
    for (const row of recentCompletionsResult.data) {
      const started = new Date(row.generation_started_at as string).getTime()
      const completed = new Date(row.generation_completed_at as string).getTime()
      const durationSec = (completed - started) / 1000
      // Exclude negative durations and extreme outliers (> 24h)
      if (durationSec > 0 && durationSec < 86400) {
        durations.push(durationSec)
      }
    }
    if (durations.length > 0) {
      avgGenerationSeconds = durations.reduce((sum, d) => sum + d, 0) / durations.length
    }
  }

  // R-07: Compute oldest pending minutes from the earliest created_at
  let oldestPendingMinutes: number | null = null
  if (!oldestPendingResult.error && oldestPendingResult.data?.length) {
    const oldestCreatedAt = new Date(oldestPendingResult.data[0].created_at as string).getTime()
    oldestPendingMinutes = (now.getTime() - oldestCreatedAt) / (1000 * 60)
  }

  return {
    queue_depth: queueDepthResult.error ? null : (queueDepthResult.count ?? 0),
    processing_count: processingResult.error ? null : (processingResult.count ?? 0),
    completed_today: completedTodayResult.error ? null : (completedTodayResult.count ?? 0),
    failed_count: failedResult.error ? null : (failedResult.count ?? 0),
    avg_generation_seconds: recentCompletionsResult.error ? null : (avgGenerationSeconds ?? 0),
    oldest_pending_minutes: oldestPendingResult.error ? null : (oldestPendingMinutes ?? 0),
  }
}

/**
 * Get the queue position for an order
 *
 * @param orderId - The order ID to check
 * @param supabase - Supabase client instance
 * @returns Queue position (1-based) or null if not in queue
 */
export async function getQueuePosition(
  orderId: string,
  supabase: {
    from: (table: string) => {
      select: (columns: string) => {
        eq: (column: string, value: string) => {
          single: () => Promise<{ data: { queue_position: number | null } | null; error: Error | null }>;
        };
      };
    };
    rpc: (fn: string, params: { order_id: string }) => Promise<{ data: number | null; error: Error | null }>;
  }
): Promise<number | null> {
  // First try to get from the cached queue_position column
  const { data: order } = await supabase
    .from("orders")
    .select("queue_position")
    .eq("id", orderId)
    .single();

  if (order?.queue_position) {
    return order.queue_position;
  }

  // Fall back to the stored function
  try {
    const { data: position } = await supabase.rpc("get_queue_position", {
      order_id: orderId,
    });
    return position;
  } catch {
    return null;
  }
}

/**
 * Estimate completion time based on queue position
 *
 * @param queuePosition - Position in queue (1-based)
 * @param avgMinutesPerOrder - Average minutes per order (default: 2)
 * @returns Human-readable estimate string
 */
export function estimateCompletion(
  queuePosition: number,
  avgMinutesPerOrder: number = 2
): string {
  if (queuePosition <= 0) {
    return "Processing now";
  }

  const minutes = queuePosition * avgMinutesPerOrder;

  if (minutes < 1) {
    return "Less than a minute";
  }
  if (minutes < 60) {
    return `~${Math.round(minutes)} minute${minutes !== 1 ? "s" : ""}`;
  }

  const hours = minutes / 60;
  if (hours < 24) {
    return `~${hours.toFixed(1)} hour${hours !== 1 ? "s" : ""}`;
  }

  const days = hours / 24;
  return `~${days.toFixed(1)} day${days !== 1 ? "s" : ""}`;
}

/**
 * Get status-specific message for client display
 *
 * @param status - Order status
 * @param queuePosition - Position in queue (if applicable)
 * @returns Message object with title and description
 */
export function getQueueStatusMessage(
  status: string,
  queuePosition: number | null
): { title: string; description: string; showProgress: boolean } {
  switch (status) {
    case "submitted":
    case "under_review":
      return {
        title: queuePosition
          ? `Position #${queuePosition} in queue`
          : "In queue",
        description: queuePosition
          ? `Your motion is #${queuePosition} in line. Estimated completion: ${estimateCompletion(queuePosition)}`
          : "Your motion is in the queue and will be processed soon.",
        showProgress: true,
      };

    case "in_progress":
      return {
        title: "Generating your motion",
        description:
          "Our AI is currently drafting your motion. This typically takes 1-3 minutes.",
        showProgress: true,
      };

    case "pending_review":
      return {
        title: "Ready for review",
        description:
          "Your motion draft is complete and being reviewed by our team.",
        showProgress: false,
      };

    case "draft_delivered":
      return {
        title: "Draft delivered",
        description: "Your motion draft is ready for download.",
        showProgress: false,
      };

    case "generation_failed":
      return {
        title: "Generation issue",
        description:
          "We encountered an issue generating your motion. Our team has been notified and is working on it.",
        showProgress: false,
      };

    default:
      return {
        title: "Processing",
        description: "Your order is being processed.",
        showProgress: false,
      };
  }
}
