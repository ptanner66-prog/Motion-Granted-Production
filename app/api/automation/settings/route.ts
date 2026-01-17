import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { AutomationSetting, SettingCategory } from '@/types/automation';

/**
 * GET /api/automation/settings
 * Get all automation settings
 */
export async function GET(request: Request) {
  try {
    const supabase = await createClient();

    // Verify admin authentication
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profile?.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category') as SettingCategory | null;

    let query = supabase
      .from('automation_settings')
      .select('*')
      .order('category')
      .order('setting_key');

    if (category) {
      query = query.eq('category', category);
    }

    const { data, error } = await query;

    if (error) throw error;

    // Group settings by category
    const grouped: Record<string, AutomationSetting[]> = {};
    for (const setting of data || []) {
      if (!grouped[setting.category]) {
        grouped[setting.category] = [];
      }
      grouped[setting.category].push(setting);
    }

    return NextResponse.json({
      success: true,
      settings: data,
      grouped,
    });
  } catch (error) {
    console.error('[API] Get settings error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/automation/settings
 * Update automation settings
 */
export async function PUT(request: Request) {
  try {
    const supabase = await createClient();

    // Verify admin authentication
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profile?.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const body = await request.json();
    const { settings } = body;

    if (!settings || !Array.isArray(settings)) {
      return NextResponse.json(
        { error: 'Settings array is required' },
        { status: 400 }
      );
    }

    const results: { key: string; success: boolean; error?: string }[] = [];

    for (const setting of settings) {
      const { setting_key, setting_value, is_active } = setting;

      if (!setting_key) {
        results.push({ key: 'unknown', success: false, error: 'Missing setting_key' });
        continue;
      }

      try {
        const updateData: Record<string, unknown> = {
          updated_by: user.id,
          updated_at: new Date().toISOString(),
        };

        if (setting_value !== undefined) {
          updateData.setting_value = setting_value;
        }

        if (is_active !== undefined) {
          updateData.is_active = is_active;
        }

        const { error } = await supabase
          .from('automation_settings')
          .update(updateData)
          .eq('setting_key', setting_key);

        if (error) throw error;

        results.push({ key: setting_key, success: true });
      } catch (err) {
        results.push({
          key: setting_key,
          success: false,
          error: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    }

    // Log the settings change
    await supabase.from('automation_logs').insert({
      action_type: 'status_changed',
      action_details: {
        type: 'settings_updated',
        updatedBy: user.id,
        settingsCount: settings.length,
        results,
      },
    });

    return NextResponse.json({
      success: true,
      results,
    });
  } catch (error) {
    console.error('[API] Update settings error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/automation/settings
 * Create a new automation setting (rarely used)
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient();

    // Verify admin authentication
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profile?.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const body = await request.json();
    const { setting_key, setting_value, description, category } = body;

    if (!setting_key || !setting_value || !category) {
      return NextResponse.json(
        { error: 'setting_key, setting_value, and category are required' },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from('automation_settings')
      .insert({
        setting_key,
        setting_value,
        description,
        category,
        updated_by: user.id,
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json(
          { error: 'Setting with this key already exists' },
          { status: 409 }
        );
      }
      throw error;
    }

    return NextResponse.json({
      success: true,
      setting: data,
    });
  } catch (error) {
    console.error('[API] Create setting error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
