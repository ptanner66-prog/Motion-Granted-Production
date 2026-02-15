/**
 * PARTIAL DELIVERY HANDLER
 *
 * TASK-14: When Phase X blocks, send partial delivery with AIS.
 *
 * Audit Evidence (Pelican order):
 * Phase X blocked at 11:45 PM CST. The AIS correctly lists all
 * outstanding items. But if the attorney isn't notified until
 * Phase X unblocks, completion work can't begin.
 * With a 02/28/2026 filing deadline, every day matters.
 *
 * Solution:
 * - Send partial_delivery notification on Phase X block
 * - Include AIS, placeholder list, grade, estimated completion time
 * - Make draft available in portal as 'pending_completion'
 * - Show checklist of required actions
 *
 * @module partial-delivery-handler
 */

import { sendEmail } from '@/lib/email/email-service';
import { logger } from '@/lib/logger';

// =======================================================================
// TYPES
// =======================================================================

export interface UnresolvedPlaceholder {
  placeholder: string;
  type: 'citation' | 'attorney_info' | 'date' | 'other';
  requiredAction: string;
  complexity: 'simple' | 'moderate' | 'complex';
}

export interface PartialDeliveryData {
  orderId: string;
  customerEmail: string;
  customerName: string;
  caseCaption: string;
  motionType: string;
  currentGrade: string;
  numericScore: number;
  categoryScores: Record<string, number>;
  placeholders: UnresolvedPlaceholder[];
  aisContent: string;
  draftDocumentUrl?: string;
  estimatedCompletionMinutes: number;
}

export interface PartialDeliveryResult {
  sent: boolean;
  notificationType: 'partial_delivery';
  recipientEmail: string;
  timestamp: string;
  checklist: string[];
}

// =======================================================================
// MAIN FUNCTION
// =======================================================================

/**
 * Send partial delivery notification when Phase X blocks.
 */
export async function sendPartialDeliveryNotification(
  data: PartialDeliveryData
): Promise<PartialDeliveryResult> {
  const checklist = generateChecklist(data.placeholders);
  const estimatedTime = formatEstimatedTime(data.estimatedCompletionMinutes);

  // Build email content
  const subject = `[Action Required] Your ${data.motionType} Draft Needs Completion — ${data.caseCaption}`;

  const html = `
<p>Dear ${escapeHtml(data.customerName)},</p>

<p>Your ${escapeHtml(data.motionType)} draft for <strong>${escapeHtml(data.caseCaption)}</strong> is nearly complete, but requires your input before delivery.</p>

<p><strong>Current Grade:</strong> ${escapeHtml(data.currentGrade)} (${data.numericScore}%)</p>

<h3>Required Actions:</h3>
<ol>
${checklist.map(item => `<li>${escapeHtml(item)}</li>`).join('\n')}
</ol>

<p><strong>Estimated Completion Time:</strong> ${escapeHtml(estimatedTime)}</p>

<h3>What Happens Next:</h3>
<ol>
<li>Complete the required actions listed above</li>
<li>Provide the missing information through your client portal</li>
<li>We'll finalize and deliver your motion</li>
</ol>

<h3>Access Your Draft</h3>
<p>Your work product is available in your client portal in a "Pending Completion" state. Please note this draft is <strong>NOT READY TO FILE</strong> until all placeholders are resolved.</p>

<p>The Attorney Information Sheet (AIS) with full quality analysis has been generated and is available in your portal.</p>

<p>Thank you for choosing Motion Granted.</p>

<p>Best regards,<br/>The Motion Granted Team</p>
`.trim();

  const result = await sendEmail(
    data.customerEmail,
    subject,
    html,
    { orderId: data.orderId }
  );

  if (!result.success) {
    logger.error('[PARTIAL-DELIVERY] Failed to send notification', {
      orderId: data.orderId,
      error: result.error,
    });
  } else {
    logger.info('[PARTIAL-DELIVERY] Notification sent', {
      orderId: data.orderId,
      recipientEmail: data.customerEmail,
      placeholderCount: data.placeholders.length,
    });
  }

  return {
    sent: result.success,
    notificationType: 'partial_delivery',
    recipientEmail: data.customerEmail,
    timestamp: new Date().toISOString(),
    checklist,
  };
}

// =======================================================================
// HELPERS
// =======================================================================

/**
 * Escape HTML special characters for safe email rendering.
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Generate human-readable checklist from placeholders.
 */
function generateChecklist(placeholders: UnresolvedPlaceholder[]): string[] {
  const checklist: string[] = [];

  // Group by type
  const citationPlaceholders = placeholders.filter(p => p.type === 'citation');
  const infoPlaceholders = placeholders.filter(p => p.type === 'attorney_info');
  const otherPlaceholders = placeholders.filter(p => p.type !== 'citation' && p.type !== 'attorney_info');

  // Attorney info
  if (infoPlaceholders.length > 0) {
    const fields = infoPlaceholders.map(p => p.placeholder.replace(/[\[\]]/g, ''));
    checklist.push(`Provide missing attorney information: ${fields.join(', ')}`);
  }

  // Citations
  if (citationPlaceholders.length > 0) {
    checklist.push(`Research and provide ${citationPlaceholders.length} missing citation(s)`);
    for (const p of citationPlaceholders) {
      checklist.push(`  -> ${p.requiredAction}`);
    }
  }

  // Other
  for (const p of otherPlaceholders) {
    checklist.push(p.requiredAction);
  }

  return checklist;
}

/**
 * Format estimated completion time.
 */
function formatEstimatedTime(minutes: number): string {
  if (minutes < 30) {
    return '15-30 minutes once information provided';
  } else if (minutes < 60) {
    return '30-60 minutes once information provided';
  } else {
    const hours = Math.ceil(minutes / 60);
    return `${hours}-${hours + 1} hours once information provided`;
  }
}

/**
 * Estimate completion time based on placeholders.
 */
export function estimateCompletionTime(placeholders: UnresolvedPlaceholder[]): number {
  let minutes = 0;

  for (const p of placeholders) {
    switch (p.complexity) {
      case 'simple':
        minutes += 5;
        break;
      case 'moderate':
        minutes += 15;
        break;
      case 'complex':
        minutes += 30;
        break;
    }
  }

  // Add processing overhead
  minutes += 10;

  return minutes;
}

/**
 * Classify placeholder type from text.
 */
export function classifyPlaceholder(placeholder: string): UnresolvedPlaceholder['type'] {
  const p = placeholder.toLowerCase();

  if (p.includes('citation') || p.includes('cite') || p.includes('authority')) {
    return 'citation';
  }

  if (p.includes('bar') || p.includes('firm') || p.includes('attorney') ||
      p.includes('address') || p.includes('phone')) {
    return 'attorney_info';
  }

  if (p.includes('date') || p.includes('deadline')) {
    return 'date';
  }

  return 'other';
}
