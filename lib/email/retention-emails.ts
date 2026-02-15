// lib/email/retention-emails.ts
// Email templates for data retention
// Task 46 | Version 1.0 — January 28, 2026

import { Resend } from 'resend';

import { createLogger } from '@/lib/security/logger';

const log = createLogger('email-retention-emails');
let resendClient: Resend | null = null;

function getResend(): Resend {
  if (!resendClient) {
    resendClient = new Resend(process.env.RESEND_API_KEY);
  }
  return resendClient;
}

const FROM_EMAIL = process.env.EMAIL_FROM || 'Motion Granted <noreply@motiongranted.com>';
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://motiongranted.com';

interface DeletionReminderParams {
  to: string;
  userName: string;
  orderId: string;
  motionType: string;
  caseNumber: string;
  deletionDate: string;
}

/**
 * Format date for display
 */
function formatDate(isoDate: string): string {
  return new Date(isoDate).toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

/**
 * Send deletion reminder email
 */
export async function sendDeletionReminderEmail(params: DeletionReminderParams): Promise<void> {
  const formattedDate = formatDate(params.deletionDate);
  const downloadUrl = `${APP_URL}/dashboard/orders/${params.orderId}`;
  const extendUrl = `${APP_URL}/dashboard/orders/${params.orderId}?tab=retention`;

  const { error } = await getResend().emails.send({
    from: FROM_EMAIL,
    to: params.to,
    subject: `Action Required: Your documents will be deleted on ${formattedDate}`,
    html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #1a1a1a; max-width: 600px; margin: 0 auto; padding: 20px;">

  <div style="background: #f8fafc; border-radius: 8px; padding: 24px; margin-bottom: 24px;">
    <h1 style="margin: 0 0 8px; font-size: 24px; color: #0f172a;">Data Retention Notice</h1>
    <p style="margin: 0; color: #64748b;">Your documents will be deleted in 14 days</p>
  </div>

  <p>Hi ${params.userName},</p>

  <p>Your documents from the following order will be <strong>automatically deleted</strong> soon:</p>

  <div style="background: #fef3c7; border: 1px solid #f59e0b; border-radius: 8px; padding: 16px; margin: 24px 0;">
    <table style="width: 100%; border-collapse: collapse;">
      <tr>
        <td style="padding: 4px 0; color: #92400e;"><strong>Motion Type:</strong></td>
        <td style="padding: 4px 0;">${params.motionType}</td>
      </tr>
      <tr>
        <td style="padding: 4px 0; color: #92400e;"><strong>Case:</strong></td>
        <td style="padding: 4px 0;">${params.caseNumber}</td>
      </tr>
      <tr>
        <td style="padding: 4px 0; color: #92400e;"><strong>Deletion Date:</strong></td>
        <td style="padding: 4px 0;"><strong>${formattedDate}</strong></td>
      </tr>
    </table>
  </div>

  <h2 style="font-size: 18px; margin: 24px 0 16px;">What You Can Do:</h2>

  <div style="margin-bottom: 16px;">
    <p style="margin: 0 0 8px;"><strong>1. Download Your Documents</strong></p>
    <p style="margin: 0 0 8px; color: #64748b;">If you haven't already, download all deliverables now.</p>
    <a href="${downloadUrl}" style="display: inline-block; background: #2563eb; color: white; padding: 10px 20px; border-radius: 6px; text-decoration: none; font-weight: 500;">Download Documents</a>
  </div>

  <div style="margin-bottom: 16px;">
    <p style="margin: 0 0 8px;"><strong>2. Extend Retention</strong></p>
    <p style="margin: 0 0 8px; color: #64748b;">Need more time? Extend retention up to 2 years.</p>
    <a href="${extendUrl}" style="display: inline-block; background: #16a34a; color: white; padding: 10px 20px; border-radius: 6px; text-decoration: none; font-weight: 500;">Extend Retention</a>
  </div>

  <div style="margin-bottom: 24px;">
    <p style="margin: 0 0 8px;"><strong>3. No Action Needed</strong></p>
    <p style="margin: 0; color: #64748b;">If you've already saved your documents, no action is required. Your files will be automatically deleted on ${formattedDate}.</p>
  </div>

  <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;">

  <p style="color: #64748b; font-size: 14px;">
    Questions? Reply to this email or contact <a href="mailto:support@motiongranted.com" style="color: #2563eb;">support@motiongranted.com</a>
  </p>

  <p style="color: #64748b; font-size: 14px; margin-bottom: 0;">
    <strong>Motion Granted</strong><br>
    Professional Motion Drafting for Attorneys
  </p>

</body>
</html>
    `,
  });

  if (error) {
    log.error(`[Email] Failed to send deletion reminder to ${params.to}:`, error);
    throw error;
  }

  log.info(`[Email] Sent deletion reminder to ${params.to} for order ${params.orderId}`);
}
