/**
 * Report Generator Module
 *
 * This module generates automated reports including daily operations summaries,
 * weekly business intelligence, and on-demand analytics.
 */

import { getServiceSupabase } from '@/lib/supabase/admin';
import { generateReportSummary, isClaudeConfigured } from './claude';
import { queueNotification } from './notification-sender';
import { createLogger } from '@/lib/security/logger';

const log = createLogger('automation-report-generator');
import type {
  DailyReportData,
  WeeklyReportData,
  OrderAtRisk,
  ClerkUtilizationStat,
  OperationResult,
} from '@/types/automation';

// ============================================================================
// TYPES
// ============================================================================

interface ReportSettings {
  dailyEnabled: boolean;
  dailyTime: string;
  weeklyEnabled: boolean;
  weeklyDay: string;
  weeklyTime: string;
  timezone: string;
  recipients: string[];
}

// ============================================================================
// SETTINGS
// ============================================================================

async function getReportSettings(): Promise<ReportSettings> {
  try {
    const supabase = getServiceSupabase();

    const { data: settings } = await supabase
      .from('automation_settings')
      .select('setting_key, setting_value')
      .in('setting_key', [
        'report_daily_enabled',
        'report_weekly_enabled',
        'report_recipients',
      ]);

    interface SettingRow { setting_key: string; setting_value: unknown }
    const settingsMap = new Map(
      settings?.map((s: SettingRow) => [s.setting_key, s.setting_value]) || []
    );

    const dailyValue = settingsMap.get('report_daily_enabled') as {
      enabled?: boolean;
      time?: string;
      timezone?: string;
    } | undefined;

    const weeklyValue = settingsMap.get('report_weekly_enabled') as {
      enabled?: boolean;
      day?: string;
      time?: string;
      timezone?: string;
    } | undefined;

    const recipientsValue = settingsMap.get('report_recipients') as {
      emails?: string[];
    } | undefined;

    return {
      dailyEnabled: dailyValue?.enabled ?? true,
      dailyTime: dailyValue?.time ?? '08:00',
      weeklyEnabled: weeklyValue?.enabled ?? true,
      weeklyDay: weeklyValue?.day ?? 'monday',
      weeklyTime: weeklyValue?.time ?? '09:00',
      timezone: dailyValue?.timezone ?? weeklyValue?.timezone ?? 'America/Chicago',
      recipients: recipientsValue?.emails ?? [],
    };
  } catch (error) {
    log.error('[Report Generator] Failed to load settings:', error);
    return {
      dailyEnabled: true,
      dailyTime: '08:00',
      weeklyEnabled: true,
      weeklyDay: 'monday',
      weeklyTime: '09:00',
      timezone: 'America/Chicago',
      recipients: [],
    };
  }
}

// ============================================================================
// DAILY REPORT
// ============================================================================

/**
 * Generate daily operations report
 */
export async function generateDailyReport(
  date?: Date
): Promise<OperationResult<DailyReportData>> {
  const supabase = getServiceSupabase();
  const reportDate = date || new Date();
  const startOfDay = new Date(reportDate);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(reportDate);
  endOfDay.setHours(23, 59, 59, 999);

  try {
    // Fetch orders created today
    const { data: newOrders } = await supabase
      .from('orders')
      .select('id, total_price')
      .gte('created_at', startOfDay.toISOString())
      .lte('created_at', endOfDay.toISOString());

    // Fetch orders completed today
    const { data: completedOrders } = await supabase
      .from('orders')
      .select('id, total_price')
      .eq('status', 'completed')
      .gte('updated_at', startOfDay.toISOString())
      .lte('updated_at', endOfDay.toISOString());

    // Fetch orders at risk (deadline within 2 days)
    const twoDaysFromNow = new Date();
    twoDaysFromNow.setDate(twoDaysFromNow.getDate() + 2);

    const { data: atRiskOrders } = await supabase
      .from('orders')
      .select('id, order_number, case_caption, filing_deadline, status')
      .lte('filing_deadline', twoDaysFromNow.toISOString())
      .not('status', 'in', '("completed","cancelled")')
      .order('filing_deadline', { ascending: true });

    // Fetch clerk utilization
    const { data: clerks } = await supabase
      .from('clerks')
      .select(`
        id,
        current_workload,
        max_workload,
        profiles!inner (
          full_name
        )
      `);

    // Fetch automation stats for today
    const { data: automationLogs } = await supabase
      .from('automation_logs')
      .select('action_type, was_auto_approved')
      .gte('created_at', startOfDay.toISOString())
      .lte('created_at', endOfDay.toISOString());

    // Fetch pending approvals
    const { count: pendingApprovals } = await supabase
      .from('approval_queue')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending');

    // Define types for report data
    interface OrderRow { id: string; order_number: string; case_caption: string; filing_deadline: string; status: string; total_price: number }
    interface ClerkRow { id: string; current_workload: number; max_workload: number; profiles: { full_name: string } }
    interface LogRow { was_auto_approved: boolean; action_type: string }

    // Calculate revenue
    const newRevenue = (newOrders as OrderRow[] || []).reduce((sum: number, o: OrderRow) => sum + (o.total_price || 0), 0);

    // Calculate at-risk orders
    const ordersAtRisk: OrderAtRisk[] = (atRiskOrders as OrderRow[] || []).map((o: OrderRow) => {
      const deadline = new Date(o.filing_deadline);
      const daysUntil = Math.ceil((deadline.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
      return {
        orderId: o.id,
        orderNumber: o.order_number,
        caseCaption: o.case_caption,
        filingDeadline: o.filing_deadline,
        daysUntilDeadline: daysUntil,
        currentStatus: o.status,
        riskLevel: daysUntil <= 1 ? 'high' : daysUntil <= 2 ? 'medium' : 'low',
        reason: daysUntil <= 1 ? 'Deadline tomorrow or sooner' : 'Deadline within 2 days',
      };
    });

    // Calculate clerk utilization
    const clerkUtilization: ClerkUtilizationStat[] = (clerks as ClerkRow[] || []).map((c: ClerkRow) => {
      const profile = c.profiles as { full_name: string };
      return {
        clerkId: c.id,
        clerkName: profile.full_name,
        currentWorkload: c.current_workload,
        maxWorkload: c.max_workload,
        utilizationPercent: Math.round((c.current_workload / c.max_workload) * 100),
        ordersCompletedToday: 0, // Would need additional query
      };
    });

    // Calculate automation stats
    const logs = automationLogs as LogRow[] || [];
    const automationStats = {
      totalActions: logs.length,
      autoApproved: logs.filter((l: LogRow) => l.was_auto_approved).length,
      manualReview: logs.filter((l: LogRow) => !l.was_auto_approved).length,
      failed: logs.filter((l: LogRow) => l.action_type.includes('failed')).length,
    };

    const report: DailyReportData = {
      date: reportDate.toISOString().split('T')[0],
      newOrders: newOrders?.length || 0,
      completedOrders: completedOrders?.length || 0,
      revenueCollected: newRevenue,
      ordersAtRisk,
      clerkUtilization,
      pendingApprovals: pendingApprovals || 0,
      automationStats,
    };

    // Log report generation
    await logAutomationAction(supabase, null, 'report_generated', {
      reportType: 'daily',
      date: report.date,
      newOrders: report.newOrders,
      ordersAtRisk: ordersAtRisk.length,
    });

    return { success: true, data: report };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// ============================================================================
// WEEKLY REPORT
// ============================================================================

/**
 * Generate weekly business intelligence report
 */
export async function generateWeeklyReport(
  weekEndDate?: Date
): Promise<OperationResult<WeeklyReportData>> {
  const supabase = getServiceSupabase();
  const endDate = weekEndDate || new Date();
  const startDate = new Date(endDate);
  startDate.setDate(startDate.getDate() - 7);

  try {
    // Fetch all orders for the week
    const { data: weekOrders } = await supabase
      .from('orders')
      .select(`
        id,
        motion_type,
        motion_tier,
        jurisdiction,
        turnaround,
        total_price,
        status,
        created_at,
        updated_at,
        client_id,
        profiles:client_id (
          full_name
        )
      `)
      .gte('created_at', startDate.toISOString())
      .lte('created_at', endDate.toISOString());

    interface WeekOrder {
      id: string;
      status: string;
      total_price: number;
      motion_type: string;
      jurisdiction: string;
      turnaround: string;
      created_at: string;
      updated_at: string;
      client_id: string;
      profiles?: { full_name: string } | null;
    }
    const orders = (weekOrders || []) as WeekOrder[];

    // Calculate totals
    const totalOrders = orders.length;
    const totalRevenue = orders
      .filter((o: WeekOrder) => o.status !== 'cancelled')
      .reduce((sum: number, o: WeekOrder) => sum + (o.total_price || 0), 0);

    // Motion type breakdown
    const motionTypeMap = new Map<string, { count: number; revenue: number }>();
    for (const order of orders) {
      const existing = motionTypeMap.get(order.motion_type) || { count: 0, revenue: 0 };
      motionTypeMap.set(order.motion_type, {
        count: existing.count + 1,
        revenue: existing.revenue + (order.total_price || 0),
      });
    }
    const motionTypeBreakdown = Array.from(motionTypeMap.entries())
      .map(([type, data]) => ({ type, ...data }))
      .sort((a, b) => b.count - a.count);

    // Jurisdiction breakdown
    const jurisdictionMap = new Map<string, number>();
    for (const order of orders) {
      jurisdictionMap.set(order.jurisdiction, (jurisdictionMap.get(order.jurisdiction) || 0) + 1);
    }
    const jurisdictionBreakdown = Array.from(jurisdictionMap.entries())
      .map(([jurisdiction, count]) => ({ jurisdiction, count }))
      .sort((a, b) => b.count - a.count);

    // Calculate average turnaround for completed orders
    const completedOrders = orders.filter((o: WeekOrder) => o.status === 'completed');
    let avgTurnaround = 0;
    if (completedOrders.length > 0) {
      const totalDays = completedOrders.reduce((sum: number, o: WeekOrder) => {
        const created = new Date(o.created_at);
        const updated = new Date(o.updated_at);
        return sum + (updated.getTime() - created.getTime()) / (1000 * 60 * 60 * 24);
      }, 0);
      avgTurnaround = Math.round((totalDays / completedOrders.length) * 10) / 10;
    }

    // Rush order percentage
    const rushOrders = orders.filter((o: WeekOrder) => o.turnaround !== 'standard');
    const rushOrderPercentage = totalOrders > 0 ? Math.round((rushOrders.length / totalOrders) * 100) : 0;

    // Top clients
    const clientMap = new Map<string, { name: string; orders: number; revenue: number }>();
    for (const order of orders) {
      const profile = order.profiles as { full_name: string } | null;
      const clientName = profile?.full_name || 'Unknown';
      const existing = clientMap.get(order.client_id) || { name: clientName, orders: 0, revenue: 0 };
      clientMap.set(order.client_id, {
        name: clientName,
        orders: existing.orders + 1,
        revenue: existing.revenue + (order.total_price || 0),
      });
    }
    const topClients = Array.from(clientMap.values())
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5);

    const report: WeeklyReportData = {
      weekStartDate: startDate.toISOString().split('T')[0],
      weekEndDate: endDate.toISOString().split('T')[0],
      totalOrders,
      totalRevenue,
      motionTypeBreakdown,
      jurisdictionBreakdown,
      avgTurnaround,
      rushOrderPercentage,
      clientSatisfaction: null, // Would need feedback data
      topClients,
    };

    // Log report generation
    await logAutomationAction(supabase, null, 'report_generated', {
      reportType: 'weekly',
      weekStart: report.weekStartDate,
      weekEnd: report.weekEndDate,
      totalOrders: report.totalOrders,
      totalRevenue: report.totalRevenue,
    });

    return { success: true, data: report };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// ============================================================================
// REPORT DELIVERY
// ============================================================================

/**
 * Generate and send daily report
 */
export async function sendDailyReport(): Promise<OperationResult> {
  try {
    const settings = await getReportSettings();

    if (!settings.dailyEnabled) {
      return { success: true }; // Silently skip if disabled
    }

    if (settings.recipients.length === 0) {
      return { success: false, error: 'No report recipients configured' };
    }

    const reportResult = await generateDailyReport();
    if (!reportResult.success || !reportResult.data) {
      return { success: false, error: reportResult.error };
    }

    const report = reportResult.data;

    // Generate AI summary if available
    let aiSummary = '';
    if (isClaudeConfigured) {
      const summaryResult = await generateReportSummary({
        reportType: 'daily',
        data: report as unknown as Record<string, unknown>,
      });
      if (summaryResult.success && summaryResult.result) {
        aiSummary = summaryResult.result.executiveSummary;
      }
    }

    // Queue notification for each recipient
    for (const email of settings.recipients) {
      await queueNotification({
        type: 'report_delivery',
        recipientId: '', // System email
        recipientEmail: email,
        subject: `Daily Operations Report - ${report.date}`,
        templateData: {
          reportType: 'daily',
          date: report.date,
          summary: aiSummary || generateTextSummary(report),
          newOrders: report.newOrders,
          completedOrders: report.completedOrders,
          revenue: report.revenueCollected,
          ordersAtRisk: report.ordersAtRisk.length,
          pendingApprovals: report.pendingApprovals,
          automationStats: report.automationStats,
        },
        priority: 3,
      });
    }

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Generate and send weekly report
 */
export async function sendWeeklyReport(): Promise<OperationResult> {
  try {
    const settings = await getReportSettings();

    if (!settings.weeklyEnabled) {
      return { success: true };
    }

    if (settings.recipients.length === 0) {
      return { success: false, error: 'No report recipients configured' };
    }

    const reportResult = await generateWeeklyReport();
    if (!reportResult.success || !reportResult.data) {
      return { success: false, error: reportResult.error };
    }

    const report = reportResult.data;

    // Generate AI summary if available
    let aiSummary = '';
    if (isClaudeConfigured) {
      const summaryResult = await generateReportSummary({
        reportType: 'weekly',
        data: report as unknown as Record<string, unknown>,
      });
      if (summaryResult.success && summaryResult.result) {
        aiSummary = summaryResult.result.executiveSummary;
      }
    }

    // Queue notification for each recipient
    for (const email of settings.recipients) {
      await queueNotification({
        type: 'report_delivery',
        recipientId: '',
        recipientEmail: email,
        subject: `Weekly Business Report - Week of ${report.weekStartDate}`,
        templateData: {
          reportType: 'weekly',
          weekStart: report.weekStartDate,
          weekEnd: report.weekEndDate,
          summary: aiSummary || generateWeeklyTextSummary(report),
          totalOrders: report.totalOrders,
          totalRevenue: report.totalRevenue,
          avgTurnaround: report.avgTurnaround,
          rushOrderPercentage: report.rushOrderPercentage,
          topMotionTypes: report.motionTypeBreakdown.slice(0, 3),
          topClients: report.topClients.slice(0, 3),
        },
        priority: 3,
      });
    }

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Generate text summary for daily report
 */
function generateTextSummary(report: DailyReportData): string {
  const parts: string[] = [];

  parts.push(`${report.newOrders} new order(s) received`);
  parts.push(`${report.completedOrders} order(s) completed`);
  parts.push(`$${report.revenueCollected.toFixed(2)} in revenue`);

  if (report.ordersAtRisk.length > 0) {
    parts.push(`${report.ordersAtRisk.length} order(s) at risk`);
  }

  if (report.pendingApprovals > 0) {
    parts.push(`${report.pendingApprovals} pending approval(s)`);
  }

  return parts.join('. ') + '.';
}

/**
 * Generate text summary for weekly report
 */
function generateWeeklyTextSummary(report: WeeklyReportData): string {
  const parts: string[] = [];

  parts.push(`${report.totalOrders} total orders`);
  parts.push(`$${report.totalRevenue.toFixed(2)} in revenue`);
  parts.push(`${report.avgTurnaround} day average turnaround`);
  parts.push(`${report.rushOrderPercentage}% rush orders`);

  if (report.topClients.length > 0) {
    parts.push(`Top client: ${report.topClients[0].name}`);
  }

  return parts.join('. ') + '.';
}

/**
 * Log automation action
 */
async function logAutomationAction(
  supabase: ReturnType<typeof getServiceSupabase>,
  orderId: string | null,
  actionType: string,
  details: Record<string, unknown>
): Promise<void> {
  try {
    await supabase.from('automation_logs').insert({
      order_id: orderId,
      action_type: actionType,
      action_details: details,
    });
  } catch (error) {
    log.error('[Automation Log] Failed to log action:', error);
  }
}

/**
 * Get dashboard stats for command center
 */
export async function getDashboardStats(): Promise<
  OperationResult<{
    pendingApprovals: number;
    autoProcessedToday: number;
    activeAlerts: number;
    pendingTasks: number;
    failedTasks24h: number;
    notificationsSentToday: number;
  }>
> {
  const supabase = getServiceSupabase();

  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);

    // Pending approvals
    const { count: pendingApprovals } = await supabase
      .from('approval_queue')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending');

    // Auto-processed today
    const { count: autoProcessedToday } = await supabase
      .from('automation_logs')
      .select('*', { count: 'exact', head: true })
      .eq('was_auto_approved', true)
      .gte('created_at', today.toISOString());

    // Active alerts (high/critical pending approvals)
    const { count: activeAlerts } = await supabase
      .from('approval_queue')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending')
      .in('urgency', ['high', 'critical']);

    // Pending tasks
    const { count: pendingTasks } = await supabase
      .from('automation_tasks')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending');

    // Failed tasks in last 24h
    const { count: failedTasks24h } = await supabase
      .from('automation_tasks')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'failed')
      .gte('completed_at', yesterday.toISOString());

    // Notifications sent today
    const { count: notificationsSentToday } = await supabase
      .from('notification_queue')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'sent')
      .gte('sent_at', today.toISOString());

    return {
      success: true,
      data: {
        pendingApprovals: pendingApprovals || 0,
        autoProcessedToday: autoProcessedToday || 0,
        activeAlerts: activeAlerts || 0,
        pendingTasks: pendingTasks || 0,
        failedTasks24h: failedTasks24h || 0,
        notificationsSentToday: notificationsSentToday || 0,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
