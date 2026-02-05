/**
 * Proposed Order Validator — BUG-14 Production Fix
 *
 * Ensures proposed order relief provisions match ONLY what was
 * argued in the motion's prayer for relief.
 */

export interface OrderValidationResult {
  valid: boolean;
  excessProvisions: string[];
  matchedProvisions: string[];
  warnings: string[];
}

/**
 * Cross-reference proposed order provisions against the prayer for relief.
 */
export function validateProposedOrder(
  prayerForRelief: string,
  proposedOrderText: string
): OrderValidationResult {
  if (!prayerForRelief || prayerForRelief.trim().length === 0) {
    return { valid: true, excessProvisions: [], matchedProvisions: [], warnings: ['No prayer for relief provided'] };
  }
  if (!proposedOrderText || proposedOrderText.trim().length === 0) {
    return { valid: true, excessProvisions: [], matchedProvisions: [], warnings: ['No proposed order text'] };
  }

  const prayerItems = extractReliefItems(prayerForRelief);
  const orderItems = extractReliefItems(proposedOrderText);
  const matchedProvisions: string[] = [];
  const excessProvisions: string[] = [];

  const reliefKeywords = [
    'sanctions', 'compel', 'dismiss', 'strike', 'continue', 'extend',
    'protective order', 'costs', 'fees', 'attorney', 'discovery',
    'summary judgment', 'injunction', 'restraining order',
  ];

  for (const orderItem of orderItems) {
    const orderLower = orderItem.toLowerCase();
    const matched = prayerItems.some(prayer => {
      const prayerLower = prayer.toLowerCase();
      return reliefKeywords.some(kw => orderLower.includes(kw) && prayerLower.includes(kw)) ||
        prayerLower.includes(orderLower.substring(0, 30));
    });

    if (matched) {
      matchedProvisions.push(orderItem);
    } else {
      const isBoilerplate = orderLower.includes('so ordered') ||
        orderLower.includes('it is hereby ordered') ||
        orderLower.includes('dated') || orderLower.includes('judge');
      if (!isBoilerplate) excessProvisions.push(orderItem);
    }
  }

  return {
    valid: excessProvisions.length === 0,
    excessProvisions,
    matchedProvisions,
    warnings: excessProvisions.length > 0
      ? [`Proposed order contains ${excessProvisions.length} provision(s) not in prayer for relief`]
      : [],
  };
}

function extractReliefItems(text: string): string[] {
  return text
    .split(/(?:\d+\.\s+|\n|;|(?:that\s+))/i)
    .map(s => s.trim())
    .filter(s => s.length > 10);
}
