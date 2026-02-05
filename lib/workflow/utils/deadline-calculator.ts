/**
 * Deadline Calculator — BUG-02 Production Fix
 *
 * Fixes the year boundary error and calendar-day-vs-business-day confusion
 * discovered in Richardson v. Bayou test run.
 *
 * BINDING RULES:
 * 1. Parse filingDeadline directly from ISO string — NEVER extract year/month/day separately
 * 2. Buffer subtraction uses BUSINESS DAYS (skip Sat/Sun), NOT calendar days
 * 3. All output in America/Chicago timezone
 * 4. Universal buffer = 5 business days for ALL tiers
 * 5. Court holidays are a KNOWN LIMITATION for v1 (weekend-only skip)
 */

// ============================================================================
// CONSTANTS
// ============================================================================

export const DEADLINE_BUFFER_BUSINESS_DAYS = 5;
export const TIMEZONE = 'America/Chicago';

// Turnaround days by tier (business days)
export const TURNAROUND_DAYS: Record<string, number> = {
  A: 3,
  B: 4,
  C: 5,
};

// ============================================================================
// BUSINESS DAY MATH
// ============================================================================

/**
 * Subtract N business days from a date.
 * Skips Saturdays (6) and Sundays (0).
 *
 * Example: Friday Jan 31 minus 5 business days = Friday Jan 24
 * (skips Jan 25 Sat, Jan 26 Sun)
 *
 * NOTE: Court holidays are a KNOWN LIMITATION for v1.
 * Weekend-only skip is sufficient for initial release.
 */
export function subtractBusinessDays(date: Date, days: number): Date {
  const result = new Date(date.getTime());
  let remaining = days;

  while (remaining > 0) {
    result.setDate(result.getDate() - 1);
    const dayOfWeek = result.getDay();
    // Skip Saturday (6) and Sunday (0)
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      remaining--;
    }
  }

  return result;
}

/**
 * Add N business days to a date.
 * Skips Saturdays (6) and Sundays (0).
 */
export function addBusinessDays(date: Date, days: number): Date {
  const result = new Date(date.getTime());
  let remaining = days;

  while (remaining > 0) {
    result.setDate(result.getDate() + 1);
    const dayOfWeek = result.getDay();
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      remaining--;
    }
  }

  return result;
}

// ============================================================================
// TIMEZONE CONVERSION
// ============================================================================

/**
 * Convert a Date to America/Chicago timezone and return the local date parts.
 * This is essential because Vercel servers run in UTC, and a naive Date()
 * comparison gives wrong results for CST evening orders.
 */
export function toChicagoTime(date: Date): Date {
  // Get the date string in Chicago timezone
  const chicagoStr = date.toLocaleString('en-US', { timeZone: TIMEZONE });
  return new Date(chicagoStr);
}

/**
 * Format a date in America/Chicago timezone as ISO-like string with CST offset.
 * Example: "2026-02-03T17:00:00-06:00"
 */
export function formatChicagoISO(date: Date): string {
  // Get parts in Chicago timezone
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  const parts = formatter.formatToParts(date);
  const get = (type: string) => parts.find(p => p.type === type)?.value || '00';

  const year = get('year');
  const month = get('month');
  const day = get('day');
  const hour = get('hour');
  const minute = get('minute');
  const second = get('second');

  // Determine CST (-06:00) vs CDT (-05:00)
  // Simple check: CDT is March second Sunday through November first Sunday
  const chicagoDate = toChicagoTime(date);
  const monthNum = chicagoDate.getMonth(); // 0-indexed
  const isDST = monthNum >= 2 && monthNum <= 10; // Rough CDT check (March-October)
  const offset = isDST ? '-05:00' : '-06:00';

  return `${year}-${month}-${day}T${hour}:${minute}:${second}${offset}`;
}

// ============================================================================
// MAIN DEADLINE CALCULATION
// ============================================================================

export interface DeadlineCalculationResult {
  filingDeadline: string;          // Original ISO string
  internalDeadline: string;        // Filing deadline minus 5 business days, in Chicago time
  internalDeadlineDate: Date;      // As Date object
  bufferDays: number;              // Always 5
  timezone: string;                // Always 'America/Chicago'
  isExpired: boolean;              // Whether filing deadline has already passed
  warnings: string[];
}

/**
 * Calculate the internal deadline from the filing deadline.
 *
 * CRITICAL: Parse the filing deadline DIRECTLY from the ISO string.
 * NEVER extract year, month, day separately — that caused the 2025/2026 year bug.
 *
 * @param filingDeadlineISO - ISO date string from the order (e.g., "2026-01-31T17:00:00-06:00")
 * @param currentDate - Optional override for current date (for testing)
 * @returns DeadlineCalculationResult with internal deadline in America/Chicago timezone
 */
export function calculateInternalDeadline(
  filingDeadlineISO: string,
  currentDate?: Date
): DeadlineCalculationResult {
  const warnings: string[] = [];
  const now = currentDate || new Date();

  // CRITICAL: Parse the FULL ISO string directly — do NOT decompose into parts
  const filingDate = new Date(filingDeadlineISO);

  if (isNaN(filingDate.getTime())) {
    throw new Error(`Invalid filing deadline date: ${filingDeadlineISO}`);
  }

  // Check if deadline has passed (in Chicago time)
  const nowChicago = toChicagoTime(now);
  const filingChicago = toChicagoTime(filingDate);
  const isExpired = filingChicago < nowChicago;

  if (isExpired) {
    warnings.push(`Filing deadline ${filingDeadlineISO} has already passed`);
  }

  // Check if filing deadline falls on a weekend
  const filingDayOfWeek = filingChicago.getDay();
  if (filingDayOfWeek === 0 || filingDayOfWeek === 6) {
    warnings.push('Filing deadline falls on a non-business day. Please confirm.');
  }

  // Calculate internal deadline: filing deadline minus 5 BUSINESS days
  const internalDate = subtractBusinessDays(filingDate, DEADLINE_BUFFER_BUSINESS_DAYS);

  // Set time to 5:00 PM CST for the internal deadline
  const internalWithTime = new Date(internalDate);
  // Set to 5 PM in Chicago time by working with UTC offset
  const chicagoHourOffset = toChicagoTime(internalWithTime).getTimezoneOffset();
  internalWithTime.setUTCHours(17 - (chicagoHourOffset / -60), 0, 0, 0);

  return {
    filingDeadline: filingDeadlineISO,
    internalDeadline: formatChicagoISO(internalWithTime),
    internalDeadlineDate: internalWithTime,
    bufferDays: DEADLINE_BUFFER_BUSINESS_DAYS,
    timezone: TIMEZONE,
    isExpired,
    warnings,
  };
}
