/**
 * Alert Email Sender (Task 61)
 *
 * Sends alert emails for critical errors via Resend.
 *
 * Source: Chunk 8, Task 61 - Code Mode Spec Section 23
 */

import { Resend } from 'resend';
import type { LogLevel, ErrorCategory } from './error-logger';

import { createLogger } from '@/lib/security/logger';

const log = createLogger('monitoring-alert-sender');
// ============================================================================
// TYPES
// ============================================================================

export interface AlertEmailInput {
  to: string;
  subject: string;
  level: LogLevel;
  category?: ErrorCategory;
  message: string;
  orderId?: string;
  phase?: string;
  metadata?: Record<string, unknown>;
  stack?: string;
}

// ============================================================================
// SEND ALERT EMAIL
// ============================================================================

export async function sendAlertEmail(input: AlertEmailInput): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    log.error('[AlertSender] RESEND_API_KEY not configured');
    return false;
  }

  const resend = new Resend(apiKey);

  // Format the email body
  const htmlBody = formatAlertHtml(input);
  const textBody = formatAlertText(input);

  try {
    const { error } = await resend.emails.send({
      from: 'Motion Granted Alerts <alerts@motion-granted.com>',
      to: input.to,
      subject: input.subject,
      html: htmlBody,
      text: textBody,
    });

    if (error) {
      log.error('[AlertSender] Failed to send alert:', error);
      return false;
    }

    return true;
  } catch (error) {
    log.error('[AlertSender] Error sending alert:', error);
    return false;
  }
}

// ============================================================================
// FORMATTERS
// ============================================================================

function formatAlertHtml(input: AlertEmailInput): string {
  const levelColor = getLevelColor(input.level);
  const timestamp = new Date().toISOString();

  let html = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: ${levelColor}; color: white; padding: 15px; border-radius: 8px 8px 0 0; }
    .content { background: #f9fafb; padding: 20px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px; }
    .label { font-weight: 600; color: #374151; margin-bottom: 4px; }
    .value { background: white; padding: 8px 12px; border-radius: 4px; border: 1px solid #e5e7eb; margin-bottom: 12px; }
    .metadata { background: #1f2937; color: #e5e7eb; padding: 12px; border-radius: 4px; font-family: monospace; font-size: 12px; white-space: pre-wrap; overflow-x: auto; }
    .stack { background: #fef2f2; color: #991b1b; padding: 12px; border-radius: 4px; font-family: monospace; font-size: 11px; white-space: pre-wrap; overflow-x: auto; max-height: 300px; overflow-y: auto; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 12px; font-weight: 500; }
    .badge-error { background: #fef2f2; color: #dc2626; }
    .badge-fatal { background: #fef2f2; color: #7f1d1d; }
    .badge-category { background: #eff6ff; color: #1d4ed8; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h2 style="margin: 0;">🚨 ${input.level} Alert</h2>
      <p style="margin: 8px 0 0 0; opacity: 0.9;">${timestamp}</p>
    </div>
    <div class="content">
      <div class="label">Level</div>
      <div class="value">
        <span class="badge badge-${input.level.toLowerCase()}">${input.level}</span>
        ${input.category ? `<span class="badge badge-category">${input.category}</span>` : ''}
      </div>

      <div class="label">Message</div>
      <div class="value">${escapeHtml(input.message)}</div>
`;

  if (input.orderId) {
    html += `
      <div class="label">Order ID</div>
      <div class="value"><code>${input.orderId}</code></div>
`;
  }

  if (input.phase) {
    html += `
      <div class="label">Phase</div>
      <div class="value">${input.phase}</div>
`;
  }

  if (input.metadata && Object.keys(input.metadata).length > 0) {
    html += `
      <div class="label">Additional Details</div>
      <div class="metadata">${escapeHtml(JSON.stringify(input.metadata, null, 2))}</div>
`;
  }

  if (input.stack) {
    html += `
      <div class="label">Stack Trace</div>
      <div class="stack">${escapeHtml(input.stack)}</div>
`;
  }

  html += `
    </div>
    <p style="text-align: center; color: #6b7280; font-size: 12px; margin-top: 16px;">
      This is an automated alert from Motion Granted monitoring system.
    </p>
  </div>
</body>
</html>
`;

  return html;
}

function formatAlertText(input: AlertEmailInput): string {
  const timestamp = new Date().toISOString();

  let text = `
=== ${input.level} ALERT ===
Time: ${timestamp}

Level: ${input.level}
${input.category ? `Category: ${input.category}` : ''}

Message:
${input.message}
`;

  if (input.orderId) {
    text += `\nOrder ID: ${input.orderId}`;
  }

  if (input.phase) {
    text += `\nPhase: ${input.phase}`;
  }

  if (input.metadata && Object.keys(input.metadata).length > 0) {
    text += `\n\nAdditional Details:\n${JSON.stringify(input.metadata, null, 2)}`;
  }

  if (input.stack) {
    text += `\n\nStack Trace:\n${input.stack}`;
  }

  text += `\n\n---\nThis is an automated alert from Motion Granted monitoring system.`;

  return text;
}

function getLevelColor(level: LogLevel): string {
  switch (level) {
    case 'FATAL':
      return '#7f1d1d';
    case 'ERROR':
      return '#dc2626';
    case 'WARN':
      return '#d97706';
    case 'INFO':
      return '#2563eb';
    case 'DEBUG':
      return '#6b7280';
    default:
      return '#374151';
  }
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
