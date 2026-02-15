import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount)
}

export function formatDate(date: Date | string): string {
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(new Date(date))
}

export function formatDateShort(date: Date | string): string {
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(new Date(date))
}

export function generateOrderNumber(): string {
  const now = new Date()
  const year = now.getFullYear().toString().slice(-2)
  const month = (now.getMonth() + 1).toString().padStart(2, '0')
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0')
  return `MG-${year}${month}-${random}`
}

export function calculateDeliveryDate(filingDeadline: Date, turnaround: string): Date {
  const deadline = new Date(filingDeadline)

  switch (turnaround) {
    case 'rush_48':
      deadline.setDate(deadline.getDate() - 2)
      break
    case 'rush_72':
      deadline.setDate(deadline.getDate() - 3)
      break
    default:
      deadline.setDate(deadline.getDate() - 5)
  }

  return deadline
}

export function normalizePartyName(name: string): string {
  return name.toLowerCase().trim().replace(/\s+/g, ' ')
}

/**
 * Format a currency amount from cents (Stripe format).
 * amount_paid is stored in cents from Stripe.
 */
export function formatCurrencyFromCents(amountCents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amountCents / 100)
}

/**
 * Format a date as relative time (e.g., '2 hours ago', 'yesterday').
 * Falls back to short date for older dates (> 7 days).
 */
export function formatRelativeTime(date: Date | string): string {
  const now = new Date()
  const then = new Date(date)
  const diffMs = now.getTime() - then.getTime()
  const diffSecs = Math.floor(diffMs / 1000)
  const diffMins = Math.floor(diffSecs / 60)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffSecs < 60) return 'just now'
  if (diffMins < 60) return `${diffMins} minute${diffMins !== 1 ? 's' : ''} ago`
  if (diffHours < 24) return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`
  if (diffDays === 1) return 'yesterday'
  if (diffDays < 7) return `${diffDays} days ago`
  return formatDateShort(date)
}

/**
 * Truncate a string to maxLen characters, adding ellipsis if truncated.
 */
export function truncateString(str: string, maxLen: number): string {
  if (!str || str.length <= maxLen) return str
  return str.slice(0, maxLen).trimEnd() + '\u2026'
}

/**
 * Maps legacy order statuses to the 7-status model for attorney dashboard display.
 */
export function mapToDisplayStatus(status: string): string {
  const mapping: Record<string, string> = {
    submitted: 'PAID',
    under_review: 'PAID',
    assigned: 'IN_PROGRESS',
    in_progress: 'IN_PROGRESS',
    processing: 'IN_PROGRESS',
    on_hold: 'HOLD_PENDING',
    draft_delivered: 'AWAITING_APPROVAL',
    pending_review: 'AWAITING_APPROVAL',
    revision_requested: 'REVISION_REQ',
    revision_in_progress: 'REVISION_REQ',
    revision_delivered: 'AWAITING_APPROVAL',
    completed: 'COMPLETED',
    cancelled: 'CANCELLED',
    refunded: 'CANCELLED',
    generation_failed: 'IN_PROGRESS',
    blocked: 'HOLD_PENDING',
    // Pass through 7-status values unchanged
    PAID: 'PAID',
    HOLD_PENDING: 'HOLD_PENDING',
    IN_PROGRESS: 'IN_PROGRESS',
    AWAITING_APPROVAL: 'AWAITING_APPROVAL',
    REVISION_REQ: 'REVISION_REQ',
    COMPLETED: 'COMPLETED',
    CANCELLED: 'CANCELLED',
  }
  return mapping[status] || status
}
