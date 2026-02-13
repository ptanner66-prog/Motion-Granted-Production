/**
 * Superprompt Templates API
 *
 * CRUD operations for superprompt templates.
 * Only admins can manage templates.
 *
 * The lawyer can upload their superprompt here and update it
 * whenever they improve it.
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { AVAILABLE_PLACEHOLDERS } from '@/lib/workflow/superprompt-engine';

/** Hard ceiling for max_tokens — Opus/Sonnet support up to 64K output tokens. */
const MAX_TOKENS_CEILING = 64000;

interface TemplateInput {
  name: string;
  description?: string;
  motionTypes: string[]; // Which motion types this handles, or ['*'] for all
  template: string;
  systemPrompt?: string;
  maxTokens?: number;
  isDefault?: boolean;
}

/**
 * GET: List all templates or get a specific one
 */
export async function GET(request: Request) {
  const supabase = await createClient();

  // Verify auth
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Check admin/clerk role
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profile?.role !== 'admin' && profile?.role !== 'clerk') {
    return NextResponse.json({ error: 'Forbidden - Admin/Clerk only' }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const templateId = searchParams.get('id');
  const motionType = searchParams.get('motionType');

  try {
    if (templateId) {
      // Get specific template
      const { data, error } = await supabase
        .from('superprompt_templates')
        .select('*')
        .eq('id', templateId)
        .single();

      if (error || !data) {
        return NextResponse.json({ error: 'Template not found' }, { status: 404 });
      }

      return NextResponse.json({ template: formatTemplate(data) });
    }

    if (motionType) {
      // Get template for specific motion type
      const { data } = await supabase
        .from('superprompt_templates')
        .select('*')
        .or(`motion_types.cs.{${motionType}},motion_types.cs.{*}`)
        .order('is_default', { ascending: false })
        .limit(1)
        .single();

      if (data) {
        return NextResponse.json({ template: formatTemplate(data) });
      }

      // Fall back to default
      const { data: defaultTemplate } = await supabase
        .from('superprompt_templates')
        .select('*')
        .eq('is_default', true)
        .single();

      if (defaultTemplate) {
        return NextResponse.json({ template: formatTemplate(defaultTemplate) });
      }

      return NextResponse.json({ template: null, message: 'No template found' });
    }

    // List all templates
    const { data: templates, error } = await supabase
      .from('superprompt_templates')
      .select('*')
      .order('is_default', { ascending: false })
      .order('updated_at', { ascending: false });

    if (error) {
      return NextResponse.json({ error: 'Failed to fetch templates' }, { status: 500 });
    }

    return NextResponse.json({
      templates: (templates || []).map(formatTemplate),
      availablePlaceholders: AVAILABLE_PLACEHOLDERS,
    });
  } catch (error) {
    console.error('Get templates error:', error);
    return NextResponse.json({
      error: 'Failed to fetch templates. Please try again.',
    }, { status: 500 });
  }
}

/**
 * POST: Create a new template
 */
export async function POST(request: Request) {
  const supabase = await createClient();

  // Verify auth
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Check admin role only (not clerk)
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profile?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden - Admin only' }, { status: 403 });
  }

  try {
    const body: TemplateInput = await request.json();

    if (!body.name || !body.template) {
      return NextResponse.json({
        error: 'name and template are required',
      }, { status: 400 });
    }

    // Validate max_tokens doesn't exceed model limits
    if (body.maxTokens && body.maxTokens > MAX_TOKENS_CEILING) {
      return NextResponse.json({
        error: `max_tokens ${body.maxTokens} exceeds the maximum allowed value of ${MAX_TOKENS_CEILING}. Opus models support up to 64000 output tokens.`,
      }, { status: 400 });
    }

    // If setting as default, unset other defaults first
    if (body.isDefault) {
      await supabase
        .from('superprompt_templates')
        .update({ is_default: false })
        .eq('is_default', true);
    }

    const { data, error } = await supabase
      .from('superprompt_templates')
      .insert({
        name: body.name,
        description: body.description || '',
        motion_types: body.motionTypes || ['*'],
        template: body.template,
        system_prompt: body.systemPrompt || null,
        max_tokens: body.maxTokens || 16000,
        is_default: body.isDefault || false,
        created_by: user.id,
      })
      .select()
      .single();

    if (error) {
      console.error('Insert error:', error);
      return NextResponse.json({ error: 'Failed to create template' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      template: formatTemplate(data),
    });
  } catch (error) {
    console.error('Create template error:', error);
    return NextResponse.json({
      error: 'Failed to create template. Please try again.',
    }, { status: 500 });
  }
}

/**
 * PUT: Update an existing template
 */
export async function PUT(request: Request) {
  const supabase = await createClient();

  // Verify auth
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Check admin role
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profile?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden - Admin only' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { id, ...updates } = body;

    if (!id) {
      return NextResponse.json({ error: 'Template id is required' }, { status: 400 });
    }

    // Validate max_tokens doesn't exceed model limits
    if (updates.maxTokens !== undefined && updates.maxTokens > MAX_TOKENS_CEILING) {
      return NextResponse.json({
        error: `max_tokens ${updates.maxTokens} exceeds the maximum allowed value of ${MAX_TOKENS_CEILING}. Opus models support up to 64000 output tokens.`,
      }, { status: 400 });
    }

    // If setting as default, unset other defaults first
    if (updates.isDefault) {
      await supabase
        .from('superprompt_templates')
        .update({ is_default: false })
        .neq('id', id);
    }

    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (updates.name !== undefined) updateData.name = updates.name;
    if (updates.description !== undefined) updateData.description = updates.description;
    if (updates.motionTypes !== undefined) updateData.motion_types = updates.motionTypes;
    if (updates.template !== undefined) updateData.template = updates.template;
    if (updates.systemPrompt !== undefined) updateData.system_prompt = updates.systemPrompt;
    if (updates.maxTokens !== undefined) updateData.max_tokens = updates.maxTokens;
    if (updates.isDefault !== undefined) updateData.is_default = updates.isDefault;

    const { data, error } = await supabase
      .from('superprompt_templates')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: 'Failed to update template' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      template: formatTemplate(data),
    });
  } catch (error) {
    console.error('Update template error:', error);
    return NextResponse.json({
      error: 'Failed to update template. Please try again.',
    }, { status: 500 });
  }
}

/**
 * DELETE: Delete a template
 */
export async function DELETE(request: Request) {
  const supabase = await createClient();

  // Verify auth
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Check admin role
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profile?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden - Admin only' }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const templateId = searchParams.get('id');

  if (!templateId) {
    return NextResponse.json({ error: 'Template id is required' }, { status: 400 });
  }

  try {
    const { error } = await supabase
      .from('superprompt_templates')
      .delete()
      .eq('id', templateId);

    if (error) {
      return NextResponse.json({ error: 'Failed to delete template' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete template error:', error);
    return NextResponse.json({
      error: 'Failed to delete template. Please try again.',
    }, { status: 500 });
  }
}

// Helper to format template from DB to API response
function formatTemplate(data: Record<string, unknown>) {
  return {
    id: data.id,
    name: data.name,
    description: data.description,
    motionTypes: data.motion_types,
    template: data.template,
    systemPrompt: data.system_prompt,
    maxTokens: data.max_tokens,
    isDefault: data.is_default,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
    createdBy: data.created_by,
  };
}
