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
================================================================================
CRITICAL INSTRUCTION - READ THIS FIRST
================================================================================

**YOU HAVE ALL THE INFORMATION YOU NEED BELOW. DO NOT ASK FOR MORE.**
**DO NOT REQUEST CLARIFICATION. DO NOT LIST WHAT YOU NEED.**
**GENERATE THE COMPLETE MOTION NOW USING THE CASE DATA PROVIDED.**

All case information, parties, facts, and documents are provided in this prompt.
Your ONLY task is to draft the motion. Start writing the motion immediately.

If any information seems incomplete, work with what is provided and draft the
best possible motion. Do NOT ask the user for more information.

================================================================================
OUTPUT INSTRUCTIONS
================================================================================

1. Output the complete motion document directly as plain text
2. Do NOT wrap in XML tags or code blocks
3. Do NOT ask questions or request clarification
4. Do NOT provide checklists or summaries of what you need
5. START YOUR RESPONSE DIRECTLY WITH THE MOTION

Begin your response with the court caption, like this:

IN THE [COURT NAME FROM DATA BELOW]

[PARTIES FROM DATA BELOW]

Case No. [CASE NUMBER FROM DATA BELOW]

[MOTION TITLE]

...then continue with the complete motion including all sections...

================================================================================
CASE DATA FOR THIS MOTION (USE THIS TO GENERATE)
================================================================================

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
    // Get order with all related data
    const { data: order, error: orderError } = await adminClient
      .from('orders')
      .select('*, parties(*)')
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

CASE IDENTIFICATION:
- Case Number: ${order.case_number || 'Not specified'}
- Case Caption: ${order.case_caption || 'Not specified'}
- Court/Jurisdiction: ${order.jurisdiction || 'Not specified'}
- Court Division: ${order.court_division || 'Not specified'}
- Order Number: ${order.order_number || 'Not specified'}
- Today's Date: ${todayDate}

MOTION DETAILS:
- Motion Type: ${order.motion_type || 'Not specified'}
- Motion Tier: ${order.motion_tier || 'Not specified'}
- Filing Deadline: ${order.filing_deadline || 'Not specified'}

PARTIES:
${parties.length > 0
  ? parties.map((p: { party_name: string; party_role: string }) =>
      `- ${p.party_name} (${p.party_role})`
    ).join('\n')
  : '- No parties specified'}

PLAINTIFFS: ${plaintiffs.map((p: { party_name: string }) => p.party_name).join(', ') || 'Not specified'}
DEFENDANTS: ${defendants.map((p: { party_name: string }) => p.party_name).join(', ') || 'Not specified'}

================================================================================
STATEMENT OF FACTS
================================================================================
${order.statement_of_facts || 'No statement of facts provided.'}

================================================================================
PROCEDURAL HISTORY
================================================================================
${order.procedural_history || 'No procedural history provided.'}

================================================================================
CLIENT INSTRUCTIONS / SPECIAL REQUESTS
================================================================================
${order.instructions || 'No special instructions provided.'}

================================================================================
SUPPORTING DOCUMENTS
================================================================================
${documentContent || 'No documents uploaded.'}

================================================================================
END OF CASE DATA - NOW GENERATE THE MOTION
================================================================================

Using ALL the case information above, generate the complete ${order.motion_type || 'motion'} document now.
Do NOT ask for more information. Do NOT provide a checklist. START WITH THE COURT CAPTION.
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

    // Build full context: instructions + workflow template + ALWAYS append structured case data
    const fullContext = buildStreamlinedPrompt() + templateContent + structuredCaseData;

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

    const response = await createMessageWithRetry(
      {
        model: 'claude-sonnet-4-20250514',
        max_tokens: 64000,
        system: fullContext,
        messages: [{
          role: 'user',
          content: 'Please generate the complete motion based on the case information and documents provided.'
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
