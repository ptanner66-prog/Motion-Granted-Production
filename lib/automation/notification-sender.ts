/**
 * Notification Queue and Sender Module
 *
 * This module handles queuing and sending automated notifications
 * including email delivery with retry logic and quiet hours support.
 */

import { getServiceSupabase } from '@/lib/supabase/admin';
import { sendEmail } from '@/lib/resend';
import { OrderConfirmationEmail } from '@/emails/order-confirmation';
import { DraftReadyEmail } from '@/emails/draft-ready';
import { StatusUpdateEmail } from '@/emails/status-update';
import { DeadlineReminderEmail } from '@/emails/deadline-reminder';
import { ProgressUpdateEmail } from '@/emails/progress-update';
import { OrderCompletedEmail } from '@/emails/order-completed';
import { RevisionRequestEmail } from '@/emails/revision-request';
// v6.3: Checkpoint notification templates
import { CheckpointNotificationEmail } from '@/emails/checkpoint-notification';
import { RevisionPaymentRequiredEmail } from '@/emails/revision-payment-required';
import type {
  NotificationType,
  NotificationStatus,
  QueueNotificationRequest,
  SendNotificationResult,
  OperationResult,
} from '@/types/automation';
import { formatDate, formatCurrency } from '@/lib/utils';
import React from 'react';

import { createLogger } from '@/lib/security/logger';

const log = createLogger('automation-notification-sender');
// ============================================================================
// TYPES
// ============================================================================

interface NotificationSettings {
  enabled: boolean;
  quietHours: {
    enabled: boolean;
    start: string;
    end: string;
    timezone: string;
  };
  retryAttempts: number;
  batchSize: number;
}

interface NotificationQueueRecord {
  id: string;
  notification_type: NotificationType;
  recipient_id: string | null;
  recipient_email: string;
  order_id: string | null;
  subject: string;
  template_data: Record<string, unknown>;
  status: NotificationStatus;
  priority: number;
  scheduled_for: string;
  attempts: number;
  max_attempts: number;
  last_error: string | null;
}

// ============================================================================
// SETTINGS
// ============================================================================

async function getNotificationSettings(): Promise<NotificationSettings> {
  try {
    const supabase = getServiceSupabase();

    const { data: settings } = await supabase
      .from('automation_settings')
      .select('setting_key, setting_value')
      .in('setting_key', [
        'notifications_enabled',
        'notification_quiet_hours',
        'notification_retry_attempts',
        'notification_batch_size',
      ]);

    interface SettingRow { setting_key: string; setting_value: unknown }
    const settingsMap = new Map(
      settings?.map((s: SettingRow) => [s.setting_key, s.setting_value]) || []
    );

    const quietHoursValue = settingsMap.get('notification_quiet_hours') as {
      enabled?: boolean;
      start?: string;
      end?: string;
      timezone?: string;
    } | undefined;

    return {
      enabled: (settingsMap.get('notifications_enabled') as { enabled?: boolean })?.enabled ?? true,
      quietHours: {
        enabled: quietHoursValue?.enabled ?? false,
        start: quietHoursValue?.start ?? '22:00',
        end: quietHoursValue?.end ?? '07:00',
        timezone: quietHoursValue?.timezone ?? 'America/Chicago',
      },
      retryAttempts:
        (settingsMap.get('notification_retry_attempts') as { value?: number })?.value ?? 3,
      batchSize: (settingsMap.get('notification_batch_size') as { value?: number })?.value ?? 50,
    };
  } catch (error) {
    log.error('[Notifications] Failed to load settings:', error);
    return {
      enabled: true,
      quietHours: {
        enabled: false,
        start: '22:00',
        end: '07:00',
        timezone: 'America/Chicago',
      },
      retryAttempts: 3,
      batchSize: 50,
    };
  }
}

// ============================================================================
// MAIN FUNCTIONS
// ============================================================================

/**
 * Queue a notification for sending
 */
export async function queueNotification(
  request: QueueNotificationRequest
): Promise<OperationResult<{ notificationId: string }>> {
  const supabase = getServiceSupabase();

  try {
    const settings = await getNotificationSettings();

    if (!settings.enabled) {
      return {
        success: false,
        error: 'Notifications are disabled',
        code: 'NOTIFICATIONS_DISABLED',
      };
    }

    // Determine scheduled time (respecting quiet hours if applicable)
    let scheduledFor = request.scheduledFor || new Date();

    if (settings.quietHours.enabled && !isHighPriority(request.type)) {
      scheduledFor = adjustForQuietHours(scheduledFor, settings.quietHours);
    }

    // Insert into queue
    const { data, error } = await supabase
      .from('notification_queue')
      .insert({
        notification_type: request.type,
        recipient_id: request.recipientId,
        recipient_email: request.recipientEmail,
        order_id: request.orderId || null,
        subject: request.subject,
        template_data: request.templateData,
        status: 'pending',
        priority: request.priority || getPriorityForType(request.type),
        scheduled_for: scheduledFor.toISOString(),
        max_attempts: settings.retryAttempts,
      })
      .select('id')
      .single();

    if (error) throw error;

    await logAutomationAction(supabase, request.orderId || null, 'notification_queued', {
      notificationType: request.type,
      recipientEmail: request.recipientEmail,
      scheduledFor: scheduledFor.toISOString(),
    });

    return { success: true, data: { notificationId: data.id } };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Process pending notifications in the queue
 */
export async function processNotificationQueue(): Promise<
  OperationResult<{ processed: number; sent: number; failed: number }>
> {
  const supabase = getServiceSupabase();

  try {
    const settings = await getNotificationSettings();

    if (!settings.enabled) {
      return {
        success: true,
        data: { processed: 0, sent: 0, failed: 0 },
      };
    }

    // Fetch pending notifications
    const { data: notificationsData, error } = await supabase
      .from('notification_queue')
      .select('*')
      .eq('status', 'pending')
      .lte('scheduled_for', new Date().toISOString())
      .order('priority', { ascending: false })
      .order('scheduled_for', { ascending: true })
      .limit(settings.batchSize);

    const notifications = notificationsData as NotificationQueueRecord[] | null;

    if (error) throw error;

    if (!notifications || notifications.length === 0) {
      return { success: true, data: { processed: 0, sent: 0, failed: 0 } };
    }

    let sent = 0;
    let failed = 0;

    for (const notification of notifications) {
      // Mark as sending
      await supabase
        .from('notification_queue')
        .update({ status: 'sending' })
        .eq('id', notification.id);

      // Send the notification
      const result = await sendNotification(notification);

      if (result.success) {
        await supabase
          .from('notification_queue')
          .update({
            status: 'sent',
            external_id: result.externalId,
            sent_at: new Date().toISOString(),
          })
          .eq('id', notification.id);

        await logAutomationAction(supabase, notification.order_id, 'notification_sent', {
          notificationType: notification.notification_type,
          recipientEmail: notification.recipient_email,
          externalId: result.externalId,
        });

        sent++;
      } else {
        const newAttempts = notification.attempts + 1;
        const shouldRetry = newAttempts < notification.max_attempts;

        await supabase
          .from('notification_queue')
          .update({
            status: shouldRetry ? 'pending' : 'failed',
            attempts: newAttempts,
            last_error: result.error,
            // Exponential backoff for retry
            scheduled_for: shouldRetry
              ? new Date(Date.now() + Math.pow(2, newAttempts) * 60000).toISOString()
              : notification.scheduled_for,
          })
          .eq('id', notification.id);

        if (!shouldRetry) {
          await logAutomationAction(supabase, notification.order_id, 'notification_failed', {
            notificationType: notification.notification_type,
            recipientEmail: notification.recipient_email,
            error: result.error,
            attempts: newAttempts,
          });
          failed++;
        }
      }
    }

    return {
      success: true,
      data: { processed: notifications.length, sent, failed },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Send a single notification
 */
async function sendNotification(
  notification: NotificationQueueRecord
): Promise<SendNotificationResult> {
  try {
    const emailComponent = buildEmailComponent(
      notification.notification_type,
      notification.template_data
    );

    if (!emailComponent) {
      return {
        success: false,
        notificationId: notification.id,
        error: `Unknown notification type: ${notification.notification_type}`,
      };
    }

    const result = await sendEmail({
      to: notification.recipient_email,
      subject: notification.subject,
      react: emailComponent,
    });

    if (result.success) {
      const emailData = result.data as { id?: string } | null;
      return {
        success: true,
        notificationId: notification.id,
        externalId: emailData?.id,
      };
    } else {
      return {
        success: false,
        notificationId: notification.id,
        error: result.error instanceof Error ? result.error.message : String(result.error),
      };
    }
  } catch (error) {
    return {
      success: false,
      notificationId: notification.id,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// ============================================================================
// EMAIL BUILDERS
// ============================================================================

/**
 * Build the appropriate email component for the notification type
 */
function buildEmailComponent(
  type: NotificationType,
  data: Record<string, unknown>
): React.ReactElement | null {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://motiongranted.com';

  switch (type) {
    case 'order_confirmation':
    case 'payment_received':
      return React.createElement(OrderConfirmationEmail, {
        orderNumber: (data.orderNumber as string) || '',
        motionType: (data.motionType as string) || '',
        caseCaption: (data.caseCaption as string) || '',
        turnaround: formatTurnaround(data.turnaround as string),
        expectedDelivery: formatDate(data.expectedDelivery as string),
        totalPrice: formatCurrency(data.totalPrice as number),
        portalUrl: `${baseUrl}/dashboard`,
      });

    case 'draft_ready':
    case 'revision_ready':
      return React.createElement(DraftReadyEmail, {
        orderNumber: (data.orderNumber as string) || '',
        motionType: (data.motionType as string) || '',
        caseCaption: (data.caseCaption as string) || '',
        deliveredDate: formatDate(new Date()),
        portalUrl: `${baseUrl}/dashboard`,
        orderUrl: `${baseUrl}/orders/${data.orderId}`,
      });

    case 'deadline_reminder':
    case 'deadline_warning':
    case 'deadline_critical':
      return buildDeadlineEmail(type, data, baseUrl);

    case 'status_update':
      return buildStatusUpdateEmail(data, baseUrl);

    case 'conflict_cleared':
    case 'order_assigned':
    case 'work_started':
      return buildProgressEmail(type, data, baseUrl);

    case 'order_completed':
    case 'feedback_request':
      return buildCompletionEmail(type, data, baseUrl);

    case 'revision_requested':
      return buildRevisionEmail(data, baseUrl);

    // v6.3: Checkpoint notifications
    case 'checkpoint_cp1':
    case 'checkpoint_cp2':
    case 'checkpoint_cp3':
      return buildCheckpointEmail(type, data, baseUrl);

    case 'revision_payment_required':
      return buildRevisionPaymentEmail(data, baseUrl);

    default:
      log.warn(`[Notifications] No email template for type: ${type}`);
      return null;
  }
}

// Email builders using dedicated templates
function buildDeadlineEmail(
  type: NotificationType,
  data: Record<string, unknown>,
  baseUrl: string
): React.ReactElement {
  const urgencyMap: Record<string, 'critical' | 'warning' | 'reminder'> = {
    deadline_critical: 'critical',
    deadline_warning: 'warning',
    deadline_reminder: 'reminder',
  };

  return React.createElement(DeadlineReminderEmail, {
    orderNumber: (data.orderNumber as string) || '',
    motionType: (data.motionType as string) || '',
    caseCaption: (data.caseCaption as string) || '',
    deadline: formatDate(data.filingDeadline as string),
    daysRemaining: (data.daysUntilDeadline as number) || 0,
    urgency: urgencyMap[type] || 'reminder',
    portalUrl: `${baseUrl}/dashboard`,
    orderUrl: `${baseUrl}/orders/${data.orderId}`,
  });
}

function buildStatusUpdateEmail(
  data: Record<string, unknown>,
  baseUrl: string
): React.ReactElement {
  return React.createElement(StatusUpdateEmail, {
    orderNumber: (data.orderNumber as string) || '',
    motionType: (data.motionType as string) || '',
    caseCaption: (data.caseCaption as string) || '',
    previousStatus: formatStatus((data.previousStatus as string) || 'unknown'),
    newStatus: formatStatus((data.newStatus as string) || 'unknown'),
    statusMessage: (data.statusMessage as string) || getStatusMessage(data.newStatus as string),
    portalUrl: `${baseUrl}/dashboard`,
    orderUrl: `${baseUrl}/orders/${data.orderId}`,
  });
}

function buildProgressEmail(
  type: NotificationType,
  data: Record<string, unknown>,
  baseUrl: string
): React.ReactElement {
  const milestoneMap: Record<string, 'conflict_cleared' | 'assigned' | 'work_started' | 'review' | 'qa_passed'> = {
    conflict_cleared: 'conflict_cleared',
    order_assigned: 'assigned',
    work_started: 'work_started',
  };

  return React.createElement(ProgressUpdateEmail, {
    orderNumber: (data.orderNumber as string) || '',
    motionType: (data.motionType as string) || '',
    caseCaption: (data.caseCaption as string) || '',
    milestone: milestoneMap[type] || 'assigned',
    clerkName: (data.clerkName as string) || undefined,
    estimatedCompletion: data.expectedDelivery ? formatDate(data.expectedDelivery as string) : undefined,
    portalUrl: `${baseUrl}/dashboard`,
    orderUrl: `${baseUrl}/orders/${data.orderId}`,
  });
}

function buildCompletionEmail(
  type: NotificationType,
  data: Record<string, unknown>,
  baseUrl: string
): React.ReactElement {
  return React.createElement(OrderCompletedEmail, {
    orderNumber: (data.orderNumber as string) || '',
    motionType: (data.motionType as string) || '',
    caseCaption: (data.caseCaption as string) || '',
    completedDate: formatDate(data.completedDate as string || new Date()),
    turnaround: formatTurnaround((data.turnaround as string) || ''),
    feedbackUrl: `${baseUrl}/feedback/${data.orderId}`,
    portalUrl: `${baseUrl}/dashboard`,
    orderUrl: `${baseUrl}/orders/${data.orderId}`,
  });
}

function buildRevisionEmail(
  data: Record<string, unknown>,
  baseUrl: string
): React.ReactElement {
  return React.createElement(RevisionRequestEmail, {
    orderNumber: (data.orderNumber as string) || '',
    motionType: (data.motionType as string) || '',
    caseCaption: (data.caseCaption as string) || '',
    requestedBy: (data.clientName as string) || 'Client',
    revisionDetails: (data.revisionDetails as string) || 'Revision requested',
    estimatedCompletion: data.expectedCompletion ? formatDate(data.expectedCompletion as string) : undefined,
    portalUrl: `${baseUrl}/dashboard`,
    orderUrl: `${baseUrl}/orders/${data.orderId}`,
  });
}

/**
 * v6.3: Build checkpoint notification email
 */
function buildCheckpointEmail(
  type: NotificationType,
  data: Record<string, unknown>,
  baseUrl: string
): React.ReactElement {
  const checkpointMap: Record<string, 'CP1' | 'CP2' | 'CP3'> = {
    checkpoint_cp1: 'CP1',
    checkpoint_cp2: 'CP2',
    checkpoint_cp3: 'CP3',
  };

  return React.createElement(CheckpointNotificationEmail, {
    orderNumber: (data.orderNumber as string) || '',
    motionType: (data.motionType as string) || '',
    caseCaption: (data.caseCaption as string) || '',
    checkpoint: checkpointMap[type] || 'CP1',
    grade: data.grade as string | undefined,
    gradeNumeric: data.gradeNumeric as number | undefined,
    passed: data.passed as boolean | undefined,
    portalUrl: `${baseUrl}/dashboard`,
    orderUrl: `${baseUrl}/orders/${data.orderId}`,
  });
}

/**
 * v6.3: Build revision payment required email
 */
function buildRevisionPaymentEmail(
  data: Record<string, unknown>,
  baseUrl: string
): React.ReactElement {
  return React.createElement(RevisionPaymentRequiredEmail, {
    orderNumber: (data.orderNumber as string) || '',
    motionType: (data.motionType as string) || '',
    caseCaption: (data.caseCaption as string) || '',
    revisionNumber: (data.revisionNumber as number) || 2,
    tier: (data.tier as 'A' | 'B' | 'C' | 'D') || 'B',
    amount: (data.amount as number) || 125,
    paymentUrl: (data.paymentUrl as string) || `${baseUrl}/checkout/revision/${data.revisionId}`,
    portalUrl: `${baseUrl}/dashboard`,
  });
}

/**
 * Get status message for display
 */
function getStatusMessage(status: string): string {
  const messages: Record<string, string> = {
    submitted: 'Your order has been submitted and is awaiting review.',
    under_review: 'Your order is being reviewed by our team.',
    assigned: 'A qualified law clerk has been assigned to your order.',
    in_progress: 'Work has begun on your motion draft.',
    draft_delivered: 'Your draft has been delivered and is ready for review.',
    revision_requested: 'Your revision request has been received.',
    revision_delivered: 'Your revised draft has been delivered.',
    completed: 'Your order has been marked as complete.',
    on_hold: 'Your order is currently on hold. We will contact you shortly.',
    cancelled: 'Your order has been cancelled.',
  };
  return messages[status] || 'Your order status has been updated.';
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Queue order-related notification with auto-fetched data
 */
export async function queueOrderNotification(
  orderId: string,
  type: NotificationType,
  additionalData?: Record<string, unknown>
): Promise<OperationResult<{ notificationId: string }>> {
  const supabase = getServiceSupabase();

  try {
    // Fetch order with client info
    const { data: order, error } = await supabase
      .from('orders')
      .select(`
        *,
        profiles:client_id (
          id,
          email,
          full_name
        )
      `)
      .eq('id', orderId)
      .single();

    if (error || !order) {
      return { success: false, error: 'Order not found' };
    }

    const profile = order.profiles as { id: string; email: string; full_name: string } | null;

    if (!profile?.email) {
      return { success: false, error: 'Client email not found' };
    }

    return queueNotification({
      type,
      recipientId: profile.id,
      recipientEmail: profile.email,
      orderId,
      subject: getSubjectForType(type, order.order_number),
      templateData: {
        orderId,
        orderNumber: order.order_number,
        motionType: order.motion_type,
        caseCaption: order.case_caption,
        turnaround: order.turnaround,
        expectedDelivery: order.expected_delivery,
        totalPrice: order.total_price,
        filingDeadline: order.filing_deadline,
        status: order.status,
        clientName: profile.full_name,
        ...additionalData,
      },
    });
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Check if notification type is high priority (skip quiet hours)
 */
function isHighPriority(type: NotificationType): boolean {
  const highPriorityTypes: NotificationType[] = [
    'deadline_critical',
    'payment_failed',
    'approval_needed',
    // v6.3: Checkpoint notifications are high priority (customer action required)
    'checkpoint_cp1',
    'checkpoint_cp2',
    'checkpoint_cp3',
    'revision_payment_required',
  ];
  return highPriorityTypes.includes(type);
}

/**
 * Get default priority for notification type
 */
function getPriorityForType(type: NotificationType): number {
  const priorities: Partial<Record<NotificationType, number>> = {
    deadline_critical: 10,
    payment_failed: 9,
    approval_needed: 8,
    // v6.3: Checkpoint notifications require customer action
    checkpoint_cp1: 8,
    checkpoint_cp2: 8,
    checkpoint_cp3: 8,
    revision_payment_required: 8,
    deadline_warning: 7,
    draft_ready: 6,
    revision_ready: 6,
    payment_received: 5,
    order_confirmation: 5,
    deadline_reminder: 4,
    status_update: 3,
    feedback_request: 2,
    welcome_email: 1,
  };
  return priorities[type] || 5;
}

/**
 * Get email subject for notification type
 */
function getSubjectForType(type: NotificationType, orderNumber: string): string {
  const subjects: Partial<Record<NotificationType, string>> = {
    order_confirmation: `Order Confirmed - ${orderNumber}`,
    payment_received: `Payment Received - ${orderNumber}`,
    payment_failed: `Payment Failed - ${orderNumber}`,
    conflict_cleared: `Conflict Review Complete - ${orderNumber}`,
    order_assigned: `Order Assigned - ${orderNumber}`,
    work_started: `Work Started - ${orderNumber}`,
    draft_ready: `Your Draft is Ready - ${orderNumber}`,
    revision_ready: `Revision Complete - ${orderNumber}`,
    deadline_reminder: `Deadline Reminder - ${orderNumber}`,
    deadline_warning: `Deadline Warning - ${orderNumber}`,
    deadline_critical: `URGENT: Deadline Approaching - ${orderNumber}`,
    order_completed: `Order Complete - ${orderNumber}`,
    feedback_request: `How was your experience? - ${orderNumber}`,
    status_update: `Status Update - ${orderNumber}`,
    approval_needed: `Action Required - ${orderNumber}`,
    revision_requested: `Revision Request Received - ${orderNumber}`,
    // v6.3: Checkpoint notifications
    checkpoint_cp1: `Action Required: Research Review - ${orderNumber}`,
    checkpoint_cp2: `Action Required: Draft Review - ${orderNumber}`,
    checkpoint_cp3: `Your Filing Package is Ready - ${orderNumber}`,
    revision_payment_required: `Payment Required for Revision - ${orderNumber}`,
  };
  return subjects[type] || `Motion Granted Update - ${orderNumber}`;
}

/**
 * Adjust scheduled time for quiet hours
 */
function adjustForQuietHours(
  scheduledTime: Date,
  quietHours: { start: string; end: string; timezone: string }
): Date {
  // Simple implementation - in production, use a proper timezone library
  const hour = scheduledTime.getHours();
  const startHour = parseInt(quietHours.start.split(':')[0]);
  const endHour = parseInt(quietHours.end.split(':')[0]);

  // Check if current time is in quiet hours
  if (startHour > endHour) {
    // Quiet hours span midnight (e.g., 22:00 - 07:00)
    if (hour >= startHour || hour < endHour) {
      // Push to end of quiet hours
      const adjusted = new Date(scheduledTime);
      if (hour >= startHour) {
        adjusted.setDate(adjusted.getDate() + 1);
      }
      adjusted.setHours(endHour, 0, 0, 0);
      return adjusted;
    }
  } else {
    // Quiet hours within same day (e.g., 02:00 - 07:00)
    if (hour >= startHour && hour < endHour) {
      const adjusted = new Date(scheduledTime);
      adjusted.setHours(endHour, 0, 0, 0);
      return adjusted;
    }
  }

  return scheduledTime;
}

/**
 * Format turnaround option for display
 */
function formatTurnaround(turnaround: string): string {
  const formats: Record<string, string> = {
    standard: 'Standard (5-7 business days)',
    rush_72: 'Rush (72 hours)',
    rush_48: 'Rush (48 hours)',
  };
  return formats[turnaround] || turnaround;
}

/**
 * Format status for display
 */
function formatStatus(status: string): string {
  const formats: Record<string, string> = {
    submitted: 'Submitted',
    under_review: 'Under Review',
    assigned: 'Assigned to Clerk',
    in_progress: 'In Progress',
    draft_delivered: 'Draft Delivered',
    revision_requested: 'Revision Requested',
    revision_delivered: 'Revision Delivered',
    completed: 'Completed',
    on_hold: 'On Hold',
    cancelled: 'Cancelled',
  };
  return formats[status] || status;
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
 * Cancel a pending notification
 */
export async function cancelNotification(notificationId: string): Promise<OperationResult> {
  const supabase = getServiceSupabase();

  try {
    const { error } = await supabase
      .from('notification_queue')
      .update({ status: 'cancelled' })
      .eq('id', notificationId)
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
 * Get notification queue status
 */
export async function getNotificationQueueStatus(): Promise<
  OperationResult<{
    pending: number;
    sending: number;
    sent: number;
    failed: number;
  }>
> {
  const supabase = getServiceSupabase();

  try {
    const { data, error } = await supabase
      .from('notification_queue')
      .select('status')
      .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

    if (error) throw error;

    const counts = {
      pending: 0,
      sending: 0,
      sent: 0,
      failed: 0,
    };

    for (const item of data || []) {
      if (item.status in counts) {
        counts[item.status as keyof typeof counts]++;
      }
    }

    return { success: true, data: counts };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
