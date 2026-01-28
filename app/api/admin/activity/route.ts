// app/api/admin/activity/route.ts
// Admin activity log API
// Task 62 | Version 1.0 — January 28, 2026

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * GET /api/admin/activity
 * List activity logs (admin only)
 *
 * Query params:
 * - limit: number (default 50, max 100)
 * - offset: number (default 0)
 * - action: filter by action type
 * - resource_type: filter by resource type
 * - user_id: filter by user
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
    const resourceType = searchParams.get('resource_type');
    const userId = searchParams.get('user_id');
    const from = searchParams.get('from');
    const to = searchParams.get('to');

    // Build query
    let query = supabase
      .from('activity_logs')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (action) {
      query = query.eq('action', action);
    }
    if (resourceType) {
      query = query.eq('resource_type', resourceType);
    }
    if (userId) {
      query = query.eq('user_id', userId);
    }
    if (from) {
      query = query.gte('created_at', from);
    }
    if (to) {
      query = query.lte('created_at', to);
    }

    const { data, error, count } = await query;

    if (error) {
      console.error('[API] Activity log query error:', error);
      return NextResponse.json({ error: 'Query failed' }, { status: 500 });
    }

    return NextResponse.json({
      logs: data,
      total: count,
      limit,
      offset,
    });
  } catch (error) {
    console.error('[API] Activity log error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
