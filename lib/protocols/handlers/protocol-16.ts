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
  const missingFields: string[] = [];

  try {
    const requiredFields = getRequiredFields(
      context.verificationResult?.metadata?.motionType as string || '',
      'A' // Default to filing path
    );

    for (const field of requiredFields) {
      if (!field.required) continue;
      const value = context.verificationResult?.metadata?.[field.fieldName];
      if (!value || (typeof value === 'string' && !value.trim())) {
        missingFields.push(field.description);
      }
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
