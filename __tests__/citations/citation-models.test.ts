/**
 * CIV-013: Unit tests for citation-models.ts
 *
 * Tests the single source of truth for citation verification model routing.
 * Per Clay's Part C §3 — BINDING specification.
 */

import {
  getCitationModel,
  getCitationModelWithLogging,
  isHighStakes,
  resolveTiebreaker,
  getAuthorityLevel,
  CITATION_THRESHOLDS,
  CITATION_GPT_MODELS,
  PROTOCOL_7_THRESHOLDS,
  CITATION_BATCH_SIZES,
  CIV_BATCH_SIZE,
  CITATION_HARD_STOP_MINIMUM,
  RELEVANCE_WEIGHTS,
  FLAG_SEVERITY,
  VERIFIED_STATUSES,
  LOUISIANA_AUTHORITY_MATRIX,
  type Tier,
  type CitationStep,
} from '@/lib/config/citation-models';
import { MODELS } from '@/lib/config/models';

// ============================================================================
// getCitationModel TESTS
// ============================================================================

describe('getCitationModel', () => {
  describe('Step 1 (Existence Check)', () => {
    it('returns no AI model for any tier', () => {
      for (const tier of ['A', 'B', 'C'] as Tier[]) {
        const config = getCitationModel(1, tier);
        expect(config.isAI).toBe(false);
        expect(config.provider).toBe('none');
        expect(config.model).toBe('none');
      }
    });
  });

  describe('Step 2 (Holding Verification)', () => {
    it('returns GPT-4o for Tier A Stage 1', () => {
      const config = getCitationModel(2, 'A', 'stage_1');
      expect(config.model).toBe(CITATION_GPT_MODELS.STAGE_1_DEFAULT);
      expect(config.provider).toBe('openai');
      expect(config.isAI).toBe(true);
    });

    it('returns GPT-4o for Tier B Stage 1', () => {
      const config = getCitationModel(2, 'B', 'stage_1');
      expect(config.model).toBe(CITATION_GPT_MODELS.STAGE_1_DEFAULT);
      expect(config.provider).toBe('openai');
    });

    it('returns GPT-4o (fallback) for Tier C Stage 1', () => {
      const config = getCitationModel(2, 'C', 'stage_1');
      expect(config.model).toBe(CITATION_GPT_MODELS.STAGE_1_TIER_C);
      expect(config.provider).toBe('openai');
    });

    it('returns Opus for Stage 2 (all tiers)', () => {
      for (const tier of ['A', 'B', 'C'] as Tier[]) {
        const config = getCitationModel(2, tier, 'stage_2');
        expect(config.model).toBe(MODELS.OPUS);
        expect(config.provider).toBe('anthropic');
      }
    });

    it('returns GPT-4o for tiebreaker', () => {
      const config = getCitationModel(2, 'B', 'tiebreaker');
      expect(config.model).toBe(CITATION_GPT_MODELS.TIEBREAKER);
      expect(config.provider).toBe('openai');
    });

    it('defaults to stage_1 when no stage specified', () => {
      const config = getCitationModel(2, 'A');
      expect(config.provider).toBe('openai');
    });
  });

  describe('Steps 3-5 (Haiku/Sonnet)', () => {
    it('returns Haiku for Tier A/B', () => {
      for (const step of [3, 4, 5] as CitationStep[]) {
        for (const tier of ['A', 'B'] as Tier[]) {
          const config = getCitationModel(step, tier);
          expect(config.model).toBe(MODELS.HAIKU);
          expect(config.provider).toBe('anthropic');
        }
      }
    });

    it('returns Sonnet for Tier C', () => {
      for (const step of [3, 4, 5] as CitationStep[]) {
        const config = getCitationModel(step, 'C');
        expect(config.model).toBe(MODELS.SONNET);
        expect(config.provider).toBe('anthropic');
      }
    });
  });

  describe('Steps 6-7 (No AI)', () => {
    it('returns no AI model', () => {
      for (const step of [6, 7] as CitationStep[]) {
        for (const tier of ['A', 'B', 'C'] as Tier[]) {
          const config = getCitationModel(step, tier);
          expect(config.isAI).toBe(false);
          expect(config.provider).toBe('none');
        }
      }
    });
  });

  it('throws on invalid step', () => {
    expect(() => getCitationModel(8 as CitationStep, 'A')).toThrow();
  });
});

// ============================================================================
// isHighStakes TESTS
// ============================================================================

describe('isHighStakes', () => {
  const baseInput = {
    propositionType: 'SECONDARY' as const,
    motionTier: 'B' as Tier,
    isSoleAuthority: false,
    caseAge: 5,
    citationsDeclining: false,
    hasNegativeTreatment: false,
  };

  it('returns false when no conditions met', () => {
    const result = isHighStakes(baseInput);
    expect(result.isHighStakes).toBe(false);
    expect(result.triggeredRules).toHaveLength(0);
  });

  it('triggers Rule 1 for PRIMARY_STANDARD', () => {
    const result = isHighStakes({ ...baseInput, propositionType: 'PRIMARY_STANDARD' });
    expect(result.isHighStakes).toBe(true);
    expect(result.triggeredRules).toContain(1);
  });

  it('triggers Rule 2 for DISPOSITIVE_ELEMENT', () => {
    const result = isHighStakes({ ...baseInput, propositionType: 'DISPOSITIVE_ELEMENT' });
    expect(result.isHighStakes).toBe(true);
    expect(result.triggeredRules).toContain(2);
  });

  it('triggers Rule 3 for Tier C', () => {
    const result = isHighStakes({ ...baseInput, motionTier: 'C' });
    expect(result.isHighStakes).toBe(true);
    expect(result.triggeredRules).toContain(3);
  });

  it('triggers Rule 4 for sole authority', () => {
    const result = isHighStakes({ ...baseInput, isSoleAuthority: true });
    expect(result.isHighStakes).toBe(true);
    expect(result.triggeredRules).toContain(4);
  });

  it('triggers Rule 5 for old declining authority', () => {
    const result = isHighStakes({ ...baseInput, caseAge: 35, citationsDeclining: true });
    expect(result.isHighStakes).toBe(true);
    expect(result.triggeredRules).toContain(5);
  });

  it('does NOT trigger Rule 5 for old but non-declining', () => {
    const result = isHighStakes({ ...baseInput, caseAge: 35, citationsDeclining: false });
    expect(result.triggeredRules).not.toContain(5);
  });

  it('triggers Rule 6 for negative treatment', () => {
    const result = isHighStakes({ ...baseInput, hasNegativeTreatment: true });
    expect(result.isHighStakes).toBe(true);
    expect(result.triggeredRules).toContain(6);
  });

  it('can trigger multiple rules simultaneously', () => {
    const result = isHighStakes({
      propositionType: 'PRIMARY_STANDARD',
      motionTier: 'C',
      isSoleAuthority: true,
      caseAge: 5,
      citationsDeclining: false,
      hasNegativeTreatment: false,
    });
    expect(result.triggeredRules).toContain(1);
    expect(result.triggeredRules).toContain(3);
    expect(result.triggeredRules).toContain(4);
    expect(result.triggeredRules.length).toBe(3);
  });
});

// ============================================================================
// resolveTiebreaker TESTS
// ============================================================================

describe('resolveTiebreaker', () => {
  it('returns VERIFIED when both stages approve (≥95%)', () => {
    const result = resolveTiebreaker(0.96, true, false);
    expect(result.result).toBe('VERIFIED');
  });

  it('returns NEEDS_REVIEW when Stage 1 approves but Stage 2 rejects', () => {
    const result = resolveTiebreaker(0.96, false, false);
    expect(result.result).toBe('NEEDS_REVIEW');
  });

  it('returns VERIFIED_WITH_NOTES when uncertain + Stage 2 approves', () => {
    const result = resolveTiebreaker(0.88, true, false);
    expect(result.result).toBe('VERIFIED_WITH_NOTES');
  });

  it('returns NEEDS_REVIEW when uncertain + Stage 2 rejects', () => {
    const result = resolveTiebreaker(0.88, false, false);
    expect(result.result).toBe('NEEDS_REVIEW');
  });

  it('returns HOLDING_MISMATCH when Stage 1 fails (<80%)', () => {
    const result = resolveTiebreaker(0.75, true, false);
    expect(result.result).toBe('HOLDING_MISMATCH');
  });

  it('returns HOLDING_MISMATCH regardless of Stage 2 when below fail threshold', () => {
    const result = resolveTiebreaker(0.50, true, true);
    expect(result.result).toBe('HOLDING_MISMATCH');
  });
});

// ============================================================================
// THRESHOLD VALIDATION TESTS
// ============================================================================

describe('CITATION_THRESHOLDS', () => {
  it('HOLDING_PASS is 0.95', () => {
    expect(CITATION_THRESHOLDS.HOLDING_PASS).toBe(0.95);
  });

  it('HOLDING_STAGE_2 is 0.80', () => {
    expect(CITATION_THRESHOLDS.HOLDING_STAGE_2).toBe(0.80);
  });

  it('HOLDING_FAIL is 0.80', () => {
    expect(CITATION_THRESHOLDS.HOLDING_FAIL).toBe(0.80);
  });

  it('HOLDING_PASS >= HOLDING_STAGE_2 >= HOLDING_FAIL', () => {
    expect(CITATION_THRESHOLDS.HOLDING_PASS).toBeGreaterThanOrEqual(CITATION_THRESHOLDS.HOLDING_STAGE_2);
    expect(CITATION_THRESHOLDS.HOLDING_STAGE_2).toBeGreaterThanOrEqual(CITATION_THRESHOLDS.HOLDING_FAIL);
  });
});

// ============================================================================
// PROTOCOL 7 THRESHOLD TESTS
// ============================================================================

describe('PROTOCOL_7_THRESHOLDS', () => {
  it('has correct values per tier', () => {
    expect(PROTOCOL_7_THRESHOLDS.A).toBe(2);
    expect(PROTOCOL_7_THRESHOLDS.B).toBe(4);
    expect(PROTOCOL_7_THRESHOLDS.C).toBe(6);
  });

  it('thresholds increase with tier complexity', () => {
    expect(PROTOCOL_7_THRESHOLDS.A).toBeLessThan(PROTOCOL_7_THRESHOLDS.B);
    expect(PROTOCOL_7_THRESHOLDS.B).toBeLessThan(PROTOCOL_7_THRESHOLDS.C);
  });
});

// ============================================================================
// BATCH SIZE TESTS
// ============================================================================

describe('CITATION_BATCH_SIZES', () => {
  it('has correct values per tier', () => {
    expect(CITATION_BATCH_SIZES.A).toBe(5);
    expect(CITATION_BATCH_SIZES.B).toBe(4);
    expect(CITATION_BATCH_SIZES.C).toBe(3);
  });

  it('batch sizes decrease with tier complexity', () => {
    expect(CITATION_BATCH_SIZES.A).toBeGreaterThan(CITATION_BATCH_SIZES.B);
    expect(CITATION_BATCH_SIZES.B).toBeGreaterThan(CITATION_BATCH_SIZES.C);
  });
});

describe('Constants', () => {
  it('CIV_BATCH_SIZE is 2', () => {
    expect(CIV_BATCH_SIZE).toBe(2);
  });

  it('CITATION_HARD_STOP_MINIMUM is 4', () => {
    expect(CITATION_HARD_STOP_MINIMUM).toBe(4);
  });
});

// ============================================================================
// RELEVANCE WEIGHTS TESTS
// ============================================================================

describe('RELEVANCE_WEIGHTS', () => {
  it('weights sum to 1.0', () => {
    const total = RELEVANCE_WEIGHTS.KEYWORD_MATCH +
      RELEVANCE_WEIGHTS.COURT_WEIGHT +
      RELEVANCE_WEIGHTS.RECENCY;
    expect(Math.abs(total - 1.0)).toBeLessThan(0.001);
  });

  it('has correct individual values', () => {
    expect(RELEVANCE_WEIGHTS.KEYWORD_MATCH).toBe(0.40);
    expect(RELEVANCE_WEIGHTS.COURT_WEIGHT).toBe(0.30);
    expect(RELEVANCE_WEIGHTS.RECENCY).toBe(0.30);
  });
});

// ============================================================================
// AUTHORITY LEVEL TESTS (CIV-009)
// ============================================================================

describe('getAuthorityLevel', () => {
  it('SCOTUS is binding in both contexts', () => {
    expect(getAuthorityLevel('scotus', 'STATE')).toBe('BINDING');
    expect(getAuthorityLevel('scotus', 'FEDERAL')).toBe('BINDING');
  });

  it('LA Supreme Court is binding in both contexts', () => {
    expect(getAuthorityLevel('la', 'STATE')).toBe('BINDING');
    expect(getAuthorityLevel('la', 'FEDERAL')).toBe('BINDING');
  });

  it('Fifth Circuit is binding federal, persuasive state', () => {
    expect(getAuthorityLevel('ca5', 'FEDERAL')).toBe('BINDING');
    expect(getAuthorityLevel('ca5', 'STATE')).toBe('PERSUASIVE');
  });

  it('unknown courts default to PERSUASIVE', () => {
    expect(getAuthorityLevel('unknown_court', 'STATE')).toBe('PERSUASIVE');
    expect(getAuthorityLevel('unknown_court', 'FEDERAL')).toBe('PERSUASIVE');
  });
});

// ============================================================================
// FLAG SEVERITY TESTS
// ============================================================================

describe('FLAG_SEVERITY', () => {
  it('OVERRULED is BLOCK severity', () => {
    expect(FLAG_SEVERITY.OVERRULED).toBe('BLOCK');
  });

  it('HOLDING_MISMATCH is BLOCK severity', () => {
    expect(FLAG_SEVERITY.HOLDING_MISMATCH).toBe('BLOCK');
  });

  it('DICTA_OVERRELIANCE is FLAG severity', () => {
    expect(FLAG_SEVERITY.DICTA_OVERRELIANCE).toBe('FLAG');
  });

  it('AMENDED_OPINION is NOTE severity', () => {
    expect(FLAG_SEVERITY.AMENDED_OPINION).toBe('NOTE');
  });
});

// ============================================================================
// VERIFIED STATUSES TESTS
// ============================================================================

describe('VERIFIED_STATUSES', () => {
  it('includes VERIFIED and VERIFIED_WITH_NOTES', () => {
    expect(VERIFIED_STATUSES).toContain('VERIFIED');
    expect(VERIFIED_STATUSES).toContain('VERIFIED_WITH_NOTES');
  });

  it('does NOT include API_ERROR', () => {
    expect(VERIFIED_STATUSES).not.toContain('API_ERROR');
  });

  it('does NOT include PENDING', () => {
    expect(VERIFIED_STATUSES).not.toContain('PENDING');
  });
});

// ============================================================================
// GPT MODEL CONSTANTS TESTS
// ============================================================================

describe('CITATION_GPT_MODELS', () => {
  it('STAGE_1_DEFAULT is gpt-4o', () => {
    expect(CITATION_GPT_MODELS.STAGE_1_DEFAULT).toBe('gpt-4o');
  });

  it('STAGE_1_TIER_C is gpt-4o (fallback)', () => {
    expect(CITATION_GPT_MODELS.STAGE_1_TIER_C).toBe('gpt-4o');
  });

  it('TIEBREAKER is gpt-4o', () => {
    expect(CITATION_GPT_MODELS.TIEBREAKER).toBe('gpt-4o');
  });

  it('does NOT use gpt-4-turbo (WRONG per spec)', () => {
    expect(CITATION_GPT_MODELS.STAGE_1_DEFAULT).not.toBe('gpt-4-turbo');
    expect(CITATION_GPT_MODELS.STAGE_1_TIER_C).not.toBe('gpt-4-turbo');
  });

  it('does NOT use gpt-5.2 (does not exist)', () => {
    expect(CITATION_GPT_MODELS.STAGE_1_DEFAULT).not.toBe('gpt-5.2');
    expect(CITATION_GPT_MODELS.STAGE_1_TIER_C).not.toBe('gpt-5.2');
  });
});
