/**
 * PROMPT GUARDRAILS
 *
 * These instructions are injected into EVERY prompt sent to Claude.
 * They cannot be overridden by user input or previous context.
 *
 * Every phase prompt is wrapped with these guardrails to prevent:
 * 1. Phase skipping
 * 2. Citation hallucination
 * 3. Premature output generation
 * 4. Confidence inflation
 */

// ============================================================================
// PHASE ENFORCEMENT PREAMBLE
// ============================================================================

export const PHASE_ENFORCEMENT_PREAMBLE = `
<SYSTEM_ENFORCEMENT>
You are operating within Motion Granted's legal document generation system.

CRITICAL CONSTRAINTS — VIOLATION CAUSES IMMEDIATE HALT:

1. PHASE BOUNDARIES: You are currently in Phase {CURRENT_PHASE}. You MUST NOT:
   - Generate content that belongs to a different phase
   - Skip ahead to later phase outputs
   - Combine multiple phases into one response
   - Claim a phase is "unnecessary" or "already done"

2. CITATION RESTRICTIONS: You MUST NOT:
   - Cite any case not in the provided Citation Bank
   - Generate citations from your training knowledge
   - Claim you "know" a citation is valid without verification
   - Use short-form citations (Id., supra, etc.) without establishing the full cite first

3. OUTPUT RESTRICTIONS: You MUST:
   - Output ONLY what this phase requires
   - Stop immediately when phase output is complete
   - Never generate a "complete motion" in a single phase
   - Follow the exact output schema provided

4. CONFIDENCE RESTRICTIONS: You MUST:
   - Report uncertainty honestly (never inflate confidence)
   - Flag any citation you're not 100% certain about
   - Request verification for any legal claim you're unsure of

IF YOU VIOLATE THESE CONSTRAINTS:
- Your output will be rejected
- The workflow will halt
- An admin will be alerted
- The violation will be logged permanently

You have been warned. Proceed with Phase {CURRENT_PHASE} only.
</SYSTEM_ENFORCEMENT>
`;

// ============================================================================
// CITATION BANK ENFORCEMENT
// ============================================================================

export const CITATION_BANK_ENFORCEMENT = `
<CITATION_BANK_ENFORCEMENT>
You may ONLY cite cases from the following Citation Bank.
Any citation not in this list will be AUTOMATICALLY REJECTED.
Do not cite cases from your training knowledge.
Do not cite cases you "remember" or "think" are relevant.
ONLY cite from this exact list:

{CITATION_BANK}

If no case in this list supports your argument, you must:
1. Flag the gap
2. Request Mini Phase IV to find appropriate citations
3. NOT proceed with an unsupported argument
</CITATION_BANK_ENFORCEMENT>
`;

// ============================================================================
// NO COMPLETE MOTION ENFORCEMENT
// ============================================================================

export const NO_COMPLETE_MOTION_ENFORCEMENT = `
<OUTPUT_BOUNDARY_ENFORCEMENT>
DO NOT generate a complete motion in this phase.

This phase produces ONLY: {PHASE_OUTPUT_TYPE}

If you generate content beyond {PHASE_OUTPUT_TYPE}, your output will be:
- Truncated
- Rejected
- Logged as a violation

Stop when you have produced {PHASE_OUTPUT_TYPE}. Do not continue.
</OUTPUT_BOUNDARY_ENFORCEMENT>
`;

// ============================================================================
// PHASE-SPECIFIC OUTPUT TYPES
// ============================================================================

export const PHASE_OUTPUT_TYPES: Record<string, string> = {
  'I': 'Classification JSON with motion type, tier, and intake validation',
  'II': 'Document analysis JSON with parsed content and extracted facts',
  'III': 'Gap analysis JSON identifying missing information and evidence assessment',
  'IV': 'Citation research results with verified case law for the citation bank',
  'V': 'Initial draft with structure and arguments (NOT the final motion)',
  'V.1': 'Citation verification results with status for each citation',
  'VI': 'Opposition anticipation analysis and response strategies',
  'VII': 'Judge simulation results with criticism and revision requirements',
  'VII.1': 'New citation verification for any citations added in revisions',
  'VIII': 'Revised draft incorporating required changes',
  'VIII.5': 'Caption validation results with formatting verification',
  'IX': 'Supporting documents prepared and formatted',
  'IX.1': 'Separate statement of undisputed facts (MSJ/MSA only)',
  'X': 'Final assembled document ready for delivery',
};

// ============================================================================
// BUILD PHASE PROMPT WITH GUARDRAILS
// ============================================================================

/**
 * Wraps a base prompt with all guardrails.
 * This MUST be used for every Claude call during phase execution.
 */
export function buildPhasePrompt(
  phase: string,
  basePrompt: string,
  citationBank?: string[] | null
): string {
  const phaseOutputType = PHASE_OUTPUT_TYPES[phase] || 'phase-specific output only';

  let prompt = PHASE_ENFORCEMENT_PREAMBLE
    .replace(/{CURRENT_PHASE}/g, phase);

  prompt += '\n\n';

  // Only add citation bank enforcement for phases that use citations
  const citationPhases = ['V', 'VI', 'VIII', 'X'];
  if (citationPhases.includes(phase) && citationBank && citationBank.length > 0) {
    prompt += CITATION_BANK_ENFORCEMENT
      .replace('{CITATION_BANK}', citationBank.join('\n'));
    prompt += '\n\n';
  }

  prompt += NO_COMPLETE_MOTION_ENFORCEMENT
    .replace(/{PHASE_OUTPUT_TYPE}/g, phaseOutputType);

  prompt += '\n\n';
  prompt += '---\n\n';
  prompt += basePrompt;

  return prompt;
}

// ============================================================================
// VALIDATE OUTPUT BOUNDARIES
// ============================================================================

/**
 * Check if Claude output potentially violates phase boundaries.
 * Returns true if output appears to be overstepping.
 */
export function detectOutputViolation(
  phase: string,
  output: string
): { violated: boolean; reason?: string } {
  // Check for signs of generating a complete motion outside of Phase X (final assembly)
  if (phase !== 'X') {
    const motionMarkers = [
      /^IN THE\s+.+COURT/i,
      /CERTIFICATE OF SERVICE/i,
      /RESPECTFULLY SUBMITTED/i,
      /MEMORANDUM OF POINTS AND AUTHORITIES/i,
      /MOTION FOR.*JUDGMENT/i,
    ];

    for (const marker of motionMarkers) {
      if (marker.test(output)) {
        return {
          violated: true,
          reason: `Output contains full motion markers (${marker.source}) but current phase is ${phase}`,
        };
      }
    }
  }

  // Check for hallucinated citations (citations not in proper format suggesting AI made them up)
  const suspiciousCitationPatterns = [
    /\d{3} U\.S\. \d{3}, \d{3} \(\d{4}\)/g, // Specific page citations often indicate hallucination
    /See generally/gi, // Often indicates padding
    /See also/gi, // Often indicates padding
  ];

  // Check for common AI filler
  const fillerPatterns = [
    /as we discussed/gi,
    /as noted above/gi,
    /it is clear that/gi,
    /undoubtedly/gi,
    /without question/gi,
  ];

  // Count suspicious patterns (don't fail, just warn)
  let suspiciousCount = 0;
  for (const pattern of [...suspiciousCitationPatterns, ...fillerPatterns]) {
    const matches = output.match(pattern);
    if (matches) {
      suspiciousCount += matches.length;
    }
  }

  if (suspiciousCount > 10) {
    return {
      violated: false, // Just a warning, not a violation
      reason: `High count of suspicious patterns (${suspiciousCount}). Review for filler content.`,
    };
  }

  return { violated: false };
}

// ============================================================================
// CITATION VALIDATION
// ============================================================================

/**
 * Extract citations from output text.
 */
export function extractCitationsFromOutput(output: string): string[] {
  const citations: string[] = [];

  // Standard case citation pattern: Name v. Name, Volume Reporter Page (Year)
  const casePattern = /([A-Z][a-zA-Z\s]+(?:\s+v\.\s+|\s+vs\.\s+)[A-Z][a-zA-Z\s.]+),?\s*(\d+)\s+([A-Z][a-zA-Z.0-9]+)\s*(\d+)(?:,\s*(\d+))?\s*\(([^)]+)\)/g;

  let match;
  while ((match = casePattern.exec(output)) !== null) {
    citations.push(match[0].trim());
  }

  return [...new Set(citations)]; // Remove duplicates
}

/**
 * Check if all citations in output are from the citation bank.
 */
export function validateCitationsAgainstBank(
  output: string,
  citationBank: string[]
): { valid: boolean; invalidCitations: string[] } {
  const outputCitations = extractCitationsFromOutput(output);
  const invalidCitations: string[] = [];

  for (const citation of outputCitations) {
    // Normalize for comparison
    const normalizedCitation = citation.toLowerCase().replace(/\s+/g, ' ');

    const found = citationBank.some(bankCitation => {
      const normalizedBankCitation = bankCitation.toLowerCase().replace(/\s+/g, ' ');
      return normalizedBankCitation.includes(normalizedCitation) ||
             normalizedCitation.includes(normalizedBankCitation);
    });

    if (!found) {
      invalidCitations.push(citation);
    }
  }

  return {
    valid: invalidCitations.length === 0,
    invalidCitations,
  };
}

// ============================================================================
// PHASE SKIP DETECTION IN OUTPUT
// ============================================================================

/**
 * Detect if Claude is trying to skip ahead in its output.
 */
export function detectPhaseSkipAttempt(
  currentPhase: string,
  output: string
): { attempted: boolean; targetPhase?: string; reason?: string } {
  const phaseOrder = ['I', 'II', 'III', 'IV', 'V', 'V.1', 'VI', 'VII', 'VII.1', 'VIII', 'VIII.5', 'IX', 'IX.1', 'X'];
  const currentIndex = phaseOrder.indexOf(currentPhase);

  // Check for explicit phase references
  const phaseRefPattern = /(?:Phase\s+)?([IVX]+(?:\.\d+)?)\s*(?:complete|done|finished|output|result)/gi;

  let match;
  while ((match = phaseRefPattern.exec(output)) !== null) {
    const referencedPhase = match[1].toUpperCase();
    const referencedIndex = phaseOrder.indexOf(referencedPhase);

    if (referencedIndex > currentIndex) {
      return {
        attempted: true,
        targetPhase: referencedPhase,
        reason: `Output references completing Phase ${referencedPhase} while current phase is ${currentPhase}`,
      };
    }
  }

  return { attempted: false };
}
