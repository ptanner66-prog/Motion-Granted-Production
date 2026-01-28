/**
 * Motion Types Configuration
 *
 * v6.3: Motion types organized by tier with metadata.
 */

import type { Tier } from './types';

export interface MotionType {
  code: string;
  name: string;
  tier: Tier;
  category: string;
  description: string;
  basePrice: number;
  turnaroundDays: {
    standard: number;
    rush: number;
  };
}

export const MOTION_TYPES: MotionType[] = [
  // Tier A - Procedural/Administrative (Straightforward)
  {
    code: 'MTN_CONTINUE',
    name: 'Motion to Continue',
    tier: 'A',
    category: 'Procedural',
    description: 'Request to postpone a hearing or deadline',
    basePrice: 375,
    turnaroundDays: { standard: 2, rush: 1 },
  },
  {
    code: 'MTN_EXTEND',
    name: 'Motion to Extend Deadline',
    tier: 'A',
    category: 'Procedural',
    description: 'Request for additional time to respond or comply',
    basePrice: 375,
    turnaroundDays: { standard: 2, rush: 1 },
  },
  {
    code: 'MTN_WITHDRAW',
    name: 'Motion to Withdraw as Counsel',
    tier: 'A',
    category: 'Administrative',
    description: 'Attorney withdrawal from representation',
    basePrice: 450,
    turnaroundDays: { standard: 2, rush: 1 },
  },
  {
    code: 'MTN_PHV',
    name: 'Motion for Admission Pro Hac Vice',
    tier: 'A',
    category: 'Administrative',
    description: 'Out-of-state attorney admission for specific case',
    basePrice: 375,
    turnaroundDays: { standard: 2, rush: 1 },
  },
  {
    code: 'MTN_CONSOLIDATE',
    name: 'Motion to Consolidate',
    tier: 'A',
    category: 'Procedural',
    description: 'Combine related cases for efficiency',
    basePrice: 500,
    turnaroundDays: { standard: 3, rush: 2 },
  },
  {
    code: 'MTN_SEVER',
    name: 'Motion to Sever',
    tier: 'A',
    category: 'Procedural',
    description: 'Separate parties or claims into distinct proceedings',
    basePrice: 500,
    turnaroundDays: { standard: 3, rush: 2 },
  },
  {
    code: 'MTN_SUBSTITUTE',
    name: 'Motion for Substitution of Parties',
    tier: 'A',
    category: 'Procedural',
    description: 'Replace a party due to death, transfer, or other reason',
    basePrice: 450,
    turnaroundDays: { standard: 2, rush: 1 },
  },
  {
    code: 'MTN_COMPEL',
    name: 'Motion to Compel Discovery',
    tier: 'A',
    category: 'Discovery',
    description: 'Force production of requested discovery',
    basePrice: 625,
    turnaroundDays: { standard: 3, rush: 2 },
  },
  {
    code: 'MTN_PROTECTIVE',
    name: 'Motion for Protective Order',
    tier: 'A',
    category: 'Discovery',
    description: 'Protect party from burdensome or improper discovery',
    basePrice: 625,
    turnaroundDays: { standard: 3, rush: 2 },
  },
  {
    code: 'MTN_QUASH',
    name: 'Motion to Quash Subpoena',
    tier: 'A',
    category: 'Discovery',
    description: 'Challenge validity of subpoena',
    basePrice: 575,
    turnaroundDays: { standard: 3, rush: 2 },
  },

  // Tier B - Intermediate
  {
    code: 'EXC_DECLINATORY',
    name: 'Declinatory Exception (Louisiana)',
    tier: 'B',
    category: 'Exception',
    description: 'Challenge venue, jurisdiction, or lis pendens',
    basePrice: 875,
    turnaroundDays: { standard: 5, rush: 3 },
  },
  {
    code: 'EXC_DILATORY',
    name: 'Dilatory Exception (Louisiana)',
    tier: 'B',
    category: 'Exception',
    description: 'Challenge prematurity, nonjoinder, or vagueness',
    basePrice: 875,
    turnaroundDays: { standard: 5, rush: 3 },
  },
  {
    code: 'EXC_PEREMPTORY_CAUSE',
    name: 'Peremptory Exception — No Cause of Action (Louisiana)',
    tier: 'B',
    category: 'Exception',
    description: 'Petition fails to state a valid legal claim',
    basePrice: 1125,
    turnaroundDays: { standard: 5, rush: 3 },
  },
  {
    code: 'EXC_PEREMPTORY_RIGHT',
    name: 'Peremptory Exception — No Right of Action (Louisiana)',
    tier: 'B',
    category: 'Exception',
    description: 'Plaintiff lacks standing to bring the claim',
    basePrice: 1125,
    turnaroundDays: { standard: 5, rush: 3 },
  },
  {
    code: 'EXC_PRESCRIPTION',
    name: 'Peremptory Exception — Prescription (Louisiana)',
    tier: 'B',
    category: 'Exception',
    description: 'Claim is time-barred',
    basePrice: 1250,
    turnaroundDays: { standard: 5, rush: 3 },
  },
  {
    code: 'EXC_RES_JUDICATA',
    name: 'Peremptory Exception — Res Judicata (Louisiana)',
    tier: 'B',
    category: 'Exception',
    description: 'Claim was already decided in prior litigation',
    basePrice: 1250,
    turnaroundDays: { standard: 5, rush: 3 },
  },
  {
    code: 'MTN_LIMINE_SINGLE',
    name: 'Motion in Limine — Single Issue',
    tier: 'B',
    category: 'Trial Preparation',
    description: 'Exclude specific evidence or argument',
    basePrice: 750,
    turnaroundDays: { standard: 4, rush: 2 },
  },
  {
    code: 'MTN_LIMINE_COMPLEX',
    name: 'Motion in Limine — Multiple/Complex',
    tier: 'B',
    category: 'Trial Preparation',
    description: 'Multiple evidentiary exclusions',
    basePrice: 1375,
    turnaroundDays: { standard: 5, rush: 3 },
  },
  {
    code: 'MTN_RECUSE',
    name: 'Motion to Recuse',
    tier: 'B',
    category: 'Procedural',
    description: 'Seek judge disqualification for bias',
    basePrice: 875,
    turnaroundDays: { standard: 4, rush: 2 },
  },
  {
    code: 'MTN_PRELIM_INJ',
    name: 'Motion for Preliminary Injunction',
    tier: 'B',
    category: 'Injunctive Relief',
    description: 'Interim restraint pending litigation',
    basePrice: 1500,
    turnaroundDays: { standard: 5, rush: 3 },
  },
  {
    code: 'MTN_TRO',
    name: 'Motion for TRO',
    tier: 'B',
    category: 'Injunctive Relief',
    description: 'Emergency temporary restraining order',
    basePrice: 1250,
    turnaroundDays: { standard: 3, rush: 1 },
  },

  // Tier C - Complex/Dispositive
  {
    code: 'MSJ_STANDARD',
    name: 'Motion for Summary Judgment — Straightforward',
    tier: 'C',
    category: 'Dispositive',
    description: 'No genuine issue of material fact',
    basePrice: 1875,
    turnaroundDays: { standard: 10, rush: 5 },
  },
  {
    code: 'MSJ_COMPLEX',
    name: 'Motion for Summary Judgment — Complex',
    tier: 'C',
    category: 'Dispositive',
    description: 'Complex facts, multiple claims, or novel issues',
    basePrice: 2750,
    turnaroundDays: { standard: 14, rush: 7 },
  },
  {
    code: 'OPP_MSJ',
    name: 'Opposition to Motion for Summary Judgment',
    tier: 'C',
    category: 'Dispositive',
    description: 'Opposing dispositive motion',
    basePrice: 2250,
    turnaroundDays: { standard: 10, rush: 5 },
  },
  {
    code: 'MSJ_PARTIAL',
    name: 'Motion for Partial Summary Judgment',
    tier: 'C',
    category: 'Dispositive',
    description: 'Judgment on specific claims or issues',
    basePrice: 1875,
    turnaroundDays: { standard: 10, rush: 5 },
  },
  {
    code: 'MTN_JNOV',
    name: 'Motion for JNOV',
    tier: 'C',
    category: 'Post-Trial',
    description: 'Judgment notwithstanding the verdict',
    basePrice: 2250,
    turnaroundDays: { standard: 10, rush: 5 },
  },
  {
    code: 'MTN_NEW_TRIAL',
    name: 'Motion for New Trial',
    tier: 'C',
    category: 'Post-Trial',
    description: 'Request new trial due to errors or new evidence',
    basePrice: 1875,
    turnaroundDays: { standard: 10, rush: 5 },
  },
  {
    code: 'MTN_REMITTITUR',
    name: 'Motion for Remittitur/Additur',
    tier: 'C',
    category: 'Post-Trial',
    description: 'Reduce or increase damage award',
    basePrice: 1500,
    turnaroundDays: { standard: 7, rush: 4 },
  },
  {
    code: 'POST_TRIAL_BRIEF',
    name: 'Post-Trial Brief',
    tier: 'C',
    category: 'Post-Trial',
    description: 'Comprehensive post-trial argument',
    basePrice: 2500,
    turnaroundDays: { standard: 12, rush: 6 },
  },
  {
    code: 'MTN_SANCTIONS',
    name: 'Motion for Sanctions',
    tier: 'C',
    category: 'Sanctions',
    description: 'Seek penalties for misconduct',
    basePrice: 1625,
    turnaroundDays: { standard: 7, rush: 4 },
  },
];

/**
 * Get motion types by tier
 */
export function getMotionTypesByTier(tier: Tier): MotionType[] {
  return MOTION_TYPES.filter(mt => mt.tier === tier);
}

/**
 * Get motion type by code
 */
export function getMotionTypeByCode(code: string): MotionType | undefined {
  return MOTION_TYPES.find(mt => mt.code === code);
}

/**
 * Get all motion type categories
 */
export function getMotionCategories(): string[] {
  return [...new Set(MOTION_TYPES.map(mt => mt.category))];
}
