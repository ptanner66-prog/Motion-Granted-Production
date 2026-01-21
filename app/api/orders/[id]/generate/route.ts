/**
 * Direct Motion Generation API
 *
 * POST /api/orders/[id]/generate
 *
 * Generates a motion directly without going through Inngest queue.
 * Use this as a fallback if the queue isn't working, or for immediate generation.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';
import { createMessageWithRetry } from '@/lib/claude-client';
import { parseFileOperations, executeFileOperations } from '@/lib/workflow/file-system';

export const maxDuration = 300; // 5 minutes for Vercel

function getAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Database not configured');
  }
  return createSupabaseClient(supabaseUrl, supabaseServiceKey);
}

function buildStreamlinedPrompt(): string {
  return `
################################################################################
#                                                                              #
#   MANDATORY INSTRUCTION - FAILURE TO COMPLY WILL RESULT IN REJECTION        #
#                                                                              #
################################################################################

YOU MUST GENERATE A COMPLETE LEGAL MOTION - FINAL DOCUMENT ONLY.

FORBIDDEN OUTPUTS (will cause immediate rejection):
- "PHASE I:", "PHASE II:", etc. - NO PHASE HEADERS
- "Status: IN PROGRESS" or any status updates
- Tables showing phase progress or element mapping
- "### PHASE X COMPLETE" or any completion markers
- Workflow summaries or checklists
- "Next Phase:" indicators
- Research notes or citation verification reports
- Attorney instruction sheets (these come separately)

SKIP THE WORKFLOW OUTPUT. Only output the FINAL MOTION DOCUMENT.

REQUIRED OUTPUT FORMAT:
Start IMMEDIATELY with the court caption. Your entire response should be the
motion document that gets filed with the court. Nothing else.

Example of CORRECT output (start like this):

IN THE CIVIL DISTRICT COURT
FOR THE PARISH OF ORLEANS

JOHN DOE,
     Plaintiff,

vs.                                    CASE NO. 2025-12345

JANE SMITH,
     Defendant.

                    MOTION TO COMPEL DISCOVERY

TO THE HONORABLE COURT:
[Continue with the actual motion content...]

DO NOT show your work. DO NOT output phases. ONLY output the final motion.

################################################################################
#   CASE DATA BELOW - USE THIS TO WRITE THE MOTION                            #
################################################################################

`;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: orderId } = await params;
  const supabase = await createClient();

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

  const adminClient = getAdminClient();

  try {
    // Get order with all related data including client profile for attorney info
    const { data: order, error: orderError } = await adminClient
      .from('orders')
      .select('*, parties(*), profiles!orders_client_id_fkey(full_name, email, bar_number, firm_name, firm_address, firm_phone)')
      .eq('id', orderId)
      .single();

    if (orderError || !order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    // Debug: Log what data we found
    console.log('[Generate] Order data:', JSON.stringify({
      orderId,
      order_number: order.order_number,
      case_number: order.case_number,
      case_caption: order.case_caption,
      motion_type: order.motion_type,
      jurisdiction: order.jurisdiction,
      has_statement_of_facts: !!order.statement_of_facts,
      statement_preview: order.statement_of_facts?.substring(0, 200),
      parties_count: order.parties?.length || 0,
      parties: order.parties,
    }, null, 2));

    // Update status to in_progress
    await adminClient
      .from('orders')
      .update({
        status: 'in_progress',
        generation_started_at: new Date().toISOString(),
      })
      .eq('id', orderId);

    // Get superprompt template (prefer is_default, fall back to most recent)
    const { data: templates } = await adminClient
      .from('superprompt_templates')
      .select('*')
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(1);

    const template = templates?.[0];
    if (!template) {
      throw new Error('No active superprompt template found. Please upload one in Admin > Superprompt.');
    }

    // Get documents
    const { data: documents } = await adminClient
      .from('documents')
      .select('*')
      .eq('order_id', orderId)
      .neq('document_type', 'deliverable');

    const documentContent = documents
      ?.map((doc) => `[${doc.document_type}] ${doc.file_name}:\n${doc.parsed_content || '(no parsed content)'}`)
      .join('\n\n---\n\n') || '';

    // Get parties
    const parties = order.parties || [];
    const plaintiffs = parties.filter((p: { party_role?: string }) =>
      p.party_role?.toLowerCase().includes('plaintiff')
    );
    const defendants = parties.filter((p: { party_role?: string }) =>
      p.party_role?.toLowerCase().includes('defendant')
    );

    // Build structured case data that will ALWAYS be appended
    const todayDate = new Date().toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    const structuredCaseData = `

================================================================================
CASE DATA - USE THIS INFORMATION TO GENERATE THE MOTION
================================================================================

The following JSON contains all the case information needed for Phase I Input:

\`\`\`json
{
  "order_id": "${orderId}",
  "customer_intake": {
    "motion_type": "${order.motion_type || ''}",
    "filing_deadline": "${order.filing_deadline || ''}",
    "hearing_date": "${order.hearing_date || ''}",
    "party_represented": "${plaintiffs.length > 0 ? 'plaintiff' : 'defendant'}",
    "party_name": "${plaintiffs.length > 0 ? plaintiffs.map((p: { party_name: string }) => p.party_name).join(', ') : defendants.map((p: { party_name: string }) => p.party_name).join(', ')}",
    "opposing_party_name": "${plaintiffs.length > 0 ? defendants.map((p: { party_name: string }) => p.party_name).join(', ') : plaintiffs.map((p: { party_name: string }) => p.party_name).join(', ')}",
    "case_number": "${order.case_number || ''}",
    "case_caption": "${order.case_caption || ''}",
    "court": "${order.jurisdiction || ''}",
    "court_division": "${order.court_division || ''}",
    "statement_of_facts": ${JSON.stringify(order.statement_of_facts || '')},
    "procedural_history": ${JSON.stringify(order.procedural_history || '')},
    "drafting_instructions": ${JSON.stringify(order.instructions || '')},
    "judge_name": ""
  },
  "uploaded_documents": [
    ${documents?.map((doc: { id: string; file_name: string; document_type: string; parsed_content?: string }) => `{
      "document_id": "${doc.id}",
      "filename": "${doc.file_name}",
      "document_type": "${doc.document_type}",
      "content_text": ${JSON.stringify(doc.parsed_content || '(no content extracted)')}
    }`).join(',\n    ') || ''}
  ],
  "attorney_info": {
    "attorney_name": "${order.profiles?.full_name || '[Attorney Name]'}",
    "bar_number": "${order.profiles?.bar_number || '[Bar Number]'}",
    "firm_name": "${order.profiles?.firm_name || '[Law Firm]'}",
    "firm_address": "${order.profiles?.firm_address || '[Address]'}",
    "firm_phone": "${order.profiles?.firm_phone || '[Phone]'}",
    "attorney_email": "${order.profiles?.email || '[Email]'}"
  }
}
\`\`\`

ADDITIONAL CONTEXT (Plain Text):

PARTIES:
${parties.length > 0
  ? parties.map((p: { party_name: string; party_role: string }) =>
      `- ${p.party_name} (${p.party_role})`
    ).join('\n')
  : '- No parties specified'}

Today's Date: ${todayDate}
Order Number: ${order.order_number || 'Not specified'}

================================================================================
END OF CASE DATA - NOW GENERATE THE MOTION
================================================================================

You have received all required Phase I inputs above. Execute the workflow and generate the complete ${order.motion_type || 'motion'} document.
Do NOT ask for more information. START WITH THE COURT CAPTION.
`;

    // Build replacements for any placeholders that might exist in template
    const replacements: Record<string, string> = {
      '{{CASE_NUMBER}}': order.case_number || '',
      '{{CASE_CAPTION}}': order.case_caption || '',
      '{{COURT}}': order.jurisdiction || '',
      '{{JURISDICTION}}': order.jurisdiction || '',
      '{{COURT_DIVISION}}': order.court_division || '',
      '{{MOTION_TYPE}}': order.motion_type || '',
      '{{MOTION_TIER}}': order.motion_tier || '',
      '{{FILING_DEADLINE}}': order.filing_deadline || '',
      '{{ALL_PARTIES}}': parties.map((p: { party_name: string; party_role: string }) =>
        `${p.party_name} (${p.party_role})`
      ).join(', '),
      '{{PLAINTIFF_NAMES}}': plaintiffs.map((p: { party_name: string }) => p.party_name).join(', '),
      '{{DEFENDANT_NAMES}}': defendants.map((p: { party_name: string }) => p.party_name).join(', '),
      '{{PARTIES_JSON}}': JSON.stringify(parties),
      '{{STATEMENT_OF_FACTS}}': order.statement_of_facts || '',
      '{{PROCEDURAL_HISTORY}}': order.procedural_history || '',
      '{{CLIENT_INSTRUCTIONS}}': order.instructions || '',
      '{{DOCUMENT_CONTENT}}': documentContent,
      '{{ORDER_ID}}': orderId,
      '{{ORDER_NUMBER}}': order.order_number || '',
      '{{TODAY_DATE}}': todayDate,
    };

    // Replace placeholders in template (if any exist)
    let templateContent = template.template;
    for (const [placeholder, value] of Object.entries(replacements)) {
      templateContent = templateContent.replace(
        new RegExp(placeholder.replace(/[{}]/g, '\\$&'), 'g'),
        value
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
        model: 'claude-sonnet-4-20250514',
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

    let conversationId: string;

    if (existingConv) {
      // Update existing
      await adminClient
        .from('conversations')
        .update({
          generated_motion: cleanedResponse,
          status: 'active',
        })
        .eq('id', existingConv.id);
      conversationId = existingConv.id;
    } else {
      // Create new
      const { data: newConv } = await adminClient
        .from('conversations')
        .insert({
          order_id: orderId,
          initial_context: fullContext,
          generated_motion: cleanedResponse,
          status: 'active',
        })
        .select()
        .single();
      conversationId = newConv?.id;
    }

    // Save message
    if (conversationId) {
      // Get max sequence number
      const { data: lastMsg } = await adminClient
        .from('conversation_messages')
        .select('sequence_number')
        .eq('conversation_id', conversationId)
        .order('sequence_number', { ascending: false })
        .limit(1)
        .single();

      const nextSeq = (lastMsg?.sequence_number || 0) + 1;

      await adminClient.from('conversation_messages').insert({
        conversation_id: conversationId,
        role: 'assistant',
        content: motionContent,
        is_motion_draft: true,
        sequence_number: nextSeq,
        input_tokens: response.usage.input_tokens,
        output_tokens: response.usage.output_tokens,
      });
    }

    // Update order status to pending_review
    await adminClient
      .from('orders')
      .update({
        status: 'pending_review',
        generation_completed_at: new Date().toISOString(),
        generation_error: null,
      })
      .eq('id', orderId);

    // Log success
    await adminClient.from('automation_logs').insert({
      order_id: orderId,
      action_type: 'motion_generated',
      action_details: {
        method: 'direct_generation',
        generatedBy: user.id,
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        model: 'claude-sonnet-4-20250514',
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Motion generated successfully',
      orderId,
      conversationId,
      status: 'pending_review',
      tokens: {
        input: response.usage.input_tokens,
        output: response.usage.output_tokens,
      },
    });

  } catch (error) {
    console.error('Direct generation error:', error);

    // Update order with error
    await adminClient
      .from('orders')
      .update({
        status: 'generation_failed',
        generation_error: error instanceof Error ? error.message : 'Unknown error',
      })
      .eq('id', orderId);

    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Failed to generate motion',
    }, { status: 500 });
  }
}
