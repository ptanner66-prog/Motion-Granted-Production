/**
 * Phase Registry Unit Tests
 *
 * Verifies all 42 phase×tier combinations match Clay's 2.5 spec.
 * Implements: MR-013, ET-005
 *
 * Run: npx vitest run lib/config/__tests__/phase-registry.test.ts
 */

import { describe, it, expect } from 'vitest';
import {
  getModel,
  getThinkingBudget,
  getMaxTokens,
  getBatchSize,
  getExecutionMode,
  isPhaseSkipped,
  QUALITY_THRESHOLD,
  MAX_REVISION_LOOPS,
  PHASES,
  TOTAL_PHASES,
} from '../phase-registry';
import { MODELS } from '../models';

describe('Phase Registry', () => {
  // ================================================================
  // STRUCTURAL TESTS
  // ================================================================

  it('has exactly 14 phases', () => {
    expect(PHASES).toHaveLength(14);
    expect(TOTAL_PHASES).toBe(14);
  });

  it('phases are in correct order', () => {
    expect(PHASES).toEqual([
      'I', 'II', 'III', 'IV', 'V', 'V.1',
      'VI', 'VII', 'VII.1', 'VIII', 'VIII.5',
      'IX', 'IX.1', 'X',
    ]);
  });

  it('quality threshold is 0.87 (B+)', () => {
    expect(QUALITY_THRESHOLD).toBe(0.87);
  });

  it('max revision loops is 3', () => {
    expect(MAX_REVISION_LOOPS).toBe(3);
  });

  // ================================================================
  // MODEL ROUTING — Clay's 2.5 Batch 2 Matrix (lines 2373-2396)
  // ================================================================

  describe('Model Routing', () => {
    // Phase I: CODE mode, no LLM
    it('Phase I: no LLM (CODE mode)', () => {
      expect(getModel('I', 'A')).toBeNull();
      expect(getModel('I', 'B')).toBeNull();
      expect(getModel('I', 'C')).toBeNull();
    });

    // Phase II-III: Sonnet all tiers
    it.each(['II', 'III'] as const)('Phase %s uses Sonnet for all tiers', (phase) => {
      expect(getModel(phase, 'A')).toBe(MODELS.SONNET);
      expect(getModel(phase, 'B')).toBe(MODELS.SONNET);
      expect(getModel(phase, 'C')).toBe(MODELS.SONNET);
    });

    // Phase IV: Sonnet A, Opus B/C
    it('Phase IV: Sonnet A, Opus B/C', () => {
      expect(getModel('IV', 'A')).toBe(MODELS.SONNET);
      expect(getModel('IV', 'B')).toBe(MODELS.OPUS);
      expect(getModel('IV', 'C')).toBe(MODELS.OPUS);
    });

    // Phase V: Sonnet all tiers
    it('Phase V: Sonnet all tiers', () => {
      expect(getModel('V', 'A')).toBe(MODELS.SONNET);
      expect(getModel('V', 'B')).toBe(MODELS.SONNET);
      expect(getModel('V', 'C')).toBe(MODELS.SONNET);
    });

    // Phase V.1 stages
    it('Phase V.1 Stage 1: GPT-4 Turbo all tiers', () => {
      expect(getModel('V.1', 'A', 'stage1')).toBe(MODELS.GPT4_TURBO);
      expect(getModel('V.1', 'B', 'stage1')).toBe(MODELS.GPT4_TURBO);
      expect(getModel('V.1', 'C', 'stage1')).toBe(MODELS.GPT4_TURBO);
    });

    it('Phase V.1 Stage 2: Opus all tiers', () => {
      expect(getModel('V.1', 'A', 'stage2')).toBe(MODELS.OPUS);
      expect(getModel('V.1', 'B', 'stage2')).toBe(MODELS.OPUS);
      expect(getModel('V.1', 'C', 'stage2')).toBe(MODELS.OPUS);
    });

    it('Phase V.1 Steps 3-5: Haiku A/B, Sonnet C', () => {
      expect(getModel('V.1', 'A', 'steps3-5')).toBe(MODELS.HAIKU);
      expect(getModel('V.1', 'B', 'steps3-5')).toBe(MODELS.HAIKU);
      expect(getModel('V.1', 'C', 'steps3-5')).toBe(MODELS.SONNET);
    });

    // Phase VI: SKIP A, Opus B/C
    it('Phase VI: SKIP A, Opus+ET B/C', () => {
      expect(getModel('VI', 'A')).toBeNull();
      expect(isPhaseSkipped('VI', 'A')).toBe(true);
      expect(getModel('VI', 'B')).toBe(MODELS.OPUS);
      expect(getModel('VI', 'C')).toBe(MODELS.OPUS);
    });

    // Phase VII: OPUS ALL TIERS (always)
    it('Phase VII: Opus ALL tiers (quality gate)', () => {
      expect(getModel('VII', 'A')).toBe(MODELS.OPUS);
      expect(getModel('VII', 'B')).toBe(MODELS.OPUS);
      expect(getModel('VII', 'C')).toBe(MODELS.OPUS);
    });

    // Phase VII.1 stages (same as V.1)
    it('Phase VII.1 Stage 1: GPT-4 Turbo all tiers', () => {
      expect(getModel('VII.1', 'A', 'stage1')).toBe(MODELS.GPT4_TURBO);
      expect(getModel('VII.1', 'B', 'stage1')).toBe(MODELS.GPT4_TURBO);
      expect(getModel('VII.1', 'C', 'stage1')).toBe(MODELS.GPT4_TURBO);
    });

    // Phase VIII: Sonnet A, Opus B/C
    it('Phase VIII: Sonnet A, Opus+ET B/C', () => {
      expect(getModel('VIII', 'A')).toBe(MODELS.SONNET);
      expect(getModel('VIII', 'B')).toBe(MODELS.OPUS);
      expect(getModel('VIII', 'C')).toBe(MODELS.OPUS);
    });

    // Phases VIII.5, X: no LLM (CODE mode)
    it('Phase VIII.5: no LLM (CODE mode)', () => {
      expect(getModel('VIII.5', 'A')).toBeNull();
      expect(getModel('VIII.5', 'B')).toBeNull();
      expect(getModel('VIII.5', 'C')).toBeNull();
    });

    it('Phase IX: Sonnet all tiers', () => {
      expect(getModel('IX', 'A')).toBe(MODELS.SONNET);
      expect(getModel('IX', 'B')).toBe(MODELS.SONNET);
      expect(getModel('IX', 'C')).toBe(MODELS.SONNET);
    });

    // Phase IX.1 stages
    it('Phase IX.1 Stage 1: GPT-4 Turbo all tiers', () => {
      expect(getModel('IX.1', 'A', 'stage1')).toBe(MODELS.GPT4_TURBO);
      expect(getModel('IX.1', 'C', 'stage1')).toBe(MODELS.GPT4_TURBO);
    });

    it('Phase X: no LLM (CODE mode)', () => {
      expect(getModel('X', 'A')).toBeNull();
      expect(getModel('X', 'B')).toBeNull();
      expect(getModel('X', 'C')).toBeNull();
    });
  });

  // ================================================================
  // EXTENDED THINKING — Clay's 2.5 Batch 2 Matrix (lines 2399-2410)
  // ================================================================

  describe('Extended Thinking Budgets', () => {
    it('Phase VI: no ET for A (skipped), 8K for B/C', () => {
      expect(getThinkingBudget('VI', 'A')).toBeUndefined();
      expect(getThinkingBudget('VI', 'B')).toBe(8_000);
      expect(getThinkingBudget('VI', 'C')).toBe(8_000);
    });

    it('Phase VII: 10K all tiers', () => {
      expect(getThinkingBudget('VII', 'A')).toBe(10_000);
      expect(getThinkingBudget('VII', 'B')).toBe(10_000);
      expect(getThinkingBudget('VII', 'C')).toBe(10_000);
    });

    it('Phase VIII: no ET for A, 8K for B/C', () => {
      expect(getThinkingBudget('VIII', 'A')).toBeUndefined();
      expect(getThinkingBudget('VIII', 'B')).toBe(8_000);
      expect(getThinkingBudget('VIII', 'C')).toBe(8_000);
    });

    it('non-ET phases return undefined', () => {
      expect(getThinkingBudget('II', 'A')).toBeUndefined();
      expect(getThinkingBudget('III', 'C')).toBeUndefined();
      expect(getThinkingBudget('V', 'B')).toBeUndefined();
      expect(getThinkingBudget('IX', 'C')).toBeUndefined();
    });

    it('CIV phases (V.1, VII.1, IX.1) have no ET', () => {
      expect(getThinkingBudget('V.1', 'C')).toBeUndefined();
      expect(getThinkingBudget('VII.1', 'C')).toBeUndefined();
      expect(getThinkingBudget('IX.1', 'C')).toBeUndefined();
    });
  });

  // ================================================================
  // BATCH SIZES — §1.5 item 15
  // ================================================================

  describe('Batch Sizes', () => {
    it('CIV phases always return 2', () => {
      expect(getBatchSize('V.1', 'A')).toBe(2);
      expect(getBatchSize('V.1', 'C')).toBe(2);
      expect(getBatchSize('VII.1', 'B')).toBe(2);
      expect(getBatchSize('IX.1', 'A')).toBe(2);
    });

    it('standard phases return tier-specific sizes', () => {
      expect(getBatchSize('V', 'A')).toBe(5);
      expect(getBatchSize('V', 'B')).toBe(4);
      expect(getBatchSize('V', 'C')).toBe(3);
    });
  });

  // ================================================================
  // EXECUTION MODES — §1.1
  // ================================================================

  describe('Execution Modes', () => {
    it('CODE mode phases', () => {
      expect(getExecutionMode('I')).toBe('CODE');
      expect(getExecutionMode('V.1')).toBe('CODE');
      expect(getExecutionMode('VII.1')).toBe('CODE');
      expect(getExecutionMode('VIII.5')).toBe('CODE');
      expect(getExecutionMode('IX.1')).toBe('CODE');
      expect(getExecutionMode('X')).toBe('CODE');
    });

    it('CHAT mode phases', () => {
      expect(getExecutionMode('II')).toBe('CHAT');
      expect(getExecutionMode('III')).toBe('CHAT');
      expect(getExecutionMode('IV')).toBe('CHAT');
      expect(getExecutionMode('V')).toBe('CHAT');
      expect(getExecutionMode('VI')).toBe('CHAT');
      expect(getExecutionMode('VII')).toBe('CHAT');
      expect(getExecutionMode('VIII')).toBe('CHAT');
      expect(getExecutionMode('IX')).toBe('CHAT');
    });
  });

  // ================================================================
  // ERROR HANDLING
  // ================================================================

  describe('Error Handling', () => {
    it('throws on invalid phase', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(() => getModel('XIV' as any, 'A')).toThrow('[PHASE_REGISTRY]');
    });

    it('throws on invalid stage', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(() => getModel('V.1', 'A', 'stage99' as any)).toThrow('[PHASE_REGISTRY]');
    });
  });

  // ================================================================
  // MAX TOKENS
  // ================================================================

  describe('Max Tokens', () => {
    it('ET phases use 128000', () => {
      expect(getMaxTokens('VII', 'A')).toBe(128_000);
      expect(getMaxTokens('VI', 'B')).toBe(128_000);
      expect(getMaxTokens('VIII', 'C')).toBe(128_000);
    });

    it('standard CHAT phases use 16384', () => {
      expect(getMaxTokens('II', 'A')).toBe(16384);
      expect(getMaxTokens('V', 'B')).toBe(16384);
      expect(getMaxTokens('IX', 'C')).toBe(16384);
    });

    it('CIV stages use 4096', () => {
      expect(getMaxTokens('V.1', 'A', 'stage1')).toBe(4096);
      expect(getMaxTokens('V.1', 'B', 'stage2')).toBe(4096);
    });

    it('CODE/no-LLM phases use 0', () => {
      expect(getMaxTokens('I', 'A')).toBe(0);
      expect(getMaxTokens('VIII.5', 'B')).toBe(0);
      expect(getMaxTokens('X', 'C')).toBe(0);
    });
  });
});
