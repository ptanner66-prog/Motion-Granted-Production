/**
 * API GUARDS
 *
 * Middleware and guards for API endpoints that trigger generation.
 * Ensures phase gate enforcement at the API layer.
 */

import { NextResponse } from 'next/server';
import {
  validatePhaseGate,
  getNextAllowedPhase,
  type PhaseId
} from './phase-gates';

// ============================================================================
// PHASE GATE MIDDLEWARE
// ============================================================================

/**
 * Require a specific phase gate to be passed before proceeding.
 * Returns a NextResponse error if gate is blocked, or null if allowed.
 */
export async function requirePhaseGate(
  orderId: string,
  requiredPhase: PhaseId
): Promise<NextResponse | null> {
  const gateResult = await validatePhaseGate(orderId, requiredPhase);

  if (!gateResult.canProceed) {
    console.error(`[API GUARD] Phase gate blocked for order ${orderId}: ${gateResult.error}`);

    return NextResponse.json(
      {
        error: 'PHASE_GATE_VIOLATION',
        message: gateResult.error,
        missingPrerequisites: gateResult.missingPrerequisites,
        currentPhase: gateResult.currentPhase,
        attemptedPhase: requiredPhase,
        timestamp: new Date().toISOString(),
      },
      { status: 403 }
    );
  }

  return null; // Proceed
}

/**
 * Require that the workflow can proceed to the next phase.
 * More lenient than requirePhaseGate - just checks if there's a valid next phase.
 */
export async function requireWorkflowCanProceed(
  orderId: string
): Promise<{ response: NextResponse | null; nextPhase: PhaseId | null }> {
  const result = await getNextAllowedPhase(orderId);

  if (result.error) {
    return {
      response: NextResponse.json(
        {
          error: 'WORKFLOW_ERROR',
          message: result.error,
          timestamp: new Date().toISOString(),
        },
        { status: 400 }
      ),
      nextPhase: null,
    };
  }

  if (!result.phase) {
    return {
      response: NextResponse.json(
        {
          error: 'WORKFLOW_COMPLETE',
          message: 'All phases have been completed',
          timestamp: new Date().toISOString(),
        },
        { status: 400 }
      ),
      nextPhase: null,
    };
  }

  return { response: null, nextPhase: result.phase };
}

// ============================================================================
// GENERATION GUARDS
// ============================================================================

/**
 * Block any direct generation that bypasses the workflow.
 * This should be added to any endpoint that generates content.
 */
export function blockDirectGeneration(
  requestContext: { source?: string; bypassWorkflow?: boolean }
): NextResponse | null {
  if (requestContext.bypassWorkflow === true) {
    console.error('[API GUARD] Direct generation bypass attempted');

    return NextResponse.json(
      {
        error: 'DIRECT_GENERATION_BLOCKED',
        message: 'Direct content generation is not allowed. Use the workflow orchestrator.',
        hint: 'Call /api/workflow/orchestrate instead',
        timestamp: new Date().toISOString(),
      },
      { status: 403 }
    );
  }

  return null;
}

/**
 * Validate that a generation request comes from the workflow system.
 * Checks for workflow context in the request.
 */
export function validateWorkflowSource(
  headers: Headers
): { valid: boolean; error?: string } {
  const workflowId = headers.get('x-workflow-id');
  const phaseId = headers.get('x-phase-id');

  if (!workflowId || !phaseId) {
    return {
      valid: false,
      error: 'Missing workflow context headers (x-workflow-id, x-phase-id)',
    };
  }

  return { valid: true };
}

// ============================================================================
// SKIP PREVENTION
// ============================================================================

/**
 * Block any request that attempts to skip phases.
 */
export async function blockPhaseSkip(
  orderId: string,
  targetPhase: PhaseId,
  allowedSkips: PhaseId[] = []
): Promise<NextResponse | null> {
  const gateResult = await validatePhaseGate(orderId, targetPhase);

  if (!gateResult.canProceed) {
    // Check if this is an allowed skip (for optional phases)
    const isAllowedSkip = allowedSkips.includes(targetPhase);

    if (!isAllowedSkip) {
      return NextResponse.json(
        {
          error: 'PHASE_SKIP_BLOCKED',
          message: gateResult.error,
          missingPrerequisites: gateResult.missingPrerequisites,
          currentPhase: gateResult.currentPhase,
          attemptedPhase: targetPhase,
          timestamp: new Date().toISOString(),
        },
        { status: 403 }
      );
    }
  }

  return null;
}

// ============================================================================
// RATE LIMITING & SAFETY
// ============================================================================

interface RateLimitEntry {
  count: number;
  lastReset: number;
}

const rateLimitMap = new Map<string, RateLimitEntry>();

/**
 * Simple rate limiter for generation requests.
 * Prevents runaway AI calls.
 */
export function checkGenerationRateLimit(
  orderId: string,
  maxRequestsPerMinute: number = 10
): { allowed: boolean; retryAfter?: number } {
  const now = Date.now();
  const windowMs = 60 * 1000; // 1 minute

  let entry = rateLimitMap.get(orderId);

  if (!entry || (now - entry.lastReset) > windowMs) {
    entry = { count: 0, lastReset: now };
  }

  entry.count++;
  rateLimitMap.set(orderId, entry);

  if (entry.count > maxRequestsPerMinute) {
    const retryAfter = Math.ceil((windowMs - (now - entry.lastReset)) / 1000);
    return { allowed: false, retryAfter };
  }

  return { allowed: true };
}

/**
 * Create rate limit error response.
 */
export function rateLimitResponse(retryAfter: number): NextResponse {
  return NextResponse.json(
    {
      error: 'RATE_LIMITED',
      message: 'Too many generation requests. Please wait before retrying.',
      retryAfter,
      timestamp: new Date().toISOString(),
    },
    {
      status: 429,
      headers: {
        'Retry-After': String(retryAfter),
      },
    }
  );
}

// ============================================================================
// REQUEST VALIDATION
// ============================================================================

/**
 * Validate a workflow request body.
 */
export function validateWorkflowRequest(body: unknown): {
  valid: boolean;
  orderId?: string;
  phase?: PhaseId;
  error?: string;
} {
  if (!body || typeof body !== 'object') {
    return { valid: false, error: 'Invalid request body' };
  }

  const data = body as Record<string, unknown>;

  if (!data.orderId || typeof data.orderId !== 'string') {
    return { valid: false, error: 'Missing or invalid orderId' };
  }

  // UUID validation
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(data.orderId)) {
    return { valid: false, error: 'Invalid orderId format' };
  }

  if (data.phase) {
    const validPhases = ['I', 'II', 'III', 'IV', 'V', 'V.1', 'VI', 'VII', 'VIII', 'VII.1', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV'];
    if (!validPhases.includes(data.phase as string)) {
      return { valid: false, error: 'Invalid phase identifier' };
    }
  }

  return {
    valid: true,
    orderId: data.orderId,
    phase: data.phase as PhaseId | undefined,
  };
}

// ============================================================================
// COMPOSITE GUARD
// ============================================================================

/**
 * Run all standard guards for a workflow endpoint.
 */
export async function runWorkflowGuards(
  orderId: string,
  targetPhase: PhaseId,
  headers: Headers
): Promise<NextResponse | null> {
  // 1. Rate limiting
  const rateLimit = checkGenerationRateLimit(orderId);
  if (!rateLimit.allowed) {
    return rateLimitResponse(rateLimit.retryAfter!);
  }

  // 2. Phase gate validation
  const gateBlock = await requirePhaseGate(orderId, targetPhase);
  if (gateBlock) return gateBlock;

  return null; // All guards passed
}
