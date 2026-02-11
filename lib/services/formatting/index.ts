/**
 * Formatting service barrel export.
 *
 * Usage:
 *   import { getRuleLookup } from '@/lib/services/formatting';
 *   const rules = getRuleLookup().getFormattingRules({ stateCode: 'LA', isFederal: false });
 *
 * Or initialize eagerly at app startup:
 *   import { initializeFormatting } from '@/lib/services/formatting';
 *   await initializeFormatting();
 */

export { RuleLookupService } from './rule-lookup';
export type { FormattingRules, JurisdictionConfig } from './types';

import { RuleLookupService } from './rule-lookup';

/**
 * Get the initialized RuleLookupService singleton.
 * Note: The service must be initialized via `initializeFormatting()` before
 * configs are available. If not initialized, lookups return safe defaults.
 */
export function getRuleLookup(): RuleLookupService {
  return RuleLookupService.getInstance();
}

/**
 * Initialize the RuleLookupService by loading all 51 state JSON configs.
 * Safe to call multiple times — subsequent calls are no-ops.
 * Call this during app startup or in a route handler before generating documents.
 */
export async function initializeFormatting(): Promise<void> {
  const service = RuleLookupService.getInstance();
  await service.initialize();
}
