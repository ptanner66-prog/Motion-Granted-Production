// ============================================================
// lib/protocols/persistence.ts
// Step 6.6 — Persist protocol results (crash-safe audit trail)
// Source: D9 B-2 | SP-13 AN-2
//
// Uses ON CONFLICT DO NOTHING for idempotent Inngest step retries.
// Empty results (all EVALUATED_CLEAN) are still persisted — proves
// protocols ran and found nothing.
// ============================================================

import { createHash } from 'crypto';
import { createLogger } from '../logging/logger';
import type { ProtocolResult } from './types';

const logger = createLogger('protocol-persistence');
const ORDER_LEVEL_SENTINEL = '00000000-0000-0000-0000-000000000000';
const BATCH_SIZE = 100;

export async function persistProtocolResults(
  supabase: { from: (table: string) => { upsert: (rows: unknown[], opts?: unknown) => Promise<{ error: { message: string } | null }> } },
  orderId: string,
  phase: string,
  results: ProtocolResult[],
  citationId: string
): Promise<void> {
  const effectiveCitationId = citationId || ORDER_LEVEL_SENTINEL;

  // Process in batches to avoid Supabase request size limits
  for (let i = 0; i < results.length; i += BATCH_SIZE) {
    const batch = results.slice(i, i + BATCH_SIZE);
    const rows = batch.map(result => {
      const inputHash = createHash('sha256')
        .update(JSON.stringify({
          citationId: effectiveCitationId,
          phase,
          status: result.triggered ? result.severity : 'CLEAN',
        }))
        .digest('hex');

      return {
        order_id: orderId,
        phase,
        protocol_number: result.protocolNumber,
        citation_id: effectiveCitationId,
        triggered: result.triggered,
        severity: result.severity,
        action_taken: result.actionTaken,
        ais_entry: result.aisEntry,
        handler_version: result.handlerVersion || '1.0.0',
        input_hash: inputHash,
      };
    });

    const { error } = await supabase
      .from('protocol_results')
      .upsert(rows, {
        onConflict: 'order_id,phase,protocol_number,citation_id',
        ignoreDuplicates: true,
      });

    if (error) {
      logger.error('Failed to persist protocol results batch', {
        orderId,
        phase,
        batchIndex: i,
        batchSize: batch.length,
        error: error.message,
      });
      throw error; // Let Inngest retry the step
    }
  }

  logger.info('protocol.persistence.completed', {
    orderId,
    phase,
    citationId: effectiveCitationId,
    resultCount: results.length,
  });
}
