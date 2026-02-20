/**
 * A-030: Singleton Resend client with built-in rate limit coordination
 *
 * All email sending paths SHOULD use this or lib/email/client.ts instead
 * of creating their own Resend instance.
 *
 * This module wraps the existing Resend singleton with rate limiting
 * to prevent 429 errors when multiple code paths send emails concurrently.
 */

import { Resend } from 'resend';

let resendInstance: Resend | null = null;
let lastSendTimestamp = 0;
const MIN_SEND_INTERVAL_MS = 100; // 10 emails/second max (Resend's limit)

/**
 * Get the singleton Resend client.
 * All callers share the same instance — no duplicate API key validation.
 */
export function getResendClient(): Resend {
  if (!resendInstance) {
    if (!process.env.RESEND_API_KEY) {
      throw new Error('RESEND_API_KEY environment variable not set');
    }
    resendInstance = new Resend(process.env.RESEND_API_KEY);
  }
  return resendInstance;
}

/**
 * Rate-limited email send wrapper.
 * Throttles sends to respect Resend's rate limit and retries once on 429.
 */
export async function rateLimitedSend<T>(
  sendFn: (client: Resend) => Promise<T>
): Promise<T> {
  const client = getResendClient();

  // Simple throttle — wait if we're sending too fast
  const elapsed = Date.now() - lastSendTimestamp;
  if (elapsed < MIN_SEND_INTERVAL_MS) {
    await new Promise(resolve => setTimeout(resolve, MIN_SEND_INTERVAL_MS - elapsed));
  }

  lastSendTimestamp = Date.now();

  try {
    return await sendFn(client);
  } catch (error: unknown) {
    const err = error as { statusCode?: number; headers?: Record<string, string> };
    if (err?.statusCode === 429) {
      // Rate limited — back off and retry once
      const retryAfter = parseInt(err.headers?.['retry-after'] || '2', 10) * 1000;
      console.warn(`[Resend] Rate limited. Waiting ${retryAfter}ms before retry.`);
      await new Promise(resolve => setTimeout(resolve, retryAfter));
      lastSendTimestamp = Date.now();
      return await sendFn(client);
    }
    throw error;
  }
}
