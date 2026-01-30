/**
 * Citation Research Types
 *
 * Legal-Grade Citation Research System
 * Chen Megaprompt Specification — January 30, 2026
 *
 * Defines all interfaces for the three-phase citation research:
 * - Phase IV-A: Element Extraction
 * - Phase IV-B: Parallel Targeted Search
 * - Phase IV-C: Holding Verification + Scoring
 */

// ============================================================================
// MOTION TYPE CONFIGURATIONS
// ============================================================================

export type MotionTypeCode =
  | 'MCOMPEL'      // Motion to Compel Discovery
  | 'MTD_12B6'     // Motion to Dismiss (12(b)(6))
  | 'MSJ'          // Motion for Summary Judgment
  | 'MTC'          // Motion to Continue
  | 'MSTRIKE'      // Motion to Strike
  | 'MEXT'         // Motion for Extension
  | 'MPRO_HAC'     // Motion for Pro Hac Vice
  | 'GENERIC';     // Generic motion

export interface LegalElement {
  id: string;
  name: string;
  proposition: string;
  requiredAuthority: 'binding' | 'persuasive' | 'any';
  priority: 'critical' | 'important' | 'supporting';
  searchQueries: string[];  // 2-5 word queries per spec
}

export interface MotionElementTemplate {
  motionType: MotionTypeCode;
  elements: LegalElement[];
}

// ============================================================================
// COURT AUTHORITY CONFIGURATION
// ============================================================================

export type CourtTier = 'tier1' | 'tier2' | 'tier3';

export interface CourtConfig {
  code: string;
  name: string;
  tier: CourtTier;
  authorityScore: number;
  authorityType: 'binding' | 'persuasive';
}

export const LOUISIANA_COURT_HIERARCHY: CourtConfig[] = [
  // Tier 1: Louisiana Supreme Court (binding)
  { code: 'la', name: 'Supreme Court of Louisiana', tier: 'tier1', authorityScore: 100, authorityType: 'binding' },
  { code: 'lasc', name: 'Supreme Court of Louisiana', tier: 'tier1', authorityScore: 100, authorityType: 'binding' },

  // Tier 2: Louisiana Courts of Appeal (binding)
  { code: 'lactapp', name: 'Louisiana Court of Appeal', tier: 'tier2', authorityScore: 85, authorityType: 'binding' },

  // US Supreme Court (binding on federal issues)
  { code: 'scotus', name: 'Supreme Court of the United States', tier: 'tier1', authorityScore: 95, authorityType: 'binding' },

  // Tier 3: Fifth Circuit (persuasive)
  { code: 'ca5', name: 'United States Court of Appeals for the Fifth Circuit', tier: 'tier3', authorityScore: 65, authorityType: 'persuasive' },

  // LA Federal District Courts (persuasive)
  { code: 'laed', name: 'Eastern District of Louisiana', tier: 'tier3', authorityScore: 50, authorityType: 'persuasive' },
  { code: 'lamd', name: 'Middle District of Louisiana', tier: 'tier3', authorityScore: 50, authorityType: 'persuasive' },
  { code: 'lawd', name: 'Western District of Louisiana', tier: 'tier3', authorityScore: 50, authorityType: 'persuasive' },

  // Other Federal (persuasive)
  { code: 'fed', name: 'Other Federal Courts', tier: 'tier3', authorityScore: 30, authorityType: 'persuasive' },
];

// ============================================================================
// PHASE IV-A: ELEMENT EXTRACTION
// ============================================================================

export interface ElementExtractionInput {
  motionType: MotionTypeCode;
  jurisdiction: string;
  statementOfFacts: string;
  phaseIIOutput?: Record<string, unknown>;  // Legal standards from Phase II
  phaseIIIOutput?: Record<string, unknown>; // Issues from Phase III
}

export interface ExtractedElement {
  id: string;
  name: string;
  proposition: string;
  requiredAuthority: 'binding' | 'persuasive' | 'any';
  priority: 'critical' | 'important' | 'supporting';
  searchQueries: string[];
  customizedForFacts: boolean;
}

export interface ElementExtractionOutput {
  success: boolean;
  elements: ExtractedElement[];
  totalElements: number;
  criticalElements: number;
  customElements: number;
  durationMs: number;
  error?: string;
}

// ============================================================================
// PHASE IV-B: PARALLEL SEARCH
// ============================================================================

export interface SearchQuery {
  query: string;
  forElement: string;
  tier: CourtTier;
  courtCodes: string[];
}

export interface RawCandidate {
  id: number;
  clusterId: number;
  caseName: string;
  citation: string;
  court: string;
  courtCode: string;
  dateFiled: string;
  snippet: string;
  absoluteUrl: string;
  precedentialStatus: string;
  forElement: string;
  searchTier: CourtTier;
}

export interface ParallelSearchInput {
  elements: ExtractedElement[];
  jurisdiction: string;
  maxCandidatesPerElement: number;
}

export interface ParallelSearchOutput {
  success: boolean;
  candidates: RawCandidate[];
  totalCandidates: number;
  searchesExecuted: number;
  searchesByTier: {
    tier1: number;
    tier2: number;
    tier3: number;
  };
  durationMs: number;
  error?: string;
}

// ============================================================================
// PHASE IV-C: HOLDING VERIFICATION + SCORING
// ============================================================================

export type PropositionMatch = 'STRONG' | 'MODERATE' | 'WEAK' | 'NO_SUPPORT';
export type GoodLawStatus = 'GOOD_LAW' | 'CAUTION' | 'BAD_LAW';

export interface HoldingVerificationResult {
  candidateId: number;
  propositionMatch: PropositionMatch;
  relevantHolding: string;
  goodLawStatus: GoodLawStatus;
  verificationNotes: string;
}

export interface ScoredCitation {
  // Identification
  id: number;
  clusterId: number;
  caseName: string;
  citation: string;

  // CourtListener verification (REQUIRED)
  courtlistener_id: number;
  courtlistener_cluster_id: number;
  verification_timestamp: string;
  verification_method: 'search' | 'citation_lookup';

  // Court metadata
  court: string;
  courtCode: string;
  dateFiled: string;
  absoluteUrl: string;

  // Element mapping
  forElement: string;
  proposition: string;
  relevantHolding: string;
  authorityLevel: 'binding' | 'persuasive';

  // Verification results
  propositionMatch: PropositionMatch;
  goodLawStatus: GoodLawStatus;

  // Scoring
  authorityScore: number;
  recencyScore: number;
  relevanceScore: number;
  totalScore: number;

  // Selection
  selected: boolean;
  selectionReason?: string;
}

export interface HoldingVerificationInput {
  candidates: RawCandidate[];
  elements: ExtractedElement[];
  jurisdiction: string;
}

export interface HoldingVerificationOutput {
  success: boolean;
  scoredCitations: ScoredCitation[];
  selectedCitations: ScoredCitation[];
  totalVerified: number;
  totalSelected: number;
  averageScore: number;
  elementCoverage: Map<string, number>;
  durationMs: number;
  error?: string;
}

// ============================================================================
// SCORING CONSTANTS
// ============================================================================

export const AUTHORITY_SCORES: Record<string, number> = {
  // Louisiana Supreme Court
  'la': 100,
  'lasc': 100,
  'Supreme Court of Louisiana': 100,

  // Louisiana Court of Appeal
  'lactapp': 85,
  'Louisiana Court of Appeal': 85,

  // US Supreme Court
  'scotus': 95,
  'Supreme Court of the United States': 95,

  // Fifth Circuit
  'ca5': 65,
  'Fifth Circuit': 65,

  // LA Federal District Courts
  'laed': 50,
  'lamd': 50,
  'lawd': 50,

  // Other Federal
  'default': 30,
};

export const RECENCY_BONUSES: Array<{ startYear: number; endYear: number; bonus: number }> = [
  { startYear: 2024, endYear: 2026, bonus: 25 },
  { startYear: 2020, endYear: 2023, bonus: 20 },
  { startYear: 2015, endYear: 2019, bonus: 15 },
  { startYear: 2010, endYear: 2014, bonus: 10 },
  { startYear: 2000, endYear: 2009, bonus: 5 },
  { startYear: 0, endYear: 1999, bonus: 0 },
];

export const RELEVANCE_SCORES: Record<PropositionMatch, number> = {
  'STRONG': 30,
  'MODERATE': 20,
  'WEAK': 10,
  'NO_SUPPORT': 0,
};

export const SCORE_WEIGHTS = {
  authority: 0.40,
  recency: 0.20,
  relevance: 0.40,
};

// ============================================================================
// PHASE IV ORCHESTRATOR
// ============================================================================

export interface PhaseIVInput {
  orderId: string;
  motionType: MotionTypeCode;
  jurisdiction: string;
  tier: 'A' | 'B' | 'C';
  statementOfFacts: string;
  phaseIIOutput?: Record<string, unknown>;
  phaseIIIOutput?: Record<string, unknown>;
}

export interface PhaseIVOutput {
  success: boolean;

  // Citation banks
  caseCitationBank: ScoredCitation[];
  statutoryCitationBank: StatutoryCitation[];

  // Metrics
  totalCitations: number;
  bindingCount: number;
  persuasiveCount: number;
  louisianaCitations: number;
  federalCitations: number;

  // Element coverage
  elementsCovered: number;
  totalElements: number;

  // Timing
  phaseADuration: number;
  phaseBDuration: number;
  phaseCDuration: number;
  totalDuration: number;

  // Verification proof
  verificationProof: {
    searchesPerformed: number;
    candidatesFound: number;
    candidatesVerified: number;
    citationsSelected: number;
    allCitationsVerified: true;
    verificationSource: 'CourtListener API';
    verificationTimestamp: string;
  };

  // Version tracking
  _phaseIV_meta: {
    version: string;
    executionId: string;
    executedAt: string;
    codeGuarantee: 'LEGAL_GRADE_CITATION_RESEARCH';
  };

  error?: string;
}

// ============================================================================
// STATUTORY CITATIONS
// ============================================================================

export interface StatutoryCitation {
  id?: string;
  citation: string;         // "La. C.C.P. art. 1469"
  name: string;             // "Motion to Compel Discovery"
  purpose?: string;         // "Provides authority for..."
  relevantText?: string;    // Actual text of the statute
  codeType?: string;        // Louisiana-specific code type
}

// ============================================================================
// MOTION ELEMENT TEMPLATES
// ============================================================================

export const MOTION_TO_COMPEL_ELEMENTS: LegalElement[] = [
  {
    id: 'mcompel_valid_request',
    name: 'Valid Discovery Request',
    proposition: 'Requests were properly served and within Article 1422 scope',
    requiredAuthority: 'any',
    priority: 'critical',
    searchQueries: ['Louisiana discovery scope', 'discovery request Louisiana', 'interrogatory Louisiana'],
  },
  {
    id: 'mcompel_deadline_expired',
    name: 'Response Deadline Expired',
    proposition: 'Failed to respond within 30 days per Article 1458',
    requiredAuthority: 'any',
    priority: 'critical',
    searchQueries: ['discovery deadline Louisiana', 'response time discovery', 'thirty days discovery'],
  },
  {
    id: 'mcompel_waiver',
    name: 'Waiver of Objections',
    proposition: 'Complete failure to respond waives all objections',
    requiredAuthority: 'binding',
    priority: 'critical',
    searchQueries: ['waiver objections discovery', 'failure respond waiver', 'discovery waiver Louisiana'],
  },
  {
    id: 'mcompel_good_faith',
    name: 'Good Faith Conference',
    proposition: 'Made good faith effort to resolve per Article 1469',
    requiredAuthority: 'any',
    priority: 'important',
    searchQueries: ['good faith conference', 'meet confer discovery', 'discovery conference Louisiana'],
  },
  {
    id: 'mcompel_authority',
    name: 'Authority to Compel',
    proposition: 'Court may compel under Article 1469',
    requiredAuthority: 'any',
    priority: 'supporting',
    searchQueries: ['motion compel Louisiana', 'compel discovery order', 'court compel discovery'],
  },
  {
    id: 'mcompel_sanctions',
    name: 'Sanctions Entitlement',
    proposition: 'Fees warranted under Article 1471',
    requiredAuthority: 'persuasive',
    priority: 'supporting',
    searchQueries: ['discovery sanctions Louisiana', 'attorney fees discovery', 'sanctions compel motion'],
  },
];

export const MOTION_TO_DISMISS_ELEMENTS: LegalElement[] = [
  {
    id: 'mtd_failure_state',
    name: 'Failure to State Claim',
    proposition: 'Petition fails to state cause of action',
    requiredAuthority: 'binding',
    priority: 'critical',
    searchQueries: ['failure state claim Louisiana', 'no cause action', 'peremptory exception Louisiana'],
  },
  {
    id: 'mtd_standard_review',
    name: 'Standard of Review',
    proposition: 'Accept facts as true, not legal conclusions',
    requiredAuthority: 'binding',
    priority: 'critical',
    searchQueries: ['pleading standard Louisiana', 'facts true dismiss', 'dismiss standard review'],
  },
  {
    id: 'mtd_no_facts',
    name: 'No Set of Facts',
    proposition: 'No facts could entitle plaintiff to relief',
    requiredAuthority: 'binding',
    priority: 'critical',
    searchQueries: ['no facts relief Louisiana', 'dismiss no facts', 'entitle relief Louisiana'],
  },
];

export const SUMMARY_JUDGMENT_ELEMENTS: LegalElement[] = [
  {
    id: 'msj_no_genuine',
    name: 'No Genuine Issue',
    proposition: 'No genuine issue of material fact',
    requiredAuthority: 'binding',
    priority: 'critical',
    searchQueries: ['genuine issue fact Louisiana', 'material fact summary', 'no dispute fact'],
  },
  {
    id: 'msj_burden',
    name: 'Burden of Proof',
    proposition: 'Movant bears initial burden',
    requiredAuthority: 'binding',
    priority: 'critical',
    searchQueries: ['summary judgment burden Louisiana', 'movant burden summary', 'initial burden proof'],
  },
  {
    id: 'msj_evidence',
    name: 'Evidence Standard',
    proposition: 'Must be admissible evidence',
    requiredAuthority: 'binding',
    priority: 'important',
    searchQueries: ['admissible evidence summary', 'summary judgment evidence', 'evidence standard Louisiana'],
  },
];

export const MOTION_ELEMENT_TEMPLATES: Record<MotionTypeCode, LegalElement[]> = {
  'MCOMPEL': MOTION_TO_COMPEL_ELEMENTS,
  'MTD_12B6': MOTION_TO_DISMISS_ELEMENTS,
  'MSJ': SUMMARY_JUDGMENT_ELEMENTS,
  'MTC': [],
  'MSTRIKE': [],
  'MEXT': [],
  'MPRO_HAC': [],
  'GENERIC': [],
};

// ============================================================================
// STATUTORY BANKS BY MOTION TYPE
// ============================================================================

export const MOTION_STATUTORY_BANKS: Record<MotionTypeCode, StatutoryCitation[]> = {
  'MCOMPEL': [
    { citation: 'La. C.C.P. art. 1422', name: 'Scope of Discovery', purpose: 'Defines permissible discovery scope' },
    { citation: 'La. C.C.P. art. 1458', name: 'Time for Response', purpose: 'Establishes 30-day response deadline' },
    { citation: 'La. C.C.P. art. 1469', name: 'Motion to Compel', purpose: 'Authorizes court to compel discovery' },
    { citation: 'La. C.C.P. art. 1471', name: 'Sanctions', purpose: 'Provides for attorney fees and sanctions' },
  ],
  'MTD_12B6': [
    { citation: 'La. C.C.P. art. 927', name: 'Peremptory Exception', purpose: 'Grounds for dismissal' },
    { citation: 'La. C.C.P. art. 931', name: 'Exception of No Cause of Action', purpose: 'Failure to state claim standard' },
  ],
  'MSJ': [
    { citation: 'La. C.C.P. art. 966', name: 'Motion for Summary Judgment', purpose: 'Summary judgment procedure and standards' },
    { citation: 'La. C.C.P. art. 967', name: 'Affidavits', purpose: 'Evidence requirements for summary judgment' },
  ],
  'MTC': [],
  'MSTRIKE': [],
  'MEXT': [],
  'MPRO_HAC': [],
  'GENERIC': [],
};
