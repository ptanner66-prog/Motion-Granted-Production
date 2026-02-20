// /app/api/admin/activity-log/route.ts
// Admin activity log API — consolidated to automation_logs
// VERSION: 2.0 — February 20, 2026 (A16 audit log consolidation)

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createLogger } from '@/lib/security/logger';

const log = createLogger('api-admin-activity-log');

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify admin
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profile?.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    // Parse query params
    const { searchParams } = new URL(request.url);
    const adminUserId = searchParams.get('adminUserId') || undefined;
    const action = searchParams.get('action') || undefined;
    const targetId = searchParams.get('targetId') || undefined;
    const startDate = searchParams.get('startDate') || undefined;
    const endDate = searchParams.get('endDate') || undefined;
    const limit = Math.min(100, parseInt(searchParams.get('limit') || '50'));
    const offset = parseInt(searchParams.get('offset') || '0');

    // Query automation_logs (consolidated from admin_activity_log)
    let query = supabase
      .from('automation_logs')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false });

    if (adminUserId) query = query.eq('triggered_by', adminUserId);
    if (action) query = query.eq('action_type', action);
    if (targetId) query = query.eq('order_id', targetId);
    if (startDate) query = query.gte('created_at', new Date(startDate).toISOString());
    if (endDate) query = query.lte('created_at', new Date(endDate).toISOString());

    query = query.range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) {
      log.error('Activity log query error', { error: error.message });
      return NextResponse.json({ entries: [], total: 0 });
    }

    return NextResponse.json({ entries: data || [], total: count || 0 });
  } catch (error) {
    log.error('Error fetching activity log', { error: error instanceof Error ? error.message : error });
    return NextResponse.json({ error: 'Failed to fetch activity log' }, { status: 500 });
  }
}
