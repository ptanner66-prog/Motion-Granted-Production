/**
 * Motion Filtering Function with Category Grouping (Task 82)
 *
 * Filters available motions based on state and court type.
 * Groups motions for hierarchical dropdown display.
 *
 * Source: Chunk 11, Task 82 - MOTION_TYPES_BY_STATE_SPEC_v2_EXPANDED.md
 */

import {
  MOTION_TYPES,
  MotionType,
  MotionCategory,
  CATEGORY_LABELS,
  TIER_LABELS,
} from '@/lib/config/motion-types';
import { getStateConfig } from '@/lib/config/state-configs';

// ============================================================================
// TYPES
// ============================================================================

export interface MotionGroup {
  tier: 'A' | 'B' | 'C';
  tierLabel: string; // "TIER A — Procedural ($150-$400)"
  priceRange: { min: number; max: number };
  categories: CategoryGroup[];
}

export interface CategoryGroup {
  category: MotionCategory;
  categoryLabel: string;
  motions: MotionType[];
}

export interface FilteredMotionsResult {
  available: boolean;
  stateEnabled: boolean;
  motions: MotionType[];
  grouped: MotionGroup[];
  totalCount: number;
}

// ============================================================================
// MAIN FILTERING FUNCTION
// ============================================================================

/**
 * Get available motions for a state/court combination
 */
export function getAvailableMotions(
  stateCode: string,
  courtType: 'state' | 'federal'
): MotionType[] {
  const stateConfig = getStateConfig(stateCode);

  // If state not found or not enabled, return empty array
  if (!stateConfig || !stateConfig.enabled) {
    return [];
  }

  return MOTION_TYPES.filter((motion) => {
    // Check court type compatibility
    if (!motion.court_types.includes(courtType)) {
      return false;
    }

    // Check availability rules
    switch (motion.availability) {
      case 'universal':
        // Include UNLESS in state's excluded_motions
        return !stateConfig.excluded_motions.includes(motion.id);

      case 'state_specific':
        // Only include if stateCode is in available_states
        return motion.available_states?.includes(stateCode) ?? false;

      case 'federal_only':
        // Only include when courtType is federal
        return courtType === 'federal';

      default:
        return false;
    }
  });
}

/**
 * Get filtered motions with full result metadata
 */
export function getFilteredMotions(
  stateCode: string,
  courtType: 'state' | 'federal'
): FilteredMotionsResult {
  const stateConfig = getStateConfig(stateCode);
  const stateEnabled = stateConfig?.enabled ?? false;

  if (!stateEnabled) {
    return {
      available: false,
      stateEnabled: false,
      motions: [],
      grouped: [],
      totalCount: 0,
    };
  }

  const motions = getAvailableMotions(stateCode, courtType);
  const grouped = groupMotionsForDropdown(motions);

  return {
    available: motions.length > 0,
    stateEnabled: true,
    motions,
    grouped,
    totalCount: motions.length,
  };
}

// ============================================================================
// GROUPING FUNCTIONS
// ============================================================================

/**
 * Group motions for hierarchical dropdown
 * Outer: Tier with price range
 * Inner: Category
 */
export function groupMotionsForDropdown(motions: MotionType[]): MotionGroup[] {
  const tiers: ('A' | 'B' | 'C')[] = ['A', 'B', 'C'];
  const groups: MotionGroup[] = [];

  for (const tier of tiers) {
    const tierMotions = motions.filter((m) => m.tier === tier);

    if (tierMotions.length === 0) {
      continue;
    }

    // Calculate price range for this tier's filtered motions
    const priceRange = {
      min: Math.min(...tierMotions.map((m) => m.base_price_min)),
      max: Math.max(...tierMotions.map((m) => m.base_price_max)),
    };

    // Group by category
    const categoryGroups = groupByCategory(tierMotions);

    groups.push({
      tier,
      tierLabel: TIER_LABELS[tier],
      priceRange,
      categories: categoryGroups,
    });
  }

  return groups;
}

/**
 * Group motions by category within a tier
 */
function groupByCategory(motions: MotionType[]): CategoryGroup[] {
  const categoryMap = new Map<MotionCategory, MotionType[]>();

  // Group motions by category
  for (const motion of motions) {
    const existing = categoryMap.get(motion.category) || [];
    existing.push(motion);
    categoryMap.set(motion.category, existing);
  }

  // Convert to array and sort by category label
  const groups: CategoryGroup[] = [];
  for (const [category, categoryMotions] of categoryMap) {
    groups.push({
      category,
      categoryLabel: CATEGORY_LABELS[category],
      motions: categoryMotions.sort((a, b) =>
        a.display_name.localeCompare(b.display_name)
      ),
    });
  }

  // Sort categories alphabetically by label
  return groups.sort((a, b) => a.categoryLabel.localeCompare(b.categoryLabel));
}

// ============================================================================
// SEARCH & FILTER HELPERS
// ============================================================================

/**
 * Search motions by name/description
 */
export function searchMotions(
  motions: MotionType[],
  searchTerm: string
): MotionType[] {
  if (!searchTerm || searchTerm.trim().length === 0) {
    return motions;
  }

  const term = searchTerm.toLowerCase().trim();

  return motions.filter(
    (motion) =>
      motion.display_name.toLowerCase().includes(term) ||
      motion.description.toLowerCase().includes(term) ||
      motion.id.toLowerCase().includes(term)
  );
}

/**
 * Filter motions by tier
 */
export function filterByTier(
  motions: MotionType[],
  tier: 'A' | 'B' | 'C'
): MotionType[] {
  return motions.filter((m) => m.tier === tier);
}

/**
 * Filter motions by category
 */
export function filterByCategory(
  motions: MotionType[],
  category: MotionCategory
): MotionType[] {
  return motions.filter((m) => m.category === category);
}

/**
 * Filter motions by price range
 */
export function filterByPriceRange(
  motions: MotionType[],
  minPrice: number,
  maxPrice: number
): MotionType[] {
  return motions.filter(
    (m) => m.base_price_min >= minPrice && m.base_price_max <= maxPrice
  );
}

// ============================================================================
// DROPDOWN DATA HELPERS
// ============================================================================

/**
 * Format motions for react-select or similar dropdown
 */
export interface DropdownOption {
  value: string;
  label: string;
  motion: MotionType;
}

export interface DropdownGroupOption {
  label: string;
  options: DropdownOption[];
}

/**
 * Format grouped motions for react-select with grouping
 */
export function formatForDropdown(
  groups: MotionGroup[]
): DropdownGroupOption[] {
  const options: DropdownGroupOption[] = [];

  for (const group of groups) {
    for (const category of group.categories) {
      const groupLabel = `${group.tierLabel} > ${category.categoryLabel}`;

      options.push({
        label: groupLabel,
        options: category.motions.map((motion) => ({
          value: motion.id,
          label: motion.display_name,
          motion,
        })),
      });
    }
  }

  return options;
}

/**
 * Format as flat list for simple dropdown
 */
export function formatFlatDropdown(motions: MotionType[]): DropdownOption[] {
  return motions
    .sort((a, b) => a.display_name.localeCompare(b.display_name))
    .map((motion) => ({
      value: motion.id,
      label: `${motion.display_name} (${motion.tier})`,
      motion,
    }));
}

// ============================================================================
// PRICE CALCULATION HELPERS
// ============================================================================

/**
 * Get formatted price range string
 */
export function formatPriceRange(motion: MotionType): string {
  const minFormatted = formatCurrency(motion.base_price_min);
  const maxFormatted = formatCurrency(motion.base_price_max);

  if (motion.base_price_min === motion.base_price_max) {
    return minFormatted;
  }

  return `${minFormatted} - ${maxFormatted}`;
}

/**
 * Format cents to currency string
 */
function formatCurrency(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

/**
 * Get tier price range formatted string
 */
export function getTierPriceRangeFormatted(tier: 'A' | 'B' | 'C'): string {
  switch (tier) {
    case 'A':
      return '$150 - $400';
    case 'B':
      return '$500 - $1,400';
    case 'C':
      return '$1,500 - $3,500';
  }
}

// ============================================================================
// VALIDATION
// ============================================================================

/**
 * Validate that a motion is available for a state/court combination
 */
export function isMotionAvailable(
  motionId: string,
  stateCode: string,
  courtType: 'state' | 'federal'
): boolean {
  const availableMotions = getAvailableMotions(stateCode, courtType);
  return availableMotions.some((m) => m.id === motionId);
}

/**
 * Get motion with availability check
 */
export function getMotionIfAvailable(
  motionId: string,
  stateCode: string,
  courtType: 'state' | 'federal'
): MotionType | null {
  const availableMotions = getAvailableMotions(stateCode, courtType);
  return availableMotions.find((m) => m.id === motionId) || null;
}
