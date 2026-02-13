/**
 * @deprecated Re-export shim. Canonical location: lib/citation/civ/pipeline.ts (CGA6-031).
 * New code should import from '@/lib/citation/civ/pipeline'.
 */
export {
  verifyCitation,
  verifyBatch,
  verifyNewCitations,
  verifyUnauthorizedCitation,
  type CitationToVerify,
  type BatchVerificationRequest,
  type BatchVerificationResult,
  type FinalVerificationOutput,
} from '@/lib/citation/civ/pipeline';
