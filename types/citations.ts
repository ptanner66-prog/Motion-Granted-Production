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
