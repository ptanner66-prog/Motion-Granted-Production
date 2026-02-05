/**
 * Memorandum Jurisdiction Check — BUG-13 Production Fix
 *
 * Determines whether a separate supporting memorandum is required
 * based on jurisdiction and motion type.
 *
 * - Louisiana state court, Motion to Compel: Separate memorandum NOT typically required
 * - California state court: Memorandum IS required for most noticed motions
 * - Federal court: Memorandum typically required
 */

export type MemoRequirement = 'required' | 'optional' | 'not_required' | 'skip';

export interface MemoCheckResult {
  requirement: MemoRequirement;
  reason: string;
  instructions?: string;
}

const JURISDICTION_MEMO_RULES: Record<string, Record<string, MemoRequirement>> = {
  'LA': {
    'MCOMPEL': 'not_required',
    'MSJ': 'required',
    'MTD_12B6': 'optional',
    'MTC': 'not_required',
    'MEXT': 'not_required',
    'DEFAULT': 'optional',
  },
  'CA': {
    'MCOMPEL': 'required',
    'MSJ': 'required',
    'MTD_12B6': 'required',
    'MTC': 'optional',
    'MEXT': 'optional',
    'DEFAULT': 'required',
  },
  'FEDERAL': {
    'MCOMPEL': 'required',
    'MSJ': 'required',
    'MTD_12B6': 'required',
    'MTC': 'optional',
    'MEXT': 'optional',
    'DEFAULT': 'required',
  },
};

function getJurisdictionKey(jurisdiction: string): string {
  const upper = jurisdiction.toUpperCase();
  if (upper.includes('LOUISIANA') || upper.includes(' LA') || upper.includes('JDC')) return 'LA';
  if (upper.includes('CALIFORNIA') || upper.includes(' CA') || upper.includes('CAL')) return 'CA';
  if (upper.includes('FEDERAL') || upper.includes('DISTRICT') ||
      upper.includes('EDLA') || upper.includes('MDLA') || upper.includes('WDLA') ||
      upper.includes('NDCA') || upper.includes('CDCA')) return 'FEDERAL';
  return 'FEDERAL';
}

function getMotionKey(motionType: string): string {
  const upper = motionType.toUpperCase().replace(/\s+/g, '_');
  const mappings: Record<string, string> = {
    'MOTION_TO_COMPEL': 'MCOMPEL', 'COMPEL': 'MCOMPEL',
    'SUMMARY_JUDGMENT': 'MSJ', 'MOTION_TO_DISMISS': 'MTD_12B6',
    'MOTION_TO_CONTINUE': 'MTC', 'EXTENSION': 'MEXT',
  };
  return mappings[upper] || upper;
}

/**
 * Check if a separate memorandum is required for this motion + jurisdiction.
 */
export function checkMemoRequirement(
  jurisdiction: string,
  motionType: string
): MemoCheckResult {
  const jurKey = getJurisdictionKey(jurisdiction);
  const motionKey = getMotionKey(motionType);
  const rules = JURISDICTION_MEMO_RULES[jurKey] || JURISDICTION_MEMO_RULES['FEDERAL'];
  const requirement = rules[motionKey] || rules['DEFAULT'] || 'optional';

  const reasons: Record<MemoRequirement, string> = {
    'required': `Separate memorandum IS required for ${motionType} in ${jurKey} courts`,
    'optional': `Separate memorandum is optional for ${motionType} in ${jurKey} courts`,
    'not_required': `Separate memorandum is NOT typically required for ${motionType} in ${jurKey} courts`,
    'skip': `Memorandum generation skipped`,
  };

  const instructions: Record<MemoRequirement, string> = {
    'required': 'Generate memorandum with EXPANDED analysis — must be substantively different from motion body.',
    'optional': 'Memorandum may be generated but is not required by local rules.',
    'not_required': 'Skip memorandum generation — not required by local rules for this motion type.',
    'skip': '',
  };

  return { requirement, reason: reasons[requirement], instructions: instructions[requirement] };
}
