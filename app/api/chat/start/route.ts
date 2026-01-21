/**
 * Auto-start Claude Conversation API
 *
 * Called after order submission to automatically start the Claude conversation
 * with the superprompt and order data. Runs in the background.
 */

// Vercel serverless function configuration
export const maxDuration = 300; // 5 minutes for Claude generation
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';
import { gatherOrderData, getSuperpromptTemplate } from '@/lib/workflow/superprompt-engine';
import { getAnthropicAPIKey } from '@/lib/api-keys';
import {
  parseFileOperations,
  executeFileOperations,
  findLatestHandoff,
  WorkflowFile,
} from '@/lib/workflow/file-system';

// Create admin client with service role key (bypasses RLS for server-side operations)
function getAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    return null;
  }

  return createSupabaseClient(supabaseUrl, supabaseServiceKey);
}

export async function POST(request: Request) {
  // Use admin client to bypass RLS for server-side motion generation
  const supabase = getAdminClient();

  if (!supabase) {
    return NextResponse.json(
      { error: 'Database not configured. Missing SUPABASE_SERVICE_ROLE_KEY.' },
      { status: 500 }
    );
  }

  // Verify authentication
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { orderId } = await request.json();

    if (!orderId) {
      return NextResponse.json({ error: 'orderId is required' }, { status: 400 });
    }

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(orderId)) {
      return NextResponse.json({ error: 'Invalid order ID format' }, { status: 400 });
    }

    // Get order to verify it exists
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('id, order_number, status, client_id')
      .eq('id', orderId)
      .single();

    if (orderError || !order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    // Check user role for authorization
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    const isAdminOrClerk = profile?.role === 'admin' || profile?.role === 'clerk';

    // SECURITY: Verify user owns this order OR is admin/clerk
    if (!isAdminOrClerk && order.client_id !== user.id) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // Check if conversation already exists
    const { data: existingConversation } = await supabase
      .from('conversations')
      .select('id')
      .eq('order_id', orderId)
      .single();

    if (existingConversation) {
      return NextResponse.json({
        message: 'Conversation already exists',
        conversationId: existingConversation.id,
      });
    }

    // Build initial context
    const orderDataResult = await gatherOrderData(orderId);
    if (!orderDataResult.success || !orderDataResult.data) {
      // Update order status to indicate issue
      await supabase
        .from('orders')
        .update({ status: 'blocked' })
        .eq('id', orderId);

      return NextResponse.json({ error: orderDataResult.error || 'Could not gather order data' }, { status: 400 });
    }
    const orderData = orderDataResult.data;

    const templateResult = await getSuperpromptTemplate();
    if (!templateResult.success || !templateResult.data) {
      console.error('[SUPERPROMPT] Failed to get template:', templateResult.error);
      return NextResponse.json({
        error: templateResult.error || 'No superprompt template found. Please upload a template first.',
      }, { status: 400 });
    }
    const template = templateResult.data;
    console.log(`[SUPERPROMPT] Using template: "${template.name}" (${template.id})`);
    console.log(`[SUPERPROMPT] Template length: ${template.template.length} chars`);

    // Check for existing handoff file for this order
    let existingHandoffContent = '';
    const handoffResult = await findLatestHandoff(orderId);
    if (handoffResult.success && handoffResult.data) {
      const handoff = handoffResult.data as WorkflowFile;
      existingHandoffContent = `
================================================================================
EXISTING HANDOFF FILE FOUND - RESUME FROM HERE
================================================================================

File: ${handoff.file_path}
Last Updated: ${handoff.updated_at}

${handoff.content}

================================================================================
END OF EXISTING HANDOFF
================================================================================

`;
    }

    // Critical instruction header - MUST come first
    const criticalInstruction = `
################################################################################
#                                                                              #
#   MANDATORY INSTRUCTION - FAILURE TO COMPLY WILL RESULT IN REJECTION        #
#                                                                              #
################################################################################

YOU MUST GENERATE A COMPLETE LEGAL MOTION.

FORBIDDEN ACTIONS (will cause immediate rejection):
- Asking for more information
- Saying "I need" or "Please provide"
- Listing what information you require
- Providing a checklist of missing items
- Asking clarifying questions
- Summarizing what you would need to proceed
- Outputting "PHASE I: INTAKE" or any phase status

REQUIRED ACTION:
Generate the COMPLETE motion document using the case data provided below.
The case data section contains ALL information needed: case number, parties,
facts, procedural history, and instructions.

OUTPUT FORMAT:
Start your response IMMEDIATELY with the court caption and continue with the full motion.

################################################################################
#   CASE DATA STARTS BELOW - USE THIS TO WRITE THE MOTION                     #
################################################################################

`;

    // Build structured JSON case data matching superprompt schema
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
    "motion_type": "${orderData.motionType || ''}",
    "filing_deadline": "${orderData.filingDeadline || ''}",
    "party_represented": "${orderData.plaintiffNames ? 'plaintiff' : 'defendant'}",
    "party_name": "${orderData.plaintiffNames || orderData.defendantNames || ''}",
    "opposing_party_name": "${orderData.plaintiffNames ? orderData.defendantNames : orderData.plaintiffNames || ''}",
    "case_number": "${orderData.caseNumber || ''}",
    "case_caption": "${orderData.caseCaption || ''}",
    "court": "${orderData.jurisdiction || ''}",
    "court_division": "${orderData.courtDivision || ''}",
    "statement_of_facts": ${JSON.stringify(orderData.statementOfFacts || '')},
    "procedural_history": ${JSON.stringify(orderData.proceduralHistory || '')},
    "drafting_instructions": ${JSON.stringify(orderData.clientInstructions || '')},
    "judge_name": ""
  },
  "attorney_info": {
    "attorney_name": "${orderData.attorneyName || '[Attorney Name]'}",
    "bar_number": "${orderData.barNumber || '[Bar Number]'}",
    "firm_name": "${orderData.firmName || '[Law Firm]'}",
    "firm_address": "${orderData.firmAddress || '[Address]'}",
    "firm_phone": "${orderData.firmPhone || '[Phone]'}",
    "attorney_email": "${orderData.clientEmail || '[Email]'}"
  }
}
\`\`\`

UPLOADED DOCUMENT CONTENT:
${orderData.documentContent || 'No documents uploaded.'}

ADDITIONAL CONTEXT:
- Today's Date: ${todayDate}
- Order Number: ${orderData.orderNumber || 'Not specified'}
- All Parties: ${orderData.parties?.map((p: { name: string; role: string }) => `${p.name} (${p.role})`).join(', ') || 'Not specified'}

================================================================================
END OF CASE DATA - NOW GENERATE THE MOTION
================================================================================

You have received all required Phase I inputs above. Generate the complete ${orderData.motionType || 'motion'} document.
Do NOT ask for more information. START WITH THE COURT CAPTION.

`;

    // Build context: Critical instruction + Case data FIRST + then superprompt template
    let context = criticalInstruction + structuredCaseData + '\n\n' + template.template;
    const replacements: Record<string, string> = {
      '{{CASE_NUMBER}}': orderData.caseNumber || '',
      '{{CASE_CAPTION}}': orderData.caseCaption || '',
      '{{COURT}}': orderData.court || '',
      '{{JURISDICTION}}': orderData.jurisdiction || '',
      '{{COURT_DIVISION}}': orderData.courtDivision || '',
      '{{MOTION_TYPE}}': orderData.motionType || '',
      '{{MOTION_TIER}}': orderData.motionTier || '',
      '{{FILING_DEADLINE}}': orderData.filingDeadline || '',
      '{{ALL_PARTIES}}': orderData.parties?.map((p: { name: string; role: string }) => `${p.name} (${p.role})`).join(', ') || '',
      '{{PLAINTIFF_NAMES}}': orderData.plaintiffNames || '',
      '{{DEFENDANT_NAMES}}': orderData.defendantNames || '',
      '{{PARTIES_JSON}}': JSON.stringify(orderData.parties || []),
      '{{STATEMENT_OF_FACTS}}': orderData.statementOfFacts || '',
      '{{PROCEDURAL_HISTORY}}': orderData.proceduralHistory || '',
      '{{CLIENT_INSTRUCTIONS}}': orderData.clientInstructions || '',
      '{{DOCUMENT_CONTENT}}': orderData.documentContent || '',
      '{{DOCUMENT_SUMMARIES}}': orderData.documentSummaries || '',
      '{{KEY_FACTS}}': orderData.keyFacts || '',
      '{{LEGAL_ISSUES}}': orderData.legalIssues || '',
      '{{ORDER_ID}}': orderData.orderId || '',
      '{{ORDER_NUMBER}}': orderData.orderNumber || '',
      '{{CLIENT_NAME}}': orderData.clientName || '',
      '{{TODAY_DATE}}': new Date().toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      }),
    };

    for (const [placeholder, value] of Object.entries(replacements)) {
      context = context.replace(new RegExp(placeholder.replace(/[{}]/g, '\\$&'), 'g'), value);
    }

    // Create conversation
    const { data: conversation, error: createError } = await supabase
      .from('conversations')
      .insert({
        order_id: orderId,
        initial_context: context,
        status: 'active',
      })
      .select()
      .single();

    if (createError || !conversation) {
      console.error('Failed to create conversation:', createError);
      return NextResponse.json({ error: 'Failed to create conversation' }, { status: 500 });
    }

    // Add system message
    await supabase.from('conversation_messages').insert({
      conversation_id: conversation.id,
      role: 'system',
      content: context,
      sequence_number: 1,
    });

    // Add initial user prompt with pre-filled caption to force motion generation
    const initialPrompt = `CRITICAL: The case data has already been provided in the system context above. DO NOT ask for more information. DO NOT say "I need" or list requirements. DO NOT output Phase I status updates.

Your task: Using the customer_intake JSON provided above, generate the COMPLETE ${orderData.motionType || 'motion'} document NOW.

START YOUR RESPONSE WITH THE COURT CAPTION:

IN THE ${orderData.jurisdiction === 'la_state' ? 'CIVIL DISTRICT COURT' : orderData.jurisdiction?.toUpperCase() || '[COURT]'}
${orderData.courtDivision ? `FOR THE ${orderData.courtDivision.toUpperCase()}` : ''}

${orderData.plaintiffNames || '[PLAINTIFF]'},
     Plaintiff,

vs.                                    CASE NO. ${orderData.caseNumber || '[NUMBER]'}

${orderData.defendantNames || '[DEFENDANT]'},
     Defendant.

                    MOTION FOR ${(orderData.motionType || 'RELIEF').toUpperCase().replace(/_/g, ' ')}

[NOW CONTINUE WITH THE COMPLETE MOTION DOCUMENT - Introduction, Statement of Facts, Legal Arguments, Conclusion, Prayer for Relief, Certificate of Service]`;

    await supabase.from('conversation_messages').insert({
      conversation_id: conversation.id,
      role: 'user',
      content: initialPrompt,
      sequence_number: 2,
    });

    // Update order status to in_progress
    await supabase
      .from('orders')
      .update({ status: 'in_progress' })
      .eq('id', orderId);

    // Generate motion with Claude (non-streaming for background process)
    try {
      // Get API key from database (or fall back to env var)
      const apiKey = await getAnthropicAPIKey();
      if (!apiKey) {
        throw new Error('Anthropic API key not configured. Please add it in Admin Settings > API Keys.');
      }
      const anthropic = new Anthropic({ apiKey });

      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 64000, // Increased for full motion generation through all phases
        system: context,
        messages: [{ role: 'user', content: initialPrompt }],
      });

      const generatedMotion = response.content
        .filter((block): block is Anthropic.TextBlock => block.type === 'text')
        .map(block => block.text)
        .join('\n');

      // Save assistant response
      await supabase.from('conversation_messages').insert({
        conversation_id: conversation.id,
        role: 'assistant',
        content: generatedMotion,
        is_motion_draft: true,
        sequence_number: 3,
        input_tokens: response.usage.input_tokens,
        output_tokens: response.usage.output_tokens,
      });

      // Update conversation with generated motion
      await supabase
        .from('conversations')
        .update({ generated_motion: generatedMotion })
        .eq('id', conversation.id);

      // Update order status to pending_review
      await supabase
        .from('orders')
        .update({ status: 'pending_review' })
        .eq('id', orderId);

      // Log the automation event (use 'status_changed' as valid action_type)
      await supabase.from('automation_logs').insert({
        order_id: orderId,
        action_type: 'status_changed',
        action_details: {
          change_type: 'motion_generated',
          conversationId: conversation.id,
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
          model: 'claude-sonnet-4-20250514',
        },
      });

      return NextResponse.json({
        success: true,
        conversationId: conversation.id,
        status: 'pending_review',
        message: 'Motion generated successfully and ready for review',
      });
    } catch (claudeError) {
      console.error('Claude generation error:', claudeError);

      // Update order status to indicate generation failed
      await supabase
        .from('orders')
        .update({ status: 'blocked' })
        .eq('id', orderId);

      await supabase.from('automation_logs').insert({
        order_id: orderId,
        action_type: 'task_failed',
        action_details: {
          task_type: 'motion_generation',
          error: claudeError instanceof Error ? claudeError.message : 'Unknown error',
        },
      });

      return NextResponse.json({
        error: 'Motion generation failed',
        conversationId: conversation.id,
      }, { status: 500 });
    }
  } catch (error) {
    console.error('Start conversation error:', error);
    return NextResponse.json({
      error: 'Failed to start conversation. Please try again.',
    }, { status: 500 });
  }
}
