// app/api/admin/phase-prompts/[phaseId]/route.ts
import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

const VALID_TIERS = ['A', 'B', 'C', 'D'] as const;
const VALID_MODELS = [
  'claude-sonnet-4-5-20250929',
  'claude-opus-4-5-20250929',
] as const;

interface PatchBody {
  tier: string;
  modelId: string;
}

/**
 * PATCH /api/admin/phase-prompts/[phaseId]
 * Updates the model assignment for a specific phase and tier.
 *
 * @body { tier: 'A'|'B'|'C'|'D', modelId: string }
 * @returns { success: boolean, updated: object }
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ phaseId: string }> }
): Promise<NextResponse> {
  try {
    const supabase = await createClient();
    const { phaseId } = await params;

    // Verify authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify admin role
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profile?.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Parse request body
    let body: PatchBody;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const { tier, modelId } = body;

    // Validate tier
    if (!tier || !VALID_TIERS.includes(tier as typeof VALID_TIERS[number])) {
      return NextResponse.json(
        { error: `Invalid tier. Must be one of: ${VALID_TIERS.join(', ')}` },
        { status: 400 }
      );
    }

    // Validate model
    if (!modelId || !VALID_MODELS.includes(modelId as typeof VALID_MODELS[number])) {
      return NextResponse.json(
        { error: `Invalid modelId. Must be one of: ${VALID_MODELS.join(', ')}` },
        { status: 400 }
      );
    }

    // Check for existing record
    const { data: existing, error: fetchError } = await supabase
      .from('phase_config')
      .select('*')
      .eq('phase_id', phaseId)
      .eq('tier', tier)
      .single();

    if (fetchError && fetchError.code !== 'PGRST116') {
      console.error('[PATCH phase-prompts] Fetch error:', fetchError);
      return NextResponse.json({ error: 'Database error' }, { status: 500 });
    }

    const now = new Date().toISOString();

    if (existing) {
      // Update existing record
      const { error: updateError } = await supabase
        .from('phase_config')
        .update({
          model_id: modelId,
          updated_by: user.email || user.id,
          updated_at: now,
        })
        .eq('phase_id', phaseId)
        .eq('tier', tier);

      if (updateError) {
        console.error('[PATCH phase-prompts] Update error:', updateError);
        return NextResponse.json({ error: 'Failed to update' }, { status: 500 });
      }
    } else {
      // Insert new record
      const { error: insertError } = await supabase
        .from('phase_config')
        .insert({
          phase_id: phaseId,
          tier,
          model_id: modelId,
          created_by: user.email || user.id,
          created_at: now,
          updated_at: now,
        });

      if (insertError) {
        console.error('[PATCH phase-prompts] Insert error:', insertError);
        return NextResponse.json({ error: 'Failed to create config' }, { status: 500 });
      }
    }

    console.log(`[PATCH phase-prompts] ${phaseId}/${tier} -> ${modelId} by ${user.email}`);

    return NextResponse.json({
      success: true,
      updated: {
        phaseId,
        tier,
        modelId,
        updatedAt: now,
      },
    });
  } catch (err) {
    console.error('[PATCH phase-prompts] Unexpected error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
