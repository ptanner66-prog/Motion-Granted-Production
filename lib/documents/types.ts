/**
 * Shared types for the document generation pipeline
 *
 * Used by: docx-generator, caption-block, signature-block, storage-service
 */

export interface MotionData {
  // Order metadata
  orderId: string;
  orderNumber: string;

  // Case information
  caseNumber: string;
  caseCaption: string;
  court: string;
  jurisdiction: string;
  parish?: string;    // Louisiana specific
  division?: string;
  department?: string;

  // Parties
  plaintiffs: string[];
  defendants: string[];
  clientRole: 'plaintiff' | 'defendant' | 'petitioner' | 'respondent';

  // Attorney information
  attorneyName: string;
  barNumber: string;
  firmName: string;
  firmAddress: string;
  firmPhone: string;
  firmEmail: string;

  // Motion content (from Phase V/VIII output)
  motionTitle: string;       // e.g., "MOTION TO COMPEL DISCOVERY"
  motionBody: string;        // Full body text with section headings
  sections: MotionSection[];

  // Citations (from Phase IV/V.1)
  citations: CitationEntry[];

  // Supporting documents (from Phase IX)
  supportingDocuments?: SupportingDocument[];

  // Metadata
  tier: 'A' | 'B' | 'C';
  filingDate: string;
}

export interface MotionSection {
  id: string;
  heading: string;        // e.g., "I. INTRODUCTION"
  content: string;
  level: 1 | 2 | 3;
}

export interface CitationEntry {
  caseName: string;
  citation: string;
  court: string;
  year: number;
  propositionSupported: string;
  courtlistenerUrl?: string;
}

export interface SupportingDocument {
  type: 'declaration' | 'separate_statement' | 'proposed_order' | 'memorandum' | 'certificate_of_service';
  title: string;
  content: string;
}

export interface GeneratedDocument {
  filename: string;
  buffer: Buffer;
  mimeType: string;
  documentType: 'motion' | 'declaration' | 'separate_statement' | 'proposed_order' | 'certificate_of_service' | 'table_of_authorities';
}
