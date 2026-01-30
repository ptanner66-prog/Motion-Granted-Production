/**
 * CIV Report Generation API
 *
 * GET: Generate citation verification report for an order
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { id: orderId } = await params;

  // Auth check
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Check authorization - admin or clerk only
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  const isAdmin = profile?.role === 'admin' || profile?.role === 'clerk';
  if (!isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    // Get order details
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('order_number, motion_type, jurisdiction')
      .eq('id', orderId)
      .single();

    if (orderError || !order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    // Get latest CIV verification run
    const { data: verificationRun, error: runError } = await supabase
      .from('civ_verification_runs')
      .select('*')
      .eq('order_id', orderId)
      .order('completed_at', { ascending: false })
      .limit(1)
      .single();

    if (runError || !verificationRun) {
      return NextResponse.json(
        { error: 'No verification run found for this order' },
        { status: 404 }
      );
    }

    // Format report per spec
    const report = formatVerificationReport(order, verificationRun);

    return NextResponse.json({
      success: true,
      report,
    });
  } catch (error) {
    console.error('CIV report generation error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Report generation failed' },
      { status: 500 }
    );
  }
}

function formatVerificationReport(
  order: { order_number: string; motion_type: string; jurisdiction: string },
  run: {
    id: string;
    run_phase: string;
    completed_at: string;
    total_citations: number;
    verified_count: number;
    flagged_count: number;
    rejected_count: number;
    blocked_count: number;
    average_confidence: number;
    total_api_calls: number;
    total_cost_estimate: number;
    results: unknown;
  }
) {
  const results = run.results as Array<{
    citation: { input: string };
    proposition: { text: string };
    compositeResult: { status: string; confidenceScore: number; flags: Array<{ message: string }> };
    verificationResults: { step6Strength: { stabilityClass: string; strengthScore: number } };
  }> | null;

  // Build summary section
  const summary = `CITATION VERIFICATION REPORT
Order #: ${order.order_number}
Motion: ${order.motion_type}
Jurisdiction: ${order.jurisdiction}
Verified: ${new Date(run.completed_at).toLocaleString()} CST

SUMMARY
${'━'.repeat(50)}
Total Citations Verified:     ${run.total_citations}
Verified (No Issues):         ${run.verified_count}  (${Math.round((run.verified_count / run.total_citations) * 100)}%)
Verified with Notes:          ${run.flagged_count}  (${Math.round((run.flagged_count / run.total_citations) * 100)}%)
Flagged for Review:           ${run.rejected_count}  (${Math.round((run.rejected_count / run.total_citations) * 100)}%)
Removed (Unverifiable):       ${run.blocked_count}  (${Math.round((run.blocked_count / run.total_citations) * 100)}%)

Average Confidence Score:     ${run.average_confidence?.toFixed(2) || 'N/A'}
Verification Time:            ${run.total_api_calls || 0} API calls
Estimated Cost:               $${run.total_cost_estimate?.toFixed(2) || '0.00'}`;

  // Build detailed results section
  let details = `

DETAILED VERIFICATION RESULTS
${'━'.repeat(50)}
`;

  if (results && Array.isArray(results)) {
    results.forEach((result, index) => {
      const statusEmoji =
        result.compositeResult.status === 'VERIFIED' ? '✓' :
        result.compositeResult.status === 'FLAGGED' ? '⚠️' :
        result.compositeResult.status === 'REJECTED' ? '✗' : '⛔';

      details += `
${index + 1}. ${result.citation.input}
   Proposition: "${truncate(result.proposition.text, 60)}"
   Status: ${statusEmoji} ${result.compositeResult.status}
   Confidence: ${(result.compositeResult.confidenceScore * 100).toFixed(0)}%
   Authority: ${result.verificationResults.step6Strength.stabilityClass} (strength: ${result.verificationResults.step6Strength.strengthScore})`;

      if (result.compositeResult.flags.length > 0) {
        details += `
   Issues: ${result.compositeResult.flags.map(f => f.message).join('; ')}`;
      }

      details += '\n';
    });
  }

  // Build disclosure section per spec
  const disclosure = `

CITATION VERIFICATION SCOPE
${'━'.repeat(50)}

Motion Granted verifies:
✓ Citation existence (case found in legal databases)
✓ Holding accuracy (case supports stated proposition)
✓ Dicta detection (holding vs. judicial commentary)
✓ Quote accuracy (quoted text appears in source)
✓ Bad law status (overruled, reversed, vacated)
✓ Authority strength (citation patterns and treatment)

Motion Granted does NOT verify:
✗ Pinpoint page accuracy — attorney verification recommended
✗ Secondary sources (Witkin, Rutter, treatises) — outside scope
✗ Nuanced negative treatment — independent Shepardizing recommended
✗ Statutory amendments — tracked for common statutes only
✗ Unpublished opinions — limited verification available

ERROR RATE DISCLOSURE:
Per-citation undetected error rate: ~0.08%
Per-motion undetected error rate: ~2.5%`;

  return {
    text: summary + details + disclosure,
    structured: {
      orderId: order.order_number,
      motionType: order.motion_type,
      verifiedAt: run.completed_at,
      phase: run.run_phase,
      totals: {
        total: run.total_citations,
        verified: run.verified_count,
        flagged: run.flagged_count,
        rejected: run.rejected_count,
        blocked: run.blocked_count,
      },
      averageConfidence: run.average_confidence,
      estimatedCost: run.total_cost_estimate,
      results: results || [],
    },
  };
}

function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.substring(0, maxLength - 3) + '...';
}
