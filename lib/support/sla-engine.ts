/**
 * SLA Engine — Support Ticket SLA Management
 *
 * Calculates response/resolution deadlines based on ticket priority.
 * Tracks SLA breaches and escalates automatically.
 *
 * Priority tiers:
 *   P1 (critical) — 1hr response, 4hr resolution
 *   P2 (high)     — 4hr response, 24hr resolution
 *   P3 (normal)   — 8hr response, 48hr resolution
 *   P4 (low)      — 24hr response, 72hr resolution
 */

import { createLogger } from '@/lib/logging/logger';

const logger = createLogger('sla-engine');

// ============================================================================
// TYPES
// ============================================================================

export type TicketPriority = 'P1' | 'P2' | 'P3' | 'P4';
export type TicketStatus = 'open' | 'in_progress' | 'waiting_on_customer' | 'resolved' | 'closed';

export interface SLAPolicy {
  priority: TicketPriority;
  responseMinutes: number;
  resolutionMinutes: number;
  escalationMinutes: number;
}

export interface SLADeadlines {
  responseBy: Date;
  resolutionBy: Date;
  escalationAt: Date;
  isBreached: boolean;
  breachType: 'none' | 'response' | 'resolution' | 'both';
}

export interface SupportTicket {
  id: string;
  orderId?: string;
  senderEmail: string;
  senderName?: string;
  subject: string;
  body: string;
  priority: TicketPriority;
  status: TicketStatus;
  assignedTo?: string;
  firstResponseAt?: string;
  resolvedAt?: string;
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// SLA POLICIES
// ============================================================================

const SLA_POLICIES: Record<TicketPriority, SLAPolicy> = {
  P1: { priority: 'P1', responseMinutes: 60,   resolutionMinutes: 240,  escalationMinutes: 30 },
  P2: { priority: 'P2', responseMinutes: 240,  resolutionMinutes: 1440, escalationMinutes: 120 },
  P3: { priority: 'P3', responseMinutes: 480,  resolutionMinutes: 2880, escalationMinutes: 360 },
  P4: { priority: 'P4', responseMinutes: 1440, resolutionMinutes: 4320, escalationMinutes: 720 },
};

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Get SLA policy for a given priority.
 */
export function getSLAPolicy(priority: TicketPriority): SLAPolicy {
  return SLA_POLICIES[priority];
}

/**
 * Calculate SLA deadlines for a ticket.
 */
export function calculateDeadlines(createdAt: Date, priority: TicketPriority): SLADeadlines {
  const policy = SLA_POLICIES[priority];
  const now = new Date();

  const responseBy = new Date(createdAt.getTime() + policy.responseMinutes * 60 * 1000);
  const resolutionBy = new Date(createdAt.getTime() + policy.resolutionMinutes * 60 * 1000);
  const escalationAt = new Date(createdAt.getTime() + policy.escalationMinutes * 60 * 1000);

  const responseBreached = now > responseBy;
  const resolutionBreached = now > resolutionBy;

  let breachType: SLADeadlines['breachType'] = 'none';
  if (responseBreached && resolutionBreached) breachType = 'both';
  else if (resolutionBreached) breachType = 'resolution';
  else if (responseBreached) breachType = 'response';

  return {
    responseBy,
    resolutionBy,
    escalationAt,
    isBreached: responseBreached || resolutionBreached,
    breachType,
  };
}

/**
 * Auto-classify ticket priority based on subject/body content.
 */
export function classifyPriority(subject: string, body: string, hasOrderId: boolean): TicketPriority {
  const combined = `${subject} ${body}`.toLowerCase();

  // P1: urgent keywords + has an active order
  const urgentPatterns = [
    /filing.?deadline/,
    /court.?date.?tomorrow/,
    /urgent/,
    /emergency/,
    /hearing.?(today|tomorrow)/,
  ];
  if (hasOrderId && urgentPatterns.some(p => p.test(combined))) {
    return 'P1';
  }

  // P2: order-related issues
  const highPatterns = [
    /order.?\d+/,
    /wrong.?(motion|document|filing)/,
    /error.?in.?(draft|motion)/,
    /missing.?(citation|document|page)/,
    /revision.?request/,
    /refund/,
    /billing.?(issue|error|problem)/,
  ];
  if (highPatterns.some(p => p.test(combined))) {
    return 'P2';
  }

  // P3: general questions with order context
  if (hasOrderId) {
    return 'P3';
  }

  // P4: general inquiries
  return 'P4';
}

/**
 * Extract order ID from email body/subject.
 * Matches patterns like MG-2026-0001, #MG-2026-0001, Order MG-2026-0001
 */
export function extractOrderId(text: string): string | null {
  const match = text.match(/MG-\d{4}-\d{4,}/i);
  return match ? match[0].toUpperCase() : null;
}

/**
 * Check all open tickets for SLA breaches and return breached ticket IDs.
 */
export function findBreachedTickets(tickets: SupportTicket[]): Array<{
  ticketId: string;
  priority: TicketPriority;
  breachType: SLADeadlines['breachType'];
  minutesOverdue: number;
}> {
  const breached: Array<{
    ticketId: string;
    priority: TicketPriority;
    breachType: SLADeadlines['breachType'];
    minutesOverdue: number;
  }> = [];

  const now = new Date();

  for (const ticket of tickets) {
    if (ticket.status === 'resolved' || ticket.status === 'closed') continue;

    const deadlines = calculateDeadlines(new Date(ticket.createdAt), ticket.priority);

    if (deadlines.isBreached) {
      const relevantDeadline = deadlines.breachType === 'response'
        ? deadlines.responseBy
        : deadlines.resolutionBy;
      const minutesOverdue = Math.round((now.getTime() - relevantDeadline.getTime()) / (60 * 1000));

      breached.push({
        ticketId: ticket.id,
        priority: ticket.priority,
        breachType: deadlines.breachType,
        minutesOverdue,
      });
    }
  }

  logger.info('sla.breach_check', {
    totalTickets: String(tickets.length),
    breachedCount: String(breached.length),
  });

  return breached;
}
