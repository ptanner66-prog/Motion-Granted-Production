/**
 * Email Triggers — MB-02 Production Fix
 *
 * Specific email trigger functions called from workflow phases.
 * Each trigger builds the appropriate HTML and delegates to sendEmail.
 *
 * CRITICAL: These functions NEVER throw. Email failure must not crash the workflow.
 */

import { sendEmail, sendEmailAsync, type EmailResult } from './email-service';
import { resolveFromOrder } from '@/lib/jurisdiction/resolver';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://motion-granted.com';
const SUPPORT_EMAIL = 'support@motion-granted.com';

/**
 * BD-20: Resolve jurisdiction display string.
 * Uses resolver when state is available, falls back to raw jurisdiction string.
 */
function resolveJurisdictionDisplay(data: { jurisdiction?: string; state?: string; court_type?: string }): string {
  if (data.state) {
    return resolveFromOrder(data).display;
  }
  return data.jurisdiction || 'N/A';
}

// ============================================================================
// TYPES
// ============================================================================

interface OrderEmailData {
  orderId: string;
  orderNumber: string;
  customerEmail: string;
  motionType?: string;
  jurisdiction?: string;
  state?: string;
  court_type?: string;
  tier?: string;
  estimatedTurnaround?: string;
  totalPrice?: number;
}

// ============================================================================
// TRIGGER: Order Confirmation
// ============================================================================

export async function sendOrderConfirmation(order: OrderEmailData): Promise<EmailResult> {
  const turnaroundMap: Record<string, string> = { A: '3 business days', B: '4 business days', C: '5 business days', D: '7 business days' };
  const turnaround = order.estimatedTurnaround || turnaroundMap[order.tier || 'B'] || '4 business days';

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h1 style="color: #1a1a1a;">Order Confirmed</h1>
      <p>Thank you for your order with Motion Granted!</p>
      <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <h3 style="margin-top: 0;">Order Details</h3>
        <p><strong>Order ID:</strong> ${order.orderNumber}</p>
        <p><strong>Motion Type:</strong> ${order.motionType || 'N/A'}</p>
        <p><strong>Jurisdiction:</strong> ${resolveJurisdictionDisplay(order)}</p>
        <p><strong>Tier:</strong> ${order.tier || 'N/A'}</p>
        <p><strong>Estimated Turnaround:</strong> ${turnaround}</p>
      </div>
      <p><a href="${APP_URL}/dashboard" style="display: inline-block; background: #0066cc; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none;">View Dashboard</a></p>
      <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">
      <p style="font-size: 12px; color: #666;">Questions? Contact ${SUPPORT_EMAIL}</p>
    </div>
  `;

  return sendEmail(order.customerEmail, `Order Confirmed — ${order.orderNumber}`, html, { orderId: order.orderId });
}

// ============================================================================
// TRIGGER: HOLD Notification
// ============================================================================

export async function sendHoldNotification(
  order: OrderEmailData,
  holdReason: string,
  missingItems: string[]
): Promise<EmailResult> {
  const itemsList = missingItems.length > 0
    ? missingItems.map(item => `<li>${item}</li>`).join('')
    : '<li>Additional documentation required</li>';

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h1 style="color: #cc6600;">Action Required — Order On Hold</h1>
      <p>Your order <strong>${order.orderNumber}</strong> has been placed on hold pending your response.</p>

      <div style="background: #fff3e0; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #cc6600;">
        <h3 style="margin-top: 0; color: #cc6600;">Reason for Hold</h3>
        <p>${holdReason}</p>
      </div>

      <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <h3 style="margin-top: 0;">Missing Items</h3>
        <ul>${itemsList}</ul>
      </div>

      <h3>Your Options:</h3>
      <div style="margin: 20px 0;">
        <a href="${APP_URL}/orders/${order.orderId}/hold-response?action=provide" style="display: inline-block; background: #00aa00; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; margin-right: 10px;">Provide Evidence</a>
        <a href="${APP_URL}/orders/${order.orderId}/hold-response?action=acknowledge" style="display: inline-block; background: #0066cc; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; margin-right: 10px;">Acknowledge & Proceed</a>
        <a href="${APP_URL}/orders/${order.orderId}/hold-response?action=cancel" style="display: inline-block; background: #cc0000; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none;">Cancel Order</a>
      </div>

      <p style="color: #666; font-size: 14px;">If no response is received within 7 days, your order will be automatically cancelled and refunded.</p>
    </div>
  `;

  return sendEmail(order.customerEmail, `Action Required — ${order.orderNumber}`, html, { orderId: order.orderId });
}

// ============================================================================
// TRIGGER: CP3 Review Notification
// ============================================================================

export async function sendCP3ReviewNotification(
  order: OrderEmailData,
  documentList: string[]
): Promise<EmailResult> {
  const docsList = documentList.length > 0
    ? documentList.map(doc => `<li>${doc}</li>`).join('')
    : '<li>Motion Document</li><li>Attorney Instruction Sheet</li><li>Citation Accuracy Report</li>';

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h1 style="color: #00aa00;">Filing Package Ready for Review</h1>
      <p>Your filing package for order <strong>${order.orderNumber}</strong> is complete and ready for your review.</p>

      <div style="background: #e8f8e8; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <h3 style="margin-top: 0; color: #00aa00;">Documents in Package</h3>
        <ul>${docsList}</ul>
      </div>

      <p><a href="${APP_URL}/orders/${order.orderId}/review" style="display: inline-block; background: #00aa00; color: white; padding: 16px 32px; border-radius: 6px; text-decoration: none; font-weight: bold;">Review & Approve</a></p>
      <p style="margin-top: 10px;"><a href="${APP_URL}/orders/${order.orderId}/review?action=revisions" style="color: #0066cc; text-decoration: underline;">Request Revisions Instead</a></p>

      <div style="background: #fffde7; padding: 15px; border-radius: 8px; margin: 20px 0; border: 1px solid #ffd54f;">
        <p style="margin: 0; color: #856404;"><strong>Important:</strong> Documents will not be delivered until you explicitly approve them. Please review all documents carefully before approving.</p>
      </div>

      <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">
      <p style="font-size: 12px; color: #666;">This document was generated with AI assistance. Attorney review is required before filing.</p>
    </div>
  `;

  return sendEmail(order.customerEmail, `Filing Package Ready — ${order.orderNumber}`, html, { orderId: order.orderId });
}

// ============================================================================
// TRIGGER: Payment Confirmation
// ============================================================================

export async function sendPaymentConfirmation(
  order: OrderEmailData,
  stripeCharge: { amount: number; receiptUrl?: string }
): Promise<EmailResult> {
  const amountFormatted = `$${(stripeCharge.amount / 100).toFixed(2)}`;
  const receiptLink = stripeCharge.receiptUrl
    ? `<p><a href="${stripeCharge.receiptUrl}">View Stripe Receipt</a></p>`
    : '';

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h1 style="color: #1a1a1a;">Payment Confirmed</h1>
      <p>We've received your payment for order <strong>${order.orderNumber}</strong>.</p>

      <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <h3 style="margin-top: 0;">Payment Details</h3>
        <p><strong>Amount:</strong> ${amountFormatted}</p>
        <p><strong>Order ID:</strong> ${order.orderNumber}</p>
        <p><strong>Status:</strong> Confirmed</p>
      </div>

      ${receiptLink}

      <p>Your order is now being processed. You'll receive updates as your documents progress through our workflow.</p>

      <p><a href="${APP_URL}/dashboard" style="display: inline-block; background: #0066cc; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none;">View Dashboard</a></p>
    </div>
  `;

  return sendEmail(order.customerEmail, `Payment Confirmed — ${order.orderNumber}`, html, { orderId: order.orderId });
}

// ============================================================================
// TRIGGER: Revision Loop Notification (MB-02)
// ============================================================================

export async function sendRevisionNotification(
  order: OrderEmailData,
  revisionDetails: {
    loopNumber: number;
    maxLoops: number;
    currentGrade: string;
    targetGrade: string;
    revisionAreas?: string[];
  }
): Promise<EmailResult> {
  const areasList = revisionDetails.revisionAreas?.length
    ? revisionDetails.revisionAreas.map(area => `<li>${area}</li>`).join('')
    : '<li>Quality improvements based on judge simulation feedback</li>';

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h1 style="color: #0066cc;">Revision in Progress</h1>
      <p>Your order <strong>${order.orderNumber}</strong> is undergoing quality revisions to meet our standards.</p>

      <div style="background: #e3f2fd; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #0066cc;">
        <h3 style="margin-top: 0; color: #0066cc;">Revision Details</h3>
        <p><strong>Revision Round:</strong> ${revisionDetails.loopNumber} of ${revisionDetails.maxLoops}</p>
        <p><strong>Current Grade:</strong> ${revisionDetails.currentGrade}</p>
        <p><strong>Target Grade:</strong> ${revisionDetails.targetGrade}</p>
      </div>

      <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <h3 style="margin-top: 0;">Areas Being Improved</h3>
        <ul>${areasList}</ul>
      </div>

      <p style="color: #666;">This is an automated quality assurance step. No action is needed from you. You'll be notified once your documents are ready for review.</p>

      <p><a href="${APP_URL}/orders/${order.orderId}" style="display: inline-block; background: #0066cc; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none;">View Order Status</a></p>
    </div>
  `;

  return sendEmail(
    order.customerEmail,
    `Quality Revision ${revisionDetails.loopNumber}/${revisionDetails.maxLoops} — ${order.orderNumber}`,
    html,
    { orderId: order.orderId }
  );
}

// ============================================================================
// TRIGGER: Delivery Notification (MB-02)
// ============================================================================

export async function sendDeliveryNotification(
  order: OrderEmailData,
  deliveryDetails: {
    documentCount: number;
    documentTypes: string[];
    downloadUrl?: string;
  }
): Promise<EmailResult> {
  const docsList = deliveryDetails.documentTypes.length > 0
    ? deliveryDetails.documentTypes.map(doc => `<li>${doc}</li>`).join('')
    : '<li>Motion Document</li>';

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h1 style="color: #00aa00;">Your Documents Are Ready</h1>
      <p>Great news! Your filing package for order <strong>${order.orderNumber}</strong> has been completed and is ready for download.</p>

      <div style="background: #e8f8e8; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #00aa00;">
        <h3 style="margin-top: 0; color: #00aa00;">Delivered Documents (${deliveryDetails.documentCount})</h3>
        <ul>${docsList}</ul>
      </div>

      <p><a href="${deliveryDetails.downloadUrl || `${APP_URL}/orders/${order.orderId}`}" style="display: inline-block; background: #00aa00; color: white; padding: 16px 32px; border-radius: 6px; text-decoration: none; font-weight: bold;">Download Documents</a></p>

      <div style="background: #fffde7; padding: 15px; border-radius: 8px; margin: 20px 0; border: 1px solid #ffd54f;">
        <p style="margin: 0; color: #856404;"><strong>Important:</strong> These documents were generated with AI assistance. Attorney review is required before filing with the court.</p>
      </div>

      <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">
      <p style="font-size: 12px; color: #666;">Questions? Contact ${SUPPORT_EMAIL}</p>
    </div>
  `;

  return sendEmail(
    order.customerEmail,
    `Documents Ready — ${order.orderNumber}`,
    html,
    { orderId: order.orderId }
  );
}

// ============================================================================
// TRIGGER: Progress Notification (CP1/CP2)
// ============================================================================

export async function sendProgressNotification(
  order: OrderEmailData,
  milestone: {
    type: 'research_complete' | 'draft_reviewed';
    phaseName: string;
    grade?: string;
    citationCount?: number;
  }
): Promise<EmailResult> {
  const milestoneText = milestone.type === 'research_complete'
    ? 'Legal research for your motion is complete. Our team is now drafting your documents.'
    : `Your motion draft has been reviewed by our quality assurance system${milestone.grade ? ` and graded ${milestone.grade}` : ''}.`;

  const phaseLabel = milestone.type === 'research_complete'
    ? 'Research Phase Complete'
    : 'Draft Review Complete';

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h1 style="color: #1a1a1a;">${phaseLabel}</h1>
      <p>Your order <strong>${order.orderNumber}</strong> is making progress.</p>

      <div style="background: #e3f2fd; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #0066cc;">
        <p style="margin: 0;">${milestoneText}</p>
      </div>

      ${milestone.citationCount ? `<p style="color: #666;"><strong>Citations verified:</strong> ${milestone.citationCount}</p>` : ''}

      <p>You'll receive another update when your documents are ready for review.</p>

      <p><a href="${APP_URL}/orders/${order.orderId}" style="display: inline-block; background: #0066cc; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none;">View Order Status</a></p>

      <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">
      <p style="font-size: 12px; color: #666;">Questions? Contact ${SUPPORT_EMAIL}</p>
    </div>
  `;

  return sendEmail(
    order.customerEmail,
    `${phaseLabel} — ${order.orderNumber}`,
    html,
    { orderId: order.orderId }
  );
}
