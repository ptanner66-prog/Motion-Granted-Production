/**
 * API Keys Utility
 *
 * Retrieves API keys from the database at runtime.
 * Falls back to environment variables if not set in database.
 *
 * Keys stored in DB take precedence over environment variables,
 * allowing admins to configure keys without redeploying.
 */

import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import crypto from 'crypto';

// Create admin client with service role key (bypasses RLS for reading API keys)
function getAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    return null;
  }

  return createSupabaseClient(supabaseUrl, supabaseServiceKey);
}

// Encryption configuration (must match route.ts)
const ENCRYPTION_PREFIX_V2 = 'enc_v2_';
const ALGORITHM = 'aes-256-gcm';

// Get encryption key from environment - MUST be configured in production
function getEncryptionKey(): Buffer {
  const secret = process.env.ENCRYPTION_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) {
    throw new Error('ENCRYPTION_SECRET or SUPABASE_SERVICE_ROLE_KEY must be configured for API key encryption');
  }
  return crypto.createHash('sha256').update(secret).digest();
}

function decryptKey(encryptedKey: string): string {
  if (!encryptedKey) return '';

  // Handle v1 (base64 only) format for backward compatibility
  if (encryptedKey.startsWith('enc_v1_')) {
    const encoded = encryptedKey.slice(7);
    return Buffer.from(encoded, 'base64').toString('utf-8');
  }

  // Handle v2 (AES-GCM) format
  if (!encryptedKey.startsWith(ENCRYPTION_PREFIX_V2)) {
    return encryptedKey; // Not encrypted
  }

  try {
    const key = getEncryptionKey();
    const parts = encryptedKey.slice(ENCRYPTION_PREFIX_V2.length).split(':');

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

// Cache disabled - always fetch fresh from database
// This ensures API key changes take effect immediately
let keyCache: {
  keys: Record<string, string>;
  timestamp: number;
} | null = null;

const CACHE_TTL = 0; // Disabled - fetch fresh every time

/**
 * Get all API keys from database (with caching)
 */
export async function getAPIKeys(): Promise<{
  anthropic_api_key: string;
  westlaw_api_key: string;
  westlaw_client_id: string;
  westlaw_enabled: boolean;
  lexisnexis_api_key: string;
  lexisnexis_client_id: string;
  lexisnexis_enabled: boolean;
  legal_research_provider: 'westlaw' | 'lexisnexis' | 'none';
}> {
  // Check cache
  if (keyCache && Date.now() - keyCache.timestamp < CACHE_TTL) {
    return {
      anthropic_api_key: keyCache.keys.anthropic_api_key || process.env.ANTHROPIC_API_KEY || '',
      westlaw_api_key: keyCache.keys.westlaw_api_key || process.env.WESTLAW_API_KEY || '',
      westlaw_client_id: keyCache.keys.westlaw_client_id || process.env.WESTLAW_CLIENT_ID || '',
      westlaw_enabled: keyCache.keys.westlaw_enabled === 'true',
      lexisnexis_api_key: keyCache.keys.lexisnexis_api_key || process.env.LEXISNEXIS_API_KEY || '',
      lexisnexis_client_id: keyCache.keys.lexisnexis_client_id || process.env.LEXISNEXIS_CLIENT_ID || '',
      lexisnexis_enabled: keyCache.keys.lexisnexis_enabled === 'true',
      legal_research_provider: (keyCache.keys.legal_research_provider as 'westlaw' | 'lexisnexis' | 'none') || 'none',
    };
  }

  try {
    // Use admin client to bypass RLS (API keys need to be read server-side)
    const supabase = getAdminClient();

    if (!supabase) {
      console.warn('Supabase not configured, using environment variables for API keys');
      return {
        anthropic_api_key: process.env.ANTHROPIC_API_KEY || '',
        westlaw_api_key: process.env.WESTLAW_API_KEY || '',
        westlaw_client_id: process.env.WESTLAW_CLIENT_ID || '',
        westlaw_enabled: !!process.env.WESTLAW_API_KEY,
        lexisnexis_api_key: process.env.LEXISNEXIS_API_KEY || '',
        lexisnexis_client_id: process.env.LEXISNEXIS_CLIENT_ID || '',
        lexisnexis_enabled: !!process.env.LEXISNEXIS_API_KEY,
        legal_research_provider: 'none',
      };
    }

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

    const getValue = (key: string): string => {
      const setting = settings?.find((s: SettingRow) => s.setting_key === key);
      const value = setting?.setting_value?.value;
      if (typeof value === 'string') {
        // Decrypt if encrypted
        return decryptKey(value);
      }
      if (typeof value === 'boolean') {
        return value ? 'true' : 'false';
      }
      return value?.toString() || '';
    };

    // Update cache
    keyCache = {
      keys: {
        anthropic_api_key: getValue('anthropic_api_key'),
        westlaw_api_key: getValue('westlaw_api_key'),
        westlaw_client_id: getValue('westlaw_client_id'),
        westlaw_enabled: getValue('westlaw_enabled'),
        lexisnexis_api_key: getValue('lexisnexis_api_key'),
        lexisnexis_client_id: getValue('lexisnexis_client_id'),
        lexisnexis_enabled: getValue('lexisnexis_enabled'),
        legal_research_provider: getValue('legal_research_provider'),
      },
      timestamp: Date.now(),
    };

    return {
      anthropic_api_key: keyCache.keys.anthropic_api_key || process.env.ANTHROPIC_API_KEY || '',
      westlaw_api_key: keyCache.keys.westlaw_api_key || process.env.WESTLAW_API_KEY || '',
      westlaw_client_id: keyCache.keys.westlaw_client_id || process.env.WESTLAW_CLIENT_ID || '',
      westlaw_enabled: keyCache.keys.westlaw_enabled === 'true',
      lexisnexis_api_key: keyCache.keys.lexisnexis_api_key || process.env.LEXISNEXIS_API_KEY || '',
      lexisnexis_client_id: keyCache.keys.lexisnexis_client_id || process.env.LEXISNEXIS_CLIENT_ID || '',
      lexisnexis_enabled: keyCache.keys.lexisnexis_enabled === 'true',
      legal_research_provider: (keyCache.keys.legal_research_provider as 'westlaw' | 'lexisnexis' | 'none') || 'none',
    };
  } catch (error) {
    console.error('Error fetching API keys from database:', error);

    // Fall back to environment variables
    return {
      anthropic_api_key: process.env.ANTHROPIC_API_KEY || '',
      westlaw_api_key: process.env.WESTLAW_API_KEY || '',
      westlaw_client_id: process.env.WESTLAW_CLIENT_ID || '',
      westlaw_enabled: !!process.env.WESTLAW_API_KEY,
      lexisnexis_api_key: process.env.LEXISNEXIS_API_KEY || '',
      lexisnexis_client_id: process.env.LEXISNEXIS_CLIENT_ID || '',
      lexisnexis_enabled: !!process.env.LEXISNEXIS_API_KEY,
      legal_research_provider: 'none',
    };
  }
}

/**
 * Get Anthropic API key (for Claude)
 * Checks database first, falls back to environment variable
 */
export async function getAnthropicAPIKey(): Promise<string> {
  const keys = await getAPIKeys();
  const key = keys.anthropic_api_key;

  // Debug logging - show source and key preview
  if (key) {
    const preview = key.length > 12 ? `${key.slice(0, 8)}...${key.slice(-4)}` : '(short)';
    const source = key === process.env.ANTHROPIC_API_KEY ? 'ENV' : 'DATABASE';
    console.log(`[API-KEYS] Anthropic key from ${source}: ${preview}`);
  } else {
    console.log('[API-KEYS] No Anthropic API key found in database or env');
  }

  return key;
}

/**
 * Get legal research configuration
 */
export async function getLegalResearchConfig(): Promise<{
  provider: 'westlaw' | 'lexisnexis' | 'none';
  apiKey: string;
  clientId: string;
  enabled: boolean;
}> {
  const keys = await getAPIKeys();

  if (keys.legal_research_provider === 'westlaw' && keys.westlaw_enabled) {
    return {
      provider: 'westlaw',
      apiKey: keys.westlaw_api_key,
      clientId: keys.westlaw_client_id,
      enabled: true,
    };
  }

  if (keys.legal_research_provider === 'lexisnexis' && keys.lexisnexis_enabled) {
    return {
      provider: 'lexisnexis',
      apiKey: keys.lexisnexis_api_key,
      clientId: keys.lexisnexis_client_id,
      enabled: true,
    };
  }

  return {
    provider: 'none',
    apiKey: '',
    clientId: '',
    enabled: false,
  };
}

/**
 * Clear the API keys cache (call after updating keys)
 */
export function clearAPIKeysCache(): void {
  keyCache = null;
}
