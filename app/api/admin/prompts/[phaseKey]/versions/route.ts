/**
 * GET /api/admin/prompts/[phaseKey]/versions
 *
 * Returns version history for a specific phase prompt.
 * Query params: ?limit=20 (max 50)
 *
 * Auth: admin or clerk role required.
 */
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { WorkflowPhase } from '@/lib/config/phase-registry';

/** Maps PHASE_PROMPTS keys (PHASE_I) to DB phase column values (I). */
const PROMPT_KEY_TO_DB: Record<string, WorkflowPhase> = {
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

export async function GET(
  request: Request,
  { params }: { params: Promise<{ phaseKey: string }> }
) {
  try {
    // Auth check
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

    if (profile?.role !== 'admin' && profile?.role !== 'clerk') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { phaseKey } = await params;

    // Validate phase key
    const dbPhase = PROMPT_KEY_TO_DB[phaseKey];
    if (!dbPhase) {
      return NextResponse.json({ error: `Invalid phase key: ${phaseKey}` }, { status: 400 });
    }

    // Parse limit
    const url = new URL(request.url);
    const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '20', 10), 50);

    // SP-08: Use user-scoped client instead of service_role.
    // Requires admin RLS policies on phase_prompt_versions (see Task 10 migration).
    const { data, error } = await supabase
      .from('phase_prompt_versions')
      .select('id, phase, prompt_content, edit_version, edited_by, edit_note, created_at')
      .eq('phase', dbPhase)
      .order('edit_version', { ascending: false })
      .limit(limit);

    if (error) {
      console.error(`[GET /api/admin/prompts/${phaseKey}/versions] Error:`, error);
      return NextResponse.json({ error: 'Failed to load versions' }, { status: 500 });
    }

    // Format response with word counts
    const versions = (data ?? []).map((row: { id: string; phase: string; prompt_content: string; edit_version: number; edited_by: string | null; edit_note: string | null; created_at: string }) => ({
      id: row.id,
      phase: row.phase,
      phaseKey,
      editVersion: row.edit_version,
      wordCount: row.prompt_content.split(/\s+/).filter(Boolean).length,
      charCount: row.prompt_content.length,
      editedBy: row.edited_by,
      editNote: row.edit_note,
      createdAt: row.created_at,
      promptContent: row.prompt_content,
    }));

    return NextResponse.json(
      { versions },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('[GET /api/admin/prompts/versions] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
