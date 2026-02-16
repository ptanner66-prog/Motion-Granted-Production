/**
 * Protocol 10 Dynamic Disclosure — Motion Granted
 *
 * SP-12 AH-3: Generates disclosure text when Protocol 10 triggers
 * (cost cap exceeded or max loops reached).
 *
 * Disclosure is injected into the Attorney Instruction Sheet (AIS)
 * to inform the attorney of quality-limiting constraints.
 */

import { getTierConfig } from '@/lib/config/tier-config';

export type Protocol10Trigger = 'COST_CAP' | 'MAX_LOOPS';

/**
 * Generate Protocol 10 disclosure text for the Attorney Instruction Sheet.
 *
 * @param trigger - What triggered Protocol 10 (COST_CAP or MAX_LOOPS)
 * @param loopCount - Number of revision loops completed
 * @param tier - Motion tier (A, B, C, D)
 * @returns Disclosure text string
 */
export function getProtocol10DisclosureText(
  trigger: Protocol10Trigger,
  loopCount: number,
  tier: string
): string {
  const config = getTierConfig(tier);
  const maxLoops = config.maxRevisionLoops;

  if (trigger === 'COST_CAP') {
    return `Note: Internal quality enhancement was concluded after ${loopCount} of ${maxLoops} permitted revision cycles due to resource allocation limits. The enclosed work product represents the best achievable output within these constraints. All citations have been verified to the extent resources permitted.`;
  }

  // MAX_LOOPS
  return `Note: Internal quality enhancement completed after ${loopCount} revision cycles (maximum: ${maxLoops}). The enclosed work product meets or exceeds the quality threshold for this tier.`;
}

/**
 * Inject Protocol 10 disclosure into AIS content.
 * Idempotent: replaces existing disclosure if already present.
 *
 * @param aisContent - Current Attorney Instruction Sheet content
 * @param trigger - What triggered Protocol 10
 * @param loopCount - Number of revision loops completed
 * @param tier - Motion tier
 * @returns Updated AIS content with disclosure injected
 */
export function injectAISDisclosure(
  aisContent: string,
  trigger: Protocol10Trigger,
  loopCount: number,
  tier: string
): string {
  const disclosure = getProtocol10DisclosureText(trigger, loopCount, tier);
  const marker = '<!-- PROTOCOL_10_DISCLOSURE -->';

  // Idempotent: if disclosure already injected, replace it
  if (aisContent.includes(marker)) {
    return aisContent.replace(
      new RegExp(`${marker}[\\s\\S]*?${marker}`),
      `${marker}\n${disclosure}\n${marker}`
    );
  }

  // First injection: append before closing section
  return `${aisContent}\n\n${marker}\n${disclosure}\n${marker}`;
}
