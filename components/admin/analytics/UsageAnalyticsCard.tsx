'use client';

/**
 * Usage Analytics Dashboard (Task 75)
 *
 * Comprehensive analytics dashboard for admin users.
 *
 * Metrics:
 * - Orders by status (chart)
 * - Revenue by time period
 * - Average turnaround time
 * - AI usage metrics (tokens, calls)
 * - Error rates by component
 * - User growth metrics
 *
 * Source: Chunk 10, Task 75 - P2 Pre-Launch
 */

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  BarChart3,
  TrendingUp,
  Clock,
  Cpu,
  AlertTriangle,
  Users,
  DollarSign,
  Package,
  RefreshCw,
} from 'lucide-react';

// ============================================================================
// TYPES
// ============================================================================

interface OrdersByStatus {
  pending: number;
  processing: number;
  completed: number;
  cancelled: number;
  total: number;
}

interface RevenueMetrics {
  total: number;
  thisMonth: number;
  lastMonth: number;
  growth: number;
}

interface OrderRow {
  status: string;
  amount: number | null;
}

interface AmountRow {
  amount: number | null;
}

interface CompletedOrderRow {
  created_at: string;
  completed_at: string;
}

interface TurnaroundMetrics {
  average: number;
  median: number;
  fastest: number;
  slowest: number;
}

interface AIUsageMetrics {
  totalTokens: number;
  totalCalls: number;
  averageTokensPerCall: number;
  costEstimate: number;
}

interface ErrorMetrics {
  total: number;
  byComponent: Record<string, number>;
  rate: number;
}

interface UserMetrics {
  totalUsers: number;
  newThisMonth: number;
  activeUsers: number;
  growth: number;
}

interface AnalyticsData {
  orders: OrdersByStatus;
  revenue: RevenueMetrics;
  turnaround: TurnaroundMetrics;
  aiUsage: AIUsageMetrics;
  errors: ErrorMetrics;
  users: UserMetrics;
  lastUpdated: Date;
}

type TimeRange = '7d' | '30d' | '90d' | 'all';

// ============================================================================
// DATA FETCHING
// ============================================================================

async function fetchAnalytics(timeRange: TimeRange): Promise<AnalyticsData> {
  const supabase = createClient();
  const now = new Date();

  // Calculate date range
  let startDate: Date;
  switch (timeRange) {
    case '7d':
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    case '30d':
      startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      break;
    case '90d':
      startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      break;
    default:
      startDate = new Date('2020-01-01');
  }

  // Fetch orders by status
  const { data: ordersData } = await supabase
    .from('orders')
    .select('status, amount')
    .gte('created_at', startDate.toISOString());

  const orders: OrdersByStatus = {
    pending: 0,
    processing: 0,
    completed: 0,
    cancelled: 0,
    total: 0,
  };

  let totalRevenue = 0;
  (ordersData || []).forEach((order: OrderRow) => {
    orders.total++;
    if (order.status === 'pending' || order.status === 'awaiting_payment') {
      orders.pending++;
    } else if (order.status === 'processing' || order.status === 'in_progress') {
      orders.processing++;
    } else if (order.status === 'completed' || order.status === 'delivered') {
      orders.completed++;
      totalRevenue += order.amount || 0;
    } else if (order.status === 'cancelled' || order.status === 'refunded') {
      orders.cancelled++;
    }
  });

  // Calculate this month and last month revenue
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);

  const { data: thisMonthOrders } = await supabase
    .from('orders')
    .select('amount')
    .gte('created_at', thisMonthStart.toISOString())
    .in('status', ['completed', 'delivered']);

  const { data: lastMonthOrders } = await supabase
    .from('orders')
    .select('amount')
    .gte('created_at', lastMonthStart.toISOString())
    .lte('created_at', lastMonthEnd.toISOString())
    .in('status', ['completed', 'delivered']);

  const thisMonthRevenue = (thisMonthOrders || []).reduce((sum: number, o: AmountRow) => sum + (o.amount || 0), 0);
  const lastMonthRevenue = (lastMonthOrders || []).reduce((sum: number, o: AmountRow) => sum + (o.amount || 0), 0);
  const revenueGrowth = lastMonthRevenue > 0
    ? ((thisMonthRevenue - lastMonthRevenue) / lastMonthRevenue) * 100
    : 0;

  // Calculate turnaround time
  const { data: completedOrders } = await supabase
    .from('orders')
    .select('created_at, completed_at')
    .not('completed_at', 'is', null)
    .gte('created_at', startDate.toISOString());

  const turnaroundTimes = (completedOrders || [])
    .map((o: CompletedOrderRow) => {
      const created = new Date(o.created_at).getTime();
      const completed = new Date(o.completed_at).getTime();
      return (completed - created) / (1000 * 60 * 60); // Hours
    })
    .filter((t) => t > 0)
    .sort((a, b) => a - b);

  const turnaround: TurnaroundMetrics = {
    average: turnaroundTimes.length > 0
      ? turnaroundTimes.reduce((a, b) => a + b, 0) / turnaroundTimes.length
      : 0,
    median: turnaroundTimes.length > 0
      ? turnaroundTimes[Math.floor(turnaroundTimes.length / 2)]
      : 0,
    fastest: turnaroundTimes.length > 0 ? turnaroundTimes[0] : 0,
    slowest: turnaroundTimes.length > 0 ? turnaroundTimes[turnaroundTimes.length - 1] : 0,
  };

  // Fetch AI usage metrics
  const { data: aiUsageData } = await supabase
    .from('ai_usage_logs')
    .select('tokens_used, cost')
    .gte('created_at', startDate.toISOString());

  const aiUsage: AIUsageMetrics = {
    totalTokens: (aiUsageData || []).reduce((sum, u) => sum + (u.tokens_used || 0), 0),
    totalCalls: (aiUsageData || []).length,
    averageTokensPerCall: 0,
    costEstimate: (aiUsageData || []).reduce((sum, u) => sum + (u.cost || 0), 0),
  };
  if (aiUsage.totalCalls > 0) {
    aiUsage.averageTokensPerCall = aiUsage.totalTokens / aiUsage.totalCalls;
  }

  // Fetch error metrics
  const { data: errorData } = await supabase
    .from('webhook_logs')
    .select('source, status')
    .eq('status', 'error')
    .gte('created_at', startDate.toISOString());

  const { count: totalRequests } = await supabase
    .from('webhook_logs')
    .select('*', { count: 'exact', head: true })
    .gte('created_at', startDate.toISOString());

  const errorsByComponent: Record<string, number> = {};
  (errorData || []).forEach((e) => {
    const source = e.source || 'unknown';
    errorsByComponent[source] = (errorsByComponent[source] || 0) + 1;
  });

  const errors: ErrorMetrics = {
    total: (errorData || []).length,
    byComponent: errorsByComponent,
    rate: totalRequests && totalRequests > 0
      ? ((errorData || []).length / totalRequests) * 100
      : 0,
  };

  // Fetch user metrics
  const { count: totalUsers } = await supabase
    .from('profiles')
    .select('*', { count: 'exact', head: true });

  const { count: newUsersThisMonth } = await supabase
    .from('profiles')
    .select('*', { count: 'exact', head: true })
    .gte('created_at', thisMonthStart.toISOString());

  const { count: newUsersLastMonth } = await supabase
    .from('profiles')
    .select('*', { count: 'exact', head: true })
    .gte('created_at', lastMonthStart.toISOString())
    .lte('created_at', lastMonthEnd.toISOString());

  // Active users: users who placed an order in the time range
  const { data: activeUserOrders } = await supabase
    .from('orders')
    .select('user_id')
    .gte('created_at', startDate.toISOString());

  const activeUserIds = new Set((activeUserOrders || []).map((o) => o.user_id));

  const userGrowth = (newUsersLastMonth || 0) > 0
    ? (((newUsersThisMonth || 0) - (newUsersLastMonth || 0)) / (newUsersLastMonth || 1)) * 100
    : 0;

  return {
    orders,
    revenue: {
      total: totalRevenue,
      thisMonth: thisMonthRevenue,
      lastMonth: lastMonthRevenue,
      growth: revenueGrowth,
    },
    turnaround,
    aiUsage,
    errors,
    users: {
      totalUsers: totalUsers || 0,
      newThisMonth: newUsersThisMonth || 0,
      activeUsers: activeUserIds.size,
      growth: userGrowth,
    },
    lastUpdated: new Date(),
  };
}

// ============================================================================
// SUBCOMPONENTS
// ============================================================================

interface MetricCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ReactNode;
  trend?: number;
  trendLabel?: string;
}

function MetricCard({ title, value, subtitle, icon, trend, trendLabel }: MetricCardProps) {
  return (
    <div className="bg-white rounded-lg border shadow-sm p-4">
      <div className="flex items-center justify-between">
        <div className="p-2 bg-gray-100 rounded-lg">{icon}</div>
        {trend !== undefined && (
          <div className={`flex items-center text-sm ${trend >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            <TrendingUp className={`w-4 h-4 mr-1 ${trend < 0 ? 'rotate-180' : ''}`} />
            {Math.abs(trend).toFixed(1)}%
            {trendLabel && <span className="text-gray-500 ml-1">{trendLabel}</span>}
          </div>
        )}
      </div>
      <div className="mt-3">
        <p className="text-2xl font-bold text-gray-900">{value}</p>
        <p className="text-sm text-gray-600">{title}</p>
        {subtitle && <p className="text-xs text-gray-500 mt-1">{subtitle}</p>}
      </div>
    </div>
  );
}

interface StatusBarProps {
  orders: OrdersByStatus;
}

function StatusBar({ orders }: StatusBarProps) {
  if (orders.total === 0) return null;

  const segments = [
    { key: 'pending', color: 'bg-yellow-400', label: 'Pending' },
    { key: 'processing', color: 'bg-blue-400', label: 'Processing' },
    { key: 'completed', color: 'bg-green-400', label: 'Completed' },
    { key: 'cancelled', color: 'bg-red-400', label: 'Cancelled' },
  ];

  return (
    <div className="mt-4">
      <div className="flex h-3 rounded-full overflow-hidden bg-gray-200">
        {segments.map((seg) => {
          const count = orders[seg.key as keyof OrdersByStatus] as number;
          const percentage = (count / orders.total) * 100;
          if (percentage === 0) return null;
          return (
            <div
              key={seg.key}
              className={`${seg.color}`}
              style={{ width: `${percentage}%` }}
              title={`${seg.label}: ${count} (${percentage.toFixed(1)}%)`}
            />
          );
        })}
      </div>
      <div className="flex justify-between mt-2 text-xs text-gray-600">
        {segments.map((seg) => (
          <div key={seg.key} className="flex items-center gap-1">
            <div className={`w-2 h-2 rounded-full ${seg.color}`} />
            <span>{seg.label}: {orders[seg.key as keyof OrdersByStatus]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function UsageAnalyticsCard() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState<TimeRange>('30d');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const analytics = await fetchAnalytics(timeRange);
      setData(analytics);
    } catch (error) {
      console.error('[Analytics] Failed to fetch:', error);
    } finally {
      setLoading(false);
    }
  }, [timeRange]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount / 100);
  };

  const formatNumber = (num: number) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toFixed(0);
  };

  const formatHours = (hours: number) => {
    if (hours < 1) return `${(hours * 60).toFixed(0)}m`;
    if (hours < 24) return `${hours.toFixed(1)}h`;
    return `${(hours / 24).toFixed(1)}d`;
  };

  if (loading && !data) {
    return (
      <div className="bg-white rounded-lg border shadow-sm p-8">
        <div className="flex items-center justify-center">
          <RefreshCw className="w-6 h-6 animate-spin text-gray-400" />
          <span className="ml-2 text-gray-500">Loading analytics...</span>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="bg-white rounded-lg border shadow-sm p-8 text-center">
        <AlertTriangle className="w-8 h-8 text-yellow-500 mx-auto mb-2" />
        <p className="text-gray-600">Failed to load analytics data</p>
        <button
          onClick={loadData}
          className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Usage Analytics</h2>
          <p className="text-sm text-gray-500">
            Last updated: {data.lastUpdated.toLocaleTimeString()}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={timeRange}
            onChange={(e) => setTimeRange(e.target.value as TimeRange)}
            className="px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
            <option value="90d">Last 90 days</option>
            <option value="all">All time</option>
          </select>
          <button
            onClick={loadData}
            disabled={loading}
            className="p-2 border rounded-md hover:bg-gray-50 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Order Metrics */}
      <div className="bg-white rounded-lg border shadow-sm p-4">
        <h3 className="font-semibold text-gray-900 flex items-center gap-2 mb-4">
          <Package className="w-5 h-5" />
          Orders Overview
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center p-3 bg-gray-50 rounded-lg">
            <p className="text-2xl font-bold text-gray-900">{data.orders.total}</p>
            <p className="text-sm text-gray-600">Total Orders</p>
          </div>
          <div className="text-center p-3 bg-yellow-50 rounded-lg">
            <p className="text-2xl font-bold text-yellow-600">{data.orders.pending}</p>
            <p className="text-sm text-gray-600">Pending</p>
          </div>
          <div className="text-center p-3 bg-blue-50 rounded-lg">
            <p className="text-2xl font-bold text-blue-600">{data.orders.processing}</p>
            <p className="text-sm text-gray-600">Processing</p>
          </div>
          <div className="text-center p-3 bg-green-50 rounded-lg">
            <p className="text-2xl font-bold text-green-600">{data.orders.completed}</p>
            <p className="text-sm text-gray-600">Completed</p>
          </div>
        </div>
        <StatusBar orders={data.orders} />
      </div>

      {/* Key Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="Total Revenue"
          value={formatCurrency(data.revenue.total)}
          subtitle={`This month: ${formatCurrency(data.revenue.thisMonth)}`}
          icon={<DollarSign className="w-5 h-5 text-green-600" />}
          trend={data.revenue.growth}
          trendLabel="MoM"
        />
        <MetricCard
          title="Avg Turnaround"
          value={formatHours(data.turnaround.average)}
          subtitle={`Median: ${formatHours(data.turnaround.median)}`}
          icon={<Clock className="w-5 h-5 text-blue-600" />}
        />
        <MetricCard
          title="AI Tokens Used"
          value={formatNumber(data.aiUsage.totalTokens)}
          subtitle={`${data.aiUsage.totalCalls} calls | Est. ${formatCurrency(data.aiUsage.costEstimate * 100)}`}
          icon={<Cpu className="w-5 h-5 text-purple-600" />}
        />
        <MetricCard
          title="Total Users"
          value={formatNumber(data.users.totalUsers)}
          subtitle={`${data.users.newThisMonth} new this month | ${data.users.activeUsers} active`}
          icon={<Users className="w-5 h-5 text-orange-600" />}
          trend={data.users.growth}
          trendLabel="MoM"
        />
      </div>

      {/* Error Metrics */}
      {data.errors.total > 0 && (
        <div className="bg-white rounded-lg border shadow-sm p-4">
          <h3 className="font-semibold text-gray-900 flex items-center gap-2 mb-4">
            <AlertTriangle className="w-5 h-5 text-red-500" />
            Error Summary
            <span className="text-sm font-normal text-gray-500">
              ({data.errors.rate.toFixed(2)}% error rate)
            </span>
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Object.entries(data.errors.byComponent).map(([component, count]) => (
              <div key={component} className="text-center p-3 bg-red-50 rounded-lg">
                <p className="text-xl font-bold text-red-600">{count}</p>
                <p className="text-sm text-gray-600 capitalize">{component}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Performance Insights */}
      <div className="bg-white rounded-lg border shadow-sm p-4">
        <h3 className="font-semibold text-gray-900 flex items-center gap-2 mb-4">
          <BarChart3 className="w-5 h-5" />
          Performance Insights
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 bg-gray-50 rounded-lg">
            <p className="text-sm text-gray-600">Fastest Turnaround</p>
            <p className="text-xl font-bold text-green-600">
              {formatHours(data.turnaround.fastest)}
            </p>
          </div>
          <div className="p-4 bg-gray-50 rounded-lg">
            <p className="text-sm text-gray-600">Slowest Turnaround</p>
            <p className="text-xl font-bold text-red-600">
              {formatHours(data.turnaround.slowest)}
            </p>
          </div>
          <div className="p-4 bg-gray-50 rounded-lg">
            <p className="text-sm text-gray-600">Avg Tokens per Call</p>
            <p className="text-xl font-bold text-purple-600">
              {formatNumber(data.aiUsage.averageTokensPerCall)}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default UsageAnalyticsCard;
