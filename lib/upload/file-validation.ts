// /lib/upload/file-validation.ts
// File upload security per SECURITY_IMPLEMENTATION_CHECKLIST_v1 Section 3
// VERSION: 1.0 — January 28, 2026

/**
 * File validation requirements:
 * - Whitelist allowed types (PDF, DOCX, DOC, TXT, JPG, PNG)
 * - Validate by magic bytes, not just extension
 * - Max 50MB per file, 500MB per order
 * - Sanitize filenames
 */

export const FILE_CONFIG = {
  MAX_FILE_SIZE_MB: 50,
  MAX_ORDER_TOTAL_MB: 500,
  MAX_FILENAME_LENGTH: 200,
} as const;

export const ALLOWED_FILE_TYPES = {
  'application/pdf': { ext: ['pdf'], magic: [0x25, 0x50, 0x44, 0x46] }, // %PDF
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': { ext: ['docx'], magic: [0x50, 0x4B, 0x03, 0x04] }, // PK (ZIP)
  'application/msword': { ext: ['doc'], magic: [0xD0, 0xCF, 0x11, 0xE0] }, // OLE
  'text/plain': { ext: ['txt'], magic: null }, // No magic bytes for text
  'image/jpeg': { ext: ['jpg', 'jpeg'], magic: [0xFF, 0xD8, 0xFF] },
  'image/png': { ext: ['png'], magic: [0x89, 0x50, 0x4E, 0x47] },
} as const;

export type AllowedMimeType = keyof typeof ALLOWED_FILE_TYPES;

export interface FileValidationResult {
  valid: boolean;
  error?: string;
  sanitizedFilename?: string;
  detectedType?: string;
}

/**
 * Validate a file upload
 */
export async function validateFile(
  file: File | Buffer,
  filename: string,
  existingOrderSizeMB: number = 0
): Promise<FileValidationResult> {
  const buffer = file instanceof File ? Buffer.from(await file.arrayBuffer()) : file;
  const fileSizeMB = buffer.length / (1024 * 1024);

  // Check file size
  if (fileSizeMB > FILE_CONFIG.MAX_FILE_SIZE_MB) {
    return { valid: false, error: `File exceeds maximum size of ${FILE_CONFIG.MAX_FILE_SIZE_MB}MB` };
  }

  // Check order total size
  if (existingOrderSizeMB + fileSizeMB > FILE_CONFIG.MAX_ORDER_TOTAL_MB) {
    return { valid: false, error: `Total upload size would exceed ${FILE_CONFIG.MAX_ORDER_TOTAL_MB}MB limit` };
  }

  // Detect file type by magic bytes
  const detectedType = detectFileType(buffer);

  if (!detectedType) {
    return { valid: false, error: 'File type not recognized or not allowed' };
  }

  // Verify extension matches detected type
  const ext = filename.split('.').pop()?.toLowerCase();
  const allowedConfig = ALLOWED_FILE_TYPES[detectedType as AllowedMimeType];

  if (ext && !allowedConfig.ext.includes(ext)) {
    return {
      valid: false,
      error: `File extension .${ext} does not match detected content type (${detectedType})`
    };
  }

  // Sanitize filename
  const sanitizedFilename = sanitizeFilename(filename);

  return {
    valid: true,
    sanitizedFilename,
    detectedType,
  };
}

/**
 * Detect file type by magic bytes
 */
export function detectFileType(buffer: Buffer): AllowedMimeType | null {
  for (const [mimeType, config] of Object.entries(ALLOWED_FILE_TYPES)) {
    if (!config.magic) {
      // Text files - check if content is valid UTF-8 text
      if (mimeType === 'text/plain' && isValidText(buffer)) {
        return mimeType as AllowedMimeType;
      }
      continue;
    }

    // Check magic bytes
    const magic = config.magic;
    let matches = true;

    for (let i = 0; i < magic.length; i++) {
      if (buffer[i] !== magic[i]) {
        matches = false;
        break;
      }
    }

    if (matches) {
      return mimeType as AllowedMimeType;
    }
  }

  return null;
}

/**
 * Check if buffer contains valid text
 */
function isValidText(buffer: Buffer): boolean {
  try {
    const text = buffer.toString('utf8');
    // Check for null bytes or other binary indicators
    if (text.includes('\x00')) return false;
    // Check if mostly printable ASCII/UTF-8
    const printable = text.replace(/[\x20-\x7E\n\r\t]/g, '').length;
    return printable / text.length < 0.1; // Less than 10% non-printable
  } catch {
    return false;
  }
}

/**
 * Sanitize filename for storage
 */
export function sanitizeFilename(filename: string): string {
  // Remove path traversal
  let safe = filename.replace(/\.\.[\\/]/g, '');

  // Keep only safe characters
  safe = safe.replace(/[^a-zA-Z0-9._-]/g, '_');

  // Remove multiple consecutive underscores
  safe = safe.replace(/_+/g, '_');

  // Truncate if too long
  if (safe.length > FILE_CONFIG.MAX_FILENAME_LENGTH) {
    const ext = safe.split('.').pop() || '';
    const base = safe.substring(0, FILE_CONFIG.MAX_FILENAME_LENGTH - ext.length - 1);
    safe = `${base}.${ext}`;
  }

  return safe;
}

/**
 * Generate a unique storage filename (UUID-based)
 */
export function generateStorageFilename(originalFilename: string): string {
  const ext = originalFilename.split('.').pop()?.toLowerCase() || 'bin';
  const uuid = crypto.randomUUID();
  return `${uuid}.${ext}`;
}

/**
 * Log rejected upload for security audit
 */
export async function logRejectedUpload(
  filename: string,
  reason: string,
  userId?: string,
  ipAddress?: string
): Promise<void> {
  // Import dynamically to avoid circular dependency
  const { createClient } = await import('@/lib/supabase/server');
  const supabase = await createClient();

  await supabase.from('security_events').insert({
    event_type: 'FILE_UPLOAD_REJECTED',
    user_id: userId,
    ip_address: ipAddress,
    details: {
      filename: sanitizeFilename(filename),
      reason,
    },
    created_at: new Date().toISOString(),
  });

  console.log(`[FileValidation] Rejected upload: ${filename} - ${reason}`);
}
