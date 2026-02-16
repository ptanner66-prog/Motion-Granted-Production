// ============================================================
// lib/config/jurisdiction-courts.ts
// Controlling authority identification — 4 active jurisdictions
// Source: D9 F-2 | SP-13 AR-2
// ============================================================

import { createLogger } from '../logging/logger';

const logger = createLogger('jurisdiction-courts');

export interface ControllingCourt {
  jurisdiction: string;
  controllingCourts: string[]; // CourtListener court field values
}

// BINDING (ST-D9P8-07): 4 jurisdictions at launch
export const JURISDICTION_CONTROLLING_COURTS: ControllingCourt[] = [
  { jurisdiction: 'FED_5TH', controllingCourts: ['scotus', '5thcircuit', 'ca5'] },
  { jurisdiction: 'FED_9TH', controllingCourts: ['scotus', '9thcircuit', 'ca9'] },
  { jurisdiction: 'CA', controllingCourts: ['scotus', 'calctapp', 'cal'] },
  { jurisdiction: 'LA', controllingCourts: ['scotus', 'lasc', 'la'] },
];

/**
 * Check if a citation's court is a controlling authority for the given jurisdiction.
 *
 * Used by Protocol 7 (AO-2) for controlling authority override:
 * if ANY failing citation is from a controlling court, P7 triggers at
 * a lower threshold (immediate CRITICAL regardless of count).
 */
export function isControllingAuthority(
  citationCourt: string,
  matterJurisdiction: string
): boolean {
  if (!citationCourt || !matterJurisdiction) return false;
  const config = JURISDICTION_CONTROLLING_COURTS.find(
    c => c.jurisdiction === matterJurisdiction
  );
  if (!config) {
    logger.info('jurisdiction.unknown', { jurisdiction: matterJurisdiction });
    return false; // Unknown jurisdiction: no override
  }
  return config.controllingCourts.includes(citationCourt.toLowerCase());
}
