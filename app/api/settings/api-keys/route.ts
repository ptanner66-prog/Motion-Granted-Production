/**
 * API Keys Settings Route
 *
 * Securely stores and retrieves API keys for:
 * - Anthropic (Claude AI)
 * - Westlaw
 * - LexisNexis
 *
 * Keys are stored encrypted in the database and used at runtime.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { cookies } from 'next/headers';

// Simple encryption for API keys (in production, use a proper encryption service)
// This uses base64 encoding with a prefix - for production, use proper AES encryption
const ENCRYPTION_PREFIX = 'enc_v1_';

function encryptKey(key: string): string {
  if (!key || key.startsWith(ENCRYPTION_PREFIX) || key.startsWith('****')) {
    return key;
  }
  // Simple obfuscation (in production, use proper encryption with a secret key)
  const encoded = Buffer.from(key).toString('base64');
  return ENCRYPTION_PREFIX + encoded;
}

function decryptKey(encryptedKey: string): string {
  if (!encryptedKey || !encryptedKey.startsWith(ENCRYPTION_PREFIX)) {
    return encryptedKey;
  }
  const encoded = encryptedKey.slice(ENCRYPTION_PREFIX.length);
  return Buffer.from(encoded, 'base64').toString('utf-8');
}

function maskKey(key: string): string {
  if (!key) return '';
  const decrypted = key.startsWith(ENCRYPTION_PREFIX) ? decryptKey(key) : key;
  if (decrypted.length <= 8) return '****';
  return '****' + decrypted.slice(-4);
}

// GET - Retrieve API key settings (masked)
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
        'anthropic_api_key',
        'westlaw_api_key',
        'westlaw_client_id',
        'westlaw_enabled',
        'lexisnexis_api_key',
        'lexisnexis_client_id',
        'lexisnexis_enabled',
        'legal_research_provider',
      ]);

    type SettingRow = { setting_key: string; setting_value: Record<string, unknown> | null };

    // Extract values with masking for security
    const getValue = (key: string, defaultValue: unknown = '') => {
      const setting = settings?.find((s: SettingRow) => s.setting_key === key);
      return setting?.setting_value?.value ?? defaultValue;
    };

    const anthropicKey = getValue('anthropic_api_key', '') as string;
    const westlawKey = getValue('westlaw_api_key', '') as string;
    const lexisKey = getValue('lexisnexis_api_key', '') as string;

    // Also check environment variables as fallback
    const envAnthropicKey = process.env.ANTHROPIC_API_KEY || '';
    const envWestlawKey = process.env.WESTLAW_API_KEY || '';
    const envLexisKey = process.env.LEXISNEXIS_API_KEY || '';

    return NextResponse.json({
      // Anthropic - mask the key, show if configured
      anthropic_api_key: anthropicKey ? maskKey(anthropicKey) : (envAnthropicKey ? maskKey(envAnthropicKey) : ''),
      anthropic_configured: !!(anthropicKey || envAnthropicKey),

      // Westlaw
      westlaw_api_key: westlawKey ? maskKey(westlawKey) : (envWestlawKey ? maskKey(envWestlawKey) : ''),
      westlaw_client_id: getValue('westlaw_client_id', process.env.WESTLAW_CLIENT_ID || '') as string,
      westlaw_enabled: getValue('westlaw_enabled', false) as boolean,

      // LexisNexis
      lexisnexis_api_key: lexisKey ? maskKey(lexisKey) : (envLexisKey ? maskKey(envLexisKey) : ''),
      lexisnexis_client_id: getValue('lexisnexis_client_id', process.env.LEXISNEXIS_CLIENT_ID || '') as string,
      lexisnexis_enabled: getValue('lexisnexis_enabled', false) as boolean,

      // Provider preference
      legal_research_provider: getValue('legal_research_provider', 'none') as string,
    });
  } catch (error) {
    console.error('Error fetching API key settings:', error);
    return NextResponse.json(
      { error: 'Failed to fetch settings' },
      { status: 500 }
    );
  }
}

// POST - Save API key settings
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
    const {
      anthropic_api_key,
      westlaw_api_key,
      westlaw_client_id,
      westlaw_enabled,
      lexisnexis_api_key,
      lexisnexis_client_id,
      lexisnexis_enabled,
      legal_research_provider,
    } = body;

    // Prepare settings to save (encrypt keys, skip if masked/unchanged)
    const settingsToSave: Array<{
      setting_key: string;
      setting_value: Record<string, unknown>;
      description: string;
      category: string;
      updated_by: string;
    }> = [];

    // Only save Anthropic key if it's new (not masked)
    if (anthropic_api_key && !anthropic_api_key.startsWith('****')) {
      settingsToSave.push({
        setting_key: 'anthropic_api_key',
        setting_value: { value: encryptKey(anthropic_api_key) },
        description: 'Anthropic API key for Claude AI',
        category: 'api_keys',
        updated_by: user.id,
      });
    }

    // Westlaw settings
    if (westlaw_api_key && !westlaw_api_key.startsWith('****')) {
      settingsToSave.push({
        setting_key: 'westlaw_api_key',
        setting_value: { value: encryptKey(westlaw_api_key) },
        description: 'Westlaw API key',
        category: 'api_keys',
        updated_by: user.id,
      });
    }

    settingsToSave.push({
      setting_key: 'westlaw_client_id',
      setting_value: { value: westlaw_client_id || '' },
      description: 'Westlaw client ID',
      category: 'api_keys',
      updated_by: user.id,
    });

    settingsToSave.push({
      setting_key: 'westlaw_enabled',
      setting_value: { value: westlaw_enabled || false },
      description: 'Whether Westlaw integration is enabled',
      category: 'api_keys',
      updated_by: user.id,
    });

    // LexisNexis settings
    if (lexisnexis_api_key && !lexisnexis_api_key.startsWith('****')) {
      settingsToSave.push({
        setting_key: 'lexisnexis_api_key',
        setting_value: { value: encryptKey(lexisnexis_api_key) },
        description: 'LexisNexis API key',
        category: 'api_keys',
        updated_by: user.id,
      });
    }

    settingsToSave.push({
      setting_key: 'lexisnexis_client_id',
      setting_value: { value: lexisnexis_client_id || '' },
      description: 'LexisNexis client ID',
      category: 'api_keys',
      updated_by: user.id,
    });

    settingsToSave.push({
      setting_key: 'lexisnexis_enabled',
      setting_value: { value: lexisnexis_enabled || false },
      description: 'Whether LexisNexis integration is enabled',
      category: 'api_keys',
      updated_by: user.id,
    });

    // Legal research provider preference
    settingsToSave.push({
      setting_key: 'legal_research_provider',
      setting_value: { value: legal_research_provider || 'none' },
      description: 'Preferred legal research provider',
      category: 'api_keys',
      updated_by: user.id,
    });

    // Save all settings
    const { error: saveError } = await supabase
      .from('automation_settings')
      .upsert(settingsToSave, {
        onConflict: 'setting_key',
      });

    if (saveError) {
      console.error('Failed to save API key settings:', saveError);
      return NextResponse.json({ error: 'Failed to save settings' }, { status: 500 });
    }

    // Log the change
    await supabase.from('automation_logs').insert({
      action_type: 'api_keys_updated',
      action_details: {
        updated_by: user.id,
        keys_updated: settingsToSave.map(s => s.setting_key),
        timestamp: new Date().toISOString(),
      },
    });

    return NextResponse.json({
      success: true,
      message: 'API keys saved successfully',
    });
  } catch (error) {
    console.error('Error saving API key settings:', error);
    return NextResponse.json(
      { error: 'Failed to save settings' },
      { status: 500 }
    );
  }
}
