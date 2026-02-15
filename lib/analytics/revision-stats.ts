/**
 * Revision Analytics
 *
 * Returns revision loop metrics matching the RevisionAnalyticsCard interface.
 */

import { createClient } from '@/lib/supabase/server';

export interface RevisionStatsResponse {
  totalRevisions: number;
  avgRevisionsPerOrder: number;
  ordersWithRevisions: number;
  ordersWithMultipleRevisions: number;
  revisionsByReason: Record<string, number>;
  revisionTrend: Array<{ week: string; count: number }>;
}

type WorkflowRow = {
  id: string;
  order_id: string;
  revision_loop: number | null;
  status: string;
  created_at: string;
  completed_at: string | null;
};

export async function getRevisionStats(): Promise<RevisionStatsResponse> {
  const supabase = await createClient();

  // Get workflows with revision data
  const { data: workflows, error } = await supabase
    .from('order_workflows')
    .select('id, order_id, revision_loop, status, created_at, completed_at')
    .order('created_at', { ascending: false })
    .limit(1000);

  if (error || !workflows || workflows.length === 0) {
    return {
      totalRevisions: 0,
      avgRevisionsPerOrder: 0,
      ordersWithRevisions: 0,
      ordersWithMultipleRevisions: 0,
      revisionsByReason: {},
      revisionTrend: [],
    };
  }

  const rows = workflows as WorkflowRow[];

  // Aggregate by order - take the max revision_loop per order
  const orderRevisions = new Map<string, number>();
  rows.forEach((w: WorkflowRow) => {
    const current = orderRevisions.get(w.order_id) || 0;
    const loops = w.revision_loop || 0;
    if (loops > current) {
      orderRevisions.set(w.order_id, loops);
    }
  });

  let totalRevisions = 0;
  let ordersWithRevisions = 0;
  let ordersWithMultipleRevisions = 0;

  orderRevisions.forEach(loops => {
    if (loops > 0) {
      ordersWithRevisions++;
      totalRevisions += loops;
      if (loops > 1) {
        ordersWithMultipleRevisions++;
      }
    }
  });

  const avgRevisionsPerOrder = ordersWithRevisions > 0
    ? Math.round((totalRevisions / ordersWithRevisions) * 100) / 100
    : 0;

  // Get revision reasons from workflow_state revision_grades
  const revisionsByReason: Record<string, number> = {};
  const { data: revisionStates } = await supabase
    .from('workflow_state')
    .select('revision_grades')
    .not('revision_grades', 'is', null)
    .gt('revision_loop_count', 0)
    .limit(500);

  type RevisionStateRow = { revision_grades: unknown };
  (revisionStates as RevisionStateRow[] | null)?.forEach((state: RevisionStateRow) => {
    try {
      const grades = typeof state.revision_grades === 'string'
        ? JSON.parse(state.revision_grades)
        : state.revision_grades;

      if (Array.isArray(grades)) {
        grades.forEach((grade: { reason?: string; deficiencies?: string[] }) => {
          if (grade.reason) {
            revisionsByReason[grade.reason] = (revisionsByReason[grade.reason] || 0) + 1;
          }
          if (grade.deficiencies && Array.isArray(grade.deficiencies)) {
            grade.deficiencies.forEach((d: string) => {
              revisionsByReason[d] = (revisionsByReason[d] || 0) + 1;
            });
          }
        });
      }
    } catch {
      // Skip unparseable revision_grades
    }
  });

  // Build weekly revision trend (last 8 weeks)
  const revisionTrend: Array<{ week: string; count: number }> = [];
  const now = new Date();

  for (let i = 7; i >= 0; i--) {
    const weekStart = new Date(now);
    weekStart.setDate(weekStart.getDate() - (i * 7 + weekStart.getDay()));
    weekStart.setHours(0, 0, 0, 0);

    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 7);

    const weekCount = rows.filter((w: WorkflowRow) => {
      const created = new Date(w.created_at);
      return created >= weekStart && created < weekEnd && (w.revision_loop || 0) > 0;
    }).length;

    const weekLabel = `${weekStart.getMonth() + 1}/${weekStart.getDate()}`;
    revisionTrend.push({ week: weekLabel, count: weekCount });
  }

  // Also check orders that were revision_requested for additional revision data
  const { count: revisionRequestedCount } = await supabase
    .from('orders')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'revision_requested');

  // If we found revision_requested orders but no revision_loop data, count those
  if (ordersWithRevisions === 0 && (revisionRequestedCount || 0) > 0) {
    return {
      totalRevisions: revisionRequestedCount || 0,
      avgRevisionsPerOrder: 1,
      ordersWithRevisions: revisionRequestedCount || 0,
      ordersWithMultipleRevisions: 0,
      revisionsByReason,
      revisionTrend,
    };
  }

  return {
    totalRevisions,
    avgRevisionsPerOrder,
    ordersWithRevisions,
    ordersWithMultipleRevisions,
    revisionsByReason,
    revisionTrend,
  };
}
