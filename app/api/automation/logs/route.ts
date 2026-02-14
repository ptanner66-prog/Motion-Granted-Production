import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { AutomationActionType } from '@/types/automation';
import { createLogger } from '@/lib/security/logger';

const log = createLogger('api-automation-logs');

/**
 * GET /api/automation/logs
 * Get automation logs with filtering
 */
export async function GET(request: Request) {
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

    const { searchParams } = new URL(request.url);
    const orderId = searchParams.get('orderId');
    const actionType = searchParams.get('actionType') as AutomationActionType | null;
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const limit = parseInt(searchParams.get('limit') || '100');
    const offset = parseInt(searchParams.get('offset') || '0');

    let query = supabase
      .from('automation_logs')
      .select(`
        *,
        orders:order_id (
          order_number,
          case_caption
        )
      `, { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (orderId) {
      query = query.eq('order_id', orderId);
    }

    if (actionType) {
      query = query.eq('action_type', actionType);
    }

    if (startDate) {
      query = query.gte('created_at', startDate);
    }

    if (endDate) {
      query = query.lte('created_at', endDate);
    }

    const { data, error, count } = await query;

    if (error) throw error;

    // Format logs
    interface LogRecord {
      id: string;
      order_id: string | null;
      action_type: string;
      action_details: Record<string, unknown>;
      confidence_score: number | null;
      was_auto_approved: boolean;
      owner_override: boolean;
      error_message: string | null;
      duration_ms: number | null;
      created_at: string;
      orders?: { order_number: string; case_caption: string } | null;
    }
    const logs = (data as LogRecord[] || []).map((log: LogRecord) => {
      const order = log.orders as { order_number: string; case_caption: string } | null;
      return {
        id: log.id,
        orderId: log.order_id,
        orderNumber: order?.order_number,
        caseCaption: order?.case_caption,
        actionType: log.action_type,
        actionDetails: log.action_details,
        confidenceScore: log.confidence_score,
        wasAutoApproved: log.was_auto_approved,
        ownerOverride: log.owner_override,
        errorMessage: log.error_message,
        durationMs: log.duration_ms,
        createdAt: log.created_at,
      };
    });

    return NextResponse.json({
      success: true,
      logs,
      total: count || 0,
      hasMore: (count || 0) > offset + limit,
    });
  } catch (error) {
    log.error('Get logs error', { error: error instanceof Error ? error.message : error });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/automation/logs
 * Clear old automation logs (admin only)
 */
export async function DELETE(request: Request) {
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

    const { searchParams } = new URL(request.url);
    const beforeDate = searchParams.get('beforeDate');
    const daysOld = parseInt(searchParams.get('daysOld') || '90');

    let cutoffDate: Date;
    if (beforeDate) {
      cutoffDate = new Date(beforeDate);
    } else {
      cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysOld);
    }

    const { error, count } = await supabase
      .from('automation_logs')
      .delete({ count: 'exact' })
      .lt('created_at', cutoffDate.toISOString());

    if (error) throw error;

    return NextResponse.json({
      success: true,
      deletedCount: count || 0,
      cutoffDate: cutoffDate.toISOString(),
    });
  } catch (error) {
    log.error('Delete logs error', { error: error instanceof Error ? error.message : error });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
