/**
 * Advisory Injector
 *
 * Injects motion-type-specific advisories into the workflow state
 * after Phase IX (Supporting Documents) completes.
 *
 * The advisory is stored in the workflow metadata so Phase X (Final Assembly)
 * can include it in the final QA checklist.
 */

import { detectMotionType, generateAdvisories, type Advisory } from './motion-advisories';

export interface AdvisoryInjectionResult {
  injected: boolean;
  advisoryCount: number;
  advisories: Advisory[];
}

/**
 * Detect applicable advisories for an order and return them for injection
 * into the workflow state.
 *
 * @param motionType - The motion type string from order context
 * @param jurisdiction - The jurisdiction string (e.g. 'LA', 'Federal')
 * @param description - Optional description for additional keyword detection
 */
export function injectAdvisories(
  motionType: string,
  jurisdiction: string,
  description: string = ''
): AdvisoryInjectionResult {
  const types = detectMotionType(motionType, description);

  if (types.length === 0) {
    return { injected: false, advisoryCount: 0, advisories: [] };
  }

  const advisories = generateAdvisories(types, jurisdiction);

  return {
    injected: advisories.length > 0,
    advisoryCount: advisories.length,
    advisories,
  };
}

/**
 * Format advisories as a text block for insertion into Phase X context.
 */
export function formatAdvisoriesForPhaseX(advisories: Advisory[]): string {
  if (advisories.length === 0) return '';

  const blocks = advisories.map(a => {
    const statuteBlock = a.statutes.length > 0
      ? `\nAPPLICABLE STATUTES: ${a.statutes.join(', ')}`
      : '';

    return `
[${a.id}] ${a.severity}: ${a.title}${statuteBlock}

REQUIREMENTS TO VERIFY:
${a.requirements.map((r, i) => `  ${i + 1}. ${r}`).join('\n')}

PITFALLS TO CHECK:
${a.commonPitfalls.map(p => `  - ${p}`).join('\n')}
`.trim();
  });

  return `
=== MOTION TYPE ADVISORIES (${advisories.length}) ===

${blocks.join('\n\n')}

=== END ADVISORIES ===
`.trim();
}
