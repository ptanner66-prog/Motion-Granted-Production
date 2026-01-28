/**
 * HIGH_STAKES Flag Detection
 *
 * Rules-based detection (NO AI) to identify high-stakes citations.
 *
 * A citation is HIGH_STAKES when ALL THREE conditions are true:
 * 1. Sole authority for a required element (only citation supporting this element)
 * 2. Supports outcome-determinative proposition (PRIMARY_STANDARD or REQUIRED_ELEMENT)
 * 3. Quoted directly in motion (direct quotation used)
 *
 * If HIGH_STAKES, always trigger Stage 2 verification regardless of Stage 1 confidence.
 *
 * Source: Quick Reference, API Architecture Spec
 */

// ============================================================================
// TYPES
// ============================================================================

export type PropositionType = 'PRIMARY_STANDARD' | 'REQUIRED_ELEMENT' | 'SECONDARY' | 'CONTEXT';

export interface HighStakesConditions {
  soleAuthority: boolean;
  outcomeDeterminative: boolean;
  quotedDirectly: boolean;
}

export interface HighStakesAnalysis {
  isHighStakes: boolean;
  conditions: HighStakesConditions;
  reasoning: string;
  riskLevel: 'critical' | 'high' | 'medium' | 'low';
  recommendation: string;
}

export interface CitationContext {
  citation: string;
  proposition: string;
  propositionType: PropositionType;
  allCitationsForElement: string[]; // other citations supporting same element
  hasDirectQuote: boolean;
  quoteText?: string;
}

// ============================================================================
// HIGH STAKES DETECTION
// ============================================================================

/**
 * Detect if a citation is HIGH_STAKES
 *
 * HIGH_STAKES = ALL THREE conditions must be true:
 * 1. soleAuthority: Only citation supporting this legal element
 * 2. outcomeDeterminative: Supports PRIMARY_STANDARD or REQUIRED_ELEMENT
 * 3. quotedDirectly: Motion contains a direct quote from this citation
 *
 * @param citation - The citation being analyzed
 * @param proposition - The legal proposition claimed to be supported
 * @param propositionType - Classification of the proposition
 * @param allCitationsForElement - All citations supporting the same element
 * @param hasDirectQuote - Whether the motion contains a direct quote from this case
 */
export function detectHighStakes(
  citation: string,
  proposition: string,
  propositionType: PropositionType,
  allCitationsForElement: string[],
  hasDirectQuote: boolean
): HighStakesAnalysis {
  // Condition 1: Sole authority for required element
  const soleAuthority = allCitationsForElement.length === 1;

  // Condition 2: Outcome-determinative proposition
  const outcomeDeterminative =
    propositionType === 'PRIMARY_STANDARD' ||
    propositionType === 'REQUIRED_ELEMENT';

  // Condition 3: Quoted directly in motion
  const quotedDirectly = hasDirectQuote;

  // HIGH_STAKES requires ALL THREE conditions
  const isHighStakes = soleAuthority && outcomeDeterminative && quotedDirectly;

  // Determine risk level based on conditions met
  const conditionsMet = [soleAuthority, outcomeDeterminative, quotedDirectly].filter(Boolean).length;
  const riskLevel = getRiskLevel(conditionsMet, propositionType);

  // Generate reasoning
  const reasoning = generateReasoning({
    soleAuthority,
    outcomeDeterminative,
    quotedDirectly,
  }, propositionType, allCitationsForElement.length);

  // Generate recommendation
  const recommendation = generateRecommendation(isHighStakes, riskLevel, {
    soleAuthority,
    outcomeDeterminative,
    quotedDirectly,
  });

  return {
    isHighStakes,
    conditions: {
      soleAuthority,
      outcomeDeterminative,
      quotedDirectly,
    },
    reasoning,
    riskLevel,
    recommendation,
  };
}

/**
 * Analyze high stakes for a citation with full context
 */
export function analyzeHighStakes(context: CitationContext): HighStakesAnalysis {
  return detectHighStakes(
    context.citation,
    context.proposition,
    context.propositionType,
    context.allCitationsForElement,
    context.hasDirectQuote
  );
}

// ============================================================================
// BATCH ANALYSIS
// ============================================================================

/**
 * Analyze HIGH_STAKES for multiple citations
 * Groups citations by the element they support
 */
export function analyzeHighStakesBatch(
  citations: Array<{
    citation: string;
    proposition: string;
    propositionType: PropositionType;
    elementKey: string; // unique key for the legal element being supported
    hasDirectQuote: boolean;
  }>
): Map<string, HighStakesAnalysis> {
  // Group citations by element
  const citationsByElement = new Map<string, string[]>();
  for (const c of citations) {
    const existing = citationsByElement.get(c.elementKey) || [];
    existing.push(c.citation);
    citationsByElement.set(c.elementKey, existing);
  }

  // Analyze each citation
  const results = new Map<string, HighStakesAnalysis>();

  for (const c of citations) {
    const allCitationsForElement = citationsByElement.get(c.elementKey) || [c.citation];
    const analysis = detectHighStakes(
      c.citation,
      c.proposition,
      c.propositionType,
      allCitationsForElement,
      c.hasDirectQuote
    );
    results.set(c.citation, analysis);
  }

  return results;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Determine risk level based on conditions met
 */
function getRiskLevel(
  conditionsMet: number,
  propositionType: PropositionType
): 'critical' | 'high' | 'medium' | 'low' {
  // All 3 conditions = critical (HIGH_STAKES)
  if (conditionsMet === 3) {
    return 'critical';
  }

  // 2 conditions with outcome-determinative = high
  if (conditionsMet === 2 && (propositionType === 'PRIMARY_STANDARD' || propositionType === 'REQUIRED_ELEMENT')) {
    return 'high';
  }

  // 2 conditions = medium
  if (conditionsMet === 2) {
    return 'medium';
  }

  // 1 condition with PRIMARY_STANDARD = medium
  if (conditionsMet === 1 && propositionType === 'PRIMARY_STANDARD') {
    return 'medium';
  }

  // Otherwise low
  return 'low';
}

/**
 * Generate human-readable reasoning
 */
function generateReasoning(
  conditions: HighStakesConditions,
  propositionType: PropositionType,
  totalCitationsForElement: number
): string {
  const parts: string[] = [];

  if (conditions.soleAuthority) {
    parts.push('This is the ONLY citation supporting this legal element.');
  } else {
    parts.push(`This element has ${totalCitationsForElement} supporting citations.`);
  }

  if (conditions.outcomeDeterminative) {
    parts.push(`The proposition type (${propositionType}) is outcome-determinative.`);
  } else {
    parts.push(`The proposition type (${propositionType}) is supporting context only.`);
  }

  if (conditions.quotedDirectly) {
    parts.push('The motion contains a DIRECT QUOTE from this case.');
  } else {
    parts.push('No direct quote from this case in the motion.');
  }

  const conditionsMet = [conditions.soleAuthority, conditions.outcomeDeterminative, conditions.quotedDirectly].filter(Boolean).length;

  if (conditionsMet === 3) {
    parts.push('ALL THREE HIGH_STAKES conditions are met.');
  } else {
    parts.push(`${conditionsMet}/3 HIGH_STAKES conditions met.`);
  }

  return parts.join(' ');
}

/**
 * Generate recommendation based on analysis
 */
function generateRecommendation(
  isHighStakes: boolean,
  riskLevel: 'critical' | 'high' | 'medium' | 'low',
  conditions: HighStakesConditions
): string {
  if (isHighStakes) {
    return 'HIGH_STAKES: Force Stage 2 adversarial verification. Consider adding supporting citations if possible.';
  }

  switch (riskLevel) {
    case 'high':
      if (!conditions.soleAuthority) {
        return 'High risk but not sole authority. Stage 2 recommended. Verify supporting citations are strong.';
      }
      if (!conditions.quotedDirectly) {
        return 'High risk sole authority without quote. Stage 2 recommended. Consider if quote would strengthen argument.';
      }
      return 'High risk. Stage 2 verification recommended.';

    case 'medium':
      if (conditions.soleAuthority) {
        return 'Sole authority for non-critical element. Consider adding supporting citations.';
      }
      return 'Moderate risk. Standard verification sufficient.';

    case 'low':
      return 'Low risk. Standard verification sufficient.';

    default:
      return 'Standard verification sufficient.';
  }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Check if any citation in a set is HIGH_STAKES
 */
export function hasHighStakesCitations(
  analyses: Map<string, HighStakesAnalysis> | HighStakesAnalysis[]
): boolean {
  const values = analyses instanceof Map ? Array.from(analyses.values()) : analyses;
  return values.some(a => a.isHighStakes);
}

/**
 * Get all HIGH_STAKES citations from a set
 */
export function getHighStakesCitations(
  analyses: Map<string, HighStakesAnalysis>
): string[] {
  const highStakes: string[] = [];
  for (const [citation, analysis] of analyses) {
    if (analysis.isHighStakes) {
      highStakes.push(citation);
    }
  }
  return highStakes;
}

/**
 * Count citations by risk level
 */
export function countByRiskLevel(
  analyses: Map<string, HighStakesAnalysis> | HighStakesAnalysis[]
): { critical: number; high: number; medium: number; low: number } {
  const values = analyses instanceof Map ? Array.from(analyses.values()) : analyses;
  return {
    critical: values.filter(a => a.riskLevel === 'critical').length,
    high: values.filter(a => a.riskLevel === 'high').length,
    medium: values.filter(a => a.riskLevel === 'medium').length,
    low: values.filter(a => a.riskLevel === 'low').length,
  };
}

/**
 * Should Stage 2 be forced based on HIGH_STAKES?
 */
export function shouldForceStage2(analysis: HighStakesAnalysis): boolean {
  return analysis.isHighStakes;
}

/**
 * Determine if a proposition type is outcome-determinative
 */
export function isOutcomeDeterminative(propositionType: PropositionType): boolean {
  return propositionType === 'PRIMARY_STANDARD' || propositionType === 'REQUIRED_ELEMENT';
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  detectHighStakes,
  analyzeHighStakes,
  analyzeHighStakesBatch,
  hasHighStakesCitations,
  getHighStakesCitations,
  countByRiskLevel,
  shouldForceStage2,
  isOutcomeDeterminative,
};
