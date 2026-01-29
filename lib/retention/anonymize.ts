// lib/retention/anonymize.ts
// Anonymize order data for analytics before deletion
// Task 44 | Version 1.0 — January 28, 2026

import { createClient } from '@/lib/supabase/server';

/**
 * Grade to numeric GPA mapping
 */
const GRADE_MAP: Record<string, number> = {
  'A+': 4.3, 'A': 4.0, 'A-': 3.7,
  'B+': 3.3, 'B': 3.0, 'B-': 2.7,
  'C+': 2.3, 'C': 2.0, 'C-': 1.7,
  'D+': 1.3, 'D': 1.0, 'D-': 0.7,
  'F': 0.0,
};

/**
 * Anonymize order data for permanent analytics storage
 *
 * MUST be called BEFORE deleting order data.
 * Stores non-PII metrics for business analytics.
 */
export async function anonymizeOrderForAnalytics(orderId: string): Promise<void> {
  const supabase = await createClient();

  // Check if already anonymized
  const { data: existing } = await supabase
    .from('anonymized_analytics')
    .select('id')
    .eq('original_order_id', orderId)
    .single();

  if (existing) {
    console.log(`[Anonymize] Order ${orderId} already anonymized`);
    return;
  }

  // Get order data
  const { data: order, error: orderError } = await supabase
    .from('orders')
    .select(`
      id,
      created_at,
      delivered_at,
      motion_type,
      tier,
      path,
      jurisdiction,
      court_type,
      state
    `)
    .eq('id', orderId)
    .single();

  if (orderError || !order) {
    console.error(`[Anonymize] Could not fetch order ${orderId}:`, orderError);
    throw new Error('Order not found');
  }

  // Get workflow data (may not exist)
  const { data: workflow } = await supabase
    .from('order_workflows')
    .select(`
      judge_simulation_grade,
      revision_loop_count,
      phases_completed,
      workflow_version
    `)
    .eq('order_id', orderId)
    .single();

  // Get citation statistics
  const { data: citations } = await supabase
    .from('citation_verifications')
    .select('status')
    .eq('order_id', orderId);

  // Calculate turnaround hours
  let turnaroundHours: number | null = null;
  if (order.delivered_at && order.created_at) {
    const deliveredAt = new Date(order.delivered_at);
    const createdAt = new Date(order.created_at);
    turnaroundHours = Math.round(
      (deliveredAt.getTime() - createdAt.getTime()) / (1000 * 60 * 60)
    );
  }

  // Calculate citation stats
  type CitationRecord = { status: string };
  const totalCitations = citations?.length || 0;
  const citationsVerified = citations?.filter((c: CitationRecord) => c.status === 'VERIFIED').length || 0;
  const citationsFailed = citations?.filter((c: CitationRecord) =>
    c.status === 'FAILED' || c.status === 'BLOCKED'
  ).length || 0;
  const citationsFlagged = citations?.filter((c: CitationRecord) => c.status === 'FLAGGED').length || 0;

  // Convert grade to numeric
  const gradeNumeric = workflow?.judge_simulation_grade
    ? GRADE_MAP[workflow.judge_simulation_grade] ?? null
    : null;

  // Insert anonymized record
  const { error: insertError } = await supabase
    .from('anonymized_analytics')
    .insert({
      original_order_id: orderId,
      order_created_at: order.created_at,
      order_delivered_at: order.delivered_at,
      motion_type: order.motion_type,
      motion_tier: order.tier,
      motion_path: order.path,
      jurisdiction_type: order.jurisdiction,
      court_type: order.court_type,
      state: order.state,
      judge_simulation_grade: workflow?.judge_simulation_grade || null,
      judge_simulation_grade_numeric: gradeNumeric,
      revision_loop_count: workflow?.revision_loop_count || 0,
      total_citations: totalCitations,
      citations_verified: citationsVerified,
      citations_failed: citationsFailed,
      citations_flagged: citationsFlagged,
      turnaround_hours: turnaroundHours,
      phases_completed: workflow?.phases_completed || 0,
      workflow_version: workflow?.workflow_version || null,
    });

  if (insertError) {
    console.error(`[Anonymize] Error inserting analytics for ${orderId}:`, insertError);
    throw insertError;
  }

  console.log(`[Anonymize] Created analytics record for order ${orderId}`);
}
