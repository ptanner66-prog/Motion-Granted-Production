/**
 * Phase VIII JSON Parse Fallback Chain — Motion Granted
 *
 * SP-12 AJ-2: Parses Phase VIII AI response with 3-level fallback:
 *   1. Strict JSON parse
 *   2. Extract JSON from markdown code block
 *   3. Regex extraction of key fields
 *
 * If all fallbacks fail, raw content is used as the revised draft
 * with a PARSE_FAILURE marker for manual review.
 */

export interface PhaseVIIIResponse {
  revisedContent: string;
  changesApplied: string[];
  newCitations: string[];
  qualityAssessment: string;
}

/**
 * Parse Phase VIII AI response with fallback chain.
 *
 * @param raw - Raw AI response string
 * @returns Parsed PhaseVIIIResponse
 */
export function parsePhaseVIIIResponse(raw: string): PhaseVIIIResponse {
  // Attempt 1: Strict JSON parse
  try {
    const parsed = JSON.parse(raw);
    if (isValidPhaseVIIIResponse(parsed)) return parsed;
  } catch { /* continue to fallback */ }

  // Attempt 2: Extract from markdown code block
  const codeBlockMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    try {
      const parsed = JSON.parse(codeBlockMatch[1].trim());
      if (isValidPhaseVIIIResponse(parsed)) return parsed;
    } catch { /* continue to fallback */ }
  }

  // Attempt 3: Regex extraction
  const contentMatch = raw.match(/"revisedContent"\s*:\s*"([\s\S]*?)(?:","|\"})/);
  const changesMatch = raw.match(/"changesApplied"\s*:\s*\[([\s\S]*?)\]/);

  if (contentMatch) {
    return {
      revisedContent: contentMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"'),
      changesApplied: changesMatch
        ? changesMatch[1].split(',').map(s => s.trim().replace(/"/g, ''))
        : ['Parsed via regex fallback — review changes manually'],
      newCitations: [],
      qualityAssessment: 'Parsed via regex fallback',
    };
  }

  // All fallbacks failed — use raw content as revised draft
  console.error('[PHASE_VIII] All parse fallbacks failed. Using raw content.');
  return {
    revisedContent: raw,
    changesApplied: ['PARSE_FAILURE: Raw AI output used as revised content'],
    newCitations: [],
    qualityAssessment: 'PARSE_FAILURE',
  };
}

function isValidPhaseVIIIResponse(obj: unknown): obj is PhaseVIIIResponse {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    typeof (obj as PhaseVIIIResponse).revisedContent === 'string' &&
    Array.isArray((obj as PhaseVIIIResponse).changesApplied)
  );
}
