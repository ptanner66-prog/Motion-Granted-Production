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

/** Motion complexity tiers */
export type MotionTier = 'A' | 'B' | 'C' | 'D';

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
