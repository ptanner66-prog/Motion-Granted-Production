import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getDashboardStats, generateDailyReport } from '@/lib/automation';

/**
 * GET /api/automation/dashboard
 * Get automation dashboard stats and data
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
    const includeReport = searchParams.get('includeReport') === 'true';

    // Get dashboard stats
    const statsResult = await getDashboardStats();

    if (!statsResult.success) {
      return NextResponse.json(
        { error: statsResult.error },
        { status: 500 }
      );
    }

    // Get recent automation activity
    const { data: recentActivity } = await supabase
      .from('automation_logs')
      .select(`
        id,
        order_id,
        action_type,
        action_details,
        was_auto_approved,
        created_at,
        orders:order_id (
          order_number
        )
      `)
      .order('created_at', { ascending: false })
      .limit(20);

    // Get pending approvals summary
    const { data: pendingApprovals } = await supabase
      .from('approval_queue')
      .select(`
        id,
        approval_type,
        order_id,
        ai_recommendation,
        ai_confidence,
        urgency,
        created_at,
        orders:order_id (
          order_number,
          case_caption
        )
      `)
      .eq('status', 'pending')
      .order('urgency', { ascending: false })
      .order('created_at', { ascending: true })
      .limit(10);

    // Format activity items
    interface LogEntry {
      id: string;
      order_id: string | null;
      action_type: string;
      action_details: Record<string, unknown>;
      was_auto_approved: boolean;
      created_at: string;
      orders?: { order_number: string } | null;
    }
    const activity = (recentActivity as LogEntry[] || []).map((log: LogEntry) => {
      const order = log.orders as { order_number: string } | null;
      return {
        id: log.id,
        type: log.action_type,
        description: formatActionDescription(log.action_type, log.action_details as Record<string, unknown>),
        orderId: log.order_id,
        orderNumber: order?.order_number,
        timestamp: log.created_at,
        status: getActionStatus(log.action_type, log.was_auto_approved),
        details: log.action_details,
      };
    });

    let dailyReport = null;
    if (includeReport) {
      const reportResult = await generateDailyReport();
      if (reportResult.success) {
        dailyReport = reportResult.data;
      }
    }

    return NextResponse.json({
      success: true,
      stats: statsResult.data,
      activity,
      pendingApprovals: (pendingApprovals || []).map((approval: Record<string, unknown>) => {
        const order = approval.orders as { order_number: string; case_caption: string } | null;
        return {
          ...approval,
          orderNumber: order?.order_number,
          caseCaption: order?.case_caption,
        };
      }),
      dailyReport,
    });
  } catch (error) {
    console.error('[API] Dashboard error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * Format action description for display
 */
function formatActionDescription(
  actionType: string,
  details: Record<string, unknown>
): string {
  switch (actionType) {
    case 'payment_processed':
      return 'Payment processed successfully';
    case 'payment_failed':
      return `Payment failed: ${details.error || 'Unknown error'}`;
    case 'conflict_check_started':
      return 'Conflict check initiated';
    case 'conflict_check_completed':
      return 'Conflict check completed';
    case 'conflict_detected':
      return `${details.matchCount || 'Multiple'} potential conflict(s) detected`;
    case 'conflict_cleared':
      return details.autoCleared ? 'Conflicts auto-cleared' : 'Conflicts manually cleared';
    case 'clerk_assignment_started':
      return 'Clerk assignment initiated';
    case 'clerk_assigned':
      return `Assigned to ${details.clerkName || 'clerk'}`;
    case 'notification_queued':
      return `${details.notificationType || 'Notification'} queued`;
    case 'notification_sent':
      return `${details.notificationType || 'Notification'} sent`;
    case 'notification_failed':
      return `Notification failed: ${details.error || 'Unknown error'}`;
    case 'qa_check_started':
      return 'QA check initiated';
    case 'qa_check_passed':
      return `QA passed (score: ${details.score || 'N/A'})`;
    case 'qa_check_failed':
      return `QA failed: ${(details.issues as unknown[])?.length || 0} issue(s) found`;
    case 'status_changed':
      return `Status changed to ${details.newStatus || 'unknown'}`;
    case 'deadline_alert':
      return `Deadline alert: ${details.daysUntilDeadline} day(s) remaining`;
    case 'report_generated':
      return `${details.reportType || 'Report'} report generated`;
    case 'approval_requested':
      return `${details.type || 'Approval'} review requested`;
    case 'approval_granted':
      return 'Approval granted';
    case 'approval_denied':
      return 'Approval denied';
    case 'task_scheduled':
      return `${details.taskType || 'Task'} scheduled`;
    case 'task_completed':
      return `${details.taskType || 'Task'} completed`;
    case 'task_failed':
      return `Task failed: ${details.error || 'Unknown error'}`;
    default:
      return actionType.replace(/_/g, ' ');
  }
}

/**
 * Get status indicator for action type
 */
function getActionStatus(
  actionType: string,
  wasAutoApproved: boolean
): 'success' | 'warning' | 'error' {
  if (actionType.includes('failed') || actionType.includes('denied')) {
    return 'error';
  }
  if (actionType.includes('detected') || actionType.includes('requested')) {
    return 'warning';
  }
  return 'success';
}
