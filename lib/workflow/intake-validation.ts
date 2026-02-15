/**
 * INTAKE VALIDATION — Phase I Hardening
 *
 * TASK-02: Mandatory fields MUST trigger HOLD if empty.
 * These fields are required for signature block, certificate of service,
 * and caption under Louisiana and California court rules.
 *
 * Mandatory fields:
 * - bar_number
 * - firm_name
 * - firm_address
 * - firm_phone
 *
 * Audit Evidence (Pelican order):
 * All four fields were empty. Phase I validated as complete: true.
 * Empty fields propagated through 10 phases as placeholders and
 * triggered Phase X block after 21+ minutes of compute.
 *
 * @module intake-validation
 */

import { triggerHold } from './hold-service';
import { createLogger } from '@/lib/security/logger';
import type { Phase } from '@/lib/config/workflow-config';

const log = createLogger('workflow-intake-validation');

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Fields that MUST be present for a valid filing.
 * If ANY are empty, Phase I returns complete: false and triggers HOLD.
 */
const MANDATORY_FIELDS = [
  'bar_number',
  'firm_name',
  'firm_address',
  'firm_phone',
] as const;

type MandatoryField = typeof MANDATORY_FIELDS[number];

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface MandatoryFieldData {
  bar_number?: string;
  firm_name?: string;
  firm_address?: string;
  firm_phone?: string;
  [key: string]: unknown;
}

export interface MandatoryFieldValidationResult {
  complete: boolean;
  missingFields: MandatoryField[];
  holdTriggered: boolean;
  holdReason?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// VALIDATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Human-readable labels for mandatory fields.
 */
const FIELD_LABELS: Record<MandatoryField, string> = {
  bar_number: 'Bar Number',
  firm_name: 'Firm Name',
  firm_address: 'Firm Address',
  firm_phone: 'Firm Phone',
};

/**
 * Validate intake data for mandatory fields.
 *
 * ⚠️ Returns complete: false if ANY mandatory field is empty.
 * This triggers a HOLD that prevents the pipeline from proceeding.
 *
 * @param intakeData - The customer intake data (must include mandatory fields)
 * @param orderId - The order ID for HOLD tracking
 * @returns Validation result with missing fields and HOLD status
 */
export async function validateMandatoryFields(
  intakeData: MandatoryFieldData,
  orderId: string
): Promise<MandatoryFieldValidationResult> {
  const missingFields: MandatoryField[] = [];

  // Check each mandatory field
  for (const field of MANDATORY_FIELDS) {
    const value = intakeData[field];

    if (!value || (typeof value === 'string' && value.trim() === '')) {
      missingFields.push(field);
    }
  }

  // If all fields present, return valid
  if (missingFields.length === 0) {
    return {
      complete: true,
      missingFields: [],
      holdTriggered: false,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // TRIGGER HOLD — Missing mandatory fields
  // ═══════════════════════════════════════════════════════════════════════

  const missingFieldLabels = missingFields.map(f => FIELD_LABELS[f]);

  const holdReason = `MISSING_MANDATORY_FIELDS: ${missingFieldLabels.join(', ')}. ` +
    `These fields are required for the signature block and certificate of service.`;

  log.warn('[INTAKE-VALIDATION] Triggering HOLD for missing mandatory fields', {
    orderId,
    missingFields,
  });

  // Trigger HOLD using the hold-service (follows 24hr/72hr/7-day escalation)
  const holdPhase: Phase = 'I';
  await triggerHold(orderId, holdPhase, holdReason);

  return {
    complete: false,
    missingFields,
    holdTriggered: true,
    holdReason,
  };
}

/**
 * Release a HOLD when missing fields are provided.
 * Re-validates before releasing.
 */
export async function validateAndReleaseHold(
  intakeData: MandatoryFieldData,
  orderId: string
): Promise<MandatoryFieldValidationResult> {
  // Re-check mandatory fields (don't trigger another HOLD, just validate)
  const missingFields: MandatoryField[] = [];

  for (const field of MANDATORY_FIELDS) {
    const value = intakeData[field];
    if (!value || (typeof value === 'string' && value.trim() === '')) {
      missingFields.push(field);
    }
  }

  if (missingFields.length === 0) {
    log.info('[INTAKE-VALIDATION] HOLD released — all mandatory fields provided', {
      orderId,
    });

    return {
      complete: true,
      missingFields: [],
      holdTriggered: false,
    };
  }

  return {
    complete: false,
    missingFields,
    holdTriggered: true,
    holdReason: `Still missing: ${missingFields.map(f => FIELD_LABELS[f]).join(', ')}`,
  };
}
