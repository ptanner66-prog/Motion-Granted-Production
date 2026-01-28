/**
 * Motion Granted Tier Constants
 *
 * IMPORTANT: Tiers are ordered by complexity:
 * - Tier A = SIMPLEST (Procedural/Administrative)
 * - Tier B = INTERMEDIATE
 * - Tier C = MOST COMPLEX (Complex/Dispositive)
 *
 * DO NOT reverse these descriptions. A is simple, C is complex.
 */

export type MotionTier = 'A' | 'B' | 'C';

// ============================================================================
// TIER DEFINITIONS
// ============================================================================

export const TIERS = {
  A: {
    id: 'A' as const,
    name: 'Procedural/Administrative',
    description: 'Simple procedural motions',
    color: { bg: '#F3F4F6', text: '#4B5563' },
    priceLA: { min: 150, max: 400 },
    priceCA: { min: 180, max: 480 },
    turnaround: '2-3 business days',
    motionTypes: [
      'Extension of Time',
      'Motion for Continuance',
      'Pro Hac Vice Admission',
      'Substitution of Counsel',
      'Withdrawal of Counsel',
      'Motion to Seal',
      'Motion to Unseal',
      'Stipulation and Order',
      'Other Procedural Motion',
    ],
  },
  B: {
    id: 'B' as const,
    name: 'Intermediate',
    description: 'Standard motions with moderate complexity',
    color: { bg: '#DBEAFE', text: '#1E40AF' },
    priceLA: { min: 500, max: 1400 },
    priceCA: { min: 600, max: 1680 },
    turnaround: '3-4 business days',
    motionTypes: [
      'Motion to Compel Discovery',
      'Motion for Protective Order',
      'Motion to Quash Subpoena',
      'Motion to Strike',
      'Motion to Amend Pleading',
      'Demurrer',
      'Motion to Dismiss',
      'Motion in Limine',
      'Motion for Sanctions (Non-Complex)',
      'Declinatory Exception',
      'Dilatory Exception',
      'Other Intermediate Motion',
    ],
  },
  C: {
    id: 'C' as const,
    name: 'Complex/Dispositive',
    description: 'MSJ, MSA, PI, TRO - Complex strategic motions',
    color: { bg: '#EDE9FE', text: '#5B21B6' },
    priceLA: { min: 1500, max: 3500 },
    priceCA: { min: 1800, max: 4200 },
    turnaround: '4-5 business days',
    motionTypes: [
      'Motion for Summary Judgment',
      'Motion for Summary Adjudication',
      'Anti-SLAPP Motion',
      'Preliminary Injunction',
      'Temporary Restraining Order',
      'Class Certification Motion',
      'Motion for Sanctions (Complex)',
      'Peremptory Exception',
      'Other Complex Motion',
    ],
  },
} as const;

export type TierConfig = typeof TIERS[MotionTier];

// ============================================================================
// PRICING CONSTANTS
// ============================================================================

export const CA_PRICE_MULTIPLIER = 1.20; // California = Louisiana × 1.20

export interface TierPricing {
  tier: MotionTier;
  louisiana: { min: number; max: number };
  california: { min: number; max: number };
  turnaroundDays: string;
}

export const TIER_PRICING: TierPricing[] = [
  {
    tier: 'A',
    louisiana: { min: 150, max: 400 },
    california: { min: 180, max: 480 },
    turnaroundDays: '2-3',
  },
  {
    tier: 'B',
    louisiana: { min: 500, max: 1400 },
    california: { min: 600, max: 1680 },
    turnaroundDays: '3-4',
  },
  {
    tier: 'C',
    louisiana: { min: 1500, max: 3500 },
    california: { min: 1800, max: 4200 },
    turnaroundDays: '4-5',
  },
];

// ============================================================================
// GRADE CONSTANTS
// ============================================================================

export const GRADES = {
  'A+': { numeric: 4.3, minScore: 97, passes: true },
  'A': { numeric: 4.0, minScore: 93, passes: true },
  'A-': { numeric: 3.7, minScore: 90, passes: true },
  'B+': { numeric: 3.3, minScore: 87, passes: true }, // MINIMUM PASSING
  'B': { numeric: 3.0, minScore: 83, passes: false },
  'B-': { numeric: 2.7, minScore: 80, passes: false },
  'C+': { numeric: 2.3, minScore: 77, passes: false },
  'C': { numeric: 2.0, minScore: 73, passes: false },
  'C-': { numeric: 1.7, minScore: 70, passes: false },
  'D': { numeric: 1.0, minScore: 60, passes: false },
  'F': { numeric: 0.0, minScore: 0, passes: false },
} as const;

export type LetterGrade = keyof typeof GRADES;

export const MINIMUM_PASSING_GRADE = 3.3; // B+
export const MAX_REVISION_LOOPS = 3;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get tier configuration by ID
 */
export function getTierConfig(tier: MotionTier): TierConfig {
  return TIERS[tier];
}

/**
 * Get tier for a motion type
 */
export function getTierForMotionType(motionType: string): MotionTier {
  const normalizedType = motionType.toLowerCase();

  for (const [tierId, tierConfig] of Object.entries(TIERS)) {
    for (const type of tierConfig.motionTypes) {
      if (normalizedType.includes(type.toLowerCase())) {
        return tierId as MotionTier;
      }
    }
  }

  // Default to Tier B if not found
  return 'B';
}

/**
 * Get pricing for a tier and jurisdiction
 */
export function getPricing(
  tier: MotionTier,
  jurisdiction: 'louisiana' | 'california'
): { min: number; max: number } {
  const tierConfig = TIERS[tier];
  return jurisdiction === 'california' ? tierConfig.priceCA : tierConfig.priceLA;
}

/**
 * Check if a grade passes (>= B+)
 */
export function gradePassesThreshold(grade: LetterGrade): boolean {
  return GRADES[grade].passes;
}

/**
 * Convert numeric grade to letter grade
 */
export function numericToLetterGrade(numeric: number): LetterGrade {
  if (numeric >= 4.15) return 'A+';
  if (numeric >= 3.85) return 'A';
  if (numeric >= 3.5) return 'A-';
  if (numeric >= 3.15) return 'B+';
  if (numeric >= 2.85) return 'B';
  if (numeric >= 2.5) return 'B-';
  if (numeric >= 2.15) return 'C+';
  if (numeric >= 1.5) return 'C';
  if (numeric >= 0.85) return 'C-';
  if (numeric >= 0.5) return 'D';
  return 'F';
}

/**
 * Get tier display info for UI components
 */
export function getTierDisplayInfo(tier: MotionTier): {
  name: string;
  description: string;
  bgColor: string;
  textColor: string;
} {
  const config = TIERS[tier];
  return {
    name: config.name,
    description: config.description,
    bgColor: config.color.bg,
    textColor: config.color.text,
  };
}
