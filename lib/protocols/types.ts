// ============================================================
// lib/protocols/types.ts
// Domain 9 Protocol Orchestration — Core Types
// Source: D9 B-1 | SP-13 AN-1
// ============================================================

export interface ProtocolContext {
  orderId: string;
  phase: string; // 'V.1' | 'VII.1' | 'IX.1'
  tier: 'A' | 'B' | 'C' | 'D';
  jurisdiction: string;
  citation: CitationData;
  verificationResult: VerificationResult;
  detectionOnly: boolean;
}

export interface CitationData {
  id: string;
  text?: string;
  caseName?: string;
  addedDuringRevision?: boolean;
}

export interface VerificationResult {
  status: 'VERIFIED' | 'NOT_FOUND' | 'MISMATCH' | 'QUOTE_NOT_FOUND' | 'VERIFICATION_DEFERRED';
  confidence?: number;
  metadata?: {
    isPlurality?: boolean;
    isDissent?: boolean;
    isEnBanc?: boolean;
    isAmended?: boolean;
    court?: string;
    proposition?: string;
    opinionText?: string;
    [key: string]: unknown;
  };
}

export interface ProtocolResult {
  protocolNumber: number;
  triggered: boolean;
  severity: 'INFO' | 'WARNING' | 'CRITICAL' | null;
  actionTaken: string | null;
  aisEntry: AISEntry | null;
  holdRequired: boolean;
  handlerVersion?: string;
}

export interface ProtocolManifestEntry {
  protocolNumber: number;
  protocolName: string;
  status: 'EVALUATED_CLEAN' | 'EVALUATED_TRIGGERED' | 'NOT_EVALUATED';
  reason?: string;
  aisEntry?: AISEntry;
}

export interface DispatchResult {
  results: ProtocolResult[];
  manifest: ProtocolManifestEntry[];
  holdRequired: boolean;
  holdProtocol: number | null;
}

export interface AISEntry {
  category: AISEntryCategory;
  protocolNumber: number;
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  title: string;
  description: string;
  citationId?: string;
  recommendation?: string;
}

export type AISEntryCategory =
  | 'CITATION'
  | 'WORKFLOW'
  | 'BAD_LAW'
  | 'QUALITY'
  | 'CITATION_FOUNDATION'  // D9-021: backward citation analysis
  | 'RESOURCE_LIMIT';       // ST-D9P8-06: cost-cap exits
