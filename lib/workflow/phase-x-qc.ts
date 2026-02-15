/**
 * Phase X QC Checklist — Extended Checklist with Citation Strength
 *
 * Defines the QC checklist items for Phase X final assembly,
 * including the new citation strength analysis check for Tier B/C/D.
 *
 * This supplements the existing QC logic in lib/workflow/phases/phase-x.ts
 * with a structured, tier-aware checklist system.
 *
 * @version BATCH_12 — ST-007: AIS Citation Strength Section
 */

// ============================================================================
// TYPES
// ============================================================================

export interface QCChecklistItem {
  id: string;
  label: string;
  required: boolean;
  tier: ('A' | 'B' | 'C' | 'D')[];
}

// ============================================================================
// CHECKLIST DEFINITION
// ============================================================================

export const PHASE_X_QC_CHECKLIST: QCChecklistItem[] = [
  {
    id: 'all_required_documents_present',
    label: 'All required documents present',
    required: true,
    tier: ['A', 'B', 'C', 'D'],
  },
  {
    id: 'page_limit_compliance',
    label: 'Motion within jurisdictional page limits',
    required: true,
    tier: ['A', 'B', 'C', 'D'],
  },
  {
    id: 'caption_consistency',
    label: 'Caption block consistent across all documents',
    required: true,
    tier: ['A', 'B', 'C', 'D'],
  },
  {
    id: 'citation_accuracy_100',
    label: 'Citation Accuracy Report: 100% verified',
    required: true,
    tier: ['A', 'B', 'C', 'D'],
  },
  {
    id: 'citation_strength_analysis_complete',
    label: 'Citation strength analysis complete',
    required: true,
    tier: ['B', 'C', 'D'], // Not required for Tier A
  },
  {
    id: 'signature_blocks_present',
    label: 'Signature blocks present and properly formatted',
    required: true,
    tier: ['A', 'B', 'C', 'D'],
  },
  {
    id: 'proof_of_service_complete',
    label: 'Proof of service document included',
    required: true,
    tier: ['A', 'B', 'C', 'D'],
  },
  {
    id: 'separate_statement_included',
    label: 'Separate statement included (MSJ/MSA)',
    required: true,
    tier: ['C', 'D'],
  },
  {
    id: 'exhibits_properly_labeled',
    label: 'Exhibits properly labeled and referenced',
    required: false,
    tier: ['B', 'C', 'D'],
  },
];

// ============================================================================
// VALIDATION
// ============================================================================

export interface QCValidationResult {
  passed: boolean;
  missing: string[];
}

/**
 * Validate the QC checklist for a given order tier.
 *
 * Only evaluates items whose `tier` array includes the order tier
 * and whose `required` flag is true.
 */
export function validateQCChecklist(
  checklist: Record<string, boolean>,
  tier: 'A' | 'B' | 'C' | 'D'
): QCValidationResult {
  const missing: string[] = [];

  for (const item of PHASE_X_QC_CHECKLIST) {
    if (item.required && item.tier.includes(tier)) {
      if (!checklist[item.id]) {
        missing.push(item.label);
      }
    }
  }

  return {
    passed: missing.length === 0,
    missing,
  };
}

/**
 * Get all QC checklist items applicable to a given tier.
 */
export function getChecklistForTier(
  tier: 'A' | 'B' | 'C' | 'D'
): QCChecklistItem[] {
  return PHASE_X_QC_CHECKLIST.filter((item) => item.tier.includes(tier));
}
