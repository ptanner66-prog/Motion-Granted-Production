/**
 * Citation Statistics Aggregation
 *
 * Returns citation verification metrics matching the CitationStatsCard interface.
 */

import { createClient } from '@/lib/supabase/server';

export interface CitationStatsResponse {
  totalCitations: number;
  verifiedCount: number;
  failedCount: number;
  flaggedCount: number;
  verificationRate: number;
  avgCitationsPerOrder: number;
  topFailureReasons: Array<{ reason: string; count: number }>;
}

interface CitationRow {
  id: string;
  order_id: string;
  verification_status: string;
  stage_1_result: string | null;
  stage_2_result: string | null;
  stage_3_result: string | null;
}

export async function getCitationStats(): Promise<CitationStatsResponse> {
  const supabase = await createClient();

  const { data: citations, error } = await supabase
    .from('citation_verifications')
    .select('id, order_id, verification_status, stage_1_result, stage_2_result, stage_3_result')
    .limit(2000);

  if (error || !citations || citations.length === 0) {
    return {
      totalCitations: 0,
      verifiedCount: 0,
      failedCount: 0,
      flaggedCount: 0,
      verificationRate: 0,
      avgCitationsPerOrder: 0,
      topFailureReasons: [],
    };
  }

  const rows = citations as CitationRow[];
  const totalCitations = rows.length;
  const verifiedCount = rows.filter((c: CitationRow) => c.verification_status === 'VERIFIED').length;
  const failedCount = rows.filter((c: CitationRow) => c.verification_status === 'FAILED').length;
  const flaggedCount = rows.filter((c: CitationRow) =>
    c.verification_status === 'FLAGGED' || c.verification_status === 'PENDING'
  ).length;

  const verificationRate = totalCitations > 0
    ? Math.round((verifiedCount / totalCitations) * 100)
    : 0;

  // Average citations per unique order
  const uniqueOrders = new Set(rows.map((c: CitationRow) => c.order_id).filter(Boolean));
  const avgCitationsPerOrder = uniqueOrders.size > 0
    ? Math.round((totalCitations / uniqueOrders.size) * 10) / 10
    : 0;

  // Determine failure reasons from stage results
  const failureReasonCounts = new Map<string, number>();
  rows
    .filter((c: CitationRow) => c.verification_status === 'FAILED')
    .forEach((c: CitationRow) => {
      let reason = 'Unknown';
      if (c.stage_1_result === 'FAIL') {
        reason = 'Citation not found';
      } else if (c.stage_2_result === 'FAIL') {
        reason = 'Reporter mismatch';
      } else if (c.stage_3_result === 'FAIL') {
        reason = 'Holding unsupported';
      }
      failureReasonCounts.set(reason, (failureReasonCounts.get(reason) || 0) + 1);
    });

  const topFailureReasons = Array.from(failureReasonCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([reason, count]) => ({ reason, count }));

  return {
    totalCitations,
    verifiedCount,
    failedCount,
    flaggedCount,
    verificationRate,
    avgCitationsPerOrder,
    topFailureReasons,
  };
}
