/**
 * Shared interfaces and constants used across Motion Granted domains.
 *
 * This is the canonical location for cross-domain types.
 * Domain-specific types remain in their own directories.
 *
 * Created: SP15 (0B-1)
 * Resolves: C-015, C-017, C-023, C-024
 *
 * @see types/workflow.ts — existing MotionTier (duplicated across codebase; consolidate here over time)
 * @see lib/workflow/phase-executors.ts — existing PhaseOutput (different shape, domain-specific)
 */

// ============================================================================
// PAPER SIZE CONSTANTS
// ============================================================================

/** Paper dimensions in DXA units (1440 DXA = 1 inch) */
export const PAPER_SIZES = {
  /** US Letter: 8.5" × 11" */
  LETTER: { widthDXA: 12240, heightDXA: 15840, name: 'letter' as const },
  /** US Legal: 8.5" × 14" */
  LEGAL: { widthDXA: 12240, heightDXA: 20160, name: 'legal' as const },
} as const;

export type PaperSizeName = typeof PAPER_SIZES[keyof typeof PAPER_SIZES]['name'];
export type PaperSize = (typeof PAPER_SIZES)[keyof typeof PAPER_SIZES];

// ============================================================================
// TIER SYSTEM
// ============================================================================

import type { MotionTier } from '@/types/workflow';
export type { MotionTier };

/** Quality grade thresholds — DO NOT MODIFY without Porter's approval */
export const QUALITY_THRESHOLDS = {
  MINIMUM_PASS: 0.87, // A- minimum for all tiers
  REVISION_TRIGGER: 0.85, // Below this triggers revision loop
  MAX_REVISION_LOOPS: 3,
} as const;

// ============================================================================
// PHASE OUTPUT
// ============================================================================

/**
 * Standard output shape returned by every phase executor.
 * Phase-specific extensions are allowed via index signature.
 */
export interface PhaseOutput {
  phase: string;
  status: 'completed' | 'failed' | 'hold';
  grade?: string;
  gradeNumeric?: number;
  content?: string;
  holdRequired?: boolean;
  holdReason?: string;
  citationsSaved?: {
    total: number;
    caseCitations?: number;
    statutoryCitations?: number;
    error?: string;
  };
  /** Phase-specific extensions */
  [key: string]: unknown;
}

// ============================================================================
// ORDER TYPES
// ============================================================================

/**
 * Minimal order summary used for list views, queue displays, and cross-domain references.
 * Full order data should be fetched from the database when needed.
 */
export interface OrderSummary {
  id: string;
  orderNumber: string;
  motionType: string;
  motionTier: MotionTier;
  jurisdiction: string;
  status: string;
  clientId: string;
}

// ============================================================================
// DOCUMENT TYPES
// ============================================================================

/**
 * Document metadata for files associated with an order.
 * Maps to the `documents` table in Supabase.
 */
export interface DocumentMetadata {
  id: string;
  orderId: string;
  filename: string;
  mimeType: string;
  storagePath: string;
  isDeliverable: boolean;
  createdAt: string;
}

// ============================================================================
// WORKFLOW TYPES
// ============================================================================

/** All valid phase identifiers */
export type PhaseId =
  | 'I' | 'II' | 'III' | 'IV' | 'V' | 'V.1'
  | 'VI' | 'VII' | 'VII.1' | 'VIII' | 'VIII.5'
  | 'IX' | 'IX.1' | 'X';

/** Workflow status values */
export type WorkflowStatus =
  | 'pending' | 'processing' | 'completed' | 'failed'
  | 'on_hold' | 'cancelled' | 'revision';

// ============================================================================
// ORDER STATUS (D4-CORR-001 + v5-XDC-012 + Delta Resolution)
// ============================================================================

/**
 * Full 16-member OrderStatus union.
 * DB stores compact names (CANCELLED, REVISION_REQ); TypeScript uses expanded.
 * toDbStatus() in lib/workflow/order-status.ts bridges the gap.
 */
export type OrderStatus =
  | 'INTAKE'
  | 'PROCESSING'
  | 'AWAITING_OPUS'
  | 'HOLD_PENDING'
  | 'PROTOCOL_10_EXIT'
  | 'UPGRADE_PENDING'
  | 'PENDING_CONFLICT_REVIEW'
  | 'AWAITING_APPROVAL'
  | 'REVISION_REQ'
  | 'COMPLETED'
  | 'CANCELLED_USER'
  | 'CANCELLED_SYSTEM'
  | 'CANCELLED_CONFLICT'
  | 'DISPUTED'
  | 'REFUNDED'
  | 'FAILED';

/**
 * D7-CORR-004: Cancellation status helper.
 * D7 frequently checks "is this cancelled?" without caring which variant.
 */
export function isCancelledStatus(status: OrderStatus): boolean {
  return ['CANCELLED_USER', 'CANCELLED_SYSTEM', 'CANCELLED_CONFLICT'].includes(status);
}

/**
 * Terminal state check (REFUNDED is terminal, DISPUTED is NOT).
 */
export function isTerminalState(status: OrderStatus): boolean {
  return [
    'CANCELLED_USER', 'CANCELLED_SYSTEM', 'CANCELLED_CONFLICT',
    'COMPLETED', 'FAILED', 'REFUNDED',
  ].includes(status);
}

// ============================================================================
// LOOP TRIGGER (D3 Task 11)
// ============================================================================

/**
 * Sub-loop trigger sources — must match the loop_sources CHECK constraint
 * in 20260216100005_loop_sources_check_update.sql.
 *
 * These are the 5 reasons a workflow sub-loop can be entered:
 *   PHASE_VII_GRADE_FAILURE  — Phase VII judge simulation returned grade < B+ (0.87)
 *   CP3_REJECTION            — Attorney rejected delivery at CP3
 *   COST_CAP_EXCEEDED        — Sub-loop AI cost exceeded tier cap
 *   TIER_RECLASSIFICATION    — Motion was reclassified to a different tier mid-workflow
 *   ATTORNEY_REWORK_RESET    — Attorney requested rework reset (R2v2 ST9-01)
 */
export type LoopTrigger =
  | 'PHASE_VII_GRADE_FAILURE'
  | 'CP3_REJECTION'
  | 'COST_CAP_EXCEEDED'
  | 'TIER_RECLASSIFICATION'
  | 'ATTORNEY_REWORK_RESET';
