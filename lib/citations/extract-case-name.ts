// lib/citations/extract-case-name.ts
// Utility to extract case name from citation string

/**
 * Extract case name from a full citation string
 *
 * Examples:
 * - "Suarez v. Acosta, 194 So. 3d 626" → "Suarez v. Acosta"
 * - "Wade v. Marine Services of Acadiana LLC, 15 So. 3d 385" → "Wade v. Marine Services of Acadiana LLC"
 * - "In Re New Orleans Train Car Leakage Fire Litigation, 795 So. 2d 364" → "In Re New Orleans Train Car Leakage Fire Litigation"
 */
export function extractCaseName(citationString: string | null | undefined): string {
  if (!citationString || typeof citationString !== 'string') {
    return 'Unknown Case';
  }

  const trimmed = citationString.trim();

  // Pattern 1: "Name v. Name, 123 Reporter 456" (with comma before volume)
  const commaPattern = /^(.+?),\s*\d+\s+(?:So\.|F\.|S\.W\.|N\.E\.|P\.|U\.S\.|L\.Ed|Cal\.|N\.Y\.|Tex\.|La\.)/i;
  const commaMatch = trimmed.match(commaPattern);
  if (commaMatch) {
    return commaMatch[1].trim();
  }

  // Pattern 2: "Name v. Name 123 Reporter 456" (no comma)
  const noCommaPattern = /^(.+?)\s+\d+\s+(?:So\.|F\.|S\.W\.|N\.E\.|P\.|U\.S\.|L\.Ed|Cal\.|N\.Y\.|Tex\.|La\.)/i;
  const noCommaMatch = trimmed.match(noCommaPattern);
  if (noCommaMatch) {
    return noCommaMatch[1].trim();
  }

  // Pattern 3: Just look for " v. " or " v " and take everything before the volume number
  if (trimmed.toLowerCase().includes(' v. ') || trimmed.toLowerCase().includes(' v ')) {
    const vMatch = trimmed.match(/^(.+?\s+v\.?\s+.+?)\s*[,\s]+\d+/i);
    if (vMatch) {
      return vMatch[1].trim();
    }
  }

  // Pattern 4: "In re" or "In the Matter of" cases
  const inRePattern = /^(In\s+[Rr]e\s+.+?)[,\s]+\d+/i;
  const inReMatch = trimmed.match(inRePattern);
  if (inReMatch) {
    return inReMatch[1].trim();
  }

  // Pattern 5: Statute citations (return as-is, they don't have case names)
  if (/^(La\.|Tex\.|Cal\.|N\.Y\.|Fla\.)\s*(C\.C\.P\.|Civ\.|Pen\.|Fam\.|Code)/i.test(trimmed)) {
    return trimmed;
  }

  // Fallback: Return first part before any numbers (if reasonably long)
  const beforeNumbers = trimmed.match(/^([A-Za-z\s.,'\-&]+)/);
  if (beforeNumbers && beforeNumbers[1].length > 5) {
    return beforeNumbers[1].trim().replace(/,\s*$/, '');
  }

  return 'Unknown Case';
}

/**
 * Extract court name from CourtListener data or infer from reporter
 */
export function extractCourtName(
  courtListener?: { court_name?: string; court?: string },
  reporter?: string
): string {
  // Try CourtListener data first
  if (courtListener?.court_name) return courtListener.court_name;
  if (courtListener?.court) return courtListener.court;

  // Infer from reporter
  if (!reporter) return 'Unknown Court';

  const reporterLower = reporter.toLowerCase();

  // Federal
  if (reporterLower.includes('u.s.') || reporterLower.includes('s.ct.')) {
    return 'Supreme Court of the United States';
  }
  if (reporterLower.includes('f.3d') || reporterLower.includes('f.2d')) {
    return 'United States Court of Appeals';
  }
  if (reporterLower.includes('f.supp')) {
    return 'United States District Court';
  }

  // Louisiana
  if (reporterLower.includes('so.3d') || reporterLower.includes('so.2d') || reporterLower.includes('so.')) {
    return 'Louisiana Court of Appeal';
  }
  if (reporterLower.includes('la.')) {
    return 'Louisiana Supreme Court';
  }

  // Other states
  if (reporterLower.includes('cal.')) return 'California Court';
  if (reporterLower.includes('tex.')) return 'Texas Court';
  if (reporterLower.includes('n.y.')) return 'New York Court';
  if (reporterLower.includes('fla.')) return 'Florida Court';

  return 'Unknown Court';
}

/**
 * Normalize a citation object to ensure all display fields are populated.
 * Handles field name mismatches between API responses (caseName) and DB rows (case_name).
 * Falls back to extraction from citationString when case_name is missing.
 */
export interface NormalizedCitation {
  caseName: string;
  court: string;
  citationString: string;
  dateFiled?: string;
  authorityLevel: string;
  verificationStatus: string;
  isGoodLaw: boolean;
  courtlistenerOpinionId?: string;
  courtlistenerUrl?: string;
}

export function normalizeCitation(citation: Record<string, unknown>): NormalizedCitation {
  // Resolve citationString from various field names
  const citationString = (
    citation.citationString ||
    citation.citation_string ||
    citation.citation ||
    citation.full_citation ||
    citation.fullCitation ||
    ''
  ) as string;

  // Resolve caseName — try every possible field name, then extract from citationString
  const rawCaseName = (
    citation.caseName ||
    citation.case_name ||
    citation.name ||
    ''
  ) as string;

  const caseName =
    rawCaseName && rawCaseName !== 'Unknown Case' && rawCaseName !== ''
      ? rawCaseName
      : extractCaseName(citationString);

  // Resolve court — try every possible field name, then infer from reporter
  const rawCourt = (
    citation.court ||
    citation.court_name ||
    citation.courtName ||
    ''
  ) as string;

  const court =
    rawCourt && rawCourt !== 'Unknown Court' && rawCourt !== ''
      ? rawCourt
      : extractCourtName(undefined, citationString);

  return {
    caseName,
    court,
    citationString,

    dateFiled: (
      citation.dateFiled ||
      citation.date_filed ||
      citation.decision_date ||
      citation.decisionDate ||
      undefined
    ) as string | undefined,

    authorityLevel: (
      citation.authorityLevel ||
      citation.authority_level ||
      citation.authority_type ||
      citation.authorityType ||
      'persuasive'
    ) as string,

    verificationStatus: (
      citation.verificationStatus ||
      citation.verification_status ||
      (citation.verified ? 'verified' : 'pending')
    ) as string,

    isGoodLaw:
      (citation.is_good_law as boolean | undefined) ??
      (citation.isGoodLaw as boolean | undefined) ??
      (citation.is_overruled != null ? !(citation.is_overruled as boolean) : true),

    courtlistenerOpinionId: (
      citation.courtlistenerOpinionId ||
      citation.courtlistener_opinion_id ||
      citation.courtlistener_id ||
      citation.courtlistenerId ||
      undefined
    ) as string | undefined,

    courtlistenerUrl: (citation.courtlistenerOpinionId || citation.courtlistener_opinion_id || citation.courtlistener_id)
      ? `https://www.courtlistener.com/opinion/${citation.courtlistenerOpinionId || citation.courtlistener_opinion_id || citation.courtlistener_id}/`
      : (citation.courtlistenerUrl || citation.courtlistener_url || undefined) as string | undefined,
  };
}
