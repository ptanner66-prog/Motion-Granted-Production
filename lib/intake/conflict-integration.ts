// /lib/intake/conflict-integration.ts
// Wire conflict check into intake/checkout flow
// VERSION: 1.0 — January 28, 2026

import { createClient } from '@/lib/supabase/server';
import { checkForConflicts } from '@/lib/services/conflict/conflict-check-service';
import { createLogger } from '@/lib/security/logger';
import { updateOrderColumns } from '@/lib/orders/update-columns';
import type { IntakeConflictCheckRequest, IntakeConflictCheckResult } from '@/types/conflict';

const log = createLogger('conflict-integration');

export interface IntakeParties {
  plaintiffs: string[];
  defendants: string[];
  attorneySide: 'PLAINTIFF' | 'DEFENDANT';
}

export interface PrePaymentCheckResult {
  canProceed: boolean;
  conflictResult?: IntakeConflictCheckResult;
  blockReason?: string;
  requiresReview?: boolean;
}

/**
 * Run conflict check before allowing payment
 * Called from checkout flow after order is created but before payment
 */
export async function runPrePaymentConflictCheck(
  orderId: string,
  caseNumber: string,
  jurisdiction: string,
  parties: IntakeParties,
  userId: string
): Promise<PrePaymentCheckResult> {
  // Build conflict check request
  const request: IntakeConflictCheckRequest = {
    orderId,
    caseNumber,
    jurisdiction,
    plaintiffs: parties.plaintiffs,
    defendants: parties.defendants,
    attorneyUserId: userId,
    attorneySide: parties.attorneySide,
  };

  // Run conflict check
  const result = await checkForConflicts(request);

  // Update order with conflict status
  const supabase = await createClient();
  await updateOrderColumns(supabase, orderId, {
    conflict_status: result.action === 'PROCEED' ? 'clear' :
                     result.action === 'BLOCK' ? 'rejected' : 'pending_review',
    plaintiffs: parties.plaintiffs,
    defendants: parties.defendants,
    attorney_side: parties.attorneySide,
  }, 'pre-payment-conflict-check');

  // Determine if order can proceed to payment
  switch (result.action) {
    case 'PROCEED':
      log.info('Order cleared - no conflicts', { orderId });
      return { canProceed: true, conflictResult: result };

    case 'REVIEW':
      log.info('Order needs review - soft conflict', { orderId });
      return {
        canProceed: false,
        conflictResult: result,
        requiresReview: true,
        blockReason: 'This order requires manual review due to a potential conflict of interest. Our team will review within 24 hours.',
      };

    case 'BLOCK':
      log.warn('Order blocked - hard conflict', { orderId });
      return {
        canProceed: false,
        conflictResult: result,
        blockReason: 'We cannot accept this order due to a conflict of interest. We have previously worked on the opposing side of this matter.',
      };

    default:
      return { canProceed: true, conflictResult: result };
  }
}

/**
 * Validate party information before conflict check
 */
export function validateParties(parties: IntakeParties): { valid: boolean; error?: string } {
  if (!parties.attorneySide) {
    return { valid: false, error: 'Please indicate which side you represent (Plaintiff or Defendant)' };
  }

  if (!['PLAINTIFF', 'DEFENDANT'].includes(parties.attorneySide)) {
    return { valid: false, error: 'Invalid attorney side selection' };
  }

  if (parties.plaintiffs.length === 0 && parties.defendants.length === 0) {
    return { valid: false, error: 'Please enter at least one party name' };
  }

  // Validate party names aren't empty strings
  const emptyPlaintiffs = parties.plaintiffs.some(p => !p.trim());
  const emptyDefendants = parties.defendants.some(d => !d.trim());

  if (emptyPlaintiffs || emptyDefendants) {
    return { valid: false, error: 'Party names cannot be empty' };
  }

  return { valid: true };
}

/**
 * Parse party string into array (handles comma-separated input)
 */
export function parsePartyInput(input: string): string[] {
  if (!input) return [];

  return input
    .split(/[,;]/)
    .map(p => p.trim())
    .filter(p => p.length > 0);
}
