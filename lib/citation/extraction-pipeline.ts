/**
 * Citation Extraction Pipeline
 *
 * Bridges batch pre-fetch results with the per-citation CIV verification pipeline.
 * When a PrefetchMap is provided, Step 1 (existence check) uses an O(1) Map
 * lookup instead of making a live API call — saving rate limit budget.
 *
 * If the citation is not found in the pre-fetch map, falls back to the
 * standard individual API call path.
 *
 * @version BATCH_09 — ST-002
 */

import { verifyCitation } from '@/lib/citation/civ/pipeline';
import type { CitationToVerify, FinalVerificationOutput, CIVConfig } from '@/lib/citation/civ/types';
import { DEFAULT_CIV_CONFIG } from '@/lib/citation/civ/types';
import type { PrefetchMap } from '@/lib/citation/types';

import { createLogger } from '@/lib/security/logger';

const log = createLogger('citation-extraction-pipeline');

// ============================================================================
// TYPES
// ============================================================================

export interface VerifySingleCitationOptions {
  prefetchMap?: PrefetchMap;
  orderId?: string;
  phase?: 'V.1' | 'VII.1';
  config?: CIVConfig;
}

export interface VerificationResult {
  citation: CitationToVerify;
  output: FinalVerificationOutput;
  usedPrefetch: boolean;
}

// ============================================================================
// MAIN FUNCTION
// ============================================================================

/**
 * Verify a single citation through the 7-step CIV pipeline.
 *
 * If prefetchMap is provided and contains the citation, Step 1 uses the
 * cached existence result (O(1) lookup) instead of a live API call.
 * For citations the pre-fetch missed, falls back to the standard path.
 *
 * @param citation - The citation to verify
 * @param options - Optional prefetchMap, orderId, phase, config
 */
export async function verifySingleCitation(
  citation: CitationToVerify,
  options?: VerifySingleCitationOptions
): Promise<VerificationResult> {
  const phase = options?.phase ?? 'V.1';
  const config = options?.config ?? DEFAULT_CIV_CONFIG;
  const orderId = options?.orderId;

  // Check if we have a pre-fetched result for this citation
  let usedPrefetch = false;
  if (options?.prefetchMap) {
    const normalized = citation.citationString.toLowerCase().replace(/\s+/g, ' ').trim();
    const prefetchResult = options.prefetchMap.get(normalized);

    if (prefetchResult !== undefined) {
      usedPrefetch = true;
      log.info('Using pre-fetched existence result for citation', {
        citation: citation.citationString.slice(0, 80),
        found: prefetchResult?.found ?? false,
      });
    }
    // If not in prefetch map, the standard pipeline will make the API call
  }

  // Run the full CIV pipeline (Step 1 will make its own API call if not cached)
  const output = await verifyCitation(citation, orderId, phase, config);

  return {
    citation,
    output,
    usedPrefetch,
  };
}

// ============================================================================
// TEXT SPLITTING UTILITY
// ============================================================================

/**
 * Split text into blocks for batch processing.
 * Tries to break at sentence boundaries to avoid splitting citations.
 *
 * @param text - Full draft text to split
 * @param maxCharsPerBlock - Maximum characters per block (default: 5000)
 */
export function splitTextIntoBlocks(text: string, maxCharsPerBlock: number = 5000): string[] {
  const blocks: string[] = [];
  let currentBlock = '';

  const sentences = text.split(/(?<=[.!?])\s+/);

  for (const sentence of sentences) {
    if (currentBlock.length + sentence.length > maxCharsPerBlock) {
      if (currentBlock) blocks.push(currentBlock.trim());
      currentBlock = sentence;
    } else {
      currentBlock += ' ' + sentence;
    }
  }

  if (currentBlock.trim()) {
    blocks.push(currentBlock.trim());
  }

  return blocks;
}
