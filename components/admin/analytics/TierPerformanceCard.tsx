'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart3, Clock, DollarSign, Star, CheckCircle } from 'lucide-react';

interface OrderWorkflow {
  generation_cost?: number | string | null;
  quality_score?: number | string | null;
  started_at?: string | null;
  completed_at?: string | null;
}

interface Order {
  id: string;
  motion_tier?: string | null;
  status: string;
  created_at: string;
  updated_at: string;
  order_workflows?: OrderWorkflow | OrderWorkflow[] | null;
}

interface TierMetrics {
  tier: string;
  tier_label: string;
  total_orders: number;
  avg_generation_time_minutes: number;
  avg_cost: number;
  avg_grade: number;
  completion_rate: number;
}

export function TierPerformanceCard() {
  const [metrics, setMetrics] = useState<TierMetrics[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchTierMetrics();
  }, []);

  async function fetchTierMetrics() {
    try {
      const supabase = createClient();
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const { data: orders, error: ordersError } = await supabase
        .from('orders')
        .select(`
          id, motion_tier, status, created_at, updated_at,
          order_workflows (generation_cost, quality_score, started_at, completed_at)
        `)
        .gte('created_at', thirtyDaysAgo.toISOString());

      if (ordersError) throw ordersError;

      // CORRECT TIER LABELS - DO NOT CHANGE
      const tierLabels: Record<string, string> = {
        'A': 'Procedural/Administrative',
        'B': 'Intermediate/Substantive',
        'C': 'Complex/Dispositive'
      };

      const tierStats: Record<string, {
        total: number; completed: number; totalTime: number;
        totalCost: number; totalGrade: number; gradeCount: number;
      }> = {
        'A': { total: 0, completed: 0, totalTime: 0, totalCost: 0, totalGrade: 0, gradeCount: 0 },
        'B': { total: 0, completed: 0, totalTime: 0, totalCost: 0, totalGrade: 0, gradeCount: 0 },
        'C': { total: 0, completed: 0, totalTime: 0, totalCost: 0, totalGrade: 0, gradeCount: 0 }
      };

      (orders as Order[] || []).forEach((order: Order) => {
        const tier = order.motion_tier || 'A';
        if (!tierStats[tier]) return;
        tierStats[tier].total++;

        if (order.status === 'completed' || order.status === 'draft_delivered') {
          tierStats[tier].completed++;
        }

        const workflow: OrderWorkflow | null | undefined = Array.isArray(order.order_workflows)
          ? order.order_workflows[0]
          : order.order_workflows;
        if (workflow) {
          if (workflow.generation_cost) tierStats[tier].totalCost += parseFloat(String(workflow.generation_cost));
          if (workflow.quality_score) {
            tierStats[tier].totalGrade += parseFloat(String(workflow.quality_score));
            tierStats[tier].gradeCount++;
          }
          if (workflow.started_at && workflow.completed_at) {
            const start = new Date(workflow.started_at).getTime();
            const end = new Date(workflow.completed_at).getTime();
            tierStats[tier].totalTime += (end - start) / 60000;
          }
        }
      });

      const metricsData: TierMetrics[] = ['A', 'B', 'C'].map(tier => ({
        tier,
        tier_label: tierLabels[tier],
        total_orders: tierStats[tier].total,
        avg_generation_time_minutes: tierStats[tier].completed > 0
          ? Math.round(tierStats[tier].totalTime / tierStats[tier].completed) : 0,
        avg_cost: tierStats[tier].completed > 0
          ? parseFloat((tierStats[tier].totalCost / tierStats[tier].completed).toFixed(2)) : 0,
        avg_grade: tierStats[tier].gradeCount > 0
          ? parseFloat((tierStats[tier].totalGrade / tierStats[tier].gradeCount).toFixed(2)) : 0,
        completion_rate: tierStats[tier].total > 0
          ? parseFloat(((tierStats[tier].completed / tierStats[tier].total) * 100).toFixed(1)) : 0
      }));

      setMetrics(metricsData);
    } catch (err) {
      console.error('Error fetching tier metrics:', err);
      setError('Failed to load tier performance data');
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <Card className="col-span-2">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-teal-500" />
            Tier Performance
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-4">
            {[1, 2, 3].map(i => <div key={i} className="h-16 bg-gray-100 rounded" />)}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="col-span-2">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-teal-500" />
            Tier Performance
          </CardTitle>
        </CardHeader>
        <CardContent><p className="text-red-500">{error}</p></CardContent>
      </Card>
    );
  }

  return (
    <Card className="col-span-2">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-teal-500" />
          Tier Performance (Last 30 Days)
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {metrics.map(tier => (
            <div key={tier.tier} className="border rounded-lg p-4 hover:border-teal-500/50 transition-colors">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <span className="text-lg font-semibold text-slate-900">Tier {tier.tier}</span>
                  <span className="text-sm text-gray-500 ml-2">{tier.tier_label}</span>
                </div>
                <span className="text-sm text-gray-400">{tier.total_orders} orders</span>
              </div>
              <div className="grid grid-cols-4 gap-4">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-blue-500" />
                  <div>
                    <div className="text-sm font-medium">{tier.avg_generation_time_minutes} min</div>
                    <div className="text-xs text-gray-500">Avg Time</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <DollarSign className="h-4 w-4 text-emerald-500" />
                  <div>
                    <div className="text-sm font-medium">${tier.avg_cost}</div>
                    <div className="text-xs text-gray-500">Avg Cost</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Star className="h-4 w-4 text-amber-500" />
                  <div>
                    <div className="text-sm font-medium">{(tier.avg_grade * 100).toFixed(0)}%</div>
                    <div className="text-xs text-gray-500">Avg Grade</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-teal-500" />
                  <div>
                    <div className="text-sm font-medium">{tier.completion_rate}%</div>
                    <div className="text-xs text-gray-500">Completion</div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
