/**
 * Court ID Map for CourtListener Lookups
 * Maps court display names to CL court IDs
 *
 * Total: 25 entries (14 original + 6 CA districts + 5 LA circuits)
 *
 * ST-008 — BATCH_11_JUDGE_LOOKUP
 */

import { createLogger } from '@/lib/security/logger';

const log = createLogger('court-id-map');

export const COURT_ID_MAP: Record<string, string> = {
  // Federal Courts
  'U.S. Supreme Court': 'scotus',
  '5th Circuit': 'ca5',
  '9th Circuit': 'ca9',
  'Central District of California': 'cacd',
  'Northern District of California': 'cand',
  'Southern District of California': 'casd',
  'Eastern District of California': 'caed',
  'Eastern District of Louisiana': 'laed',
  'Middle District of Louisiana': 'lamd',
  'Western District of Louisiana': 'lawd',

  // California State Courts
  'California Supreme Court': 'cal',
  'CA Court of Appeal': 'calctapp',  // Generic fallback
  'CA Court of Appeal, 1st District': 'calctapp_1d',
  'CA Court of Appeal, 2nd District': 'calctapp_2d',
  'CA Court of Appeal, 3rd District': 'calctapp_3d',
  'CA Court of Appeal, 4th District': 'calctapp_4d',
  'CA Court of Appeal, 5th District': 'calctapp_5d',
  'CA Court of Appeal, 6th District': 'calctapp_6d',

  // Louisiana State Courts
  'Louisiana Supreme Court': 'la',
  'LA Court of Appeal': 'lactapp',  // Generic fallback
  'LA Court of Appeal, 1st Circuit': 'lactapp_1cir',
  'LA Court of Appeal, 2nd Circuit': 'lactapp_2cir',
  'LA Court of Appeal, 3rd Circuit': 'lactapp_3cir',
  'LA Court of Appeal, 4th Circuit': 'lactapp_4cir',
  'LA Court of Appeal, 5th Circuit': 'lactapp_5cir',
};

/**
 * Resolve a court name to its CourtListener ID.
 * Handles district/circuit disambiguation and fuzzy matching.
 *
 * @param courtName - Display name from intake form
 * @param district - Optional district/circuit number (e.g., "2nd District")
 * @returns CL court ID or null if not found
 */
export function resolveCourtId(courtName: string, district?: string): string | null {
  // Try exact match first
  if (COURT_ID_MAP[courtName]) {
    return COURT_ID_MAP[courtName];
  }

  // Try with district appended
  if (district) {
    const withDistrict = `${courtName}, ${district}`;
    if (COURT_ID_MAP[withDistrict]) {
      return COURT_ID_MAP[withDistrict];
    }
  }

  // Fuzzy match for common variations
  const normalized = courtName.toLowerCase().trim();

  // CA appellate variations
  if (normalized.includes('california') && normalized.includes('appeal')) {
    if (district) {
      const distNum = district.match(/(\d)/)?.[1];
      if (distNum) {
        return `calctapp_${distNum}d`;
      }
    }
    return 'calctapp';  // Generic fallback
  }

  // LA appellate variations
  if (normalized.includes('louisiana') && normalized.includes('appeal')) {
    if (district) {
      const circNum = district.match(/(\d)/)?.[1];
      if (circNum) {
        return `lactapp_${circNum}cir`;
      }
    }
    return 'lactapp';  // Generic fallback
  }

  // Log unresolved court for future map expansion
  log.warn(`[CourtIdMap] COURT_ID_UNRESOLVED: "${courtName}" (district: ${district})`);
  return null;
}
