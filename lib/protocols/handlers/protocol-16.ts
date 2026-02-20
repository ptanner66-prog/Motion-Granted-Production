// ============================================================
// lib/protocols/handlers/protocol-16.ts
// Protocol 16 — Required Fields Matrix
// Source: D9 C-9 | SP-13 AO-9
// ============================================================

import { createLogger } from '../../logging/logger';
import { getRequiredFields } from '../../config/required-fields';
import type { ProtocolContext, ProtocolResult } from '../types';

const logger = createLogger('protocol-16');
export const VERSION = '1.0.0';

export async function handleProtocol16(
  context: ProtocolContext
): Promise<ProtocolResult> {
  // Protocol 16 checks required fields at the order level, not citation level.
  // Only evaluate once per phase (use order-level sentinel from dispatcher).

  // T-21: Guard against false positives — P16 receives citation-level context
  // from the dispatcher, but order-level fields (case_name, case_number, etc.)
  // only exist when the metadata has been enriched with order-level data.
  // If motionType is absent, we're operating on citation-level metadata
  // where required-field checks produce false positives.
  const metadata = context.verificationResult?.metadata;
  if (!metadata?.motionType) {
    return {
      protocolNumber: 16,
      triggered: false,
      severity: null,
      actionTaken: null,
      aisEntry: null,
      holdRequired: false,
      handlerVersion: VERSION,
    };
  }

  const missingFields: string[] = [];

  try {
    const requiredFields = getRequiredFields(
      metadata.motionType as string || '',
      'A' // Default to filing path
    );

    for (const field of requiredFields) {
      if (!field.required) continue;
      const value = metadata[field.fieldName];
      // T-21: Tighten value check — only flag truly absent/empty values.
      // !value caught 0, false, empty arrays as "missing" (false positives).
      if (value === null || value === undefined) {
        missingFields.push(field.description);
      } else if (typeof value === 'string' && value.trim().length === 0) {
        missingFields.push(field.description);
      }
      // Numbers, booleans, objects, arrays are valid field values
    }
  } catch (error) {
    logger.error('protocol.p16.field_check_error', {
      orderId: context.orderId,
      error: error instanceof Error ? error.message : String(error),
    });
    // On error, don't trigger — fail open for P16
    return {
      protocolNumber: 16,
      triggered: false,
      severity: null,
      actionTaken: null,
      aisEntry: null,
      holdRequired: false,
      handlerVersion: VERSION,
    };
  }

  if (missingFields.length === 0) {
    return {
      protocolNumber: 16,
      triggered: false,
      severity: null,
      actionTaken: null,
      aisEntry: null,
      holdRequired: false,
      handlerVersion: VERSION,
    };
  }

  logger.info('protocol.p16.missing_fields', {
    orderId: context.orderId,
    missingCount: missingFields.length,
  });

  return {
    protocolNumber: 16,
    triggered: true,
    severity: missingFields.length >= 3 ? 'WARNING' : 'INFO',
    actionTaken: 'MISSING_FIELDS_DETECTED',
    aisEntry: {
      category: 'QUALITY',
      protocolNumber: 16,
      severity: missingFields.length >= 3 ? 'WARNING' : 'INFO',
      title: 'Required Fields Missing',
      description: `${missingFields.length} required field(s) are missing: ${missingFields.join(', ')}.`,
      recommendation: 'Verify all required fields are populated before filing.',
    },
    holdRequired: false,
    handlerVersion: VERSION,
  };
}
