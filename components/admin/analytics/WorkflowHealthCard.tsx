'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Activity, Loader2, PauseCircle, AlertCircle, DollarSign } from 'lucide-react';

interface OrderWithPrice {
  total_price?: number | string | null;
}

interface WorkflowHealth {
  in_progress: number;
  in_hold: number;
  with_errors: number;
  weekly_revenue: number;
}

export function WorkflowHealthCard() {
  const [health, setHealth] = useState<WorkflowHealth | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchWorkflowHealth();
    const interval = setInterval(fetchWorkflowHealth, 30000);
    return () => clearInterval(interval);
  }, []);

  async function fetchWorkflowHealth() {
    try {
      const supabase = createClient();
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const [inProgress, holds, errors, revenue] = await Promise.all([
        supabase.from('orders').select('id', { count: 'exact', head: true })
          .in('status', ['generating', 'processing', 'pending_review', 'in_progress']),
        supabase.from('orders').select('id', { count: 'exact', head: true })
          .eq('hold_status', 'HOLD'),
        supabase.from('orders').select('id', { count: 'exact', head: true })
          .in('status', ['failed', 'error', 'generation_failed']),
        supabase.from('orders').select('total_price')
          .in('status', ['completed', 'draft_delivered'])
          .gte('updated_at', sevenDaysAgo.toISOString())
      ]);

      const revenueData = (revenue.data || []) as OrderWithPrice[];
      const weeklyRevenue = revenueData.reduce((sum: number, o: OrderWithPrice) => sum + (parseFloat(String(o.total_price)) || 0), 0);

      setHealth({
        in_progress: inProgress.count || 0,
        in_hold: holds.count || 0,
        with_errors: errors.count || 0,
        weekly_revenue: weeklyRevenue
      });
    } catch (err) {
      console.error('Error fetching workflow health:', err);
    } finally {
      setLoading(false);
    }
  }

  if (loading || !health) {
    return (
      <Card className="bg-white border border-gray-200 shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-gray-600" />
            Workflow Health
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse"><div className="h-24 bg-gray-100 rounded" /></div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-white border border-gray-200 shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Activity className="h-5 w-5 text-gray-600" />
          Workflow Health
          <span className="ml-auto text-xs text-gray-400 font-normal">Live</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4">
          <div className="p-3 rounded-lg bg-gray-50 border border-gray-200">
            <div className="flex items-center gap-2">
              <Loader2 className="h-5 w-5 text-gray-500 animate-spin" />
              <span className="text-2xl font-bold text-navy">{health.in_progress}</span>
            </div>
            <div className="text-sm text-gray-600 mt-1">In Progress</div>
          </div>
          <div className={`p-3 rounded-lg bg-gray-50 border ${health.in_hold > 0 ? 'border-l-4 border-l-amber-500 border-gray-200' : 'border-gray-200'}`}>
            <div className="flex items-center gap-2">
              <PauseCircle className="h-5 w-5 text-gray-500" />
              <span className="text-2xl font-bold text-navy">{health.in_hold}</span>
            </div>
            <div className="text-sm text-gray-600 mt-1">On HOLD</div>
          </div>
          <div className={`p-3 rounded-lg bg-gray-50 border ${health.with_errors > 0 ? 'border-l-4 border-l-red-500 border-gray-200' : 'border-gray-200'}`}>
            <div className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-gray-500" />
              <span className="text-2xl font-bold text-navy">{health.with_errors}</span>
            </div>
            <div className="text-sm text-gray-600 mt-1">With Errors</div>
          </div>
          <div className="p-3 rounded-lg bg-gray-50 border border-gray-200">
            <div className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-gray-500" />
              <span className="text-2xl font-bold text-navy">${health.weekly_revenue.toLocaleString()}</span>
            </div>
            <div className="text-sm text-gray-600 mt-1">Weekly Revenue</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
