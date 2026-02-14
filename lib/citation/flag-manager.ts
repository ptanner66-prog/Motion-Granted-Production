/**
 * @deprecated LEGACY PATH B — Use lib/civ/ (Path A) instead.
 * This file is retained for reference only. Do not import in new code.
 * See CIV Pipeline Master Plan, Part 11: Dual Code Path Audit.
 *
 * Flag Manager (Task 37)
 *
 * Centralized flag management for citation verification pipeline.
 *
 * Three Flag Categories:
 * 1. BLOCKING - Cannot proceed, must be resolved before motion finalization
 * 2. ATTORNEY_REVIEW - Requires explicit attorney approval to proceed
 * 3. INFO - Informational only, does not block workflow
 *
 * Source: Chunk 5, Task 37 - Error Handling & Flag Manager
 */

import { createClient } from '@/lib/supabase/server';

// ============================================================================
// TYPES
// ============================================================================

export type FlagCategory = 'BLOCKING' | 'ATTORNEY_REVIEW' | 'INFO';

export type FlagSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';

export interface Flag {
  code: string;
  category: FlagCategory;
  severity: FlagSeverity;
  message: string;
  details?: Record<string, unknown>;
  citation?: string;
  step?: number;
  createdAt: Date;
  resolvedAt?: Date;
  resolvedBy?: string;
  resolution?: string;
}

export interface FlagDefinition {
  code: string;
  category: FlagCategory;
  severity: FlagSeverity;
  messageTemplate: string;
  resolution?: string;
  autoResolvable: boolean;
}

export interface FlagState {
  orderId: string;
  flags: Flag[];
  hasBlockingFlags: boolean;
  hasReviewFlags: boolean;
  lastUpdated: Date;
}

export interface FlagResolution {
  flagCode: string;
  resolvedBy: string;
  resolution: string;
  timestamp: Date;
}

// ============================================================================
// FLAG DEFINITIONS
// ============================================================================

const FLAG_DEFINITIONS: Record<string, FlagDefinition> = {
  // BLOCKING flags - Cannot proceed
  BAD_LAW: {
    code: 'BAD_LAW',
    category: 'BLOCKING',
    severity: 'critical',
    messageTemplate: 'Citation has been overruled or is no longer good law',
    resolution: 'Replace with current authority or remove citation',
    autoResolvable: false,
  },
  HOLDING_MISMATCH: {
    code: 'HOLDING_MISMATCH',
    category: 'BLOCKING',
    severity: 'critical',
    messageTemplate: 'Citation does not support claimed proposition',
    resolution: 'Verify proposition matches actual holding',
    autoResolvable: false,
  },
  NOT_FOUND: {
    code: 'NOT_FOUND',
    category: 'BLOCKING',
    severity: 'critical',
    messageTemplate: 'Citation could not be found in legal databases',
    resolution: 'Verify citation format and existence',
    autoResolvable: false,
  },
  FABRICATED: {
    code: 'FABRICATED',
    category: 'BLOCKING',
    severity: 'critical',
    messageTemplate: 'Citation may be fabricated or hallucinated',
    resolution: 'Remove immediately and replace with verified citation',
    autoResolvable: false,
  },
  UNAUTHORIZED_CITATION: {
    code: 'UNAUTHORIZED_CITATION',
    category: 'BLOCKING',
    severity: 'critical',
    messageTemplate: 'Citation not in citation bank and failed Mini Phase IV',
    resolution: 'Add to citation bank or remove',
    autoResolvable: false,
  },
  QUOTE_FABRICATION_SUSPECTED: {
    code: 'QUOTE_FABRICATION_SUSPECTED',
    category: 'BLOCKING',
    severity: 'critical',
    messageTemplate: 'Quote significantly differs from source text (<80% match)',
    resolution: 'Verify quote against original source',
    autoResolvable: false,
  },
  INSUFFICIENT_SUPPORT: {
    code: 'INSUFFICIENT_SUPPORT',
    category: 'BLOCKING',
    severity: 'high',
    messageTemplate: 'Citation does not adequately support proposition (<50%)',
    resolution: 'Add supporting citations or narrow proposition',
    autoResolvable: false,
  },

  // ATTORNEY_REVIEW flags - Requires approval
  UNPUBLISHED_REVIEW: {
    code: 'UNPUBLISHED_REVIEW',
    category: 'ATTORNEY_REVIEW',
    severity: 'high',
    messageTemplate: 'Unpublished opinion requires attorney approval',
    resolution: 'Approve for use or replace with published authority',
    autoResolvable: false,
  },
  QUOTE_MISMATCH: {
    code: 'QUOTE_MISMATCH',
    category: 'ATTORNEY_REVIEW',
    severity: 'high',
    messageTemplate: 'Quote differs from source (80-89% match)',
    resolution: 'Verify and correct quote if needed',
    autoResolvable: false,
  },
  WEAK_SUPPORT: {
    code: 'WEAK_SUPPORT',
    category: 'ATTORNEY_REVIEW',
    severity: 'medium',
    messageTemplate: 'Citation provides weak support (50-69%)',
    resolution: 'Add supporting citations or narrow proposition',
    autoResolvable: false,
  },
  DICTA_WARNING: {
    code: 'DICTA_WARNING',
    category: 'ATTORNEY_REVIEW',
    severity: 'medium',
    messageTemplate: 'Cited text may be dicta rather than holding',
    resolution: 'Verify if dicta is appropriate for this use',
    autoResolvable: false,
  },
  VERIFICATION_FAILED: {
    code: 'VERIFICATION_FAILED',
    category: 'ATTORNEY_REVIEW',
    severity: 'medium',
    messageTemplate: 'Citation could not be verified after multiple attempts',
    resolution: 'Manually verify citation before filing',
    autoResolvable: false,
  },
  CITATION_NOT_FOUND: {
    code: 'CITATION_NOT_FOUND',
    category: 'ATTORNEY_REVIEW',
    severity: 'medium',
    messageTemplate: 'Citation could not be located in databases',
    resolution: 'Verify citation format and existence',
    autoResolvable: false,
  },
  NEGATIVE_TREATMENT: {
    code: 'NEGATIVE_TREATMENT',
    category: 'ATTORNEY_REVIEW',
    severity: 'medium',
    messageTemplate: 'Citation has received negative treatment',
    resolution: 'Review treatment history and consider alternatives',
    autoResolvable: false,
  },
  CITATION_NEEDS_VERIFICATION: {
    code: 'CITATION_NEEDS_VERIFICATION',
    category: 'ATTORNEY_REVIEW',
    severity: 'medium',
    messageTemplate: 'Citation not in bank, needs Mini Phase IV verification',
    resolution: 'Run verification or add manually',
    autoResolvable: true,
  },

  // INFO flags - Informational
  UNPUBLISHED_APPROVED: {
    code: 'UNPUBLISHED_APPROVED',
    category: 'INFO',
    severity: 'info',
    messageTemplate: 'Unpublished opinion approved by attorney',
    autoResolvable: true,
  },
  UNPUBLISHED_OPINION: {
    code: 'UNPUBLISHED_OPINION',
    category: 'INFO',
    severity: 'low',
    messageTemplate: 'Citation is to an unpublished opinion',
    resolution: 'Check local rules for citability',
    autoResolvable: true,
  },
  PARTIAL_SUPPORT_DETECTED: {
    code: 'PARTIAL_SUPPORT_DETECTED',
    category: 'INFO',
    severity: 'low',
    messageTemplate: 'Citation provides partial support (70-89%)',
    autoResolvable: true,
  },
  QUOTE_MINOR_DISCREPANCY: {
    code: 'QUOTE_MINOR_DISCREPANCY',
    category: 'INFO',
    severity: 'low',
    messageTemplate: 'Quote has minor discrepancy (90-94% match)',
    autoResolvable: true,
  },
  VERIFIED_VIA_MINI_PHASE_IV: {
    code: 'VERIFIED_VIA_MINI_PHASE_IV',
    category: 'INFO',
    severity: 'info',
    messageTemplate: 'Citation verified via Mini Phase IV',
    autoResolvable: true,
  },
  VERIFICATION_RETRY_PENDING: {
    code: 'VERIFICATION_RETRY_PENDING',
    category: 'INFO',
    severity: 'info',
    messageTemplate: 'Verification will be retried',
    autoResolvable: true,
  },
  AUTHORITY_DECLINING: {
    code: 'AUTHORITY_DECLINING',
    category: 'INFO',
    severity: 'low',
    messageTemplate: 'Authority strength is declining (citation frequency decreasing)',
    autoResolvable: true,
  },
  CITATION_FORMAT_WARNING: {
    code: 'CITATION_FORMAT_WARNING',
    category: 'INFO',
    severity: 'info',
    messageTemplate: 'Citation format has minor issues',
    autoResolvable: true,
  },
};

// ============================================================================
// FLAG MANAGER CLASS
// ============================================================================

export class FlagManager {
  private orderId: string;
  private flags: Map<string, Flag>;
  private modified: boolean;

  constructor(orderId: string, initialFlags: Flag[] = []) {
    this.orderId = orderId;
    this.flags = new Map();
    this.modified = false;

    for (const flag of initialFlags) {
      const key = this.getFlagKey(flag.code, flag.citation);
      this.flags.set(key, flag);
    }
  }

  /**
   * Generate unique key for a flag
   */
  private getFlagKey(code: string, citation?: string): string {
    return citation ? `${code}:${citation}` : code;
  }

  /**
   * Add a flag
   */
  addFlag(
    code: string,
    options?: {
      citation?: string;
      step?: number;
      details?: Record<string, unknown>;
      customMessage?: string;
    }
  ): Flag {
    const definition = FLAG_DEFINITIONS[code];
    if (!definition) {
      throw new Error(`Unknown flag code: ${code}`);
    }

    const flag: Flag = {
      code,
      category: definition.category,
      severity: definition.severity,
      message: options?.customMessage || definition.messageTemplate,
      details: options?.details,
      citation: options?.citation,
      step: options?.step,
      createdAt: new Date(),
    };

    const key = this.getFlagKey(code, options?.citation);
    this.flags.set(key, flag);
    this.modified = true;

    console.log(`[FlagManager] Added flag: ${code} (${definition.category})`);
    return flag;
  }

  /**
   * Remove a flag
   */
  removeFlag(code: string, citation?: string): boolean {
    const key = this.getFlagKey(code, citation);
    const existed = this.flags.has(key);
    this.flags.delete(key);
    if (existed) {
      this.modified = true;
      console.log(`[FlagManager] Removed flag: ${code}`);
    }
    return existed;
  }

  /**
   * Resolve a flag
   */
  resolveFlag(
    code: string,
    resolvedBy: string,
    resolution: string,
    citation?: string
  ): boolean {
    const key = this.getFlagKey(code, citation);
    const flag = this.flags.get(key);

    if (!flag) {
      return false;
    }

    flag.resolvedAt = new Date();
    flag.resolvedBy = resolvedBy;
    flag.resolution = resolution;
    this.modified = true;

    console.log(`[FlagManager] Resolved flag: ${code} by ${resolvedBy}`);
    return true;
  }

  /**
   * Check if flag exists
   */
  hasFlag(code: string, citation?: string): boolean {
    const key = this.getFlagKey(code, citation);
    const flag = this.flags.get(key);
    return flag ? !flag.resolvedAt : false;
  }

  /**
   * Get all active flags
   */
  getActiveFlags(): Flag[] {
    return Array.from(this.flags.values()).filter(f => !f.resolvedAt);
  }

  /**
   * Get flags by category
   */
  getFlagsByCategory(category: FlagCategory): Flag[] {
    return this.getActiveFlags().filter(f => f.category === category);
  }

  /**
   * Check if there are any blocking flags
   */
  hasBlockingFlags(): boolean {
    return this.getActiveFlags().some(f => f.category === 'BLOCKING');
  }

  /**
   * Check if there are any review flags
   */
  hasReviewFlags(): boolean {
    return this.getActiveFlags().some(f => f.category === 'ATTORNEY_REVIEW');
  }

  /**
   * Get blocking flags
   */
  getBlockingFlags(): Flag[] {
    return this.getFlagsByCategory('BLOCKING');
  }

  /**
   * Get review flags
   */
  getReviewFlags(): Flag[] {
    return this.getFlagsByCategory('ATTORNEY_REVIEW');
  }

  /**
   * Get info flags
   */
  getInfoFlags(): Flag[] {
    return this.getFlagsByCategory('INFO');
  }

  /**
   * Get flag state
   */
  getState(): FlagState {
    return {
      orderId: this.orderId,
      flags: Array.from(this.flags.values()),
      hasBlockingFlags: this.hasBlockingFlags(),
      hasReviewFlags: this.hasReviewFlags(),
      lastUpdated: new Date(),
    };
  }

  /**
   * Get summary statistics
   */
  getSummary(): {
    total: number;
    active: number;
    resolved: number;
    blocking: number;
    review: number;
    info: number;
    bySeverity: Record<FlagSeverity, number>;
  } {
    const all = Array.from(this.flags.values());
    const active = this.getActiveFlags();

    return {
      total: all.length,
      active: active.length,
      resolved: all.filter(f => f.resolvedAt).length,
      blocking: this.getBlockingFlags().length,
      review: this.getReviewFlags().length,
      info: this.getInfoFlags().length,
      bySeverity: {
        critical: active.filter(f => f.severity === 'critical').length,
        high: active.filter(f => f.severity === 'high').length,
        medium: active.filter(f => f.severity === 'medium').length,
        low: active.filter(f => f.severity === 'low').length,
        info: active.filter(f => f.severity === 'info').length,
      },
    };
  }

  /**
   * Can the workflow proceed?
   */
  canProceed(): { allowed: boolean; reason?: string } {
    if (this.hasBlockingFlags()) {
      const blocking = this.getBlockingFlags();
      return {
        allowed: false,
        reason: `${blocking.length} blocking flag(s): ${blocking.map(f => f.code).join(', ')}`,
      };
    }
    return { allowed: true };
  }

  /**
   * Check if workflow is modified
   */
  isModified(): boolean {
    return this.modified;
  }

  /**
   * Save flags to database
   */
  async save(): Promise<{ success: boolean; error?: string }> {
    if (!this.modified) {
      return { success: true };
    }

    try {
      const supabase = await createClient();

      // Get current order
      const { data: order, error: fetchError } = await supabase
        .from('orders')
        .select('verification_flags')
        .eq('id', this.orderId)
        .single();

      if (fetchError) {
        throw fetchError;
      }

      // Update flags
      const { error: updateError } = await supabase
        .from('orders')
        .update({
          verification_flags: Array.from(this.flags.values()),
          updated_at: new Date().toISOString(),
        })
        .eq('id', this.orderId);

      if (updateError) {
        throw updateError;
      }

      this.modified = false;
      console.log(`[FlagManager] Saved ${this.flags.size} flags for order ${this.orderId}`);
      return { success: true };
    } catch (error) {
      console.error('[FlagManager] Save error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Load flags from database
   */
  static async load(orderId: string): Promise<FlagManager> {
    try {
      const supabase = await createClient();

      const { data, error } = await supabase
        .from('orders')
        .select('verification_flags')
        .eq('id', orderId)
        .single();

      if (error) {
        console.warn(`[FlagManager] Could not load flags for ${orderId}:`, error);
        return new FlagManager(orderId);
      }

      const flags = (data.verification_flags || []) as Flag[];
      return new FlagManager(orderId, flags);
    } catch (error) {
      console.error('[FlagManager] Load error:', error);
      return new FlagManager(orderId);
    }
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get flag definition
 */
export function getFlagDefinition(code: string): FlagDefinition | undefined {
  return FLAG_DEFINITIONS[code];
}

/**
 * Get all flag definitions by category
 */
export function getFlagDefinitionsByCategory(category: FlagCategory): FlagDefinition[] {
  return Object.values(FLAG_DEFINITIONS).filter(d => d.category === category);
}

/**
 * Create flags from verification result
 */
export function createFlagsFromVerificationResult(
  verificationFlags: string[],
  citation: string
): Array<{ code: string; citation: string }> {
  return verificationFlags
    .filter(code => FLAG_DEFINITIONS[code])
    .map(code => ({ code, citation }));
}

/**
 * Check if a flag code is valid
 */
export function isValidFlagCode(code: string): boolean {
  return code in FLAG_DEFINITIONS;
}

/**
 * Get blocking message for order
 */
export function getBlockingMessage(flags: Flag[]): string {
  const blocking = flags.filter(f => f.category === 'BLOCKING' && !f.resolvedAt);

  if (blocking.length === 0) {
    return 'No blocking issues';
  }

  const messages = blocking.map(f => `• ${f.code}: ${f.message}`);
  return `Motion blocked by ${blocking.length} issue(s):\n${messages.join('\n')}`;
}

/**
 * Get review summary for attorney
 */
export function getReviewSummary(flags: Flag[]): string {
  const review = flags.filter(f => f.category === 'ATTORNEY_REVIEW' && !f.resolvedAt);

  if (review.length === 0) {
    return 'No items requiring attorney review';
  }

  const messages = review.map(f => {
    const def = FLAG_DEFINITIONS[f.code];
    const resolution = def?.resolution || 'Review and resolve';
    return `• ${f.code}: ${f.message}\n  Suggested action: ${resolution}`;
  });

  return `${review.length} item(s) require attorney review:\n${messages.join('\n\n')}`;
}

// ============================================================================
// EXPORTS
// ============================================================================

export {
  FLAG_DEFINITIONS,
};

export default FlagManager;
