export const MOTION_TIERS = {
  tierA: {
    name: "Tier A — Procedural / Routine",
    turnaround: "2-3 business days",
    motions: [
      { id: "continue", name: "Motion to Continue", price: 350 },
      { id: "extend_deadline", name: "Motion to Extend Deadline", price: 350 },
      { id: "withdraw_counsel", name: "Motion to Withdraw as Counsel", price: 400 },
      { id: "pro_hac_vice", name: "Motion for Admission Pro Hac Vice", price: 400 },
      { id: "consolidate", name: "Motion to Consolidate", price: 400 },
      { id: "sever", name: "Motion to Sever", price: 400 },
      { id: "substitution", name: "Motion for Substitution of Parties", price: 400 },
      { id: "seal", name: "Motion to Seal", price: 350 },
      { id: "relate_cases", name: "Motion to Relate Cases", price: 300 },
      { id: "set_trial", name: "Motion to Set for Trial", price: 300 },
    ]
  },
  tierB: {
    name: "Tier B — Exceptions & Substantive",
    turnaround: "3-4 business days",
    motions: [
      { id: "compel_discovery", name: "Motion to Compel Discovery", price: 700 },
      { id: "protective_order", name: "Motion for Protective Order", price: 800 },
      { id: "quash_subpoena", name: "Motion to Quash Subpoena", price: 700 },
      { id: "declinatory", name: "Declinatory Exception", price: 750, description: "jurisdiction, venue, lis pendens" },
      { id: "dilatory", name: "Dilatory Exception", price: 750, description: "prematurity, vagueness, want of amicable demand" },
      { id: "peremptory_cause", name: "Peremptory Exception — No Cause of Action", price: 850 },
      { id: "peremptory_right", name: "Peremptory Exception — No Right of Action", price: 850 },
      { id: "peremptory_prescription", name: "Peremptory Exception — Prescription", price: 950 },
      { id: "peremptory_res_judicata", name: "Peremptory Exception — Res Judicata", price: 1000 },
      { id: "opposition_exception", name: "Opposition to Exception", price: null, description: "Priced same as corresponding exception" },
      { id: "in_limine_single", name: "Motion in Limine (single issue)", price: 700 },
      { id: "recuse", name: "Motion to Recuse", price: 800 },
    ]
  },
  tierC: {
    name: "Tier C — Complex",
    turnaround: "4-5 business days",
    motions: [
      { id: "in_limine_complex", name: "Motion in Limine (multiple/complex)", price: 999 },
      { id: "anti_slapp", name: "Anti-SLAPP Motion", price: 999 },
      { id: "jnov", name: "Motion for JNOV", price: 999 },
      { id: "new_trial", name: "Motion for New Trial", price: 999 },
      { id: "remittitur", name: "Motion for Remittitur/Additur", price: 999 },
      { id: "sanctions_complex", name: "Motion for Sanctions (Complex)", price: 999 },
      { id: "peremptory_exception", name: "Peremptory Exception", price: 999 },
    ]
  },
  tierD: {
    name: "Tier D — Highly Complex / Dispositive",
    turnaround: "5-7 business days",
    motions: [
      { id: "msj", name: "Motion for Summary Judgment", price: 1499 },
      { id: "msa", name: "Motion for Summary Adjudication", price: 1499 },
      { id: "partial_sj", name: "Motion for Partial Summary Judgment", price: 1499 },
      { id: "class_cert", name: "Motion for Class Certification", price: 1499 },
      { id: "decertify_class", name: "Motion to Decertify Class", price: 1499 },
      { id: "preliminary_injunction", name: "Motion for Preliminary Injunction", price: 1499 },
      { id: "tro", name: "Temporary Restraining Order", price: 1499 },
      { id: "daubert", name: "Daubert/Sargent Motion", price: 1499 },
      { id: "anti_slapp_complex", name: "Anti-SLAPP Motion (Complex)", price: 1499 },
    ]
  },
  other: {
    name: "Other",
    turnaround: "Quote required",
    motions: [
      { id: "other", name: "Other (describe below)", price: null, requiresQuote: true }
    ]
  }
} as const;

export const RUSH_OPTIONS = [
  { id: "standard", name: "Standard", multiplier: 1, description: "See turnaround by tier" },
  { id: "rush_72", name: "Rush: 72 hours", multiplier: 1.25, description: "+25%" },
  { id: "rush_48", name: "Rush: 48 hours", multiplier: 1.5, description: "+50%" },
] as const;

export const JURISDICTIONS = [
  { id: "la_state", name: "Louisiana State Court" },
  { id: "la_ed", name: "Louisiana Federal Court — Eastern District" },
  { id: "la_md", name: "Louisiana Federal Court — Middle District" },
  { id: "la_wd", name: "Louisiana Federal Court — Western District" },
  { id: "other", name: "Other (specify)" },
] as const;

export const PARTY_ROLES = [
  "Plaintiff",
  "Defendant",
  "Petitioner",
  "Respondent",
  "Intervenor",
  "Third-Party Defendant",
  "Cross-Claimant",
  "Cross-Defendant",
  "Other"
] as const;

export const ORDER_STATUSES = {
  submitted: { label: "Submitted", color: "orange", bgColor: "bg-orange-100", textColor: "text-orange-800" },
  under_review: { label: "Under Review", color: "yellow", bgColor: "bg-yellow-100", textColor: "text-yellow-800" },
  assigned: { label: "Assigned", color: "purple", bgColor: "bg-purple-100", textColor: "text-purple-800" },
  in_progress: { label: "In Progress", color: "indigo", bgColor: "bg-indigo-100", textColor: "text-indigo-800" },
  processing: { label: "Processing", color: "blue", bgColor: "bg-blue-100", textColor: "text-blue-800" },
  pending_review: { label: "Ready for Review", color: "amber", bgColor: "bg-amber-100", textColor: "text-amber-800" },
  draft_delivered: { label: "Delivered", color: "green", bgColor: "bg-green-100", textColor: "text-green-800" },
  revision_requested: { label: "Revision Requested", color: "purple", bgColor: "bg-purple-100", textColor: "text-purple-800" },
  revision_in_progress: { label: "Revision In Progress", color: "purple", bgColor: "bg-purple-100", textColor: "text-purple-800" },
  revision_delivered: { label: "Revision Delivered", color: "green", bgColor: "bg-green-100", textColor: "text-green-800" },
  completed: { label: "Completed", color: "emerald", bgColor: "bg-emerald-100", textColor: "text-emerald-800" },
  generation_failed: { label: "Generation Failed", color: "red", bgColor: "bg-red-100", textColor: "text-red-800" },
  blocked: { label: "Blocked", color: "red", bgColor: "bg-red-100", textColor: "text-red-800" },
  on_hold: { label: "On Hold", color: "red", bgColor: "bg-red-100", textColor: "text-red-800" },
  cancelled: { label: "Cancelled", color: "gray", bgColor: "bg-gray-100", textColor: "text-gray-800" },
  refunded: { label: "Refunded", color: "gray", bgColor: "bg-gray-100", textColor: "text-gray-500" },
} as const;

export type MotionTier = keyof typeof MOTION_TIERS;
export type RushOption = typeof RUSH_OPTIONS[number]['id'];
export type Jurisdiction = typeof JURISDICTIONS[number]['id'];
export type PartyRole = typeof PARTY_ROLES[number];
export type OrderStatus = keyof typeof ORDER_STATUSES;

export function getMotionById(id: string) {
  for (const tier of Object.values(MOTION_TIERS)) {
    const motion = tier.motions.find(m => m.id === id);
    if (motion) return { ...motion, tierName: tier.name, tierTurnaround: tier.turnaround };
  }
  return null;
}

export function getTierForMotion(motionId: string): 'A' | 'B' | 'C' | 'D' | null {
  if (MOTION_TIERS.tierA.motions.some(m => m.id === motionId)) return 'A';
  if (MOTION_TIERS.tierB.motions.some(m => m.id === motionId)) return 'B';
  if (MOTION_TIERS.tierC.motions.some(m => m.id === motionId)) return 'C';
  if (MOTION_TIERS.tierD.motions.some(m => m.id === motionId)) return 'D';
  return null;
}

export function calculatePrice(basePrice: number | null, rushMultiplier: number): number | null {
  if (basePrice === null) return null;
  return Math.round(basePrice * rushMultiplier);
}

/**
 * Formats a motion type ID to its display name
 * e.g., 'withdraw_counsel' -> 'Motion to Withdraw as Counsel'
 */
export function formatMotionType(motionId: string): string {
  const motion = getMotionById(motionId);
  if (motion) return motion.name;

  // Fallback: convert snake_case to Title Case
  return motionId
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
