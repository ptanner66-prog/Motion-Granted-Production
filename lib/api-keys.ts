/**
 * API Keys Module
 * Centralized API key management with database and environment variable fallback
 */

import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

// Get admin Supabase client (bypasses RLS)
function getAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    return null;
  }

  return createClient(supabaseUrl, supabaseServiceKey);
}

// Encryption configuration (same as used in API routes)
const ENCRYPTION_PREFIX = 'enc_v2_';
const ALGORITHM = 'aes-256-gcm';

function getEncryptionKey(): Buffer {
  const secret = process.env.ENCRYPTION_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) {
    throw new Error('ENCRYPTION_SECRET or SUPABASE_SERVICE_ROLE_KEY must be configured');
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

// In-memory cache for API keys
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
}> {
  // Check cache
  if (keyCache && Date.now() - keyCache.timestamp < CACHE_TTL) {
    return {
      anthropic_api_key: keyCache.keys.anthropic_api_key || process.env.ANTHROPIC_API_KEY || '',
    };
  }

  try {
    // Use admin client to bypass RLS (API keys need to be read server-side)
    const supabase = getAdminClient();

    if (!supabase) {
      console.warn('Supabase not configured, using environment variables for API keys');
      return {
        anthropic_api_key: process.env.ANTHROPIC_API_KEY || '',
      };
    }

    const { data: settings } = await supabase
      .from('automation_settings')
      .select('setting_key, setting_value')
      .in('setting_key', [
        'anthropic_api_key',
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
      },
      timestamp: Date.now(),
    };

    return {
      anthropic_api_key: keyCache.keys.anthropic_api_key || process.env.ANTHROPIC_API_KEY || '',
    };
  } catch (error) {
    console.error('Failed to fetch API keys from database:', error);
    return {
      anthropic_api_key: process.env.ANTHROPIC_API_KEY || '',
    };
  }
}

/**
 * Get Anthropic API key (database first, then environment variable)
 */
export async function getAnthropicAPIKey(): Promise<string> {
  const keys = await getAPIKeys();
  return keys.anthropic_api_key;
}

/**
 * Clear the API keys cache (call after updating keys)
 */
export function clearAPIKeysCache(): void {
  keyCache = null;
}
