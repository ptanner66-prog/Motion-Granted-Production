// lib/conflicts/types.ts
// Conflict Check System - Type Definitions
// VERSION: 1.0.0

export type ConflictSeverity = 'BLOCKING' | 'WARNING' | 'INFO';

export type ConflictType =
  | 'SAME_CASE_NUMBER'           // Same case appears in multiple orders
  | 'OPPOSING_PARTIES'           // Same party on opposite sides
  | 'PRIOR_REPRESENTATION'       // Attorney previously represented opposing party
  | 'RELATED_MATTER'             // Different case numbers but related parties
  | 'SAME_ATTORNEY_BOTH_SIDES';  // Same attorney firm on both sides

export interface ConflictMatch {
  id: string;
  type: ConflictType;
  severity: ConflictSeverity;

  // The current order being checked
  currentOrderId: string;
  currentCaseNumber: string;
  currentPartyName: string;
  currentOpposingParty: string;
  currentAttorneyId: string;

  // The conflicting order
  conflictingOrderId: string;
  conflictingCaseNumber: string;
  conflictingPartyName: string;
  conflictingOpposingParty: string;
  conflictingAttorneyId: string;

  // Match details
  matchField: 'case_number' | 'party_name' | 'opposing_party' | 'attorney';
  matchConfidence: number; // 0-100
  matchReason: string;

  // Resolution
  resolved: boolean;
  resolvedAt: string | null;
  resolvedBy: string | null;
  resolutionNote: string | null;

  // Timestamps
  detectedAt: string;
  createdAt: string;
}

export interface ConflictCheckResult {
  orderId: string;
  checkedAt: string;
  conflicts: ConflictMatch[];
  hasBlockingConflicts: boolean;
  hasWarnings: boolean;
  summary: {
    total: number;
    blocking: number;
    warning: number;
    info: number;
  };
}

export interface ConflictCheckInput {
  orderId: string;
  caseNumber: string;
  partyName: string;
  opposingParty: string;
  attorneyId: string;
  court: string;
  jurisdiction: string;
}

// Normalized versions for fuzzy matching
export interface NormalizedParty {
  original: string;
  normalized: string;      // Lowercase, no punctuation
  tokens: string[];        // Individual words
  soundex: string[];       // Phonetic codes for fuzzy match
}
