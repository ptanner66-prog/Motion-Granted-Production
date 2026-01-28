// /app/api/admin/activity-log/route.ts
// Admin activity log API
// VERSION: 1.0 — January 28, 2026

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getAdminActivityLog, type AdminAction, type TargetType } from '@/lib/services/admin-activity-log';

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
    const action = searchParams.get('action') as AdminAction | undefined;
    const targetType = searchParams.get('targetType') as TargetType | undefined;
    const targetId = searchParams.get('targetId') || undefined;
    const startDate = searchParams.get('startDate') ? new Date(searchParams.get('startDate')!) : undefined;
    const endDate = searchParams.get('endDate') ? new Date(searchParams.get('endDate')!) : undefined;
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');

    const result = await getAdminActivityLog({
      adminUserId,
      action,
      targetType,
      targetId,
      startDate,
      endDate,
      limit,
      offset,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('[AdminActivityLog] Error:', error);
    return NextResponse.json({ error: 'Failed to fetch activity log' }, { status: 500 });
  }
}
