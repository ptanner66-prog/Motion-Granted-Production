import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { runConflictCheck, clearConflicts, flagConflict } from '@/lib/automation';

/**
 * POST /api/automation/conflict-check
 * Run conflict check for an order
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient();

    // Verify admin authentication
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

    const body = await request.json();
    const { orderId, action, reason } = body;

    if (!orderId) {
      return NextResponse.json({ error: 'Order ID is required' }, { status: 400 });
    }

    // Handle different actions
    if (action === 'clear') {
      const result = await clearConflicts(orderId, user.id, reason || 'Manually cleared');
      return NextResponse.json(result);
    }

    if (action === 'flag') {
      const result = await flagConflict(orderId, user.id, reason || 'Manually flagged');
      return NextResponse.json(result);
    }

    // Default: run conflict check
    const result = await runConflictCheck(orderId, {
      useAI: body.useAI !== false,
    });

    if (!result.success) {
      return NextResponse.json(
        { error: result.error, code: result.code },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      data: result.data,
      approvalRequired: result.data?.recommendation !== 'clear',
    });
  } catch (error) {
    console.error('[API] Conflict check error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
