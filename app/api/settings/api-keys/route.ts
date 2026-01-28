/**
 * API Keys Settings Route
 *
 * Securely stores and retrieves API keys for:
 * - Anthropic (Claude AI)
 * - OpenAI
 * - CourtListener
 * - PACER
 * - Stripe
 * - Resend
 *
 * Keys are stored encrypted in the database and used at runtime.
 * Uses AES-256-GCM encryption with a secret derived from ENCRYPTION_SECRET env var.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import { clearAPIKeysCache } from '@/lib/api-keys';

// Create admin client with service role key (bypasses RLS)
function getAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL environment variable');
  }
  if (!supabaseServiceKey) {
    throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY environment variable');
  }

  return createSupabaseClient(supabaseUrl, supabaseServiceKey);
}

// Encryption configuration
const ENCRYPTION_PREFIX = 'enc_v2_'; // v2 for AES-GCM
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

// Get encryption key from environment - MUST be configured in production
function getEncryptionKey(): Buffer {
  const secret = process.env.ENCRYPTION_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) {
    throw new Error('ENCRYPTION_SECRET or SUPABASE_SERVICE_ROLE_KEY must be configured for API key encryption');
  }
  // Derive a 256-bit key from the secret
  return crypto.createHash('sha256').update(secret).digest();
}

function encryptKey(plaintext: string): string {
  if (!plaintext || plaintext.startsWith(ENCRYPTION_PREFIX) || plaintext.startsWith('****')) {
    return plaintext;
  }

  try {
    const key = getEncryptionKey();
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

    let encrypted = cipher.update(plaintext, 'utf8', 'base64');
    encrypted += cipher.final('base64');

    const authTag = cipher.getAuthTag();

    // Format: prefix + iv (base64) + : + authTag (base64) + : + ciphertext (base64)
    return ENCRYPTION_PREFIX + iv.toString('base64') + ':' + authTag.toString('base64') + ':' + encrypted;
  } catch (error) {
    console.error('Encryption error:', error);
    // Fall back to base64 encoding if encryption fails (better than storing plaintext)
    return 'enc_v1_' + Buffer.from(plaintext).toString('base64');
  }
}

function decryptKey(encryptedKey: string): string {
  if (!encryptedKey) return '';

  // Handle v1 (base64 only) format for backward compatibility
  if (encryptedKey.startsWith('enc_v1_')) {
    const encoded = encryptedKey.slice(7);
    return Buffer.from(encoded, 'base64').toString('utf-8');
  }

  // Handle v2 (AES-GCM) format
  if (!encryptedKey.startsWith(ENCRYPTION_PREFIX)) {
    return encryptedKey; // Not encrypted
  }

  try {
    const key = getEncryptionKey();
    const parts = encryptedKey.slice(ENCRYPTION_PREFIX.length).split(':');

    if (parts.length !== 3) {
      console.error('Invalid encrypted key format');
      return '';
    }

    const iv = Buffer.from(parts[0], 'base64');
    const authTag = Buffer.from(parts[1], 'base64');
    const ciphertext = parts[2];

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(ciphertext, 'base64', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  } catch (error) {
    console.error('Decryption error:', error);
    return '';
  }
}

function maskKey(key: string): string {
  if (!key) return '';
  const decrypted = key.startsWith('enc_v') ? decryptKey(key) : key;
  if (!decrypted || decrypted.length <= 8) return '****';
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
        'openai_api_key',
        'courtlistener_api_key',
        'pacer_username',
        'pacer_password',
        'stripe_secret_key',
        'stripe_webhook_secret',
        'resend_api_key',
      ]);

    type SettingRow = { setting_key: string; setting_value: Record<string, unknown> | null };

    // Extract values with masking for security
    const getValue = (key: string, defaultValue: unknown = '') => {
      const setting = settings?.find((s: SettingRow) => s.setting_key === key);
      return setting?.setting_value?.value ?? defaultValue;
    };

    const anthropicKey = getValue('anthropic_api_key', '') as string;
    const openaiKey = getValue('openai_api_key', '') as string;
    const courtlistenerKey = getValue('courtlistener_api_key', '') as string;
    const pacerUsername = getValue('pacer_username', '') as string;
    const pacerPassword = getValue('pacer_password', '') as string;
    const stripeSecretKey = getValue('stripe_secret_key', '') as string;
    const stripeWebhookSecret = getValue('stripe_webhook_secret', '') as string;
    const resendKey = getValue('resend_api_key', '') as string;

    // Also check environment variables as fallback
    const envAnthropicKey = process.env.ANTHROPIC_API_KEY || '';
    const envOpenAIKey = process.env.OPENAI_API_KEY || '';
    const envCourtListenerKey = process.env.COURTLISTENER_API_KEY || '';
    const envPACERUsername = process.env.PACER_USERNAME || '';
    const envPACERPassword = process.env.PACER_PASSWORD || '';
    const envStripeSecretKey = process.env.STRIPE_SECRET_KEY || '';
    const envStripeWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET || '';
    const envResendKey = process.env.RESEND_API_KEY || '';

    return NextResponse.json({
      // Anthropic - mask the key, show if configured
      anthropic_api_key: anthropicKey ? maskKey(anthropicKey) : (envAnthropicKey ? maskKey(envAnthropicKey) : ''),
      anthropic_configured: !!(anthropicKey || envAnthropicKey),

      // OpenAI
      openai_api_key: openaiKey ? maskKey(openaiKey) : (envOpenAIKey ? maskKey(envOpenAIKey) : ''),
      openai_configured: !!(openaiKey || envOpenAIKey),

      // CourtListener
      courtlistener_api_key: courtlistenerKey ? maskKey(courtlistenerKey) : (envCourtListenerKey ? maskKey(envCourtListenerKey) : ''),
      courtlistener_configured: !!(courtlistenerKey || envCourtListenerKey),

      // PACER
      pacer_username: pacerUsername || envPACERUsername || '',
      pacer_password: pacerPassword ? maskKey(pacerPassword) : (envPACERPassword ? maskKey(envPACERPassword) : ''),
      pacer_configured: !!((pacerUsername || envPACERUsername) && (pacerPassword || envPACERPassword)),

      // Stripe
      stripe_secret_key: stripeSecretKey ? maskKey(stripeSecretKey) : (envStripeSecretKey ? maskKey(envStripeSecretKey) : ''),
      stripe_webhook_secret: stripeWebhookSecret ? maskKey(stripeWebhookSecret) : (envStripeWebhookSecret ? maskKey(envStripeWebhookSecret) : ''),
      stripe_configured: !!((stripeSecretKey || envStripeSecretKey) && (stripeWebhookSecret || envStripeWebhookSecret)),

      // Resend
      resend_api_key: resendKey ? maskKey(resendKey) : (envResendKey ? maskKey(envResendKey) : ''),
      resend_configured: !!(resendKey || envResendKey),
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

    // Use admin client for database writes (bypasses RLS since we've verified admin)
    const adminClient = getAdminClient();

    const body = await request.json();
    const {
      anthropic_api_key,
      openai_api_key,
      courtlistener_api_key,
      pacer_username,
      pacer_password,
      stripe_secret_key,
      stripe_webhook_secret,
      resend_api_key,
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
        category: 'general',
        updated_by: user.id,
      });
    }

    // OpenAI
    if (openai_api_key && !openai_api_key.startsWith('****')) {
      settingsToSave.push({
        setting_key: 'openai_api_key',
        setting_value: { value: encryptKey(openai_api_key) },
        description: 'OpenAI API key for GPT models',
        category: 'general',
        updated_by: user.id,
      });
    }

    // CourtListener
    if (courtlistener_api_key && !courtlistener_api_key.startsWith('****')) {
      settingsToSave.push({
        setting_key: 'courtlistener_api_key',
        setting_value: { value: encryptKey(courtlistener_api_key) },
        description: 'CourtListener API key for legal research',
        category: 'general',
        updated_by: user.id,
      });
    }

    // PACER
    if (pacer_username) {
      settingsToSave.push({
        setting_key: 'pacer_username',
        setting_value: { value: pacer_username },
        description: 'PACER username',
        category: 'general',
        updated_by: user.id,
      });
    }

    if (pacer_password && !pacer_password.startsWith('****')) {
      settingsToSave.push({
        setting_key: 'pacer_password',
        setting_value: { value: encryptKey(pacer_password) },
        description: 'PACER password',
        category: 'general',
        updated_by: user.id,
      });
    }

    // Stripe
    if (stripe_secret_key && !stripe_secret_key.startsWith('****')) {
      settingsToSave.push({
        setting_key: 'stripe_secret_key',
        setting_value: { value: encryptKey(stripe_secret_key) },
        description: 'Stripe secret key',
        category: 'general',
        updated_by: user.id,
      });
    }

    if (stripe_webhook_secret && !stripe_webhook_secret.startsWith('****')) {
      settingsToSave.push({
        setting_key: 'stripe_webhook_secret',
        setting_value: { value: encryptKey(stripe_webhook_secret) },
        description: 'Stripe webhook secret',
        category: 'general',
        updated_by: user.id,
      });
    }

    // Resend
    if (resend_api_key && !resend_api_key.startsWith('****')) {
      settingsToSave.push({
        setting_key: 'resend_api_key',
        setting_value: { value: encryptKey(resend_api_key) },
        description: 'Resend API key',
        category: 'general',
        updated_by: user.id,
      });
    }

    // Log which settings will be saved
    const keysBeingSaved = settingsToSave.map(s => s.setting_key);
    console.log(`[API-KEYS SAVE] Saving ${settingsToSave.length} settings: ${keysBeingSaved.join(', ')}`);

    // Save all settings using admin client (bypasses RLS)
    const { error: saveError } = await adminClient
      .from('automation_settings')
      .upsert(settingsToSave, {
        onConflict: 'setting_key',
      });

    if (saveError) {
      console.error('Failed to save API key settings:', saveError);
      return NextResponse.json({ error: 'Failed to save settings: ' + saveError.message }, { status: 500 });
    }

    console.log(`[API-KEYS SAVE] Successfully saved settings to database`);

    // Clear the API keys cache so new keys are used immediately
    clearAPIKeysCache();
    console.log(`[API-KEYS SAVE] Cache cleared`);

    // Log the change - use admin client and don't let logging failure break the save
    const { error: logError } = await adminClient.from('automation_logs').insert({
      action_type: 'status_changed',
      action_details: {
        change_type: 'api_keys_updated',
        updated_by: user.id,
        keys_updated: settingsToSave.map(s => s.setting_key),
        timestamp: new Date().toISOString(),
      },
    });

    if (logError) {
      console.error('Failed to log API key change (non-fatal):', logError);
    }

    return NextResponse.json({
      success: true,
      message: 'API keys saved successfully',
    });
  } catch (error) {
    console.error('Error saving API key settings:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: 'Failed to save settings: ' + message },
      { status: 500 }
    );
  }
}
