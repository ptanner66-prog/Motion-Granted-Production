/**
 * Deadline Validator — BUG-01 Production Fix
 *
 * Pre-Phase I validation gate that performs FOUR checks before any
 * billable processing begins. This prevents the malpractice exposure
 * of producing a filing package for an expired deadline.
 *
 * ALL date comparisons use America/Chicago timezone.
 *
 * CHECKS:
 * 1. Expired Deadline — filingDeadline < current_date
 * 2. Insufficient Turnaround — filingDeadline < (current_date + tier_turnaround_days)
 * 3. Null/Missing Deadline — filingDeadline is null/undefined/empty
 * 4. Weekend/Holiday Warning — filingDeadline on Sat/Sun (non-blocking)
 */

import {
  toChicagoTime,
  addBusinessDays,
  TURNAROUND_DAYS,
  TIMEZONE,
} from '../utils/deadline-calculator';

// ============================================================================
// TYPES
// ============================================================================

export interface DeadlineValidationResult {
  valid: boolean;
  blocked: boolean;
  reason?: string;
  warnings: string[];
  checks: {
    expiredDeadline: { passed: boolean; message?: string };
    insufficientTurnaround: { passed: boolean; message?: string };
    nullDeadline: { passed: boolean; flagged: boolean; message?: string };
    weekendHoliday: { passed: boolean; warning?: string };
  };
}

// ============================================================================
// MAIN VALIDATOR
// ============================================================================

/**
 * Validate the filing deadline BEFORE any billable processing begins.
 * This MUST run in the initialize-workflow step, before Phase I.
 *
 * @param filingDeadline - ISO date string from the order, or null/undefined
 * @param tier - 'A' | 'B' | 'C'
 * @param currentDate - Optional override for testing
 */
export function validateDeadline(
  filingDeadline: string | null | undefined,
  tier: string,
  currentDate?: Date
): DeadlineValidationResult {
  const now = currentDate || new Date();
  const warnings: string[] = [];

  const result: DeadlineValidationResult = {
    valid: true,
    blocked: false,
    warnings: [],
    checks: {
      expiredDeadline: { passed: true },
      insufficientTurnaround: { passed: true },
      nullDeadline: { passed: true, flagged: false },
      weekendHoliday: { passed: true },
    },
  };

  // ========================================================================
  // CHECK 3 — Null/Missing Deadline (check first so other checks can bail)
  // ========================================================================
  if (!filingDeadline || filingDeadline.trim() === '') {
    result.checks.nullDeadline = {
      passed: true, // Proceed but flag
      flagged: true,
      message: 'No filing deadline specified. Flagged for manual review. Some motions (e.g., proactive motions in limine) may not have hard deadlines.',
    };
    warnings.push('No filing deadline — flagged for manual review');
    result.warnings = warnings;
    return result; // Skip remaining checks — no date to compare
  }

  // Parse the deadline
  const deadlineDate = new Date(filingDeadline);
  if (isNaN(deadlineDate.getTime())) {
    result.valid = false;
    result.blocked = true;
    result.reason = `Invalid filing deadline format: "${filingDeadline}". Expected ISO date string.`;
    result.checks.expiredDeadline = { passed: false, message: result.reason };
    return result;
  }

  // CRITICAL: Convert BOTH dates to America/Chicago timezone before ANY comparison
  const nowChicago = toChicagoTime(now);
  const deadlineChicago = toChicagoTime(deadlineDate);

  // ========================================================================
  // CHECK 1 — Expired Deadline
  // ========================================================================
  // Compare dates only (ignore time component for day-level check)
  const nowDateOnly = new Date(nowChicago.getFullYear(), nowChicago.getMonth(), nowChicago.getDate());
  const deadlineDateOnly = new Date(deadlineChicago.getFullYear(), deadlineChicago.getMonth(), deadlineChicago.getDate());

  if (deadlineDateOnly < nowDateOnly) {
    const formattedDeadline = deadlineChicago.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    result.valid = false;
    result.blocked = true;
    result.reason = `Your filing deadline of ${formattedDeadline} has passed. Please seek a court extension before reordering.`;
    result.checks.expiredDeadline = {
      passed: false,
      message: result.reason,
    };
    result.warnings = warnings;
    return result;
  }
  result.checks.expiredDeadline = { passed: true };

  // ========================================================================
  // CHECK 2 — Insufficient Turnaround
  // ========================================================================
  const turnaroundDays = TURNAROUND_DAYS[tier] || TURNAROUND_DAYS['B'];
  const minimumDeliveryDate = addBusinessDays(now, turnaroundDays);
  const minDeliveryChicago = toChicagoTime(minimumDeliveryDate);
  const minDeliveryDateOnly = new Date(minDeliveryChicago.getFullYear(), minDeliveryChicago.getMonth(), minDeliveryChicago.getDate());

  if (deadlineDateOnly < minDeliveryDateOnly) {
    result.valid = false;
    result.blocked = true;
    result.reason = `Insufficient time to meet filing deadline at standard turnaround for Tier ${tier} (${turnaroundDays} business days). Consider requesting a court extension.`;
    result.checks.insufficientTurnaround = {
      passed: false,
      message: result.reason,
    };
    result.warnings = warnings;
    return result;
  }
  result.checks.insufficientTurnaround = { passed: true };

  // ========================================================================
  // CHECK 4 — Weekend/Holiday Warning (non-blocking)
  // ========================================================================
  const deadlineDayOfWeek = deadlineChicago.getDay();
  if (deadlineDayOfWeek === 0 || deadlineDayOfWeek === 6) {
    const dayName = deadlineDayOfWeek === 0 ? 'Sunday' : 'Saturday';
    const warning = `Filing deadline falls on a ${dayName}. Please confirm the correct filing date.`;
    warnings.push(warning);
    result.checks.weekendHoliday = { passed: true, warning };
  }

  result.warnings = warnings;
  return result;
}
