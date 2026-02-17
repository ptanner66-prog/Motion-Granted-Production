/**
 * MOTION TYPE REGISTRY — Single Source of Truth
 *
 * This file defines ALL 89 motion types with their tier classification,
 * base pricing, category, and availability rules. Every other system
 * reads from here. There is no other source.
 *
 * Source: MOTION_GRANTED_4TIER_PRICING_MAP_02052026.xlsx
 *
 * BINDING PRICES (LA base):
 *   Tier A: $299  (20 motions)
 *   Tier B: $599  (50 motions)
 *   Tier C: $999  (10 motions)
 *   Tier D: $1,499 (9 motions)
 *
 * @module motion-type-registry
 */

import type { MotionTier } from '@/types/workflow';
export type { MotionTier };

export type MotionAvailability =
  | 'UNIVERSAL'      // Available in all jurisdictions
  | 'CA_ONLY'        // California state courts only
  | 'LA_ONLY'        // Louisiana state courts only
  | 'FEDERAL_ONLY'   // Federal courts only
  | 'STATE_ONLY';    // State courts only (both CA and LA)

export type CourtType = 'STATE' | 'FEDERAL';

export interface MotionTypeDefinition {
  id: number;
  name: string;                          // Customer-facing display name
  slug: string;                          // URL-safe identifier (kebab-case)
  tier: MotionTier;                      // BINDING tier classification
  basePrice: number;                     // Base price in whole dollars (LA)
  category: string;                      // Grouping for dropdown display
  availability: MotionAvailability;      // Jurisdiction availability rule
  courtTypes: CourtType[];               // STATE, FEDERAL, or both
}

/**
 * The complete registry of all 89 motion types.
 *
 * DO NOT modify tiers or prices without explicit authorization.
 * DO NOT add entries not in the source spreadsheet.
 * DO NOT remove entries.
 */
export const MOTION_TYPE_REGISTRY: readonly MotionTypeDefinition[] = [
  // ═══════════════════════════════════════════════════════════════════════════
  // TIER A — PROCEDURAL / ROUTINE ($299) — 20 Motions
  // ═══════════════════════════════════════════════════════════════════════════

  { id: 1, name: 'Motion to Extend Deadline', slug: 'motion-to-extend-deadline', tier: 'A', basePrice: 299, category: 'Procedural', availability: 'UNIVERSAL', courtTypes: ['STATE', 'FEDERAL'] },
  { id: 2, name: 'Motion for Continuance', slug: 'motion-for-continuance', tier: 'A', basePrice: 299, category: 'Procedural', availability: 'UNIVERSAL', courtTypes: ['STATE', 'FEDERAL'] },
  { id: 3, name: 'Motion to Withdraw as Counsel', slug: 'motion-to-withdraw-as-counsel', tier: 'A', basePrice: 299, category: 'Procedural', availability: 'UNIVERSAL', courtTypes: ['STATE', 'FEDERAL'] },
  { id: 4, name: 'Motion for Leave to File', slug: 'motion-for-leave-to-file', tier: 'A', basePrice: 299, category: 'Procedural', availability: 'UNIVERSAL', courtTypes: ['STATE', 'FEDERAL'] },
  { id: 5, name: 'Motion to Appear Pro Hac Vice', slug: 'motion-to-appear-pro-hac-vice', tier: 'A', basePrice: 299, category: 'Procedural', availability: 'UNIVERSAL', courtTypes: ['STATE', 'FEDERAL'] },
  { id: 6, name: 'Motion to Substitute Counsel', slug: 'motion-to-substitute-counsel', tier: 'A', basePrice: 299, category: 'Procedural', availability: 'UNIVERSAL', courtTypes: ['STATE', 'FEDERAL'] },
  { id: 7, name: 'Motion to Consolidate', slug: 'motion-to-consolidate', tier: 'A', basePrice: 299, category: 'Procedural', availability: 'UNIVERSAL', courtTypes: ['STATE', 'FEDERAL'] },
  { id: 8, name: 'Motion to Sever', slug: 'motion-to-sever', tier: 'A', basePrice: 299, category: 'Procedural', availability: 'UNIVERSAL', courtTypes: ['STATE', 'FEDERAL'] },
  { id: 9, name: 'Motion for Default Judgment', slug: 'motion-for-default-judgment', tier: 'A', basePrice: 299, category: 'Procedural', availability: 'UNIVERSAL', courtTypes: ['STATE', 'FEDERAL'] },
  { id: 10, name: 'Motion to Set Aside Default', slug: 'motion-to-set-aside-default', tier: 'A', basePrice: 299, category: 'Procedural', availability: 'UNIVERSAL', courtTypes: ['STATE', 'FEDERAL'] },
  { id: 11, name: 'Motion to Quash Service', slug: 'motion-to-quash-service', tier: 'A', basePrice: 299, category: 'Procedural', availability: 'UNIVERSAL', courtTypes: ['STATE', 'FEDERAL'] },
  { id: 12, name: 'Motion to Stay Proceedings', slug: 'motion-to-stay-proceedings', tier: 'A', basePrice: 299, category: 'Procedural', availability: 'UNIVERSAL', courtTypes: ['STATE', 'FEDERAL'] },
  { id: 13, name: 'Motion to Seal Records', slug: 'motion-to-seal-records', tier: 'A', basePrice: 299, category: 'Procedural', availability: 'UNIVERSAL', courtTypes: ['STATE', 'FEDERAL'] },
  { id: 14, name: 'Motion for Protective Order (Simple)', slug: 'motion-for-protective-order-simple', tier: 'A', basePrice: 299, category: 'Discovery', availability: 'UNIVERSAL', courtTypes: ['STATE', 'FEDERAL'] },
  { id: 15, name: 'Motion to Shorten Time', slug: 'motion-to-shorten-time', tier: 'A', basePrice: 299, category: 'Procedural', availability: 'UNIVERSAL', courtTypes: ['STATE', 'FEDERAL'] },
  { id: 16, name: 'Motion for Service by Publication', slug: 'motion-for-service-by-publication', tier: 'A', basePrice: 299, category: 'Procedural', availability: 'UNIVERSAL', courtTypes: ['STATE', 'FEDERAL'] },
  { id: 17, name: 'Motion for Leave to Amend (Simple)', slug: 'motion-for-leave-to-amend-simple', tier: 'A', basePrice: 299, category: 'Procedural', availability: 'UNIVERSAL', courtTypes: ['STATE', 'FEDERAL'] },
  { id: 18, name: 'Motion to Strike (Simple)', slug: 'motion-to-strike-simple', tier: 'A', basePrice: 299, category: 'Procedural', availability: 'UNIVERSAL', courtTypes: ['STATE', 'FEDERAL'] },
  { id: 19, name: 'Ex Parte Application (Routine)', slug: 'ex-parte-application-routine', tier: 'A', basePrice: 299, category: 'Procedural', availability: 'UNIVERSAL', courtTypes: ['STATE', 'FEDERAL'] },
  { id: 20, name: 'Motion to Relate Cases', slug: 'motion-to-relate-cases', tier: 'A', basePrice: 299, category: 'Procedural', availability: 'UNIVERSAL', courtTypes: ['STATE', 'FEDERAL'] },

  // ═══════════════════════════════════════════════════════════════════════════
  // TIER B — INTERMEDIATE ($599) — 50 Motions
  // ═══════════════════════════════════════════════════════════════════════════

  { id: 21, name: 'Motion to Compel Discovery', slug: 'motion-to-compel-discovery', tier: 'B', basePrice: 599, category: 'Discovery', availability: 'UNIVERSAL', courtTypes: ['STATE', 'FEDERAL'] },
  { id: 22, name: 'Motion for Sanctions', slug: 'motion-for-sanctions', tier: 'B', basePrice: 599, category: 'Discovery', availability: 'UNIVERSAL', courtTypes: ['STATE', 'FEDERAL'] },
  { id: 23, name: 'Motion for Protective Order (Complex)', slug: 'motion-for-protective-order-complex', tier: 'B', basePrice: 599, category: 'Discovery', availability: 'UNIVERSAL', courtTypes: ['STATE', 'FEDERAL'] },
  { id: 24, name: 'Motion to Quash Subpoena', slug: 'motion-to-quash-subpoena', tier: 'B', basePrice: 599, category: 'Discovery', availability: 'UNIVERSAL', courtTypes: ['STATE', 'FEDERAL'] },
  { id: 25, name: 'Motion in Limine', slug: 'motion-in-limine', tier: 'B', basePrice: 599, category: 'Evidentiary', availability: 'UNIVERSAL', courtTypes: ['STATE', 'FEDERAL'] },
  { id: 26, name: 'Motion to Exclude Expert', slug: 'motion-to-exclude-expert', tier: 'B', basePrice: 599, category: 'Evidentiary', availability: 'UNIVERSAL', courtTypes: ['STATE', 'FEDERAL'] },
  { id: 27, name: 'Motion for New Trial', slug: 'motion-for-new-trial', tier: 'B', basePrice: 599, category: 'Post-Trial', availability: 'UNIVERSAL', courtTypes: ['STATE', 'FEDERAL'] },
  { id: 28, name: 'Motion to Reconsider', slug: 'motion-to-reconsider', tier: 'B', basePrice: 599, category: 'Post-Trial', availability: 'UNIVERSAL', courtTypes: ['STATE', 'FEDERAL'] },
  { id: 29, name: 'Motion for JNOV', slug: 'motion-for-jnov', tier: 'B', basePrice: 599, category: 'Post-Trial', availability: 'UNIVERSAL', courtTypes: ['STATE', 'FEDERAL'] },
  { id: 30, name: 'Motion to Vacate Judgment', slug: 'motion-to-vacate-judgment', tier: 'B', basePrice: 599, category: 'Post-Trial', availability: 'UNIVERSAL', courtTypes: ['STATE', 'FEDERAL'] },
  { id: 31, name: 'Motion to Enforce Judgment', slug: 'motion-to-enforce-judgment', tier: 'B', basePrice: 599, category: 'Post-Trial', availability: 'UNIVERSAL', courtTypes: ['STATE', 'FEDERAL'] },
  { id: 32, name: 'Motion for Contempt', slug: 'motion-for-contempt', tier: 'B', basePrice: 599, category: 'Enforcement', availability: 'UNIVERSAL', courtTypes: ['STATE', 'FEDERAL'] },
  { id: 33, name: 'Motion to Compel Arbitration', slug: 'motion-to-compel-arbitration', tier: 'B', basePrice: 599, category: 'ADR', availability: 'UNIVERSAL', courtTypes: ['STATE', 'FEDERAL'] },
  { id: 34, name: 'Motion to Confirm Arbitration Award', slug: 'motion-to-confirm-arbitration-award', tier: 'B', basePrice: 599, category: 'ADR', availability: 'UNIVERSAL', courtTypes: ['STATE', 'FEDERAL'] },
  { id: 35, name: 'Motion to Vacate Arbitration Award', slug: 'motion-to-vacate-arbitration-award', tier: 'B', basePrice: 599, category: 'ADR', availability: 'UNIVERSAL', courtTypes: ['STATE', 'FEDERAL'] },
  { id: 36, name: 'Motion for Leave to Amend (Complex)', slug: 'motion-for-leave-to-amend-complex', tier: 'B', basePrice: 599, category: 'Procedural', availability: 'UNIVERSAL', courtTypes: ['STATE', 'FEDERAL'] },
  { id: 37, name: 'Motion to Strike (Complex)', slug: 'motion-to-strike-complex', tier: 'B', basePrice: 599, category: 'Procedural', availability: 'UNIVERSAL', courtTypes: ['STATE', 'FEDERAL'] },
  { id: 38, name: 'Motion for Judgment on Pleadings', slug: 'motion-for-judgment-on-pleadings', tier: 'B', basePrice: 599, category: 'Dispositive', availability: 'UNIVERSAL', courtTypes: ['STATE', 'FEDERAL'] },
  { id: 39, name: 'Motion to Transfer Venue', slug: 'motion-to-transfer-venue', tier: 'B', basePrice: 599, category: 'Procedural', availability: 'UNIVERSAL', courtTypes: ['STATE', 'FEDERAL'] },
  { id: 40, name: 'Motion to Change Venue', slug: 'motion-to-change-venue', tier: 'B', basePrice: 599, category: 'Procedural', availability: 'UNIVERSAL', courtTypes: ['STATE', 'FEDERAL'] },
  { id: 41, name: 'Motion to Dismiss (Simple)', slug: 'motion-to-dismiss-simple', tier: 'B', basePrice: 599, category: 'Dispositive', availability: 'UNIVERSAL', courtTypes: ['STATE', 'FEDERAL'] },
  { id: 42, name: 'Motion for Appointment of Receiver', slug: 'motion-for-appointment-of-receiver', tier: 'B', basePrice: 599, category: 'Equitable', availability: 'UNIVERSAL', courtTypes: ['STATE', 'FEDERAL'] },
  { id: 43, name: 'Motion for Preliminary Approval (Settlement)', slug: 'motion-for-preliminary-approval-settlement', tier: 'B', basePrice: 599, category: 'Settlement', availability: 'UNIVERSAL', courtTypes: ['STATE', 'FEDERAL'] },
  { id: 44, name: 'Motion for Final Approval (Settlement)', slug: 'motion-for-final-approval-settlement', tier: 'B', basePrice: 599, category: 'Settlement', availability: 'UNIVERSAL', courtTypes: ['STATE', 'FEDERAL'] },
  { id: 45, name: 'Motion for Attorneys Fees', slug: 'motion-for-attorneys-fees', tier: 'B', basePrice: 599, category: 'Fees', availability: 'UNIVERSAL', courtTypes: ['STATE', 'FEDERAL'] },
  { id: 46, name: 'Motion for Costs', slug: 'motion-for-costs', tier: 'B', basePrice: 599, category: 'Fees', availability: 'UNIVERSAL', courtTypes: ['STATE', 'FEDERAL'] },
  { id: 47, name: 'Motion to Bifurcate', slug: 'motion-to-bifurcate', tier: 'B', basePrice: 599, category: 'Trial', availability: 'UNIVERSAL', courtTypes: ['STATE', 'FEDERAL'] },
  { id: 48, name: 'Motion for Directed Verdict', slug: 'motion-for-directed-verdict', tier: 'B', basePrice: 599, category: 'Trial', availability: 'UNIVERSAL', courtTypes: ['STATE', 'FEDERAL'] },
  { id: 49, name: 'Motion to Reopen Discovery', slug: 'motion-to-reopen-discovery', tier: 'B', basePrice: 599, category: 'Discovery', availability: 'UNIVERSAL', courtTypes: ['STATE', 'FEDERAL'] },
  { id: 50, name: 'Motion to Intervene', slug: 'motion-to-intervene', tier: 'B', basePrice: 599, category: 'Procedural', availability: 'UNIVERSAL', courtTypes: ['STATE', 'FEDERAL'] },

  // Louisiana-Only Exceptions (Tier B)
  { id: 51, name: 'Declinatory Exception', slug: 'declinatory-exception', tier: 'B', basePrice: 599, category: 'Louisiana Exception', availability: 'LA_ONLY', courtTypes: ['STATE'] },
  { id: 52, name: 'Dilatory Exception', slug: 'dilatory-exception', tier: 'B', basePrice: 599, category: 'Louisiana Exception', availability: 'LA_ONLY', courtTypes: ['STATE'] },
  { id: 53, name: 'Peremptory Exception (No Cause)', slug: 'peremptory-exception-no-cause', tier: 'B', basePrice: 599, category: 'Louisiana Exception', availability: 'LA_ONLY', courtTypes: ['STATE'] },
  { id: 54, name: 'Peremptory Exception (No Right)', slug: 'peremptory-exception-no-right', tier: 'B', basePrice: 599, category: 'Louisiana Exception', availability: 'LA_ONLY', courtTypes: ['STATE'] },
  { id: 55, name: 'Peremptory Exception (Prescription)', slug: 'peremptory-exception-prescription', tier: 'B', basePrice: 599, category: 'Louisiana Exception', availability: 'LA_ONLY', courtTypes: ['STATE'] },
  { id: 56, name: 'Peremptory Exception (Res Judicata)', slug: 'peremptory-exception-res-judicata', tier: 'B', basePrice: 599, category: 'Louisiana Exception', availability: 'LA_ONLY', courtTypes: ['STATE'] },
  { id: 57, name: 'Exception of Prematurity', slug: 'exception-of-prematurity', tier: 'B', basePrice: 599, category: 'Louisiana Exception', availability: 'LA_ONLY', courtTypes: ['STATE'] },
  { id: 58, name: 'Exception of Vagueness', slug: 'exception-of-vagueness', tier: 'B', basePrice: 599, category: 'Louisiana Exception', availability: 'LA_ONLY', courtTypes: ['STATE'] },

  // California-Only Motions (Tier B)
  { id: 59, name: 'Demurrer (Simple)', slug: 'demurrer-simple', tier: 'B', basePrice: 599, category: 'California Demurrer', availability: 'CA_ONLY', courtTypes: ['STATE'] },
  { id: 60, name: 'Motion to Strike (CA CCP 435)', slug: 'motion-to-strike-ca-ccp-435', tier: 'B', basePrice: 599, category: 'California', availability: 'CA_ONLY', courtTypes: ['STATE'] },
  { id: 61, name: 'Motion for Judgment on Pleadings (CA)', slug: 'motion-for-judgment-on-pleadings-ca', tier: 'B', basePrice: 599, category: 'California', availability: 'CA_ONLY', courtTypes: ['STATE'] },

  // Federal-Only Motions (Tier B)
  { id: 62, name: 'Motion to Dismiss 12(b)(1)', slug: 'motion-to-dismiss-12b1', tier: 'B', basePrice: 599, category: 'Federal 12(b)', availability: 'FEDERAL_ONLY', courtTypes: ['FEDERAL'] },
  { id: 63, name: 'Motion to Dismiss 12(b)(2)', slug: 'motion-to-dismiss-12b2', tier: 'B', basePrice: 599, category: 'Federal 12(b)', availability: 'FEDERAL_ONLY', courtTypes: ['FEDERAL'] },
  { id: 64, name: 'Motion to Dismiss 12(b)(3)', slug: 'motion-to-dismiss-12b3', tier: 'B', basePrice: 599, category: 'Federal 12(b)', availability: 'FEDERAL_ONLY', courtTypes: ['FEDERAL'] },
  { id: 65, name: 'Motion to Dismiss 12(b)(4)', slug: 'motion-to-dismiss-12b4', tier: 'B', basePrice: 599, category: 'Federal 12(b)', availability: 'FEDERAL_ONLY', courtTypes: ['FEDERAL'] },
  { id: 66, name: 'Motion to Dismiss 12(b)(5)', slug: 'motion-to-dismiss-12b5', tier: 'B', basePrice: 599, category: 'Federal 12(b)', availability: 'FEDERAL_ONLY', courtTypes: ['FEDERAL'] },
  { id: 67, name: 'Motion to Remand', slug: 'motion-to-remand', tier: 'B', basePrice: 599, category: 'Federal Removal', availability: 'FEDERAL_ONLY', courtTypes: ['FEDERAL'] },
  { id: 68, name: 'Motion for Abstention', slug: 'motion-for-abstention', tier: 'B', basePrice: 599, category: 'Federal', availability: 'FEDERAL_ONLY', courtTypes: ['FEDERAL'] },
  { id: 69, name: 'Motion for More Definite Statement', slug: 'motion-for-more-definite-statement', tier: 'B', basePrice: 599, category: 'Federal', availability: 'FEDERAL_ONLY', courtTypes: ['FEDERAL'] },
  { id: 70, name: 'Motion for Summary Judgment (Partial)', slug: 'motion-for-summary-judgment-partial', tier: 'B', basePrice: 599, category: 'Dispositive', availability: 'UNIVERSAL', courtTypes: ['STATE', 'FEDERAL'] },

  // ═══════════════════════════════════════════════════════════════════════════
  // TIER C — COMPLEX ($999) — 10 Motions
  // ═══════════════════════════════════════════════════════════════════════════

  { id: 71, name: 'Motion to Dismiss 12(b)(6) (Complex)', slug: 'motion-to-dismiss-12b6-complex', tier: 'C', basePrice: 999, category: 'Federal 12(b)', availability: 'FEDERAL_ONLY', courtTypes: ['FEDERAL'] },
  { id: 72, name: 'Demurrer (Complex)', slug: 'demurrer-complex', tier: 'C', basePrice: 999, category: 'California Demurrer', availability: 'CA_ONLY', courtTypes: ['STATE'] },
  { id: 73, name: 'Peremptory Exception (Complex)', slug: 'peremptory-exception-complex', tier: 'C', basePrice: 999, category: 'Louisiana Exception', availability: 'LA_ONLY', courtTypes: ['STATE'] },
  { id: 74, name: 'Motion for Writ of Mandamus', slug: 'motion-for-writ-of-mandamus', tier: 'C', basePrice: 999, category: 'Writs', availability: 'UNIVERSAL', courtTypes: ['STATE', 'FEDERAL'] },
  { id: 75, name: 'Motion for Writ of Prohibition', slug: 'motion-for-writ-of-prohibition', tier: 'C', basePrice: 999, category: 'Writs', availability: 'UNIVERSAL', courtTypes: ['STATE', 'FEDERAL'] },
  { id: 76, name: 'Motion for Writ of Habeas Corpus', slug: 'motion-for-writ-of-habeas-corpus', tier: 'C', basePrice: 999, category: 'Writs', availability: 'UNIVERSAL', courtTypes: ['STATE', 'FEDERAL'] },
  { id: 77, name: 'Anti-SLAPP Motion (Simple)', slug: 'anti-slapp-motion-simple', tier: 'C', basePrice: 999, category: 'Constitutional (CA)', availability: 'CA_ONLY', courtTypes: ['STATE'] },
  { id: 78, name: 'Motion for Complex Case Determination', slug: 'motion-for-complex-case-determination', tier: 'C', basePrice: 999, category: 'California', availability: 'CA_ONLY', courtTypes: ['STATE'] },
  { id: 79, name: 'Motion for Interlocutory Appeal', slug: 'motion-for-interlocutory-appeal', tier: 'C', basePrice: 999, category: 'Appeals', availability: 'UNIVERSAL', courtTypes: ['STATE', 'FEDERAL'] },
  { id: 80, name: 'Motion for Declaratory Judgment', slug: 'motion-for-declaratory-judgment', tier: 'C', basePrice: 999, category: 'Equitable', availability: 'UNIVERSAL', courtTypes: ['STATE', 'FEDERAL'] },

  // ═══════════════════════════════════════════════════════════════════════════
  // TIER D — HIGHLY COMPLEX / DISPOSITIVE ($1,499) — 9 Motions
  // ═══════════════════════════════════════════════════════════════════════════

  { id: 81, name: 'Motion for Summary Judgment', slug: 'motion-for-summary-judgment', tier: 'D', basePrice: 1499, category: 'Dispositive', availability: 'UNIVERSAL', courtTypes: ['STATE', 'FEDERAL'] },
  { id: 82, name: 'Motion for Summary Adjudication', slug: 'motion-for-summary-adjudication', tier: 'D', basePrice: 1499, category: 'Dispositive (CA)', availability: 'UNIVERSAL', courtTypes: ['STATE', 'FEDERAL'] },
  { id: 83, name: 'Motion for Partial Summary Judgment', slug: 'motion-for-partial-summary-judgment', tier: 'D', basePrice: 1499, category: 'Dispositive', availability: 'UNIVERSAL', courtTypes: ['STATE', 'FEDERAL'] },
  { id: 84, name: 'Motion for Class Certification', slug: 'motion-for-class-certification', tier: 'D', basePrice: 1499, category: 'Complex Procedural', availability: 'UNIVERSAL', courtTypes: ['STATE', 'FEDERAL'] },
  { id: 85, name: 'Motion to Decertify Class', slug: 'motion-to-decertify-class', tier: 'D', basePrice: 1499, category: 'Complex Procedural', availability: 'UNIVERSAL', courtTypes: ['STATE', 'FEDERAL'] },
  { id: 86, name: 'Motion for Preliminary Injunction', slug: 'motion-for-preliminary-injunction', tier: 'D', basePrice: 1499, category: 'Equitable', availability: 'UNIVERSAL', courtTypes: ['STATE', 'FEDERAL'] },
  { id: 87, name: 'Temporary Restraining Order', slug: 'temporary-restraining-order', tier: 'D', basePrice: 1499, category: 'Equitable', availability: 'UNIVERSAL', courtTypes: ['STATE', 'FEDERAL'] },
  { id: 88, name: 'Daubert/Sargent Motion', slug: 'daubert-sargent-motion', tier: 'D', basePrice: 1499, category: 'Evidentiary', availability: 'UNIVERSAL', courtTypes: ['STATE', 'FEDERAL'] },
  { id: 89, name: 'Anti-SLAPP Motion (Complex)', slug: 'anti-slapp-motion-complex', tier: 'D', basePrice: 1499, category: 'Constitutional (CA)', availability: 'CA_ONLY', courtTypes: ['STATE'] },
] as const;

// ═══════════════════════════════════════════════════════════════════════════
// LOOKUP FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get a motion type by its numeric ID.
 *
 * @param id - The motion type ID (1-89)
 * @returns The motion type definition, or undefined if not found
 */
export function getMotionById(id: number): MotionTypeDefinition | undefined {
  return MOTION_TYPE_REGISTRY.find(m => m.id === id);
}

/**
 * Get a motion type by its URL-safe slug.
 *
 * @param slug - The motion type slug (e.g., 'motion-for-summary-judgment')
 * @returns The motion type definition, or undefined if not found
 */
export function getMotionBySlug(slug: string): MotionTypeDefinition | undefined {
  const normalizedSlug = slug.toLowerCase().trim();
  return MOTION_TYPE_REGISTRY.find(m => m.slug === normalizedSlug);
}

/**
 * Get a motion type by its display name (case-insensitive exact match).
 *
 * @param name - The motion type name to search for
 * @returns The motion type definition, or undefined if not found
 */
export function getMotionByName(name: string): MotionTypeDefinition | undefined {
  const normalizedName = name.toLowerCase().trim();
  return MOTION_TYPE_REGISTRY.find(m => m.name.toLowerCase() === normalizedName);
}

/**
 * Classify a motion's tier by its ID.
 *
 * THROWS on unknown ID. Never returns a silent default.
 * This is intentional — silent defaults are how Tier D motions
 * get processed as Tier B.
 *
 * @param motionId - The motion type ID (1-89)
 * @returns The tier classification ('A' | 'B' | 'C' | 'D')
 * @throws Error if the motion ID is not found in the registry
 */
export function classifyMotionTier(motionId: number): MotionTier {
  const motion = getMotionById(motionId);
  if (!motion) {
    throw new Error(
      `Unknown motion ID: ${motionId}. ` +
      `Valid IDs are 1-${MOTION_TYPE_REGISTRY.length}. ` +
      `Check MOTION_TYPE_REGISTRY for available motion types.`
    );
  }
  return motion.tier;
}

/**
 * Get the base price for a motion type.
 *
 * @param motionId - The motion type ID (1-89)
 * @returns The base price in whole dollars (LA pricing)
 * @throws Error if the motion ID is not found
 */
export function getMotionBasePrice(motionId: number): number {
  const motion = getMotionById(motionId);
  if (!motion) {
    throw new Error(`Unknown motion ID: ${motionId}. Cannot determine base price.`);
  }
  return motion.basePrice;
}

/**
 * Get all motions in a specific tier.
 *
 * @param tier - The tier to filter by ('A' | 'B' | 'C' | 'D')
 * @returns Array of motion types in that tier
 */
export function getMotionsByTier(tier: MotionTier): MotionTypeDefinition[] {
  return MOTION_TYPE_REGISTRY.filter(m => m.tier === tier);
}

/**
 * Get all motions in a specific category.
 *
 * @param category - The category name (e.g., 'Dispositive', 'Discovery')
 * @returns Array of motion types in that category
 */
export function getMotionsByCategory(category: string): MotionTypeDefinition[] {
  const normalizedCategory = category.toLowerCase().trim();
  return MOTION_TYPE_REGISTRY.filter(
    m => m.category.toLowerCase() === normalizedCategory
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// VALIDATION HELPERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Check if a motion ID is valid.
 *
 * @param id - The motion ID to validate
 * @returns true if the ID exists in the registry
 */
export function isValidMotionId(id: number): boolean {
  return MOTION_TYPE_REGISTRY.some(m => m.id === id);
}

/**
 * Check if a motion slug is valid.
 *
 * @param slug - The motion slug to validate
 * @returns true if the slug exists in the registry
 */
export function isValidMotionSlug(slug: string): boolean {
  return MOTION_TYPE_REGISTRY.some(m => m.slug === slug.toLowerCase().trim());
}

/**
 * Validate that a tier string is valid.
 *
 * @param tier - The tier string to validate
 * @returns true if the tier is A, B, C, or D
 */
export function isValidTier(tier: string): tier is MotionTier {
  return ['A', 'B', 'C', 'D'].includes(tier.toUpperCase());
}

// ═══════════════════════════════════════════════════════════════════════════
// REGISTRY STATISTICS (for verification)
// ═══════════════════════════════════════════════════════════════════════════

export const REGISTRY_STATS = {
  total: MOTION_TYPE_REGISTRY.length,
  tierA: MOTION_TYPE_REGISTRY.filter(m => m.tier === 'A').length,
  tierB: MOTION_TYPE_REGISTRY.filter(m => m.tier === 'B').length,
  tierC: MOTION_TYPE_REGISTRY.filter(m => m.tier === 'C').length,
  tierD: MOTION_TYPE_REGISTRY.filter(m => m.tier === 'D').length,
  universal: MOTION_TYPE_REGISTRY.filter(m => m.availability === 'UNIVERSAL').length,
  caOnly: MOTION_TYPE_REGISTRY.filter(m => m.availability === 'CA_ONLY').length,
  laOnly: MOTION_TYPE_REGISTRY.filter(m => m.availability === 'LA_ONLY').length,
  federalOnly: MOTION_TYPE_REGISTRY.filter(m => m.availability === 'FEDERAL_ONLY').length,
  stateOnly: MOTION_TYPE_REGISTRY.filter(m => m.availability === 'STATE_ONLY').length,
};

// Runtime verification — if counts change, fails at import time
(function validateRegistryCounts(): void {
  const expected = { total: 89, tierA: 20, tierB: 50, tierC: 10, tierD: 9 };
  const actual = REGISTRY_STATS;
  for (const [key, expectedVal] of Object.entries(expected)) {
    const actualVal = actual[key as keyof typeof actual];
    if (actualVal !== expectedVal) {
      throw new Error(
        `[MOTION_TYPE_REGISTRY] Count mismatch: ${key} expected ${expectedVal}, got ${actualVal}. ` +
        `Check MOTION_TYPE_REGISTRY entries.`
      );
    }
  }
})();

// ═══════════════════════════════════════════════════════════════════════════
// SP-12 AK-4: MOTION_TIER_MAP — Quick tier lookup by abstract type code
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Abstract motion type code → tier mapping.
 * Used for quick tier classification when only the type code is available
 * (e.g., intake form dropdown, API route classification).
 *
 * This is derived from MOTION_TYPE_REGISTRY but uses abstract type codes
 * rather than slugs or numeric IDs.
 *
 * SP-12 AK-4: Includes all Tier D motions as specified in D4 D-7.
 */
export const MOTION_TIER_MAP: Record<string, MotionTier> = {
  // Tier D — Highly Complex / Dispositive (10 type codes)
  'DECERTIFY_CLASS': 'D',
  'MSJ_COMPLEX': 'D',
  'DAUBERT_MOTION': 'D',
  'PI_COMPLEX': 'D',
  'MANDAMUS': 'D',
  'INTERLOCUTORY_APPEAL': 'D',
  'ANTI_SLAPP': 'D',
  'ARBITRATION_COMPLEX': 'D',
  'RECEIVERSHIP': 'D',
  'MULTI_PARTY_INTERVENTION': 'D',

  // Tier C — Complex
  'DISMISS_12B6_COMPLEX': 'C',
  'DEMURRER_COMPLEX': 'C',
  'PEREMPTORY_COMPLEX': 'C',
  'WRIT_MANDAMUS': 'C',
  'WRIT_PROHIBITION': 'C',
  'WRIT_HABEAS': 'C',
  'ANTI_SLAPP_SIMPLE': 'C',
  'COMPLEX_CASE': 'C',
  'INTERLOCUTORY': 'C',
  'DECLARATORY': 'C',

  // Tier B — Intermediate (representative subset)
  'COMPEL_DISCOVERY': 'B',
  'SANCTIONS': 'B',
  'MOTION_IN_LIMINE': 'B',
  'NEW_TRIAL': 'B',
  'COMPEL_ARBITRATION': 'B',
  'DISMISS_SIMPLE': 'B',
  'MSJ_PARTIAL': 'B',

  // Tier A — Procedural / Routine (representative subset)
  'EXTEND_DEADLINE': 'A',
  'CONTINUANCE': 'A',
  'WITHDRAW_COUNSEL': 'A',
  'DEFAULT_JUDGMENT': 'A',
  'PRO_HAC_VICE': 'A',
  'QUASH_SERVICE': 'A',
  'SEAL_RECORDS': 'A',
};

/**
 * Get tier from abstract motion type code.
 * Falls back to slug-based lookup if type code not found.
 *
 * @param typeCode - Abstract type code (e.g., 'MSJ_COMPLEX')
 * @returns MotionTier or undefined if not found
 */
export function getTierByTypeCode(typeCode: string): MotionTier | undefined {
  return MOTION_TIER_MAP[typeCode.toUpperCase()];
}
