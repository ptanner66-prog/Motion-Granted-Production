/**
 * Pricing Calculator
 *
 * v6.3: Calculate pricing for intake orders.
 */

import type { Tier, AddOn, PricingBreakdown } from './types';
import { getMotionTypeByCode, MOTION_TYPES } from './motion-types';

// Rush fee multiplier
const RUSH_FEE_MULTIPLIER = 0.5; // 50% surcharge

// Revision pricing by tier (v6.3 "sacred numbers")
export const REVISION_PRICING: Record<Tier, number> = {
  A: 75,
  B: 125,
  C: 200,
  D: 300,
};

// Free revisions per order
export const FREE_REVISIONS = 1;

interface PricingParams {
  tier: Tier;
  motionType: string;
  rushDelivery: boolean;
  addOns: AddOn[];
}

/**
 * Calculate complete pricing breakdown
 */
export function calculatePricing(params: PricingParams): PricingBreakdown {
  const { tier, motionType, rushDelivery, addOns } = params;

  // Get base price from motion type
  const motionTypeData = getMotionTypeByCode(motionType);
  const basePrice = motionTypeData?.basePrice ?? getDefaultPriceForTier(tier);

  // Calculate rush fee
  const rushFee = rushDelivery ? Math.round(basePrice * RUSH_FEE_MULTIPLIER) : 0;

  // Calculate add-on total
  let addOnTotal = 0;
  for (const addon of addOns) {
    if (addon.selected) {
      if (addon.id === 'reply') {
        // Reply brief is 60% of base price
        addOnTotal += Math.round(basePrice * 0.6);
      } else {
        addOnTotal += addon.price;
      }
    }
  }

  // Calculate total
  const total = basePrice + rushFee + addOnTotal;

  return {
    basePrice,
    rushFee,
    addOnTotal,
    total,
  };
}

/**
 * Get default price for tier when motion type not found
 */
function getDefaultPriceForTier(tier: Tier): number {
  const tierPrices: Record<Tier, number> = {
    A: 500,
    B: 1000,
    C: 2000,
    D: 3500,
  };
  return tierPrices[tier];
}

/**
 * Get turnaround days for a motion
 */
export function getTurnaroundDays(
  motionType: string,
  rushDelivery: boolean
): number {
  const motionTypeData = getMotionTypeByCode(motionType);
  if (!motionTypeData) {
    // Default turnaround
    return rushDelivery ? 3 : 7;
  }
  return rushDelivery
    ? motionTypeData.turnaroundDays.rush
    : motionTypeData.turnaroundDays.standard;
}

/**
 * Get estimated delivery date
 */
export function getEstimatedDeliveryDate(
  motionType: string,
  rushDelivery: boolean
): Date {
  const turnaroundDays = getTurnaroundDays(motionType, rushDelivery);
  const deliveryDate = new Date();

  // Skip weekends
  let daysAdded = 0;
  while (daysAdded < turnaroundDays) {
    deliveryDate.setDate(deliveryDate.getDate() + 1);
    const dayOfWeek = deliveryDate.getDay();
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      daysAdded++;
    }
  }

  return deliveryDate;
}

/**
 * Format price for display
 */
export function formatPrice(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}
