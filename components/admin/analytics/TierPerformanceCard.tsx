'use client';

/**
 * Tier Performance Analytics Card (Task 54)
 *
 * Shows performance metrics by service tier (A/B/C)
 */

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Layers } from 'lucide-react';

interface TierMetrics {
  tier: 'A' | 'B' | 'C';
  orderCount: number;
  avgCompletionTime: number; // hours
  avgRevisions: number;
  revenue: number;
  satisfactionRate: number; // percentage
}

export function TierPerformanceCard() {
  const [metrics, setMetrics] = useState<TierMetrics[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchMetrics() {
      try {
        const response = await fetch('/api/admin/analytics/tiers');
        if (response.ok) {
          const data = await response.json();
          setMetrics(data.tiers || []);
        }
      } catch (err) {
        console.error('Failed to fetch tier metrics:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchMetrics();
  }, []);

  const tierColors = {
    A: 'bg-amber-100 text-amber-800 border-amber-200',
    B: 'bg-blue-100 text-blue-800 border-blue-200',
    C: 'bg-purple-100 text-purple-800 border-purple-200',
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Layers className="h-5 w-5" />
            Tier Performance
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-16 bg-gray-200 rounded"></div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Layers className="h-5 w-5" />
          Tier Performance
        </CardTitle>
        <CardDescription>Order metrics by service tier</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {(['A', 'B', 'C'] as const).map((tier) => {
            const tierData = metrics.find((m) => m.tier === tier) || {
              tier,
              orderCount: 0,
              avgCompletionTime: 0,
              avgRevisions: 0,
              revenue: 0,
              satisfactionRate: 0,
            };

            return (
              <div
                key={tier}
                className={`p-4 rounded-lg border ${tierColors[tier]}`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="font-bold text-lg">Tier {tier}</span>
                  <span className="text-sm">{tierData.orderCount} orders</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <span className="opacity-70">Avg Time:</span>{' '}
                    <span className="font-medium">{tierData.avgCompletionTime.toFixed(1)}h</span>
                  </div>
                  <div>
                    <span className="opacity-70">Revisions:</span>{' '}
                    <span className="font-medium">{tierData.avgRevisions.toFixed(1)}</span>
                  </div>
                  <div>
                    <span className="opacity-70">Revenue:</span>{' '}
                    <span className="font-medium">${tierData.revenue.toLocaleString()}</span>
                  </div>
                  <div>
                    <span className="opacity-70">Satisfaction:</span>{' '}
                    <span className="font-medium">{tierData.satisfactionRate}%</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

export default TierPerformanceCard;
