/**
 * Motion Generation API - 14-Phase Workflow
 *
 * POST /api/orders/[id]/generate
 *
 * Triggers the new 14-phase workflow orchestrator via Inngest.
 * This replaces the old single-call superprompt system.
 *
 * v7.2: Uses workflow-orchestration.ts for proper phase execution,
 * checkpoints, and revision loops.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js';
import { inngest } from '@/lib/inngest/client';

export const maxDuration = 30; // Just enough to trigger the workflow

// Create admin client with service role key (bypasses RLS)
function getAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    return null;
  }

  return createSupabaseAdmin(supabaseUrl, supabaseServiceKey);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: orderId } = await params;
  const supabase = await createClient();
  const adminClient = getAdminClient();

  if (!adminClient) {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }

  // Verify auth
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Check admin/clerk role
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profile?.role !== 'admin' && profile?.role !== 'clerk') {
    return NextResponse.json({ error: 'Forbidden - Admin/Clerk only' }, { status: 403 });
  }

  try {
    // Verify order exists and get current state
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('id, status, motion_type, motion_tier, order_number')
      .eq('id', orderId)
      .single();

    if (orderError || !order) {
      return NextResponse.json(
        { error: 'Order not found' },
        { status: 404 }
      );
    }

    // Build full context: CASE DATA FIRST (so Claude sees it), then workflow template
    // Put case data at the BEGINNING so it doesn't get lost in the massive superprompt
    const fullContext = buildStreamlinedPrompt() + structuredCaseData + '\n\n' + templateContent;

    // Debug: Log replacements and final context preview
    console.log('[Generate] Replacements applied:', {
      case_number: replacements['{{CASE_NUMBER}}'],
      case_caption: replacements['{{CASE_CAPTION}}'],
      motion_type: replacements['{{MOTION_TYPE}}'],
      jurisdiction: replacements['{{JURISDICTION}}'],
      has_statement: !!replacements['{{STATEMENT_OF_FACTS}}'],
      statement_preview: replacements['{{STATEMENT_OF_FACTS}}']?.substring(0, 200),
      parties: replacements['{{ALL_PARTIES}}'],
      documents_length: replacements['{{DOCUMENT_CONTENT}}']?.length || 0,
    });
    console.log('[Generate] Context length:', fullContext.length, 'chars');

    // Generate with Claude (with automatic rate limit handling)
    console.log(`[Generate] Starting Claude generation for order ${orderId}`);

    // Put the critical instruction in the USER MESSAGE so it's the last thing Claude sees
    const userMessage = `CRITICAL: The case data has already been provided in the system context above. DO NOT ask for more information. DO NOT say "I need" or list requirements. DO NOT output Phase I status updates.

Your task: Using the customer_intake JSON and uploaded_documents provided above, generate the COMPLETE ${order.motion_type || 'motion'} document NOW.

START YOUR RESPONSE WITH THE COURT CAPTION:

IN THE ${order.jurisdiction === 'la_state' ? 'CIVIL DISTRICT COURT' : order.jurisdiction?.toUpperCase() || '[COURT]'}
${order.court_division ? `FOR THE ${order.court_division.toUpperCase()}` : ''}

${plaintiffs.map((p: { party_name: string }) => p.party_name).join(', ') || '[PLAINTIFF]'},
     Plaintiff${plaintiffs.length > 1 ? 's' : ''},

vs.                                    CASE NO. ${order.case_number || '[NUMBER]'}

${defendants.map((p: { party_name: string }) => p.party_name).join(', ') || '[DEFENDANT]'},
     Defendant${defendants.length > 1 ? 's' : ''}.

                    MOTION FOR ${(order.motion_type || 'RELIEF').toUpperCase().replace(/_/g, ' ')}

[NOW CONTINUE WITH THE COMPLETE MOTION DOCUMENT - Introduction, Statement of Facts, Legal Arguments, Conclusion, Prayer for Relief, Certificate of Service]`;

    const response = await createMessageWithRetry(
      {
        model: 'claude-opus-4-5-20251101',
        max_tokens: 64000,
        system: fullContext,
        messages: [{
          role: 'user',
          content: userMessage
        }],
      },
      {
        maxRetries: 5,
        onRetry: (attempt, waitMs, error) => {
          console.log(`[Generate] Retry ${attempt} for order ${orderId}. Waiting ${Math.round(waitMs / 1000)}s. Error: ${error}`);
          // Log retry to database
          adminClient.from('automation_logs').insert({
            order_id: orderId,
            action_type: 'generation_retry',
            action_details: { attempt, waitMs, error },
          }).then(() => {});
        },
        onSuccess: (inputTokens, outputTokens) => {
          console.log(`[Generate] Success for order ${orderId}. Tokens: ${inputTokens} in, ${outputTokens} out`);
        },
      }
    );

    const motionContent = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('\n');

    // Parse file operations and get cleaned content
    const { operations, cleanedResponse } = parseFileOperations(motionContent);

    // Execute file operations if any
    if (operations.length > 0) {
      await executeFileOperations(orderId, operations);
    }

    // Create or update conversation
    const { data: existingConv } = await adminClient
      .from('conversations')
      .select('id')
      .eq('order_id', orderId)
      .single();

    const workflowIsStuck = workflow && ['blocked', 'failed'].includes(workflow.status);
    const blockedStatuses = ['pending_review', 'draft_delivered', 'completed'];

    // Block if order is in a final/review state, unless workflow is stuck
    if (blockedStatuses.includes(order.status)) {
      return NextResponse.json(
        { error: `Order already in status: ${order.status}. Cannot restart workflow.` },
        { status: 400 }
      );
    }

    // Block if currently in progress AND workflow is not stuck
    if (order.status === 'in_progress' && !workflowIsStuck) {
      return NextResponse.json(
        { error: `Workflow is currently running. Please wait or use the restart button.` },
        { status: 400 }
      );
    }

    // Update status to in_progress (use admin client to bypass RLS)
    const { error: updateError } = await adminClient
      .from('orders')
      .update({
        status: 'in_progress',
        generation_started_at: new Date().toISOString(),
        generation_error: null,
      })
      .eq('id', orderId);

    if (updateError) {
      console.error('[Generate] Failed to update order status:', updateError);
      return NextResponse.json(
        { error: 'Failed to update order status' },
        { status: 500 }
      );
    }

    // Trigger the 14-phase workflow via Inngest
    // If INNGEST_EVENT_KEY is not configured, fall back to direct execution
    const inngestConfigured = process.env.INNGEST_EVENT_KEY && process.env.INNGEST_SIGNING_KEY;

    if (inngestConfigured) {
      await inngest.send({
        name: 'workflow/orchestration.start',
        data: {
          orderId,
          triggeredBy: 'admin_generate_now',
          timestamp: new Date().toISOString(),
        },
      });
    } else {
      // Fallback: Execute workflow directly using v7.2 phase executors
      console.log('[Generate] Inngest not configured, executing workflow directly with v7.2 system');

      // Import v7.2 phase executors and workflow functions
      const { executePhase } = await import('@/lib/workflow/phase-executors');
      const { startWorkflow } = await import('@/lib/workflow');

      // Execute phases in background (non-blocking)
      (async () => {
        try {
          // Check if workflow exists, create if not
          let { data: workflow } = await adminClient
            .from('order_workflows')
            .select('id')
            .eq('order_id', orderId)
            .single();

          if (!workflow) {
            console.log('[Generate] Workflow not found, creating new workflow');

            // Get motion type ID - try to match from motion_types table, or use first available
            let motionTypeId = null;

            const { data: motionTypeData } = await adminClient
              .from('motion_types')
              .select('id')
              .eq('code', (order.motion_type || '').toUpperCase())
              .single();

            if (motionTypeData) {
              motionTypeId = motionTypeData.id;
            } else {
              // Fallback to first motion type
              const { data: fallbackType } = await adminClient
                .from('motion_types')
                .select('id')
                .limit(1)
                .single();

              if (fallbackType) {
                motionTypeId = fallbackType.id;
              } else {
                throw new Error('No motion types configured in database. Run migrations first.');
              }
            }

            // Create workflow
            const result = await startWorkflow({
              orderId,
              motionTypeId,
              workflowPath: 'path_a',
            });

            if (!result.success || !result.data) {
              throw new Error(result.error || 'Failed to create workflow');
            }

            // Fetch the created workflow
            const { data: createdWorkflow } = await adminClient
              .from('order_workflows')
              .select('id')
              .eq('order_id', orderId)
              .single();

            if (!createdWorkflow) {
              throw new Error('Workflow creation succeeded but cannot fetch workflow');
            }

            workflow = createdWorkflow;
            console.log(`[Generate] Created workflow ${workflow.id} for order ${orderId}`);
          }

          const { data: orderData } = await adminClient
            .from('orders')
            .select('*')
            .eq('id', orderId)
            .single();

          if (!orderData) {
            throw new Error('Order not found');
          }

          const tier = orderData.motion_tier || 'A';
          const phaseOutputs: Record<string, unknown> = {};

          // v7.2 dynamic phase routing - follows nextPhase from each result
          let currentPhase: string = 'I';
          let phaseIterations = 0;
          let revisionLoopCount = 0;
          const MAX_PHASES = 50; // Safety limit to prevent infinite loops
          const MAX_REVISION_LOOPS = 3;

          // Update workflow status to in_progress
          await adminClient
            .from('order_workflows')
            .update({
              status: 'in_progress',
              started_at: new Date().toISOString(),
            })
            .eq('id', workflow.id);

          // Execute phases dynamically following nextPhase routing
          while (currentPhase && phaseIterations < MAX_PHASES) {
            console.log(`[Generate Direct] Executing phase ${currentPhase} (iteration ${phaseIterations + 1}, revision loop ${revisionLoopCount})`);

            // Update workflow activity (current_phase is for old system, we track via phase codes in v7.2)
            await adminClient
              .from('order_workflows')
              .update({
                last_activity_at: new Date().toISOString(),
                metadata: { currentPhaseCode: currentPhase, revisionLoop: revisionLoopCount },
              })
              .eq('id', workflow.id);

            phaseIterations++;

            // Track revision loops (each time we execute Phase VII after the first time)
            if (currentPhase === 'VII' && phaseIterations > 1) {
              revisionLoopCount++;
              if (revisionLoopCount > MAX_REVISION_LOOPS) {
                console.error(`[Generate Direct] Max revision loops (${MAX_REVISION_LOOPS}) reached`);
                await adminClient
                  .from('order_workflows')
                  .update({
                    status: 'failed',
                    last_error: `Motion failed to reach B+ after ${MAX_REVISION_LOOPS} revision attempts`,
                  })
                  .eq('id', workflow.id);
                await adminClient
                  .from('orders')
                  .update({
                    status: 'generation_failed',
                    generation_error: `Quality threshold not met after ${MAX_REVISION_LOOPS} revisions`,
                  })
                  .eq('id', orderId);
                break;
              }
            }

            const phaseInput = {
              orderId,
              workflowId: workflow.id,
              tier,
              jurisdiction: orderData.jurisdiction || '',
              motionType: orderData.motion_type || '',
              caseCaption: orderData.case_caption || '',
              caseNumber: orderData.case_number || '',
              statementOfFacts: orderData.statement_of_facts || '',
              proceduralHistory: orderData.procedural_history || '',
              instructions: orderData.instructions || '',
              previousPhaseOutputs: phaseOutputs,
              documents: [],
              revisionLoop: revisionLoopCount || undefined,
            };

            const result = await executePhase(currentPhase as any, phaseInput);

            if (!result.success) {
              console.error(`[Generate Direct] Phase ${currentPhase} failed:`, result.error);

              await adminClient
                .from('order_workflows')
                .update({
                  status: 'failed',
                  last_error: `Phase ${currentPhase}: ${result.error}`,
                })
                .eq('id', workflow.id);

              await adminClient
                .from('orders')
                .update({
                  status: 'generation_failed',
                  generation_error: `Phase ${currentPhase} failed: ${result.error}`,
                })
                .eq('id', orderId);

              break;
            }

            // Store phase output for next phase
            phaseOutputs[currentPhase] = result.output;

            // Check if workflow requires review (HOLD condition)
            // Phase VII and Phase X are special: VII is just a notification, X is completion
            if (result.requiresReview && currentPhase !== 'VII' && currentPhase !== 'X') {
              console.log(`[Generate Direct] Phase ${currentPhase} requires review (HOLD), stopping`);

              await adminClient
                .from('order_workflows')
                .update({
                  status: 'blocked',
                  last_error: `Phase ${currentPhase} requires review before continuing`,
                })
                .eq('id', workflow.id);

              await adminClient
                .from('orders')
                .update({
                  status: 'on_hold',
                  generation_error: `Phase ${currentPhase} requires additional information before continuing`,
                })
                .eq('id', orderId);

              break;
            }

            // Phase VII requiresReview is just CP2 notification, don't stop
            if (result.requiresReview && currentPhase === 'VII') {
              console.log(`[Generate Direct] Phase VII CP2 checkpoint - continuing`);
            }

            // Phase X requiresReview is CP3 - workflow complete, ready for admin review
            if (result.requiresReview && currentPhase === 'X') {
              console.log(`[Generate Direct] Phase X CP3 checkpoint - workflow COMPLETE, ready for review`);
            }

            // Get next phase from result
            if (result.nextPhase) {
              currentPhase = result.nextPhase as string;
            } else {
              // No next phase means we're done - SUCCESS!
              console.log(`[Generate Direct] Workflow completed successfully at phase ${currentPhase}`);

              // Mark workflow as completed
              await adminClient
                .from('order_workflows')
                .update({
                  status: 'completed',
                  completed_at: new Date().toISOString(),
                  last_error: null,
                })
                .eq('id', workflow.id);

              // Mark order as ready for review (motion generated, needs admin approval)
              await adminClient
                .from('orders')
                .update({
                  status: 'pending_review',
                  generation_completed_at: new Date().toISOString(),
                  generation_error: null,
                })
                .eq('id', orderId);

              console.log(`[Generate Direct] Order ${orderId} ready for review`);
              break;
            }
          }

          if (phaseIterations >= MAX_PHASES) {
            console.error('[Generate Direct] Hit max phase iteration limit - possible infinite loop');
            await adminClient
              .from('order_workflows')
              .update({
                status: 'failed',
                last_error: 'Workflow exceeded maximum phase iteration limit',
              })
              .eq('id', workflow.id);

            await adminClient
              .from('orders')
              .update({
                status: 'generation_failed',
                generation_error: 'Workflow exceeded maximum phase iteration limit',
              })
              .eq('id', orderId);
          }

          console.log('[Generate Direct] Workflow execution completed');
        } catch (error) {
          console.error('[Generate Direct] Workflow execution error:', error);

          // Record error in database so it's visible
          try {
            await adminClient
              .from('automation_logs')
              .insert({
                order_id: orderId,
                action_type: 'workflow_error',
                action_details: {
                  error: error instanceof Error ? error.message : 'Unknown error',
                  stack: error instanceof Error ? error.stack : undefined,
                  phase: 'workflow_execution',
                },
              });

            // Update order status
            await adminClient
              .from('orders')
              .update({
                status: 'generation_failed',
                generation_error: error instanceof Error ? error.message : 'Workflow execution error',
              })
              .eq('id', orderId);
          } catch (logError) {
            console.error('[Generate Direct] Failed to log error:', logError);
          }
        }
      })();
    }

    // Log the workflow trigger
    await supabase.from('automation_logs').insert({
      order_id: orderId,
      action_type: 'workflow_triggered',
      action_details: {
        method: 'direct_generation',
        generatedBy: user.id,
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        model: 'claude-opus-4-5-20251101',
      },
    });

    return NextResponse.json({
      success: true,
      message: '14-phase workflow started',
      orderId,
      orderNumber: order.order_number,
      workflow: '14-phase-v72',
      status: 'in_progress',
    });

  } catch (error) {
    console.error('[Generate] Failed to start workflow:', error);

    // Revert status on error (use admin client)
    if (adminClient) {
      await adminClient
        .from('orders')
        .update({
          status: 'paid',
          generation_error: error instanceof Error ? error.message : 'Failed to start workflow',
        })
        .eq('id', orderId);
    }

    return NextResponse.json(
      { error: 'Failed to start workflow' },
      { status: 500 }
    );
  }
}
