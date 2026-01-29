// /lib/services/conflict/conflict-check-service.ts
// Conflict check service for party matching
// VERSION: 1.0 — January 28, 2026

import { createClient } from '@/lib/supabase/server';
import {
  ConflictCheckRequest,
  ConflictCheckResult,
  ConflictMatch,
  ConflictSeverity,
  PartyInfo,
  CONFLICT_THRESHOLDS,
} from '@/types/conflict';
import {
  normalizePartyName,
  calculateSimilarity,
  checkNameMatch,
  generateAliases,
} from './party-normalizer';

export interface ConflictCheckServiceResult {
  success: boolean;
  result?: ConflictCheckResult;
  conflictId?: string;
  error?: string;
}

/**
 * Run conflict check for an order's parties
 */
export async function runConflictCheck(
  request: ConflictCheckRequest
): Promise<ConflictCheckServiceResult> {
  const supabase = await createClient();
  const { orderId, clientId, parties } = request;

  try {
    // Get all parties from previous orders for this client
    const { data: existingParties, error: fetchError } = await supabase
      .from('conflict_parties')
      .select(`
        id,
        order_id,
        party_name,
        normalized_name,
        party_role,
        aliases,
        orders!inner (
          id,
          order_number,
          client_id
        )
      `)
      .eq('orders.client_id', clientId)
      .neq('order_id', orderId);

    if (fetchError) {
      return { success: false, error: fetchError.message };
    }

    const matches: ConflictMatch[] = [];

    // Check each new party against existing parties
    for (const newParty of parties) {
      const normalizedNew = normalizePartyName(newParty.name);
      const newAliases = generateAliases(newParty.name);

      for (const existing of existingParties || []) {
        const matchResult = checkNameMatch(newParty.name, existing.party_name);

        if (matchResult.isMatch) {
          matches.push({
            matchedOrderId: existing.order_id,
            matchedOrderNumber: (existing.orders as { order_number: string })?.order_number || 'Unknown',
            matchedPartyName: existing.party_name,
            matchedPartyRole: existing.party_role,
            currentPartyName: newParty.name,
            currentPartyRole: newParty.role,
            similarityScore: matchResult.similarity,
            matchType: matchResult.matchType as 'exact' | 'fuzzy' | 'normalized',
          });
        }

        // Also check against aliases
        for (const alias of existing.aliases || []) {
          const aliasMatch = checkNameMatch(newParty.name, alias);
          if (aliasMatch.isMatch && !matches.some(m =>
            m.matchedOrderId === existing.order_id &&
            m.currentPartyName === newParty.name
          )) {
            matches.push({
              matchedOrderId: existing.order_id,
              matchedOrderNumber: (existing.orders as { order_number: string })?.order_number || 'Unknown',
              matchedPartyName: existing.party_name,
              matchedPartyRole: existing.party_role,
              currentPartyName: newParty.name,
              currentPartyRole: newParty.role,
              similarityScore: aliasMatch.similarity,
              matchType: 'fuzzy',
            });
          }
        }
      }
    }

    // Determine severity based on matches
    const severity = determineSeverity(matches);
    const requiresReview = severity !== 'NONE';
    const canProceed = severity !== 'HARD';

    const result: ConflictCheckResult = {
      severity,
      matches,
      requiresReview,
      canProceed,
      message: generateConflictMessage(severity, matches),
      checkedAt: new Date().toISOString(),
    };

    // Store the conflict check result
    const { data: conflictRecord, error: insertError } = await supabase
      .from('conflict_checks')
      .insert({
        order_id: orderId,
        client_id: clientId,
        check_result: result,
        status: severity === 'NONE' ? 'auto_cleared' : 'pending_review',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (insertError) {
      console.error('[ConflictCheck] Failed to store result:', insertError);
    }

    // Store new parties for future checks
    await storeParties(orderId, parties);

    return {
      success: true,
      result,
      conflictId: conflictRecord?.id,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Determine conflict severity based on matches
 */
function determineSeverity(matches: ConflictMatch[]): ConflictSeverity {
  if (matches.length === 0) return 'NONE';

  // Check for HARD conflicts
  for (const match of matches) {
    // Exact match with opposing roles
    if (match.matchType === 'exact' && isOpposingRole(match.matchedPartyRole, match.currentPartyRole)) {
      return 'HARD';
    }

    // High similarity with opposing roles
    if (match.similarityScore >= CONFLICT_THRESHOLDS.FUZZY_MATCH_HARD &&
        isOpposingRole(match.matchedPartyRole, match.currentPartyRole)) {
      return 'HARD';
    }
  }

  // Check for SOFT conflicts
  for (const match of matches) {
    if (match.similarityScore >= CONFLICT_THRESHOLDS.FUZZY_MATCH_SOFT) {
      return 'SOFT';
    }
  }

  return 'NONE';
}

/**
 * Check if two roles are opposing (plaintiff vs defendant)
 */
function isOpposingRole(role1: string, role2: string): boolean {
  const plaintiffRoles = ['plaintiff', 'petitioner', 'appellant', 'complainant'];
  const defendantRoles = ['defendant', 'respondent', 'appellee'];

  const isPlaintiff1 = plaintiffRoles.includes(role1.toLowerCase());
  const isDefendant1 = defendantRoles.includes(role1.toLowerCase());
  const isPlaintiff2 = plaintiffRoles.includes(role2.toLowerCase());
  const isDefendant2 = defendantRoles.includes(role2.toLowerCase());

  return (isPlaintiff1 && isDefendant2) || (isDefendant1 && isPlaintiff2);
}

/**
 * Generate human-readable conflict message
 */
function generateConflictMessage(severity: ConflictSeverity, matches: ConflictMatch[]): string {
  if (severity === 'NONE') {
    return 'No conflicts detected.';
  }

  if (severity === 'HARD') {
    return `HARD CONFLICT: Found ${matches.length} match(es) with opposing party roles. This order requires admin review before proceeding.`;
  }

  return `SOFT CONFLICT: Found ${matches.length} potential match(es). Review recommended but order can proceed.`;
}

/**
 * Store parties for future conflict checks
 */
async function storeParties(orderId: string, parties: PartyInfo[]): Promise<void> {
  const supabase = await createClient();

  const partyRecords = parties.map(party => ({
    order_id: orderId,
    party_name: party.name,
    normalized_name: normalizePartyName(party.name),
    party_role: party.role,
    aliases: generateAliases(party.name),
    created_at: new Date().toISOString(),
  }));

  const { error } = await supabase
    .from('conflict_parties')
    .insert(partyRecords);

  if (error) {
    console.error('[ConflictCheck] Failed to store parties:', error);
  }
}

/**
 * Get conflict check result for an order
 */
export async function getConflictCheckResult(orderId: string): Promise<ConflictCheckResult | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('conflict_checks')
    .select('check_result')
    .eq('order_id', orderId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (error || !data) return null;

  return data.check_result as ConflictCheckResult;
}

/**
 * Check if order can proceed based on conflict status
 */
export async function canOrderProceed(orderId: string): Promise<{
  canProceed: boolean;
  reason?: string;
}> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('conflict_checks')
    .select('status, check_result')
    .eq('order_id', orderId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (error || !data) {
    return { canProceed: true }; // No conflict check found, allow to proceed
  }

  const result = data.check_result as ConflictCheckResult;

  if (data.status === 'approved' || data.status === 'auto_cleared') {
    return { canProceed: true };
  }

  if (data.status === 'rejected') {
    return { canProceed: false, reason: 'Conflict check rejected by admin' };
  }

  if (result.severity === 'HARD') {
    return { canProceed: false, reason: 'Hard conflict requires admin approval' };
  }

  return { canProceed: true };
}

/**
 * Alternative conflict check interface for intake flow
 * Used by conflict-integration.ts
 */
export interface IntakeConflictRequest {
  orderId: string;
  caseNumber: string;
  jurisdiction: string;
  plaintiffs: string[];
  defendants: string[];
  attorneyUserId: string;
  attorneySide: 'PLAINTIFF' | 'DEFENDANT';
}

export interface IntakeConflictResult extends ConflictCheckResult {
  action: 'PROCEED' | 'REVIEW' | 'BLOCK';
}

/**
 * Check for conflicts using intake flow interface
 * Wrapper for runConflictCheck with simpler input/output
 */
export async function checkForConflicts(
  request: IntakeConflictRequest
): Promise<IntakeConflictResult> {
  const supabase = await createClient();

  // Get client ID from user
  const { data: profile } = await supabase
    .from('profiles')
    .select('id')
    .eq('id', request.attorneyUserId)
    .single();

  const clientId = profile?.id || request.attorneyUserId;

  // Convert intake parties to PartyInfo format
  const parties: PartyInfo[] = [
    ...request.plaintiffs.map(name => ({
      name,
      normalizedName: normalizePartyName(name),
      role: 'plaintiff' as const,
    })),
    ...request.defendants.map(name => ({
      name,
      normalizedName: normalizePartyName(name),
      role: 'defendant' as const,
    })),
  ];

  // Run the conflict check
  const result = await runConflictCheck({
    orderId: request.orderId,
    clientId,
    parties,
    caseNumber: request.caseNumber,
  });

  if (!result.success || !result.result) {
    // Return default "proceed" if check fails
    return {
      severity: 'NONE',
      matches: [],
      requiresReview: false,
      canProceed: true,
      message: result.error || 'Conflict check failed, proceeding with caution',
      checkedAt: new Date().toISOString(),
      action: 'PROCEED',
    };
  }

  // Map severity to action
  let action: 'PROCEED' | 'REVIEW' | 'BLOCK';
  switch (result.result.severity) {
    case 'HARD':
      action = 'BLOCK';
      break;
    case 'SOFT':
      action = 'REVIEW';
      break;
    default:
      action = 'PROCEED';
  }

  return {
    ...result.result,
    action,
  };
}
