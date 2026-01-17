/**
 * Citation Verification System
 *
 * Implements the 4-citation HARD STOP rule and comprehensive citation verification.
 * Citations must be verified before a workflow can proceed past the verification phase.
 */

import { createClient } from '@/lib/supabase/server';
import { askClaude, isClaudeConfigured } from '@/lib/automation/claude';
import type {
  WorkflowCitation,
  CitationStatus,
  CitationType,
  AuthorityLevel,
  CitationRequirement,
  CitationVerificationResult,
} from '@/types/workflow';
import type { OperationResult } from '@/types/automation';

// ============================================================================
// CONSTANTS
// ============================================================================

export const CITATION_HARD_STOP_MINIMUM = 4;
export const CITATION_VERIFICATION_TIMEOUT_MS = 30000;

// Citation patterns for parsing
const CITATION_PATTERNS = {
  // Federal case citations: 123 F.3d 456 (9th Cir. 2020)
  federal_case: /(\d+)\s+(F\.\s*(?:2d|3d|4th)?|F\.\s*Supp\.\s*(?:2d|3d)?|F\.\s*App'x)\s+(\d+)(?:\s*\(([^)]+)\s+(\d{4})\))?/gi,

  // Supreme Court citations: 123 U.S. 456 (1900)
  supreme_court: /(\d+)\s+(U\.S\.|S\.\s*Ct\.|L\.\s*Ed\.\s*(?:2d)?)\s+(\d+)(?:\s*\((\d{4})\))?/gi,

  // State case citations: 123 Cal.App.4th 456 (2020)
  state_case: /(\d+)\s+([A-Z][a-z]+\.(?:\s*[A-Z][a-z]+\.)*(?:\s*\d+[a-z]+)?)\s+(\d+)(?:\s*\((\d{4})\))?/gi,

  // USC citations: 42 U.S.C. § 1983
  usc: /(\d+)\s+U\.S\.C\.?\s*§+\s*(\d+[a-z]?(?:\([a-z0-9]+\))?)/gi,

  // CFR citations: 28 C.F.R. § 0.85
  cfr: /(\d+)\s+C\.F\.R\.?\s*§+\s*(\d+(?:\.\d+)?)/gi,

  // FRCP/FRCE citations: Fed. R. Civ. P. 12(b)(6)
  federal_rules: /Fed\.\s*R\.\s*(Civ\.|Crim\.|Evid\.|App\.)\s*P\.\s*(\d+(?:\([a-z0-9]+\))*)/gi,
};

// ============================================================================
// CITATION EXTRACTION
// ============================================================================

interface ExtractedCitation {
  text: string;
  type: CitationType;
  volume?: string;
  reporter?: string;
  page?: string;
  court?: string;
  year?: number;
  caseName?: string;
}

/**
 * Extract citations from text content
 */
export function extractCitations(text: string): ExtractedCitation[] {
  const citations: ExtractedCitation[] = [];
  const seen = new Set<string>();

  // Extract federal case citations
  let match;
  while ((match = CITATION_PATTERNS.federal_case.exec(text)) !== null) {
    const citationText = match[0].trim();
    if (!seen.has(citationText.toLowerCase())) {
      seen.add(citationText.toLowerCase());
      citations.push({
        text: citationText,
        type: 'case',
        volume: match[1],
        reporter: match[2],
        page: match[3],
        court: match[4],
        year: match[5] ? parseInt(match[5]) : undefined,
      });
    }
  }

  // Reset regex lastIndex
  CITATION_PATTERNS.federal_case.lastIndex = 0;

  // Extract Supreme Court citations
  while ((match = CITATION_PATTERNS.supreme_court.exec(text)) !== null) {
    const citationText = match[0].trim();
    if (!seen.has(citationText.toLowerCase())) {
      seen.add(citationText.toLowerCase());
      citations.push({
        text: citationText,
        type: 'case',
        volume: match[1],
        reporter: match[2],
        page: match[3],
        court: 'U.S. Supreme Court',
        year: match[4] ? parseInt(match[4]) : undefined,
      });
    }
  }
  CITATION_PATTERNS.supreme_court.lastIndex = 0;

  // Extract state case citations
  while ((match = CITATION_PATTERNS.state_case.exec(text)) !== null) {
    const citationText = match[0].trim();
    if (!seen.has(citationText.toLowerCase())) {
      seen.add(citationText.toLowerCase());
      citations.push({
        text: citationText,
        type: 'case',
        volume: match[1],
        reporter: match[2],
        page: match[3],
        year: match[4] ? parseInt(match[4]) : undefined,
      });
    }
  }
  CITATION_PATTERNS.state_case.lastIndex = 0;

  // Extract USC citations
  while ((match = CITATION_PATTERNS.usc.exec(text)) !== null) {
    const citationText = match[0].trim();
    if (!seen.has(citationText.toLowerCase())) {
      seen.add(citationText.toLowerCase());
      citations.push({
        text: citationText,
        type: 'statute',
        volume: match[1],
        page: match[2],
      });
    }
  }
  CITATION_PATTERNS.usc.lastIndex = 0;

  // Extract CFR citations
  while ((match = CITATION_PATTERNS.cfr.exec(text)) !== null) {
    const citationText = match[0].trim();
    if (!seen.has(citationText.toLowerCase())) {
      seen.add(citationText.toLowerCase());
      citations.push({
        text: citationText,
        type: 'regulation',
        volume: match[1],
        page: match[2],
      });
    }
  }
  CITATION_PATTERNS.cfr.lastIndex = 0;

  // Extract federal rules citations
  while ((match = CITATION_PATTERNS.federal_rules.exec(text)) !== null) {
    const citationText = match[0].trim();
    if (!seen.has(citationText.toLowerCase())) {
      seen.add(citationText.toLowerCase());
      citations.push({
        text: citationText,
        type: 'statute',
        reporter: `Fed. R. ${match[1]} P.`,
        page: match[2],
      });
    }
  }
  CITATION_PATTERNS.federal_rules.lastIndex = 0;

  return citations;
}

// ============================================================================
// CITATION VERIFICATION
// ============================================================================

interface VerificationContext {
  jurisdiction?: string;
  practiceArea?: string;
  documentType?: string;
}

/**
 * Verify a single citation using AI analysis
 */
export async function verifyCitation(
  citation: WorkflowCitation,
  context?: VerificationContext
): Promise<OperationResult<CitationVerificationResult>> {
  const supabase = await createClient();

  try {
    // First, try pattern-based validation
    const patternValid = validateCitationPattern(citation.citation_text);

    if (!patternValid.valid) {
      // Log the failed verification
      await supabase.from('citation_verification_log').insert({
        citation_id: citation.id,
        verification_type: 'automated',
        status: 'invalid',
        found_match: false,
        match_confidence: 0,
        notes: patternValid.reason,
      });

      // Update citation status
      await supabase
        .from('workflow_citations')
        .update({
          status: 'invalid',
          verification_notes: patternValid.reason,
        })
        .eq('id', citation.id);

      return {
        success: true,
        data: {
          citationId: citation.id,
          status: 'invalid',
          verified: false,
          confidence: 0,
          notes: patternValid.reason,
        },
      };
    }

    // Use AI for deeper verification if configured
    if (isClaudeConfigured) {
      const aiResult = await verifyWithAI(citation, context);

      if (aiResult.success && aiResult.data) {
        // Log AI verification
        await supabase.from('citation_verification_log').insert({
          citation_id: citation.id,
          verification_type: 'automated',
          status: aiResult.data.status,
          found_match: aiResult.data.verified,
          match_confidence: aiResult.data.confidence,
          source_response: { ai_analysis: true },
          notes: aiResult.data.notes,
        });

        // Update citation
        await supabase
          .from('workflow_citations')
          .update({
            status: aiResult.data.status,
            verified_at: aiResult.data.verified ? new Date().toISOString() : null,
            verification_source: 'ai_verification',
            verification_notes: aiResult.data.notes,
            relevance_score: aiResult.data.confidence,
          })
          .eq('id', citation.id);

        return {
          success: true,
          data: aiResult.data,
        };
      }
    }

    // Pattern valid but no AI - mark as needs manual review
    await supabase.from('citation_verification_log').insert({
      citation_id: citation.id,
      verification_type: 'automated',
      status: 'pending',
      found_match: true,
      match_confidence: 0.7,
      notes: 'Pattern valid, requires manual verification',
    });

    await supabase
      .from('workflow_citations')
      .update({
        status: 'pending',
        verification_notes: 'Pattern valid, requires manual verification',
        relevance_score: 0.7,
      })
      .eq('id', citation.id);

    return {
      success: true,
      data: {
        citationId: citation.id,
        status: 'pending',
        verified: false,
        confidence: 0.7,
        notes: 'Pattern valid, requires manual verification',
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Verification failed',
    };
  }
}

/**
 * Validate citation pattern
 */
function validateCitationPattern(citationText: string): { valid: boolean; reason?: string } {
  // Check if it matches any known pattern
  for (const pattern of Object.values(CITATION_PATTERNS)) {
    pattern.lastIndex = 0;
    if (pattern.test(citationText)) {
      return { valid: true };
    }
    pattern.lastIndex = 0;
  }

  // Check for case name pattern: Name v. Name
  if (/\w+\s+v\.\s+\w+/.test(citationText)) {
    return { valid: true };
  }

  return {
    valid: false,
    reason: 'Citation does not match any recognized legal citation format',
  };
}

/**
 * Verify citation using AI analysis
 */
async function verifyWithAI(
  citation: WorkflowCitation,
  context?: VerificationContext
): Promise<OperationResult<CitationVerificationResult>> {
  const prompt = `You are a legal citation verification expert. Verify the following citation for accuracy.

Citation: ${citation.citation_text}
${citation.case_name ? `Case Name: ${citation.case_name}` : ''}
${citation.court ? `Court: ${citation.court}` : ''}
${citation.year ? `Year: ${citation.year}` : ''}

Context:
${context?.jurisdiction ? `Jurisdiction: ${context.jurisdiction}` : ''}
${context?.practiceArea ? `Practice Area: ${context.practiceArea}` : ''}
${context?.documentType ? `Document Type: ${context.documentType}` : ''}

Analyze this citation and respond with a JSON object:
{
  "valid": true/false,
  "confidence": 0.0-1.0,
  "citationType": "case" | "statute" | "regulation" | "secondary",
  "authorityLevel": "binding" | "persuasive" | "secondary",
  "notes": "explanation of verification",
  "suggestedCorrection": "corrected citation if invalid, null if valid"
}

Consider:
1. Is the citation format correct?
2. Is the reporter valid for the indicated court?
3. Is the year plausible for the reporter volume?
4. Are there any obvious errors or typos?`;

  const result = await askClaude({
    prompt,
    maxTokens: 500,
    systemPrompt: 'You are a legal citation verification expert. Always respond with valid JSON.',
  });

  if (!result.success || !result.result) {
    return { success: false, error: result.error || 'AI verification failed' };
  }

  try {
    // Parse AI response
    const jsonMatch = result.result.content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return { success: false, error: 'Could not parse AI response' };
    }

    const analysis = JSON.parse(jsonMatch[0]);

    const status: CitationStatus = analysis.valid
      ? 'verified'
      : analysis.suggestedCorrection
        ? 'needs_update'
        : 'invalid';

    return {
      success: true,
      data: {
        citationId: citation.id,
        status,
        verified: analysis.valid,
        confidence: analysis.confidence || 0,
        notes: analysis.notes,
      },
    };
  } catch {
    return { success: false, error: 'Failed to parse AI verification response' };
  }
}

// ============================================================================
// HARD STOP CHECK
// ============================================================================

/**
 * Check if citation requirements are met (HARD STOP rule)
 */
export async function checkCitationRequirements(
  workflowId: string,
  minimumRequired: number = CITATION_HARD_STOP_MINIMUM
): Promise<OperationResult<CitationRequirement>> {
  const supabase = await createClient();

  try {
    // Get all citations for this workflow
    const { data: citations, error } = await supabase
      .from('workflow_citations')
      .select('id, status')
      .eq('order_workflow_id', workflowId);

    if (error) {
      return { success: false, error: error.message };
    }

    interface CitationRow { id: string; status: string }
    const allCitations = (citations || []) as CitationRow[];
    const verifiedCitations = allCitations.filter((c: CitationRow) => c.status === 'verified');
    const meetsRequirement = verifiedCitations.length >= minimumRequired;

    const requirement: CitationRequirement = {
      minimum: minimumRequired,
      hardStop: true,
      currentCount: allCitations.length,
      verifiedCount: verifiedCitations.length,
      meetsRequirement,
      blockedReason: meetsRequirement
        ? undefined
        : `HARD STOP: Only ${verifiedCitations.length} verified citations. Minimum ${minimumRequired} required.`,
    };

    return { success: true, data: requirement };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to check citation requirements',
    };
  }
}

// ============================================================================
// BATCH VERIFICATION
// ============================================================================

/**
 * Verify all citations for a workflow phase
 */
export async function verifyWorkflowCitations(
  workflowId: string,
  phaseExecutionId?: string
): Promise<OperationResult<{ verified: number; failed: number; pending: number }>> {
  const supabase = await createClient();

  try {
    // Get citations to verify
    let query = supabase
      .from('workflow_citations')
      .select('*')
      .eq('order_workflow_id', workflowId)
      .eq('status', 'pending');

    if (phaseExecutionId) {
      query = query.eq('phase_execution_id', phaseExecutionId);
    }

    const { data: citations, error } = await query;

    if (error) {
      return { success: false, error: error.message };
    }

    let verified = 0;
    let failed = 0;
    let pending = 0;

    // Verify each citation
    for (const citation of citations || []) {
      const result = await verifyCitation(citation as WorkflowCitation);

      if (result.success && result.data) {
        if (result.data.status === 'verified') {
          verified++;
        } else if (result.data.status === 'invalid') {
          failed++;
        } else {
          pending++;
        }
      } else {
        pending++;
      }
    }

    return {
      success: true,
      data: { verified, failed, pending },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Batch verification failed',
    };
  }
}

// ============================================================================
// CITATION STORAGE
// ============================================================================

/**
 * Store extracted citations for a workflow
 */
export async function storeCitations(
  workflowId: string,
  phaseExecutionId: string,
  extractedCitations: ExtractedCitation[]
): Promise<OperationResult<{ count: number }>> {
  const supabase = await createClient();

  try {
    const citationsToInsert = extractedCitations.map(c => ({
      order_workflow_id: workflowId,
      phase_execution_id: phaseExecutionId,
      citation_text: c.text,
      citation_type: c.type,
      volume: c.volume || null,
      reporter: c.reporter || null,
      page_start: c.page || null,
      court: c.court || null,
      year: c.year || null,
      case_name: c.caseName || null,
      status: 'pending' as CitationStatus,
    }));

    const { error } = await supabase
      .from('workflow_citations')
      .insert(citationsToInsert);

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, data: { count: citationsToInsert.length } };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to store citations',
    };
  }
}

// ============================================================================
// MANUAL VERIFICATION
// ============================================================================

/**
 * Manually verify a citation (admin action)
 */
export async function manuallyVerifyCitation(
  citationId: string,
  verifiedBy: string,
  verified: boolean,
  notes?: string
): Promise<OperationResult> {
  const supabase = await createClient();

  try {
    const status: CitationStatus = verified ? 'verified' : 'invalid';

    // Log manual verification
    await supabase.from('citation_verification_log').insert({
      citation_id: citationId,
      verification_type: 'manual',
      status,
      found_match: verified,
      match_confidence: verified ? 1.0 : 0,
      notes,
      verified_by: verifiedBy,
    });

    // Update citation
    const { error } = await supabase
      .from('workflow_citations')
      .update({
        status,
        verified_at: verified ? new Date().toISOString() : null,
        verification_source: 'manual',
        verification_notes: notes,
      })
      .eq('id', citationId);

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Manual verification failed',
    };
  }
}
