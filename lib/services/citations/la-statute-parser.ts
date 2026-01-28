// /lib/services/citations/la-statute-parser.ts
// Louisiana-specific citation patterns that Eyecite doesn't recognize
// VERSION: 1.0 — January 28, 2026

export interface LACitation {
  raw: string;
  type: LACodeType;
  title?: string;
  section?: string;
  article?: string;
  subsection?: string;
  year?: number;
  actNumber?: number;
  startIndex: number;
  endIndex: number;
}

export type LACodeType =
  | 'LA_REVISED_STATUTES'
  | 'LA_CIVIL_CODE'
  | 'LA_CODE_CIV_PROC'
  | 'LA_CODE_EVIDENCE'
  | 'LA_CODE_CRIM_PROC'
  | 'LA_CHILDREN_CODE'
  | 'LA_CONSTITUTION'
  | 'LA_ACTS'
  | 'LA_ADMIN_CODE';

/**
 * 9 regex patterns for Louisiana citations Eyecite misses
 */
export const LA_CITATION_PATTERNS: Record<LACodeType, RegExp> = {
  // La. R.S. 9:2800.6(A)(1)
  LA_REVISED_STATUTES: /La\.?\s*R\.?\s*S\.?\s*(\d+):(\d+(?:\.\d+)?)\s*(?:\(([A-Za-z0-9]+)\))?(?:\((\d+)\))?/gi,

  // La. Civ. Code art. 2315
  LA_CIVIL_CODE: /La\.?\s*(?:Civ(?:il)?\.?\s*)?Code\s+art\.?\s*(\d+)/gi,

  // La. Code Civ. Proc. art. 966
  LA_CODE_CIV_PROC: /La\.?\s*(?:Code\s+)?C(?:iv)?\.?\s*P(?:roc)?\.?\s*art\.?\s*(\d+)/gi,

  // La. C.E. art. 702
  LA_CODE_EVIDENCE: /La\.?\s*C\.?\s*E\.?\s*art\.?\s*(\d+)/gi,

  // La. Code Crim. Proc. art. 701
  LA_CODE_CRIM_PROC: /La\.?\s*(?:Code\s+)?Crim\.?\s*P(?:roc)?\.?\s*art\.?\s*(\d+)/gi,

  // La. Ch.C. art. 603
  LA_CHILDREN_CODE: /La\.?\s*Ch\.?\s*C\.?\s*art\.?\s*(\d+)/gi,

  // La. Const. art. I, § 2
  LA_CONSTITUTION: /La\.?\s*Const\.?\s*art\.?\s*([IVX]+),?\s*§\s*(\d+)/gi,

  // Acts 2023, No. 456 OR 2023 La. Acts No. 456
  LA_ACTS: /(?:Acts?\s*(\d{4}),?\s*No\.?\s*(\d+))|(?:(\d{4})\s*La\.?\s*Acts?\s*No\.?\s*(\d+))/gi,

  // La. Admin. Code tit. 28, § 115
  LA_ADMIN_CODE: /La\.?\s*Admin\.?\s*Code\s+tit\.?\s*(\d+),?\s*§\s*(\d+)/gi,
};

/**
 * Extract Louisiana citations from text
 */
export function extractLouisianaCitations(text: string): LACitation[] {
  const citations: LACitation[] = [];

  for (const [type, pattern] of Object.entries(LA_CITATION_PATTERNS)) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match;

    while ((match = regex.exec(text)) !== null) {
      const citation = parseLAMatch(match, type as LACodeType);
      if (citation) {
        citations.push(citation);
      }
    }
  }

  return deduplicateCitations(citations);
}

function parseLAMatch(match: RegExpExecArray, type: LACodeType): LACitation | null {
  const raw = match[0];
  const startIndex = match.index;
  const endIndex = startIndex + raw.length;

  switch (type) {
    case 'LA_REVISED_STATUTES':
      return {
        raw,
        type,
        title: match[1],
        section: match[2],
        subsection: match[3] ? `(${match[3]})${match[4] ? `(${match[4]})` : ''}` : undefined,
        startIndex,
        endIndex,
      };

    case 'LA_CIVIL_CODE':
    case 'LA_CODE_CIV_PROC':
    case 'LA_CODE_EVIDENCE':
    case 'LA_CODE_CRIM_PROC':
    case 'LA_CHILDREN_CODE':
      return {
        raw,
        type,
        article: match[1],
        startIndex,
        endIndex,
      };

    case 'LA_CONSTITUTION':
      return {
        raw,
        type,
        article: match[1],
        section: match[2],
        startIndex,
        endIndex,
      };

    case 'LA_ACTS':
      return {
        raw,
        type,
        year: parseInt(match[1] || match[3]),
        actNumber: parseInt(match[2] || match[4]),
        startIndex,
        endIndex,
      };

    case 'LA_ADMIN_CODE':
      return {
        raw,
        type,
        title: match[1],
        section: match[2],
        startIndex,
        endIndex,
      };

    default:
      return null;
  }
}

function deduplicateCitations(citations: LACitation[]): LACitation[] {
  const seen = new Set<string>();
  return citations.filter(c => {
    const key = `${c.type}:${c.raw}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Format LA citation for verification lookup
 */
export function formatLACitationForLookup(citation: LACitation): string {
  switch (citation.type) {
    case 'LA_REVISED_STATUTES':
      return `La. R.S. ${citation.title}:${citation.section}`;
    case 'LA_CIVIL_CODE':
      return `La. Civ. Code art. ${citation.article}`;
    case 'LA_CODE_CIV_PROC':
      return `La. C.C.P. art. ${citation.article}`;
    case 'LA_CODE_EVIDENCE':
      return `La. C.E. art. ${citation.article}`;
    case 'LA_CODE_CRIM_PROC':
      return `La. Code Crim. Proc. art. ${citation.article}`;
    case 'LA_CHILDREN_CODE':
      return `La. Ch.C. art. ${citation.article}`;
    case 'LA_CONSTITUTION':
      return `La. Const. art. ${citation.article}, § ${citation.section}`;
    case 'LA_ACTS':
      return `${citation.year} La. Acts No. ${citation.actNumber}`;
    case 'LA_ADMIN_CODE':
      return `La. Admin. Code tit. ${citation.title}, § ${citation.section}`;
    default:
      return citation.raw;
  }
}

/**
 * Check if a citation string is a Louisiana citation
 */
export function isLouisianaCitation(text: string): boolean {
  for (const pattern of Object.values(LA_CITATION_PATTERNS)) {
    if (pattern.test(text)) return true;
  }
  return false;
}

/**
 * Get the Louisiana Legis website URL for a citation
 */
export function getLouisianaLegisUrl(citation: LACitation): string | null {
  const baseUrl = 'https://www.legis.la.gov';

  switch (citation.type) {
    case 'LA_REVISED_STATUTES':
      return `${baseUrl}/legis/Law.aspx?d=${citation.title}&t=RS`;
    case 'LA_CIVIL_CODE':
      return `${baseUrl}/legis/Law.aspx?d=CC`;
    case 'LA_CODE_CIV_PROC':
      return `${baseUrl}/legis/Law.aspx?d=CCP`;
    case 'LA_CODE_EVIDENCE':
      return `${baseUrl}/legis/Law.aspx?d=CE`;
    case 'LA_CODE_CRIM_PROC':
      return `${baseUrl}/legis/Law.aspx?d=CCRP`;
    default:
      return null;
  }
}
