/**
 * @deprecated Re-export shim. Canonical location: lib/ai/claude-client.ts (CGA6-032).
 * This file exists only because lib/inngest/workflow-orchestration.ts (frozen for SP23)
 * imports from this path. New code should import from '@/lib/ai/claude-client'.
 */
export {
  createMessageWithRetry,
  getRateLimitStatus,
  estimateRateLimitRisk,
} from '@/lib/ai/claude-client';
