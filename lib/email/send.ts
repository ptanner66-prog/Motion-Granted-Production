/**
 * Unified Email Interface — MB-02
 *
 * Single entry point for all email operations in the workflow.
 * Re-exports the core send functions and adds admin alert helper.
 *
 * Usage:
 *   import { sendEmail, sendAdminAlert } from '@/lib/email/send';
 *
 * CRITICAL: These functions NEVER throw. Email failure = log + continue.
 */

import { sendEmail, sendEmailAsync, type EmailResult, type EmailOptions } from './email-service';
import { ADMIN_EMAIL, ALERT_EMAIL, EMAIL_FROM } from '@/lib/config/notifications';

// Re-export core send functions
export { sendEmail, sendEmailAsync, type EmailResult, type EmailOptions };

// Re-export all trigger functions
export {
  sendOrderConfirmation,
  sendHoldNotification,
  sendCP3ReviewNotification,
  sendPaymentConfirmation,
  sendRevisionNotification,
  sendDeliveryNotification,
} from './email-triggers';

/**
 * Send an admin alert email. Never throws.
 *
 * @param subject - Alert subject line
 * @param body - Plain-text alert body (will be wrapped in HTML)
 * @param orderId - Optional order ID for correlation
 */
export async function sendAdminAlert(
  subject: string,
  body: string,
  orderId?: string
): Promise<EmailResult> {
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #cc0000;">Admin Alert</h2>
      <pre style="background: #f5f5f5; padding: 16px; border-radius: 8px; white-space: pre-wrap; font-family: monospace; font-size: 13px;">${escapeHtml(body)}</pre>
      ${orderId ? `<p><a href="${process.env.NEXT_PUBLIC_APP_URL || 'https://motion-granted.com'}/admin/orders/${orderId}">View in Admin Dashboard</a></p>` : ''}
    </div>
  `;

  return sendEmail(
    [ADMIN_EMAIL, ALERT_EMAIL].filter(Boolean),
    `[MG Alert] ${subject}`,
    html,
    { orderId }
  );
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
