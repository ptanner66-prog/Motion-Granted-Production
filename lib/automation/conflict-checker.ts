/**
 * Conflict Checking Automation Module
 *
 * This module handles automatic conflict checking for new orders by analyzing
 * party names against historical data and using AI for fuzzy matching.
 */

import { createClient } from '@/lib/supabase/server';
import { createLogger } from '@/lib/security/logger';

const log = createLogger('automation-conflict-checker');
import {
  analyzeConflicts,
  calculateSimilarity,
  normalizePartyName,
  isClaudeConfigured,
  type ConflictAnalysisInput,
  type ConflictAnalysisOutput,
} from './claude';
import type {
  ConflictCheckResult,
  ConflictMatchResult,
  RiskLevel,
  MatchType,
  OperationResult,
} from '@/types/automation';

// ============================================================================
// TYPES
// ============================================================================

interface ConflictCheckOptions {
  useAI?: boolean;
  fuzzyMatchThreshold?: number;
  autoClearThreshold?: number;
  skipIfAlreadyChecked?: boolean;
}

interface HistoricalParty {
  party_name: string;
  party_name_normalized: string;
  party_role: string;
  order_id: string;
  orders: {
    order_number: string;
    case_caption: string;
    client_id: string;
  };
}

// ============================================================================
// SETTINGS HELPERS
// ============================================================================

async function getConflictCheckSettings(): Promise<{
  enabled: boolean;
  autoClearThreshold: number;
  fuzzyMatchThreshold: number;
}> {
  try {
    const supabase = await createClient();

    const { data: settings } = await supabase
      .from('automation_settings')
      .select('setting_key, setting_value')
      .in('setting_key', [
        'conflict_check_enabled',
        'conflict_auto_clear_threshold',
        'conflict_fuzzy_match_threshold',
      ]);

    interface SettingRow { setting_key: string; setting_value: unknown }
    const settingsMap = new Map(
      settings?.map((s: SettingRow) => [s.setting_key, s.setting_value]) || []
    );

    return {
      enabled: (settingsMap.get('conflict_check_enabled') as { enabled?: boolean })?.enabled ?? true,
      autoClearThreshold:
        (settingsMap.get('conflict_auto_clear_threshold') as { value?: number })?.value ?? 0.95,
      fuzzyMatchThreshold:
        (settingsMap.get('conflict_fuzzy_match_threshold') as { value?: number })?.value ?? 0.85,
    };
  } catch (error) {
    log.error('[Conflict Checker] Failed to load settings:', error);
    return {
      enabled: true,
      autoClearThreshold: 0.95,
      fuzzyMatchThreshold: 0.85,
    };
  }
}

// ============================================================================
// MAIN FUNCTIONS
// ============================================================================

/**
 * Run a full conflict check for an order
 */
export async function runConflictCheck(
  orderId: string,
  options: ConflictCheckOptions = {}
): Promise<OperationResult<ConflictCheckResult>> {
  const startTime = Date.now();
  const supabase = await createClient();

  try {
    // Load settings
    const settings = await getConflictCheckSettings();

    if (!settings.enabled) {
      return {
        success: false,
        error: 'Conflict checking is disabled',
        code: 'CONFLICT_CHECK_DISABLED',
      };
    }

    const useAI = options.useAI ?? isClaudeConfigured;
    const fuzzyThreshold = options.fuzzyMatchThreshold ?? settings.fuzzyMatchThreshold;
    const autoClearThreshold = options.autoClearThreshold ?? settings.autoClearThreshold;

    // Log start of conflict check
    await logAutomationAction(supabase, orderId, 'conflict_check_started', {
      useAI,
      fuzzyThreshold,
      autoClearThreshold,
    });

    // Fetch order with parties
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select(`
        id,
        order_number,
        case_caption,
        client_id,
        related_entities,
        conflict_flagged,
        conflict_cleared,
        parties (
          id,
          party_name,
          party_name_normalized,
          party_role
        )
      `)
      .eq('id', orderId)
      .single();

    if (orderError || !order) {
      throw new Error(`Order not found: ${orderId}`);
    }

    // Skip if already checked (unless override)
    if (options.skipIfAlreadyChecked !== false && order.conflict_cleared) {
      return {
        success: true,
        data: {
          orderId,
          hasConflicts: false,
          matches: [],
          recommendation: 'clear',
          confidence: 1,
          reasoning: 'Order was previously cleared for conflicts',
          processingTimeMs: Date.now() - startTime,
        },
      };
    }

    interface Party {
      party_name: string;
      party_name_normalized: string;
      party_role: string;
    }
    const parties = (order.parties || []) as Party[];

    if (parties.length === 0) {
      // No parties to check - auto clear
      await updateOrderConflictStatus(supabase, orderId, false, true, 'No parties to check');

      await logAutomationAction(supabase, orderId, 'conflict_cleared', {
        reason: 'No parties in order',
        autoCleared: true,
      });

      return {
        success: true,
        data: {
          orderId,
          hasConflicts: false,
          matches: [],
          recommendation: 'clear',
          confidence: 1,
          reasoning: 'No parties in order to check',
          processingTimeMs: Date.now() - startTime,
        },
      };
    }

    // Fetch all historical parties (excluding this order and same client)
    const { data: historicalPartiesData, error: histError } = await supabase
      .from('parties')
      .select(`
        party_name,
        party_name_normalized,
        party_role,
        order_id,
        orders!inner (
          order_number,
          case_caption,
          client_id
        )
      `)
      .neq('order_id', orderId);

    const historicalParties = historicalPartiesData as HistoricalParty[] | null;

    if (histError) {
      throw new Error(`Failed to fetch historical parties: ${histError.message}`);
    }

    // Filter out parties from the same client (not a conflict)
    const filteredHistorical = (historicalParties || []).filter(
      (hp: HistoricalParty) => hp.orders.client_id !== order.client_id
    );

    let matches: ConflictMatchResult[] = [];
    let aiAnalysis: ConflictAnalysisOutput | null = null;

    if (useAI && isClaudeConfigured && filteredHistorical.length > 0) {
      // Use AI for comprehensive analysis
      const aiInput: ConflictAnalysisInput = {
        newOrderParties: parties.map((p: Party) => ({
          name: p.party_name,
          normalizedName: p.party_name_normalized,
          role: p.party_role,
        })),
        historicalParties: filteredHistorical.map((hp: HistoricalParty) => ({
          name: hp.party_name,
          normalizedName: hp.party_name_normalized,
          role: hp.party_role,
          orderId: hp.order_id,
          orderNumber: hp.orders.order_number,
          caseCaption: hp.orders.case_caption,
          clientId: hp.orders.client_id,
        })),
        relatedEntities: order.related_entities || undefined,
      };

      const aiResult = await analyzeConflicts(aiInput);

      if (aiResult.success && aiResult.result) {
        aiAnalysis = aiResult.result;
        matches = aiResult.result.matches.map((m) => ({
          partyName: m.newPartyName,
          matchedPartyName: m.matchedPartyName,
          matchedOrderId: m.matchedOrderId,
          matchedOrderNumber: m.matchedOrderNumber,
          matchedCaseCaption: m.matchedCaseCaption,
          matchType: m.matchType,
          similarityScore: m.similarityScore,
          riskLevel: m.riskLevel,
          aiAnalysis: m.reasoning,
        }));
      }
    }

    // If AI didn't find matches or wasn't used, do basic matching
    if (matches.length === 0) {
      matches = performBasicMatching(parties, filteredHistorical, fuzzyThreshold);
    }

    // Store conflict matches in database
    if (matches.length > 0) {
      await storeConflictMatches(supabase, orderId, matches);
    }

    // Determine recommendation
    const hasConflicts = matches.length > 0;
    const highRiskMatches = matches.filter((m) => m.riskLevel === 'high');
    const mediumRiskMatches = matches.filter((m) => m.riskLevel === 'medium');

    let recommendation: 'clear' | 'review' | 'reject' = 'clear';
    let confidence = 1;

    if (aiAnalysis) {
      recommendation = aiAnalysis.recommendation;
      confidence = aiAnalysis.overallConfidence;
    } else if (highRiskMatches.length > 0) {
      recommendation = 'review';
      confidence = 0.5;
    } else if (mediumRiskMatches.length > 0) {
      recommendation = 'review';
      confidence = 0.7;
    } else if (matches.length > 0) {
      recommendation = 'review';
      confidence = 0.85;
    }

    // Auto-clear if confidence is above threshold and recommendation is clear
    const shouldAutoClear = recommendation === 'clear' && confidence >= autoClearThreshold;

    if (shouldAutoClear) {
      await updateOrderConflictStatus(
        supabase,
        orderId,
        false,
        true,
        'Auto-cleared: No conflicts detected'
      );

      await logAutomationAction(supabase, orderId, 'conflict_cleared', {
        matches: matches.length,
        confidence,
        autoCleared: true,
      });
    } else if (hasConflicts) {
      await updateOrderConflictStatus(
        supabase,
        orderId,
        true,
        false,
        `${matches.length} potential conflict(s) detected`
      );

      await logAutomationAction(supabase, orderId, 'conflict_detected', {
        matchCount: matches.length,
        highRisk: highRiskMatches.length,
        mediumRisk: mediumRiskMatches.length,
        recommendation,
        confidence,
      });

      // Create approval queue item for manual review
      await createConflictApproval(supabase, orderId, matches, recommendation, confidence);
    } else {
      // No conflicts but below auto-clear threshold
      await logAutomationAction(supabase, orderId, 'conflict_check_completed', {
        matches: 0,
        recommendation,
        confidence,
        awaitingApproval: true,
      });

      await createConflictApproval(supabase, orderId, [], recommendation, confidence);
    }

    const result: ConflictCheckResult = {
      orderId,
      hasConflicts,
      matches,
      recommendation,
      confidence,
      reasoning: aiAnalysis?.summary || generateReasoningSummary(matches),
      processingTimeMs: Date.now() - startTime,
    };

    return { success: true, data: result };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    await logAutomationAction(supabase, orderId, 'conflict_check_completed', {
      error: errorMessage,
    });

    return {
      success: false,
      error: errorMessage,
      code: 'CONFLICT_CHECK_ERROR',
    };
  }
}

/**
 * Clear conflicts for an order (manual override)
 */
export async function clearConflicts(
  orderId: string,
  clearedBy: string,
  reason: string
): Promise<OperationResult> {
  const supabase = await createClient();

  try {
    // Update order status
    await updateOrderConflictStatus(supabase, orderId, false, true, reason);

    // Mark all conflict matches as cleared
    await supabase
      .from('conflict_matches')
      .update({
        is_cleared: true,
        cleared_by: clearedBy,
        cleared_at: new Date().toISOString(),
        clear_reason: reason,
      })
      .eq('order_id', orderId)
      .eq('is_cleared', false);

    // Update any pending approval
    await supabase
      .from('approval_queue')
      .update({
        status: 'approved',
        reviewed_by: clearedBy,
        review_notes: reason,
        resolved_at: new Date().toISOString(),
      })
      .eq('order_id', orderId)
      .eq('approval_type', 'conflict_review')
      .eq('status', 'pending');

    await logAutomationAction(supabase, orderId, 'conflict_cleared', {
      clearedBy,
      reason,
      manual: true,
    });

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Flag an order as having a conflict (manual)
 */
export async function flagConflict(
  orderId: string,
  flaggedBy: string,
  reason: string
): Promise<OperationResult> {
  const supabase = await createClient();

  try {
    await updateOrderConflictStatus(supabase, orderId, true, false, reason);

    // Reject any pending approval
    await supabase
      .from('approval_queue')
      .update({
        status: 'rejected',
        reviewed_by: flaggedBy,
        review_notes: reason,
        resolved_at: new Date().toISOString(),
      })
      .eq('order_id', orderId)
      .eq('approval_type', 'conflict_review')
      .eq('status', 'pending');

    await logAutomationAction(supabase, orderId, 'conflict_detected', {
      flaggedBy,
      reason,
      manual: true,
    });

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Perform basic string matching without AI
 */
function performBasicMatching(
  parties: Array<{ party_name: string; party_name_normalized: string; party_role: string }>,
  historicalParties: HistoricalParty[],
  fuzzyThreshold: number
): ConflictMatchResult[] {
  const matches: ConflictMatchResult[] = [];

  for (const party of parties) {
    const normalized = normalizePartyName(party.party_name);

    for (const historical of historicalParties) {
      const historicalNormalized = normalizePartyName(historical.party_name);

      // Check for exact match
      if (normalized === historicalNormalized) {
        matches.push({
          partyName: party.party_name,
          matchedPartyName: historical.party_name,
          matchedOrderId: historical.order_id,
          matchedOrderNumber: historical.orders.order_number,
          matchedCaseCaption: historical.orders.case_caption,
          matchType: 'exact',
          similarityScore: 1,
          riskLevel: 'high',
          aiAnalysis: 'Exact name match detected',
        });
        continue;
      }

      // Check for fuzzy match
      const similarity = calculateSimilarity(normalized, historicalNormalized);
      if (similarity >= fuzzyThreshold) {
        const riskLevel: RiskLevel =
          similarity >= 0.95 ? 'high' : similarity >= 0.9 ? 'medium' : 'low';

        matches.push({
          partyName: party.party_name,
          matchedPartyName: historical.party_name,
          matchedOrderId: historical.order_id,
          matchedOrderNumber: historical.orders.order_number,
          matchedCaseCaption: historical.orders.case_caption,
          matchType: 'fuzzy',
          similarityScore: similarity,
          riskLevel,
          aiAnalysis: `Fuzzy match with ${Math.round(similarity * 100)}% similarity`,
        });
      }
    }
  }

  // Deduplicate matches (same party pair)
  const uniqueMatches = new Map<string, ConflictMatchResult>();
  for (const match of matches) {
    const key = `${match.partyName}:${match.matchedOrderId}:${match.matchedPartyName}`;
    const existing = uniqueMatches.get(key);
    if (!existing || match.similarityScore > existing.similarityScore) {
      uniqueMatches.set(key, match);
    }
  }

  return Array.from(uniqueMatches.values());
}

/**
 * Store conflict matches in database
 */
async function storeConflictMatches(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orderId: string,
  matches: ConflictMatchResult[]
): Promise<void> {
  const matchRecords = matches.map((m) => ({
    order_id: orderId,
    matched_order_id: m.matchedOrderId,
    party_name: m.partyName,
    matched_party_name: m.matchedPartyName,
    match_type: m.matchType,
    similarity_score: m.similarityScore,
    risk_level: m.riskLevel,
    ai_analysis: m.aiAnalysis,
    is_cleared: false,
  }));

  await supabase.from('conflict_matches').insert(matchRecords);
}

/**
 * Update order conflict status
 */
async function updateOrderConflictStatus(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orderId: string,
  flagged: boolean,
  cleared: boolean,
  notes: string
): Promise<void> {
  await supabase
    .from('orders')
    .update({
      conflict_flagged: flagged,
      conflict_cleared: cleared,
      conflict_notes: notes,
    })
    .eq('id', orderId);
}

/**
 * Create an approval queue item for conflict review
 */
async function createConflictApproval(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orderId: string,
  matches: ConflictMatchResult[],
  recommendation: 'clear' | 'review' | 'reject',
  confidence: number
): Promise<void> {
  const urgency =
    matches.some((m) => m.riskLevel === 'high')
      ? 'high'
      : matches.some((m) => m.riskLevel === 'medium')
      ? 'normal'
      : 'low';

  await supabase.from('approval_queue').insert({
    approval_type: 'conflict_review',
    order_id: orderId,
    request_details: {
      matchCount: matches.length,
      matches: matches.map((m) => ({
        partyName: m.partyName,
        matchedPartyName: m.matchedPartyName,
        matchedOrderNumber: m.matchedOrderNumber,
        matchType: m.matchType,
        riskLevel: m.riskLevel,
        similarityScore: m.similarityScore,
      })),
    },
    ai_recommendation: recommendation === 'clear' ? 'Clear - no conflicts' : 'Manual review required',
    ai_reasoning: generateReasoningSummary(matches),
    ai_confidence: confidence,
    urgency,
    expires_at: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(), // 48 hours
  });

  await logAutomationAction(supabase, orderId, 'approval_requested', {
    type: 'conflict_review',
    matchCount: matches.length,
    urgency,
  });
}

/**
 * Generate a human-readable summary of conflict matches
 */
function generateReasoningSummary(matches: ConflictMatchResult[]): string {
  if (matches.length === 0) {
    return 'No potential conflicts found in historical records.';
  }

  const highRisk = matches.filter((m) => m.riskLevel === 'high');
  const mediumRisk = matches.filter((m) => m.riskLevel === 'medium');
  const lowRisk = matches.filter((m) => m.riskLevel === 'low');

  const parts: string[] = [];

  if (highRisk.length > 0) {
    parts.push(`${highRisk.length} high-risk match(es)`);
  }
  if (mediumRisk.length > 0) {
    parts.push(`${mediumRisk.length} medium-risk match(es)`);
  }
  if (lowRisk.length > 0) {
    parts.push(`${lowRisk.length} low-risk match(es)`);
  }

  return `Found ${matches.length} potential conflict(s): ${parts.join(', ')}. Manual review recommended.`;
}

/**
 * Log an automation action
 */
async function logAutomationAction(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orderId: string | null,
  actionType: string,
  details: Record<string, unknown>
): Promise<void> {
  try {
    await supabase.from('automation_logs').insert({
      order_id: orderId,
      action_type: actionType,
      action_details: details,
      confidence_score: (details.confidence as number) || null,
      was_auto_approved: (details.autoCleared as boolean) || false,
    });
  } catch (error) {
    log.error('[Automation Log] Failed to log action:', error);
  }
}

/**
 * Get conflict matches for an order
 */
export async function getConflictMatches(
  orderId: string
): Promise<OperationResult<ConflictMatchResult[]>> {
  const supabase = await createClient();

  try {
    const { data, error } = await supabase
      .from('conflict_matches')
      .select(`
        *,
        matched_order:matched_order_id (
          order_number,
          case_caption,
          client_id
        )
      `)
      .eq('order_id', orderId)
      .order('risk_level', { ascending: false });

    if (error) throw error;

    interface ConflictMatchRow {
      party_name: string;
      matched_party_name: string;
      matched_order_id: string | null;
      matched_order?: { order_number: string; case_caption: string };
      match_type: string;
      similarity_score: number;
      risk_level: string;
      ai_analysis: string | null;
    }
    const matches: ConflictMatchResult[] = (data as ConflictMatchRow[] || []).map((m: ConflictMatchRow) => ({
      partyName: m.party_name,
      matchedPartyName: m.matched_party_name,
      matchedOrderId: m.matched_order_id || '',
      matchedOrderNumber: m.matched_order?.order_number || 'Unknown',
      matchedCaseCaption: m.matched_order?.case_caption || 'Unknown',
      matchType: m.match_type as MatchType,
      similarityScore: m.similarity_score,
      riskLevel: m.risk_level as RiskLevel,
      aiAnalysis: m.ai_analysis || '',
    }));

    return { success: true, data: matches };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
