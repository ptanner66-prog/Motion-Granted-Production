/**
 * ADVERSE AUTHORITY DETECTOR
 *
 * TASK-09: Detect cases adverse to the moving party's position.
 *
 * Under Louisiana Rules of Professional Conduct Rule 3.3(a)(2),
 * a lawyer has an obligation to disclose adverse authority in
 * the controlling jurisdiction.
 *
 * Audit Evidence (Pelican order):
 * Batch 3 returned Navarre Chevrolet v. Begnaud, 205 So.3d 973
 * (La. App. 3d Cir. 2016) — non-compete held null and void.
 * This is adverse to Pelican's enforceability argument.
 * The pipeline treated it the same as favorable candidates.
 *
 * @module adverse-authority-detector
 */

import type { ScoredCitation } from './citation-scorer';
import { logger } from '@/lib/logger';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface AdverseAuthority extends ScoredCitation {
  adverseIndicators: string[];
  holding: string;
  recommendedTreatment: string;
}

export interface AdverseAuthorityBank {
  authorities: AdverseAuthority[];
  count: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Indicators of adverse outcomes in snippet text.
 */
const ADVERSE_INDICATORS = [
  'null and void',
  'reversed',
  'vacated',
  'summary judgment denied',
  'injunction denied',
  'non-compete unenforceable',
  'noncompete unenforceable',
  'employer\'s claims fail',
  'employer failed to',
  'plaintiff\'s motion denied',
  'defendant prevailed',
  'we reverse',
  'judgment reversed',
  'affirmed in part, reversed in part',
  'failed to establish',
  'did not meet burden',
  'covenant is unenforceable',
  'agreement is invalid',
  'lacks consideration',
  'overbroad',
  'unreasonable restraint',
];

/**
 * Indicators that might seem adverse but are actually favorable.
 */
const FALSE_POSITIVE_INDICATORS = [
  'reversed the denial',
  'reversed and remanded for',
  'we reverse the summary judgment in favor of defendant',
  'employer prevailed',
  'plaintiff\'s motion granted',
  'non-compete enforced',
  'covenant upheld',
];

// ═══════════════════════════════════════════════════════════════════════════
// MAIN FUNCTION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Detect adverse authorities in research candidates.
 *
 * @param candidates - Citation candidates from Phase IV research
 * @returns Separate banks for favorable and adverse authorities
 */
export function detectAdverseAuthorities(
  candidates: ScoredCitation[]
): {
  favorableCandidates: ScoredCitation[];
  adverseAuthorities: AdverseAuthority[];
} {
  const favorable: ScoredCitation[] = [];
  const adverse: AdverseAuthority[] = [];

  for (const candidate of candidates) {
    const snippetLower = candidate.snippet.toLowerCase();

    // Check for false positives first
    const isFalsePositive = FALSE_POSITIVE_INDICATORS.some(
      indicator => snippetLower.includes(indicator.toLowerCase())
    );

    if (isFalsePositive) {
      favorable.push(candidate);
      continue;
    }

    // Check for adverse indicators
    const foundIndicators: string[] = [];
    for (const indicator of ADVERSE_INDICATORS) {
      if (snippetLower.includes(indicator.toLowerCase())) {
        foundIndicators.push(indicator);
      }
    }

    if (foundIndicators.length > 0) {
      // This is adverse authority
      const adverseAuth: AdverseAuthority = {
        ...candidate,
        adverseIndicators: foundIndicators,
        holding: extractHolding(candidate.snippet, foundIndicators),
        recommendedTreatment: generateTreatmentRecommendation(foundIndicators),
      };

      adverse.push(adverseAuth);

      logger.info('[ADVERSE-DETECTOR] Adverse authority detected', {
        caseName: candidate.caseName,
        citation: candidate.citation,
        indicators: foundIndicators,
      });
    } else {
      favorable.push(candidate);
    }
  }

  return {
    favorableCandidates: favorable,
    adverseAuthorities: adverse,
  };
}

/**
 * Extract the holding from snippet based on adverse indicators.
 */
function extractHolding(snippet: string, indicators: string[]): string {
  // Find sentences containing adverse indicators
  const sentences = snippet.split(/[.!?]+/);

  for (const sentence of sentences) {
    const sentenceLower = sentence.toLowerCase();
    for (const indicator of indicators) {
      if (sentenceLower.includes(indicator.toLowerCase())) {
        return sentence.trim() + '.';
      }
    }
  }

  return snippet.slice(0, 200) + '...';
}

/**
 * Generate treatment recommendation based on adverse indicators.
 */
function generateTreatmentRecommendation(indicators: string[]): string {
  const indicatorSet = new Set(indicators.map(i => i.toLowerCase()));

  if (indicatorSet.has('null and void') || indicatorSet.has('non-compete unenforceable')) {
    return 'Distinguish on grounds: (1) different factual circumstances, (2) narrower covenant scope, ' +
      '(3) presence of legitimate business interests in current case not present in adverse case.';
  }

  if (indicatorSet.has('overbroad') || indicatorSet.has('unreasonable restraint')) {
    return 'Distinguish by demonstrating the covenant in this case is narrowly tailored to protect ' +
      'legitimate business interests and does not impose undue hardship on the employee.';
  }

  if (indicatorSet.has('summary judgment denied')) {
    return 'Note that denial of summary judgment indicates genuine issues of material fact, ' +
      'whereas undisputed facts in this case support summary judgment.';
  }

  return 'Address by distinguishing the factual or legal basis and explaining why the holding ' +
    'does not control the present case.';
}

/**
 * Generate AIS section for adverse authority.
 */
export function generateAdverseAuthoritySection(
  adverseAuthorities: AdverseAuthority[]
): string {
  if (adverseAuthorities.length === 0) {
    return '';
  }

  let section = '## Adverse Authority Identified in Research\n\n';
  section += 'Under LRPC 3.3(a)(2), these cases must be disclosed and addressed:\n\n';

  for (const auth of adverseAuthorities) {
    section += `### ${auth.caseName}, ${auth.citation}\n\n`;
    section += `**Adverse Indicators:** ${auth.adverseIndicators.join(', ')}\n\n`;
    section += `**Holding:** ${auth.holding}\n\n`;
    section += `**Recommended Treatment:** ${auth.recommendedTreatment}\n\n`;
    section += '---\n\n';
  }

  return section;
}

/**
 * Check if adverse authorities are addressed in motion text.
 */
export function checkAdverseAuthoritiesAddressed(
  motionText: string,
  adverseAuthorities: AdverseAuthority[]
): { authority: AdverseAuthority; addressed: boolean }[] {
  return adverseAuthorities.map(auth => {
    const shortName = auth.caseName.split(' v.')[0].trim();
    const addressed = motionText.toLowerCase().includes(shortName.toLowerCase());

    if (!addressed) {
      logger.warn('[ADVERSE-DETECTOR] Adverse authority not addressed', {
        caseName: auth.caseName,
        citation: auth.citation,
      });
    }

    return { authority: auth, addressed };
  });
}
