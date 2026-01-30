// /types/citations.ts
// Citation object schema for Eyecite integration
// Task E-2 | Version 2.0 — January 28, 2026

export type CitationType =
  | "FULL_CASE"
  | "SHORT_CASE"
  | "SUPRA"
  | "ID"
  | "IBID"
  | "STATUTE"
  | "LA_STATUTE"
  | "UNKNOWN";

export type PropositionType =
  | "PRIMARY_STANDARD"
  | "REQUIRED_ELEMENT"
  | "SECONDARY"
  | "CONTEXT";

export type VerificationStatus =
  | "PENDING"
  | "VERIFIED"
  | "BLOCKED"
  | "FLAGGED"
  | "FAILED";

/**
 * Citation object with Eyecite-extracted structured data
 */
export interface Citation {
  // Unique identifier
  id: string;

  // Raw citation text
  raw: string;

  // Citation type from Eyecite
  citation_type: CitationType;

  // Structured components (from Eyecite)
  volume: string | null;
  reporter: string | null;
  page: string | null;
  pinpoint: string | null; // Specific page reference (e.g., "322" in "477 U.S. at 322")
  year: string | null;
  court: string | null; // Court code (e.g., "scotus", "ca9", "ca5", "la")

  // Party information (for case citations)
  case_name: string | null;
  plaintiff: string | null;
  defendant: string | null;

  // For Id./supra citations - links to the full citation this references
  antecedent_citation_id: string | null;

  // Position in document
  start_index: number;
  end_index: number;
  page_location: number;
  paragraph_location: number;

  // Context extraction
  surrounding_context: string; // 500 chars before/after
  proposition: string; // The sentence containing citation

  // Analysis results
  proposition_type: PropositionType;
  quote_text: string | null;

  // Verification pipeline results
  verification_status: VerificationStatus;
  courtlistener_id: string | null;
  courtlistener_url: string | null;
  verification_notes: string | null;

  // Louisiana-specific
  la_code_type?: LACodeType;

  // Metadata
  created_at: string;
  updated_at: string;
}

/**
 * Louisiana-specific code types
 */
export type LACodeType =
  | "LA_REVISED_STATUTES"
  | "LA_CIVIL_CODE"
  | "LA_CODE_CIV_PROC"
  | "LA_CODE_EVIDENCE"
  | "LA_CODE_CRIM_PROC"
  | "LA_CHILDREN_CODE"
  | "LA_CONSTITUTION"
  | "LA_ACTS"
  | "LA_ADMIN_CODE";

/**
 * Raw output from Eyecite Python script
 */
export interface EyeciteOutput {
  citations: EyeciteRawCitation[];
  count: number;
  error?: string;
}

export interface EyeciteRawCitation {
  index: number;
  raw: string;
  citation_type: CitationType;
  volume: string | null;
  reporter: string | null;
  page: string | null;
  pinpoint: string | null;
  year: string | null;
  court: string | null;
  plaintiff: string | null;
  defendant: string | null;
  case_name: string | null;
  span: [number, number] | null;
  antecedent: string | null;
}

/**
 * Citation verification result
 */
export interface CitationVerificationResult {
  citation_id: string;
  status: VerificationStatus;
  courtlistener_id: string | null;
  courtlistener_url: string | null;
  case_name_verified: string | null;
  holding_verified: boolean;
  is_good_law: boolean;
  negative_treatment: string | null;
  notes: string | null;
}

/**
 * Batch processing result
 */
export interface CitationBatchResult {
  batch_number: number;
  total_batches: number;
  citations_processed: number;
  results: CitationVerificationResult[];
  errors: string[];
}

// ============================================================================
// CITATION VIEWER TYPES
// Citation Viewer Feature — January 30, 2026
// ============================================================================

/**
 * Order Citation — stored in order_citations table
 * Represents a citation used in a specific order's motion
 */
export interface OrderCitation {
  id: string;
  orderId: string;

  // Display
  citationString: string;         // "806 F.3d 289"
  caseName: string;               // "Brumfield v. Louisiana State Board of Education"
  caseNameShort: string;          // "Brumfield"

  // CourtListener
  courtlistenerOpinionId?: string;
  courtlistenerClusterId?: string;
  courtlistenerUrl?: string;

  // Metadata
  court: string;                  // "Court of Appeals for the Fifth Circuit"
  courtShort: string;             // "5th Cir."
  dateFiled?: string;
  dateFiledDisplay?: string;      // "2015"

  // Usage
  citationType: 'case' | 'statute' | 'regulation';
  proposition?: string;           // What this citation supports
  locationInMotion?: string;      // "Argument I"
  authorityLevel?: 'binding' | 'persuasive';

  // Verification
  verificationStatus: 'verified' | 'unverified' | 'flagged';
  verificationTimestamp?: string;
  verificationMethod?: string;

  // Admin
  adminReviewed?: boolean;
  adminReviewedAt?: string;
  adminReviewedBy?: string;
  adminNotes?: string;

  displayOrder: number;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * Citation Details — full case information from CourtListener
 * Returned by the citation API endpoints
 */
export interface CitationDetails {
  opinionId: string;
  clusterId: string;

  // Case info
  caseName: string;
  caseNameShort: string;
  citation: string;
  court: string;
  courtShort: string;
  dateFiled: string;
  dateFiledDisplay: string;

  // Content
  syllabus?: string;
  headnotes?: string[];
  opinionText?: string;
  opinionTextType?: 'html' | 'plain';

  // Links
  courtlistenerUrl: string;
  pdfUrl?: string;
  googleScholarUrl?: string;

  // Treatment
  citedByCount: number;
  treatment: CitationTreatment;

  // Cache
  cachedAt: string;
  source: 'cache' | 'live';
}

/**
 * Citation Treatment — how a case has been treated by subsequent courts
 */
export interface CitationTreatment {
  isGoodLaw: boolean;
  overruledBy?: CitationReference[];
  distinguishedBy?: CitationReference[];
  followedBy?: CitationReference[];
  citedBy?: CitationReference[];
}

/**
 * Citation Reference — minimal reference to another case
 */
export interface CitationReference {
  caseName: string;
  citation: string;
  date: string;
  treatment: string;
  courtlistenerId?: string;
}

/**
 * Statutory Citation — non-case citations
 */
export interface StatutoryCitation {
  id?: string;
  citation: string;               // "La. C.C.P. art. 1469"
  name: string;                   // "Motion to Compel Discovery"
  purpose?: string;               // "Provides authority for..."
  relevantText?: string;          // Actual text of the statute
  codeType?: LACodeType;          // Louisiana-specific code type
}

/**
 * Citation Validation Result — from the validation pipeline
 */
export interface CitationValidationResult {
  isValid: boolean;
  authorizedCitations: string[];
  unauthorizedCitations: string[];
  warnings: string[];
}

/**
 * Save Citation Input — for saving citations to the database
 */
export interface SaveCitationInput {
  citationString: string;
  caseName: string;
  caseNameShort?: string;
  courtlistenerOpinionId?: string;
  courtlistenerClusterId?: string;
  courtlistenerUrl?: string;
  court?: string;
  courtShort?: string;
  dateFiled?: string;
  dateFiledDisplay?: string;
  citationType: 'case' | 'statute' | 'regulation';
  proposition?: string;
  locationInMotion?: string;
  authorityLevel?: 'binding' | 'persuasive';
  verificationStatus?: 'verified' | 'unverified' | 'flagged';
  verificationMethod?: string;
  displayOrder?: number;
}

/**
 * Order Citations Response — API response for order citations
 */
export interface OrderCitationsResponse {
  success: boolean;
  data?: {
    orderId: string;
    orderNumber: string;
    totalCitations: number;
    caseCitations: OrderCitation[];
    statutoryCitations: StatutoryCitation[];
  };
  error?: string;
}

/**
 * Citation Details Response — API response for single citation
 */
export interface CitationDetailsResponse {
  success: boolean;
  data?: CitationDetails;
  error?: string;
}

/**
 * Batch Citation Response — API response for batch citation fetch
 */
export interface BatchCitationResponse {
  success: boolean;
  data?: {
    citations: CitationDetails[];
    cacheHits: number;
    cacheMisses: number;
    errors: string[];
  };
  error?: string;
}

/**
 * Citation Cache Entry — stored in citation_cache table
 */
export interface CitationCacheEntry {
  id: string;
  courtlistenerOpinionId: string;
  courtlistenerClusterId?: string;

  // Cached data
  opinionData?: Record<string, unknown>;
  clusterData?: Record<string, unknown>;

  // Quick-access fields
  caseName?: string;
  caseNameShort?: string;
  citationString?: string;
  court?: string;
  courtShort?: string;
  dateFiled?: string;
  dateFiledDisplay?: string;

  // Opinion content
  opinionText?: string;
  opinionTextType?: 'html' | 'plain' | 'pdf_url';

  // Summary
  headnotes?: string;
  syllabus?: string;

  // Treatment
  citingCount?: number;
  citedByCount?: number;
  treatmentHistory?: Record<string, unknown>;

  // Cache management
  fetchedAt: string;
  expiresAt: string;
  fetchSource?: string;

  createdAt: string;
  updatedAt: string;
}

/**
 * Citation Quality Metrics — for Phase X output
 */
export interface CitationQualityMetrics {
  totalCitations: number;
  verifiedCitations: number;
  bindingCitations: number;
  persuasiveCitations: number;
  louisianaCitations: number;
  federalCitations: number;
  statutoryCitations: number;
  flaggedCitations?: number;
}
