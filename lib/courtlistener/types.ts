/**
 * CourtListener API Type Definitions
 *
 * Based on API documentation: https://www.courtlistener.com/api/rest-info/
 */

/**
 * Opinion object returned from CourtListener API
 */
export interface CourtListenerOpinion {
  id: number;
  absolute_url?: string;
  cluster?: number;
  cluster_id?: number;
  author?: string;
  author_str?: string;
  joined_by?: number[];
  joined_by_str?: string;
  type?: string;
  sha1?: string;
  page_count?: number;
  date_created?: string;
  date_modified?: string;
  date_filed?: string;

  // Case information
  case_name?: string;
  case_name_short?: string;
  case_name_full?: string;
  docket_number?: string;

  // Court info
  court?: string;
  court_id?: string;

  // Citation info
  citation?: string[];
  citations?: Array<{
    volume: number;
    reporter: string;
    page: number;
    type: number;
  }>;

  // Publication status
  precedential_status?: string;
  is_published?: boolean;

  // Text content (when requested)
  plain_text?: string;
  html?: string;
  html_lawbox?: string;
  html_columbia?: string;
  html_anon_2020?: string;
  xml_harvard?: string;
  html_with_citations?: string;

  // Relationships
  opinions_cited?: number[];
  citation_count?: number;
}

/**
 * Search result wrapper
 */
export interface CourtListenerSearchResult {
  found: boolean;
  opinions: CourtListenerOpinion[];
  count: number;
}

/**
 * Citing opinion relationship
 */
export interface CourtListenerCitingOpinion {
  id: number;
  depth: number;
  cited_opinion: number;
  citing_opinion: number;
  treatment?: string;
  date_created?: string;
  date_modified?: string;
}

/**
 * Cluster (case) information
 * A cluster groups related opinions (majority, dissent, concurrence)
 */
export interface CourtListenerCluster {
  id: number;
  absolute_url?: string;
  case_name: string;
  case_name_short?: string;
  case_name_full?: string;
  date_filed: string;
  date_filed_is_approximate?: boolean;
  docket?: number;
  docket_number?: string;

  // Citations
  citations: Array<{
    volume: number;
    reporter: string;
    page: number;
    type: number;
  }>;
  citation_count?: number;

  // Status
  precedential_status: string;
  blocked?: boolean;
  date_blocked?: string;

  // Court
  court?: string;
  court_id?: string;

  // Judges
  judges?: string;
  panel?: number[];

  // Opinions in this cluster
  sub_opinions?: number[];

  // Source
  source?: string;
  filepath_json_harvard?: string;
}

/**
 * Treatment types from CourtListener
 */
export type TreatmentType =
  | 'cited'
  | 'followed'
  | 'distinguished'
  | 'criticized'
  | 'questioned'
  | 'overruled'
  | 'reversed'
  | 'vacated'
  | 'superseded'
  | 'approved'
  | 'affirmed';

/**
 * Normalized treatment classification
 */
export type NormalizedTreatment = 'POSITIVE' | 'NEGATIVE' | 'CAUTION' | 'NEUTRAL';

/**
 * Map treatment types to normalized categories
 */
export const TREATMENT_CLASSIFICATION: Record<TreatmentType, NormalizedTreatment> = {
  cited: 'NEUTRAL',
  followed: 'POSITIVE',
  approved: 'POSITIVE',
  affirmed: 'POSITIVE',
  distinguished: 'CAUTION',
  criticized: 'CAUTION',
  questioned: 'CAUTION',
  overruled: 'NEGATIVE',
  reversed: 'NEGATIVE',
  vacated: 'NEGATIVE',
  superseded: 'NEGATIVE',
};

/**
 * Citation extraction result
 */
export interface ExtractedCitation {
  caseName: string;
  volume: number;
  reporter: string;
  page: number;
  year?: number;
  court?: string;
  rawString: string;
  normalizedString: string;
}

/**
 * Verification result from CourtListener lookup
 */
export interface CourtListenerVerificationResult {
  exists: boolean;
  courtlistenerId?: string;
  courtlistenerUrl?: string;
  caseName?: string;
  court?: string;
  year?: number;
  dateDecided?: string;
  isPublished?: boolean;
  precedentialStatus?: string;
  citationCount?: number;
  treatmentSummary?: {
    positive: number;
    negative: number;
    caution: number;
    neutral: number;
  };
}

/**
 * Court code mappings for common courts
 */
export const COURT_CODES: Record<string, string> = {
  // Federal Supreme Court
  scotus: 'Supreme Court of the United States',

  // Federal Circuit Courts
  ca1: 'First Circuit',
  ca2: 'Second Circuit',
  ca3: 'Third Circuit',
  ca4: 'Fourth Circuit',
  ca5: 'Fifth Circuit',
  ca6: 'Sixth Circuit',
  ca7: 'Seventh Circuit',
  ca8: 'Eighth Circuit',
  ca9: 'Ninth Circuit',
  ca10: 'Tenth Circuit',
  ca11: 'Eleventh Circuit',
  cadc: 'D.C. Circuit',
  cafc: 'Federal Circuit',

  // California State Courts
  cal: 'Supreme Court of California',
  calctapp: 'California Court of Appeal',
  calag: 'California Attorney General',

  // Texas State Courts
  tex: 'Supreme Court of Texas',
  texapp: 'Texas Court of Appeals',
  texcrimapp: 'Texas Court of Criminal Appeals',

  // New York State Courts
  ny: 'New York Court of Appeals',
  nyappdiv: 'New York Appellate Division',
  nysupct: 'New York Supreme Court',

  // Florida State Courts
  fla: 'Florida Supreme Court',
  fladistctapp: 'Florida District Court of Appeal',
};

/**
 * Reporter abbreviation mappings
 */
export const REPORTER_ABBREVIATIONS: Record<string, string> = {
  'U.S.': 'United States Reports',
  'S. Ct.': 'Supreme Court Reporter',
  'L. Ed.': "Lawyer's Edition",
  'L. Ed. 2d': "Lawyer's Edition Second Series",
  'F.': 'Federal Reporter',
  'F.2d': 'Federal Reporter Second Series',
  'F.3d': 'Federal Reporter Third Series',
  'F.4th': 'Federal Reporter Fourth Series',
  'F. Supp.': 'Federal Supplement',
  'F. Supp. 2d': 'Federal Supplement Second Series',
  'F. Supp. 3d': 'Federal Supplement Third Series',
  'Cal.': 'California Reports',
  'Cal.2d': 'California Reports Second Series',
  'Cal.3d': 'California Reports Third Series',
  'Cal.4th': 'California Reports Fourth Series',
  'Cal.5th': 'California Reports Fifth Series',
  'Cal. App.': 'California Appellate Reports',
  'Cal. App. 2d': 'California Appellate Reports Second Series',
  'Cal. App. 3d': 'California Appellate Reports Third Series',
  'Cal. App. 4th': 'California Appellate Reports Fourth Series',
  'Cal. App. 5th': 'California Appellate Reports Fifth Series',
  'Cal. Rptr.': 'California Reporter',
  'Cal. Rptr. 2d': 'California Reporter Second Series',
  'Cal. Rptr. 3d': 'California Reporter Third Series',
};
