/**
 * FRAMEWORK CITATION VERIFIER
 *
 * TASK-08: Ensure Phase II/III citations pass through verification.
 *
 * Audit Evidence (Pelican order):
 * Phase II generated: "La. C.C.P. Art. 966; Samaha v. Rau, 977 So.2d 880 (La. 2008)"
 * This citation was used in the SJ standard section but never verified.
 * The pipeline got lucky — Samaha v. Rau is a real case.
 *
 * Solution:
 * Collect all citations from draft text before Phase V.1.
 * Verify any not already in the Phase IV bank.
 *
 * @module framework-citation-verifier
 */

import { verifyCitation } from '@/lib/citation/citation-verifier';
import type { WorkflowCitation, CitationVerificationResult } from '@/types/workflow';
import type { OperationResult } from '@/types/automation';
import { logger } from '@/lib/logger';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface CitationBankEntry {
  citation: string;
  caseName: string;
  courtlistenerId: string;
  source: 'research' | 'framework' | 're-research';
}

export interface FrameworkCitation {
  citation: string;
  caseName: string;
  foundIn: 'phase_ii' | 'phase_iii' | 'draft_text';
  location: string; // Section or context
}

export interface FrameworkVerificationResult {
  citation: FrameworkCitation;
  verified: boolean;
  courtlistenerId?: string;
  verificationMethod: 'framework_verified';
  failureReason?: string;
  replacementSuggestions?: string[];
}

// ═══════════════════════════════════════════════════════════════════════════
// CITATION EXTRACTION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Extract all citations from motion draft text.
 *
 * Matches patterns like:
 * - "Samaha v. Rau, 977 So.2d 880 (La. 2008)"
 * - "123 So.3d 456"
 * - "456 F.3d 789"
 */
export function extractCitationsFromText(text: string): FrameworkCitation[] {
  const citations: FrameworkCitation[] = [];

  // Pattern for full case citations
  const fullCitePattern = /([A-Z][A-Za-z\s,.']+)\s+v\.\s+([A-Z][A-Za-z\s,.']+),\s*(\d+)\s+(So\.|F\.|S\.\s*Ct\.|U\.S\.|L\.Ed\.)[^\d]*(\d+)[^(]*\(([^)]+)\)/g;

  // Pattern for standalone reporter citations
  const reporterPattern = /(\d+)\s+(So\.\s*[23]d|F\.\s*[23]d|F\.\s*Supp\.\s*[23]d)\s+(\d+)/g;

  let match;

  // Extract full case citations
  while ((match = fullCitePattern.exec(text)) !== null) {
    const caseName = `${match[1].trim()} v. ${match[2].trim()}`;
    const citation = `${match[3]} ${match[4]}${match[5]}`;

    citations.push({
      citation: citation.trim(),
      caseName: caseName.trim(),
      foundIn: 'draft_text',
      location: getLocationContext(text, match.index),
    });
  }

  // Extract standalone reporter citations (not already captured)
  while ((match = reporterPattern.exec(text)) !== null) {
    const citation = match[0];

    // Check if this citation is part of an already-extracted full citation
    const alreadyExtracted = citations.some(c => c.citation.includes(citation));

    if (!alreadyExtracted) {
      citations.push({
        citation: citation.trim(),
        caseName: 'Unknown',
        foundIn: 'draft_text',
        location: getLocationContext(text, match.index),
      });
    }
  }

  return deduplicateCitations(citations);
}

/**
 * Get surrounding context for a citation.
 */
function getLocationContext(text: string, index: number): string {
  const start = Math.max(0, index - 100);
  const end = Math.min(text.length, index + 100);
  return text.slice(start, end).replace(/\n/g, ' ').trim();
}

/**
 * Deduplicate citations by normalized citation string.
 */
function deduplicateCitations(citations: FrameworkCitation[]): FrameworkCitation[] {
  const seen = new Set<string>();
  const result: FrameworkCitation[] = [];

  for (const citation of citations) {
    const normalized = normalizeCitation(citation.citation);
    if (!seen.has(normalized)) {
      seen.add(normalized);
      result.push(citation);
    }
  }

  return result;
}

/**
 * Normalize a citation for comparison.
 */
function normalizeCitation(citation: string): string {
  return citation
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/\.\s*/g, '.')
    .trim();
}

// ═══════════════════════════════════════════════════════════════════════════
// VERIFICATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Build a stub WorkflowCitation for the canonical verifyCitation function.
 * The canonical function expects a DB-shaped object; we construct one
 * from the framework citation's extracted data.
 */
function buildWorkflowCitationStub(
  frameworkCitation: FrameworkCitation,
  workflowId: string
): WorkflowCitation {
  // Parse year from citation if possible
  const yearMatch = frameworkCitation.location.match(/\(.*?(\d{4})\)/);
  const year = yearMatch ? parseInt(yearMatch[1]) : null;

  return {
    id: `framework_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    order_workflow_id: workflowId,
    phase_execution_id: null,
    citation_text: frameworkCitation.citation,
    case_name: frameworkCitation.caseName !== 'Unknown' ? frameworkCitation.caseName : null,
    case_number: null,
    court: null,
    year,
    reporter: null,
    volume: null,
    page_start: null,
    page_end: null,
    citation_type: 'case',
    relevance_category: null,
    status: 'pending',
    verified_at: null,
    verification_source: null,
    verification_notes: null,
    relevance_score: null,
    authority_level: null,
  } as WorkflowCitation;
}

/**
 * Verify framework citations not in the citation bank.
 *
 * @param draftText - The full motion draft text
 * @param citationBank - Existing verified citations from Phase IV
 * @param workflowId - The workflow ID for constructing verification stubs
 * @returns Verification results for framework citations
 */
export async function verifyFrameworkCitations(
  draftText: string,
  citationBank: CitationBankEntry[],
  workflowId: string = 'framework-check'
): Promise<FrameworkVerificationResult[]> {
  // Extract all citations from draft
  const allCitations = extractCitationsFromText(draftText);

  // Filter to citations NOT in the bank
  const bankCitations = new Set(
    citationBank.map(c => normalizeCitation(c.citation))
  );

  const frameworkCitations = allCitations.filter(c =>
    !bankCitations.has(normalizeCitation(c.citation))
  );

  logger.info('[FRAMEWORK-VERIFIER] Verifying framework citations', {
    totalInDraft: allCitations.length,
    inBank: bankCitations.size,
    toVerify: frameworkCitations.length,
  });

  // Verify each framework citation
  const results: FrameworkVerificationResult[] = [];

  for (const citation of frameworkCitations) {
    try {
      const stub = buildWorkflowCitationStub(citation, workflowId);
      const verification: OperationResult<CitationVerificationResult> = await verifyCitation(stub);

      if (verification.success && verification.data?.verified) {
        results.push({
          citation,
          verified: true,
          courtlistenerId: verification.data.citationId,
          verificationMethod: 'framework_verified',
        });

        logger.info('[FRAMEWORK-VERIFIER] Citation verified', {
          citation: citation.citation,
          citationId: verification.data.citationId,
        });
      } else {
        results.push({
          citation,
          verified: false,
          verificationMethod: 'framework_verified',
          failureReason: verification.error || 'Not verified',
          replacementSuggestions: [],
        });

        logger.warn('[FRAMEWORK-VERIFIER] Citation failed verification', {
          citation: citation.citation,
          reason: verification.error,
        });
      }
    } catch (error) {
      results.push({
        citation,
        verified: false,
        verificationMethod: 'framework_verified',
        failureReason: error instanceof Error ? error.message : 'Verification error',
      });
    }
  }

  return results;
}

/**
 * Generate report for citation verification.
 */
export function generateVerificationReport(
  results: FrameworkVerificationResult[],
  bankCitations: CitationBankEntry[]
): string {
  let report = '## Citation Verification Report\n\n';

  // Bank citations (research-sourced)
  report += '### Research-Sourced Citations\n\n';
  for (const citation of bankCitations) {
    report += `- Verified: ${citation.caseName}, ${citation.citation} (${citation.source})\n`;
  }

  // Framework citations
  report += '\n### Framework-Sourced Citations\n\n';
  const verified = results.filter(r => r.verified);
  const unverified = results.filter(r => !r.verified);

  for (const result of verified) {
    report += `- Verified: ${result.citation.caseName}, ${result.citation.citation} (framework_verified)\n`;
  }

  // Unverified warnings
  if (unverified.length > 0) {
    report += '\n### Unverified Citations (Flagged for Manual Review)\n\n';
    for (const result of unverified) {
      report += `- FAILED: ${result.citation.citation}\n`;
      report += `  - Location: ${result.citation.location.slice(0, 50)}...\n`;
      report += `  - Reason: ${result.failureReason}\n`;
    }
  }

  return report;
}
