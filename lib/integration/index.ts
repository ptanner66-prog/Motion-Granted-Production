/**
 * Integration Layer — Barrel Exports
 *
 * Connects the AI workflow pipeline to document generation,
 * storage, and email notification systems.
 */

// Doc Gen Bridge
export { generateAndStoreFilingPackage } from './doc-gen-bridge';
export type { DocGenInput, DocGenResult, UploadedDocument } from './doc-gen-bridge';

// Email Triggers
export { triggerEmail } from './email-triggers';
export type { WorkflowEvent } from './email-triggers';

// Storage Manager
export {
  uploadDocument,
  getSignedDownloadUrl,
  listOrderDocuments,
  deleteOrderDocuments,
  ensureBucketExists,
} from './storage-manager';
export type { StorageResult, DocumentListItem } from './storage-manager';
