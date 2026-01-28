/**
 * CIV Report Generator
 *
 * Generates human-readable and structured reports for citation verification.
 * Formats per Clay's specification (Section 19).
 */

import type { FinalVerificationOutput, BatchVerificationResult } from './types';

/**
 * Generate full text report
 */
export function generateTextReport(
  orderNumber: string,
  motionType: string,
  result: BatchVerificationResult
): string {
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const timeStr = now.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  });

  let report = `CITATION VERIFICATION REPORT
Order #: ${orderNumber}
Motion: ${motionType}
Verified: ${dateStr} ${timeStr}

SUMMARY
${'━'.repeat(50)}
Total Citations Verified:     ${result.totalCitations}
Verified (No Issues):         ${result.verified}  (${percentage(result.verified, result.totalCitations)}%)
Verified with Notes:          ${result.flagged}  (${percentage(result.flagged, result.totalCitations)}%)
Flagged for Review:           ${result.rejected}  (${percentage(result.rejected, result.totalCitations)}%)
Removed (Unverifiable):       ${result.blocked}  (${percentage(result.blocked, result.totalCitations)}%)

Average Confidence Score:     ${result.summary.averageConfidence.toFixed(2)}
Verification Time:            ${Math.round(result.summary.totalDurationMs / 1000)} seconds
Estimated Cost:               $${result.summary.estimatedTotalCost.toFixed(2)}

`;

  // Detailed results
  report += `DETAILED VERIFICATION RESULTS
${'━'.repeat(50)}
`;

  result.results.forEach((r, index) => {
    const statusIcon = getStatusIcon(r.compositeResult.status);

    report += `
${index + 1}. ${r.citation.input}
   Proposition: "${truncate(r.proposition.text, 60)}"
   Status: ${statusIcon} ${r.compositeResult.status}
   Confidence: ${(r.compositeResult.confidenceScore * 100).toFixed(0)}%
   Authority: ${r.verificationResults.step6Strength.stabilityClass} (strength score: ${r.verificationResults.step6Strength.strengthScore})`;

    if (r.compositeResult.flags.length > 0) {
      report += `
   Issues:`;
      r.compositeResult.flags.forEach(flag => {
        report += `
     - ${flag.message}`;
      });
    }

    if (r.compositeResult.notes.length > 0) {
      report += `
   Notes:`;
      r.compositeResult.notes.slice(0, 3).forEach(note => {
        report += `
     - ${note}`;
      });
    }

    report += '\n';
  });

  // Disclosure section
  report += generateDisclosureSection();

  return report;
}

/**
 * Generate flagged citations summary for Attorney Instruction Sheet
 */
export function generateAttorneyInstructionNotes(
  result: BatchVerificationResult
): string {
  const flaggedResults = result.results.filter(
    r => r.compositeResult.status === 'FLAGGED' || r.compositeResult.status === 'REJECTED'
  );

  if (flaggedResults.length === 0) {
    return `CITATION VERIFICATION NOTES
${'━'.repeat(50)}

□ All ${result.totalCitations} citations have been verified through our multi-layer
  verification system

□ No citations flagged for review

□ Recommended: Independent Shepardizing for high-stakes citations
  marked with ★

□ Pinpoint page citations: We do not verify pinpoint pages. Please
  verify before filing if you add pinpoints.
`;
  }

  let notes = `CITATION VERIFICATION NOTES
${'━'.repeat(50)}

□ ${result.verified} of ${result.totalCitations} citations verified without issues

□ ${flaggedResults.length} citation(s) flagged for your review — see details below

□ Recommended: Independent Shepardizing for high-stakes citations

FLAGGED CITATIONS REQUIRING ATTENTION:
`;

  flaggedResults.forEach((r, index) => {
    const primaryIssue = r.compositeResult.flags[0]?.message || 'Review recommended';
    const recommendation = getRecommendation(r.compositeResult.actionRequired);

    notes += `
${index + 1}. ${r.citation.input}
   Issue: ${primaryIssue}
   Recommendation: ${recommendation}
`;
  });

  return notes;
}

/**
 * Generate JSON summary for API responses
 */
export function generateStructuredSummary(result: BatchVerificationResult): {
  summary: {
    totalCitations: number;
    verified: number;
    flagged: number;
    rejected: number;
    blocked: number;
    verifiedPercentage: number;
    averageConfidence: number;
    estimatedCost: number;
  };
  flaggedCitations: Array<{
    citation: string;
    issue: string;
    recommendation: string;
    confidence: number;
  }>;
  strongAuthorities: Array<{
    citation: string;
    stabilityClass: string;
    strengthScore: number;
  }>;
} {
  return {
    summary: {
      totalCitations: result.totalCitations,
      verified: result.verified,
      flagged: result.flagged,
      rejected: result.rejected,
      blocked: result.blocked,
      verifiedPercentage: percentage(result.verified, result.totalCitations),
      averageConfidence: result.summary.averageConfidence,
      estimatedCost: result.summary.estimatedTotalCost,
    },
    flaggedCitations: result.results
      .filter(r => r.compositeResult.status === 'FLAGGED' || r.compositeResult.status === 'REJECTED')
      .map(r => ({
        citation: r.citation.input,
        issue: r.compositeResult.flags[0]?.message || 'Review recommended',
        recommendation: getRecommendation(r.compositeResult.actionRequired),
        confidence: r.compositeResult.confidenceScore,
      })),
    strongAuthorities: result.results
      .filter(r =>
        r.compositeResult.status === 'VERIFIED' &&
        r.verificationResults.step6Strength.strengthScore >= 75
      )
      .map(r => ({
        citation: r.citation.input,
        stabilityClass: r.verificationResults.step6Strength.stabilityClass,
        strengthScore: r.verificationResults.step6Strength.strengthScore,
      }))
      .sort((a, b) => b.strengthScore - a.strengthScore),
  };
}

/**
 * Generate disclosure section per spec
 */
function generateDisclosureSection(): string {
  return `

${'━'.repeat(50)}
CITATION VERIFICATION SCOPE
${'━'.repeat(50)}

Motion Granted verifies:
✓ Citation existence (case found in legal databases)
✓ Holding accuracy (case supports stated proposition)
✓ Dicta detection (holding vs. judicial commentary)
✓ Quote accuracy (quoted text appears in source)
✓ Bad law status (overruled, reversed, vacated)
✓ Authority strength (citation patterns and treatment)

Motion Granted does NOT verify:
✗ Pinpoint page accuracy — attorney verification recommended
✗ Secondary sources (Witkin, Rutter, treatises) — outside scope
✗ Nuanced negative treatment — independent Shepardizing recommended
✗ Statutory amendments — tracked for common statutes only
✗ Unpublished opinions — limited verification available

ERROR RATE DISCLOSURE:
Per-citation undetected error rate: ~0.08%
Per-motion undetected error rate: ~2.5%
`;
}

/**
 * Generate unpublished opinion disclosure
 */
export function generateUnpublishedDisclosure(
  unpublishedCount: number,
  jurisdiction: string
): string {
  if (unpublishedCount === 0) {
    return '';
  }

  let disclosure = `
UNPUBLISHED OPINION POLICY
${'━'.repeat(50)}

${unpublishedCount} unpublished opinion(s) were flagged in this motion.

`;

  // Add jurisdiction-specific guidance
  const jurisdictionLower = jurisdiction.toLowerCase();

  if (jurisdictionLower.includes('federal')) {
    disclosure += `FEDERAL: Motion Granted will attempt verification via RECAP/PACER.
Verified unpublished federal citations flagged: "Verify citability
per local rules."
`;
  } else if (jurisdictionLower.includes('california') || jurisdictionLower.includes('cal')) {
    disclosure += `CALIFORNIA: Per Cal. Rules of Court 8.1115, unpublished California
opinions CANNOT be cited. These will be flagged: "Not citable —
replace with published authority."
`;
  } else {
    disclosure += `OTHER STATES: Citability varies. Unpublished citations flagged for
attorney verification of local rules.
`;
  }

  return disclosure;
}

// Helper functions

function percentage(part: number, whole: number): number {
  if (whole === 0) return 0;
  return Math.round((part / whole) * 100);
}

function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.substring(0, maxLength - 3) + '...';
}

function getStatusIcon(status: string): string {
  switch (status) {
    case 'VERIFIED':
      return '✓';
    case 'FLAGGED':
      return '⚠️';
    case 'REJECTED':
      return '✗';
    case 'BLOCKED':
      return '⛔';
    default:
      return '?';
  }
}

function getRecommendation(actionRequired: string): string {
  switch (actionRequired) {
    case 'REMOVE':
      return 'Remove citation from draft';
    case 'REPLACE':
      return 'Find alternative authority';
    case 'REVIEW':
      return 'Attorney review required';
    case 'NONE':
      return 'No action needed';
    default:
      return 'Review recommended';
  }
}
