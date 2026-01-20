/**
 * Claude Chat API
 *
 * Handles real-time streaming chat with Claude for motion generation and revisions.
 * Admin can have a continuous conversation with Claude about an order.
 *
 * POST: Send a message and get a streaming response
 * GET: Get conversation history for an order
 */

// Vercel serverless function configuration
export const maxDuration = 300; // 5 minutes for Claude streaming
export const dynamic = 'force-dynamic';

import { createClient } from '@/lib/supabase/server';
import Anthropic from '@anthropic-ai/sdk';
import { gatherOrderData, getSuperpromptTemplate } from '@/lib/workflow/superprompt-engine';
import { getAnthropicAPIKey } from '@/lib/api-keys';
import {
  parseFileOperations,
  executeFileOperations,
  findLatestHandoff,
  WorkflowFile,
} from '@/lib/workflow/file-system';

interface ChatRequest {
  orderId: string;
  message?: string; // Optional - if not provided, starts new conversation
  regenerate?: boolean; // If true, regenerates the motion from scratch
}

interface ConversationMessage {
  id: string;
  role: 'system' | 'user' | 'assistant';
  content: string;
  is_motion_draft: boolean;
  sequence_number: number;
  created_at: string;
}

/**
 * POST: Send message to Claude and stream response
 */
export async function POST(request: Request) {
  const supabase = await createClient();

  // Verify auth
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Check admin/clerk role
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profile?.role !== 'admin' && profile?.role !== 'clerk') {
    return new Response(JSON.stringify({ error: 'Forbidden - Admin/Clerk only' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const body: ChatRequest = await request.json();
    const { orderId, message, regenerate } = body;

    if (!orderId) {
      return new Response(JSON.stringify({ error: 'orderId is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Get or create conversation for this order
    let { data: conversation } = await supabase
      .from('conversations')
      .select('*')
      .eq('order_id', orderId)
      .single();

    // Get existing messages
    let existingMessages: ConversationMessage[] = [];
    if (conversation) {
      const { data: messages } = await supabase
        .from('conversation_messages')
        .select('*')
        .eq('conversation_id', conversation.id)
        .order('sequence_number', { ascending: true });
      existingMessages = messages || [];
    }

    // If no conversation exists or regenerate requested, create/reset it
    if (!conversation || regenerate) {
      // Build initial context from order data + superprompt
      const initialContext = await buildInitialContext(orderId, supabase);

      if (!initialContext.success || !initialContext.context) {
        return new Response(JSON.stringify({ error: initialContext.error || 'Failed to build context' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (conversation && regenerate) {
        // Delete existing messages for regeneration
        await supabase
          .from('conversation_messages')
          .delete()
          .eq('conversation_id', conversation.id);

        // Update conversation
        await supabase
          .from('conversations')
          .update({
            initial_context: initialContext.context,
            generated_motion: null,
            status: 'active',
          })
          .eq('id', conversation.id);
      } else {
        // Create new conversation
        const { data: newConversation, error: createError } = await supabase
          .from('conversations')
          .insert({
            order_id: orderId,
            initial_context: initialContext.context,
            status: 'active',
          })
          .select()
          .single();

        if (createError || !newConversation) {
          return new Response(JSON.stringify({ error: 'Failed to create conversation' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          });
        }

        conversation = newConversation;
      }

      // Add system message with initial context
      await supabase.from('conversation_messages').insert({
        conversation_id: conversation.id,
        role: 'system',
        content: initialContext.context,
        sequence_number: 1,
      });

      existingMessages = [{
        id: 'system',
        role: 'system',
        content: initialContext.context,
        is_motion_draft: false,
        sequence_number: 1,
        created_at: new Date().toISOString(),
      }];

      // If regenerating, add the regeneration instruction as user message
      if (regenerate) {
        const regenMessage = message || 'Please generate the motion based on the case information and documents provided.';
        await supabase.from('conversation_messages').insert({
          conversation_id: conversation.id,
          role: 'user',
          content: regenMessage,
          sequence_number: 2,
        });
        existingMessages.push({
          id: 'regen',
          role: 'user',
          content: regenMessage,
          is_motion_draft: false,
          sequence_number: 2,
          created_at: new Date().toISOString(),
        });
      }
    } else if (message) {
      // Add user message to existing conversation
      const nextSequence = existingMessages.length + 1;
      await supabase.from('conversation_messages').insert({
        conversation_id: conversation.id,
        role: 'user',
        content: message,
        sequence_number: nextSequence,
      });
      existingMessages.push({
        id: 'new',
        role: 'user',
        content: message,
        is_motion_draft: false,
        sequence_number: nextSequence,
        created_at: new Date().toISOString(),
      });
    }

    // Build messages array for Claude
    const claudeMessages = existingMessages
      .filter(m => m.role !== 'system')
      .map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }));

    // If no user messages yet, add initial prompt
    if (claudeMessages.length === 0) {
      const initialPrompt = 'Please generate the motion based on the case information and documents provided.';
      await supabase.from('conversation_messages').insert({
        conversation_id: conversation.id,
        role: 'user',
        content: initialPrompt,
        sequence_number: existingMessages.length + 1,
      });
      claudeMessages.push({ role: 'user', content: initialPrompt });
    }

    // Get system message
    const systemMessage = existingMessages.find(m => m.role === 'system')?.content || '';

    // Stream response from Claude
    const encoder = new TextEncoder();
    let fullResponse = '';

    const stream = new ReadableStream({
      async start(controller) {
        try {
          // Get API key from database
          const apiKey = await getAnthropicAPIKey();
          if (!apiKey) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: 'Anthropic API key not configured. Please add it in Admin Settings > API Keys.' })}\n\n`));
            controller.close();
            return;
          }
          const anthropic = new Anthropic({ apiKey });

          const response = await anthropic.messages.create({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 16000,
            system: systemMessage,
            messages: claudeMessages,
            stream: true,
          });

          for await (const event of response) {
            if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
              const text = event.delta.text;
              fullResponse += text;
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text })}\n\n`));
            }
          }

          // Parse and execute file operations from Claude's response
          const { operations, cleanedResponse } = parseFileOperations(fullResponse);
          if (operations.length > 0) {
            const fileResults = await executeFileOperations(orderId, operations);
            // Send file operation results to user
            for (const result of fileResults) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ fileOp: result })}\n\n`));
            }
          }

          // Save assistant response to database (use cleaned response for display)
          const nextSequence = existingMessages.length + (claudeMessages.length > existingMessages.filter(m => m.role !== 'system').length ? 1 : 0) + 1;
          await supabase.from('conversation_messages').insert({
            conversation_id: conversation.id,
            role: 'assistant',
            content: fullResponse, // Store full response including file tags
            is_motion_draft: true,
            sequence_number: nextSequence,
          });

          // Update conversation with latest motion (cleaned version)
          await supabase
            .from('conversations')
            .update({ generated_motion: cleanedResponse })
            .eq('id', conversation.id);

          // Send completion signal with file operation count
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({
            done: true,
            conversationId: conversation.id,
            filesWritten: operations.filter(o => o.type === 'write').length
          })}\n\n`));
          controller.close();
        } catch (error) {
          console.error('Claude streaming error:', error);
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: 'Failed to generate response' })}\n\n`));
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (error) {
    console.error('Chat error:', error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : 'Chat failed',
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

/**
 * GET: Get conversation history for an order
 */
export async function GET(request: Request) {
  const supabase = await createClient();

  // Verify auth
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Check admin/clerk role
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profile?.role !== 'admin' && profile?.role !== 'clerk') {
    return new Response(JSON.stringify({ error: 'Forbidden - Admin/Clerk only' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { searchParams } = new URL(request.url);
  const orderId = searchParams.get('orderId');

  if (!orderId) {
    return new Response(JSON.stringify({ error: 'orderId is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    // Get conversation
    const { data: conversation } = await supabase
      .from('conversations')
      .select('*')
      .eq('order_id', orderId)
      .single();

    if (!conversation) {
      return new Response(JSON.stringify({ conversation: null, messages: [] }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Get messages
    const { data: messages } = await supabase
      .from('conversation_messages')
      .select('*')
      .eq('conversation_id', conversation.id)
      .order('sequence_number', { ascending: true });

    return new Response(JSON.stringify({
      conversation,
      messages: messages || [],
    }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Get conversation error:', error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : 'Failed to get conversation',
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

/**
 * Build initial context for Claude from order data + superprompt
 */
async function buildInitialContext(
  orderId: string,
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<{ success: boolean; context?: string; error?: string }> {
  try {
    // Get order data
    const orderDataResult = await gatherOrderData(orderId);
    if (!orderDataResult.success || !orderDataResult.data) {
      return { success: false, error: orderDataResult.error || 'Order not found or could not gather data' };
    }
    const orderData = orderDataResult.data;

    // Get the superprompt template
    const templateResult = await getSuperpromptTemplate();
    if (!templateResult.success || !templateResult.data) {
      console.error('[SUPERPROMPT] Failed to get template for chat:', templateResult.error);
      return {
        success: false,
        error: templateResult.error || 'No superprompt template found. Please upload a template in the admin dashboard.',
      };
    }
    const template = templateResult.data;
    console.log(`[SUPERPROMPT] Chat using template: "${template.name}" (${template.template.length} chars)`);

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

    // Web Context Adapter: Provides file system access via XML commands
    const webContextAdapter = `
================================================================================
WEB APPLICATION FILE SYSTEM - READ THIS FIRST
================================================================================

**EXECUTION MODE: CONTINUOUS - PRODUCE COMPLETE MOTION**

You MUST complete ALL phases (I through IX) in a SINGLE response without pausing.
- DO NOT ask "Would you like me to continue?" or "Say continue"
- DO NOT stop between phases waiting for user input
- DO proceed automatically through every phase until the final motion is complete
- DO save a HANDOFF file after completing ALL phases (one comprehensive file)
- The admin will review the completed motion - no intermediate approvals needed

================================================================================

You are operating in a WEB APPLICATION with FILE SYSTEM ACCESS via XML commands.
Your superprompt references /mnt/user-data/outputs/ - this is NOW AVAILABLE.

**FILE SYSTEM COMMANDS (USE THESE INSTEAD OF BASH):**

1. **WRITE A FILE** - Use this to create HANDOFF files, motions, declarations, etc:
   <file_write path="/mnt/user-data/outputs/HANDOFF_MMDDYYYY_HHMMam.md">
   [Your file content here]
   </file_write>

2. **READ A FILE** - Use this to read any existing file:
   <file_read path="/mnt/user-data/outputs/HANDOFF_01202026_1045am.md" />

3. **LIST FILES** - Use this to see what files exist:
   <file_list directory="/mnt/user-data/outputs/" />

4. **FIND LATEST HANDOFF** - Use this to find and read the most recent handoff:
   <find_handoff />

**IMPORTANT RULES:**

- DO NOT use bash, cat, echo, or shell commands - they don't work here
- DO use the XML file commands above - they ARE functional
- The file system persists across sessions
- Files are stored per-order (this order: ${orderId})
- Your HANDOFF workflow works exactly as designed - just use XML tags instead of bash

**WORKFLOW INSTRUCTIONS REMAIN IN FULL EFFECT:**
- All legal standards, citation rules, quality requirements: FULLY APPLY
- Phase workflow logic: FULLY APPLY
- Citation verification requirements: FULLY APPLY
- 4-citation HARD STOP: FULLY APPLY
- Input Priority Rule: FULLY APPLY
- HANDOFF file generation: FULLY APPLY (use <file_write> tag)

${existingHandoffContent ? existingHandoffContent : `
================================================================================
NO EXISTING HANDOFF - THIS IS A NEW MATTER
================================================================================
No previous handoff file was found for this order.
Start with Phase I: Intake & Document Processing.
================================================================================
`}
================================================================================
BEGIN PROCESSING - USE XML FILE COMMANDS AS NEEDED
================================================================================

`;

    // Merge the superprompt with order data, prepending the web context adapter
    let context = webContextAdapter + template.template;

    // Replace all placeholders
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

    return { success: true, context };
  } catch (error) {
    console.error('Build initial context error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to build context',
    };
  }
}
