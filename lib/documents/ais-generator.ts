/**
 * AIS (Attorney Instruction Sheet) Generator — Section 5C: Citation Strength Analysis
 *
 * Generates citation strength analysis data for inclusion in the AIS.
 * Section 5C is only included for Tier B/C/D orders (Tier A skips citation network).
 *
 * @version BATCH_12 — ST-007: AIS Citation Strength Section
 */

import type { StrengthScore } from '@/lib/citation/steps/step-6-flags';

// ============================================================================
// TYPES
// ============================================================================

export interface AISSection {
  id: string;
  title: string;
  content: string;
}

export interface VerifiedCitationInput {
  normalized: string;
  shortCitation: string;
}

export interface AISDocument {
  sections: AISSection[];
}

// ============================================================================
// SECTION 5C: CITATION STRENGTH ANALYSIS
// ============================================================================

/**
 * Format star rating from strength rating value.
 */
function formatStarRating(rating: StrengthScore['rating']): string {
  switch (rating) {
    case 'STRONG':
      return '***** STRONG';
    case 'MODERATE':
      return '**** MODERATE';
    case 'WEAK':
      return '** WEAK';
    case 'INSUFFICIENT_DATA':
      return '* INSUFFICIENT DATA';
    default:
      return '—';
  }
}

/**
 * Get recommendation text for a strength rating.
 */
function getStrengthRecommendation(rating: StrengthScore['rating']): string {
  switch (rating) {
    case 'STRONG':
      return 'Well-supported authority';
    case 'MODERATE':
      return 'Adequate support';
    case 'WEAK':
      return 'Consider supplementing';
    case 'INSUFFICIENT_DATA':
      return 'Limited data available';
    default:
      return '';
  }
}

/**
 * Generate AIS Section 5C: Citation Strength Analysis.
 *
 * Only included for Tier B/C/D (Tier A skips citation network analysis).
 * Returns null for Tier A orders.
 */
export function generateSection5C(
  citations: VerifiedCitationInput[],
  tier: 'A' | 'B' | 'C' | 'D',
  strengthScores: Map<string, StrengthScore>
): AISSection | null {
  // Skip for Tier A
  if (tier === 'A') {
    return null;
  }

  // Build strength analysis table
  const rows: string[] = [];
  let allInsufficient = true;

  for (const citation of citations) {
    const score = strengthScores.get(citation.normalized);
    if (!score) continue;

    if (score.rating !== 'INSUFFICIENT_DATA') {
      allInsufficient = false;
    }

    const stars = formatStarRating(score.rating);
    const recommendation = getStrengthRecommendation(score.rating);

    rows.push(
      `| ${citation.shortCitation} | ${stars} | ${score.citingOpinionCount} | ${recommendation} |`
    );
  }

  // If no strength data at all, skip the section
  if (rows.length === 0) {
    return null;
  }

  // Header note for all INSUFFICIENT_DATA
  const headerNote = allInsufficient
    ? '\n*Note: Citation network data was insufficient for strength scoring. This does not indicate citation quality issues. Attorney should verify independently.*\n'
    : '';

  const content = `${headerNote}
| Citation | Strength | Citing Opinions | Recommendation |
|----------|----------|-----------------|----------------|
${rows.join('\n')}

**Strength Rating Scale:**
- ***** STRONG: 50+ citing opinions with positive treatment
- **** MODERATE: 10-49 citing opinions
- ** WEAK: Significant negative treatment or very few citations
- * INSUFFICIENT DATA: Fewer than 5 citing opinions on record
`;

  return {
    id: '5C',
    title: 'Citation Strength Analysis',
    content,
  };
}

/**
 * Generate a complete AIS document with Section 5C included.
 *
 * This function assembles the AIS sections. Other sections (1-5B, 6+)
 * are provided by the caller; this adds Section 5C for Tier B/C/D.
 */
export function generateAIS(
  existingSections: AISSection[],
  citations: VerifiedCitationInput[],
  tier: 'A' | 'B' | 'C' | 'D',
  strengthScores: Map<string, StrengthScore>
): AISDocument {
  const sections: AISSection[] = [...existingSections];

  // Insert Section 5C after the last 5x section (or at the end if none found)
  const section5C = generateSection5C(citations, tier, strengthScores);
  if (section5C) {
    // Find the insertion point: after the last section with ID starting with '5'
    let insertIndex = sections.length;
    for (let i = sections.length - 1; i >= 0; i--) {
      if (sections[i].id.startsWith('5')) {
        insertIndex = i + 1;
        break;
      }
    }
    sections.splice(insertIndex, 0, section5C);
  }

  return { sections };
}
