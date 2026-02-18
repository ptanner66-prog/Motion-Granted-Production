/**
 * CP3 Reminder Emails — SP-21 Group 5
 *
 * Wired implementations for CP3 reminder emails.
 * Uses Resend via lib/email/client.ts with templates from
 * emails/cp3-reminder.tsx (48h/14d) and lib/email/templates/.
 *
 * Templates:
 * - emails/cp3-reminder.tsx (48h gentle nudge, 14d urgent final notice)
 * - emails/cp3-timeout-escalation.tsx (admin escalation)
 *
 * @module lib/email/cp3-reminders
 */

import { sendEmail } from './client';
import { getServiceSupabase } from '@/lib/supabase/admin';
import { createLogger } from '@/lib/security/logger';

const log = createLogger('email-cp3-reminders');

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://motion-granted.com';

/**
 * Fetch order + attorney profile for email context.
 */
async function getOrderContext(orderId: string) {
  const supabase = getServiceSupabase();
  const { data: order } = await supabase
    .from('orders')
    .select('id, order_number, motion_type, case_caption, client_id, status')
    .eq('id', orderId)
    .single();

  if (!order) {
    log.error('[CP3] Order not found for reminder', { orderId });
    return null;
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('email, display_name, full_name')
    .eq('id', order.client_id)
    .single();

  if (!profile?.email) {
    log.error('[CP3] No attorney email found', { orderId, clientId: order.client_id });
    return null;
  }

  return {
    order,
    attorneyEmail: profile.email,
    attorneyName: profile.display_name || profile.full_name || 'Counselor',
    dashboardUrl: `${BASE_URL}/dashboard/orders/${orderId}`,
  };
}

/**
 * Send 48-hour CP3 reminder email.
 * Gentle nudge — documents awaiting attorney review.
 */
export async function send48hReminder(orderId: string): Promise<void> {
  const ctx = await getOrderContext(orderId);
  if (!ctx) return;

  // Guard: don't send if order is no longer AWAITING_APPROVAL
  if (ctx.order.status !== 'AWAITING_APPROVAL') {
    log.info('[CP3] Skipping 48h reminder — order status changed', {
      orderId,
      status: ctx.order.status,
    });
    return;
  }

  const result = await sendEmail({
    to: ctx.attorneyEmail,
    subject: `Reminder: Your ${ctx.order.motion_type} is awaiting review — ${ctx.order.order_number}`,
    html: buildReminderHtml({
      type: '48h',
      orderNumber: ctx.order.order_number,
      motionType: ctx.order.motion_type,
      dashboardUrl: ctx.dashboardUrl,
      attorneyName: ctx.attorneyName,
    }),
    text: `Reminder: Your ${ctx.order.motion_type} (${ctx.order.order_number}) is ready for review. Visit ${ctx.dashboardUrl} to take action.`,
    idempotencyKey: `cp3-48h-${orderId}`,
    tags: [
      { name: 'order_id', value: orderId },
      { name: 'event_type', value: 'cp3_reminder_48h' },
    ],
  });

  if (result.success) {
    log.info('[CP3] 48h reminder sent', { orderId, to: ctx.attorneyEmail });
  } else {
    log.error('[CP3] 48h reminder failed', { orderId, error: result.error });
  }
}

/**
 * Send 72-hour CP3 reminder email.
 */
export async function send72hReminder(orderId: string): Promise<void> {
  const ctx = await getOrderContext(orderId);
  if (!ctx) return;

  if (ctx.order.status !== 'AWAITING_APPROVAL') {
    log.info('[CP3] Skipping 72h reminder — order status changed', {
      orderId,
      status: ctx.order.status,
    });
    return;
  }

  const result = await sendEmail({
    to: ctx.attorneyEmail,
    subject: `Reminder: Your ${ctx.order.motion_type} is awaiting review — ${ctx.order.order_number}`,
    html: buildReminderHtml({
      type: '72h',
      orderNumber: ctx.order.order_number,
      motionType: ctx.order.motion_type,
      dashboardUrl: ctx.dashboardUrl,
      attorneyName: ctx.attorneyName,
    }),
    text: `Reminder: Your ${ctx.order.motion_type} (${ctx.order.order_number}) is ready for review. Visit ${ctx.dashboardUrl} to take action.`,
    idempotencyKey: `cp3-72h-${orderId}`,
    tags: [
      { name: 'order_id', value: orderId },
      { name: 'event_type', value: 'cp3_reminder_72h' },
    ],
  });

  if (result.success) {
    log.info('[CP3] 72h reminder sent', { orderId, to: ctx.attorneyEmail });
  } else {
    log.error('[CP3] 72h reminder failed', { orderId, error: result.error });
  }
}

/**
 * Send 14-day final notice email.
 * URGENT — warns of automatic cancellation in 7 days with 50% refund.
 */
export async function sendFinalNotice(orderId: string): Promise<void> {
  const ctx = await getOrderContext(orderId);
  if (!ctx) return;

  if (ctx.order.status !== 'AWAITING_APPROVAL') {
    log.info('[CP3] Skipping final notice — order status changed', {
      orderId,
      status: ctx.order.status,
    });
    return;
  }

  const autoCancelDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const formattedDate = autoCancelDate.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const result = await sendEmail({
    to: ctx.attorneyEmail,
    subject: `FINAL NOTICE: Your ${ctx.order.motion_type} will be auto-cancelled — ${ctx.order.order_number}`,
    html: buildFinalNoticeHtml({
      orderNumber: ctx.order.order_number,
      motionType: ctx.order.motion_type,
      dashboardUrl: ctx.dashboardUrl,
      attorneyName: ctx.attorneyName,
      autoCancelDate: formattedDate,
    }),
    text: `FINAL NOTICE: Your ${ctx.order.motion_type} (${ctx.order.order_number}) will be automatically cancelled on ${formattedDate} if no action is taken. Visit ${ctx.dashboardUrl} immediately.`,
    idempotencyKey: `cp3-final-${orderId}`,
    tags: [
      { name: 'order_id', value: orderId },
      { name: 'event_type', value: 'cp3_final_notice' },
    ],
  });

  if (result.success) {
    log.info('[CP3] Final notice sent', { orderId, to: ctx.attorneyEmail });
  } else {
    log.error('[CP3] Final notice failed', { orderId, error: result.error });
  }
}

// ── HTML Builders (inline for Resend compatibility) ──

function buildReminderHtml(params: {
  type: '48h' | '72h';
  orderNumber: string;
  motionType: string;
  dashboardUrl: string;
  attorneyName: string;
}): string {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="background:#f8f7f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;margin:0;padding:20px">
<div style="background:#fff;max-width:600px;margin:0 auto;border-radius:12px;overflow:hidden;box-shadow:0 4px 12px rgba(0,0,0,.05)">
  <div style="background:#0f172a;padding:24px;text-align:center">
    <h1 style="color:#00d4aa;font-size:24px;margin:0">Motion Granted</h1>
  </div>
  <div style="background:#fef3c7;border-bottom:2px solid #fcd34d;padding:24px;text-align:center">
    <h2 style="color:#92400e;font-size:20px;margin:0 0 8px">Friendly Reminder</h2>
    <p style="color:#64748b;margin:0">Order ${params.orderNumber} requires your attention</p>
  </div>
  <div style="padding:24px">
    <p style="color:#333;font-size:16px">Dear ${params.attorneyName},</p>
    <p style="color:#555;font-size:14px;line-height:1.6">
      Just a reminder that your documents for order <strong>${params.orderNumber}</strong>
      (${params.motionType}) are ready for your review. Please take a moment to review
      and approve your documents so we can finalize delivery.
    </p>
    <div style="text-align:center;margin:24px 0">
      <a href="${params.dashboardUrl}" style="background:#00d4aa;color:#0f172a;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block">
        Review Your Documents
      </a>
    </div>
  </div>
  <hr style="border-color:#e2e8f0;margin:0">
  <div style="padding:24px;text-align:center">
    <p style="color:#64748b;font-size:14px;margin:0 0 12px">Questions? Contact <a href="mailto:support@motion-granted.com" style="color:#00d4aa">support@motion-granted.com</a></p>
    <p style="color:#94a3b8;font-size:12px;margin:0">Motion Granted is not a law firm. All work product requires attorney review before filing.</p>
  </div>
</div>
</body>
</html>`.trim();
}

function buildFinalNoticeHtml(params: {
  orderNumber: string;
  motionType: string;
  dashboardUrl: string;
  attorneyName: string;
  autoCancelDate: string;
}): string {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="background:#f8f7f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;margin:0;padding:20px">
<div style="background:#fff;max-width:600px;margin:0 auto;border-radius:12px;overflow:hidden;box-shadow:0 4px 12px rgba(0,0,0,.05)">
  <div style="background:#0f172a;padding:24px;text-align:center">
    <h1 style="color:#00d4aa;font-size:24px;margin:0">Motion Granted</h1>
  </div>
  <div style="background:#fef2f2;border-bottom:2px solid #dc3545;padding:24px;text-align:center">
    <h2 style="color:#991b1b;font-size:20px;margin:0 0 8px">FINAL NOTICE — Action Required Within 7 Days</h2>
    <p style="color:#64748b;margin:0">Order ${params.orderNumber} requires immediate action</p>
  </div>
  <div style="padding:24px">
    <p style="color:#333;font-size:16px">Dear ${params.attorneyName},</p>
    <p style="color:#555;font-size:14px;line-height:1.6">
      Your order <strong>${params.orderNumber}</strong> (${params.motionType}) has been
      awaiting your review for 14 days. This is your final notice before automatic cancellation.
    </p>
    <div style="background:#fff3cd;border:2px solid #ffc107;border-radius:8px;padding:16px;margin:16px 0">
      <p style="color:#856404;font-size:14px;line-height:1.6;margin:0">
        If no action is taken by <strong>${params.autoCancelDate}</strong>, your order will
        be automatically cancelled and a 50% refund will be issued to your original payment method.
      </p>
    </div>
    <h3 style="color:#333;font-size:15px;margin:16px 0 8px">Your Options:</h3>
    <p style="color:#555;font-size:14px;line-height:1.6">
      1. <strong>Approve</strong> — Accept the documents for delivery<br>
      2. <strong>Request Changes</strong> — Submit revision notes for rework<br>
      3. <strong>Cancel</strong> — Cancel the order and receive a 50% refund
    </p>
    <div style="text-align:center;margin:24px 0">
      <a href="${params.dashboardUrl}" style="background:#dc3545;color:#fff;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block">
        Take Action Now
      </a>
    </div>
  </div>
  <hr style="border-color:#e2e8f0;margin:0">
  <div style="padding:24px;text-align:center">
    <p style="color:#64748b;font-size:14px;margin:0 0 12px">Questions? Contact <a href="mailto:support@motion-granted.com" style="color:#00d4aa">support@motion-granted.com</a></p>
    <p style="color:#94a3b8;font-size:12px;margin:0">Motion Granted is not a law firm. All work product requires attorney review before filing.</p>
  </div>
</div>
</body>
</html>`.trim();
}
