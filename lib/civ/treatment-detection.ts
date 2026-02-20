/**
 * Citation Treatment Detection — Protocols 18-23
 *
 * Detects adverse treatments in legal citations:
 *   P18: Dicta-as-holding — citation misrepresents dicta as binding holding
 *   P19: Overruled — citation has been overruled by a later decision
 *   P20: Plurality opinion — no majority, holding may not be binding
 *   P21: Dissent — citation is from a dissenting opinion
 *   P22: Superseded by statute — legislative override
 *   P23: Amended/withdrawn — opinion was amended or withdrawn
 *
 * Canonical import: @/lib/civ/treatment-detection
 */

import { createLogger } from '@/lib/logging/logger';

const logger = createLogger('civ-treatment-detection');

// ============================================================================
// TYPES
// ============================================================================

export type TreatmentType =
  | 'OVERRULED'
  | 'SUPERSEDED_BY_STATUTE'
  | 'REVERSED'
  | 'DISTINGUISHED'
  | 'CRITICIZED'
  | 'QUESTIONED'
  | 'DICTA_AS_HOLDING'
  | 'PLURALITY_OPINION'
  | 'DISSENT_CITED'
  | 'AMENDED_OPINION'
  | 'WITHDRAWN';

export type TreatmentSeverity = 'BLOCKING' | 'WARNING' | 'INFO';

export interface TreatmentFlag {
  type: TreatmentType;
  severity: TreatmentSeverity;
  protocol: number;
  description: string;
  recommendation: string;
  citationText: string;
  source?: string;
}

export interface TreatmentResult {
  citationId: string;
  caseName: string;
  flags: TreatmentFlag[];
  hasBlockingTreatment: boolean;
  hasWarningTreatment: boolean;
}

export interface BatchTreatmentResult {
  results: TreatmentResult[];
  totalCitations: number;
  blockingCount: number;
  warningCount: number;
  cleanCount: number;
}

// ============================================================================
// SEVERITY MAPPING
// ============================================================================

const TREATMENT_SEVERITY: Record<TreatmentType, TreatmentSeverity> = {
  OVERRULED: 'BLOCKING',
  SUPERSEDED_BY_STATUTE: 'BLOCKING',
  REVERSED: 'BLOCKING',
  WITHDRAWN: 'BLOCKING',
  DICTA_AS_HOLDING: 'WARNING',
  PLURALITY_OPINION: 'WARNING',
  DISSENT_CITED: 'WARNING',
  AMENDED_OPINION: 'WARNING',
  DISTINGUISHED: 'INFO',
  CRITICIZED: 'INFO',
  QUESTIONED: 'INFO',
};

const TREATMENT_PROTOCOL: Record<TreatmentType, number> = {
  DICTA_AS_HOLDING: 18,
  OVERRULED: 19,
  PLURALITY_OPINION: 20,
  DISSENT_CITED: 21,
  SUPERSEDED_BY_STATUTE: 22,
  AMENDED_OPINION: 23,
  REVERSED: 19,
  WITHDRAWN: 23,
  DISTINGUISHED: 19,
  CRITICIZED: 19,
  QUESTIONED: 19,
};

// ============================================================================
// PATTERN-BASED DETECTION
// ============================================================================

/**
 * Signal words that indicate adverse treatment in legal text.
 * Mapped from Shepard's/KeyCite treatment categories.
 */
const TREATMENT_PATTERNS: Array<{ pattern: RegExp; type: TreatmentType }> = [
  // P19: Overruled / Reversed
  { pattern: /\boverruled\s+by\b/i, type: 'OVERRULED' },
  { pattern: /\boverruled\s+in\s+part\b/i, type: 'OVERRULED' },
  { pattern: /\boverruling\b/i, type: 'OVERRULED' },
  { pattern: /\breversed\s+by\b/i, type: 'REVERSED' },
  { pattern: /\breversed\s+and\s+remanded\b/i, type: 'REVERSED' },
  { pattern: /\bno\s+longer\s+good\s+law\b/i, type: 'OVERRULED' },
  { pattern: /\babrogated\s+by\b/i, type: 'OVERRULED' },

  // P22: Superseded by statute
  { pattern: /\bsuperseded\s+by\s+statute\b/i, type: 'SUPERSEDED_BY_STATUTE' },
  { pattern: /\bsuperseded\s+by\s+legislation\b/i, type: 'SUPERSEDED_BY_STATUTE' },
  { pattern: /\bsuperseded\s+in\s+part\s+by\b/i, type: 'SUPERSEDED_BY_STATUTE' },
  { pattern: /\blegislatively\s+overruled\b/i, type: 'SUPERSEDED_BY_STATUTE' },

  // P23: Amended / Withdrawn
  { pattern: /\bamended\s+opinion\b/i, type: 'AMENDED_OPINION' },
  { pattern: /\bwithdrawn\b/i, type: 'WITHDRAWN' },
  { pattern: /\bvacated\s+and\b/i, type: 'WITHDRAWN' },
  { pattern: /\bopinion\s+withdrawn\b/i, type: 'WITHDRAWN' },

  // P18: Dicta detection
  { pattern: /\bdicta\b/i, type: 'DICTA_AS_HOLDING' },
  { pattern: /\bobiter\s+dictum\b/i, type: 'DICTA_AS_HOLDING' },
  { pattern: /\bin\s+dictum\b/i, type: 'DICTA_AS_HOLDING' },

  // P20: Plurality
  { pattern: /\bplurality\s+opinion\b/i, type: 'PLURALITY_OPINION' },
  { pattern: /\bplurality\s+held\b/i, type: 'PLURALITY_OPINION' },
  { pattern: /\bno\s+majority\b/i, type: 'PLURALITY_OPINION' },

  // P21: Dissent
  { pattern: /\bdissenting\s+opinion\b/i, type: 'DISSENT_CITED' },
  { pattern: /\bdissent\b.*\bcited\b/i, type: 'DISSENT_CITED' },
  { pattern: /\b\w+,\s*J\.,?\s+dissenting\b/i, type: 'DISSENT_CITED' },

  // Informational
  { pattern: /\bdistinguished\s+(by|in|from)\b/i, type: 'DISTINGUISHED' },
  { pattern: /\bcriticized\s+(by|in)\b/i, type: 'CRITICIZED' },
  { pattern: /\bquestioned\s+(by|in)\b/i, type: 'QUESTIONED' },
];

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Detect adverse treatments for a single citation based on verification data.
 */
export function detectTreatments(
  citationId: string,
  caseName: string,
  citationText: string,
  verificationContext?: string,
  metadata?: {
    isPlurality?: boolean;
    isDissent?: boolean;
    isAmended?: boolean;
    treatmentFlags?: Array<{ type: string; severity?: string }>;
  }
): TreatmentResult {
  const flags: TreatmentFlag[] = [];
  const combinedText = `${citationText} ${verificationContext || ''}`;

  // 1. Check metadata flags from upstream verification
  if (metadata?.treatmentFlags) {
    for (const flag of metadata.treatmentFlags) {
      const type = flag.type as TreatmentType;
      if (TREATMENT_SEVERITY[type]) {
        flags.push(buildFlag(type, citationText, `Upstream verification: ${flag.type}`));
      }
    }
  }

  // 2. Check boolean metadata indicators
  if (metadata?.isPlurality) {
    flags.push(buildFlag('PLURALITY_OPINION', citationText, 'Metadata: plurality'));
  }
  if (metadata?.isDissent) {
    flags.push(buildFlag('DISSENT_CITED', citationText, 'Metadata: dissent'));
  }
  if (metadata?.isAmended) {
    flags.push(buildFlag('AMENDED_OPINION', citationText, 'Metadata: amended'));
  }

  // 3. Pattern-based detection on text
  for (const { pattern, type } of TREATMENT_PATTERNS) {
    if (pattern.test(combinedText)) {
      // Avoid duplicate flags
      if (!flags.some(f => f.type === type)) {
        flags.push(buildFlag(type, citationText, `Pattern match: ${pattern.source}`));
      }
    }
  }

  const hasBlockingTreatment = flags.some(f => f.severity === 'BLOCKING');
  const hasWarningTreatment = flags.some(f => f.severity === 'WARNING');

  if (flags.length > 0) {
    logger.info('treatment.detected', {
      citationId,
      caseName,
      flagCount: String(flags.length),
      blocking: String(hasBlockingTreatment),
    });
  }

  return {
    citationId,
    caseName,
    flags,
    hasBlockingTreatment,
    hasWarningTreatment,
  };
}

/**
 * Batch treatment detection for all citations in a verification run.
 */
export function detectBatchTreatments(
  citations: Array<{
    id: string;
    caseName: string;
    text: string;
    verificationContext?: string;
    metadata?: {
      isPlurality?: boolean;
      isDissent?: boolean;
      isAmended?: boolean;
      treatmentFlags?: Array<{ type: string; severity?: string }>;
    };
  }>
): BatchTreatmentResult {
  const results = citations.map(c =>
    detectTreatments(c.id, c.caseName, c.text, c.verificationContext, c.metadata)
  );

  const blockingCount = results.filter(r => r.hasBlockingTreatment).length;
  const warningCount = results.filter(r => r.hasWarningTreatment && !r.hasBlockingTreatment).length;
  const cleanCount = results.filter(r => r.flags.length === 0).length;

  logger.info('treatment.batch_complete', {
    total: String(citations.length),
    blocking: String(blockingCount),
    warning: String(warningCount),
    clean: String(cleanCount),
  });

  return {
    results,
    totalCitations: citations.length,
    blockingCount,
    warningCount,
    cleanCount,
  };
}

// ============================================================================
// HELPERS
// ============================================================================

function buildFlag(type: TreatmentType, citationText: string, source: string): TreatmentFlag {
  const severity = TREATMENT_SEVERITY[type];
  const protocol = TREATMENT_PROTOCOL[type];

  const descriptions: Record<TreatmentType, string> = {
    OVERRULED: 'This case has been overruled and may no longer be good law.',
    SUPERSEDED_BY_STATUTE: 'This case has been superseded by subsequent legislation.',
    REVERSED: 'This case has been reversed on appeal.',
    WITHDRAWN: 'This opinion has been withdrawn by the issuing court.',
    DICTA_AS_HOLDING: 'The cited language may be dicta rather than binding holding.',
    PLURALITY_OPINION: 'This is a plurality opinion with no majority — holding may not be binding.',
    DISSENT_CITED: 'The cited language appears to be from a dissenting opinion.',
    AMENDED_OPINION: 'This opinion has been amended. Verify the current version.',
    DISTINGUISHED: 'This case has been distinguished by later decisions.',
    CRITICIZED: 'This case has been criticized but not overruled.',
    QUESTIONED: 'The reasoning of this case has been questioned.',
  };

  const recommendations: Record<TreatmentType, string> = {
    OVERRULED: 'Remove this citation or replace with current authority.',
    SUPERSEDED_BY_STATUTE: 'Cite the superseding statute instead, or note the legislative change.',
    REVERSED: 'Remove this citation and replace with the appellate decision.',
    WITHDRAWN: 'Remove this citation entirely.',
    DICTA_AS_HOLDING: 'Clarify that this is dicta, or find binding authority for the proposition.',
    PLURALITY_OPINION: 'Acknowledge the plurality status and consider additional supporting authority.',
    DISSENT_CITED: 'Acknowledge this is a dissenting view, or cite the majority opinion instead.',
    AMENDED_OPINION: 'Verify you are citing the amended version of this opinion.',
    DISTINGUISHED: 'Consider whether the distinguishing factors apply to your case.',
    CRITICIZED: 'Consider whether the criticism weakens this authority for your arguments.',
    QUESTIONED: 'Be prepared to address the questioned reasoning.',
  };

  return {
    type,
    severity,
    protocol,
    description: descriptions[type],
    recommendation: recommendations[type],
    citationText,
    source,
  };
}
