import { NextResponse } from 'next/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { getRateLimitStatus } from '@/lib/security/rate-limiter';
import { getQueueStats } from '@/lib/queue-status';
import { createLogger } from '@/lib/security/logger';

const log = createLogger('health-queue');

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * GET /api/health/queue
 *
 * Health monitoring endpoint for the generation queue.
 * Returns real-time metrics for uptime monitoring (Vercel, UptimeRobot, etc.)
 *
 * Response:
 * - status: "healthy" | "degraded" | "unhealthy"
 * - queue_depth: Number of orders waiting in queue
 * - processing: Number of orders currently being processed
 * - oldest_pending_minutes: Minutes since oldest pending order was created
 * - failed_last_24h: Number of failed generations in last 24 hours
 * - avg_generation_seconds: Average generation time over last 7 days
 * - rate_limit: Current rate limit status
 */
export async function GET(request: Request) {
  // Require CRON_SECRET for access — this endpoint exposes queue metrics
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    // Check Supabase configuration
    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json(
        {
          status: 'unhealthy',
          error: 'Database not configured',
          timestamp: new Date().toISOString(),
        },
        { status: 503 }
      );
    }

    const supabase = createSupabaseClient(supabaseUrl, supabaseServiceKey);

    // Get queue statistics via direct queries (does not rely on stored function)
    const stats = await getQueueStats(supabase);

    // Map null (query error) to 0 for the health endpoint — monitoring tools expect numbers
    const queueDepth = stats.queue_depth ?? 0;
    const failedCount = stats.failed_count ?? 0;
    const oldestPendingMinutes = stats.oldest_pending_minutes ?? 0;

    // Determine health status
    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';

    // Flag as degraded if any stat query failed
    const hasQueryErrors = Object.values(stats).some((v) => v === null);
    if (hasQueryErrors) {
      status = 'degraded';
    }

    // Degraded if:
    // - More than 5 failed orders
    // - Oldest pending order is over 30 minutes old
    // - Queue depth is over 20
    if (failedCount > 5 || oldestPendingMinutes > 30 || queueDepth > 20) {
      status = 'degraded';
    }

    // Unhealthy if:
    // - More than 10 failed orders
    // - Oldest pending order is over 60 minutes old
    if (failedCount > 10 || oldestPendingMinutes > 60) {
      status = 'unhealthy';
    }

    return NextResponse.json({
      status,
      queue_depth: queueDepth,
      processing: stats.processing_count ?? 0,
      completed_today: stats.completed_today ?? 0,
      oldest_pending_minutes: Math.round(oldestPendingMinutes),
      failed_last_24h: failedCount,
      avg_generation_seconds: Math.round(stats.avg_generation_seconds ?? 0),
      rate_limit: getRateLimitStatus(),
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    // Log detailed error internally but don't expose to client
    log.error('Health check error', { error: error instanceof Error ? error.message : error });
    return NextResponse.json(
      {
        status: 'unhealthy',
        error: 'Service unavailable',
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
