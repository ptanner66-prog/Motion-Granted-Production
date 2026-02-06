/**
 * Feature Flags — Environment-Variable-Controlled Behavior Toggles
 *
 * Each flag has two or three modes:
 *   'enforce' — Production default. Full enforcement.
 *   'warn'    — Log warnings but DO NOT block. For testing/staging.
 *   'off'     — Completely disabled. For local development only.
 *
 * Set via environment variables. Unset = 'enforce' (production safe).
 */

// ============================================================================
// TYPES
// ============================================================================

export type EnforcementMode = 'enforce' | 'warn' | 'off';

// ============================================================================
// FLAG DEFINITIONS
// ============================================================================

/**
 * HOLD_ENFORCEMENT_MODE
 *
 * Controls whether Phase III HOLD checkpoint blocks the workflow.
 *   'enforce' — HOLD stops workflow, sets order to on_hold, sends email (PRODUCTION)
 *   'warn'    — Logs HOLD detection but continues workflow (TESTING)
 *   'off'     — Skips HOLD detection entirely (DEV ONLY)
 */
export function getHoldEnforcementMode(): EnforcementMode {
  const val = process.env.HOLD_ENFORCEMENT_MODE?.toLowerCase().trim();
  if (val === 'warn') return 'warn';
  if (val === 'off') return 'off';
  return 'enforce'; // Default: full enforcement
}

/**
 * DEADLINE_VALIDATION_MODE
 *
 * Controls whether deadline validation blocks orders with expired/tight deadlines.
 *   'enforce' — Reject orders with expired deadlines or insufficient turnaround (PRODUCTION)
 *   'warn'    — Log the rejection reason but allow workflow to proceed (TESTING)
 *   'off'     — Skip deadline validation entirely (DEV ONLY)
 */
export function getDeadlineValidationMode(): EnforcementMode {
  const val = process.env.DEADLINE_VALIDATION_MODE?.toLowerCase().trim();
  if (val === 'warn') return 'warn';
  if (val === 'off') return 'off';
  return 'enforce'; // Default: full enforcement
}
