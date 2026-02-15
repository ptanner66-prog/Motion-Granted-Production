/**
 * GET /api/admin/prompts
 *
 * Returns all 14 phase prompts with metadata and model routing info.
 * Used by the Phase Prompt Viewer admin page (Clay's dashboard).
 * Reads from DB (via loadPhasePrompts) with file fallback.
 *
 * Auth: admin or clerk role required.
 *
 * PUT /api/admin/prompts
 *
 * Updates a single phase prompt content. Creates a version history entry.
 * Invalidates the prompt cache so the next workflow run uses new content.
 *
 * Auth: admin role required (not clerk).
 * Body: { phase_key: string, content: string, edit_note?: string }
 */
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { PHASE_PROMPTS, PHASE_METADATA, loadPhasePrompts, refreshPhasePrompts, type PhaseKey } from '@/prompts/index';
import {
  getPhaseConfig,
  PHASES,
  type WorkflowPhase,
} from '@/lib/config/phase-registry';
import { createLogger } from '@/lib/security/logger';

const log = createLogger('api-admin-prompts');

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

/** Valid phase keys for PUT validation. */
const VALID_PHASE_KEYS = new Set<string>(EXECUTION_ORDER);

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

    // Load latest prompts from DB (falls back to files if DB unavailable)
    await loadPhasePrompts();

    // SP-08: Use user-scoped client instead of service_role for metadata.
    // Requires admin RLS policies on phase_prompts (see Task 10 migration).
    let dbMetadata: Record<string, { editVersion: number; updatedBy: string | null; updatedAt: string | null }> = {};
    try {
      const { data: dbRows } = await supabase
        .from('phase_prompts')
        .select('phase, edit_version, updated_by, updated_at')
        .eq('is_active', true);

      if (dbRows) {
        for (const row of dbRows) {
          dbMetadata[row.phase] = {
            editVersion: row.edit_version ?? 1,
            updatedBy: row.updated_by ?? null,
            updatedAt: row.updated_at ?? null,
          };
        }
      }
    } catch {
      // Non-fatal: metadata just won't be available
    }

    const phases = EXECUTION_ORDER.map((key, index) => {
      const promptText = PHASE_PROMPTS[key];
      const metadata = PHASE_METADATA[key];
      const registryKey = PROMPT_KEY_TO_PHASE[key];
      const config = getPhaseConfig(registryKey);
      const wordCount = promptText.split(/\s+/).filter(Boolean).length;
      const dbPhase = registryKey; // DB uses 'I', 'V.1', etc.
      const meta = dbMetadata[dbPhase];

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
        editVersion: meta?.editVersion ?? null,
        lastEditor: meta?.updatedBy ?? null,
        lastUpdated: meta?.updatedAt ?? null,
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
    log.error('GET prompts error', { error: message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * PUT /api/admin/prompts
 *
 * Updates a phase prompt. Admin only.
 * Body: { phase_key: string, content: string, edit_note?: string }
 * Returns: { success: true, phase_key, edit_version, word_count }
 */
export async function PUT(request: Request) {
  try {
    // 1. Auth check — must be admin
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profile?.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden - Admin only' }, { status: 403 });
    }

    // 2. Parse and validate body
    const body = await request.json();
    const { phase_key, content, edit_note } = body as {
      phase_key: string;
      content: string;
      edit_note?: string;
    };

    if (!phase_key || typeof phase_key !== 'string') {
      return NextResponse.json({ error: 'phase_key is required' }, { status: 400 });
    }
    if (!VALID_PHASE_KEYS.has(phase_key)) {
      return NextResponse.json({ error: `Invalid phase_key: ${phase_key}` }, { status: 400 });
    }
    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      return NextResponse.json({ error: 'content cannot be empty' }, { status: 400 });
    }

    // 3. Map phase_key (PHASE_I) to DB phase value (I)
    const dbPhase = PROMPT_KEY_TO_PHASE[phase_key];
    if (!dbPhase) {
      return NextResponse.json({ error: `Cannot map phase_key: ${phase_key}` }, { status: 400 });
    }

    // SP-08: Use user-scoped client instead of service_role (admin verified above).
    // Requires admin RLS policies on phase_prompts/phase_prompt_versions (see Task 10 migration).

    // 4. Get current edit_version
    const { data: current } = await supabase
      .from('phase_prompts')
      .select('edit_version')
      .eq('phase', dbPhase)
      .single();

    const newVersion = (current?.edit_version ?? 0) + 1;
    const trimmedContent = content.trim();

    // 6. Update the prompt in phase_prompts
    const { error: updateError } = await supabase
      .from('phase_prompts')
      .update({
        prompt_content: trimmedContent,
        edit_version: newVersion,
        updated_by: user.email ?? user.id,
        updated_at: new Date().toISOString(),
      })
      .eq('phase', dbPhase);

    if (updateError) {
      log.error('Update failed for phase', { phaseKey: phase_key, error: updateError });
      return NextResponse.json({ error: 'Failed to save prompt' }, { status: 500 });
    }

    // 7. Insert version history (append-only)
    const { error: versionError } = await supabase
      .from('phase_prompt_versions')
      .insert({
        phase: dbPhase,
        prompt_content: trimmedContent,
        edit_version: newVersion,
        edited_by: user.email ?? user.id,
        edit_note: edit_note?.trim() || null,
      });

    if (versionError) {
      // Non-fatal — the prompt itself was saved
      log.warn('Version history insert failed', { phaseKey: phase_key, error: versionError });
    }

    // 8. Invalidate prompt cache so next workflow run uses new content
    await refreshPhasePrompts();

    // 9. Log the edit
    log.info('Phase prompt updated', { phaseKey: phase_key, version: newVersion, updatedBy: user.email ?? user.id });

    // 10. Return success
    const wordCount = trimmedContent.split(/\s+/).filter(Boolean).length;
    return NextResponse.json({
      success: true,
      phase_key,
      edit_version: newVersion,
      word_count: wordCount,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    log.error('PUT prompts error', { error: message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
