import { createClient } from '@/lib/supabase/server';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Clock,
  Database,
  Loader2,
  Mail,
  RefreshCw,
  Server,
  Zap,
  XCircle,
  TrendingUp,
  BarChart3,
  PieChart,
  Timer,
} from 'lucide-react';
import { HealthQuickActions } from './health-quick-actions';
import { ErrorDetailsDialog } from './error-details-dialog';
import { OrderStatusChart } from './order-status-chart';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// Type definitions
interface AutomationLogWithOrder {
  id: string;
  order_id: string | null;
  action_type: string;
  action_details: Record<string, unknown>;
  error_message: string | null;
  created_at: string;
  orders?: {
    order_number: string;
    case_caption: string;
  } | null;
}

interface OrderStatusCount {
  status: string;
  count: number;
}

interface SystemHealth {
  inngestQueue: {
    pending: number;
    running: number;
    completed: number;
    failed: number;
    status: 'healthy' | 'degraded' | 'unhealthy';
  };
  claudeAPI: {
    status: 'healthy' | 'degraded' | 'unhealthy';
    recentTokens: number;
    lastUsed: string | null;
    errorRate: number;
  };
  notificationQueue: {
    pending: number;
    sent: number;
    failed: number;
    status: 'healthy' | 'degraded' | 'unhealthy';
  };
  database: {
    status: 'healthy' | 'degraded' | 'unhealthy';
    latencyMs: number;
    message: string;
  };
}

interface OrderMetrics {
  ordersToday: number;
  ordersThisWeek: number;
  avgGenerationTime: number;
  successRate: number;
  failureRate: number;
  byStatus: OrderStatusCount[];
}

// Helper function to get status variant
function getStatusVariant(status: 'healthy' | 'degraded' | 'unhealthy'): 'success' | 'warning' | 'destructive' {
  switch (status) {
    case 'healthy':
      return 'success';
    case 'degraded':
      return 'warning';
    case 'unhealthy':
      return 'destructive';
  }
}

// Helper function to get status icon
function StatusIcon({ status }: { status: 'healthy' | 'degraded' | 'unhealthy' }) {
  switch (status) {
    case 'healthy':
      return <CheckCircle2 className="h-4 w-4 text-emerald-600" />;
    case 'degraded':
      return <AlertTriangle className="h-4 w-4 text-amber-600" />;
    case 'unhealthy':
      return <XCircle className="h-4 w-4 text-red-600" />;
  }
}

export default async function HealthDashboardPage() {
  const supabase = await createClient();

  // Get current timestamps for queries
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const hourAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString();

  // Fetch all data in parallel
  const [
    // Automation logs for queue stats
    { data: recentLogs },
    { count: pendingTasks },
    { count: runningTasks },
    { count: completedTasksToday },
    { count: failedTasks },
    // Notification queue stats
    { count: pendingNotifications },
    { count: sentNotificationsToday },
    { count: failedNotifications },
    // Order metrics
    { count: ordersToday },
    { count: ordersThisWeek },
    { data: ordersByStatus },
    { data: completedOrders },
    { data: failedOrders },
    // Recent errors
    { data: recentErrors },
    // Claude API usage (from automation logs)
    { data: claudeUsageLogs },
    // Database health check
    dbHealthResult,
  ] = await Promise.all([
    // Recent automation logs
    supabase
      .from('automation_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100),

    // Pending tasks count
    supabase
      .from('automation_tasks')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending'),

    // Running tasks count
    supabase
      .from('automation_tasks')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'processing'),

    // Completed tasks today
    supabase
      .from('automation_tasks')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'completed')
      .gte('completed_at', todayStart),

    // Failed tasks
    supabase
      .from('automation_tasks')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'failed'),

    // Pending notifications
    supabase
      .from('notification_queue')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending'),

    // Sent notifications today
    supabase
      .from('notification_queue')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'sent')
      .gte('sent_at', todayStart),

    // Failed notifications
    supabase
      .from('notification_queue')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'failed'),

    // Orders created today
    supabase
      .from('orders')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', todayStart),

    // Orders this week
    supabase
      .from('orders')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', weekStart),

    // Orders by status
    supabase
      .from('orders')
      .select('status'),

    // Completed orders for success rate
    supabase
      .from('orders')
      .select('id, generation_started_at, generation_completed_at')
      .eq('status', 'draft_delivered')
      .gte('created_at', weekStart),

    // Failed orders
    supabase
      .from('orders')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'generation_failed')
      .gte('created_at', weekStart),

    // Recent errors from automation logs
    supabase
      .from('automation_logs')
      .select(`
        id,
        order_id,
        action_type,
        action_details,
        error_message,
        created_at,
        orders:order_id (
          order_number,
          case_caption
        )
      `)
      .or('action_type.ilike.%error%,action_type.ilike.%failed%,error_message.neq.null')
      .order('created_at', { ascending: false })
      .limit(10),

    // Claude API usage logs
    supabase
      .from('automation_logs')
      .select('action_details, created_at')
      .or('action_type.ilike.%claude%,action_type.ilike.%generation%')
      .gte('created_at', todayStart)
      .order('created_at', { ascending: false }),

    // Database health check (simple query with timing)
    (async () => {
      const start = Date.now();
      const { error } = await supabase.from('orders').select('id').limit(1);
      const latency = Date.now() - start;
      return {
        status: error ? 'unhealthy' : latency < 1000 ? 'healthy' : 'degraded',
        latencyMs: latency,
        message: error ? error.message : latency < 1000 ? 'Connected' : 'Slow response',
      };
    })(),
  ]);

  // Calculate order status distribution
  const statusCounts: Record<string, number> = {};
  ordersByStatus?.forEach((order: { status: string }) => {
    statusCounts[order.status] = (statusCounts[order.status] || 0) + 1;
  });
  const byStatus: OrderStatusCount[] = Object.entries(statusCounts).map(([status, count]) => ({
    status,
    count,
  }));

  // Calculate average generation time
  let avgGenerationTime = 0;
  if (completedOrders && completedOrders.length > 0) {
    const validTimes = completedOrders
      .filter((o: { generation_started_at: string | null; generation_completed_at: string | null }) =>
        o.generation_started_at && o.generation_completed_at)
      .map((o: { generation_started_at: string | null; generation_completed_at: string | null }) => {
        const start = new Date(o.generation_started_at!).getTime();
        const end = new Date(o.generation_completed_at!).getTime();
        return (end - start) / 1000; // seconds
      });

    if (validTimes.length > 0) {
      avgGenerationTime = validTimes.reduce((a: number, b: number) => a + b, 0) / validTimes.length;
    }
  }

  // Calculate success/failure rates
  const totalOrdersWeek = ordersThisWeek || 0;
  const completedCount = completedOrders?.length || 0;
  const failedCount = failedOrders || 0;
  const successRate = totalOrdersWeek > 0 ? (completedCount / totalOrdersWeek) * 100 : 100;
  const failureRate = totalOrdersWeek > 0 ? (failedCount / totalOrdersWeek) * 100 : 0;

  // Calculate Claude API stats
  let totalTokens = 0;
  let lastUsed: string | null = null;
  let claudeErrors = 0;

  claudeUsageLogs?.forEach((log: { action_details: Record<string, unknown>; created_at: string }) => {
    const details = log.action_details as { tokensUsed?: number; error?: string };
    if (details?.tokensUsed) {
      totalTokens += details.tokensUsed;
    }
    if (details?.error) {
      claudeErrors++;
    }
    if (!lastUsed && log.created_at) {
      lastUsed = log.created_at;
    }
  });

  const claudeErrorRate = claudeUsageLogs && claudeUsageLogs.length > 0
    ? (claudeErrors / claudeUsageLogs.length) * 100
    : 0;

  // Build system health object
  const systemHealth: SystemHealth = {
    inngestQueue: {
      pending: pendingTasks || 0,
      running: runningTasks || 0,
      completed: completedTasksToday || 0,
      failed: failedTasks || 0,
      status: (failedTasks || 0) > 10 ? 'unhealthy' : (pendingTasks || 0) > 50 ? 'degraded' : 'healthy',
    },
    claudeAPI: {
      status: claudeErrorRate > 20 ? 'unhealthy' : claudeErrorRate > 5 ? 'degraded' : 'healthy',
      recentTokens: totalTokens,
      lastUsed,
      errorRate: claudeErrorRate,
    },
    notificationQueue: {
      pending: pendingNotifications || 0,
      sent: sentNotificationsToday || 0,
      failed: failedNotifications || 0,
      status: (failedNotifications || 0) > 10 ? 'unhealthy' : (pendingNotifications || 0) > 100 ? 'degraded' : 'healthy',
    },
    database: dbHealthResult as SystemHealth['database'],
  };

  const orderMetrics: OrderMetrics = {
    ordersToday: ordersToday || 0,
    ordersThisWeek: ordersThisWeek || 0,
    avgGenerationTime: Math.round(avgGenerationTime),
    successRate: Math.round(successRate * 10) / 10,
    failureRate: Math.round(failureRate * 10) / 10,
    byStatus,
  };

  // Determine overall system status
  const statuses = [
    systemHealth.inngestQueue.status,
    systemHealth.claudeAPI.status,
    systemHealth.notificationQueue.status,
    systemHealth.database.status,
  ];
  const overallStatus: 'healthy' | 'degraded' | 'unhealthy' =
    statuses.includes('unhealthy') ? 'unhealthy' :
    statuses.includes('degraded') ? 'degraded' :
    'healthy';

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/admin">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-navy tracking-tight">
                System Health
              </h1>
              <Badge variant={getStatusVariant(overallStatus)}>
                <StatusIcon status={overallStatus} />
                <span className="ml-1 capitalize">{overallStatus}</span>
              </Badge>
            </div>
            <p className="text-gray-500 mt-1">
              Real-time system monitoring and diagnostics
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link href="/admin/health">
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Link>
        </Button>
      </div>

      {/* System Status Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Inngest Queue */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-gray-500">
                Task Queue
              </CardTitle>
              <Badge variant={getStatusVariant(systemHealth.inngestQueue.status)} className="text-xs">
                <StatusIcon status={systemHealth.inngestQueue.status} />
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-blue-100">
                <Zap className="h-5 w-5 text-blue-600" />
              </div>
              <div className="flex-1">
                <div className="text-2xl font-bold text-navy">
                  {systemHealth.inngestQueue.pending}
                </div>
                <div className="text-xs text-gray-500">pending jobs</div>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 text-center">
              <div className="p-2 rounded-lg bg-gray-50">
                <div className="text-sm font-semibold text-amber-600">
                  {systemHealth.inngestQueue.running}
                </div>
                <div className="text-xs text-gray-400">running</div>
              </div>
              <div className="p-2 rounded-lg bg-gray-50">
                <div className="text-sm font-semibold text-emerald-600">
                  {systemHealth.inngestQueue.completed}
                </div>
                <div className="text-xs text-gray-400">done</div>
              </div>
              <div className="p-2 rounded-lg bg-gray-50">
                <div className="text-sm font-semibold text-red-600">
                  {systemHealth.inngestQueue.failed}
                </div>
                <div className="text-xs text-gray-400">failed</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Claude API */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-gray-500">
                Claude API
              </CardTitle>
              <Badge variant={getStatusVariant(systemHealth.claudeAPI.status)} className="text-xs">
                <StatusIcon status={systemHealth.claudeAPI.status} />
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-purple-100">
                <Server className="h-5 w-5 text-purple-600" />
              </div>
              <div className="flex-1">
                <div className="text-2xl font-bold text-navy">
                  {systemHealth.claudeAPI.recentTokens.toLocaleString()}
                </div>
                <div className="text-xs text-gray-500">tokens today</div>
              </div>
            </div>
            <div className="mt-3 space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-gray-500">Error Rate</span>
                <span className={systemHealth.claudeAPI.errorRate > 5 ? 'text-red-600 font-medium' : 'text-gray-700'}>
                  {systemHealth.claudeAPI.errorRate.toFixed(1)}%
                </span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-gray-500">Last Used</span>
                <span className="text-gray-700">
                  {systemHealth.claudeAPI.lastUsed
                    ? new Date(systemHealth.claudeAPI.lastUsed).toLocaleTimeString()
                    : 'N/A'}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Notification Queue */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-gray-500">
                Notifications
              </CardTitle>
              <Badge variant={getStatusVariant(systemHealth.notificationQueue.status)} className="text-xs">
                <StatusIcon status={systemHealth.notificationQueue.status} />
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-teal/10">
                <Mail className="h-5 w-5 text-teal" />
              </div>
              <div className="flex-1">
                <div className="text-2xl font-bold text-navy">
                  {systemHealth.notificationQueue.pending}
                </div>
                <div className="text-xs text-gray-500">pending</div>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-center">
              <div className="p-2 rounded-lg bg-gray-50">
                <div className="text-sm font-semibold text-emerald-600">
                  {systemHealth.notificationQueue.sent}
                </div>
                <div className="text-xs text-gray-400">sent today</div>
              </div>
              <div className="p-2 rounded-lg bg-gray-50">
                <div className="text-sm font-semibold text-red-600">
                  {systemHealth.notificationQueue.failed}
                </div>
                <div className="text-xs text-gray-400">failed</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Database */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-gray-500">
                Database
              </CardTitle>
              <Badge variant={getStatusVariant(systemHealth.database.status)} className="text-xs">
                <StatusIcon status={systemHealth.database.status} />
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-emerald-100">
                <Database className="h-5 w-5 text-emerald-600" />
              </div>
              <div className="flex-1">
                <div className="text-2xl font-bold text-navy">
                  {systemHealth.database.latencyMs}ms
                </div>
                <div className="text-xs text-gray-500">latency</div>
              </div>
            </div>
            <div className="mt-3 p-2 rounded-lg bg-gray-50">
              <div className="flex items-center gap-2">
                <div className={`h-2 w-2 rounded-full ${
                  systemHealth.database.status === 'healthy' ? 'bg-emerald-500' :
                  systemHealth.database.status === 'degraded' ? 'bg-amber-500' : 'bg-red-500'
                }`} />
                <span className="text-xs text-gray-600">{systemHealth.database.message}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Order Pipeline Metrics */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Order Stats */}
        <Card className="border-0 shadow-sm lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-teal" />
              Order Metrics
            </CardTitle>
            <CardDescription>Orders processed this week</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 rounded-xl bg-blue-50">
                <div className="text-2xl font-bold text-blue-700">
                  {orderMetrics.ordersToday}
                </div>
                <div className="text-sm text-blue-600">Today</div>
              </div>
              <div className="p-4 rounded-xl bg-purple-50">
                <div className="text-2xl font-bold text-purple-700">
                  {orderMetrics.ordersThisWeek}
                </div>
                <div className="text-sm text-purple-600">This Week</div>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 rounded-lg bg-gray-50">
                <div className="flex items-center gap-2">
                  <Timer className="h-4 w-4 text-gray-400" />
                  <span className="text-sm text-gray-600">Avg Generation</span>
                </div>
                <span className="text-sm font-semibold text-navy">
                  {orderMetrics.avgGenerationTime > 60
                    ? `${Math.floor(orderMetrics.avgGenerationTime / 60)}m ${orderMetrics.avgGenerationTime % 60}s`
                    : `${orderMetrics.avgGenerationTime}s`}
                </span>
              </div>

              <div className="flex items-center justify-between p-3 rounded-lg bg-gray-50">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  <span className="text-sm text-gray-600">Success Rate</span>
                </div>
                <span className="text-sm font-semibold text-emerald-600">
                  {orderMetrics.successRate}%
                </span>
              </div>

              <div className="flex items-center justify-between p-3 rounded-lg bg-gray-50">
                <div className="flex items-center gap-2">
                  <XCircle className="h-4 w-4 text-red-500" />
                  <span className="text-sm text-gray-600">Failure Rate</span>
                </div>
                <span className="text-sm font-semibold text-red-600">
                  {orderMetrics.failureRate}%
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Order Status Chart */}
        <Card className="border-0 shadow-sm lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <PieChart className="h-5 w-5 text-teal" />
              Orders by Status
            </CardTitle>
            <CardDescription>Current distribution of order statuses</CardDescription>
          </CardHeader>
          <CardContent>
            <OrderStatusChart data={orderMetrics.byStatus} />
          </CardContent>
        </Card>
      </div>

      {/* Recent Errors and Quick Actions */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Recent Errors */}
        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Recent Errors
            </CardTitle>
            <CardDescription>Last 10 errors from automation logs</CardDescription>
          </CardHeader>
          <CardContent>
            {recentErrors && recentErrors.length > 0 ? (
              <div className="space-y-2">
                {recentErrors.map((errorLog: AutomationLogWithOrder) => (
                  <ErrorDetailsDialog key={errorLog.id} error={errorLog} />
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-gray-500">
                <CheckCircle2 className="h-12 w-12 text-emerald-300 mb-3" />
                <p className="font-medium">No recent errors</p>
                <p className="text-sm mt-1">System is running smoothly</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Activity className="h-5 w-5 text-teal" />
              Quick Actions
            </CardTitle>
            <CardDescription>Manual system controls and recovery options</CardDescription>
          </CardHeader>
          <CardContent>
            <HealthQuickActions
              pendingNotifications={systemHealth.notificationQueue.pending}
              stuckOrders={systemHealth.inngestQueue.failed}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
