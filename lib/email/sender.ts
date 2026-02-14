/**
 * Email Sender Orchestration
 *
 * Sends the right email template based on event type.
 * Maps EmailEvent discriminated union to template builders.
 */

import { sendEmail } from './client';
import * as templates from './templates';

import { createLogger } from '@/lib/security/logger';

const log = createLogger('email-sender');
export type EmailEvent =
  | { type: 'order_confirmed'; data: templates.OrderConfirmationData }
  | { type: 'hold_created'; data: templates.HoldNotificationData }
  | { type: 'hold_reminder'; data: templates.HoldReminderData }
  | { type: 'hold_escalation'; data: templates.HoldReminderData }
  | { type: 'progress_update'; data: templates.ProgressNotificationData }
  | { type: 'documents_ready'; data: templates.DocumentsReadyData }
  | { type: 'revision_received'; data: templates.RevisionReceivedData }
  | { type: 'order_abandoned'; data: templates.OrderAbandonedData };

type TemplateFn = (data: never) => { subject: string; html: string; text: string };

const templateMap: Record<EmailEvent['type'], TemplateFn> = {
  order_confirmed: templates.orderConfirmationEmail as TemplateFn,
  hold_created: templates.holdNotificationEmail as TemplateFn,
  hold_reminder: templates.holdReminderEmail as TemplateFn,
  hold_escalation: templates.holdEscalationEmail as TemplateFn,
  progress_update: templates.progressNotificationEmail as TemplateFn,
  documents_ready: templates.documentsReadyEmail as TemplateFn,
  revision_received: templates.revisionReceivedEmail as TemplateFn,
  order_abandoned: templates.orderAbandonedEmail as TemplateFn,
};

export async function sendOrderEmail(
  to: string,
  event: EmailEvent,
  orderId: string
): Promise<{ success: boolean; error?: string }> {
  const buildTemplate = templateMap[event.type];
  if (!buildTemplate) {
    log.error(`[email] Unknown email event type: ${event.type}`);
    return { success: false, error: `Unknown event type: ${event.type}` };
  }

  const { subject, html, text } = (buildTemplate as (data: unknown) => { subject: string; html: string; text: string })(event.data);

  return sendEmail({
    to,
    subject,
    html,
    text,
    idempotencyKey: `${orderId}-${event.type}-${Date.now()}`,
    tags: [
      { name: 'order_id', value: orderId },
      { name: 'event_type', value: event.type },
    ],
  });
}
