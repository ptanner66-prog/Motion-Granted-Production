/**
 * Email Notification Service (Task 55)
 *
 * Comprehensive email notification system for Motion Granted.
 *
 * Email types:
 * 1. Order Confirmation - after payment success
 * 2. Generation Started - when workflow begins
 * 3. HOLD Notification - when workflow pauses for customer input
 * 4. Generation Complete - with download link
 * 5. Revision Ready - after revision complete
 * 6. Refund Processed - when refund issued
 *
 * Source: Chunk 8, Task 55 - Code Mode Spec Section 17
 */

import { Resend } from 'resend';
import { createClient } from '@/lib/supabase/server';
import { formatDisclosureForEmail, getDisclosure } from '@/lib/compliance/customer-disclosures';

// ============================================================================
// TYPES
// ============================================================================

export type EmailType =
  | 'order_confirmation'
  | 'generation_started'
  | 'hold_notification'
  | 'generation_complete'
  | 'revision_ready'
  | 'refund_processed';

export interface SendEmailInput {
  type: EmailType;
  to: string;
  orderId: string;
  data: Record<string, unknown>;
}

export interface EmailTemplate {
  subject: string;
  html: string;
  text: string;
}

export interface SendEmailResult {
  success: boolean;
  messageId: string | null;
  error: string | null;
}

// ============================================================================
// RESEND CLIENT
// ============================================================================

let resendClient: Resend | null = null;

function getResendClient(): Resend {
  if (!resendClient) {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      throw new Error('RESEND_API_KEY environment variable is not set');
    }
    resendClient = new Resend(apiKey);
  }
  return resendClient;
}

// ============================================================================
// EMAIL TEMPLATES
// ============================================================================

const COMPANY_NAME = 'Motion Granted';
const SUPPORT_EMAIL = 'support@motiongranted.com';
const FROM_EMAIL = 'Motion Granted <noreply@motiongranted.com>';

/**
 * Get email template for a specific type
 */
export async function getEmailTemplate(
  type: EmailType,
  data: Record<string, unknown>
): Promise<EmailTemplate> {
  const templates: Record<EmailType, () => EmailTemplate> = {
    order_confirmation: () => ({
      subject: `Order Confirmed - ${data.orderNumber || 'Your Order'}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #1a1a1a;">Order Confirmed</h1>
          <p>Thank you for your order with ${COMPANY_NAME}!</p>

          <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="margin-top: 0;">Order Details</h3>
            <p><strong>Order Number:</strong> ${data.orderNumber}</p>
            <p><strong>Motion Type:</strong> ${data.motionType}</p>
            <p><strong>Tier:</strong> ${data.tier}</p>
            <p><strong>Total:</strong> $${(data.totalPrice as number)?.toFixed(2)}</p>
            <p><strong>Estimated Delivery:</strong> ${data.estimatedDelivery}</p>
          </div>

          <p>We've started processing your order. You'll receive an email when generation begins.</p>

          <p>If you have any questions, please contact us at <a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a>.</p>

          <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">
          <p style="font-size: 12px; color: #666;">
            ${getDisclosure('not_legal_advice').shortText}: ${getDisclosure('not_legal_advice').fullText}
          </p>
        </div>
      `,
      text: `
Order Confirmed - ${data.orderNumber}

Thank you for your order with ${COMPANY_NAME}!

Order Details:
- Order Number: ${data.orderNumber}
- Motion Type: ${data.motionType}
- Tier: ${data.tier}
- Total: $${(data.totalPrice as number)?.toFixed(2)}
- Estimated Delivery: ${data.estimatedDelivery}

We've started processing your order. You'll receive an email when generation begins.

Questions? Contact ${SUPPORT_EMAIL}

---
${getDisclosure('not_legal_advice').fullText}
      `.trim(),
    }),

    generation_started: () => ({
      subject: `Generation Started - ${data.orderNumber}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #1a1a1a;">Document Generation Started</h1>

          <p>Great news! We've started generating your documents for order <strong>${data.orderNumber}</strong>.</p>

          <div style="background: #e8f4f8; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="margin-top: 0; color: #0066cc;">What's Happening Now</h3>
            <ul style="margin: 0; padding-left: 20px;">
              <li>Analyzing your case documents</li>
              <li>Researching applicable law and citations</li>
              <li>Drafting your ${data.motionType}</li>
              <li>Verifying all citations</li>
            </ul>
          </div>

          <p>You'll receive another email when your documents are ready for download.</p>

          <p style="color: #666; font-size: 14px;">Estimated completion: ${data.estimatedCompletion}</p>
        </div>
      `,
      text: `
Document Generation Started

We've started generating your documents for order ${data.orderNumber}.

What's Happening Now:
- Analyzing your case documents
- Researching applicable law and citations
- Drafting your ${data.motionType}
- Verifying all citations

You'll receive another email when your documents are ready for download.

Estimated completion: ${data.estimatedCompletion}
      `.trim(),
    }),

    hold_notification: () => ({
      subject: `Action Required - ${data.orderNumber}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #cc6600;">Action Required</h1>

          <p>Your order <strong>${data.orderNumber}</strong> has been placed on hold and requires your attention.</p>

          <div style="background: #fff3e0; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #cc6600;">
            <h3 style="margin-top: 0; color: #cc6600;">Reason for Hold</h3>
            <p>${data.holdReason}</p>
          </div>

          ${data.requiredAction ? `
          <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="margin-top: 0;">Required Action</h3>
            <p>${data.requiredAction}</p>
          </div>
          ` : ''}

          <p><a href="${data.portalLink}" style="display: inline-block; background: #0066cc; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none;">View Order & Respond</a></p>

          <p style="color: #666; font-size: 14px;">Processing will resume once we receive your response.</p>
        </div>
      `,
      text: `
ACTION REQUIRED - Order ${data.orderNumber}

Your order has been placed on hold and requires your attention.

Reason for Hold:
${data.holdReason}

${data.requiredAction ? `Required Action:\n${data.requiredAction}` : ''}

Please visit your portal to respond: ${data.portalLink}

Processing will resume once we receive your response.
      `.trim(),
    }),

    generation_complete: () => ({
      subject: `Documents Ready - ${data.orderNumber}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #00aa00;">Your Documents Are Ready!</h1>

          <p>Great news! Your documents for order <strong>${data.orderNumber}</strong> are complete and ready for download.</p>

          <div style="background: #e8f8e8; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="margin-top: 0; color: #00aa00;">Documents Included</h3>
            <ul style="margin: 0; padding-left: 20px;">
              ${(data.documents as string[])?.map((doc: string) => `<li>${doc}</li>`).join('') || ''}
            </ul>
          </div>

          <p><a href="${data.downloadLink}" style="display: inline-block; background: #00aa00; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: bold;">Download Documents</a></p>

          <div style="background: #fffde7; padding: 15px; border-radius: 8px; margin: 20px 0; border: 1px solid #ffd54f;">
            <p style="margin: 0; color: #856404;"><strong>Important:</strong> Please review all documents before filing. You have ${data.revisionsRemaining} revision(s) included with your order.</p>
          </div>

          <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">
          <p style="font-size: 12px; color: #666;">
            ${formatDisclosureForEmail([getDisclosure('ai_assistance'), getDisclosure('review_required')])}
          </p>
        </div>
      `,
      text: `
YOUR DOCUMENTS ARE READY!

Your documents for order ${data.orderNumber} are complete and ready for download.

Documents Included:
${(data.documents as string[])?.map((doc: string) => `- ${doc}`).join('\n') || ''}

Download: ${data.downloadLink}

IMPORTANT: Please review all documents before filing. You have ${data.revisionsRemaining} revision(s) included with your order.

---
${formatDisclosureForEmail([getDisclosure('ai_assistance'), getDisclosure('review_required')])}
      `.trim(),
    }),

    revision_ready: () => ({
      subject: `Revision Complete - ${data.orderNumber}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #0066cc;">Revision Complete</h1>

          <p>Your revision request for order <strong>${data.orderNumber}</strong> has been completed.</p>

          <div style="background: #e8f4f8; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="margin-top: 0;">Changes Made</h3>
            <p>${data.changesSummary}</p>
          </div>

          <p><a href="${data.downloadLink}" style="display: inline-block; background: #0066cc; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none;">Download Updated Documents</a></p>

          <p style="color: #666; font-size: 14px;">Revisions remaining: ${data.revisionsRemaining}</p>
        </div>
      `,
      text: `
REVISION COMPLETE

Your revision request for order ${data.orderNumber} has been completed.

Changes Made:
${data.changesSummary}

Download: ${data.downloadLink}

Revisions remaining: ${data.revisionsRemaining}
      `.trim(),
    }),

    refund_processed: () => ({
      subject: `Refund Processed - ${data.orderNumber}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #1a1a1a;">Refund Processed</h1>

          <p>We've processed a refund for your order <strong>${data.orderNumber}</strong>.</p>

          <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="margin-top: 0;">Refund Details</h3>
            <p><strong>Amount:</strong> $${(data.refundAmount as number)?.toFixed(2)}</p>
            <p><strong>Reason:</strong> ${data.refundReason}</p>
            <p><strong>Reference:</strong> ${data.refundReference}</p>
          </div>

          <p>The refund should appear in your account within 5-10 business days, depending on your financial institution.</p>

          <p>If you have any questions about this refund, please contact us at <a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a>.</p>
        </div>
      `,
      text: `
REFUND PROCESSED

We've processed a refund for your order ${data.orderNumber}.

Refund Details:
- Amount: $${(data.refundAmount as number)?.toFixed(2)}
- Reason: ${data.refundReason}
- Reference: ${data.refundReference}

The refund should appear in your account within 5-10 business days.

Questions? Contact ${SUPPORT_EMAIL}
      `.trim(),
    }),
  };

  return templates[type]();
}

// ============================================================================
// EMAIL LOGGING
// ============================================================================

/**
 * Log email send to database
 */
export async function logEmailSend(
  orderId: string,
  type: EmailType,
  recipient: string,
  subject: string,
  success: boolean,
  messageId: string | null,
  errorMessage?: string
): Promise<void> {
  try {
    const supabase = await createClient();

    await supabase.from('email_log').insert({
      order_id: orderId,
      email_type: type,
      recipient,
      subject,
      success,
      message_id: messageId,
      error_message: errorMessage || null,
    });
  } catch (error) {
    console.error('[EmailService] Failed to log email:', error);
  }
}

// ============================================================================
// MAIN SEND FUNCTION
// ============================================================================

/**
 * Send an email notification
 */
export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  console.log(`[EmailService] Sending ${input.type} email to ${input.to} for order ${input.orderId}`);

  try {
    const template = await getEmailTemplate(input.type, input.data);
    const resend = getResendClient();

    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: input.to,
      subject: template.subject,
      html: template.html,
      text: template.text,
    });

    if (error) {
      console.error('[EmailService] Resend error:', error);
      await logEmailSend(
        input.orderId,
        input.type,
        input.to,
        template.subject,
        false,
        null,
        error.message
      );
      return {
        success: false,
        messageId: null,
        error: error.message,
      };
    }

    const messageId = data?.id || null;
    await logEmailSend(input.orderId, input.type, input.to, template.subject, true, messageId);

    console.log(`[EmailService] Email sent successfully: ${messageId}`);
    return {
      success: true,
      messageId,
      error: null,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[EmailService] Error sending email:', error);

    await logEmailSend(
      input.orderId,
      input.type,
      input.to,
      input.type,
      false,
      null,
      errorMessage
    );

    return {
      success: false,
      messageId: null,
      error: errorMessage,
    };
  }
}

/**
 * Send email without blocking (fire and forget)
 */
export function sendEmailAsync(input: SendEmailInput): void {
  sendEmail(input).catch((error) => {
    console.error('[EmailService] Async email send failed:', error);
  });
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  sendEmail,
  sendEmailAsync,
  getEmailTemplate,
  logEmailSend,
};
