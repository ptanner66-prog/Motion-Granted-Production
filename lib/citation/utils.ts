// ============================================================
// lib/citation/utils.ts — Confidence normalization
// Resolves both D9-018 and CIV-ST-001
// Source: D9 C-11 | SP-13 AO-11
//
// GPT-4 Turbo Stage 1 returns 0-100 scale.
// Opus Stage 2 returns 0-1 scale.
// Call IMMEDIATELY after receiving Stage 1 output, BEFORE any
// downstream consumer.
// ============================================================

import { createLogger } from '../logging/logger';

const logger = createLogger('citation-utils');

/**
 * Normalize confidence to 0-1 decimal range.
 *
 * - NaN → 0
 * - Negative → 0
 * - >100 → 1.0 (clamped)
 * - >1.0 → divide by 100 (GPT-4 Turbo Stage 1 scale)
 * - 0-1 → pass through (Opus Stage 2 or pre-normalized)
 */
export function normalizeConfidence(rawConfidence: number): number {
  if (isNaN(rawConfidence)) {
    logger.warn('protocol.confidence.clamped', { rawValue: rawConfidence, reason: 'NaN' });
    return 0;
  }
  if (rawConfidence < 0) {
    logger.warn('protocol.confidence.clamped', { rawValue: rawConfidence, reason: 'negative' });
    return 0;
  }
  if (rawConfidence > 100) {
    logger.warn('protocol.confidence.clamped', { rawValue: rawConfidence, reason: 'exceeds_100' });
    return 1.0;
  }
  if (rawConfidence > 1.0) {
    // GPT-4 Turbo Stage 1 returns 0-100 scale
    const normalized = rawConfidence / 100;
    logger.info('protocol.confidence.normalized', {
      rawValue: rawConfidence,
      normalizedValue: normalized,
    });
    return normalized;
  }
  // Already in 0-1 scale (Opus Stage 2 or pre-normalized)
  return rawConfidence;
}
