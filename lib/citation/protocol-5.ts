/**
 * Protocol 5 — Statutory Reference Verification (SP-11 TASK-15)
 *
 * Mini Phase IV for new statutory references introduced during revision.
 * Runs after Phase VIII (revisions) and before Phase IX (supporting docs).
 *
 * Flow:
 * 1. Extract statutory citations from revised draft
 * 2. Load citation bank (Phase IV statute list)
 * 3. Identify NEW statutes not already in bank
 * 4. For each new statute, add to bank with 'protocol_5' source
 * 5. Return summary for orchestration logging
 *
 * This is a lightweight extraction + bank-sync check.
 * Full legislative DB verification is a future enhancement.
 */

import { extractStatutoryCitations, type StatutoryCitation } from './statutory-extractor';
import { getServiceSupabase } from '@/lib/supabase/admin';

// ============================================================================
// TYPES
// ============================================================================

export interface Protocol5Result {
  triggered: boolean;
  totalStatutesInDraft: number;
  existingInBank: number;
  newStatutesFound: number;
  newStatutes: Array<{
    raw: string;
    type: string;
    jurisdiction: string;
    article?: string;
    addedToBank: boolean;
  }>;
  warnings: string[];
}

// ============================================================================
// MAIN ENTRY
// ============================================================================

/**
 * Run Protocol 5 on the revised draft to catch new statutory references.
 *
 * @param revisedDraft - The motion text after Phase VIII revision
 * @param orderId - Order ID for bank lookup / update
 * @returns Protocol5Result with new statute details
 */
export async function runProtocol5(
  revisedDraft: string,
  orderId: string,
): Promise<Protocol5Result> {
  const warnings: string[] = [];

  // 1. Extract all statutory citations from revised draft
  const extraction = extractStatutoryCitations(revisedDraft);

  if (extraction.count === 0) {
    return {
      triggered: false,
      totalStatutesInDraft: 0,
      existingInBank: 0,
      newStatutesFound: 0,
      newStatutes: [],
      warnings: [],
    };
  }

  // 2. Load existing citation bank (inline, uses service-role for Inngest context)
  const supabase = getServiceSupabase();
  const { data: orderData } = await supabase
    .from('orders')
    .select('phase_outputs')
    .eq('id', orderId)
    .single();
  const phaseOutputs = (orderData?.phase_outputs || {}) as Record<string, unknown>;
  const phaseIV = (phaseOutputs['IV'] || {}) as Record<string, unknown>;
  const bankStatutes = ((phaseIV.statutoryCitationBank || []) as Array<{ citation: string }>);

  // Build a normalized lookup set from bank
  const bankNormalized = new Set(
    bankStatutes.map(s => normalizeStatute(s.citation)),
  );

  // 3. Identify NEW statutes not in bank
  const newStatutes: StatutoryCitation[] = [];
  let existingCount = 0;

  for (const statute of extraction.citations) {
    const normalized = normalizeStatute(statute.raw);
    if (bankNormalized.has(normalized)) {
      existingCount++;
    } else {
      newStatutes.push(statute);
    }
  }

  if (newStatutes.length === 0) {
    return {
      triggered: true,
      totalStatutesInDraft: extraction.count,
      existingInBank: existingCount,
      newStatutesFound: 0,
      newStatutes: [],
      warnings: [],
    };
  }

  console.log(
    `[Protocol5] Found ${newStatutes.length} new statutory reference(s) for order ${orderId}`,
  );

  // 4. Add new statutes to bank
  const results: Protocol5Result['newStatutes'] = [];

  for (const statute of newStatutes) {
    const added = await addStatuteToBank(statute, orderId);
    if (!added) {
      warnings.push(`Failed to add statute to bank: ${statute.raw}`);
    }
    results.push({
      raw: statute.raw,
      type: statute.type,
      jurisdiction: statute.jurisdiction,
      article: statute.article,
      addedToBank: added,
    });
  }

  console.log(
    `[Protocol5] Completed for order ${orderId}: ${results.filter(r => r.addedToBank).length}/${newStatutes.length} added to bank`,
  );

  return {
    triggered: true,
    totalStatutesInDraft: extraction.count,
    existingInBank: existingCount,
    newStatutesFound: newStatutes.length,
    newStatutes: results,
    warnings,
  };
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Normalize a statutory citation for comparison.
 * Strips whitespace variations, standardizes punctuation.
 */
function normalizeStatute(citation: string): string {
  return citation
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/§\s*/g, '§')
    .replace(/art(?:icle)?\.?\s*/gi, 'art. ')
    .replace(/sec(?:tion)?\.?\s*/gi, '§')
    .trim();
}

/**
 * Add a newly discovered statute to the citation bank in phase_outputs.
 */
async function addStatuteToBank(
  statute: StatutoryCitation,
  orderId: string,
): Promise<boolean> {
  try {
    const supabase = getServiceSupabase();

    const { data: order, error: fetchError } = await supabase
      .from('orders')
      .select('phase_outputs')
      .eq('id', orderId)
      .single();

    if (fetchError || !order) {
      console.error('[Protocol5] Failed to fetch order for bank update');
      return false;
    }

    const phaseOutputs = (order.phase_outputs || {}) as Record<string, unknown>;
    const phaseIV = (phaseOutputs['IV'] || {}) as Record<string, unknown>;
    const statutoryCitationBank = (phaseIV.statutoryCitationBank || []) as Array<
      Record<string, unknown>
    >;

    // Add new statute entry
    statutoryCitationBank.push({
      citation: statute.raw,
      name: `${statute.type} ${statute.article || ''}`.trim(),
      jurisdiction: statute.jurisdiction,
      currentAsOf: new Date().toISOString(),
      verificationStatus: 'pending',
      source: 'protocol_5',
    });

    phaseOutputs['IV'] = {
      ...phaseIV,
      statutoryCitationBank,
    };

    const { error: updateError } = await supabase
      .from('orders')
      .update({ phase_outputs: phaseOutputs })
      .eq('id', orderId);

    if (updateError) {
      console.error('[Protocol5] Failed to update bank:', updateError);
      return false;
    }

    return true;
  } catch (error) {
    console.error('[Protocol5] Error adding statute to bank:', error);
    return false;
  }
}
