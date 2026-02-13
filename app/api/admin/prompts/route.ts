/**
 * GET /api/admin/prompts
 *
 * Returns all 14 phase prompts with metadata and model routing info.
 * Used by the Phase Prompt Viewer admin page (Clay's dashboard).
 *
 * Auth: admin or clerk role required.
 * Data source: filesystem prompts (via prompts/index.ts) + phase registry.
 */
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { PHASE_PROMPTS, PHASE_METADATA, type PhaseKey } from '@/prompts/index';
import {
  getPhaseConfig,
  PHASES,
  type WorkflowPhase,
} from '@/lib/config/phase-registry';

/** Maps PHASE_PROMPTS keys (PHASE_I) to PHASE_REGISTRY keys (I). */
const PROMPT_KEY_TO_PHASE: Record<string, WorkflowPhase> = {
  PHASE_I: 'I',
  PHASE_II: 'II',
  PHASE_III: 'III',
  PHASE_IV: 'IV',
  PHASE_V: 'V',
  PHASE_V1: 'V.1',
  PHASE_VI: 'VI',
  PHASE_VII: 'VII',
  PHASE_VII1: 'VII.1',
  PHASE_VIII: 'VIII',
  PHASE_VIII5: 'VIII.5',
  PHASE_IX: 'IX',
  PHASE_IX1: 'IX.1',
  PHASE_X: 'X',
};

/** Execution order matching the workflow pipeline. */
const EXECUTION_ORDER: PhaseKey[] = [
  'PHASE_I', 'PHASE_II', 'PHASE_III', 'PHASE_IV', 'PHASE_V', 'PHASE_V1',
  'PHASE_VI', 'PHASE_VII', 'PHASE_VII1', 'PHASE_VIII', 'PHASE_VIII5',
  'PHASE_IX', 'PHASE_IX1', 'PHASE_X',
];

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (profile.role !== 'admin' && profile.role !== 'clerk') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const phases = EXECUTION_ORDER.map((key, index) => {
      const promptText = PHASE_PROMPTS[key];
      const metadata = PHASE_METADATA[key];
      const registryKey = PROMPT_KEY_TO_PHASE[key];
      const config = getPhaseConfig(registryKey);
      const wordCount = promptText.split(/\s+/).filter(Boolean).length;

      return {
        index: index + 1,
        key,
        registryKey,
        name: metadata.name,
        mode: config.mode,
        promptText,
        wordCount,
        charCount: promptText.length,
        version: 'v7.5',
        routing: {
          A: {
            model: config.routing.A.model,
            thinkingBudget: config.routing.A.thinkingBudget ?? null,
            maxTokens: config.routing.A.maxTokens,
          },
          B: {
            model: config.routing.B.model,
            thinkingBudget: config.routing.B.thinkingBudget ?? null,
            maxTokens: config.routing.B.maxTokens,
          },
          C: {
            model: config.routing.C.model,
            thinkingBudget: config.routing.C.thinkingBudget ?? null,
            maxTokens: config.routing.C.maxTokens,
          },
        },
        stages: config.stages
          ? Object.fromEntries(
              Object.entries(config.stages).map(([stageName, tierRouting]) => [
                stageName,
                {
                  A: {
                    model: tierRouting.A.model,
                    thinkingBudget: tierRouting.A.thinkingBudget ?? null,
                    maxTokens: tierRouting.A.maxTokens,
                  },
                  B: {
                    model: tierRouting.B.model,
                    thinkingBudget: tierRouting.B.thinkingBudget ?? null,
                    maxTokens: tierRouting.B.maxTokens,
                  },
                  C: {
                    model: tierRouting.C.model,
                    thinkingBudget: tierRouting.C.thinkingBudget ?? null,
                    maxTokens: tierRouting.C.maxTokens,
                  },
                },
              ])
            )
          : null,
      };
    });

    // Verify we emitted all 14 phases
    if (phases.length !== PHASES.length) {
      return NextResponse.json(
        { error: `Phase count mismatch: expected ${PHASES.length}, got ${phases.length}` },
        { status: 500 },
      );
    }

    return NextResponse.json(
      { phases, version: 'v7.5', updatedAt: '2026-01-31' },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('[GET /api/admin/prompts] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
