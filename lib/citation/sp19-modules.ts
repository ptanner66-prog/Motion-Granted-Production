/**
 * SP-19 Citation Stress Test Hardening — Module Index
 *
 * STATUS: AWAITING PIPELINE INTEGRATION
 * These modules were created in SP-19 but are not yet wired into the
 * citation verification pipeline. They are production-ready and tested
 * in isolation. Porter decision required on integration timing.
 *
 * Integration points:
 *   - tenant-isolation  → wrap citation queries in verification-pipeline.ts
 *   - protocol-orchestrator → call after batch verification in workflow-orchestration.ts
 *   - flag-compiler → call after 7-step pipeline in verification-pipeline.ts
 *   - circuit-breaker → wrap CourtListener/PACER calls in step-1-existence.ts
 *   - retry-with-backoff → wrap API calls in citation steps
 */
export { validateCitationOwnership, scopeCitationQuery } from './security/tenant-isolation';
export { runProtocolChecks, type ProtocolResult } from './protocols/protocol-orchestrator';
export { compileFlags, type CompiledFlags } from './flag-compiler';
export { getCircuitState, recordFailure, recordSuccess, isCircuitOpen } from './resilience/circuit-breaker';
export { retryWithBackoff, type RetryOptions } from './resilience/retry-with-backoff';
