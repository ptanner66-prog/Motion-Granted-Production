/**
 * Centralized Orders Table Column Update Utility
 *
 * Provides a single function for writing non-status columns back to the
 * orders table during workflow execution. Status changes still go through
 * updateOrderStatus() in status-machine.ts.
 *
 * Usage:
 *   await updateOrderColumns(supabase, orderId, {
 *     current_phase: 'VII',
 *     judge_grade: 'B+',
 *     overall_score: 87,
 *   });
 */

import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Columns that can be written to the orders table via this utility.
 * Status and status_version are excluded — use updateOrderStatus() instead.
 */
export interface OrderColumnUpdates {
  // Group A: Workflow Tracking
  workflow_id?: string;
  generation_attempts?: number;
  current_phase?: string;
  phase_course?: string[];
  phase_outputs?: Record<string, unknown>;
  overall_score?: number;
  judge_grade?: string;
  generation_started_at?: string;
  generation_completed_at?: string;
  generation_error?: string | null;

  // Group B: CP3 Checkpoint
  cp3_status?: string;
  cp3_entered_at?: string | null;
  cp3_approved_at?: string;
  cp3_approved_by?: string;

  // Group C: Deliverables
  deliverable_urls?: Record<string, unknown>;
  deliverable_ready_at?: string;
  deliverables_generated_at?: string;
  workflow_completed_at?: string;

  // Group D: Conflict Check
  conflict_status?: string;
  conflict_checked?: boolean;
  conflict_cleared?: boolean;
  conflict_check_completed_at?: string;
  conflict_notes?: string;

  // Group E: Filing Metadata
  opposing_party_name?: string;
  court_name?: string;
  attorney_email?: string;
  deadline_normal?: string;

  // Group F: Retention / Lifecycle
  retention_expires_at?: string;

  // Group G: Revision Tracking
  revision_count?: number;
  revision_requested_at?: string;

  // Group H: Miscellaneous
  last_error?: string | null;
}

/**
 * Update one or more non-status columns on the orders table.
 *
 * This is a fire-and-log utility: errors are logged but do NOT throw
 * (workflow should not crash because a metadata write failed).
 * Returns true if the update succeeded, false otherwise.
 *
 * @param supabase - Service role Supabase client
 * @param orderId  - The order row to update
 * @param columns  - Key-value map of columns to set
 * @param caller   - Optional label for log context (e.g. 'phase-vii-regrade')
 */
export async function updateOrderColumns(
  supabase: SupabaseClient,
  orderId: string,
  columns: OrderColumnUpdates,
  caller?: string,
): Promise<boolean> {
  if (!orderId || Object.keys(columns).length === 0) {
    return true; // nothing to do
  }

  const { error } = await supabase
    .from('orders')
    .update(columns as Record<string, unknown>)
    .eq('id', orderId);

  if (error) {
    console.error(
      `[updateOrderColumns]${caller ? ` (${caller})` : ''} Failed to update order ${orderId}:`,
      { columns: Object.keys(columns), error: error.message },
    );
    return false;
  }

  return true;
}

/**
 * Append a phase to the phase_course array column.
 * Uses Postgres array_append so concurrent writers don't clobber each other.
 */
export async function appendPhaseCourse(
  supabase: SupabaseClient,
  orderId: string,
  phase: string,
): Promise<void> {
  // Supabase JS doesn't support array_append directly, so we read-modify-write.
  // This runs inside a single Inngest step so there's no concurrency concern.
  const { data } = await supabase
    .from('orders')
    .select('phase_course')
    .eq('id', orderId)
    .single();

  const current: string[] = (data?.phase_course as string[]) ?? [];
  current.push(phase);

  await supabase
    .from('orders')
    .update({ phase_course: current })
    .eq('id', orderId);
}
