// /types/conflict.ts
// Conflict check system types
// VERSION: 1.0 — January 28, 2026

export type ConflictSeverity = 'NONE' | 'SOFT' | 'HARD';

export interface PartyInfo {
  name: string;
  normalizedName: string;
  role: 'plaintiff' | 'defendant' | 'third_party' | 'witness' | 'counsel' | 'other';
  aliases?: string[];
}

export interface ConflictMatch {
  matchedOrderId: string;
  matchedOrderNumber: string;
  matchedPartyName: string;
  matchedPartyRole: string;
  currentPartyName: string;
  currentPartyRole: string;
  similarityScore: number;
  matchType: 'exact' | 'normalized' | 'fuzzy';
}

export interface ConflictCheckResult {
  severity: ConflictSeverity;
  matches: ConflictMatch[];
  requiresReview: boolean;
  canProceed: boolean;
  message: string;
  checkedAt: string;
}

export interface ConflictRecord {
  id: string;
  orderId: string;
  clientId: string;
  checkResult: ConflictCheckResult;
  status: 'pending_review' | 'approved' | 'rejected' | 'auto_cleared';
  reviewedBy?: string;
  reviewedAt?: string;
  reviewNotes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ConflictParty {
  id: string;
  orderId: string;
  partyName: string;
  normalizedName: string;
  partyRole: string;
  aliases: string[];
  createdAt: string;
}

export interface ConflictCheckRequest {
  orderId: string;
  clientId: string;
  parties: PartyInfo[];
  caseNumber?: string;
  courtName?: string;
}

export interface ConflictReviewRequest {
  conflictId: string;
  action: 'approve' | 'reject';
  reviewNotes?: string;
}

export interface ConflictAdminStats {
  totalChecks: number;
  pendingReviews: number;
  approvedCount: number;
  rejectedCount: number;
  hardConflicts: number;
  softConflicts: number;
}

// Thresholds for conflict detection
export const CONFLICT_THRESHOLDS = {
  EXACT_MATCH: 1.0,
  NORMALIZED_MATCH: 0.95,
  FUZZY_MATCH_SOFT: 0.85,
  FUZZY_MATCH_HARD: 0.92,
  MIN_NAME_LENGTH: 3,
} as const;

// Conflict severity rules
export const CONFLICT_RULES = {
  // HARD conflicts - must be reviewed, blocks order
  HARD: {
    sameClientOpposingSides: true, // Client was plaintiff, now defendant (or vice versa)
    exactNameMatch: true, // Exact party name match with opposing role
    highFuzzyOpposing: 0.92, // High similarity with opposing role
  },
  // SOFT conflicts - requires review but can proceed
  SOFT: {
    sameClientSameSide: true, // Client appears on same side (may be related case)
    moderateFuzzyMatch: 0.85, // Moderate similarity
    aliasMatch: true, // Matches a known alias
  },
} as const;
