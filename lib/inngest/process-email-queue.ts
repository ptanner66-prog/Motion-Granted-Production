/**
 * Email Queue Consumer — Inngest Cron Function
 *
 * Reads pending rows from `email_queue` and sends them via Resend.
 * Runs every 60 seconds with concurrency limit of 1 to prevent duplicate sends.
 *
 * Schema (email_queue):
 *   id         UUID PK
 *   order_id   UUID (nullable — FK to orders)
 *   template   TEXT (template identifier, e.g. 'hold_initial_notification')
 *   to_email   TEXT (nullable — direct recipient for non-order emails)
 *   data       JSONB (template-specific payload)
 *   status     TEXT ('pending' | 'sent' | 'failed')
 *   sent_at    TIMESTAMPTZ
 *   error      TEXT
 *   created_at TIMESTAMPTZ
 *
 * Recipient resolution:
 *   1. If `to_email` is set → use it directly (e.g. account_locked)
 *   2. If `data.attorneyEmail` is set → use it (CP3 emails include recipient)
 *   3. If `order_id` is set → look up order → client profile → email
 *   4. Fall back to ADMIN_EMAIL for admin-alert templates
 *
 * Blueprint: lib/automation/notification-sender.ts:205 (processNotificationQueue)
 *
 * @module lib/inngest/process-email-queue
 */

import { inngest } from '@/lib/inngest/client';
import { getServiceSupabase } from '@/lib/supabase/admin';
import { sendEmail } from '@/lib/resend';
import { createLogger } from '@/lib/security/logger';
import React from 'react';

const log = createLogger('email-queue-consumer');

/** Maximum retry attempts before marking a row as permanently failed. */
const MAX_RETRIES = 3;

/** Batch size per cron tick — keeps each run short for Vercel's 300s limit. */
const BATCH_SIZE = 10;

/** Admin fallback recipient for admin-alert and system emails. */
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@motion-granted.com';

// ============================================================================
// TEMPLATE → SUBJECT MAPPING
// ============================================================================

/**
 * Maps email_queue template identifiers to human-readable subjects.
 * Order number is appended when available.
 */
function getSubjectForTemplate(template: string, orderNumber?: string): string {
  const suffix = orderNumber ? ` — ${orderNumber}` : '';

  const subjects: Record<string, string> = {
    // HOLD subsystem
    'hold_initial_notification': `Your Order is On Hold${suffix}`,
    'hold_reminder_24h': `Reminder: Your Order is Still On Hold${suffix}`,
    'hold_escalation_72h': `Urgent: Order On Hold for 72 Hours${suffix}`,
    'hold_auto_refund': `Order Cancelled & Refund Issued${suffix}`,

    // CP3 lifecycle
    'cp3-package-ready': `Your Filing Package is Ready${suffix}`,
    'cp3-rework-confirmation': `Revision Request Received${suffix}`,
    'cp3-cancellation-cp3_cancel': `Order Cancelled${suffix}`,
    'cp3-cancellation-cp3_timeout_cancel': `Order Auto-Cancelled (No Response)${suffix}`,
    'cp3-reminder-48h': `Reminder: Review Your Filing Package${suffix}`,
    'cp3-reminder-7d': `Reminder: Filing Package Awaiting Your Review${suffix}`,
    'cp3-reminder-14d': `Final Reminder: Filing Package Expires Soon${suffix}`,
    'cp3-final-notice': `Final Notice: Filing Package Will Expire${suffix}`,

    // Tier upgrade
    'tier_upgrade_required': `Action Required: Tier Upgrade Needed${suffix}`,

    // Admin alerts
    'admin-alert': `[Admin Alert] Action Required${suffix}`,

    // Account security
    'account_locked': 'Your Account Has Been Temporarily Locked',

    // Reconciliation
    'reconciliation-alert': `[Admin] Reconciliation Alert${suffix}`,
  };

  return subjects[template] || `Motion Granted Notification${suffix}`;
}

// ============================================================================
// EMAIL BODY BUILDER
// ============================================================================

/**
 * Builds a plain-text email body from template ID and data payload.
 * Uses simple text formatting — React Email templates are used by the
 * notification_queue system for richer emails.
 *
 * @param template - Template identifier string
 * @param data - JSONB payload from email_queue row
 * @param orderNumber - Order number for context (may be undefined)
 * @returns Plain text email body
 */
function buildEmailBody(
  template: string,
  data: Record<string, unknown>,
  orderNumber?: string
): string {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://motion-granted.com';
  const orderId = data.orderId as string | undefined;
  const orderUrl = orderId ? `${baseUrl}/orders/${orderId}` : `${baseUrl}/dashboard`;
  const adminUrl = orderId ? `${baseUrl}/admin/orders/${orderId}` : `${baseUrl}/admin`;

  switch (template) {
    case 'hold_initial_notification':
      return [
        `Your order${orderNumber ? ` (${orderNumber})` : ''} has been placed on hold.`,
        '',
        `Reason: ${data.reason || 'Additional information is needed to proceed.'}`,
        '',
        'Our team has identified that additional information or documentation may be needed to produce the highest quality motion for your case.',
        '',
        `Please log in to your portal to review: ${orderUrl}`,
        '',
        'If you have questions, reply to this email or contact support@motion-granted.com.',
        '',
        '— Motion Granted',
      ].join('\n');

    case 'hold_reminder_24h':
      return [
        `This is a reminder that your order${orderNumber ? ` (${orderNumber})` : ''} is still on hold.`,
        '',
        `Reason: ${data.holdReason || data.reason || 'Additional information needed.'}`,
        '',
        'Please provide the requested information at your earliest convenience to avoid delays.',
        '',
        `Review your order: ${orderUrl}`,
        '',
        '— Motion Granted',
      ].join('\n');

    case 'hold_escalation_72h':
      return [
        `URGENT: Your order${orderNumber ? ` (${orderNumber})` : ''} has been on hold for 72 hours.`,
        '',
        'If we do not receive the requested information within the next 4 days, the order may be automatically cancelled and a refund issued.',
        '',
        `Please take action now: ${orderUrl}`,
        '',
        '— Motion Granted',
      ].join('\n');

    case 'hold_auto_refund':
      return [
        `Your order${orderNumber ? ` (${orderNumber})` : ''} has been cancelled due to the hold period expiring.`,
        '',
        'A full refund has been issued to your original payment method. Please allow 5-10 business days for the refund to appear.',
        '',
        `If you would like to resubmit your order with the required information, visit: ${baseUrl}/orders/new`,
        '',
        '— Motion Granted',
      ].join('\n');

    case 'cp3-package-ready':
      return [
        `Great news! Your filing package for ${data.motionType || 'your motion'}${orderNumber ? ` (${orderNumber})` : ''} is ready for review.`,
        '',
        'Please log in to review the draft, request changes, or approve for final delivery.',
        '',
        `Review your package: ${orderUrl}`,
        '',
        '— Motion Granted',
      ].join('\n');

    case 'cp3-rework-confirmation':
      return [
        `We've received your revision request for order${orderNumber ? ` ${orderNumber}` : ''}.`,
        '',
        'Our team is working on the requested changes. You will be notified when the revised draft is ready.',
        '',
        `Track progress: ${orderUrl}`,
        '',
        '— Motion Granted',
      ].join('\n');

    case 'cp3-cancellation-cp3_cancel':
    case 'cp3-cancellation-cp3_timeout_cancel':
      return [
        `Your order${orderNumber ? ` (${orderNumber})` : ''} has been cancelled.`,
        '',
        template.includes('timeout')
          ? 'The order was automatically cancelled because no response was received within the review period.'
          : 'The order was cancelled per your request.',
        '',
        'If a refund is applicable, it will be processed to your original payment method.',
        '',
        `Questions? Contact support@motion-granted.com`,
        '',
        '— Motion Granted',
      ].join('\n');

    case 'cp3-reminder-48h':
    case 'cp3-reminder-7d':
    case 'cp3-reminder-14d':
      return [
        `Reminder: Your filing package for${orderNumber ? ` order ${orderNumber}` : ' your order'} is awaiting your review.`,
        '',
        'Please log in to approve the draft, request changes, or contact us with questions.',
        '',
        `Review now: ${orderUrl}`,
        '',
        '— Motion Granted',
      ].join('\n');

    case 'cp3-final-notice': {
      const expiryDate = data.expiryDate ? new Date(data.expiryDate as string).toLocaleDateString() : 'soon';
      return [
        `FINAL NOTICE: Your filing package for${orderNumber ? ` order ${orderNumber}` : ' your order'} will expire on ${expiryDate}.`,
        '',
        'If no action is taken, the order will be automatically cancelled.',
        '',
        `Take action now: ${orderUrl}`,
        '',
        '— Motion Granted',
      ].join('\n');
    }

    case 'tier_upgrade_required':
      return [
        `Your order${orderNumber ? ` (${orderNumber})` : ''} requires a tier upgrade to continue processing.`,
        '',
        `Original tier: ${data.originalTier || 'N/A'}`,
        `Suggested tier: ${data.suggestedTier || 'N/A'}`,
        '',
        'The complexity of your case requires a higher service tier for the best results.',
        '',
        `Please review and approve the upgrade: ${orderUrl}`,
        '',
        '— Motion Granted',
      ].join('\n');

    case 'admin-alert':
      return [
        `[Admin Alert] ${data.alertType || 'System Alert'}`,
        '',
        `${data.message || 'An automated alert was triggered that requires admin attention.'}`,
        '',
        `Admin dashboard: ${adminUrl}`,
        '',
        '— Motion Granted System',
      ].join('\n');

    case 'account_locked':
      return [
        'Your Motion Granted account has been temporarily locked due to multiple failed login attempts.',
        '',
        `The lockout will expire in ${data.lockout_duration_minutes || 30} minutes.`,
        '',
        `If you need immediate access, contact ${data.support_email || 'support@motion-granted.com'}.`,
        '',
        '— Motion Granted Security',
      ].join('\n');

    default:
      return [
        `You have a new notification from Motion Granted${orderNumber ? ` regarding order ${orderNumber}` : ''}.`,
        '',
        `Template: ${template}`,
        data && Object.keys(data).length > 0 ? `Details: ${JSON.stringify(data, null, 2)}` : '',
        '',
        `View your dashboard: ${baseUrl}/dashboard`,
        '',
        '— Motion Granted',
      ].join('\n');
  }
}

// ============================================================================
// RECIPIENT RESOLUTION
// ============================================================================

/**
 * Resolves the email recipient for a queue row.
 *
 * Priority:
 *   1. `to_email` column (direct recipient, e.g. account_locked)
 *   2. `data.attorneyEmail` (CP3 emails embed the recipient)
 *   3. Order lookup → client profile → email
 *   4. ADMIN_EMAIL fallback for admin-alert templates
 *
 * @throws Error if no recipient can be determined
 */
async function resolveRecipient(
  row: EmailQueueRow,
  supabase: ReturnType<typeof getServiceSupabase>
): Promise<string> {
  // 1. Direct to_email column
  if (row.to_email) {
    return row.to_email;
  }

  // 2. Embedded in data payload (CP3 emails)
  const data = (row.data || {}) as Record<string, unknown>;
  if (typeof data.attorneyEmail === 'string' && data.attorneyEmail.includes('@')) {
    return data.attorneyEmail;
  }

  // 3. Look up from order → client profile
  if (row.order_id) {
    const { data: order } = await supabase
      .from('orders')
      .select('client_id, profiles!orders_client_id_fkey(email)')
      .eq('id', row.order_id)
      .single();

    const profile = order?.profiles as { email?: string } | null;
    if (profile?.email) {
      return profile.email;
    }
  }

  // 4. Admin-alert templates → admin email
  if (row.template === 'admin-alert' || row.template === 'reconciliation-alert') {
    return ADMIN_EMAIL;
  }

  throw new Error(`Cannot resolve recipient for email_queue row ${row.id} (template: ${row.template})`);
}

/**
 * Fetches the order number for a given order ID (for email subjects).
 */
async function getOrderNumber(
  orderId: string | null,
  supabase: ReturnType<typeof getServiceSupabase>
): Promise<string | undefined> {
  if (!orderId) return undefined;

  const { data } = await supabase
    .from('orders')
    .select('order_number')
    .eq('id', orderId)
    .single();

  return data?.order_number || undefined;
}

// ============================================================================
// ROW TYPE
// ============================================================================

interface EmailQueueRow {
  id: string;
  order_id: string | null;
  template: string;
  to_email: string | null;
  data: Record<string, unknown> | null;
  status: string;
  sent_at: string | null;
  error: string | null;
  created_at: string;
  /** Tracks retry attempts. Column may not exist in older schemas — default 0. */
  retry_count?: number;
}

// ============================================================================
// INNGEST CRON FUNCTION
// ============================================================================

/**
 * Inngest cron function: processes pending email_queue rows every 60 seconds.
 *
 * - Fetches up to BATCH_SIZE pending rows ordered by created_at ASC
 * - Resolves recipient for each row
 * - Sends via Resend (plain text)
 * - Updates status to 'sent' on success or 'failed' after MAX_RETRIES
 * - Concurrency limit 1 prevents duplicate processing
 */
export const processEmailQueue = inngest.createFunction(
  {
    id: 'process-email-queue',
    concurrency: { limit: 1 },
  },
  { cron: '*/1 * * * *' },
  async ({ step }: { step: { run: <T>(name: string, fn: () => Promise<T>) => Promise<T> } }) => {
    const result = await step.run('process-pending-emails', async () => {
      const supabase = getServiceSupabase();

      // Fetch pending emails
      const { data: pendingEmails, error: fetchError } = await supabase
        .from('email_queue')
        .select('*')
        .eq('status', 'pending')
        .order('created_at', { ascending: true })
        .limit(BATCH_SIZE);

      if (fetchError) {
        log.error('[email-queue] Failed to fetch pending emails:', fetchError);
        return { processed: 0, sent: 0, failed: 0, error: fetchError.message };
      }

      if (!pendingEmails || pendingEmails.length === 0) {
        return { processed: 0, sent: 0, failed: 0 };
      }

      let sent = 0;
      let failed = 0;

      for (const rawRow of pendingEmails) {
        const row = rawRow as EmailQueueRow;
        const data = (row.data || {}) as Record<string, unknown>;

        try {
          // Resolve recipient
          const recipient = await resolveRecipient(row, supabase);

          // Get order number for subject
          const orderNumber = await getOrderNumber(row.order_id, supabase);

          // Build subject and body
          const subject = getSubjectForTemplate(row.template, orderNumber);
          const body = buildEmailBody(row.template, { ...data, orderId: row.order_id }, orderNumber);

          // Send via Resend using the shared sendEmail helper.
          // sendEmail expects a React element; we create a minimal text wrapper.
          const emailResult = await sendEmail({
            to: recipient,
            subject,
            react: React.createElement('div', {
              style: { fontFamily: 'Georgia, serif', fontSize: '15px', lineHeight: '1.6', color: '#333' },
            }, body.split('\n').map((line, i) =>
              React.createElement('p', { key: i, style: { margin: '0 0 8px 0' } }, line || '\u00A0')
            )),
          });

          if (emailResult.success) {
            const emailData = emailResult.data as { id?: string } | null;
            await supabase
              .from('email_queue')
              .update({
                status: 'sent',
                sent_at: new Date().toISOString(),
                error: null,
              })
              .eq('id', row.id);

            log.info(`[email-queue] Sent ${row.template} to ${recipient}`, {
              emailId: emailData?.id,
              orderId: row.order_id,
            });
            sent++;
          } else {
            throw new Error(
              emailResult.error instanceof Error
                ? emailResult.error.message
                : String(emailResult.error || 'Resend send failed')
            );
          }
        } catch (sendError) {
          const errorMessage = sendError instanceof Error ? sendError.message : 'Unknown error';
          const currentRetries = row.retry_count ?? 0;
          const newRetryCount = currentRetries + 1;
          const exhausted = newRetryCount >= MAX_RETRIES;

          await supabase
            .from('email_queue')
            .update({
              status: exhausted ? 'failed' : 'pending',
              error: errorMessage,
              // Only update retry_count if the column exists — graceful for older schema
              ...(row.retry_count !== undefined ? { retry_count: newRetryCount } : {}),
            })
            .eq('id', row.id);

          if (exhausted) {
            log.error(`[email-queue] Permanently failed after ${MAX_RETRIES} retries: ${row.template}`, {
              orderId: row.order_id,
              error: errorMessage,
            });
            failed++;
          } else {
            log.warn(`[email-queue] Retry ${newRetryCount}/${MAX_RETRIES} for ${row.template}: ${errorMessage}`, {
              orderId: row.order_id,
            });
          }
        }
      }

      return { processed: sent + failed, sent, failed };
    });

    return result;
  }
);
