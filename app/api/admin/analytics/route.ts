/**
 * Admin Analytics API
 *
 * Provides comprehensive analytics data for the admin dashboard:
 * - Order statistics
 * - Revenue metrics
 * - Workflow performance
 * - Citation verification stats
 * - User engagement
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { logger } from '@/lib/logger';

// ============================================================================
// TYPES
// ============================================================================

interface AnalyticsResponse {
  summary: {
    totalOrders: number;
    totalRevenue: number;
    activeWorkflows: number;
    pendingReview: number;
    avgTurnaroundDays: number;
    completionRate: number;
  };
  ordersByStatus: Record<string, number>;
  ordersByTier: Record<string, number>;
  revenueByMonth: Array<{ month: string; revenue: number; count: number }>;
  workflowMetrics: {
    avgDurationMinutes: number;
    avgRevisionLoops: number;
    avgJudgeGrade: number;
    passRate: number;
  };
  citationStats: {
    totalVerified: number;
    verificationRate: number;
    avgPerMotion: number;
    byStatus: Record<string, number>;
  };
  topMotionTypes: Array<{ type: string; count: number; revenue: number }>;
  dailyOrders: Array<{ date: string; count: number }>;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

async function getOrderSummary(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: orders, error } = await supabase
    .from('orders')
    .select('status, total_price, motion_tier, created_at, updated_at');

  if (error) throw error;

  type OrderRow = { status: string; total_price: number; motion_tier: string; created_at: string; updated_at: string };

  const totalOrders = orders?.length || 0;
  const totalRevenue = orders?.reduce((sum: number, o: OrderRow) => sum + (o.total_price || 0), 0) || 0;

  // Calculate completion rate - include draft_delivered and revision_delivered as "completed"
  const completed = orders?.filter((o: OrderRow) =>
    ['completed', 'draft_delivered', 'revision_delivered'].includes(o.status)
  ).length || 0;
  const total = orders?.filter((o: OrderRow) => !['cancelled', 'refunded'].includes(o.status)).length || 1;
  const completionRate = Math.round((completed / total) * 100);

  // Calculate average turnaround - include all "completed" states
  const completedOrders = orders?.filter((o: OrderRow) =>
    ['completed', 'draft_delivered', 'revision_delivered'].includes(o.status)
  ) || [];
  const avgTurnaroundDays = completedOrders.length > 0
    ? completedOrders.reduce((sum: number, o: OrderRow) => {
        const created = new Date(o.created_at);
        const updated = new Date(o.updated_at);
        return sum + (updated.getTime() - created.getTime()) / (1000 * 60 * 60 * 24);
      }, 0) / completedOrders.length
    : 0;

  // Orders by status
  const ordersByStatus: Record<string, number> = {};
  orders?.forEach((o: OrderRow) => {
    ordersByStatus[o.status] = (ordersByStatus[o.status] || 0) + 1;
  });

  // Orders by tier
  const ordersByTier: Record<string, number> = { A: 0, B: 0, C: 0, D: 0 };
  orders?.forEach((o: OrderRow) => {
    if (o.motion_tier) {
      ordersByTier[o.motion_tier] = (ordersByTier[o.motion_tier] || 0) + 1;
    }
  });

  return {
    totalOrders,
    totalRevenue,
    completionRate,
    avgTurnaroundDays: Math.round(avgTurnaroundDays * 10) / 10,
    ordersByStatus,
    ordersByTier,
  };
}

async function getWorkflowMetrics(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { count: activeCount } = await supabase
    .from('order_workflows')
    .select('*', { count: 'exact', head: true })
    .in('status', ['pending', 'in_progress']);

  // Count orders awaiting review - includes multiple states that indicate "needs review"
  const { count: pendingReviewCount } = await supabase
    .from('orders')
    .select('*', { count: 'exact', head: true })
    .in('status', ['pending_review', 'under_review', 'revision_requested']);

  // Get completed workflows for metrics
  const { data: completedWorkflows } = await supabase
    .from('order_workflows')
    .select('created_at, completed_at, revision_loop')
    .eq('status', 'completed')
    .not('completed_at', 'is', null);

  type WorkflowRow = { created_at: string; completed_at: string; revision_loop: number };

  const avgDurationMinutes = completedWorkflows && completedWorkflows.length > 0
    ? completedWorkflows.reduce((sum: number, w: WorkflowRow) => {
        const created = new Date(w.created_at);
        const completed = new Date(w.completed_at);
        return sum + (completed.getTime() - created.getTime()) / (1000 * 60);
      }, 0) / completedWorkflows.length
    : 0;

  const avgRevisionLoops = completedWorkflows && completedWorkflows.length > 0
    ? completedWorkflows.reduce((sum: number, w: WorkflowRow) => sum + (w.revision_loop || 0), 0) / completedWorkflows.length
    : 0;

  // Get judge simulation results
  const { data: judgeResults } = await supabase
    .from('judge_simulation_results')
    .select('numeric_grade, passes');

  type JudgeRow = { numeric_grade: number; passes: boolean };
  const gradeValues = judgeResults?.map((j: JudgeRow) => j.numeric_grade).filter(Boolean) || [];
  const avgJudgeGrade = gradeValues.length > 0
    ? gradeValues.reduce((a: number, b: number) => a + b, 0) / gradeValues.length
    : 0;

  const passCount = judgeResults?.filter((j: JudgeRow) => j.passes).length || 0;
  const passRate = judgeResults && judgeResults.length > 0
    ? Math.round((passCount / judgeResults.length) * 100)
    : 0;

  return {
    activeWorkflows: activeCount || 0,
    pendingReview: pendingReviewCount || 0,
    metrics: {
      avgDurationMinutes: Math.round(avgDurationMinutes),
      avgRevisionLoops: Math.round(avgRevisionLoops * 10) / 10,
      avgJudgeGrade: Math.round(avgJudgeGrade * 100) / 100,
      passRate,
    },
  };
}

async function getCitationStats(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: citations, error } = await supabase
    .from('citation_verifications')
    .select('verification_status, workflow_id');

  if (error) {
    return {
      totalVerified: 0,
      verificationRate: 0,
      avgPerMotion: 0,
      byStatus: {},
    };
  }

  type CitationRow = { verification_status: string; workflow_id: string };

  const totalCitations = citations?.length || 0;
  const verifiedCount = citations?.filter((c: CitationRow) => c.verification_status === 'VERIFIED').length || 0;

  // Count by status
  const byStatus: Record<string, number> = {};
  citations?.forEach((c: CitationRow) => {
    byStatus[c.verification_status] = (byStatus[c.verification_status] || 0) + 1;
  });

  // Get unique workflows
  const uniqueWorkflows = new Set(citations?.map((c: CitationRow) => c.workflow_id) || []);
  const avgPerMotion = uniqueWorkflows.size > 0
    ? Math.round((totalCitations / uniqueWorkflows.size) * 10) / 10
    : 0;

  return {
    totalVerified: verifiedCount,
    verificationRate: totalCitations > 0 ? Math.round((verifiedCount / totalCitations) * 100) : 0,
    avgPerMotion,
    byStatus,
  };
}

async function getRevenueByMonth(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: orders } = await supabase
    .from('orders')
    .select('created_at, total_price')
    .not('status', 'in', '("cancelled","refunded")')
    .gte('created_at', new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString())
    .order('created_at', { ascending: true });

  type RevenueRow = { created_at: string; total_price: number };
  const byMonth: Map<string, { revenue: number; count: number }> = new Map();

  orders?.forEach((o: RevenueRow) => {
    const date = new Date(o.created_at);
    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

    const existing = byMonth.get(monthKey) || { revenue: 0, count: 0 };
    byMonth.set(monthKey, {
      revenue: existing.revenue + (o.total_price || 0),
      count: existing.count + 1,
    });
  });

  return Array.from(byMonth.entries())
    .map(([month, data]) => ({ month, ...data }))
    .slice(-12); // Last 12 months
}

async function getTopMotionTypes(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: orders } = await supabase
    .from('orders')
    .select('motion_type, total_price')
    .not('status', 'in', '("cancelled","refunded")');

  type MotionTypeRow = { motion_type: string; total_price: number };
  const byType: Map<string, { count: number; revenue: number }> = new Map();

  orders?.forEach((o: MotionTypeRow) => {
    const existing = byType.get(o.motion_type) || { count: 0, revenue: 0 };
    byType.set(o.motion_type, {
      count: existing.count + 1,
      revenue: existing.revenue + (o.total_price || 0),
    });
  });

  return Array.from(byType.entries())
    .map(([type, data]) => ({ type, ...data }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
}

async function getDailyOrders(supabase: Awaited<ReturnType<typeof createClient>>) {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const { data: orders } = await supabase
    .from('orders')
    .select('created_at')
    .gte('created_at', thirtyDaysAgo.toISOString())
    .order('created_at', { ascending: true });

  const byDay: Map<string, number> = new Map();

  // Initialize all days
  for (let i = 0; i < 30; i++) {
    const date = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
    const dateKey = date.toISOString().split('T')[0];
    byDay.set(dateKey, 0);
  }

  orders?.forEach((o: { created_at: string }) => {
    const dateKey = o.created_at.split('T')[0];
    byDay.set(dateKey, (byDay.get(dateKey) || 0) + 1);
  });

  return Array.from(byDay.entries())
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

// ============================================================================
// ROUTE HANDLER
// ============================================================================

export async function GET(request: NextRequest) {
  const requestLogger = logger.child({ action: 'analytics' });

  try {
    const supabase = await createClient();

    // Verify admin
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profile?.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    // Get date range from query params
    const { searchParams } = new URL(request.url);
    const period = searchParams.get('period') || '30d';

    requestLogger.info('Fetching analytics', { period });

    // Fetch all analytics data in parallel
    const [
      orderSummary,
      workflowData,
      citationStats,
      revenueByMonth,
      topMotionTypes,
      dailyOrders,
    ] = await Promise.all([
      getOrderSummary(supabase),
      getWorkflowMetrics(supabase),
      getCitationStats(supabase),
      getRevenueByMonth(supabase),
      getTopMotionTypes(supabase),
      getDailyOrders(supabase),
    ]);

    const response: AnalyticsResponse = {
      summary: {
        totalOrders: orderSummary.totalOrders,
        totalRevenue: orderSummary.totalRevenue,
        activeWorkflows: workflowData.activeWorkflows,
        pendingReview: workflowData.pendingReview,
        avgTurnaroundDays: orderSummary.avgTurnaroundDays,
        completionRate: orderSummary.completionRate,
      },
      ordersByStatus: orderSummary.ordersByStatus,
      ordersByTier: orderSummary.ordersByTier,
      revenueByMonth,
      workflowMetrics: workflowData.metrics,
      citationStats,
      topMotionTypes,
      dailyOrders,
    };

    return NextResponse.json(response);
  } catch (error) {
    requestLogger.error('Analytics fetch failed', error);
    return NextResponse.json(
      { error: 'Failed to fetch analytics' },
      { status: 500 }
    );
  }
}
