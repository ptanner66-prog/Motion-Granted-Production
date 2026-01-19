import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// GET - Retrieve legal research settings
export async function GET() {
  try {
    const supabase = await createClient();

    // Check if user is admin
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

    // Get settings from automation_settings table
    const { data: settings } = await supabase
      .from('automation_settings')
      .select('setting_key, setting_value')
      .in('setting_key', [
        'legal_research_provider',
        'legal_research_enabled',
      ]);

    // Build response with masked keys (from env vars)
    type SettingRow = { setting_key: string; setting_value: Record<string, unknown> | null };
    const provider = settings?.find((s: SettingRow) => s.setting_key === 'legal_research_provider')?.setting_value?.provider || 'none';
    const enabled = settings?.find((s: SettingRow) => s.setting_key === 'legal_research_enabled')?.setting_value?.enabled || false;

    // Mask API keys for security (show last 4 chars only)
    const westlawKey = process.env.WESTLAW_API_KEY;
    const lexisKey = process.env.LEXISNEXIS_API_KEY;

    return NextResponse.json({
      provider,
      westlaw_api_key: westlawKey ? `****${westlawKey.slice(-4)}` : '',
      westlaw_client_id: process.env.WESTLAW_CLIENT_ID || '',
      lexisnexis_api_key: lexisKey ? `****${lexisKey.slice(-4)}` : '',
      lexisnexis_client_id: process.env.LEXISNEXIS_CLIENT_ID || '',
      enabled,
      note: 'API keys are stored as environment variables. Update them in your hosting provider.',
    });
  } catch (error) {
    console.error('Error fetching legal research settings:', error);
    return NextResponse.json(
      { error: 'Failed to fetch settings' },
      { status: 500 }
    );
  }
}

// POST - Update legal research settings
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    // Check if user is admin
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
    const { provider, enabled } = body;

    // Save provider preference and enabled status to database
    await supabase
      .from('automation_settings')
      .upsert([
        {
          setting_key: 'legal_research_provider',
          setting_value: { provider },
          description: 'Legal research provider (westlaw, lexisnexis, or none)',
          category: 'general',
          updated_by: user.id,
        },
        {
          setting_key: 'legal_research_enabled',
          setting_value: { enabled: enabled !== false },
          description: 'Whether legal research integration is enabled',
          category: 'general',
          updated_by: user.id,
        },
      ], {
        onConflict: 'setting_key',
      });

    return NextResponse.json({
      success: true,
      message: 'Settings saved. Note: API keys must be configured as environment variables.',
    });
  } catch (error) {
    console.error('Error saving legal research settings:', error);
    return NextResponse.json(
      { error: 'Failed to save settings' },
      { status: 500 }
    );
  }
}
