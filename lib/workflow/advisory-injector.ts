/**
 * Advisory Injector — SP8
 *
 * Post-processes Phase IX output to inject motion type advisories.
 * Called from Inngest workflow after Phase IX completes.
 */

import { detectMotionType, generateAdvisories, type Advisory } from './motion-advisories';

export interface AdvisoryInjectionResult {
  advisoriesAdded: number;
  advisoryIds: string[];
}

/**
 * Detect motion type and generate advisories for inclusion in workflow output.
 *
 * @param motionType - The order's motion type string
 * @param caseDescription - Optional case description for better detection
 * @param jurisdiction - State abbreviation (e.g., 'LA', 'CA')
 * @returns Advisory injection result with advisories and metadata
 */
export function injectAdvisories(
  motionType: string,
  caseDescription: string | undefined,
  jurisdiction: string
): { advisories: Advisory[]; result: AdvisoryInjectionResult } {
  const detectedTypes = detectMotionType(motionType, caseDescription);

  if (detectedTypes.length === 0) {
    return {
      advisories: [],
      result: { advisoriesAdded: 0, advisoryIds: [] },
    };
  }

  const advisories = generateAdvisories(detectedTypes, jurisdiction);

  return {
    advisories,
    result: {
      advisoriesAdded: advisories.length,
      advisoryIds: advisories.map(a => a.id),
    },
  };
}
