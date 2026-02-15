// lib/conflicts/check.ts
// Core conflict detection logic
// VERSION: 1.0.0

import { createClient } from '@/lib/supabase/server';
import { createLogger } from '@/lib/security/logger';

const log = createLogger('conflicts-check');
import type {
  ConflictCheckInput,
  ConflictCheckResult,
  ConflictMatch,
  ConflictType,
  ConflictSeverity
} from './types';
import {
  normalizePartyName,
  normalizeCaseNumber,
  calculatePartySimilarity
} from './normalize';

// Similarity thresholds
const EXACT_MATCH_THRESHOLD = 100;
const HIGH_SIMILARITY_THRESHOLD = 85;
const MEDIUM_SIMILARITY_THRESHOLD = 70;

/**
 * Main conflict check function
 * Checks a new order against all existing orders
 */
export async function checkForConflicts(
  input: ConflictCheckInput
): Promise<ConflictCheckResult> {
  const supabase = await createClient();
  const conflicts: ConflictMatch[] = [];

  // Normalize input
  const normalizedCaseNumber = normalizeCaseNumber(input.caseNumber);
  const normalizedParty = normalizePartyName(input.partyName);
  const normalizedOpposing = normalizePartyName(input.opposingParty);

  // Fetch existing orders (exclude current order and terminal statuses — CC-R3-06)
  const { data: existingOrders, error } = await supabase
    .from('orders')
    .select(`
      id,
      case_number,
      party_name,
      opposing_party_name,
      attorney_id,
      court,
      jurisdiction,
      created_at
    `)
    .neq('id', input.orderId)
    .not('status', 'in', '("cancelled","cancelled_timeout","completed")')
    .order('created_at', { ascending: false })
    .limit(1000);  // Check against last 1000 orders

  if (error) {
    log.error('Conflict check query failed:', error);
    throw new Error(`Conflict check failed: ${error.message}`);
  }

  // Check each existing order
  for (const existing of existingOrders || []) {
    const existingNormalizedCase = normalizeCaseNumber(existing.case_number || '');
    const existingParty = normalizePartyName(existing.party_name || '');
    const existingOpposing = normalizePartyName(existing.opposing_party_name || '');

    // CHECK 1: Same case number
    if (normalizedCaseNumber && existingNormalizedCase &&
        normalizedCaseNumber === existingNormalizedCase) {
      conflicts.push(createConflictMatch({
        type: 'SAME_CASE_NUMBER',
        severity: 'WARNING',  // Same case might be legitimate (multiple motions)
        currentInput: input,
        existing,
        matchField: 'case_number',
        matchConfidence: 100,
        matchReason: `Exact case number match: ${input.caseNumber}`
      }));
    }

    // CHECK 2: Same party on opposite sides (BLOCKING)
    // Current party matches existing opposing party
    const partyVsOpposing = calculatePartySimilarity(normalizedParty, existingOpposing);
    if (partyVsOpposing >= HIGH_SIMILARITY_THRESHOLD) {
      conflicts.push(createConflictMatch({
        type: 'OPPOSING_PARTIES',
        severity: partyVsOpposing === EXACT_MATCH_THRESHOLD ? 'BLOCKING' : 'WARNING',
        currentInput: input,
        existing,
        matchField: 'party_name',
        matchConfidence: partyVsOpposing,
        matchReason: `Current client "${input.partyName}" was opposing party in order ${existing.id}`
      }));
    }

    // CHECK 3: Current opposing party matches existing client
    const opposingVsParty = calculatePartySimilarity(normalizedOpposing, existingParty);
    if (opposingVsParty >= HIGH_SIMILARITY_THRESHOLD) {
      conflicts.push(createConflictMatch({
        type: 'PRIOR_REPRESENTATION',
        severity: opposingVsParty === EXACT_MATCH_THRESHOLD ? 'BLOCKING' : 'WARNING',
        currentInput: input,
        existing,
        matchField: 'opposing_party',
        matchConfidence: opposingVsParty,
        matchReason: `Opposing party "${input.opposingParty}" was our client in order ${existing.id}`
      }));
    }

    // CHECK 4: Same attorney on both sides of different matters
    if (input.attorneyId === existing.attorney_id) {
      // Same attorney - check if parties are adversarial
      const partySimilarity = calculatePartySimilarity(normalizedParty, existingParty);
      const opposingSimilarity = calculatePartySimilarity(normalizedOpposing, existingOpposing);

      if (partySimilarity < MEDIUM_SIMILARITY_THRESHOLD &&
          opposingSimilarity < MEDIUM_SIMILARITY_THRESHOLD) {
        // Different parties entirely - might be related matter
        conflicts.push(createConflictMatch({
          type: 'RELATED_MATTER',
          severity: 'INFO',
          currentInput: input,
          existing,
          matchField: 'attorney',
          matchConfidence: 100,
          matchReason: `Same attorney handling potentially related matters`
        }));
      }
    }
  }

  // Compile results
  const result: ConflictCheckResult = {
    orderId: input.orderId,
    checkedAt: new Date().toISOString(),
    conflicts,
    hasBlockingConflicts: conflicts.some(c => c.severity === 'BLOCKING'),
    hasWarnings: conflicts.some(c => c.severity === 'WARNING'),
    summary: {
      total: conflicts.length,
      blocking: conflicts.filter(c => c.severity === 'BLOCKING').length,
      warning: conflicts.filter(c => c.severity === 'WARNING').length,
      info: conflicts.filter(c => c.severity === 'INFO').length
    }
  };

  // Store conflicts in database
  if (conflicts.length > 0) {
    await storeConflicts(conflicts);
  }

  return result;
}

/**
 * Helper to create a conflict match object
 */
function createConflictMatch(params: {
  type: ConflictType;
  severity: ConflictSeverity;
  currentInput: ConflictCheckInput;
  existing: any;
  matchField: ConflictMatch['matchField'];
  matchConfidence: number;
  matchReason: string;
}): ConflictMatch {
  const now = new Date().toISOString();

  return {
    id: crypto.randomUUID(),
    type: params.type,
    severity: params.severity,

    currentOrderId: params.currentInput.orderId,
    currentCaseNumber: params.currentInput.caseNumber,
    currentPartyName: params.currentInput.partyName,
    currentOpposingParty: params.currentInput.opposingParty,
    currentAttorneyId: params.currentInput.attorneyId,

    conflictingOrderId: params.existing.id,
    conflictingCaseNumber: params.existing.case_number || '',
    conflictingPartyName: params.existing.party_name || '',
    conflictingOpposingParty: params.existing.opposing_party_name || '',
    conflictingAttorneyId: params.existing.attorney_id || '',

    matchField: params.matchField,
    matchConfidence: params.matchConfidence,
    matchReason: params.matchReason,

    resolved: false,
    resolvedAt: null,
    resolvedBy: null,
    resolutionNote: null,

    detectedAt: now,
    createdAt: now
  };
}

/**
 * Store detected conflicts in database
 */
async function storeConflicts(conflicts: ConflictMatch[]): Promise<void> {
  const supabase = await createClient();

  const { error } = await supabase
    .from('conflict_matches')
    .insert(conflicts.map(c => ({
      id: c.id,
      type: c.type,
      severity: c.severity,
      current_order_id: c.currentOrderId,
      current_case_number: c.currentCaseNumber,
      current_party_name: c.currentPartyName,
      current_opposing_party: c.currentOpposingParty,
      current_attorney_id: c.currentAttorneyId,
      conflicting_order_id: c.conflictingOrderId,
      conflicting_case_number: c.conflictingCaseNumber,
      conflicting_party_name: c.conflictingPartyName,
      conflicting_opposing_party: c.conflictingOpposingParty,
      conflicting_attorney_id: c.conflictingAttorneyId,
      match_field: c.matchField,
      match_confidence: c.matchConfidence,
      match_reason: c.matchReason,
      resolved: c.resolved,
      resolved_at: c.resolvedAt,
      resolved_by: c.resolvedBy,
      resolution_note: c.resolutionNote,
      detected_at: c.detectedAt,
      created_at: c.createdAt
    })));

  if (error) {
    log.error('Failed to store conflicts:', error);
    // Don't throw - conflicts were detected, just couldn't store
  }
}
