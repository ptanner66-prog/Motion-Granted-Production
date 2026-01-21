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
import { getAnthropicAPIKey } from '@/lib/api-keys';
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

function buildStreamlinedPrompt(orderId: string): string {
  return `
================================================================================
STREAMLINED EXECUTION MODE - DIRECT MOTION OUTPUT
================================================================================

**OUTPUT REQUIREMENT: PRODUCE THE FINAL MOTION DOCUMENT ONLY**

You are generating a legal motion for admin review. Follow these rules:

1. **SKIP ALL HANDOFF FILES** - Do NOT create HANDOFF_*.md files
2. **SKIP PHASE-BY-PHASE OUTPUT** - Do NOT show status checklists or phase tracking
3. **OUTPUT ONLY THE MOTION** - Produce the complete, formatted motion document

**YOUR SINGLE OUTPUT should be the motion wrapped in a file_write tag:**

<file_write path="/mnt/user-data/outputs/Motion_${orderId.slice(0, 8)}.docx">
[Complete motion content here - properly formatted legal document]
</file_write>

**WHAT TO INCLUDE IN THE MOTION:**
- Full caption with court, case number, parties
- Notice of Motion
- Memorandum of Points and Authorities
- All legal arguments with verified citations
- Conclusion and prayer for relief
- Signature block

**WHAT TO SKIP:**
- Phase status updates
- Handoff files
- Research memos (incorporate findings directly into arguments)
- Citation verification reports (just use verified citations)

**STILL APPLY:**
- All legal standards and quality requirements from the superprompt
- Proper citation format and verification
- Customer inputs as PRIMARY SOURCE for facts
- Professional litigation tone

================================================================================
BEGIN - OUTPUT THE COMPLETE MOTION DOCUMENT
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

    // Update status to in_progress
    await adminClient
      .from('orders')
      .update({
        status: 'in_progress',
        generation_started_at: new Date().toISOString(),
      })
      .eq('id', orderId);

    // Get superprompt template
    const { data: templates } = await adminClient
      .from('superprompt_templates')
      .select('*')
      .eq('is_active', true)
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

    // Build replacements
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
      '{{TODAY_DATE}}': new Date().toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      }),
    };

    // Replace placeholders
    let templateContent = template.template;
    for (const [placeholder, value] of Object.entries(replacements)) {
      templateContent = templateContent.replace(
        new RegExp(placeholder.replace(/[{}]/g, '\\$&'), 'g'),
        value
      );
    }

    // Build full context
    const fullContext = buildStreamlinedPrompt(orderId) + templateContent;

    // Get API key
    const apiKey = await getAnthropicAPIKey();
    if (!apiKey) {
      throw new Error('Anthropic API key not configured. Add it in Admin Settings > API Keys.');
    }

    // Generate with Claude
    const anthropic = new Anthropic({ apiKey });

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 64000,
      system: fullContext,
      messages: [{
        role: 'user',
        content: 'Please generate the complete motion based on the case information and documents provided.'
      }],
    });

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
