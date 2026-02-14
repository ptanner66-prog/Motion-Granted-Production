/**
 * Deadline Calculator with Court Holiday Awareness (Task 52)
 *
 * Calculates filing deadlines accounting for court holidays and filing rules.
 *
 * Rules by jurisdiction:
 * - California State: CCP § 1005(b) — 16 court days notice for most motions
 * - California Federal: Local rules vary by district
 * - Federal 5th Circuit: 21 days before hearing (FRCP 6)
 * - Federal 9th Circuit: 28 days before hearing
 * - Louisiana: La. CCP Art. 1571 — 15 days
 *
 * Source: Chunk 8, Task 52 - Code Mode Spec Section 14
 */

import { createClient } from '@/lib/supabase/server';

import { createLogger } from '@/lib/security/logger';

const log = createLogger('legal-deadline-calculator');
// ============================================================================
// TYPES
// ============================================================================

export interface DeadlineResult {
  filingDeadline: Date;
  serviceDeadline: Date;
  oppositionDeadline: Date | null;
  replyDeadline: Date | null;
  hearingDate: Date | null;
  isRushRequired: boolean;
  warnings: string[];
  courtDaysUsed: number;
}

export interface DeadlineInput {
  jurisdiction: string;
  motionType: string;
  targetHearingDate?: Date;
  filingDate?: Date;
  rushRequested: boolean;
}

// ============================================================================
// JURISDICTION NOTICE PERIODS (in court days unless specified)
// ============================================================================

interface NoticePeriodConfig {
  filing: number; // Days before hearing to file motion
  opposition: number; // Days before hearing to file opposition
  reply: number; // Days before hearing to file reply
  serviceBuffer: number; // Extra days for service
  isCalendarDays: boolean; // true = calendar days, false = court days
}

const NOTICE_PERIODS: Record<string, Record<string, NoticePeriodConfig>> = {
  ca_state: {
    default: { filing: 16, opposition: 9, reply: 5, serviceBuffer: 5, isCalendarDays: false },
    msj: { filing: 75, opposition: 14, reply: 5, serviceBuffer: 5, isCalendarDays: true }, // CCP 437c - 75 calendar days
    msa: { filing: 75, opposition: 14, reply: 5, serviceBuffer: 5, isCalendarDays: true },
    demurrer: { filing: 16, opposition: 9, reply: 5, serviceBuffer: 5, isCalendarDays: false },
    motion_to_compel: { filing: 16, opposition: 9, reply: 5, serviceBuffer: 5, isCalendarDays: false },
    motion_for_sanctions: { filing: 21, opposition: 9, reply: 5, serviceBuffer: 5, isCalendarDays: true },
  },
  ca_federal: {
    default: { filing: 28, opposition: 14, reply: 7, serviceBuffer: 3, isCalendarDays: true },
    msj: { filing: 28, opposition: 21, reply: 14, serviceBuffer: 3, isCalendarDays: true },
    msa: { filing: 28, opposition: 21, reply: 14, serviceBuffer: 3, isCalendarDays: true },
  },
  federal_5th: {
    default: { filing: 21, opposition: 14, reply: 7, serviceBuffer: 3, isCalendarDays: true },
    msj: { filing: 21, opposition: 14, reply: 7, serviceBuffer: 3, isCalendarDays: true },
  },
  federal_9th: {
    default: { filing: 28, opposition: 21, reply: 14, serviceBuffer: 3, isCalendarDays: true },
    msj: { filing: 28, opposition: 21, reply: 14, serviceBuffer: 3, isCalendarDays: true },
  },
  la_state: {
    default: { filing: 15, opposition: 8, reply: 3, serviceBuffer: 5, isCalendarDays: true },
    msj: { filing: 30, opposition: 15, reply: 5, serviceBuffer: 5, isCalendarDays: true },
  },
};

// ============================================================================
// FEDERAL HOLIDAYS (observed dates)
// ============================================================================

const FEDERAL_HOLIDAYS_2024: Array<{ date: string; name: string }> = [
  { date: '2024-01-01', name: "New Year's Day" },
  { date: '2024-01-15', name: 'Martin Luther King Jr. Day' },
  { date: '2024-02-19', name: "Presidents' Day" },
  { date: '2024-05-27', name: 'Memorial Day' },
  { date: '2024-06-19', name: 'Juneteenth' },
  { date: '2024-07-04', name: 'Independence Day' },
  { date: '2024-09-02', name: 'Labor Day' },
  { date: '2024-10-14', name: 'Columbus Day' },
  { date: '2024-11-11', name: "Veterans Day" },
  { date: '2024-11-28', name: 'Thanksgiving Day' },
  { date: '2024-12-25', name: 'Christmas Day' },
];

const FEDERAL_HOLIDAYS_2025: Array<{ date: string; name: string }> = [
  { date: '2025-01-01', name: "New Year's Day" },
  { date: '2025-01-20', name: 'Martin Luther King Jr. Day' },
  { date: '2025-02-17', name: "Presidents' Day" },
  { date: '2025-05-26', name: 'Memorial Day' },
  { date: '2025-06-19', name: 'Juneteenth' },
  { date: '2025-07-04', name: 'Independence Day' },
  { date: '2025-09-01', name: 'Labor Day' },
  { date: '2025-10-13', name: 'Columbus Day' },
  { date: '2025-11-11', name: "Veterans Day" },
  { date: '2025-11-27', name: 'Thanksgiving Day' },
  { date: '2025-12-25', name: 'Christmas Day' },
];

const FEDERAL_HOLIDAYS_2026: Array<{ date: string; name: string }> = [
  { date: '2026-01-01', name: "New Year's Day" },
  { date: '2026-01-19', name: 'Martin Luther King Jr. Day' },
  { date: '2026-02-16', name: "Presidents' Day" },
  { date: '2026-05-25', name: 'Memorial Day' },
  { date: '2026-06-19', name: 'Juneteenth' },
  { date: '2026-07-03', name: 'Independence Day (observed)' },
  { date: '2026-09-07', name: 'Labor Day' },
  { date: '2026-10-12', name: 'Columbus Day' },
  { date: '2026-11-11', name: "Veterans Day" },
  { date: '2026-11-26', name: 'Thanksgiving Day' },
  { date: '2026-12-25', name: 'Christmas Day' },
];

// California additional court holidays
const CALIFORNIA_HOLIDAYS: Array<{ date: string; name: string; year: number }> = [
  // 2024
  { date: '2024-03-31', name: 'César Chávez Day (observed)', year: 2024 },
  { date: '2024-11-29', name: 'Day After Thanksgiving', year: 2024 },
  // 2025
  { date: '2025-03-31', name: 'César Chávez Day', year: 2025 },
  { date: '2025-11-28', name: 'Day After Thanksgiving', year: 2025 },
  // 2026
  { date: '2026-03-30', name: 'César Chávez Day (observed)', year: 2026 },
  { date: '2026-11-27', name: 'Day After Thanksgiving', year: 2026 },
];

// Louisiana additional holidays
const LOUISIANA_HOLIDAYS: Array<{ date: string; name: string; year: number }> = [
  // Mardi Gras (varies by year)
  { date: '2024-02-13', name: 'Mardi Gras', year: 2024 },
  { date: '2025-03-04', name: 'Mardi Gras', year: 2025 },
  { date: '2026-02-17', name: 'Mardi Gras', year: 2026 },
  // Good Friday
  { date: '2024-03-29', name: 'Good Friday', year: 2024 },
  { date: '2025-04-18', name: 'Good Friday', year: 2025 },
  { date: '2026-04-03', name: 'Good Friday', year: 2026 },
];

// ============================================================================
// HOLIDAY FUNCTIONS
// ============================================================================

/**
 * Get all court holidays for a jurisdiction and year
 */
export function getCourtHolidays(jurisdiction: string, year: number): Date[] {
  const holidays: Date[] = [];

  // Get federal holidays for the year
  let federalHolidays: Array<{ date: string; name: string }>;
  switch (year) {
    case 2024:
      federalHolidays = FEDERAL_HOLIDAYS_2024;
      break;
    case 2025:
      federalHolidays = FEDERAL_HOLIDAYS_2025;
      break;
    case 2026:
      federalHolidays = FEDERAL_HOLIDAYS_2026;
      break;
    default:
      // For other years, use 2025 as template and adjust
      federalHolidays = FEDERAL_HOLIDAYS_2025;
  }

  // Add federal holidays
  for (const holiday of federalHolidays) {
    holidays.push(new Date(holiday.date + 'T00:00:00'));
  }

  // Add state-specific holidays
  if (jurisdiction.includes('ca_')) {
    for (const holiday of CALIFORNIA_HOLIDAYS) {
      if (holiday.year === year) {
        holidays.push(new Date(holiday.date + 'T00:00:00'));
      }
    }
  }

  if (jurisdiction.includes('la_')) {
    for (const holiday of LOUISIANA_HOLIDAYS) {
      if (holiday.year === year) {
        holidays.push(new Date(holiday.date + 'T00:00:00'));
      }
    }
  }

  return holidays;
}

/**
 * Check if a date is a court day (not weekend, not holiday)
 */
export function isCourtDay(date: Date, jurisdiction: string): boolean {
  const day = date.getDay();

  // Weekend check
  if (day === 0 || day === 6) {
    return false;
  }

  // Holiday check
  const holidays = getCourtHolidays(jurisdiction, date.getFullYear());
  const dateStr = date.toISOString().split('T')[0];

  for (const holiday of holidays) {
    if (holiday.toISOString().split('T')[0] === dateStr) {
      return false;
    }
  }

  return true;
}

/**
 * Add court days to a date (skipping weekends and holidays)
 */
export function addCourtDays(startDate: Date, days: number, jurisdiction: string): Date {
  const result = new Date(startDate);
  let daysAdded = 0;
  const direction = days >= 0 ? 1 : -1;
  const targetDays = Math.abs(days);

  while (daysAdded < targetDays) {
    result.setDate(result.getDate() + direction);
    if (isCourtDay(result, jurisdiction)) {
      daysAdded++;
    }
  }

  return result;
}

/**
 * Add calendar days to a date
 */
function addCalendarDays(startDate: Date, days: number): Date {
  const result = new Date(startDate);
  result.setDate(result.getDate() + days);
  return result;
}

/**
 * Move date to next business day if it falls on weekend/holiday
 */
function moveToNextCourtDay(date: Date, jurisdiction: string): Date {
  const result = new Date(date);
  while (!isCourtDay(result, jurisdiction)) {
    result.setDate(result.getDate() + 1);
  }
  return result;
}

// ============================================================================
// NOTICE PERIOD HELPERS
// ============================================================================

/**
 * Get notice period configuration for jurisdiction and motion type
 */
export function getNoticePeriod(jurisdiction: string, motionType: string): number {
  const normalizedMotion = motionType.toLowerCase().replace(/\s+/g, '_');
  const jurisdictionConfig = NOTICE_PERIODS[jurisdiction] || NOTICE_PERIODS['ca_state'];
  const config = jurisdictionConfig[normalizedMotion] || jurisdictionConfig['default'];
  return config.filing;
}

/**
 * Get full notice period config
 */
function getNoticePeriodConfig(jurisdiction: string, motionType: string): NoticePeriodConfig {
  const normalizedMotion = motionType.toLowerCase().replace(/\s+/g, '_');
  const jurisdictionConfig = NOTICE_PERIODS[jurisdiction] || NOTICE_PERIODS['ca_state'];
  return jurisdictionConfig[normalizedMotion] || jurisdictionConfig['default'];
}

// ============================================================================
// MAIN CALCULATOR
// ============================================================================

/**
 * Calculate all deadlines for a motion filing
 */
export async function calculateDeadlines(input: DeadlineInput): Promise<DeadlineResult> {
  const config = getNoticePeriodConfig(input.jurisdiction, input.motionType);
  const warnings: string[] = [];

  let filingDeadline: Date;
  let serviceDeadline: Date;
  let oppositionDeadline: Date | null = null;
  let replyDeadline: Date | null = null;
  let hearingDate: Date | null = input.targetHearingDate || null;
  let isRushRequired = false;
  let courtDaysUsed = 0;

  // Calculate based on whether we have a target hearing date or filing date
  if (input.targetHearingDate) {
    hearingDate = input.targetHearingDate;

    // Calculate filing deadline (working backwards from hearing)
    if (config.isCalendarDays) {
      filingDeadline = addCalendarDays(hearingDate, -config.filing);
      filingDeadline = moveToNextCourtDay(filingDeadline, input.jurisdiction);
      courtDaysUsed = config.filing;
    } else {
      filingDeadline = addCourtDays(hearingDate, -config.filing, input.jurisdiction);
      courtDaysUsed = config.filing;
    }

    // Calculate service deadline (before filing deadline)
    serviceDeadline = addCalendarDays(filingDeadline, -config.serviceBuffer);
    serviceDeadline = moveToNextCourtDay(serviceDeadline, input.jurisdiction);

    // Calculate opposition deadline
    if (config.isCalendarDays) {
      oppositionDeadline = addCalendarDays(hearingDate, -config.opposition);
    } else {
      oppositionDeadline = addCourtDays(hearingDate, -config.opposition, input.jurisdiction);
    }
    oppositionDeadline = moveToNextCourtDay(oppositionDeadline, input.jurisdiction);

    // Calculate reply deadline
    if (config.isCalendarDays) {
      replyDeadline = addCalendarDays(hearingDate, -config.reply);
    } else {
      replyDeadline = addCourtDays(hearingDate, -config.reply, input.jurisdiction);
    }
    replyDeadline = moveToNextCourtDay(replyDeadline, input.jurisdiction);

  } else if (input.filingDate) {
    filingDeadline = input.filingDate;

    // Calculate service deadline (before filing)
    serviceDeadline = addCalendarDays(filingDeadline, -config.serviceBuffer);
    serviceDeadline = moveToNextCourtDay(serviceDeadline, input.jurisdiction);

    // Calculate earliest possible hearing date
    if (config.isCalendarDays) {
      hearingDate = addCalendarDays(filingDeadline, config.filing);
    } else {
      hearingDate = addCourtDays(filingDeadline, config.filing, input.jurisdiction);
    }
    hearingDate = moveToNextCourtDay(hearingDate, input.jurisdiction);
    courtDaysUsed = config.filing;

    // Calculate opposition and reply from hearing
    if (config.isCalendarDays) {
      oppositionDeadline = addCalendarDays(hearingDate, -config.opposition);
      replyDeadline = addCalendarDays(hearingDate, -config.reply);
    } else {
      oppositionDeadline = addCourtDays(hearingDate, -config.opposition, input.jurisdiction);
      replyDeadline = addCourtDays(hearingDate, -config.reply, input.jurisdiction);
    }
    oppositionDeadline = moveToNextCourtDay(oppositionDeadline, input.jurisdiction);
    replyDeadline = moveToNextCourtDay(replyDeadline, input.jurisdiction);

  } else {
    // No dates provided - calculate from today
    const today = new Date();
    filingDeadline = moveToNextCourtDay(today, input.jurisdiction);
    serviceDeadline = addCalendarDays(filingDeadline, -config.serviceBuffer);
    serviceDeadline = moveToNextCourtDay(serviceDeadline, input.jurisdiction);

    if (config.isCalendarDays) {
      hearingDate = addCalendarDays(filingDeadline, config.filing);
    } else {
      hearingDate = addCourtDays(filingDeadline, config.filing, input.jurisdiction);
    }
    hearingDate = moveToNextCourtDay(hearingDate, input.jurisdiction);
    courtDaysUsed = config.filing;
  }

  // Check if rush is required
  const today = new Date();
  const daysUntilFiling = Math.ceil((filingDeadline.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

  if (daysUntilFiling < 3) {
    isRushRequired = true;
    warnings.push('Rush processing required: Filing deadline is within 3 days');
  }

  if (daysUntilFiling < 0) {
    warnings.push('WARNING: Filing deadline has already passed');
  }

  // Check for holiday proximity
  const holidays = getCourtHolidays(input.jurisdiction, filingDeadline.getFullYear());
  for (const holiday of holidays) {
    const daysToHoliday = Math.ceil((holiday.getTime() - filingDeadline.getTime()) / (1000 * 60 * 60 * 24));
    if (daysToHoliday >= -1 && daysToHoliday <= 3) {
      warnings.push(`Court holiday near filing deadline: ${holiday.toLocaleDateString()}`);
    }
  }

  // Rush override if explicitly requested
  if (input.rushRequested) {
    isRushRequired = true;
  }

  return {
    filingDeadline,
    serviceDeadline,
    oppositionDeadline,
    replyDeadline,
    hearingDate,
    isRushRequired,
    warnings,
    courtDaysUsed,
  };
}

// ============================================================================
// DATABASE OPERATIONS
// ============================================================================

/**
 * Load holidays from database (if populated)
 */
export async function loadHolidaysFromDatabase(
  jurisdiction: string,
  year: number
): Promise<Date[]> {
  try {
    const supabase = await createClient();

    const startOfYear = new Date(year, 0, 1);
    const endOfYear = new Date(year, 11, 31);

    const { data, error } = await supabase
      .from('court_holidays')
      .select('holiday_date')
      .eq('jurisdiction', jurisdiction)
      .gte('holiday_date', startOfYear.toISOString().split('T')[0])
      .lte('holiday_date', endOfYear.toISOString().split('T')[0]);

    if (error) {
      log.warn('[DeadlineCalculator] Error loading holidays from DB:', error);
      return [];
    }

    return (data || []).map((row: { holiday_date: string }) => new Date(row.holiday_date + 'T00:00:00'));
  } catch (error) {
    log.error('[DeadlineCalculator] Database error:', error);
    return [];
  }
}

/**
 * Seed holidays to database
 */
export async function seedHolidaysToDatabase(): Promise<{ success: boolean; count: number }> {
  const supabase = await createClient();
  const allHolidays: Array<{
    jurisdiction: string;
    holiday_date: string;
    holiday_name: string;
    recurring: boolean;
  }> = [];

  // Federal holidays for all federal jurisdictions
  const federalJurisdictions = ['federal_5th', 'federal_9th', 'ca_federal'];
  const allFederalHolidays = [
    ...FEDERAL_HOLIDAYS_2024,
    ...FEDERAL_HOLIDAYS_2025,
    ...FEDERAL_HOLIDAYS_2026,
  ];

  for (const jurisdiction of federalJurisdictions) {
    for (const holiday of allFederalHolidays) {
      allHolidays.push({
        jurisdiction,
        holiday_date: holiday.date,
        holiday_name: holiday.name,
        recurring: false,
      });
    }
  }

  // California state (federal + state holidays)
  for (const holiday of allFederalHolidays) {
    allHolidays.push({
      jurisdiction: 'ca_state',
      holiday_date: holiday.date,
      holiday_name: holiday.name,
      recurring: false,
    });
  }
  for (const holiday of CALIFORNIA_HOLIDAYS) {
    allHolidays.push({
      jurisdiction: 'ca_state',
      holiday_date: holiday.date,
      holiday_name: holiday.name,
      recurring: false,
    });
  }

  // Louisiana (federal + state holidays)
  for (const holiday of allFederalHolidays) {
    allHolidays.push({
      jurisdiction: 'la_state',
      holiday_date: holiday.date,
      holiday_name: holiday.name,
      recurring: false,
    });
  }
  for (const holiday of LOUISIANA_HOLIDAYS) {
    allHolidays.push({
      jurisdiction: 'la_state',
      holiday_date: holiday.date,
      holiday_name: holiday.name,
      recurring: false,
    });
  }

  // Upsert all holidays
  const { error } = await supabase
    .from('court_holidays')
    .upsert(allHolidays, {
      onConflict: 'jurisdiction,holiday_date',
      ignoreDuplicates: true,
    });

  if (error) {
    log.error('[DeadlineCalculator] Error seeding holidays:', error);
    return { success: false, count: 0 };
  }

  return { success: true, count: allHolidays.length };
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  calculateDeadlines,
  getCourtHolidays,
  isCourtDay,
  addCourtDays,
  getNoticePeriod,
  loadHolidaysFromDatabase,
  seedHolidaysToDatabase,
};
