// ============================================================
// lib/protocols/feature-flags.ts
// Protocol feature flags with MAX_DISABLED=5 guardrail
// Source: D9 B-3 | SP-13 AN-3
//
// Controls which protocols are evaluated during dispatch.
// All protocols enabled by default. Override via DISABLED_PROTOCOLS env var.
// Guardrail: max 5 protocols can be disabled simultaneously.
// ============================================================

import { createLogger } from '../logging/logger';

const logger = createLogger('protocol-flags');

const MAX_DISABLED_PROTOCOLS = 5;
const VALID_PROTOCOL_RANGE = { min: 1, max: 23 };

export interface ProtocolFlags {
  [protocolNumber: number]: boolean; // true = enabled, false = disabled
}

export function getProtocolFlags(): ProtocolFlags {
  const flags: ProtocolFlags = {};

  // Default: all enabled
  for (let i = VALID_PROTOCOL_RANGE.min; i <= VALID_PROTOCOL_RANGE.max; i++) {
    flags[i] = true;
  }

  // A-033: Unify env var names — check both server-only and NEXT_PUBLIC_ variants
  const envValue = process.env.DISABLED_PROTOCOLS || process.env.NEXT_PUBLIC_DISABLED_PROTOCOLS || '';
  if (!envValue.trim()) return flags;

  // Parse strictly: only comma-separated integers 1-23
  const rawTokens = envValue.split(',').map((s: string) => s.trim()).filter((s: string) => s.length > 0);
  const invalidTokens = rawTokens.filter((s: string) => {
    const n = parseInt(s, 10);
    return isNaN(n) || n < VALID_PROTOCOL_RANGE.min || n > VALID_PROTOCOL_RANGE.max;
  });

  if (invalidTokens.length > 0) {
    logger.error('DISABLED_PROTOCOLS contains invalid tokens — ignoring entire override', {
      invalidTokens: invalidTokens.join(','),
      rawValue: envValue,
    });
    return flags; // All enabled
  }

  const parsed = rawTokens.map((s: string) => parseInt(s.trim(), 10));

  // Guardrail: reject if too many disabled
  if (parsed.length > MAX_DISABLED_PROTOCOLS) {
    logger.error('DISABLED_PROTOCOLS exceeds MAX_DISABLED_PROTOCOLS — ignoring entire override', {
      count: parsed.length,
      max: MAX_DISABLED_PROTOCOLS,
      rawValue: envValue,
    });
    return flags; // All enabled
  }

  // Apply overrides
  for (const n of parsed) {
    flags[n] = false;
    logger.warn('Protocol disabled via ENV override', { protocolNumber: n });
  }

  return flags;
}
