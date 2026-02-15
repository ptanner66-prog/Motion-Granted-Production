'use client';

/**
 * Cost Tracking Dashboard Card (Task 53)
 *
 * Displays AI costs per order and aggregate metrics:
 * - Total API cost (Anthropic + OpenAI)
 * - Cost per order (average)
 * - Cost by phase breakdown
 * - Cost by tier (A/B/C)
 * - Monthly trend chart
 * - Top 10 most expensive orders
 *
 * Source: Chunk 8, Task 53 - Code Mode Spec Section 15
 */

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { DollarSign, TrendingUp, BarChart3, Cpu } from 'lucide-react';

// ============================================================================
// TYPES
// ============================================================================

interface CostMetrics {
  totalCostLast30Days: number;
  averageCostPerOrder: number;
  costByPhase: Record<string, number>;
  costByTier: Record<'A' | 'B' | 'C' | 'D', number>;
  costByProvider: {
    anthropic: number;
    openai: number;
    courtlistener: number;
    pacer: number;
  };
  monthlyTrend: Array<{ month: string; cost: number }>;
  topExpensiveOrders: Array<{
    orderId: string;
    orderNumber: string;
    cost: number;
    motionType: string;
  }>;
  totalOrders: number;
}

// ============================================================================
// COMPONENT
// ============================================================================

export function CostTrackingCard() {
  const [metrics, setMetrics] = useState<CostMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchMetrics() {
      try {
        const response = await fetch('/api/admin/analytics/costs');
        if (!response.ok) {
          throw new Error('Failed to fetch cost metrics');
        }
        const data = await response.json();
        setMetrics(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    }

    fetchMetrics();
  }, []);

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5" />
            Cost Tracking
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-4">
            <div className="h-8 bg-gray-200 rounded w-1/2"></div>
            <div className="h-20 bg-gray-200 rounded"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error || !metrics) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5" />
            Cost Tracking
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-red-500">Error loading cost metrics: {error}</p>
        </CardContent>
      </Card>
    );
  }

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 4,
    }).format(value);
  };

  return (
    <Card className="col-span-2">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <DollarSign className="h-5 w-5" />
          AI Cost Tracking
        </CardTitle>
        <CardDescription>API costs by provider, phase, and tier</CardDescription>
      </CardHeader>
      <CardContent>
        {/* Summary Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-blue-50 p-4 rounded-lg">
            <p className="text-sm text-blue-600 font-medium">Last 30 Days</p>
            <p className="text-2xl font-bold text-blue-900">
              {formatCurrency(metrics.totalCostLast30Days)}
            </p>
          </div>
          <div className="bg-green-50 p-4 rounded-lg">
            <p className="text-sm text-green-600 font-medium">Avg per Order</p>
            <p className="text-2xl font-bold text-green-900">
              {formatCurrency(metrics.averageCostPerOrder)}
            </p>
          </div>
          <div className="bg-purple-50 p-4 rounded-lg">
            <p className="text-sm text-purple-600 font-medium">Total Orders</p>
            <p className="text-2xl font-bold text-purple-900">{metrics.totalOrders}</p>
          </div>
          <div className="bg-orange-50 p-4 rounded-lg">
            <p className="text-sm text-orange-600 font-medium">Anthropic %</p>
            <p className="text-2xl font-bold text-orange-900">
              {metrics.totalCostLast30Days > 0
                ? Math.round((metrics.costByProvider.anthropic / metrics.totalCostLast30Days) * 100)
                : 0}%
            </p>
          </div>
        </div>

        {/* Cost by Provider */}
        <div className="mb-6">
          <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <Cpu className="h-4 w-4" />
            Cost by Provider
          </h4>
          <div className="space-y-2">
            {Object.entries(metrics.costByProvider).map(([provider, cost]) => (
              <div key={provider} className="flex items-center justify-between">
                <span className="text-sm capitalize">{provider}</span>
                <div className="flex items-center gap-2">
                  <div className="w-32 h-2 bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-500 rounded-full"
                      style={{
                        width: `${metrics.totalCostLast30Days > 0
                          ? (cost / metrics.totalCostLast30Days) * 100
                          : 0}%`,
                      }}
                    />
                  </div>
                  <span className="text-sm font-medium w-20 text-right">
                    {formatCurrency(cost)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Cost by Tier */}
        <div className="mb-6">
          <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            Cost by Tier
          </h4>
          <div className="grid grid-cols-3 gap-4">
            {(['A', 'B', 'C'] as const).map((tier) => (
              <div key={tier} className="text-center p-3 bg-gray-50 rounded-lg">
                <p className="text-lg font-bold">Tier {tier}</p>
                <p className="text-sm text-gray-600">
                  {formatCurrency(metrics.costByTier[tier] || 0)}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Cost by Phase */}
        <div className="mb-6">
          <h4 className="text-sm font-semibold mb-3">Cost by Phase</h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {Object.entries(metrics.costByPhase)
              .sort((a, b) => b[1] - a[1])
              .slice(0, 8)
              .map(([phase, cost]) => (
                <div key={phase} className="text-center p-2 bg-gray-50 rounded">
                  <p className="text-xs text-gray-500">Phase {phase}</p>
                  <p className="text-sm font-medium">{formatCurrency(cost)}</p>
                </div>
              ))}
          </div>
        </div>

        {/* Monthly Trend */}
        <div className="mb-6">
          <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            Monthly Trend
          </h4>
          <div className="flex items-end justify-between h-24 gap-1">
            {metrics.monthlyTrend.map((month, index) => {
              const maxCost = Math.max(...metrics.monthlyTrend.map((m) => m.cost));
              const height = maxCost > 0 ? (month.cost / maxCost) * 100 : 0;
              return (
                <div key={index} className="flex-1 flex flex-col items-center">
                  <div
                    className="w-full bg-blue-500 rounded-t"
                    style={{ height: `${height}%`, minHeight: '4px' }}
                    title={`${month.month}: ${formatCurrency(month.cost)}`}
                  />
                  <span className="text-xs text-gray-500 mt-1">{month.month}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Top Expensive Orders */}
        <div>
          <h4 className="text-sm font-semibold mb-3">Top 10 Most Expensive Orders</h4>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {metrics.topExpensiveOrders.map((order, index) => (
              <div
                key={order.orderId}
                className="flex items-center justify-between p-2 bg-gray-50 rounded text-sm"
              >
                <div className="flex items-center gap-2">
                  <span className="text-gray-400 w-5">{index + 1}.</span>
                  <span className="font-medium">{order.orderNumber}</span>
                  <span className="text-gray-500 text-xs">{order.motionType}</span>
                </div>
                <span className="font-semibold">{formatCurrency(order.cost)}</span>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default CostTrackingCard;
