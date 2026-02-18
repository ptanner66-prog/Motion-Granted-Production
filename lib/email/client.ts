/**
 * Resend Email Client
 *
 * Singleton Resend client with idempotency protection.
 * Uses in-memory dedup window to prevent duplicate sends
 * within a 1-hour window per idempotency key.
 */

import { Resend } from 'resend';

import { createLogger } from '@/lib/security/logger';

const log = createLogger('email-client');
let resendClient: Resend | null = null;

function getResendClient(): Resend {
  if (!resendClient) {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      throw new Error('RESEND_API_KEY is not configured. Email sending is disabled.');
    }
    resendClient = new Resend(apiKey);
  }
  return resendClient;
}

export interface EmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
  tags?: { name: string; value: string }[];
  idempotencyKey?: string;
}

interface EmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

const sentEmails = new Map<string, { sentAt: Date; messageId: string }>();
const DEDUP_WINDOW_MS = 60 * 60 * 1000;

export async function sendEmail(options: EmailOptions): Promise<EmailResult> {
  const fromAddress = process.env.EMAIL_FROM_ADDRESS || 'Motion Granted <noreply@motion-granted.com>';

  try {
    if (options.idempotencyKey) {
      const existing = sentEmails.get(options.idempotencyKey);
      if (existing && Date.now() - existing.sentAt.getTime() < DEDUP_WINDOW_MS) {
        log.info(`[email] Duplicate suppressed: ${options.idempotencyKey}`);
        return { success: true, messageId: existing.messageId };
      }
    }

    const client = getResendClient();

    const result = await client.emails.send({
      from: fromAddress,
      to: Array.isArray(options.to) ? options.to : [options.to],
      subject: options.subject,
      html: options.html,
      text: options.text,
      replyTo: options.replyTo || process.env.EMAIL_REPLY_TO || 'support@motion-granted.com',
      tags: options.tags,
    });

    if (result.error) {
      log.error(`[email] Send failed:`, {
        to: options.to,
        subject: options.subject,
        error: result.error,
      });
      return { success: false, error: result.error.message };
    }

    const messageId = result.data?.id || 'unknown';

    if (options.idempotencyKey) {
      sentEmails.set(options.idempotencyKey, { sentAt: new Date(), messageId });
    }

    log.info(`[email] Sent successfully:`, {
      to: options.to,
      subject: options.subject,
      messageId,
    });

    return { success: true, messageId };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown email error';
    log.error(`[email] Exception:`, {
      to: options.to,
      subject: options.subject,
      error: message,
    });
    return { success: false, error: message };
  }
}

export function cleanupEmailDedup(): void {
  const cutoff = Date.now() - DEDUP_WINDOW_MS;
  for (const [key, value] of sentEmails.entries()) {
    if (value.sentAt.getTime() < cutoff) {
      sentEmails.delete(key);
    }
  }
}
