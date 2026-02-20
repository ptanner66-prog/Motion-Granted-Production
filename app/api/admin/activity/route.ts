// app/api/admin/activity/route.ts
// Admin activity log API — consolidated to automation_logs
// VERSION: 2.0 — February 20, 2026 (A16 audit log consolidation)

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createLogger } from '@/lib/security/logger';

const log = createLogger('api-admin-activity');

/**
 * GET /api/admin/activity
 * List activity logs from automation_logs (admin only)
 *
 * Query params:
 * - limit: number (default 50, max 100)
 * - offset: number (default 0)
 * - action: filter by action_type
 * - user_id: filter by triggered_by
 * - order_id: filter by order_id
 * - from: ISO date string
 * - to: ISO date string
 */
export async function GET(request: NextRequest) {
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
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Parse query params
    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100);
    const offset = parseInt(searchParams.get('offset') || '0');
    const action = searchParams.get('action');
    const userId = searchParams.get('user_id');
    const orderId = searchParams.get('order_id');
    const from = searchParams.get('from');
    const to = searchParams.get('to');

    // Build query against automation_logs (consolidated from activity_logs)
    let query = supabase
      .from('automation_logs')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (action) {
      query = query.eq('action_type', action);
    }
    if (userId) {
      query = query.eq('triggered_by', userId);
    }
    if (orderId) {
      query = query.eq('order_id', orderId);
    }
    if (from) {
      query = query.gte('created_at', from);
    }
    if (to) {
      query = query.lte('created_at', to);
    }

    const { data, error, count } = await query;

    if (error) {
      log.error('Activity log query error', { error });
      return NextResponse.json({ error: 'Query failed' }, { status: 500 });
    }

    return NextResponse.json({
      logs: data,
      total: count,
      limit,
      offset,
    });
  } catch (error) {
    log.error('Activity log error', { error: error instanceof Error ? error.message : error });
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
