/**
 * JURISDICTION AVAILABILITY FILTER (WF-06-B)
 *
 * Filters motion types by jurisdiction and court type.
 * Implements the ICA-027 fix: California support.
 *
 * Reads from MOTION_TYPE_REGISTRY (single source of truth).
 *
 * Jurisdictions supported:
 *   - LA_STATE:     Louisiana state courts
 *   - FEDERAL_5TH:  Federal 5th Circuit (LA districts)
 *   - CA_STATE:     California state courts  (ICA-027)
 *   - FEDERAL_9TH:  Federal 9th Circuit (CA districts)
 *
 * @module jurisdiction-filter
 */

import {
  MOTION_TYPE_REGISTRY,
  type MotionTypeDefinition,
  type MotionTier,
  type MotionAvailability,
  type CourtType,
} from './motion-type-registry';

// ============================================================================
// TYPES
// ============================================================================

export type StateCode = 'LA' | 'CA';

export interface Jurisdiction {
  id: string;
  name: string;
  stateCode: StateCode;
  courtType: CourtType;
  courts: CourtInfo[];
}

export interface CourtInfo {
  id: string;
  name: string;
  abbreviation: string;
}

export interface GroupedMotions {
  tier: MotionTier;
  tierName: string;
  basePrice: number;
  motions: MotionTypeDefinition[];
}

export interface PriceBreakdown {
  basePrice: number;
  jurisdictionMultiplier: number;
  rushMultiplier: number;
  finalPrice: number;
  tierLabel: string;
}

// ============================================================================
// JURISDICTION REGISTRY
// ============================================================================

export const JURISDICTIONS: readonly Jurisdiction[] = [
  {
    id: 'LA_STATE',
    name: 'Louisiana State Court',
    stateCode: 'LA',
    courtType: 'STATE',
    courts: [
      { id: 'la_dist', name: 'Louisiana District Court', abbreviation: 'La. Dist. Ct.' },
      { id: 'la_app_1', name: 'Louisiana Court of Appeal, First Circuit', abbreviation: 'La. App. 1 Cir.' },
      { id: 'la_app_2', name: 'Louisiana Court of Appeal, Second Circuit', abbreviation: 'La. App. 2 Cir.' },
      { id: 'la_app_3', name: 'Louisiana Court of Appeal, Third Circuit', abbreviation: 'La. App. 3 Cir.' },
      { id: 'la_app_4', name: 'Louisiana Court of Appeal, Fourth Circuit', abbreviation: 'La. App. 4 Cir.' },
      { id: 'la_app_5', name: 'Louisiana Court of Appeal, Fifth Circuit', abbreviation: 'La. App. 5 Cir.' },
      { id: 'la_sup', name: 'Louisiana Supreme Court', abbreviation: 'La. Sup. Ct.' },
    ],
  },
  {
    id: 'FEDERAL_5TH',
    name: 'Federal Court — 5th Circuit (Louisiana)',
    stateCode: 'LA',
    courtType: 'FEDERAL',
    courts: [
      { id: 'la_ed', name: 'Eastern District of Louisiana', abbreviation: 'E.D. La.' },
      { id: 'la_md', name: 'Middle District of Louisiana', abbreviation: 'M.D. La.' },
      { id: 'la_wd', name: 'Western District of Louisiana', abbreviation: 'W.D. La.' },
      { id: 'ca5', name: 'United States Court of Appeals, Fifth Circuit', abbreviation: '5th Cir.' },
    ],
  },
  {
    id: 'CA_STATE',
    name: 'California State Court',
    stateCode: 'CA',
    courtType: 'STATE',
    courts: [
      { id: 'ca_sup', name: 'California Superior Court', abbreviation: 'Cal. Super. Ct.' },
      { id: 'ca_app', name: 'California Court of Appeal', abbreviation: 'Cal. Ct. App.' },
      { id: 'ca_supreme', name: 'California Supreme Court', abbreviation: 'Cal.' },
    ],
  },
  {
    id: 'FEDERAL_9TH',
    name: 'Federal Court — 9th Circuit (California)',
    stateCode: 'CA',
    courtType: 'FEDERAL',
    courts: [
      { id: 'ca_nd', name: 'Northern District of California', abbreviation: 'N.D. Cal.' },
      { id: 'ca_ed', name: 'Eastern District of California', abbreviation: 'E.D. Cal.' },
      { id: 'ca_sd', name: 'Southern District of California', abbreviation: 'S.D. Cal.' },
      { id: 'ca_cd', name: 'Central District of California', abbreviation: 'C.D. Cal.' },
      { id: 'ca9', name: 'United States Court of Appeals, Ninth Circuit', abbreviation: '9th Cir.' },
    ],
  },
] as const;

// ============================================================================
// PRICING CONSTANTS
// ============================================================================

/** California pricing multiplier relative to Louisiana base. */
export const CA_MULTIPLIER = 1.20;

/** Rush multipliers. */
export const RUSH_MULTIPLIERS = {
  standard: { multiplier: 1.0, label: 'Standard' },
  rush_72h: { multiplier: 1.25, label: '72-hour rush (+25%)' },
  rush_48h: { multiplier: 1.50, label: '48-hour rush (+50%)' },
} as const;

export type RushTier = keyof typeof RUSH_MULTIPLIERS;

/** Tier display labels for UI. */
const TIER_LABELS: Record<MotionTier, string> = {
  A: 'Tier A — Procedural / Routine',
  B: 'Tier B — Intermediate',
  C: 'Tier C — Complex',
  D: 'Tier D — Highly Complex / Dispositive',
};

// ============================================================================
// AVAILABILITY LOGIC
// ============================================================================

/**
 * Check if a motion type is available in a given jurisdiction.
 *
 * Availability rules:
 *   UNIVERSAL    → available everywhere
 *   CA_ONLY      → only in CA_STATE or FEDERAL_9TH
 *   LA_ONLY      → only in LA_STATE or FEDERAL_5TH
 *   FEDERAL_ONLY → only in FEDERAL_5TH or FEDERAL_9TH
 *   STATE_ONLY   → only in LA_STATE or CA_STATE
 */
function isAvailableIn(
  availability: MotionAvailability,
  courtType: CourtType,
  jurisdictionId: string,
): boolean {
  switch (availability) {
    case 'UNIVERSAL':
      return true;
    case 'CA_ONLY':
      return jurisdictionId === 'CA_STATE' || jurisdictionId === 'FEDERAL_9TH';
    case 'LA_ONLY':
      return jurisdictionId === 'LA_STATE' || jurisdictionId === 'FEDERAL_5TH';
    case 'FEDERAL_ONLY':
      return courtType === 'FEDERAL';
    case 'STATE_ONLY':
      return courtType === 'STATE';
    default:
      return false;
  }
}

// ============================================================================
// FILTER FUNCTIONS
// ============================================================================

/**
 * Get all motion types available in a jurisdiction.
 *
 * @param jurisdictionId - One of LA_STATE, FEDERAL_5TH, CA_STATE, FEDERAL_9TH
 * @returns Filtered array of MotionTypeDefinition entries
 */
export function getAvailableMotions(jurisdictionId: string): MotionTypeDefinition[] {
  const jurisdiction = JURISDICTIONS.find(j => j.id === jurisdictionId);
  if (!jurisdiction) {
    throw new Error(
      `Unknown jurisdiction: "${jurisdictionId}". ` +
      `Valid: ${JURISDICTIONS.map(j => j.id).join(', ')}`
    );
  }

  return MOTION_TYPE_REGISTRY.filter(motion =>
    isAvailableIn(motion.availability, jurisdiction.courtType, jurisdictionId) &&
    motion.courtTypes.includes(jurisdiction.courtType)
  );
}

/**
 * Get motions grouped by tier for a jurisdiction.
 * Useful for intake form dropdown rendering.
 *
 * @param jurisdictionId - Jurisdiction identifier
 * @returns Array of GroupedMotions, one per tier with motions present
 */
export function getGroupedMotions(jurisdictionId: string): GroupedMotions[] {
  const available = getAvailableMotions(jurisdictionId);

  const tiers: MotionTier[] = ['A', 'B', 'C', 'D'];
  const groups: GroupedMotions[] = [];

  for (const tier of tiers) {
    const tierMotions = available.filter(m => m.tier === tier);
    if (tierMotions.length > 0) {
      groups.push({
        tier,
        tierName: TIER_LABELS[tier],
        basePrice: tierMotions[0].basePrice,
        motions: tierMotions,
      });
    }
  }

  return groups;
}

// ============================================================================
// PRICING HELPERS
// ============================================================================

/**
 * Calculate the final price for a motion in a jurisdiction with optional rush.
 *
 * @param motionId - Motion type numeric ID from the registry
 * @param jurisdictionId - Jurisdiction identifier
 * @param rush - Rush tier (default: 'standard')
 * @returns Final price in whole dollars
 */
export function calculateMotionPrice(
  motionId: number,
  jurisdictionId: string,
  rush: RushTier = 'standard',
): number {
  const motion = MOTION_TYPE_REGISTRY.find(m => m.id === motionId);
  if (!motion) {
    throw new Error(`Unknown motion ID: ${motionId}`);
  }

  const jurisdiction = JURISDICTIONS.find(j => j.id === jurisdictionId);
  if (!jurisdiction) {
    throw new Error(`Unknown jurisdiction: "${jurisdictionId}"`);
  }

  const jurisdictionMultiplier = jurisdiction.stateCode === 'CA' ? CA_MULTIPLIER : 1.0;
  const rushMultiplier = RUSH_MULTIPLIERS[rush].multiplier;

  return Math.round(motion.basePrice * jurisdictionMultiplier * rushMultiplier);
}

/**
 * Get a detailed price breakdown for display/receipt.
 *
 * @param motionId - Motion type numeric ID
 * @param jurisdictionId - Jurisdiction identifier
 * @param rush - Rush tier
 * @returns PriceBreakdown with all pricing details
 */
export function getPriceBreakdown(
  motionId: number,
  jurisdictionId: string,
  rush: RushTier = 'standard',
): PriceBreakdown {
  const motion = MOTION_TYPE_REGISTRY.find(m => m.id === motionId);
  if (!motion) {
    throw new Error(`Unknown motion ID: ${motionId}`);
  }

  const jurisdiction = JURISDICTIONS.find(j => j.id === jurisdictionId);
  if (!jurisdiction) {
    throw new Error(`Unknown jurisdiction: "${jurisdictionId}"`);
  }

  const jurisdictionMultiplier = jurisdiction.stateCode === 'CA' ? CA_MULTIPLIER : 1.0;
  const rushMultiplier = RUSH_MULTIPLIERS[rush].multiplier;

  return {
    basePrice: motion.basePrice,
    jurisdictionMultiplier,
    rushMultiplier,
    finalPrice: Math.round(motion.basePrice * jurisdictionMultiplier * rushMultiplier),
    tierLabel: TIER_LABELS[motion.tier],
  };
}

// ============================================================================
// JURISDICTION HELPERS
// ============================================================================

/**
 * Get a jurisdiction by ID.
 */
export function getJurisdiction(jurisdictionId: string): Jurisdiction | undefined {
  return JURISDICTIONS.find(j => j.id === jurisdictionId);
}

/**
 * Get all jurisdictions for a state.
 */
export function getJurisdictionsForState(stateCode: StateCode): Jurisdiction[] {
  return JURISDICTIONS.filter(j => j.stateCode === stateCode);
}

/**
 * Get the state code for a jurisdiction.
 */
export function getStateForJurisdiction(jurisdictionId: string): StateCode {
  const jurisdiction = JURISDICTIONS.find(j => j.id === jurisdictionId);
  if (!jurisdiction) {
    throw new Error(`Unknown jurisdiction: "${jurisdictionId}"`);
  }
  return jurisdiction.stateCode;
}
