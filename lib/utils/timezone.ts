/**
 * Centralized timezone utilities for Motion Granted.
 *
 * RULES:
 * - ALL dates stored in DB as UTC (ISO 8601)
 * - ALL user-facing dates displayed in America/Chicago (Central Time)
 * - ALL deadline comparisons done in America/Chicago after conversion
 *
 * Created: SP15 (0B-2)
 * Resolves: C-018 (timezone handling fragmentation)
 */

/** The canonical timezone for Motion Granted operations */
export const TIMEZONE = 'America/Chicago' as const;

/**
 * Convert a Date to America/Chicago timezone.
 *
 * Creates a new Date object where the UTC values represent the Central Time
 * equivalents of the input date. This allows standard Date methods (getFullYear,
 * getMonth, getDate, etc.) to return Central Time values.
 *
 * @param date - Any Date object (typically in UTC or local time)
 * @returns A new Date adjusted to represent Central Time
 */
export function toChicagoTime(date: Date): Date {
  const chicagoString = date.toLocaleString('en-US', { timeZone: TIMEZONE });
  return new Date(chicagoString);
}

/**
 * Format a date for display in Central Time.
 *
 * @param date - Date object or ISO string
 * @param options - Intl.DateTimeFormat options (defaults to readable date+time)
 * @returns Formatted date string in Central Time
 * @throws Error if the date is invalid
 *
 * @example
 * formatCentral(new Date()) // "Feb 12, 2026, 3:45 PM"
 * formatCentral(new Date(), { dateStyle: 'full' }) // "Thursday, February 12, 2026"
 */
export function formatCentral(
  date: Date | string,
  options?: Intl.DateTimeFormatOptions
): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) {
    throw new Error(`Invalid date: ${String(date)}`);
  }
  return d.toLocaleString('en-US', {
    timeZone: TIMEZONE,
    ...(options ?? { dateStyle: 'medium', timeStyle: 'short' }),
  });
}

/**
 * Format a date for filing deadline display.
 * Uses long format: "Thursday, February 12, 2026"
 *
 * @param date - Date object or ISO string
 * @returns Formatted deadline string in Central Time
 * @throws Error if the date is invalid
 */
export function formatDeadline(date: Date | string): string {
  return formatCentral(date, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

/**
 * Get the current time in Central timezone.
 *
 * @returns Date object adjusted to Central Time
 */
export function nowCentral(): Date {
  return toChicagoTime(new Date());
}

/**
 * Build a TZ-prefixed cron expression for Inngest scheduling.
 *
 * @param cronExpression - Standard cron expression (e.g., "0 9 * * *")
 * @returns TZ-prefixed cron string (e.g., "TZ=America/Chicago 0 9 * * *")
 *
 * @example
 * cronCentral('0 9 * * *') // "TZ=America/Chicago 0 9 * * *"
 */
export function cronCentral(cronExpression: string): string {
  return `TZ=${TIMEZONE} ${cronExpression}`;
}

/**
 * Check if a date falls on a weekend (Saturday or Sunday) in Central Time.
 *
 * @param date - Date to check
 * @returns true if the date is a Saturday or Sunday in Central Time
 */
export function isWeekendCentral(date: Date): boolean {
  const central = toChicagoTime(date);
  const day = central.getDay();
  return day === 0 || day === 6;
}
