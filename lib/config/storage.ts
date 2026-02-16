/**
 * CANONICAL STORAGE BUCKET NAMES (D6 C-011)
 *
 * Per D6 resolution — these are the final bucket names.
 * All legacy references (motion-deliverables, documents) must
 * migrate to these constants over time.
 *
 * Usage:
 *   import { STORAGE_BUCKETS } from '@/lib/config/storage';
 *   supabase.storage.from(STORAGE_BUCKETS.ORDER_DOCUMENTS).upload(...)
 */
export const STORAGE_BUCKETS = {
  /** Active order documents — drafts, deliverables, work product */
  ORDER_DOCUMENTS: 'order-documents',

  /** Archived completed orders — moved here after delivery */
  ORDER_ARCHIVE: 'order-archive',

  /** Attorney-uploaded case files and supporting documents */
  CLIENT_UPLOADS: 'client-uploads',
} as const;

/**
 * Legacy bucket names for migration purposes only.
 * Phase 7 migration must check ALL legacy buckets when moving files.
 */
export const LEGACY_BUCKETS = [
  'motion-deliverables',  // From codebase (workflow-orchestration.ts)
  'documents',            // From Architecture v2.1 spec
  'deliverables',         // From lib/delivery/signed-urls.ts, lib/storage/signed-url.ts
] as const;

export type StorageBucket = typeof STORAGE_BUCKETS[keyof typeof STORAGE_BUCKETS];
