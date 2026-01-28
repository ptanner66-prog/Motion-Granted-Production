/**
 * Task Processor Module
 *
 * This module handles processing of scheduled automation tasks including
 * conflict checks, clerk assignments, deadline monitoring, and more.
 */

import { createClient } from '@/lib/supabase/server';
import { runConflictCheck } from './conflict-checker';
import { runClerkAssignment } from './clerk-assigner';
import { processNotificationQueue, queueOrderNotification } from './notification-sender';
import { runQACheck } from './qa-checker';
import { sendDailyReport, sendWeeklyReport } from './report-generator';
import type { TaskType, TaskStatus, OperationResult } from '@/types/automation';

// ============================================================================
// TYPES
// ============================================================================

interface TaskRecord {
  id: string;
  task_type: TaskType;
  order_id: string | null;
  payload: Record<string, unknown>;
  priority: number;
  attempts: number;
  max_attempts: number;
}

interface ProcessResult {
  tasksProcessed: number;
  successful: number;
  failed: number;
  errors: string[];
}

interface MaintenanceSettings {
  enabled: boolean;
}

// ============================================================================
// SETTINGS
// ============================================================================

async function getMaintenanceMode(): Promise<boolean> {
  try {
    const supabase = await createClient();

    const { data } = await supabase
      .from('automation_settings')
      .select('setting_value')
      .eq('setting_key', 'maintenance_mode')
      .single();

    return (data?.setting_value as MaintenanceSettings)?.enabled ?? false;
  } catch {
    return false;
  }
}

// ============================================================================
// MAIN PROCESSOR
// ============================================================================

/**
 * Process pending automation tasks
 */
export async function processTasks(
  options: {
    taskTypes?: TaskType[];
    maxTasks?: number;
    dryRun?: boolean;
  } = {}
): Promise<OperationResult<ProcessResult>> {
  const supabase = await createClient();
  const maxTasks = options.maxTasks || 10;

  try {
    // Check maintenance mode
    const inMaintenance = await getMaintenanceMode();
    if (inMaintenance) {
      return {
        success: true,
        data: { tasksProcessed: 0, successful: 0, failed: 0, errors: ['Maintenance mode active'] },
      };
    }

    // Fetch pending tasks
    let query = supabase
      .from('automation_tasks')
      .select('*')
      .eq('status', 'pending')
      .lte('scheduled_for', new Date().toISOString())
      .order('priority', { ascending: false })
      .order('scheduled_for', { ascending: true })
      .limit(maxTasks);

    if (options.taskTypes && options.taskTypes.length > 0) {
      query = query.in('task_type', options.taskTypes);
    }

    const { data: tasksData, error } = await query;

    const tasks = tasksData as TaskRecord[] | null;

    if (error) throw error;

    if (!tasks || tasks.length === 0) {
      return {
        success: true,
        data: { tasksProcessed: 0, successful: 0, failed: 0, errors: [] },
      };
    }

    const result: ProcessResult = {
      tasksProcessed: tasks.length,
      successful: 0,
      failed: 0,
      errors: [],
    };

    // Process each task
    for (const task of tasks) {
      if (options.dryRun) {
        console.log(`[Dry Run] Would process task: ${task.task_type} (${task.id})`);
        continue;
      }

      // Mark as processing
      await supabase
        .from('automation_tasks')
        .update({
          status: 'processing',
          started_at: new Date().toISOString(),
          attempts: task.attempts + 1,
        })
        .eq('id', task.id);

      try {
        // Execute the task
        const taskResult = await executeTask(task);

        if (taskResult.success) {
          // Mark as completed
          await supabase
            .from('automation_tasks')
            .update({
              status: 'completed',
              completed_at: new Date().toISOString(),
            })
            .eq('id', task.id);

          result.successful++;
        } else {
          // Determine if we should retry
          const shouldRetry = task.attempts + 1 < task.max_attempts;

          await supabase
            .from('automation_tasks')
            .update({
              status: shouldRetry ? 'pending' : 'failed',
              last_error: taskResult.error,
              // Exponential backoff for retry
              scheduled_for: shouldRetry
                ? new Date(Date.now() + Math.pow(2, task.attempts + 1) * 60000).toISOString()
                : undefined,
              completed_at: shouldRetry ? null : new Date().toISOString(),
            })
            .eq('id', task.id);

          if (!shouldRetry) {
            result.failed++;
            result.errors.push(`Task ${task.id}: ${taskResult.error}`);
          }
        }
      } catch (taskError) {
        const errorMessage = taskError instanceof Error ? taskError.message : 'Unknown error';

        // Mark as failed or retry
        const shouldRetry = task.attempts + 1 < task.max_attempts;

        await supabase
          .from('automation_tasks')
          .update({
            status: shouldRetry ? 'pending' : 'failed',
            last_error: errorMessage,
            scheduled_for: shouldRetry
              ? new Date(Date.now() + Math.pow(2, task.attempts + 1) * 60000).toISOString()
              : undefined,
            completed_at: shouldRetry ? null : new Date().toISOString(),
          })
          .eq('id', task.id);

        if (!shouldRetry) {
          result.failed++;
          result.errors.push(`Task ${task.id}: ${errorMessage}`);
        }
      }
    }

    // Log processing results
    await logAutomationAction(supabase, null, 'task_completed', {
      tasksProcessed: result.tasksProcessed,
      successful: result.successful,
      failed: result.failed,
    });

    return { success: true, data: result };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Execute a specific task based on its type
 */
async function executeTask(task: TaskRecord): Promise<OperationResult<unknown>> {
  switch (task.task_type) {
    case 'conflict_check':
      if (!task.order_id) {
        return { success: false, error: 'Order ID required for conflict check' };
      }
      const conflictResult = await runConflictCheck(task.order_id);
      return { success: conflictResult.success, error: conflictResult.error };

    case 'clerk_assignment':
      if (!task.order_id) {
        return { success: false, error: 'Order ID required for clerk assignment' };
      }
      const assignResult = await runClerkAssignment(task.order_id);
      return { success: assignResult.success, error: assignResult.error };

    case 'send_notification':
      const notifyResult = await processNotificationQueue();
      return { success: notifyResult.success, error: notifyResult.error };

    case 'qa_check':
      if (!task.order_id || !task.payload.documentId) {
        return { success: false, error: 'Order ID and document ID required for QA check' };
      }
      const qaResult = await runQACheck(task.order_id, task.payload.documentId as string);
      return { success: qaResult.success, error: qaResult.error };

    case 'deadline_check':
      return await runDeadlineCheck();

    case 'follow_up_reminder':
      return await sendFollowUpReminder(task);

    case 'generate_report':
      const reportType = task.payload.reportType as string;
      if (reportType === 'daily') {
        return await sendDailyReport();
      } else if (reportType === 'weekly') {
        return await sendWeeklyReport();
      }
      return { success: false, error: `Unknown report type: ${reportType}` };

    case 'process_payment_webhook':
      // This is handled directly by the webhook endpoint
      return { success: true };

    case 'retry_failed_notification':
      const retryResult = await processNotificationQueue();
      return { success: retryResult.success, error: retryResult.error };

    case 'cleanup_old_logs':
      return await cleanupOldLogs();

    default:
      return { success: false, error: `Unknown task type: ${task.task_type}` };
  }
}

// ============================================================================
// SPECIFIC TASK HANDLERS
// ============================================================================

/**
 * Check for orders approaching deadline and send alerts
 */
async function runDeadlineCheck(): Promise<OperationResult<{ alertsSent: number }>> {
  const supabase = await createClient();

  try {
    // Get deadline settings
    const { data: settingData } = await supabase
      .from('automation_settings')
      .select('setting_value')
      .eq('setting_key', 'deadline_alert_days')
      .single();

    const settings = (settingData?.setting_value as { warning?: number; critical?: number }) || {};
    const warningDays = settings.warning ?? 3;
    const criticalDays = settings.critical ?? 1;

    const now = new Date();
    const warningDate = new Date(now.getTime() + warningDays * 24 * 60 * 60 * 1000);
    const criticalDate = new Date(now.getTime() + criticalDays * 24 * 60 * 60 * 1000);

    // Find orders with approaching deadlines
    const { data: atRiskOrders } = await supabase
      .from('orders')
      .select('id, order_number, filing_deadline, status')
      .lte('filing_deadline', warningDate.toISOString())
      .not('status', 'in', '("completed","cancelled","draft_delivered")')
      .order('filing_deadline', { ascending: true });

    let alertsSent = 0;

    for (const order of atRiskOrders || []) {
      const deadline = new Date(order.filing_deadline);
      const daysUntil = Math.ceil((deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

      // Determine alert type
      let notificationType: 'deadline_critical' | 'deadline_warning' | 'deadline_reminder';
      if (daysUntil <= criticalDays) {
        notificationType = 'deadline_critical';
      } else if (daysUntil <= warningDays) {
        notificationType = 'deadline_warning';
      } else {
        notificationType = 'deadline_reminder';
      }

      // Check if we already sent this type of alert today
      const { data: existingAlert } = await supabase
        .from('automation_logs')
        .select('id')
        .eq('order_id', order.id)
        .eq('action_type', 'deadline_alert')
        .gte('created_at', new Date(now.setHours(0, 0, 0, 0)).toISOString())
        .single();

      if (!existingAlert) {
        // Queue the notification
        await queueOrderNotification(order.id, notificationType, {
          daysUntilDeadline: daysUntil,
        });

        // Log the alert
        await logAutomationAction(supabase, order.id, 'deadline_alert', {
          daysUntilDeadline: daysUntil,
          alertType: notificationType,
        });

        alertsSent++;
      }
    }

    return { success: true, data: { alertsSent } };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Send follow-up reminder for specific task
 */
async function sendFollowUpReminder(task: TaskRecord): Promise<OperationResult> {
  const payload = task.payload;
  const reminderType = payload.reminderType as string;
  const orderId = task.order_id;

  if (!orderId) {
    return { success: false, error: 'Order ID required for follow-up reminder' };
  }

  // Queue the appropriate notification based on reminder type
  switch (reminderType) {
    case 'draft_not_downloaded':
      await queueOrderNotification(orderId, 'status_update', {
        message: 'Your draft is still awaiting download',
      });
      break;

    case 'feedback_request':
      await queueOrderNotification(orderId, 'feedback_request');
      break;

    default:
      return { success: false, error: `Unknown reminder type: ${reminderType}` };
  }

  return { success: true };
}

/**
 * Clean up old automation logs
 */
async function cleanupOldLogs(): Promise<OperationResult> {
  const supabase = await createClient();

  try {
    // Keep logs for 90 days
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 90);

    // Delete old logs
    const { error: logsError } = await supabase
      .from('automation_logs')
      .delete()
      .lt('created_at', cutoffDate.toISOString());

    if (logsError) throw logsError;

    // Delete old completed tasks
    const { error: tasksError } = await supabase
      .from('automation_tasks')
      .delete()
      .in('status', ['completed', 'failed', 'cancelled'])
      .lt('completed_at', cutoffDate.toISOString());

    if (tasksError) throw tasksError;

    // Delete old processed webhooks
    const { error: webhooksError } = await supabase
      .from('webhook_events')
      .delete()
      .eq('processed', true)
      .lt('created_at', cutoffDate.toISOString());

    if (webhooksError) throw webhooksError;

    await logAutomationAction(supabase, null, 'task_completed', {
      taskType: 'cleanup_old_logs',
      cutoffDate: cutoffDate.toISOString(),
    });

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// ============================================================================
// TASK SCHEDULING
// ============================================================================

/**
 * Schedule a new automation task
 */
export async function scheduleTask(
  taskType: TaskType,
  options: {
    orderId?: string;
    payload?: Record<string, unknown>;
    priority?: number;
    scheduledFor?: Date;
    maxAttempts?: number;
  } = {}
): Promise<OperationResult<{ taskId: string }>> {
  const supabase = await createClient();

  try {
    const { data, error } = await supabase
      .from('automation_tasks')
      .insert({
        task_type: taskType,
        order_id: options.orderId || null,
        payload: options.payload || {},
        priority: options.priority || 5,
        scheduled_for: (options.scheduledFor || new Date()).toISOString(),
        max_attempts: options.maxAttempts || 3,
      })
      .select('id')
      .single();

    if (error) throw error;

    await logAutomationAction(supabase, options.orderId || null, 'task_scheduled', {
      taskType,
      taskId: data.id,
      scheduledFor: (options.scheduledFor || new Date()).toISOString(),
    });

    return { success: true, data: { taskId: data.id } };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Cancel a pending task
 */
export async function cancelTask(taskId: string): Promise<OperationResult> {
  const supabase = await createClient();

  try {
    const { error } = await supabase
      .from('automation_tasks')
      .update({ status: 'cancelled' })
      .eq('id', taskId)
      .eq('status', 'pending');

    if (error) throw error;

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Get task status
 */
export async function getTaskStatus(
  taskId: string
): Promise<OperationResult<{ status: TaskStatus; attempts: number; lastError: string | null }>> {
  const supabase = await createClient();

  try {
    const { data, error } = await supabase
      .from('automation_tasks')
      .select('status, attempts, last_error')
      .eq('id', taskId)
      .single();

    if (error) throw error;

    return {
      success: true,
      data: {
        status: data.status as TaskStatus,
        attempts: data.attempts,
        lastError: data.last_error,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Log automation action
 */
async function logAutomationAction(
  supabase: Awaited<ReturnType<typeof createClient>>,
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
    console.error('[Automation Log] Failed to log action:', error);
  }
}

/**
 * Schedule recurring tasks (call this from a cron job)
 */
export async function scheduleRecurringTasks(): Promise<OperationResult> {
  const supabase = await createClient();

  try {
    const now = new Date();
    const hour = now.getHours();
    const dayOfWeek = now.getDay(); // 0 = Sunday, 1 = Monday, etc.

    // Get report settings
    const { data: settings } = await supabase
      .from('automation_settings')
      .select('setting_key, setting_value')
      .in('setting_key', ['report_daily_enabled', 'report_weekly_enabled', 'deadline_monitoring_enabled']);

    interface SettingRow { setting_key: string; setting_value: unknown }
    const settingsMap = new Map(
      settings?.map((s: SettingRow) => [s.setting_key, s.setting_value]) || []
    );

    // Schedule daily report (default 8 AM)
    const dailySettings = settingsMap.get('report_daily_enabled') as { enabled?: boolean; time?: string } | undefined;
    if (dailySettings?.enabled !== false) {
      const dailyHour = parseInt((dailySettings?.time || '08:00').split(':')[0]);
      if (hour === dailyHour) {
        await scheduleTask('generate_report', {
          payload: { reportType: 'daily' },
          priority: 3,
        });
      }
    }

    // Schedule weekly report (default Monday 9 AM)
    const weeklySettings = settingsMap.get('report_weekly_enabled') as { enabled?: boolean; day?: string; time?: string } | undefined;
    if (weeklySettings?.enabled !== false) {
      const weeklyDay = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'].indexOf(
        (weeklySettings?.day || 'monday').toLowerCase()
      );
      const weeklyHour = parseInt((weeklySettings?.time || '09:00').split(':')[0]);
      if (dayOfWeek === weeklyDay && hour === weeklyHour) {
        await scheduleTask('generate_report', {
          payload: { reportType: 'weekly' },
          priority: 3,
        });
      }
    }

    // Schedule deadline check (every 4 hours)
    const deadlineSettings = settingsMap.get('deadline_monitoring_enabled') as { enabled?: boolean } | undefined;
    if (deadlineSettings?.enabled !== false && hour % 4 === 0) {
      await scheduleTask('deadline_check', { priority: 7 });
    }

    // Schedule notification processing (every hour)
    await scheduleTask('send_notification', { priority: 6 });

    // Schedule cleanup (once a day at 3 AM)
    if (hour === 3) {
      await scheduleTask('cleanup_old_logs', { priority: 1 });
    }

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
