/**
 * T-18: Admin workflow diagnostics route.
 * Queries phase_execution_logs for workflow debugging.
 *
 * GET /api/admin/workflow-diagnostics?orderId=xxx
 * GET /api/admin/workflow-diagnostics?status=FAILED&limit=50
 * GET /api/admin/workflow-diagnostics?phaseCode=VII&limit=100
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  // Auth check — must be admin (matches pattern from app/api/admin/analytics/route.ts)
  const userSupabase = await createClient();
  const { data: { user } } = await userSupabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getServiceSupabase();
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (!profile || profile.role !== 'admin') {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  // Parse query params
  const searchParams = request.nextUrl.searchParams;
  const orderId = searchParams.get('orderId');
  const status = searchParams.get('status');
  const phaseCode = searchParams.get('phaseCode');
  const limit = Math.min(parseInt(searchParams.get('limit') || '100', 10), 500);

  // Build query
  let query = supabase
    .from('phase_execution_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (orderId) query = query.eq('order_id', orderId);
  if (status) query = query.eq('status', status);
  if (phaseCode) query = query.eq('phase_code', phaseCode);

  const { data, error } = await query;

  if (error) {
    console.error('[workflow-diagnostics] Query failed:', error.message);
    return NextResponse.json({ error: 'Query failed' }, { status: 500 });
  }

  // Compute summary stats if orderId provided
  let summary = null;
  if (orderId && data && data.length > 0) {
    const completed = data.filter((d: Record<string, unknown>) => d.status === 'COMPLETED');
    const failed = data.filter((d: Record<string, unknown>) => d.status === 'FAILED');
    const totalDuration = completed.reduce((sum: number, d: Record<string, unknown>) => sum + ((d.duration_ms as number) || 0), 0);

    summary = {
      totalSteps: data.length,
      completed: completed.length,
      failed: failed.length,
      skipped: data.filter((d: Record<string, unknown>) => d.status === 'SKIPPED').length,
      totalDurationMs: totalDuration,
      avgStepDurationMs: completed.length > 0 ? Math.round(totalDuration / completed.length) : 0,
      slowestStep: completed.sort((a: Record<string, unknown>, b: Record<string, unknown>) =>
        ((b.duration_ms as number) || 0) - ((a.duration_ms as number) || 0)
      )[0]?.step_name,
      failures: failed.map((f: Record<string, unknown>) => ({
        step: f.step_name,
        phase: f.phase_code,
        error: f.error_message,
        at: f.created_at,
      })),
    };
  }

  return NextResponse.json({
    logs: data,
    summary,
    count: data?.length || 0,
  });
}
