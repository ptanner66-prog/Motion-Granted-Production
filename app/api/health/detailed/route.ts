/**
 * Detailed Health Check API
 *
 * Comprehensive health check for all system components:
 * - Database connectivity
 * - Redis/cache status
 * - External services (Claude, Stripe, etc.)
 * - Circuit breaker states
 * - Queue health
 * - System metrics
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { redisHealthCheck, isRedisAvailable } from '@/lib/redis';
import { getAllCircuitsHealth } from '@/lib/circuit-breaker';
import { logger } from '@/lib/logger';

// ============================================================================
// TYPES
// ============================================================================

interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  version: string;
  uptime: number;
  checks: {
    database: ComponentHealth;
    redis: ComponentHealth;
    queue: ComponentHealth;
    circuits: ComponentHealth;
    storage: ComponentHealth;
  };
  metrics: SystemMetrics;
}

interface ComponentHealth {
  status: 'healthy' | 'degraded' | 'unhealthy';
  latencyMs?: number;
  message?: string;
  details?: Record<string, unknown>;
}

interface SystemMetrics {
  memoryUsage: {
    heapUsed: number;
    heapTotal: number;
    rss: number;
  };
  activeOrders: number;
  pendingWorkflows: number;
  queuedNotifications: number;
}

// ============================================================================
// HEALTH CHECK FUNCTIONS
// ============================================================================

async function checkDatabase(): Promise<ComponentHealth> {
  const start = Date.now();

  try {
    const supabase = await createClient();

    // Simple query to check connectivity
    const { error } = await supabase
      .from('orders')
      .select('id')
      .limit(1);

    if (error) {
      return {
        status: 'unhealthy',
        latencyMs: Date.now() - start,
        message: error.message,
      };
    }

    const latencyMs = Date.now() - start;

    return {
      status: latencyMs < 1000 ? 'healthy' : 'degraded',
      latencyMs,
      message: latencyMs < 1000 ? 'Database responding normally' : 'Database response slow',
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      latencyMs: Date.now() - start,
      message: error instanceof Error ? error.message : 'Database check failed',
    };
  }
}

async function checkRedis(): Promise<ComponentHealth> {
  if (!isRedisAvailable()) {
    return {
      status: 'degraded',
      message: 'Redis not configured - using in-memory fallback',
    };
  }

  const result = await redisHealthCheck();

  return {
    status: result.healthy ? 'healthy' : 'unhealthy',
    latencyMs: result.latencyMs,
    message: result.error || 'Redis responding normally',
  };
}

async function checkQueue(): Promise<ComponentHealth> {
  const start = Date.now();

  try {
    const supabase = await createClient();

    // Check notification queue
    const { count: pendingCount, error } = await supabase
      .from('notification_queue')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending');

    if (error) {
      return {
        status: 'degraded',
        latencyMs: Date.now() - start,
        message: 'Could not check queue status',
      };
    }

    // Check for stuck items (pending for > 1 hour)
    const { count: stuckCount } = await supabase
      .from('notification_queue')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending')
      .lt('created_at', new Date(Date.now() - 3600000).toISOString());

    return {
      status: (stuckCount || 0) > 10 ? 'degraded' : 'healthy',
      latencyMs: Date.now() - start,
      message: `${pendingCount || 0} pending, ${stuckCount || 0} stuck`,
      details: {
        pending: pendingCount || 0,
        stuck: stuckCount || 0,
      },
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      latencyMs: Date.now() - start,
      message: error instanceof Error ? error.message : 'Queue check failed',
    };
  }
}

async function checkCircuits(): Promise<ComponentHealth> {
  try {
    const health = await getAllCircuitsHealth();

    const openCircuits = health.circuits.filter(c => c.state === 'OPEN');
    const halfOpenCircuits = health.circuits.filter(c => c.state === 'HALF_OPEN');

    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    if (openCircuits.length > 0) {
      status = openCircuits.some(c => c.service === 'claude' || c.service === 'supabase')
        ? 'unhealthy'
        : 'degraded';
    } else if (halfOpenCircuits.length > 0) {
      status = 'degraded';
    }

    return {
      status,
      message: health.allHealthy
        ? 'All circuits closed'
        : `${openCircuits.length} open, ${halfOpenCircuits.length} half-open`,
      details: {
        circuits: health.circuits,
      },
    };
  } catch (error) {
    return {
      status: 'degraded',
      message: error instanceof Error ? error.message : 'Circuit check failed',
    };
  }
}

async function checkStorage(): Promise<ComponentHealth> {
  const start = Date.now();

  try {
    const supabase = await createClient();

    // Check if storage bucket is accessible
    const { data, error } = await supabase.storage.getBucket('order-documents');

    if (error) {
      return {
        status: 'degraded',
        latencyMs: Date.now() - start,
        message: 'Storage bucket not accessible',
      };
    }

    return {
      status: 'healthy',
      latencyMs: Date.now() - start,
      message: 'Storage accessible',
      details: {
        bucket: data?.name,
        public: data?.public,
      },
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      latencyMs: Date.now() - start,
      message: error instanceof Error ? error.message : 'Storage check failed',
    };
  }
}

async function getSystemMetrics(): Promise<SystemMetrics> {
  const supabase = await createClient();

  // Get counts in parallel
  const [activeOrders, pendingWorkflows, queuedNotifications] = await Promise.all([
    supabase
      .from('orders')
      .select('*', { count: 'exact', head: true })
      .not('status', 'in', '("completed","cancelled")'),
    supabase
      .from('order_workflows')
      .select('*', { count: 'exact', head: true })
      .in('status', ['pending', 'in_progress']),
    supabase
      .from('notification_queue')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending'),
  ]);

  return {
    memoryUsage: {
      heapUsed: process.memoryUsage().heapUsed,
      heapTotal: process.memoryUsage().heapTotal,
      rss: process.memoryUsage().rss,
    },
    activeOrders: activeOrders.count || 0,
    pendingWorkflows: pendingWorkflows.count || 0,
    queuedNotifications: queuedNotifications.count || 0,
  };
}

// ============================================================================
// ROUTE HANDLER
// ============================================================================

const startTime = Date.now();

export async function GET(request: Request) {
  // Require CRON_SECRET for access — this endpoint exposes internal system state
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const verbose = searchParams.get('verbose') === 'true';

  const requestLogger = logger.child({ action: 'health-check' });

  try {
    // Run all checks in parallel
    const [database, redis, queue, circuits, storage, metrics] = await Promise.all([
      checkDatabase(),
      checkRedis(),
      checkQueue(),
      checkCircuits(),
      checkStorage(),
      getSystemMetrics(),
    ]);

    // Determine overall status
    const checks = { database, redis, queue, circuits, storage };
    const statuses = Object.values(checks).map(c => c.status);

    let overallStatus: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    if (statuses.includes('unhealthy')) {
      overallStatus = 'unhealthy';
    } else if (statuses.includes('degraded')) {
      overallStatus = 'degraded';
    }

    const response: HealthStatus = {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '1.0.0',
      uptime: Math.floor((Date.now() - startTime) / 1000),
      checks,
      metrics,
    };

    // Log health check result
    if (overallStatus !== 'healthy') {
      requestLogger.warn('Health check returned non-healthy status', {
        status: overallStatus,
        unhealthy: Object.entries(checks)
          .filter(([_, v]) => v.status !== 'healthy')
          .map(([k]) => k),
      });
    }

    // Return appropriate status code
    const statusCode = overallStatus === 'healthy' ? 200 : overallStatus === 'degraded' ? 200 : 503;

    return NextResponse.json(
      verbose ? response : { status: response.status, timestamp: response.timestamp },
      { status: statusCode }
    );
  } catch (error) {
    requestLogger.error('Health check failed', error);

    return NextResponse.json(
      {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: 'Health check failed',
      },
      { status: 503 }
    );
  }
}

// ============================================================================
// LIVENESS PROBE (Kubernetes-style)
// ============================================================================

export async function HEAD() {
  // Simple liveness check - just return 200 if the server is running
  return new NextResponse(null, { status: 200 });
}
