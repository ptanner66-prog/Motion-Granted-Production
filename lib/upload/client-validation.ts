/**
 * Client-side file validation (SP20: UPLOAD-001 through UPLOAD-005)
 *
 * Separated from file-validation.ts to avoid pulling server-only dependencies
 * (supabase/server → next/headers) into client component bundles.
 *
 * Runs before upload begins to prevent wasted bandwidth on invalid files.
 */

/** Max file size in MB */
export const MAX_FILE_SIZE_MB = 50;

/** Max file size in bytes */
export const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

/** Allowed MIME types for client-side upload (documents only, no images per CGA6-008) */
export const CLIENT_ALLOWED_MIME_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
  'application/msword', // .doc
] as const;

/** Allowed file extensions for client-side upload */
export const CLIENT_ALLOWED_EXTENSIONS = ['.pdf', '.doc', '.docx'] as const;

/** Extensions that indicate a suspicious double-extension attack */
const SUSPICIOUS_EXTENSIONS = [
  '.exe', '.bat', '.cmd', '.com', '.vbs', '.js', '.msi',
  '.scr', '.pif', '.ps1', '.sh', '.cpl', '.hta', '.inf',
  '.reg', '.ws', '.wsf', '.wsh',
] as const;

export type ClientAllowedMimeType = typeof CLIENT_ALLOWED_MIME_TYPES[number];

export interface ClientFileValidationResult {
  valid: boolean;
  error?: string;
  file: File;
}

/**
 * Validate a single file on the client side before upload begins.
 * Checks extension, double-extension attacks, MIME type, file size, and zero-byte files.
 */
export function validateFileClient(file: File): ClientFileValidationResult {
  // Check for empty filename
  if (!file.name || file.name.trim() === '') {
    return { valid: false, error: 'File has no name', file };
  }

  // Check file extension
  const lastDotIndex = file.name.lastIndexOf('.');
  const ext = lastDotIndex >= 0 ? file.name.slice(lastDotIndex).toLowerCase() : '';
  if (!ext || !(CLIENT_ALLOWED_EXTENSIONS as readonly string[]).includes(ext)) {
    return {
      valid: false,
      error: `Invalid file type: ${ext || '(no extension)'}. Allowed: ${CLIENT_ALLOWED_EXTENSIONS.join(', ')}`,
      file,
    };
  }

  // Check for double extensions (e.g., malware.exe.pdf)
  const parts = file.name.split('.');
  if (parts.length > 2) {
    for (const part of parts.slice(1, -1)) {
      if ((SUSPICIOUS_EXTENSIONS as readonly string[]).includes('.' + part.toLowerCase())) {
        return { valid: false, error: `Suspicious file name detected: ${file.name}`, file };
      }
    }
  }

  // Check MIME type (note: can be spoofed, but catches honest mistakes)
  if (file.type && !(CLIENT_ALLOWED_MIME_TYPES as readonly string[]).includes(file.type as ClientAllowedMimeType)) {
    return {
      valid: false,
      error: `Invalid file type: ${file.type}. Please upload PDF or Word documents only.`,
      file,
    };
  }

  // Check for zero-byte files
  if (file.size === 0) {
    return { valid: false, error: 'File is empty (0 bytes)', file };
  }

  // Check file size
  if (file.size > MAX_FILE_SIZE_BYTES) {
    const sizeMB = (file.size / (1024 * 1024)).toFixed(1);
    return {
      valid: false,
      error: `File too large: ${sizeMB}MB exceeds ${MAX_FILE_SIZE_MB}MB limit`,
      file,
    };
  }

  return { valid: true, file };
}

/**
 * Validate multiple files on the client side. Returns a result for each file.
 */
export function validateFilesClient(files: File[]): ClientFileValidationResult[] {
  return files.map(validateFileClient);
}

/**
 * Format a byte count into a human-readable string.
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
