import { NextResponse } from 'next/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { getRateLimitStatus } from '@/lib/rate-limit';

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
export async function GET() {
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

    // Get queue statistics using the stored function
    const { data: statsData, error: statsError } = await supabase.rpc('get_queue_stats');

    if (statsError) {
      console.error('Failed to get queue stats:', statsError);
      // Try to get basic stats directly
      const { count: queueCount } = await supabase
        .from('orders')
        .select('*', { count: 'exact', head: true })
        .in('status', ['submitted', 'under_review']);

      const { count: processingCount } = await supabase
        .from('orders')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'in_progress');

      const { count: failedCount } = await supabase
        .from('orders')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'generation_failed');

      return NextResponse.json({
        status: (failedCount || 0) > 5 ? 'degraded' : 'healthy',
        queue_depth: queueCount || 0,
        processing: processingCount || 0,
        oldest_pending_minutes: null,
        failed_last_24h: failedCount || 0,
        avg_generation_seconds: null,
        rate_limit: getRateLimitStatus(),
        timestamp: new Date().toISOString(),
        note: 'Basic stats (stored function unavailable)',
      });
    }

    const stats = statsData?.[0] || {
      queue_depth: 0,
      processing_count: 0,
      completed_today: 0,
      failed_count: 0,
      avg_generation_seconds: 0,
      oldest_pending_minutes: 0,
    };

    // Determine health status
    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';

    // Degraded if:
    // - More than 5 failed orders
    // - Oldest pending order is over 30 minutes old
    // - Queue depth is over 20
    if (stats.failed_count > 5) {
      status = 'degraded';
    } else if (stats.oldest_pending_minutes > 30) {
      status = 'degraded';
    } else if (stats.queue_depth > 20) {
      status = 'degraded';
    }

    // Unhealthy if:
    // - More than 10 failed orders
    // - Oldest pending order is over 60 minutes old
    if (stats.failed_count > 10 || stats.oldest_pending_minutes > 60) {
      status = 'unhealthy';
    }

    return NextResponse.json({
      status,
      queue_depth: stats.queue_depth || 0,
      processing: stats.processing_count || 0,
      completed_today: stats.completed_today || 0,
      oldest_pending_minutes: Math.round(stats.oldest_pending_minutes || 0),
      failed_last_24h: stats.failed_count || 0,
      avg_generation_seconds: Math.round(stats.avg_generation_seconds || 0),
      rate_limit: getRateLimitStatus(),
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    // Log detailed error internally but don't expose to client
    console.error('Health check error:', error);
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
