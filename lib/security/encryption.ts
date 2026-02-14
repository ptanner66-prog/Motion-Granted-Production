/**
 * AES-256-GCM Encryption Module
 *
 * Provides authenticated encryption for file-level protection of uploaded
 * documents and generated deliverables stored in Supabase Storage.
 *
 * Wire format: IV (16 bytes) + authTag (16 bytes) + ciphertext
 *
 * Key source: ENCRYPTION_SECRET env var (base64-encoded 32-byte key)
 * Generate:   node -e "log.info(require('crypto').randomBytes(32).toString('base64'))"
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

import { createLogger } from '@/lib/security/logger';

const log = createLogger('security-encryption');
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

/**
 * Get the encryption key from environment.
 * ENCRYPTION_SECRET must be a base64-encoded 32-byte key.
 */
function getEncryptionKey(): Buffer {
  const secret = process.env.ENCRYPTION_SECRET;
  if (!secret) {
    throw new Error('ENCRYPTION_SECRET environment variable is not set');
  }

  const key = Buffer.from(secret, 'base64');
  if (key.length !== 32) {
    throw new Error(
      `ENCRYPTION_SECRET must decode to exactly 32 bytes (got ${key.length}). ` +
      `Generate with: node -e "log.info(require('crypto').randomBytes(32).toString('base64'))"`
    );
  }

  return key;
}

/**
 * Encrypt data using AES-256-GCM.
 * Returns a Buffer containing: IV (16 bytes) + authTag (16 bytes) + ciphertext
 *
 * @param plaintext - Data to encrypt (string or Buffer)
 * @returns Encrypted data as Buffer (IV + authTag + ciphertext)
 */
export function encrypt(plaintext: string | Buffer): Buffer {
  const key = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH);

  const cipher = createCipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });

  const inputBuffer = typeof plaintext === 'string'
    ? Buffer.from(plaintext, 'utf-8')
    : plaintext;

  const encrypted = Buffer.concat([
    cipher.update(inputBuffer),
    cipher.final(),
  ]);

  const authTag = cipher.getAuthTag();

  // Format: IV (16) + authTag (16) + ciphertext
  return Buffer.concat([iv, authTag, encrypted]);
}

/**
 * Decrypt data encrypted with encrypt().
 * Expects input format: IV (16 bytes) + authTag (16 bytes) + ciphertext
 *
 * @param encryptedData - Data encrypted by encrypt()
 * @returns Decrypted data as Buffer
 * @throws Error if decryption fails (wrong key, tampered data, etc.)
 */
export function decrypt(encryptedData: Buffer): Buffer {
  const key = getEncryptionKey();

  if (encryptedData.length < IV_LENGTH + AUTH_TAG_LENGTH + 1) {
    throw new Error('Encrypted data too short — may be corrupted or not encrypted');
  }

  const iv = encryptedData.subarray(0, IV_LENGTH);
  const authTag = encryptedData.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = encryptedData.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

  const decipher = createDecipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });

  decipher.setAuthTag(authTag);

  return Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);
}

/**
 * Encrypt a string and return base64 for storage in text fields.
 */
export function encryptToBase64(plaintext: string): string {
  return encrypt(plaintext).toString('base64');
}

/**
 * Decrypt a base64 string produced by encryptToBase64().
 */
export function decryptFromBase64(base64Ciphertext: string): string {
  const buffer = Buffer.from(base64Ciphertext, 'base64');
  return decrypt(buffer).toString('utf-8');
}
