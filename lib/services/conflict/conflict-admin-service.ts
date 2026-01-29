// /lib/services/conflict/conflict-admin-service.ts
// Admin service for conflict review and management
// VERSION: 1.0 — January 28, 2026

import { createClient } from '@/lib/supabase/server';
import {
  ConflictRecord,
  ConflictReviewRequest,
  ConflictAdminStats,
  ConflictCheckResult,
} from '@/types/conflict';

export interface ReviewResult {
  success: boolean;
  error?: string;
}

export interface ConflictListItem {
  id: string;
  orderId: string;
  orderNumber: string;
  clientName: string;
  severity: string;
  matchCount: number;
  status: string;
  createdAt: string;
}

/**
 * Get list of conflicts pending review
 */
export async function getPendingConflicts(): Promise<ConflictListItem[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('conflict_checks')
    .select(`
      id,
      order_id,
      check_result,
      status,
      created_at,
      orders!inner (
        order_number,
        clients!inner (
          full_name
        )
      )
    `)
    .eq('status', 'pending_review')
    .order('created_at', { ascending: false });

  if (error || !data) return [];

  interface ConflictItem {
    id: string;
    order_id: string;
    check_result: unknown;
    status: string;
    created_at: string;
    orders?: { order_number?: string; clients?: { full_name?: string } };
  }

  return data.map((item: ConflictItem) => {
    const result = item.check_result as ConflictCheckResult;
    return {
      id: item.id,
      orderId: item.order_id,
      orderNumber: item.orders?.order_number || 'Unknown',
      clientName: item.orders?.clients?.full_name || 'Unknown',
      severity: result.severity,
      matchCount: result.matches.length,
      status: item.status,
      createdAt: item.created_at,
    };
  });
}

/**
 * Get detailed conflict record by ID
 */
export async function getConflictById(conflictId: string): Promise<ConflictRecord | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('conflict_checks')
    .select(`
      *,
      orders (
        order_number,
        case_name,
        court_name,
        motion_type
      )
    `)
    .eq('id', conflictId)
    .single();

  if (error || !data) return null;

  return {
    id: data.id,
    orderId: data.order_id,
    clientId: data.client_id,
    checkResult: data.check_result as ConflictCheckResult,
    status: data.status,
    reviewedBy: data.reviewed_by,
    reviewedAt: data.reviewed_at,
    reviewNotes: data.review_notes,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}

/**
 * Review a conflict (approve or reject)
 */
export async function reviewConflict(
  request: ConflictReviewRequest,
  reviewerId: string
): Promise<ReviewResult> {
  const supabase = await createClient();
  const { conflictId, action, reviewNotes } = request;

  try {
    const { error } = await supabase
      .from('conflict_checks')
      .update({
        status: action === 'approve' ? 'approved' : 'rejected',
        reviewed_by: reviewerId,
        reviewed_at: new Date().toISOString(),
        review_notes: reviewNotes || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', conflictId);

    if (error) {
      return { success: false, error: error.message };
    }

    // Log the review action
    const { data: conflict } = await supabase
      .from('conflict_checks')
      .select('order_id')
      .eq('id', conflictId)
      .single();

    if (conflict) {
      await supabase.from('workflow_events').insert({
        order_id: conflict.order_id,
        event_type: action === 'approve' ? 'CONFLICT_APPROVED' : 'CONFLICT_REJECTED',
        data: {
          conflict_id: conflictId,
          reviewer_id: reviewerId,
          notes: reviewNotes,
        },
        created_at: new Date().toISOString(),
      });
    }

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Get conflict statistics for admin dashboard
 */
export async function getConflictStats(): Promise<ConflictAdminStats> {
  const supabase = await createClient();

  const { data: allChecks } = await supabase
    .from('conflict_checks')
    .select('id, status, check_result');

  if (!allChecks) {
    return {
      totalChecks: 0,
      pendingReviews: 0,
      approvedCount: 0,
      rejectedCount: 0,
      hardConflicts: 0,
      softConflicts: 0,
    };
  }

  const stats: ConflictAdminStats = {
    totalChecks: allChecks.length,
    pendingReviews: 0,
    approvedCount: 0,
    rejectedCount: 0,
    hardConflicts: 0,
    softConflicts: 0,
  };

  for (const check of allChecks) {
    const result = check.check_result as ConflictCheckResult;

    switch (check.status) {
      case 'pending_review':
        stats.pendingReviews++;
        break;
      case 'approved':
        stats.approvedCount++;
        break;
      case 'rejected':
        stats.rejectedCount++;
        break;
    }

    if (result?.severity === 'HARD') {
      stats.hardConflicts++;
    } else if (result?.severity === 'SOFT') {
      stats.softConflicts++;
    }
  }

  return stats;
}

/**
 * Get conflict history for a client
 */
export async function getClientConflictHistory(clientId: string): Promise<ConflictListItem[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('conflict_checks')
    .select(`
      id,
      order_id,
      check_result,
      status,
      created_at,
      orders!inner (
        order_number
      )
    `)
    .eq('client_id', clientId)
    .order('created_at', { ascending: false });

  if (error || !data) return [];

  interface ConflictHistoryItem {
    id: string;
    order_id: string;
    check_result: unknown;
    status: string;
    created_at: string;
    orders?: { order_number?: string };
  }

  return data.map((item: ConflictHistoryItem) => {
    const result = item.check_result as ConflictCheckResult;
    return {
      id: item.id,
      orderId: item.order_id,
      orderNumber: item.orders?.order_number || 'Unknown',
      clientName: '', // Not needed for client history
      severity: result.severity,
      matchCount: result.matches.length,
      status: item.status,
      createdAt: item.created_at,
    };
  });
}

/**
 * Submit conflict decision via email action link
 * Wrapper for reviewConflict with different parameter interface
 */
export async function submitConflictDecision(params: {
  checkId: string;
  decision: 'APPROVE' | 'REJECT';
  reviewedBy: string;
  reviewedAt: Date;
  notes?: string;
}): Promise<ReviewResult> {
  return reviewConflict(
    {
      conflictId: params.checkId,
      action: params.decision === 'APPROVE' ? 'approve' : 'reject',
      reviewNotes: params.notes,
    },
    params.reviewedBy
  );
}

/**
 * Bulk approve soft conflicts older than specified days
 */
export async function bulkApproveSoftConflicts(
  olderThanDays: number,
  reviewerId: string
): Promise<{ approved: number; errors: string[] }> {
  const supabase = await createClient();
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

  const { data: conflicts, error: fetchError } = await supabase
    .from('conflict_checks')
    .select('id, check_result')
    .eq('status', 'pending_review')
    .lt('created_at', cutoffDate.toISOString());

  if (fetchError || !conflicts) {
    return { approved: 0, errors: [fetchError?.message || 'Failed to fetch conflicts'] };
  }

  let approved = 0;
  const errors: string[] = [];

  for (const conflict of conflicts) {
    const result = conflict.check_result as ConflictCheckResult;

    // Only auto-approve SOFT conflicts
    if (result.severity !== 'SOFT') continue;

    const reviewResult = await reviewConflict(
      {
        conflictId: conflict.id,
        action: 'approve',
        reviewNotes: `Auto-approved: SOFT conflict older than ${olderThanDays} days`,
      },
      reviewerId
    );

    if (reviewResult.success) {
      approved++;
    } else {
      errors.push(`${conflict.id}: ${reviewResult.error}`);
    }
  }

  return { approved, errors };
}
