/**
 * Step 6: Authority Strength Assessment
 *
 * CIV Spec Section 9, Code Mode Spec Section 27
 *
 * NO AI - algorithm only
 *
 * Collects metrics from CourtListener:
 * - total_citations
 * - citations_last_5_years
 * - citations_last_10_years
 * - distinguish_count
 * - criticism_count
 *
 * Classifies:
 * - LANDMARK: >1000 total citations, consistently cited
 * - ESTABLISHED: 100-1000 citations, stable citation rate
 * - RECENT: <5 years old, growing citations
 * - DECLINING: citation rate dropping >50% over 5 years
 * - CONTROVERSIAL: high distinguish/criticism ratio
 *
 * Calculates strength_score 0-100 using weighted formula
 */

import { getCourtListenerClient } from '@/lib/workflow/courtlistener-client';
import { courtlistenerCircuit } from '@/lib/circuit-breaker';
import { createClient } from '@/lib/supabase/server';

// ============================================================================
// TYPES
// ============================================================================

export type AuthorityClassification =
  | 'LANDMARK'
  | 'ESTABLISHED'
  | 'RECENT'
  | 'DECLINING'
  | 'CONTROVERSIAL'
  | 'UNKNOWN';

export type CitationTrend = 'INCREASING' | 'STABLE' | 'DECLINING';

export interface AuthorityMetrics {
  total_citations: number;
  citations_last_5_years: number;
  citations_last_10_years: number;
  distinguish_count: number;
  criticism_count: number;
  citation_trend: CitationTrend;
  case_age_years: number;
  court_level: 'supreme' | 'appellate' | 'trial' | 'unknown';
  is_published: boolean;
}

export interface Step6Result {
  classification: AuthorityClassification;
  strength_score: number; // 0-100
  metrics: AuthorityMetrics;
  recommendation: string;
  duration_ms: number;
  error?: string;
}

// ============================================================================
// CONSTANTS
// ============================================================================

// Thresholds for classification
const THRESHOLDS = {
  LANDMARK_MIN_CITATIONS: 1000,
  ESTABLISHED_MIN_CITATIONS: 100,
  RECENT_MAX_AGE_YEARS: 5,
  DECLINING_DROP_PERCENT: 50,
  CONTROVERSIAL_DISTINGUISH_RATIO: 0.15, // 15% of citations distinguish
  CONTROVERSIAL_CRITICISM_RATIO: 0.10,   // 10% of citations criticize
};

// Weights for strength score calculation
const WEIGHTS = {
  TOTAL_CITATIONS: 0.25,
  RECENT_CITATIONS: 0.20,
  CITATION_TREND: 0.15,
  COURT_LEVEL: 0.20,
  NEGATIVE_TREATMENT: 0.15,
  PUBLICATION_STATUS: 0.05,
};

// Court level scores
const COURT_SCORES: Record<string, number> = {
  'supreme': 100,
  'scotus': 100,
  'u.s. supreme court': 100,
  'appellate': 75,
  'circuit': 75,
  'court of appeals': 75,
  'trial': 50,
  'district': 50,
  'bankruptcy': 40,
  'tax': 50,
  'unknown': 30,
};

// ============================================================================
// METRICS COLLECTION
// ============================================================================

async function collectMetrics(
  courtlistenerId: string,
  dateFiled: string | null
): Promise<AuthorityMetrics> {
  const metrics: AuthorityMetrics = {
    total_citations: 0,
    citations_last_5_years: 0,
    citations_last_10_years: 0,
    distinguish_count: 0,
    criticism_count: 0,
    citation_trend: 'STABLE',
    case_age_years: 0,
    court_level: 'unknown',
    is_published: true,
  };

  const now = new Date();
  const fiveYearsAgo = new Date(now.getFullYear() - 5, now.getMonth(), now.getDate());
  const tenYearsAgo = new Date(now.getFullYear() - 10, now.getMonth(), now.getDate());

  // Calculate case age
  if (dateFiled) {
    const fileDate = new Date(dateFiled);
    metrics.case_age_years = Math.floor(
      (now.getTime() - fileDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000)
    );
  }

  try {
    // Get cluster info for court level and publication status
    const clusterResponse = await courtlistenerCircuit.execute(async () => {
      const response = await fetch(
        `https://www.courtlistener.com/api/rest/v4/clusters/${courtlistenerId}/`,
        {
          headers: {
            'Authorization': `Token ${process.env.COURTLISTENER_API_KEY}`,
          },
        }
      );
      if (!response.ok) {
        throw new Error(`CourtListener API error: ${response.status}`);
      }
      return response.json();
    });

    // Determine court level
    const courtName = (clusterResponse.court || '').toLowerCase();
    for (const [key, score] of Object.entries(COURT_SCORES)) {
      if (courtName.includes(key)) {
        metrics.court_level = key.includes('supreme') ? 'supreme' :
                             key.includes('circuit') || key.includes('appeals') ? 'appellate' :
                             'trial';
        break;
      }
    }

    // Check publication status
    metrics.is_published = clusterResponse.precedential_status !== 'Unpublished';

    // Get citing cases
    const citingResponse = await courtlistenerCircuit.execute(async () => {
      const response = await fetch(
        `https://www.courtlistener.com/api/rest/v4/clusters/${courtlistenerId}/citing/?page_size=100`,
        {
          headers: {
            'Authorization': `Token ${process.env.COURTLISTENER_API_KEY}`,
          },
        }
      );
      if (!response.ok) {
        throw new Error(`CourtListener API error: ${response.status}`);
      }
      return response.json();
    });

    const citingCases = citingResponse.results || [];
    metrics.total_citations = citingResponse.count || citingCases.length;

    // Analyze citing cases
    for (const citingCase of citingCases) {
      const citingDate = citingCase.date_filed ? new Date(citingCase.date_filed) : null;
      const treatment = (citingCase.treatment || '').toLowerCase();

      // Count by time period
      if (citingDate) {
        if (citingDate >= fiveYearsAgo) {
          metrics.citations_last_5_years++;
        }
        if (citingDate >= tenYearsAgo) {
          metrics.citations_last_10_years++;
        }
      }

      // Count negative treatments
      if (treatment.includes('distinguish')) {
        metrics.distinguish_count++;
      }
      if (treatment.includes('critic') || treatment.includes('question') ||
          treatment.includes('disagree') || treatment.includes('disapprov')) {
        metrics.criticism_count++;
      }
    }

    // For cases with many citations, we may need to paginate
    // Estimate total recent citations based on sample
    if (metrics.total_citations > citingCases.length) {
      const sampleRatio = citingCases.length / metrics.total_citations;
      metrics.citations_last_5_years = Math.round(metrics.citations_last_5_years / sampleRatio);
      metrics.citations_last_10_years = Math.round(metrics.citations_last_10_years / sampleRatio);
      metrics.distinguish_count = Math.round(metrics.distinguish_count / sampleRatio);
      metrics.criticism_count = Math.round(metrics.criticism_count / sampleRatio);
    }

    // Determine citation trend
    metrics.citation_trend = determineCitationTrend(
      metrics.citations_last_5_years,
      metrics.citations_last_10_years - metrics.citations_last_5_years,
      metrics.case_age_years
    );

  } catch (error) {
    console.error('[Step6] Error collecting metrics:', error);
  }

  return metrics;
}

// ============================================================================
// TREND DETERMINATION
// ============================================================================

function determineCitationTrend(
  last5Years: number,
  prev5Years: number, // citations from 5-10 years ago
  caseAgeYears: number
): CitationTrend {
  // For recent cases, can't determine trend
  if (caseAgeYears < 5) {
    return last5Years > 0 ? 'INCREASING' : 'STABLE';
  }

  // If case is 5-10 years old, compare to expectations
  if (caseAgeYears < 10) {
    // Expected to have increasing citations as case gains recognition
    return last5Years > 5 ? 'INCREASING' : 'STABLE';
  }

  // For older cases, compare periods
  if (prev5Years === 0) {
    return last5Years > 0 ? 'INCREASING' : 'STABLE';
  }

  const changePercent = ((last5Years - prev5Years) / prev5Years) * 100;

  if (changePercent > 20) return 'INCREASING';
  if (changePercent < -30) return 'DECLINING';
  return 'STABLE';
}

// ============================================================================
// CLASSIFICATION
// ============================================================================

function classifyAuthority(metrics: AuthorityMetrics): AuthorityClassification {
  const {
    total_citations,
    citations_last_5_years,
    distinguish_count,
    criticism_count,
    citation_trend,
    case_age_years,
  } = metrics;

  // Check for CONTROVERSIAL first (high negative treatment ratio)
  if (total_citations > 10) {
    const distinguishRatio = distinguish_count / total_citations;
    const criticismRatio = criticism_count / total_citations;

    if (distinguishRatio > THRESHOLDS.CONTROVERSIAL_DISTINGUISH_RATIO ||
        criticismRatio > THRESHOLDS.CONTROVERSIAL_CRITICISM_RATIO) {
      return 'CONTROVERSIAL';
    }
  }

  // Check for LANDMARK
  if (total_citations >= THRESHOLDS.LANDMARK_MIN_CITATIONS &&
      citation_trend !== 'DECLINING') {
    return 'LANDMARK';
  }

  // Check for DECLINING
  if (case_age_years > 10 && citation_trend === 'DECLINING') {
    return 'DECLINING';
  }

  // Check for RECENT
  if (case_age_years <= THRESHOLDS.RECENT_MAX_AGE_YEARS) {
    return 'RECENT';
  }

  // Check for ESTABLISHED
  if (total_citations >= THRESHOLDS.ESTABLISHED_MIN_CITATIONS) {
    return 'ESTABLISHED';
  }

  // Default based on citation count
  if (total_citations > 20) {
    return 'ESTABLISHED';
  }

  return 'RECENT'; // Treat as recent if not enough data
}

// ============================================================================
// STRENGTH SCORE CALCULATION
// ============================================================================

function calculateStrengthScore(
  metrics: AuthorityMetrics,
  classification: AuthorityClassification
): number {
  let score = 0;

  // 1. Total citations component (25%)
  const citationScore = Math.min(100, (metrics.total_citations / 500) * 100);
  score += citationScore * WEIGHTS.TOTAL_CITATIONS;

  // 2. Recent citations component (20%)
  const recentScore = Math.min(100, (metrics.citations_last_5_years / 50) * 100);
  score += recentScore * WEIGHTS.RECENT_CITATIONS;

  // 3. Citation trend component (15%)
  const trendScore = metrics.citation_trend === 'INCREASING' ? 100 :
                     metrics.citation_trend === 'STABLE' ? 70 : 30;
  score += trendScore * WEIGHTS.CITATION_TREND;

  // 4. Court level component (20%)
  const courtScore = metrics.court_level === 'supreme' ? 100 :
                     metrics.court_level === 'appellate' ? 75 :
                     metrics.court_level === 'trial' ? 50 : 30;
  score += courtScore * WEIGHTS.COURT_LEVEL;

  // 5. Negative treatment penalty (15%)
  const negativeRatio = metrics.total_citations > 0
    ? (metrics.distinguish_count + metrics.criticism_count) / metrics.total_citations
    : 0;
  const negativeScore = Math.max(0, 100 - (negativeRatio * 200)); // Penalize heavily
  score += negativeScore * WEIGHTS.NEGATIVE_TREATMENT;

  // 6. Publication status (5%)
  const publicationScore = metrics.is_published ? 100 : 40;
  score += publicationScore * WEIGHTS.PUBLICATION_STATUS;

  // Apply classification modifier
  switch (classification) {
    case 'LANDMARK':
      score = Math.min(100, score * 1.1); // 10% bonus
      break;
    case 'CONTROVERSIAL':
      score = score * 0.7; // 30% penalty
      break;
    case 'DECLINING':
      score = score * 0.8; // 20% penalty
      break;
    default:
      // No modifier
      break;
  }

  return Math.round(Math.min(100, Math.max(0, score)));
}

// ============================================================================
// RECOMMENDATION GENERATION
// ============================================================================

function generateRecommendation(
  classification: AuthorityClassification,
  metrics: AuthorityMetrics,
  strengthScore: number
): string {
  switch (classification) {
    case 'LANDMARK':
      return `Landmark authority (${metrics.total_citations} citations). Strong precedential value.`;

    case 'ESTABLISHED':
      return `Established authority with ${metrics.total_citations} citations. Reliable for citation.`;

    case 'RECENT':
      if (metrics.citations_last_5_years > 10) {
        return `Recent case gaining traction (${metrics.citations_last_5_years} citations in 5 years). Monitor for development.`;
      }
      return `Recent case (${metrics.case_age_years} years old). Limited citation history but may be current on the law.`;

    case 'DECLINING':
      return `Authority appears to be declining (citation rate dropped). Verify still represents current law.`;

    case 'CONTROVERSIAL':
      return `Frequently distinguished or criticized (${metrics.distinguish_count} distinguishments, ${metrics.criticism_count} criticisms). Use with caution.`;

    default:
      if (strengthScore >= 70) {
        return `Appears to be reliable authority (score: ${strengthScore}/100).`;
      } else if (strengthScore >= 40) {
        return `Moderate authority (score: ${strengthScore}/100). Consider stronger supporting citations.`;
      }
      return `Limited authority data available. Manual verification recommended.`;
  }
}

// ============================================================================
// MAIN STRENGTH ASSESSMENT FUNCTION
// ============================================================================

/**
 * Step 6: Authority Strength Assessment
 *
 * NO AI - deterministic algorithm only
 *
 * @param citationText - The citation being assessed
 * @param courtlistenerId - CourtListener cluster ID
 * @param dateFiled - Date the case was filed
 * @param orderId - Order ID for logging
 * @param options - Additional options
 */
export async function assessAuthorityStrength(
  citationText: string,
  courtlistenerId: string | null,
  dateFiled: string | null,
  orderId: string,
  options?: {
    logToDb?: boolean;
  }
): Promise<Step6Result> {
  const startTime = Date.now();

  const result: Step6Result = {
    classification: 'UNKNOWN',
    strength_score: 50, // Default middle score
    metrics: {
      total_citations: 0,
      citations_last_5_years: 0,
      citations_last_10_years: 0,
      distinguish_count: 0,
      criticism_count: 0,
      citation_trend: 'STABLE',
      case_age_years: 0,
      court_level: 'unknown',
      is_published: true,
    },
    recommendation: '',
    duration_ms: 0,
  };

  try {
    if (!courtlistenerId) {
      result.error = 'No CourtListener ID provided';
      result.recommendation = 'Cannot assess authority strength without CourtListener data.';
      result.duration_ms = Date.now() - startTime;
      return result;
    }

    // Collect metrics from CourtListener
    result.metrics = await collectMetrics(courtlistenerId, dateFiled);

    // Classify the authority
    result.classification = classifyAuthority(result.metrics);

    // Calculate strength score
    result.strength_score = calculateStrengthScore(result.metrics, result.classification);

    // Generate recommendation
    result.recommendation = generateRecommendation(
      result.classification,
      result.metrics,
      result.strength_score
    );

  } catch (error) {
    result.error = error instanceof Error ? error.message : 'Unknown error';
    result.recommendation = `Error assessing authority: ${result.error}`;

    console.error('[Step6] Authority strength error:', result.error);
  }

  result.duration_ms = Date.now() - startTime;

  // Log to database if requested
  if (options?.logToDb) {
    await logStep6Result(orderId, citationText, result);
  }

  console.log(`[Step6] ${citationText.slice(0, 40)}...: ${result.classification} (score: ${result.strength_score}, ${result.duration_ms}ms)`);

  return result;
}

// ============================================================================
// DATABASE LOGGING
// ============================================================================

async function logStep6Result(
  orderId: string,
  citationText: string,
  result: Step6Result
): Promise<void> {
  try {
    const supabase = await createClient();

    await supabase.from('citation_verification_log').insert({
      order_id: orderId,
      citation_text: citationText,
      step_number: 6,
      step_name: 'authority_strength',
      status: result.classification,
      confidence: result.strength_score / 100,
      duration_ms: result.duration_ms,
      error_message: result.error,
      raw_response: {
        classification: result.classification,
        strength_score: result.strength_score,
        metrics: result.metrics,
        recommendation: result.recommendation,
      },
    });
  } catch (error) {
    console.error('[Step6] Failed to log result to database:', error);
  }
}

// ============================================================================
// BATCH PROCESSING
// ============================================================================

/**
 * Assess authority strength for multiple citations
 */
export async function assessAuthorityStrengthBatch(
  citations: Array<{
    citationText: string;
    courtlistenerId: string | null;
    dateFiled: string | null;
  }>,
  orderId: string,
  options?: {
    concurrency?: number;
    logToDb?: boolean;
    onProgress?: (completed: number, total: number) => void;
  }
): Promise<Map<string, Step6Result>> {
  const concurrency = options?.concurrency ?? 5;
  const results = new Map<string, Step6Result>();

  for (let i = 0; i < citations.length; i += concurrency) {
    const batch = citations.slice(i, i + concurrency);

    const batchResults = await Promise.all(
      batch.map(c =>
        assessAuthorityStrength(
          c.citationText,
          c.courtlistenerId,
          c.dateFiled,
          orderId,
          { logToDb: options?.logToDb }
        )
      )
    );

    batch.forEach((c, index) => {
      results.set(c.citationText, batchResults[index]);
    });

    if (options?.onProgress) {
      options.onProgress(Math.min(i + concurrency, citations.length), citations.length);
    }

    // Delay between batches
    if (i + concurrency < citations.length) {
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }

  return results;
}

export default {
  assessAuthorityStrength,
  assessAuthorityStrengthBatch,
  classifyAuthority,
  calculateStrengthScore,
};
