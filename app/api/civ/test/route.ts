/**
 * CIV Test Endpoint
 *
 * Tests the entire Citation Integrity Verification pipeline with a known citation.
 * Admin-only endpoint for verifying production readiness.
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { verifyCitation } from '@/lib/civ/pipeline';
import type { CitationToVerify, PropositionType } from '@/lib/civ/types';
import { createLogger } from '@/lib/security/logger';

const log = createLogger('api-civ-test');

export const maxDuration = 60; // 60 seconds for full CIV pipeline

export async function POST(request: Request) {
  const startTime = Date.now();

  try {
    const supabase = await createClient();

    // Verify admin access
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profile?.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden - Admin access required' }, { status: 403 });
    }

    // Parse request body
    const body = await request.json().catch(() => ({}));

    // Default test citation: Celotex Corp. v. Catrett (landmark summary judgment case)
    const testInput: CitationToVerify = {
      citationString: body.citation || 'Celotex Corp. v. Catrett, 477 U.S. 317 (1986)',
      proposition:
        body.proposition ||
        'The moving party bears the initial burden of showing the absence of a genuine issue of material fact',
      propositionType: (body.proposition_type as PropositionType) || 'PRIMARY_STANDARD',
      motionTypeContext: body.motion_type || 'motion_for_summary_judgment',
    };

    log.info('Starting test', {
      citation: testInput.citationString,
      proposition: testInput.proposition.substring(0, 50) + '...',
      motionType: testInput.motionTypeContext,
    });

    // Run the full CIV pipeline
    const result = await verifyCitation(
      testInput,
      'test-order-' + Date.now(),
      'V.1' // Phase V.1 (initial research)
    );

    const duration = Date.now() - startTime;

    log.info('Test completed', { durationMs: duration, status: result.compositeResult.status, confidence: result.compositeResult.confidenceScore });

    return NextResponse.json({
      success: true,
      duration_ms: duration,
      input: {
        citation: testInput.citationString,
        proposition: testInput.proposition,
        proposition_type: testInput.propositionType,
        motion_type: testInput.motionTypeContext,
      },
      result: {
        status: result.compositeResult.status,
        confidence: result.compositeResult.confidenceScore,
        flags: result.compositeResult.flags,
        action_required: result.compositeResult.actionRequired,
        steps: {
          step1_existence: {
            result: result.verificationResults.step1Existence.result,
            sources_checked: result.verificationResults.step1Existence.sourcesChecked,
            courtlistener_id: result.verificationResults.step1Existence.courtlistenerId,
          },
          step2_holding: {
            final_result: result.verificationResults.step2Holding.finalResult,
            final_confidence: result.verificationResults.step2Holding.finalConfidence,
            stage1_model: result.verificationResults.step2Holding.stage1.model,
            stage2_triggered: result.verificationResults.step2Holding.stage2?.triggered,
            stage2_model: result.verificationResults.step2Holding.stage2?.model,
          },
          step3_dicta: {
            classification: result.verificationResults.step3Dicta.classification,
            action_taken: result.verificationResults.step3Dicta.actionTaken,
          },
          step4_quote: {
            result: result.verificationResults.step4Quote.result,
            action_taken: result.verificationResults.step4Quote.actionTaken,
          },
          step5_bad_law: {
            composite_status: result.verificationResults.step5BadLaw.compositeStatus,
            proceed_to_step6: result.verificationResults.step5BadLaw.proceedToStep6,
          },
          step6_strength: {
            stability_class: result.verificationResults.step6Strength.stabilityClass,
            strength_score: result.verificationResults.step6Strength.strengthScore,
            assessment: result.verificationResults.step6Strength.assessment,
          },
        },
        models_used: result.metadata.modelsUsed,
        api_calls: result.metadata.apiCallsMade,
        estimated_cost: result.metadata.estimatedCost,
      },
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    log.error('CIV test error', { error: error instanceof Error ? error.message : error });

    return NextResponse.json(
      {
        success: false,
        duration_ms: duration,
        error: 'CIV pipeline test failed. Check server logs for details.',
      },
      { status: 500 }
    );
  }
}

// GET endpoint for simple health check
export async function GET() {
  return NextResponse.json({
    status: 'ok',
    endpoint: '/api/civ/test',
    description: 'CIV Pipeline Test Endpoint',
    usage: {
      method: 'POST',
      body: {
        citation: 'Optional - citation string to test',
        proposition: 'Optional - proposition to verify',
        proposition_type: 'Optional - PRIMARY_STANDARD | REQUIRED_ELEMENT | SECONDARY | CONTEXT',
        motion_type: 'Optional - motion type for tier-based routing',
      },
      default_test: {
        citation: 'Celotex Corp. v. Catrett, 477 U.S. 317 (1986)',
        motion_type: 'motion_for_summary_judgment',
      },
    },
  });
}
