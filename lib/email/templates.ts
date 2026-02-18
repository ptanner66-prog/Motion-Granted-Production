/**
 * Email Templates
 *
 * All transactional email templates for Motion Granted.
 * Inline HTML for maximum email client compatibility.
 * 8 templates covering the full order lifecycle.
 */

const BRAND = {
  name: 'Motion Granted',
  color: '#1e3a5f',
  accent: '#c5a059',
  url: process.env.NEXT_PUBLIC_APP_URL || 'https://motion-granted.com',
  supportEmail: 'support@motion-granted.com',
};

function baseLayout(content: string, preheader?: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${BRAND.name}</title>
  ${preheader ? `<span style="display:none;max-height:0;overflow:hidden">${preheader}</span>` : ''}
  <style>
    body { margin: 0; padding: 0; background: #f4f4f8; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
    .container { max-width: 600px; margin: 0 auto; background: #ffffff; }
    .header { background: ${BRAND.color}; padding: 24px 32px; }
    .header h1 { color: #ffffff; margin: 0; font-size: 22px; font-weight: 600; }
    .body { padding: 32px; color: #333333; line-height: 1.6; font-size: 15px; }
    .body h2 { color: ${BRAND.color}; font-size: 18px; margin-top: 0; }
    .cta { display: inline-block; background: ${BRAND.accent}; color: #ffffff; padding: 12px 28px; text-decoration: none; border-radius: 6px; font-weight: 600; margin: 16px 0; }
    .info-box { background: #f8f9fa; border-left: 4px solid ${BRAND.accent}; padding: 16px; margin: 16px 0; border-radius: 0 4px 4px 0; }
    .footer { padding: 24px 32px; background: #f4f4f8; color: #888888; font-size: 12px; text-align: center; }
    .footer a { color: #888888; }
    .divider { border: 0; border-top: 1px solid #eeeeee; margin: 24px 0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header"><h1>${BRAND.name}</h1></div>
    <div class="body">${content}</div>
    <div class="footer">
      <p>&copy; ${new Date().getFullYear()} ${BRAND.name}. All rights reserved.</p>
      <p>${BRAND.name} is a legal process outsourcing company, not a law firm.</p>
      <p>All work product is prepared under the direction and supervision of the hiring attorney.</p>
    </div>
  </div>
</body>
</html>`;
}

// ─── TEMPLATE 1: ORDER CONFIRMATION ────────────────────────────

export interface OrderConfirmationData {
  customerName: string;
  orderNumber: string;
  motionType: string;
  motionTypeDisplay: string;
  tier: 'A' | 'B' | 'C' | 'D';
  estimatedTurnaround: string;
  filingDeadline?: string;
  amountPaid: string;
  dashboardUrl?: string;
}

export function orderConfirmationEmail(data: OrderConfirmationData): { subject: string; html: string; text: string } {
  const dashboardUrl = data.dashboardUrl || `${BRAND.url}/dashboard`;

  const html = baseLayout(`
    <h2>Order Confirmed</h2>
    <p>Dear ${data.customerName},</p>
    <p>Thank you for your order. We have received your submission and work will begin shortly.</p>
    <div class="info-box">
      <strong>Order #${data.orderNumber}</strong><br>
      <strong>Motion Type:</strong> ${data.motionTypeDisplay}<br>
      <strong>Complexity:</strong> Tier ${data.tier}<br>
      <strong>Estimated Turnaround:</strong> ${data.estimatedTurnaround}<br>
      ${data.filingDeadline ? `<strong>Filing Deadline:</strong> ${data.filingDeadline}<br>` : ''}
      <strong>Amount:</strong> ${data.amountPaid}
    </div>
    <p><strong>What happens next:</strong></p>
    <p>Our team will review your submission, conduct legal research, and draft your motion under the supervision of a licensed attorney. You'll receive updates at each milestone.</p>
    <a href="${dashboardUrl}" class="cta">View Order Status</a>
    <hr class="divider">
    <p style="font-size: 13px; color: #666;">If you need to provide additional documents or have questions, reply to this email or visit your dashboard.</p>
  `, `Order #${data.orderNumber} confirmed \u2014 ${data.motionTypeDisplay}`);

  const text = `Order Confirmed \u2014 #${data.orderNumber}\n\nDear ${data.customerName},\n\nYour order has been received. Details:\n- Motion: ${data.motionTypeDisplay}\n- Tier: ${data.tier}\n- Turnaround: ${data.estimatedTurnaround}\n${data.filingDeadline ? `- Filing Deadline: ${data.filingDeadline}\n` : ''}- Amount: ${data.amountPaid}\n\nTrack your order: ${dashboardUrl}\n\n${BRAND.name}`;

  return {
    subject: `Order Confirmed \u2014 #${data.orderNumber} | ${data.motionTypeDisplay}`,
    html,
    text,
  };
}

// ─── TEMPLATE 2: HOLD NOTIFICATION ─────────────────────────────

export interface HoldNotificationData {
  customerName: string;
  orderNumber: string;
  holdReason: string;
  requiredDocuments?: string[];
  requiredInformation?: string[];
  dashboardUrl?: string;
  deadlineWarning?: string;
}

export function holdNotificationEmail(data: HoldNotificationData): { subject: string; html: string; text: string } {
  const dashboardUrl = data.dashboardUrl || `${BRAND.url}/dashboard`;
  const docsList = data.requiredDocuments?.length
    ? `<p><strong>Documents needed:</strong></p><ul>${data.requiredDocuments.map(d => `<li>${d}</li>`).join('')}</ul>`
    : '';
  const infoList = data.requiredInformation?.length
    ? `<p><strong>Information needed:</strong></p><ul>${data.requiredInformation.map(i => `<li>${i}</li>`).join('')}</ul>`
    : '';

  const html = baseLayout(`
    <h2>Action Required \u2014 Order On Hold</h2>
    <p>Dear ${data.customerName},</p>
    <p>Your order <strong>#${data.orderNumber}</strong> has been placed on hold because additional information is needed to proceed.</p>
    <div class="info-box"><strong>Reason:</strong> ${data.holdReason}</div>
    ${docsList}${infoList}
    ${data.deadlineWarning ? `<p style="color: #c5a059; font-weight: 600;">${data.deadlineWarning}</p>` : ''}
    <a href="${dashboardUrl}" class="cta">Upload Documents</a>
    <hr class="divider">
    <p style="font-size: 13px; color: #666;">If you do not respond within 7 days, this order will be cancelled and your payment refunded.</p>
  `, `Action required for Order #${data.orderNumber}`);

  const text = `Action Required \u2014 Order #${data.orderNumber} On Hold\n\nDear ${data.customerName},\n\nYour order has been placed on hold.\nReason: ${data.holdReason}\n\n${data.requiredDocuments?.length ? `Documents needed:\n${data.requiredDocuments.map(d => `- ${d}`).join('\n')}\n` : ''}${data.requiredInformation?.length ? `Information needed:\n${data.requiredInformation.map(i => `- ${i}`).join('\n')}\n` : ''}\nUpload documents: ${dashboardUrl}\n\nIf you do not respond within 7 days, this order will be cancelled and refunded.\n\n${BRAND.name}`;

  return {
    subject: `Action Required \u2014 Order #${data.orderNumber} On Hold`,
    html,
    text,
  };
}

// ─── TEMPLATE 3: HOLD REMINDER (24hr) ──────────────────────────

export interface HoldReminderData {
  customerName: string;
  orderNumber: string;
  holdReason: string;
  hoursOnHold: number;
  daysRemaining: number;
  dashboardUrl?: string;
}

export function holdReminderEmail(data: HoldReminderData): { subject: string; html: string; text: string } {
  const dashboardUrl = data.dashboardUrl || `${BRAND.url}/dashboard`;

  const html = baseLayout(`
    <h2>Reminder \u2014 Order Still On Hold</h2>
    <p>Dear ${data.customerName},</p>
    <p>Your order <strong>#${data.orderNumber}</strong> has been on hold for ${data.hoursOnHold} hours. We still need the items described below to proceed.</p>
    <div class="info-box">${data.holdReason}</div>
    <p>If we don't hear from you within <strong>${data.daysRemaining} days</strong>, this order will be automatically cancelled and your payment refunded.</p>
    <a href="${dashboardUrl}" class="cta">Respond Now</a>
  `, `Reminder: Order #${data.orderNumber} still on hold`);

  const text = `Reminder \u2014 Order #${data.orderNumber} On Hold (${data.hoursOnHold}hrs)\n\nYour order is still on hold. ${data.daysRemaining} days remaining before auto-cancellation.\n\nReason: ${data.holdReason}\n\nRespond: ${dashboardUrl}\n\n${BRAND.name}`;

  return {
    subject: `Reminder \u2014 Order #${data.orderNumber} Awaiting Your Response`,
    html,
    text,
  };
}

// ─── TEMPLATE 4: HOLD ESCALATION (72hr) ────────────────────────

export function holdEscalationEmail(data: HoldReminderData): { subject: string; html: string; text: string } {
  const dashboardUrl = data.dashboardUrl || `${BRAND.url}/dashboard`;

  const html = baseLayout(`
    <h2>Final Notice \u2014 Order Will Be Cancelled</h2>
    <p>Dear ${data.customerName},</p>
    <p>Your order <strong>#${data.orderNumber}</strong> has been on hold for ${data.hoursOnHold} hours without a response.</p>
    <p style="color: #c5a059; font-weight: 600;">If we do not receive the required materials within ${data.daysRemaining} days, this order will be automatically cancelled and your payment refunded in full.</p>
    <div class="info-box">${data.holdReason}</div>
    <a href="${dashboardUrl}" class="cta">Respond Now</a>
  `, `Final notice: Order #${data.orderNumber} will be cancelled`);

  const text = `FINAL NOTICE \u2014 Order #${data.orderNumber}\n\nYour order will be cancelled in ${data.daysRemaining} days if we don't hear from you.\n\nReason: ${data.holdReason}\n\nRespond: ${dashboardUrl}\n\n${BRAND.name}`;

  return {
    subject: `Final Notice \u2014 Order #${data.orderNumber} Will Be Cancelled`,
    html,
    text,
  };
}

// ─── TEMPLATE 5: PROGRESS NOTIFICATION (CP1/CP2) ───────────────

export interface ProgressNotificationData {
  customerName: string;
  orderNumber: string;
  milestone: 'research_complete' | 'draft_reviewed';
  qualityScore?: number;
  dashboardUrl?: string;
}

export function progressNotificationEmail(data: ProgressNotificationData): { subject: string; html: string; text: string } {
  const dashboardUrl = data.dashboardUrl || `${BRAND.url}/dashboard`;
  const milestoneText = data.milestone === 'research_complete'
    ? { title: 'Research Phase Complete', body: 'Legal research for your motion is complete. Our team is now drafting your documents.' }
    : { title: 'Draft Review Complete', body: `Your motion draft has been reviewed by our quality assurance system${data.qualityScore ? ` and scored ${(data.qualityScore * 100).toFixed(0)}%` : ''}.` };

  const html = baseLayout(`
    <h2>${milestoneText.title}</h2>
    <p>Dear ${data.customerName},</p>
    <p>${milestoneText.body}</p>
    <div class="info-box">
      <strong>Order:</strong> #${data.orderNumber}<br>
      <strong>Status:</strong> ${milestoneText.title}
    </div>
    <p>You'll receive another update when your documents are ready for review.</p>
    <a href="${dashboardUrl}" class="cta">View Order Status</a>
  `, `${milestoneText.title} \u2014 Order #${data.orderNumber}`);

  const text = `${milestoneText.title} \u2014 Order #${data.orderNumber}\n\n${milestoneText.body}\n\nView status: ${dashboardUrl}\n\n${BRAND.name}`;

  return {
    subject: `${milestoneText.title} \u2014 Order #${data.orderNumber}`,
    html,
    text,
  };
}

// ─── TEMPLATE 6: DOCUMENTS READY (CP3) ─────────────────────────

export interface DocumentsReadyData {
  customerName: string;
  orderNumber: string;
  motionTypeDisplay: string;
  documentCount: number;
  documentList: string[];
  filingDeadline?: string;
  reviewUrl?: string;
}

export function documentsReadyEmail(data: DocumentsReadyData): { subject: string; html: string; text: string } {
  const reviewUrl = data.reviewUrl || `${BRAND.url}/orders/${data.orderNumber}`;

  const html = baseLayout(`
    <h2>Your Documents Are Ready</h2>
    <p>Dear ${data.customerName},</p>
    <p>Your <strong>${data.motionTypeDisplay}</strong> filing package is complete and ready for your review.</p>
    <div class="info-box">
      <strong>Order:</strong> #${data.orderNumber}<br>
      <strong>Documents:</strong> ${data.documentCount} files<br>
      ${data.filingDeadline ? `<strong>Filing Deadline:</strong> ${data.filingDeadline}<br>` : ''}
    </div>
    <p><strong>Your filing package includes:</strong></p>
    <ul>${data.documentList.map(d => `<li>${d}</li>`).join('')}</ul>
    <p><strong>Next steps:</strong></p>
    <ol>
      <li>Review all documents for accuracy</li>
      <li>Verify case information and citations</li>
      <li>Approve for download or request changes</li>
      <li>File under your name and bar number</li>
    </ol>
    <a href="${reviewUrl}" class="cta">Review &amp; Approve Documents</a>
    <hr class="divider">
    <p style="font-size: 13px; color: #666;">One revision is included with your order. If changes are needed, use the "Request Changes" option during review.</p>
  `, `Your documents are ready \u2014 Order #${data.orderNumber}`);

  const text = `Your Documents Are Ready \u2014 Order #${data.orderNumber}\n\nDear ${data.customerName},\n\nYour ${data.motionTypeDisplay} filing package (${data.documentCount} documents) is ready.\n\n${data.filingDeadline ? `Filing Deadline: ${data.filingDeadline}\n` : ''}Documents:\n${data.documentList.map(d => `- ${d}`).join('\n')}\n\nReview and approve: ${reviewUrl}\n\nOne revision is included with your order.\n\n${BRAND.name}`;

  return {
    subject: `Documents Ready \u2014 Order #${data.orderNumber} | ${data.motionTypeDisplay}`,
    html,
    text,
  };
}

// ─── TEMPLATE 7: REVISION RECEIVED ──────────────────────────────

export interface RevisionReceivedData {
  customerName: string;
  orderNumber: string;
  revisionNotes: string;
  estimatedCompletion: string;
  dashboardUrl?: string;
}

export function revisionReceivedEmail(data: RevisionReceivedData): { subject: string; html: string; text: string } {
  const dashboardUrl = data.dashboardUrl || `${BRAND.url}/dashboard`;

  const html = baseLayout(`
    <h2>Revision Request Received</h2>
    <p>Dear ${data.customerName},</p>
    <p>We've received your revision request for order <strong>#${data.orderNumber}</strong> and will begin working on the changes.</p>
    <div class="info-box"><strong>Your notes:</strong><br>${data.revisionNotes}</div>
    <p><strong>Estimated completion:</strong> ${data.estimatedCompletion}</p>
    <p>You'll receive a notification when the revised documents are ready for review.</p>
    <a href="${dashboardUrl}" class="cta">View Order Status</a>
  `, `Revision in progress \u2014 Order #${data.orderNumber}`);

  const text = `Revision Request Received \u2014 Order #${data.orderNumber}\n\nWe've received your revision request and will begin working on changes.\n\nYour notes: ${data.revisionNotes}\n\nEstimated completion: ${data.estimatedCompletion}\n\nView status: ${dashboardUrl}\n\n${BRAND.name}`;

  return {
    subject: `Revision Received \u2014 Order #${data.orderNumber}`,
    html,
    text,
  };
}

// ─── TEMPLATE 8: ORDER ABANDONED / REFUND ───────────────────────

export interface OrderAbandonedData {
  customerName: string;
  orderNumber: string;
  refundAmount: string;
  reason: string;
}

export function orderAbandonedEmail(data: OrderAbandonedData): { subject: string; html: string; text: string } {
  const html = baseLayout(`
    <h2>Order Cancelled \u2014 Refund Issued</h2>
    <p>Dear ${data.customerName},</p>
    <p>Your order <strong>#${data.orderNumber}</strong> has been cancelled due to: ${data.reason}.</p>
    <p>A full refund of <strong>${data.refundAmount}</strong> has been issued to your original payment method. Please allow 5-10 business days for the refund to appear.</p>
    <p>If you'd like to resubmit your order with the required materials, you're welcome to do so at any time.</p>
    <a href="${BRAND.url}/pricing" class="cta">Submit New Order</a>
  `, `Order #${data.orderNumber} cancelled \u2014 refund issued`);

  const text = `Order Cancelled \u2014 #${data.orderNumber}\n\nYour order has been cancelled. Reason: ${data.reason}\n\nRefund of ${data.refundAmount} issued to your original payment method (5-10 business days).\n\n${BRAND.name}`;

  return {
    subject: `Order #${data.orderNumber} Cancelled \u2014 Refund of ${data.refundAmount} Issued`,
    html,
    text,
  };
}
