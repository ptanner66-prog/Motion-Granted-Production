export const MOTION_TIERS = {
  tier1: {
    name: "Tier 1 — Procedural / Routine",
    turnaround: "3-5 business days",
    motions: [
      { id: "continue", name: "Motion to Continue", price: 350 },
      { id: "extend_deadline", name: "Motion to Extend Deadline", price: 350 },
      { id: "withdraw_counsel", name: "Motion to Withdraw as Counsel", price: 400 },
      { id: "pro_hac_vice", name: "Motion for Admission Pro Hac Vice", price: 450 },
      { id: "consolidate", name: "Motion to Consolidate", price: 450 },
      { id: "sever", name: "Motion to Sever", price: 450 },
      { id: "substitution", name: "Motion for Substitution of Parties", price: 450 },
      { id: "compel_discovery", name: "Motion to Compel Discovery", price: 600 },
      { id: "protective_order", name: "Motion for Protective Order", price: 650 },
      { id: "quash_subpoena", name: "Motion to Quash Subpoena", price: 600 },
    ]
  },
  tier2: {
    name: "Tier 2 — Exceptions & Substantive",
    turnaround: "5-7 business days",
    motions: [
      { id: "declinatory", name: "Declinatory Exception", price: 750, description: "jurisdiction, venue, lis pendens" },
      { id: "dilatory", name: "Dilatory Exception", price: 750, description: "prematurity, vagueness, want of amicable demand" },
      { id: "peremptory_cause", name: "Peremptory Exception — No Cause of Action", price: 850 },
      { id: "peremptory_right", name: "Peremptory Exception — No Right of Action", price: 850 },
      { id: "peremptory_prescription", name: "Peremptory Exception — Prescription", price: 950 },
      { id: "peremptory_res_judicata", name: "Peremptory Exception — Res Judicata", price: 1000 },
      { id: "opposition_exception", name: "Opposition to Exception", price: null, description: "Priced same as corresponding exception" },
      { id: "in_limine_single", name: "Motion in Limine (single issue)", price: 700 },
      { id: "in_limine_complex", name: "Motion in Limine (multiple/complex)", price: 1000 },
      { id: "recuse", name: "Motion to Recuse", price: 800 },
      { id: "preliminary_injunction", name: "Motion for Preliminary Injunction", price: 1400 },
      { id: "tro", name: "Motion for Temporary Restraining Order", price: 1000 },
    ]
  },
  tier3: {
    name: "Tier 3 — Heavy Lift",
    turnaround: "7-14 business days",
    motions: [
      { id: "msj_simple", name: "Motion for Summary Judgment (straightforward)", price: 2000 },
      { id: "msj_complex", name: "Motion for Summary Judgment (complex/multi-issue)", price: 3200 },
      { id: "opp_msj", name: "Opposition to Motion for Summary Judgment", price: 2200, priceMax: 3400 },
      { id: "partial_sj", name: "Motion for Partial Summary Judgment", price: 1700 },
      { id: "jnov", name: "Motion for JNOV", price: 2500 },
      { id: "new_trial", name: "Motion for New Trial", price: 1700 },
      { id: "remittitur", name: "Motion for Remittitur/Additur", price: 1400 },
      { id: "post_trial_brief", name: "Post-Trial Brief", price: 2800, requiresQuote: true },
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
  submitted: { label: "Submitted", color: "blue", bgColor: "bg-blue-100", textColor: "text-blue-800" },
  under_review: { label: "Under Review", color: "yellow", bgColor: "bg-yellow-100", textColor: "text-yellow-800" },
  assigned: { label: "Assigned", color: "purple", bgColor: "bg-purple-100", textColor: "text-purple-800" },
  in_progress: { label: "In Progress", color: "indigo", bgColor: "bg-indigo-100", textColor: "text-indigo-800" },
  draft_delivered: { label: "Draft Delivered", color: "green", bgColor: "bg-green-100", textColor: "text-green-800" },
  revision_requested: { label: "Revision Requested", color: "orange", bgColor: "bg-orange-100", textColor: "text-orange-800" },
  revision_delivered: { label: "Revision Delivered", color: "green", bgColor: "bg-green-100", textColor: "text-green-800" },
  completed: { label: "Completed", color: "emerald", bgColor: "bg-emerald-100", textColor: "text-emerald-800" },
  on_hold: { label: "On Hold", color: "red", bgColor: "bg-red-100", textColor: "text-red-800" },
  cancelled: { label: "Cancelled", color: "gray", bgColor: "bg-gray-100", textColor: "text-gray-800" },
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

export function getTierForMotion(motionId: string): number {
  if (MOTION_TIERS.tier1.motions.some(m => m.id === motionId)) return 1;
  if (MOTION_TIERS.tier2.motions.some(m => m.id === motionId)) return 2;
  if (MOTION_TIERS.tier3.motions.some(m => m.id === motionId)) return 3;
  return 0;
}

export function calculatePrice(basePrice: number | null, rushMultiplier: number): number | null {
  if (basePrice === null) return null;
  return Math.round(basePrice * rushMultiplier);
}
