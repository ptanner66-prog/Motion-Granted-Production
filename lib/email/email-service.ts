/**
 * Email Service — MB-02 Production Fix
 *
 * Enhanced email service with retry logic, structured logging,
 * and non-crashing error handling for workflow integration.
 *
 * Wraps the existing Resend infrastructure with:
 * - 3-attempt retry with exponential backoff
 * - Correlation ID logging (order_id)
 * - Fire-and-forget mode (email failure never crashes workflow)
 */

import { Resend } from 'resend';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

import { createLogger } from '@/lib/security/logger';

const log = createLogger('email-email-service');
// ============================================================================
// CONSTANTS
// ============================================================================

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;
const SENDER = process.env.RESEND_FROM_EMAIL || 'Motion Granted <noreply@motiongranted.com>';

// ============================================================================
// SINGLETON CLIENT
// ============================================================================

let resendClient: Resend | null = null;

function getResendClient(): Resend | null {
  if (!resendClient) {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      log.error('[EmailService] RESEND_API_KEY not configured — emails will be logged but not sent');
      return null;
    }
    resendClient = new Resend(apiKey);
  }
  return resendClient;
}

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createSupabaseClient(url, key);
}

// ============================================================================
// TYPES
// ============================================================================

export interface EmailOptions {
  orderId?: string;
  replyTo?: string;
  tags?: Array<{ name: string; value: string }>;
}

export interface EmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

// ============================================================================
// CORE SEND FUNCTION WITH RETRY
// ============================================================================

/**
 * Send an email with retry logic.
 * NEVER throws — email failure = log + continue, NOT crash.
 */
export async function sendEmail(
  to: string | string[],
  subject: string,
  html: string,
  options: EmailOptions = {}
): Promise<EmailResult> {
  const correlationId = options.orderId || 'no-order';
  log.info(`[EmailService][${correlationId}] Sending email to ${Array.isArray(to) ? to.join(', ') : to}: "${subject}"`);

  const client = getResendClient();
  if (!client) {
    const msg = 'Resend not configured — email skipped';
    log.warn(`[EmailService][${correlationId}] ${msg}`);
    await logEmailAttempt(correlationId, to, subject, false, undefined, msg);
    return { success: false, error: msg };
  }

  let lastError: string = '';

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const { data, error } = await client.emails.send({
        from: SENDER,
        to: Array.isArray(to) ? to : [to],
        subject,
        html,
        ...(options.replyTo ? { replyTo: options.replyTo } : {}),
        ...(options.tags ? { tags: options.tags } : {}),
      });

      if (error) {
        lastError = error.message;
        log.warn(`[EmailService][${correlationId}] Attempt ${attempt}/${MAX_RETRIES} failed: ${error.message}`);
        if (attempt < MAX_RETRIES) {
          const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
      } else {
        const messageId = data?.id || undefined;
        log.info(`[EmailService][${correlationId}] Email sent successfully: ${messageId}`);
        await logEmailAttempt(correlationId, to, subject, true, messageId);
        return { success: true, messageId };
      }
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      log.warn(`[EmailService][${correlationId}] Attempt ${attempt}/${MAX_RETRIES} threw: ${lastError}`);
      if (attempt < MAX_RETRIES) {
        const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  // All retries exhausted — log failure, do NOT throw
  log.error(`[EmailService][${correlationId}] All ${MAX_RETRIES} attempts failed: ${lastError}`);
  await logEmailAttempt(correlationId, to, subject, false, undefined, lastError);
  return { success: false, error: lastError };
}

/**
 * Fire-and-forget email. Never blocks, never throws.
 */
export function sendEmailAsync(
  to: string | string[],
  subject: string,
  html: string,
  options: EmailOptions = {}
): void {
  sendEmail(to, subject, html, options).catch((err) => {
    log.error('[EmailService] Async email send failed:', err);
  });
}

// ============================================================================
// LOGGING
// ============================================================================

async function logEmailAttempt(
  orderId: string,
  to: string | string[],
  subject: string,
  success: boolean,
  messageId?: string,
  errorMessage?: string
): Promise<void> {
  try {
    const supabase = getSupabase();
    if (!supabase) return;

    await supabase.from('email_log').insert({
      order_id: orderId === 'no-order' ? null : orderId,
      email_type: 'workflow_notification',
      recipient: Array.isArray(to) ? to.join(', ') : to,
      subject,
      success,
      message_id: messageId || null,
      error_message: errorMessage || null,
    });
  } catch (err) {
    log.error('[EmailService] Failed to log email attempt:', err);
  }
}
