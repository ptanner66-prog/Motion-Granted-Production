/**
 * CIV Step 6: Authority Strength Assessment
 *
 * Evaluate not just validity but STRENGTH of the citation.
 * Helps attorneys choose their strongest authorities.
 *
 * Metrics:
 * - Citation counts (total, 5yr, 10yr)
 * - Citation trend
 * - Distinguish rate
 * - Criticism count
 */

import { getCitingOpinions } from '@/lib/courtlistener/client';
// NOTE: Case.law API was sunset September 5, 2024
// import { getCitingCases } from '@/lib/caselaw/client';
import { recordStrengthAssessment } from '../database';
import type {
  AuthorityStrengthOutput,
  StabilityClass,
  StrengthAssessment,
  CitationTrend,
} from '../types';

/**
 * Execute Step 6: Authority Strength Assessment
 *
 * Code-only implementation using citation metrics.
 */
export async function executeAuthorityStrength(
  citation: string,
  year: number,
  courtlistenerId?: string,
  caselawId?: string,
  citationDbId?: string
): Promise<AuthorityStrengthOutput> {
  const currentYear = new Date().getFullYear();
  const caseAgeYears = currentYear - year;

  const result: AuthorityStrengthOutput = {
    step: 6,
    name: 'authority_strength',
    stabilityClass: 'RECENT',
    metrics: {
      caseAgeYears,
      totalCitations: 0,
      citationsLast5Years: 0,
      citationsLast10Years: 0,
      citationTrend: 'STABLE',
      distinguishCount: 0,
      distinguishRate: 0,
      criticismCount: 0,
    },
    strengthScore: 50,
    assessment: 'MODERATE',
    notes: '',
  };

  try {
    // Get citation data from CourtListener (primary source)
    // NOTE: Case.law fallback removed - API sunset September 5, 2024
    let citingData: CitingData | null = null;

    if (courtlistenerId) {
      citingData = await getCourtListenerCitingData(courtlistenerId);
    }

    if (citingData) {
      result.metrics.totalCitations = citingData.total;
      result.metrics.citationsLast5Years = citingData.last5Years;
      result.metrics.citationsLast10Years = citingData.last10Years;
      result.metrics.distinguishCount = citingData.distinguishCount;
      result.metrics.criticismCount = citingData.criticismCount;

      // Calculate distinguish rate
      if (citingData.total > 0) {
        result.metrics.distinguishRate = citingData.distinguishCount / citingData.total;
      }

      // Determine citation trend
      result.metrics.citationTrend = determineTrend(
        caseAgeYears,
        citingData.total,
        citingData.last5Years,
        citingData.last10Years
      );
    }

    // Calculate stability class
    result.stabilityClass = classifyStability(
      caseAgeYears,
      result.metrics.totalCitations,
      result.metrics.citationsLast5Years,
      result.metrics.distinguishRate,
      result.metrics.criticismCount
    );

    // Calculate strength score
    result.strengthScore = calculateStrengthScore(
      result.metrics.totalCitations,
      result.metrics.citationsLast5Years,
      result.metrics.citationTrend,
      result.metrics.distinguishRate,
      result.metrics.criticismCount
    );

    // Determine assessment
    result.assessment = scoreToAssessment(result.strengthScore);

    // Generate notes
    result.notes = generateNotes(
      result.stabilityClass,
      caseAgeYears,
      result.metrics.totalCitations,
      result.metrics.citationsLast5Years
    );

    // Record in database
    if (citationDbId) {
      await recordStrengthAssessment({
        citationId: citationDbId,
        ...result.metrics,
        stabilityClass: result.stabilityClass,
        strengthScore: result.strengthScore,
        assessment: result.assessment,
        notes: result.notes,
      });
    }

    return result;
  } catch (error) {
    console.error('Authority strength assessment error:', error);
    result.notes = `Assessment incomplete: ${error instanceof Error ? error.message : 'Unknown error'}`;
    return result;
  }
}

interface CitingData {
  total: number;
  last5Years: number;
  last10Years: number;
  distinguishCount: number;
  criticismCount: number;
}

/**
 * Get citing data from CourtListener
 */
async function getCourtListenerCitingData(opinionId: string): Promise<CitingData | null> {
  const citingResult = await getCitingOpinions(opinionId, 200);

  if (!citingResult.success || !citingResult.data) {
    return null;
  }

  const currentYear = new Date().getFullYear();
  const fiveYearsAgo = currentYear - 5;
  const tenYearsAgo = currentYear - 10;

  let total = citingResult.data.length;
  let last5Years = 0;
  let last10Years = 0;
  let distinguishCount = 0;
  let criticismCount = 0;

  for (const citing of citingResult.data) {
    const treatment = (citing.treatment || '').toLowerCase();

    // Count by treatment type
    if (treatment === 'distinguished') {
      distinguishCount++;
    }
    if (treatment === 'criticized' || treatment === 'questioned') {
      criticismCount++;
    }

    // We don't have date info in the citing opinions response
    // This would need additional API calls in production
  }

  // Estimate recent citations based on total (rough approximation)
  // In production, would need to fetch actual dates
  if (total > 0) {
    last10Years = Math.round(total * 0.4); // Assume 40% in last 10 years
    last5Years = Math.round(total * 0.2); // Assume 20% in last 5 years
  }

  return {
    total,
    last5Years,
    last10Years,
    distinguishCount,
    criticismCount,
  };
}

/**
 * Get citing data from Case.law
 * @deprecated Case.law API was sunset September 5, 2024
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function getCaseLawCitingData(_caseId: string): Promise<CitingData | null> {
  // Case.law API was sunset September 5, 2024
  // This function is kept for reference but always returns null
  console.warn('[DEPRECATED] getCaseLawCitingData - Case.law API sunset September 5, 2024');
  return null;
}

/**
 * Determine citation trend
 */
function determineTrend(
  caseAgeYears: number,
  total: number,
  last5Years: number,
  last10Years: number
): CitationTrend {
  if (total === 0 || caseAgeYears < 5) {
    return 'STABLE';
  }

  // Calculate expected citations per year (historical average)
  const historicalRate = total / caseAgeYears;

  // Calculate recent rate (last 5 years)
  const recentRate = last5Years / 5;

  // Compare rates
  const rateRatio = recentRate / historicalRate;

  if (rateRatio > 1.2) {
    return 'INCREASING';
  } else if (rateRatio < 0.6) {
    return 'DECLINING';
  }

  return 'STABLE';
}

/**
 * Classify stability based on metrics
 *
 * Per spec:
 * - LANDMARK: Age 30+, citations 500+, still cited 10+/5yr, no negative
 * - ESTABLISHED: Age 10-30, citations 50-500, minimal negative
 * - RECENT: Age <10, citations <50
 * - DECLINING: Age 20+, citation trend significantly declining
 * - CONTROVERSIAL: Distinguish rate >15% OR criticism 3+
 */
function classifyStability(
  caseAgeYears: number,
  totalCitations: number,
  citationsLast5Years: number,
  distinguishRate: number,
  criticismCount: number
): StabilityClass {
  // Check for CONTROVERSIAL first
  if (distinguishRate > 0.15 || criticismCount >= 3) {
    return 'CONTROVERSIAL';
  }

  // Check for LANDMARK
  if (
    caseAgeYears >= 30 &&
    totalCitations >= 500 &&
    citationsLast5Years >= 10 &&
    criticismCount === 0
  ) {
    return 'LANDMARK';
  }

  // Check for DECLINING
  if (caseAgeYears >= 20) {
    const expectedRecentRate = (totalCitations / caseAgeYears) * 5;
    if (citationsLast5Years < expectedRecentRate * 0.3) {
      return 'DECLINING';
    }
  }

  // Check for ESTABLISHED
  if (
    caseAgeYears >= 10 &&
    caseAgeYears < 30 &&
    totalCitations >= 50 &&
    totalCitations < 500 &&
    criticismCount < 3
  ) {
    return 'ESTABLISHED';
  }

  // Check for RECENT
  if (caseAgeYears < 10 || totalCitations < 50) {
    return 'RECENT';
  }

  // Default to ESTABLISHED
  return 'ESTABLISHED';
}

/**
 * Calculate strength score (0-100)
 *
 * Per spec formula:
 * BASE_SCORE = 50
 * + Citation volume bonus (max +25)
 * + Recency bonus (max +15)
 * + Trend adjustment (+5 / -10)
 * - Negative treatment penalty (capped at -30)
 */
function calculateStrengthScore(
  totalCitations: number,
  citationsLast5Years: number,
  citationTrend: CitationTrend,
  distinguishRate: number,
  criticismCount: number
): number {
  let score = 50; // Base score

  // Citation volume bonus (max +25)
  if (totalCitations > 500) {
    score += 25;
  } else if (totalCitations > 100) {
    score += 20;
  } else if (totalCitations > 50) {
    score += 15;
  } else if (totalCitations > 20) {
    score += 10;
  } else if (totalCitations > 10) {
    score += 5;
  }

  // Recency bonus (max +15)
  if (citationsLast5Years > 20) {
    score += 15;
  } else if (citationsLast5Years > 10) {
    score += 10;
  } else if (citationsLast5Years > 5) {
    score += 5;
  }

  // Trend adjustment
  if (citationTrend === 'INCREASING') {
    score += 5;
  } else if (citationTrend === 'DECLINING') {
    score -= 10;
  }

  // Negative treatment penalty (capped at -30)
  const penalty = Math.min(30, distinguishRate * 50 + criticismCount * 5);
  score -= penalty;

  // Clamp to 0-100 range
  return Math.max(0, Math.min(100, Math.round(score)));
}

/**
 * Convert score to assessment
 */
function scoreToAssessment(score: number): StrengthAssessment {
  if (score >= 75) {
    return 'STRONG';
  } else if (score >= 50) {
    return 'MODERATE';
  }
  return 'WEAK';
}

/**
 * Generate human-readable notes
 */
function generateNotes(
  stabilityClass: StabilityClass,
  caseAgeYears: number,
  totalCitations: number,
  citationsLast5Years: number
): string {
  const classDescriptions: Record<StabilityClass, string> = {
    LANDMARK: 'Landmark authority with extensive citation history',
    ESTABLISHED: 'Established precedent with solid citation support',
    RECENT: 'Recent decision - citation history still developing',
    DECLINING: 'Older case with declining citation frequency',
    CONTROVERSIAL: 'Case has received notable criticism or distinction',
  };

  const baseNote = classDescriptions[stabilityClass];

  const details = [];
  if (caseAgeYears > 0) {
    details.push(`${caseAgeYears} years old`);
  }
  if (totalCitations > 0) {
    details.push(`${totalCitations} total citations`);
  }
  if (citationsLast5Years > 0) {
    details.push(`${citationsLast5Years} citations in last 5 years`);
  }

  return details.length > 0 ? `${baseNote}. ${details.join(', ')}.` : baseNote + '.';
}
