'use client';

/**
 * Revision Analytics Card (Task 54)
 *
 * Shows revision loop metrics
 */

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { RefreshCw, TrendingDown, AlertTriangle } from 'lucide-react';

interface RevisionStats {
  totalRevisions: number;
  avgRevisionsPerOrder: number;
  ordersWithRevisions: number;
  ordersWithMultipleRevisions: number;
  revisionsByReason: Record<string, number>;
  revisionTrend: Array<{ week: string; count: number }>;
}

export function RevisionAnalyticsCard() {
  const [stats, setStats] = useState<RevisionStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchStats() {
      try {
        const response = await fetch('/api/admin/analytics/revisions');
        if (response.ok) {
          const data = await response.json();
          setStats(data);
        }
      } catch (err) {
        console.error('Failed to fetch revision stats:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchStats();
  }, []);

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <RefreshCw className="h-5 w-5" />
            Revision Analytics
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-3">
            <div className="h-16 bg-gray-200 rounded"></div>
            <div className="h-20 bg-gray-200 rounded"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!stats) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <RefreshCw className="h-5 w-5" />
            Revision Analytics
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-gray-500">No revision data available</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <RefreshCw className="h-5 w-5" />
          Revision Analytics
        </CardTitle>
        <CardDescription>Customer revision patterns</CardDescription>
      </CardHeader>
      <CardContent>
        {/* Summary Stats */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="text-center p-3 bg-gray-50 rounded-lg">
            <p className="text-2xl font-bold">{stats.totalRevisions}</p>
            <p className="text-sm text-gray-500">Total Revisions</p>
          </div>
          <div className="text-center p-3 bg-blue-50 rounded-lg">
            <p className="text-2xl font-bold text-blue-600">
              {stats.avgRevisionsPerOrder.toFixed(2)}
            </p>
            <p className="text-sm text-gray-500">Avg per Order</p>
          </div>
        </div>

        {/* Orders with Revisions */}
        <div className="space-y-2 mb-6">
          <div className="flex justify-between items-center p-2 bg-gray-50 rounded">
            <span className="text-sm">Orders with revisions</span>
            <span className="font-medium">{stats.ordersWithRevisions}</span>
          </div>
          <div className="flex justify-between items-center p-2 bg-yellow-50 rounded">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-yellow-500" />
              <span className="text-sm">Multiple revisions</span>
            </div>
            <span className="font-medium">{stats.ordersWithMultipleRevisions}</span>
          </div>
        </div>

        {/* Revision Reasons */}
        {Object.keys(stats.revisionsByReason).length > 0 && (
          <div className="mb-4">
            <p className="text-sm font-medium mb-2">By Reason</p>
            <div className="space-y-1">
              {Object.entries(stats.revisionsByReason)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5)
                .map(([reason, count]) => (
                  <div key={reason} className="flex justify-between text-sm">
                    <span className="text-gray-600 truncate capitalize">
                      {reason.replace(/_/g, ' ')}
                    </span>
                    <span className="font-medium">{count}</span>
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* Weekly Trend */}
        {stats.revisionTrend.length > 0 && (
          <div>
            <p className="text-sm font-medium mb-2 flex items-center gap-2">
              <TrendingDown className="h-4 w-4" />
              Weekly Trend
            </p>
            <div className="flex items-end justify-between h-16 gap-1">
              {stats.revisionTrend.map((week, index) => {
                const maxCount = Math.max(...stats.revisionTrend.map((w) => w.count));
                const height = maxCount > 0 ? (week.count / maxCount) * 100 : 0;
                return (
                  <div key={index} className="flex-1 flex flex-col items-center">
                    <div
                      className="w-full bg-purple-400 rounded-t"
                      style={{ height: `${height}%`, minHeight: '4px' }}
                      title={`${week.week}: ${week.count}`}
                    />
                    <span className="text-xs text-gray-500 mt-1">{week.week}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default RevisionAnalyticsCard;
