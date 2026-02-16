/**
 * CP3 Reminder Email Stubs — SP-6 Email Hardening
 *
 * Stub implementations to unblock build while full email
 * sending logic is wired in SP-6.
 *
 * Templates already exist in lib/email/templates/:
 * - cp3-reminder-48h.tsx
 * - cp3-reminder-72h.tsx
 * - cp3-final-notice.tsx
 *
 * @module lib/email/cp3-reminders
 */

import { createLogger } from '@/lib/security/logger';

const log = createLogger('email-cp3-reminders');

/**
 * Send 48-hour CP3 reminder email.
 * TODO: Wire to Resend with cp3-reminder-48h template once SP-6 is merged.
 */
export async function send48hReminder(orderId: string): Promise<void> {
  log.info('[CP3] 48h reminder stub called', { orderId });
}

/**
 * Send 72-hour CP3 reminder email.
 * TODO: Wire to Resend with cp3-reminder-72h template once SP-6 is merged.
 */
export async function send72hReminder(orderId: string): Promise<void> {
  log.info('[CP3] 72h reminder stub called', { orderId });
}

/**
 * Send 14-day final notice email.
 * TODO: Wire to Resend with cp3-final-notice template once SP-6 is merged.
 */
export async function sendFinalNotice(orderId: string): Promise<void> {
  log.info('[CP3] 14d final notice stub called', { orderId });
}
