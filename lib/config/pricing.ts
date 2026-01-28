// /lib/config/pricing.ts
// Pricing and turnaround configuration for Motion Granted
// VERSION: 1.0 — January 28, 2026

export const TIER_PRICING = {
  A: { min: 150, max: 400, description: 'Procedural' },
  B: { min: 500, max: 1400, description: 'Intermediate' },
  C: { min: 1500, max: 3500, description: 'Complex/Dispositive' },
} as const;

export const TURNAROUND_DAYS = {
  A: { standard: 3, display: '2-3 business days' },
  B: { standard: 4, display: '3-4 business days' },
  C: { standard: 5, display: '4-5 business days' },
} as const;

export type RushLevel = 'standard' | 'expedited_48h' | 'emergency_24h';

export const RUSH_FEE_MULTIPLIERS: Record<RushLevel, number> = {
  standard: 1.0,
  expedited_48h: 1.5,   // +50%
  emergency_24h: 2.0,   // +100%
} as const;

export const RUSH_DISPLAY_NAMES: Record<RushLevel, string> = {
  standard: 'Standard',
  expedited_48h: '48-Hour Rush (+50%)',
  emergency_24h: '24-Hour Emergency (+100%)',
} as const;

/**
 * Calculate price with rush fee applied
 */
export function calculatePrice(
  basePrice: number,
  rushLevel: RushLevel = 'standard'
): { basePrice: number; rushFee: number; totalPrice: number } {
  const multiplier = RUSH_FEE_MULTIPLIERS[rushLevel];
  const rushFee = Math.round(basePrice * (multiplier - 1));
  const totalPrice = Math.round(basePrice * multiplier);
  return { basePrice, rushFee, totalPrice };
}

/**
 * Get turnaround days based on tier and rush level
 */
export function getTurnaroundDays(tier: 'A' | 'B' | 'C', rushLevel: RushLevel): number {
  if (rushLevel === 'emergency_24h') return 1;
  if (rushLevel === 'expedited_48h') return 2;
  return TURNAROUND_DAYS[tier].standard;
}

/**
 * Get display string for turnaround
 */
export function getTurnaroundDisplay(tier: 'A' | 'B' | 'C', rushLevel: RushLevel): string {
  if (rushLevel === 'emergency_24h') return '24 hours';
  if (rushLevel === 'expedited_48h') return '48 hours';
  return TURNAROUND_DAYS[tier].display;
}

/**
 * Get tier from price
 */
export function getTierFromPrice(price: number): 'A' | 'B' | 'C' {
  if (price <= TIER_PRICING.A.max * 100) return 'A'; // prices in cents
  if (price <= TIER_PRICING.B.max * 100) return 'B';
  return 'C';
}

/**
 * Format price for display (from cents to dollars)
 */
export function formatPrice(priceInCents: number): string {
  return `$${(priceInCents / 100).toLocaleString('en-US', { minimumFractionDigits: 0 })}`;
}

/**
 * Get price range display for tier
 */
export function getTierPriceRangeDisplay(tier: 'A' | 'B' | 'C'): string {
  const { min, max } = TIER_PRICING[tier];
  return `$${min}-$${max}`;
}
