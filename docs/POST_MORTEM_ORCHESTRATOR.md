# Post-Mortem: Workflow Orchestrator Migration

**Date:** February 2026
**Audit Ref:** AUD-006

## Original Architecture

The original workflow execution path was synchronous and single-process:

```
orchestrator.ts → executePhaseWithContext() → phase-executor.ts (singular)
```

- `lib/workflow/orchestrator.ts` was the central hub combining checkout data, documents, templates, and workflow execution
- `lib/workflow/phase-executor.ts` (singular) handled individual phase execution with HOLD/checkpoint logic
- Execution ran in a single request lifecycle with no retry or checkpointing

## Why It Was Replaced

The synchronous architecture had critical limitations for production:

1. **No retry logic** — A failed AI call at Phase VII would lose all prior phase outputs
2. **No observability** — No way to inspect or replay individual phase executions
3. **Timeout constraints** — Vercel's 300s function limit was insufficient for multi-phase workflows
4. **No concurrency control** — No per-order locking to prevent duplicate phase runs
5. **No step-based checkpointing** — Could not resume from the last successful step after failure

## New Architecture

The replacement uses Inngest for event-driven, step-based workflow orchestration:

```
workflow-orchestration.ts → Inngest step functions → phase-executors.ts (plural)
```

- `lib/inngest/workflow-orchestration.ts` — Main orchestrator using Inngest step functions
- `lib/workflow/phase-executors.ts` (plural, ~4000 lines) — Full phase execution logic with AI integration
- `lib/config/phase-registry.ts` — Centralized model routing and phase configuration

Key improvements:
- **Step-based checkpointing** — Each Inngest step is independently retryable
- **Automatic retries** — Failed steps retry with exponential backoff
- **Per-order concurrency locks** — Prevents duplicate phase runs
- **Full observability** — Inngest dashboard shows step-by-step execution
- **Long-running support** — Up to 15-minute function timeouts

## What Remains

After the CGA6-051 cleanup:

- `orchestrator.ts` — Still exists with one active export: `gatherOrderContext()`
- `phase-executor.ts` (singular) — **DELETED** (was a stub returning `{ completed: true }`)
- `phase-config.ts` — Deprecated, no active imports remain

### Active exports from orchestrator.ts

| Export | Used By | Status |
|--------|---------|--------|
| `gatherOrderContext()` | workflow-orchestration.ts, superprompt-engine.ts | Active |
| `OrderContext` type | workflow-orchestration.ts, workflow/index.ts | Active |
| `SuperPromptContext` type | workflow/index.ts | Active (re-export) |
| `OrchestrationResult` type | workflow/index.ts | Active (re-export) |
| `buildOrderSuperprompt()` | workflow/index.ts | Active (re-export) |
| `initializeWorkflow()` | workflow/index.ts | Active (re-export) |
| `orchestrateWorkflow()` | workflow/index.ts | Dead (always returns failure) |
| `executePhaseWithContext()` | None | Dead |
| `getWorkflowSuperprompt()` | workflow/index.ts | Active (re-export) |
| `notifyWorkflowEvent()` | None directly (dynamic import from phase-executor.ts, now deleted) | Likely dead |
| `notifyPhaseComplete()` | None directly (dynamic import from phase-executor.ts, now deleted) | Likely dead |

## Migration Plan

1. Create `lib/workflow/context-builder.ts` with `gatherOrderContext()` and `OrderContext` type
2. Update imports in workflow-orchestration.ts, superprompt-engine.ts, workflow/index.ts
3. Move `buildOrderSuperprompt()` if still needed, or deprecate
4. Delete orchestrator.ts
