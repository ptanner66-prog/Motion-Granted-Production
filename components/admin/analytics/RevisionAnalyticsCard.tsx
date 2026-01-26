'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { RotateCcw } from 'lucide-react';

interface Workflow {
  revision_loop_count?: number | null;
  created_at: string;
}

interface RevisionStats {
  loop_0: number;
  loop_1: number;
  loop_2: number;
  loop_3: number;
  total: number;
}

export function RevisionAnalyticsCard() {
  const [stats, setStats] = useState<RevisionStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchRevisionStats();
  }, []);

  async function fetchRevisionStats() {
    try {
      const supabase = createClient();
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const { data: workflows, error } = await supabase
        .from('order_workflows')
        .select('revision_loop_count, created_at')
        .gte('created_at', thirtyDaysAgo.toISOString());

      if (error) throw error;

      const allWorkflows = (workflows || []) as Workflow[];
      const counts = { loop_0: 0, loop_1: 0, loop_2: 0, loop_3: 0, total: allWorkflows.length };
      allWorkflows.forEach((w: Workflow) => {
        const loop = w.revision_loop_count || 0;
        if (loop === 0) counts.loop_0++;
        else if (loop === 1) counts.loop_1++;
        else if (loop === 2) counts.loop_2++;
        else counts.loop_3++;
      });

      setStats(counts);
    } catch (err) {
      console.error('Error fetching revision stats:', err);
    } finally {
      setLoading(false);
    }
  }

  if (loading || !stats) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <RotateCcw className="h-5 w-5 text-teal-500" />
            Revision Analytics
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse"><div className="h-32 bg-gray-100 rounded" /></div>
        </CardContent>
      </Card>
    );
  }

  const pct = (n: number) => stats.total > 0 ? ((n / stats.total) * 100).toFixed(1) : '0';

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <RotateCcw className="h-5 w-5 text-teal-500" />
          Revision Analytics (Last 30 Days)
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-center mb-4">
          <div className="text-3xl font-bold text-slate-900">{stats.total}</div>
          <div className="text-sm text-gray-500">Total Workflows</div>
        </div>

        <div className="space-y-3">
          {[
            { label: 'No Revisions (0 loops)', count: stats.loop_0, color: 'bg-emerald-500' },
            { label: '1 Revision Loop', count: stats.loop_1, color: 'bg-blue-500' },
            { label: '2 Revision Loops', count: stats.loop_2, color: 'bg-amber-500' },
            { label: '3 Revision Loops (Max)', count: stats.loop_3, color: 'bg-red-500' }
          ].map(item => (
            <div key={item.label}>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-gray-600">{item.label}</span>
                <span className="font-medium">{item.count} ({pct(item.count)}%)</span>
              </div>
              <div className="h-4 bg-gray-100 rounded-full overflow-hidden">
                <div className={`h-full ${item.color} rounded-full transition-all duration-500`}
                  style={{ width: `${pct(item.count)}%` }} />
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4 pt-4 border-t text-center">
          <span className="text-sm text-gray-500">
            First-time pass rate: <span className="font-semibold text-emerald-600">{pct(stats.loop_0)}%</span>
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
