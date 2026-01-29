import { inngest } from "./client";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";
import { canMakeRequest, logRequest } from "@/lib/rate-limit";
import { parseFileOperations, executeFileOperations } from "@/lib/workflow/file-system";
import { ADMIN_EMAIL, ALERT_EMAIL, EMAIL_FROM } from "@/lib/config/notifications";
import { createMessageWithRetry } from "@/lib/claude-client";
import { parseOrderDocuments, getOrderParsedDocuments } from "@/lib/workflow/document-parser";
import { extractDocumentContent } from "@/lib/workflow/document-extractor";
import { quickValidate } from "@/lib/workflow/quality-validator";
import { extractCitations } from "@/lib/workflow/citation-verifier";

// Import the new 14-phase workflow orchestration
import { generateOrderWorkflow, handleWorkflowFailure, workflowFunctions } from "./workflow-orchestration";

// Initialize Supabase client for background jobs (service role)
function getSupabase() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error("Supabase environment variables not configured");
  }

  return createSupabaseClient(supabaseUrl, supabaseServiceKey);
}

/**
 * Build web context adapter for streamlined motion output
 */
function buildWebContextAdapter(orderId: string): string {
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
- HANDOFF files or file_write tags
- INTRODUCTORY SENTENCES like "I'll generate..." or "Let me create..." or "Here is..."
- CONCLUDING COMMENTARY like "Key Improvements Made" or summaries of what you did
- Any text before the court caption
- Any text after the Certificate of Service

YOUR ENTIRE RESPONSE MUST BE ONLY THE MOTION DOCUMENT.
No introduction. No explanation. No commentary. Just the motion.

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

/**
 * Order Draft Generation Function (Legacy - Single Claude Call)
 *
 * This is the simplified single-call generation for quick turnaround.
 * For full 14-phase workflow with checkpoints, use generateOrderWorkflow.
 *
 * Processes paid orders through Claude API to generate motion drafts.
 * Features:
 * - Priority-based processing (deadline-ordered)
 * - Step-based checkpointing (resume on failure, don't restart)
 * - 3 retries with exponential backoff
 * - Concurrency limit of 5 for Claude rate limit safety
 * - Failure alerting via email
 * - Continuous execution mode (all 9 phases in one shot)
 *
 * NOTE: For Tier B/C motions or orders requiring checkpoints,
 * use the order/workflow-orchestrate event instead.
 */
export const generateOrderDraft = inngest.createFunction(
  {
    id: "generate-order-draft",
    // Process 3 orders concurrently for production scale
    // Rate limiting handled by lib/redis.ts and lib/rate-limit.ts
    concurrency: {
      limit: 3,
    },
    // Retry configuration
    retries: 3,
  },
  { event: "order/submitted" },
  async ({ event, step }) => {
    const { orderId, priority } = event.data;
    const supabase = getSupabase();

    // Step 1: Mark order as processing and record start time
    const orderData = await step.run("mark-processing", async () => {
      // First, get current attempts count
      const { data: currentOrder } = await supabase
        .from("orders")
        .select("generation_attempts")
        .eq("id", orderId)
        .single();

      const currentAttempts = currentOrder?.generation_attempts || 0;

      // Update with incremented attempts - include profile for attorney info
      const { data: order, error } = await supabase
        .from("orders")
        .update({
          status: "in_progress",
          generation_started_at: new Date().toISOString(),
          generation_attempts: currentAttempts + 1,
        })
        .eq("id", orderId)
        .select("*, parties(*), profiles!orders_client_id_fkey(full_name, email, bar_number, firm_name, firm_address, firm_phone)")
        .single();

      if (error) {
        throw new Error(`Failed to mark order processing: ${error.message}`);
      }

      // Log the start of processing
      await supabase.from("automation_logs").insert({
        order_id: orderId,
        action_type: "generation_started",
        action_details: {
          priority,
          attempt: currentAttempts + 1,
        },
      });

      return order;
    });

    // Step 2: Rate limit check - wait if needed
    await step.run("rate-limit-check", async () => {
      if (!canMakeRequest()) {
        // Wait 30 seconds if rate limited
        await new Promise(resolve => setTimeout(resolve, 30000));
      }
    });

    // Step 2.5: Parse documents if not already parsed
    // This extracts text content, key facts, legal issues from uploaded PDFs/DOCXs
    const parsedDocs = await step.run("parse-documents", async () => {
      try {
        // Check if documents are already parsed
        const existingParsed = await getOrderParsedDocuments(orderId);
        if (existingParsed.success && existingParsed.data && existingParsed.data.length > 0) {
          console.log(`[Inngest] Found ${existingParsed.data.length} pre-parsed documents for order ${orderId}`);
          return { parsed: existingParsed.data.length, fromCache: true, data: existingParsed.data };
        }

        // Parse all documents for this order
        console.log(`[Inngest] Parsing documents for order ${orderId}`);
        const parseResult = await parseOrderDocuments(orderId);

        if (!parseResult.success) {
          console.warn(`[Inngest] Document parsing failed: ${parseResult.error}`);
          // Don't fail the generation - proceed with raw document content
          return { parsed: 0, failed: true, error: parseResult.error };
        }

        // Log document parsing to automation_logs
        await supabase.from("automation_logs").insert({
          order_id: orderId,
          action_type: "documents_parsed",
          action_details: {
            parsed: parseResult.data?.parsed || 0,
            failed: parseResult.data?.failed || 0,
          },
        });

        // Fetch the newly parsed documents
        const newParsed = await getOrderParsedDocuments(orderId);
        return {
          parsed: parseResult.data?.parsed || 0,
          failed: parseResult.data?.failed || 0,
          data: newParsed.data || []
        };
      } catch (parseError) {
        console.error(`[Inngest] Document parsing error:`, parseError);
        // Don't fail the generation - proceed without parsed content
        return { parsed: 0, failed: true, error: parseError instanceof Error ? parseError.message : 'Unknown' };
      }
    });

    // Step 3: Gather order data and build context with web adapter
    const context = await step.run("build-context", async () => {
      // Get superprompt template (prefer is_default, fall back to most recent)
      const { data: templates } = await supabase
        .from("superprompt_templates")
        .select("*")
        .order("is_default", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(1);

      const template = templates?.[0];
      if (!template) {
        throw new Error("No active superprompt template found");
      }

      // Get documents for this order
      const { data: documents } = await supabase
        .from("documents")
        .select("*")
        .eq("order_id", orderId);

      // Build document content - use parsed documents if available
      let documentContent = "";
      if ('data' in parsedDocs && parsedDocs.data && parsedDocs.data.length > 0) {
        // Use AI-parsed documents with extracted facts and issues
        documentContent = parsedDocs.data.map(pd => {
          const keyFactsText = pd.key_facts?.length > 0
            ? `\nKey Facts:\n${pd.key_facts.map((f: { fact: string; importance: string }) => `- [${f.importance}] ${f.fact}`).join('\n')}`
            : '';
          const legalIssuesText = pd.legal_issues?.length > 0
            ? `\nLegal Issues:\n${pd.legal_issues.map((i: { issue: string; relevance: string }) => `- ${i.issue}: ${i.relevance}`).join('\n')}`
            : '';
          return `[${pd.document_type || 'document'}] ${pd.summary || '(No summary)'}\n${pd.full_text?.slice(0, 10000) || '(No content)'}${keyFactsText}${legalIssuesText}`;
        }).join("\n\n---\n\n");
      } else {
        // Fallback to raw document content
        documentContent = documents
          ?.map((doc) => `[${doc.document_type}] ${doc.file_name}:\n${doc.parsed_content || ""}`)
          .join("\n\n---\n\n") || "";
      }

      // Get parties
      const { data: parties } = await supabase
        .from("parties")
        .select("*")
        .eq("order_id", orderId);

      const plaintiffs = parties?.filter((p) => p.party_role?.toLowerCase().includes("plaintiff")) || [];
      const defendants = parties?.filter((p) => p.party_role?.toLowerCase().includes("defendant")) || [];

      const todayDate = new Date().toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });

      // Build structured case data in JSON format matching the superprompt schema
      const structuredCaseData = `

================================================================================
CASE DATA - USE THIS INFORMATION TO GENERATE THE MOTION
================================================================================

The following JSON contains all the case information needed for Phase I Input:

\`\`\`json
{
  "order_id": "${orderId}",
  "customer_intake": {
    "motion_type": "${orderData.motion_type || ""}",
    "filing_deadline": "${orderData.filing_deadline || ""}",
    "hearing_date": "${orderData.hearing_date || ""}",
    "party_represented": "${plaintiffs.length > 0 ? "plaintiff" : "defendant"}",
    "party_name": "${plaintiffs.length > 0 ? plaintiffs.map((p) => p.party_name).join(", ") : defendants.map((p) => p.party_name).join(", ")}",
    "opposing_party_name": "${plaintiffs.length > 0 ? defendants.map((p) => p.party_name).join(", ") : plaintiffs.map((p) => p.party_name).join(", ")}",
    "case_number": "${orderData.case_number || ""}",
    "case_caption": "${orderData.case_caption || ""}",
    "court": "${orderData.jurisdiction || ""}",
    "court_division": "${orderData.court_division || ""}",
    "statement_of_facts": ${JSON.stringify(orderData.statement_of_facts || "")},
    "procedural_history": ${JSON.stringify(orderData.procedural_history || "")},
    "drafting_instructions": ${JSON.stringify(orderData.instructions || "")},
    "judge_name": ""
  },
  "uploaded_documents": [
    ${documents?.map((doc) => `{
      "document_id": "${doc.id}",
      "filename": "${doc.file_name}",
      "document_type": "${doc.document_type}",
      "content_text": ${JSON.stringify(doc.parsed_content || "(no content extracted)")}
    }`).join(",\n    ") || ""}
  ],
  "attorney_info": {
    "attorney_name": "${orderData.profiles?.full_name || "[Attorney Name]"}",
    "bar_number": "${orderData.profiles?.bar_number || "[Bar Number]"}",
    "firm_name": "${orderData.profiles?.firm_name || "[Law Firm]"}",
    "firm_address": "${orderData.profiles?.firm_address || "[Address]"}",
    "firm_phone": "${orderData.profiles?.firm_phone || "[Phone]"}",
    "attorney_email": "${orderData.profiles?.email || "[Email]"}"
  }
}
\`\`\`

ADDITIONAL CONTEXT (Plain Text):

PARTIES:
${parties && parties.length > 0
  ? parties.map((p) => `- ${p.party_name} (${p.party_role})`).join("\n")
  : "- No parties specified"}

Today's Date: ${todayDate}
Order Number: ${orderData.order_number || "Not specified"}

================================================================================
END OF CASE DATA - NOW GENERATE THE MOTION
================================================================================

You have received all required Phase I inputs above. Execute the workflow and generate the complete ${orderData.motion_type || "motion"} document.
Do NOT ask for more information. START WITH THE COURT CAPTION.
`;

      // Build replacements for any placeholders that might exist in template
      const replacements: Record<string, string> = {
        "{{CASE_NUMBER}}": orderData.case_number || "",
        "{{CASE_CAPTION}}": orderData.case_caption || "",
        "{{COURT}}": orderData.jurisdiction || "",
        "{{JURISDICTION}}": orderData.jurisdiction || "",
        "{{COURT_DIVISION}}": orderData.court_division || "",
        "{{MOTION_TYPE}}": orderData.motion_type || "",
        "{{MOTION_TIER}}": orderData.motion_tier || "",
        "{{FILING_DEADLINE}}": orderData.filing_deadline || "",
        "{{ALL_PARTIES}}": parties?.map((p) => `${p.party_name} (${p.party_role})`).join(", ") || "",
        "{{PLAINTIFF_NAMES}}": plaintiffs.map((p) => p.party_name).join(", "),
        "{{DEFENDANT_NAMES}}": defendants.map((p) => p.party_name).join(", "),
        "{{PARTIES_JSON}}": JSON.stringify(parties || []),
        "{{STATEMENT_OF_FACTS}}": orderData.statement_of_facts || "",
        "{{PROCEDURAL_HISTORY}}": orderData.procedural_history || "",
        "{{CLIENT_INSTRUCTIONS}}": orderData.instructions || "",
        "{{DOCUMENT_CONTENT}}": documentContent,
        "{{ORDER_ID}}": orderId,
        "{{ORDER_NUMBER}}": orderData.order_number || "",
        "{{TODAY_DATE}}": todayDate,
      };

      // Replace all placeholders in template (if any exist)
      let templateContent = template.template;
      for (const [placeholder, value] of Object.entries(replacements)) {
        templateContent = templateContent.replace(new RegExp(placeholder.replace(/[{}]/g, "\\$&"), "g"), value);
      }

      // Put CASE DATA FIRST so it doesn't get lost in the massive superprompt
      const webContextAdapter = buildWebContextAdapter(orderId);
      return webContextAdapter + structuredCaseData + '\n\n' + templateContent;
    });

    // Step 4: Generate draft with Claude (with automatic rate limit handling)
    const generatedMotion = await step.run("generate-draft", async () => {
      // Log the request attempt
      logRequest();

      // Get parties for the user message
      const { data: parties } = await supabase
        .from("parties")
        .select("*")
        .eq("order_id", orderId);

      const plaintiffs = parties?.filter((p) => p.party_role?.toLowerCase().includes("plaintiff")) || [];
      const defendants = parties?.filter((p) => p.party_role?.toLowerCase().includes("defendant")) || [];

      // Put the critical instruction in the USER MESSAGE so it's the last thing Claude sees
      const userMessage = `CRITICAL: The case data has already been provided in the system context above. DO NOT ask for more information. DO NOT say "I need" or list requirements. DO NOT output Phase I status updates.

Your task: Using the customer_intake JSON and uploaded_documents provided above, generate the COMPLETE ${orderData.motion_type || "motion"} document NOW.

START YOUR RESPONSE WITH THE COURT CAPTION:

IN THE ${orderData.jurisdiction === "la_state" ? "CIVIL DISTRICT COURT" : orderData.jurisdiction?.toUpperCase() || "[COURT]"}
${orderData.court_division ? `FOR THE ${orderData.court_division.toUpperCase()}` : ""}

${plaintiffs.map((p) => p.party_name).join(", ") || "[PLAINTIFF]"},
     Plaintiff${plaintiffs.length > 1 ? "s" : ""},

vs.                                    CASE NO. ${orderData.case_number || "[NUMBER]"}

${defendants.map((p) => p.party_name).join(", ") || "[DEFENDANT]"},
     Defendant${defendants.length > 1 ? "s" : ""}.

                    MOTION FOR ${(orderData.motion_type || "RELIEF").toUpperCase().replace(/_/g, " ")}

[NOW CONTINUE WITH THE COMPLETE MOTION DOCUMENT - Introduction, Statement of Facts, Legal Arguments, Conclusion, Prayer for Relief, Certificate of Service]`;

      console.log(`[Inngest] Starting Claude generation for order ${orderId}`);

      const response = await createMessageWithRetry(
        {
          model: "claude-opus-4-5-20251101",
          max_tokens: 64000,
          system: context,
          messages: [{ role: "user", content: userMessage }],
        },
        {
          maxRetries: 5,
          onRetry: async (attempt, waitMs, error) => {
            console.log(`[Inngest] Retry ${attempt} for order ${orderId}. Waiting ${Math.round(waitMs / 1000)}s. Error: ${error}`);
            // Log retry to database
            await supabase.from("automation_logs").insert({
              order_id: orderId,
              action_type: "generation_retry",
              action_details: { attempt, waitMs, error, source: "inngest" },
            });
          },
          onSuccess: (inputTokens, outputTokens) => {
            console.log(`[Inngest] Success for order ${orderId}. Tokens: ${inputTokens} in, ${outputTokens} out`);
          },
        }
      );

      const motion = response.content
        .filter((block): block is Anthropic.TextBlock => block.type === "text")
        .map((block) => block.text)
        .join("\n");

      return {
        motion,
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      };
    });

    // Step 5: Process file operations and save the draft
    const conversationData = await step.run("save-draft", async () => {
      // Parse any file operations from the response
      const { operations, cleanedResponse } = parseFileOperations(generatedMotion.motion);

      // Execute file operations (save HANDOFF files, etc.)
      if (operations.length > 0) {
        await executeFileOperations(orderId, operations);
      }

      // Create conversation record
      const { data: conversation, error: convError } = await supabase
        .from("conversations")
        .insert({
          order_id: orderId,
          initial_context: context,
          generated_motion: cleanedResponse, // Use cleaned response (without XML tags)
          status: "active",
        })
        .select()
        .single();

      if (convError) {
        console.error("Failed to create conversation:", convError);
      }

      // Save messages if conversation was created
      if (conversation) {
        await supabase.from("conversation_messages").insert([
          {
            conversation_id: conversation.id,
            role: "system",
            content: context,
            sequence_number: 1,
          },
          {
            conversation_id: conversation.id,
            role: "user",
            content: "Please generate the complete motion based on the case information and documents provided. Complete all phases without stopping.",
            sequence_number: 2,
          },
          {
            conversation_id: conversation.id,
            role: "assistant",
            content: generatedMotion.motion, // Store full response including file tags
            is_motion_draft: true,
            sequence_number: 3,
            input_tokens: generatedMotion.inputTokens,
            output_tokens: generatedMotion.outputTokens,
          },
        ]);
      }

      // Update order status to pending_review so admin can approve before delivery
      // This ensures the motion goes through admin review before being visible to client
      await supabase
        .from("orders")
        .update({
          status: "pending_review",
          generation_completed_at: new Date().toISOString(),
          generation_error: null,
        })
        .eq("id", orderId);

      // Log success
      await supabase.from("automation_logs").insert({
        order_id: orderId,
        action_type: "motion_generated",
        action_details: {
          conversationId: conversation?.id,
          inputTokens: generatedMotion.inputTokens,
          outputTokens: generatedMotion.outputTokens,
          model: "claude-opus-4-5-20251101",
          fileOperations: operations.length,
          generationTimeMs:
            Date.now() - new Date(orderData.generation_started_at || Date.now()).getTime(),
        },
      });

      return { conversationId: conversation?.id, motion: cleanedResponse };
    });

    // Step 5.5: Quick quality check (non-blocking but logged)
    const qualityResult = await step.run("quality-check", async () => {
      try {
        const motionContent = conversationData.motion || generatedMotion.motion;

        // Run quick validation (no AI, just structural checks)
        // Only citation_requirements.minimum is actually used by the validator
        const validation = quickValidate(motionContent, {
          motionType: {
            citation_requirements: { minimum: 4, hard_stop: false },
          } as import('@/types/workflow').MotionType,
          jurisdiction: orderData.jurisdiction,
        });

        // Extract citations for logging
        const citations = extractCitations(motionContent);

        // Log quality metrics
        await supabase.from("automation_logs").insert({
          order_id: orderId,
          action_type: "quality_check",
          action_details: {
            passes: validation.passes,
            issueCount: validation.issues.length,
            citationCount: citations.length,
            criticalIssues: validation.issues.filter(i => i.severity === 'critical').length,
            majorIssues: validation.issues.filter(i => i.severity === 'major').length,
            issues: validation.issues.slice(0, 5).map(i => ({ title: i.title, severity: i.severity })),
          },
        });

        // If critical issues, flag for manual review
        const criticalIssues = validation.issues.filter(i => i.severity === 'critical');
        if (criticalIssues.length > 0) {
          await supabase.from("orders").update({
            needs_manual_review: true,
            quality_notes: `Quality check found ${criticalIssues.length} critical issue(s): ${criticalIssues.map(i => i.title).join(', ')}`,
          }).eq("id", orderId);
        }

        return {
          passes: validation.passes,
          citationCount: citations.length,
          issueCount: validation.issues.length,
          criticalIssues: criticalIssues.length,
        };
      } catch (qcError) {
        console.error("[Inngest] Quality check error:", qcError);
        // Don't fail the pipeline - quality check is informational
        return { passes: true, error: qcError instanceof Error ? qcError.message : 'Unknown' };
      }
    });

    // Step 5.6: Extract citations from generated motion
    const citationResult = await step.run("extract-citations", async () => {
      try {
        const motionContent = conversationData.motion || generatedMotion.motion;
        const citations = extractCitations(motionContent);

        // Log citation extraction
        await supabase.from("automation_logs").insert({
          order_id: orderId,
          action_type: "citations_extracted",
          action_details: {
            citationCount: citations.length,
            citationTypes: citations.reduce((acc, c) => {
              acc[c.type] = (acc[c.type] || 0) + 1;
              return acc;
            }, {} as Record<string, number>),
            sampleCitations: citations.slice(0, 5).map(c => c.text),
          },
        });

        console.log(`[Inngest] Extracted ${citations.length} citations for order ${orderId}`);

        return {
          count: citations.length,
          citations: citations.slice(0, 10), // Keep first 10 for reference
        };
      } catch (extractError) {
        console.error("[Inngest] Citation extraction error:", extractError);
        // Don't fail the pipeline - citation extraction is informational
        return { count: 0, error: extractError instanceof Error ? extractError.message : 'Unknown' };
      }
    });

    // Step 5.7: Verify citations (NON-BLOCKING - informational only)
    const citationVerification = await step.run("verify-citations", async () => {
      try {
        const citationCount = citationResult.count || 0;
        const CITATION_MINIMUM = 4;

        // Determine quality status based on citation count
        const qualityStatus = citationCount >= CITATION_MINIMUM ? 'pass' : 'warning';
        const qualityMessage = citationCount >= CITATION_MINIMUM
          ? `Citation count (${citationCount}) meets minimum requirement of ${CITATION_MINIMUM}`
          : `Citation count (${citationCount}) below recommended minimum of ${CITATION_MINIMUM}`;

        // Log verification result
        await supabase.from("automation_logs").insert({
          order_id: orderId,
          action_type: "citation_verification",
          action_details: {
            citationCount,
            minimumRequired: CITATION_MINIMUM,
            qualityStatus,
            qualityMessage,
            isBlocking: false, // Non-blocking for now
          },
        });

        // If citation count is low, flag for review but don't block
        if (qualityStatus === 'warning') {
          console.log(`[Inngest] Citation warning for order ${orderId}: ${qualityMessage}`);

          // Update order with quality warning (non-blocking)
          await supabase.from("orders").update({
            quality_notes: `Citation warning: ${qualityMessage}`,
          }).eq("id", orderId);
        } else {
          console.log(`[Inngest] Citation verification passed for order ${orderId}: ${qualityMessage}`);
        }

        return {
          citationCount,
          qualityStatus,
          qualityMessage,
          meetsMinimum: citationCount >= CITATION_MINIMUM,
        };
      } catch (verifyError) {
        console.error("[Inngest] Citation verification error:", verifyError);
        // Don't fail the pipeline - verification is informational
        return {
          citationCount: citationResult.count || 0,
          qualityStatus: 'unknown',
          qualityMessage: 'Verification failed',
          error: verifyError instanceof Error ? verifyError.message : 'Unknown',
        };
      }
    });

    // Step 6: Send notification to admin
    await step.run("send-notification", async () => {
      // Queue notification for admin - draft ready
      await supabase.from("notification_queue").insert({
        notification_type: "draft_ready",
        recipient_email: ADMIN_EMAIL,
        order_id: orderId,
        template_data: {
          orderNumber: orderData.order_number,
          motionType: orderData.motion_type,
          caseCaption: orderData.case_caption,
        },
        priority: 8,
        status: "pending",
      });

      // Queue approval_needed notification with citation count and quality score
      const citationCount = citationVerification.citationCount || 0;
      const qualityScore = qualityResult.passes ? 'pass' : 'needs_review';
      const criticalIssues = 'criticalIssues' in qualityResult ? qualityResult.criticalIssues : 0;

      await supabase.from("notification_queue").insert({
        notification_type: "approval_needed",
        recipient_email: ADMIN_EMAIL,
        order_id: orderId,
        template_data: {
          orderNumber: orderData.order_number,
          motionType: orderData.motion_type,
          caseCaption: orderData.case_caption,
          citationCount,
          citationStatus: citationVerification.qualityStatus || 'unknown',
          qualityScore,
          criticalIssues,
          reviewUrl: `${process.env.NEXT_PUBLIC_APP_URL || 'https://motiongranted.com'}/admin/orders/${orderId}`,
        },
        priority: 9, // Higher priority than draft_ready
        status: "pending",
      });

      // Also log as automation event
      await supabase.from("automation_logs").insert({
        order_id: orderId,
        action_type: "admin_notified",
        action_details: {
          notificationType: "draft_ready",
          approvalNeeded: true,
          citationCount,
          qualityScore,
          criticalIssues,
        },
      });
    });

    return {
      success: true,
      orderId,
      conversationId: conversationData.conversationId,
      status: "pending_review",
    };
  }
);

/**
 * Order Generation Failure Handler
 *
 * Called when order generation fails after all retries.
 * Sends alert email and updates order status.
 */
export const handleGenerationFailure = inngest.createFunction(
  {
    id: "handle-generation-failure",
  },
  { event: "inngest/function.failed" },
  async ({ event, step }) => {
    // Only handle failures from our generation function
    if (event.data.function_id !== "generate-order-draft") {
      return { skipped: true };
    }

    const { orderId } = event.data.event.data as { orderId: string };
    const errorMessage = event.data.error?.message || "Unknown error";
    const supabase = getSupabase();

    await step.run("log-failure", async () => {
      // Update order status
      await supabase
        .from("orders")
        .update({
          status: "generation_failed",
          generation_error: errorMessage,
        })
        .eq("id", orderId);

      // Log the failure
      await supabase.from("automation_logs").insert({
        order_id: orderId,
        action_type: "generation_failed",
        action_details: {
          error: errorMessage,
          attempts: 3,
          functionId: event.data.function_id,
        },
      });
    });

    // Send alert email
    await step.run("send-alert-email", async () => {
      // Get order details
      const { data: order } = await supabase
        .from("orders")
        .select("order_number, case_caption, motion_type, filing_deadline")
        .eq("id", orderId)
        .single();

      // Try to send email via Resend
      try {
        const { Resend } = await import("resend");
        const resend = new Resend(process.env.RESEND_API_KEY);

        await resend.emails.send({
          from: EMAIL_FROM.alerts,
          to: ALERT_EMAIL,
          subject: `[ALERT] Order ${order?.order_number || orderId} generation failed`,
          text: `
Order Generation Failed - Requires Manual Intervention

Order Details:
- Order Number: ${order?.order_number || "N/A"}
- Case: ${order?.case_caption || "N/A"}
- Motion Type: ${order?.motion_type || "N/A"}
- Filing Deadline: ${order?.filing_deadline || "N/A"}

Error: ${errorMessage}

Attempts: 3 (all retries exhausted)

Action Required:
1. Check the admin dashboard for this order
2. Review the error logs
3. Manually retry or process the order

Admin Dashboard: ${process.env.NEXT_PUBLIC_APP_URL}/admin/orders/${orderId}
          `.trim(),
        });
      } catch (emailError) {
        console.error("Failed to send alert email:", emailError);
        // Queue for retry via notification queue
        await supabase.from("notification_queue").insert({
          notification_type: "generation_failed",
          recipient_email: ALERT_EMAIL,
          order_id: orderId,
          template_data: {
            orderNumber: order?.order_number,
            error: errorMessage,
            attempts: 3,
          },
          priority: 10,
          status: "pending",
        });
      }
    });

    return { orderId, failed: true };
  }
);

/**
 * Daily Deadline Check
 *
 * Runs daily at 6am CT to check for orders with urgent deadlines.
 * Sends alerts for orders due within 24 hours that aren't completed.
 */
export const deadlineCheck = inngest.createFunction(
  {
    id: "deadline-check",
  },
  // Run daily at 6am CT (11am UTC in winter, 12pm UTC in summer)
  { cron: "0 11 * * *" },
  async ({ step }) => {
    const supabase = getSupabase();

    // Find orders due in <24 hours that aren't completed
    const urgentOrders = await step.run("find-urgent-orders", async () => {
      const twentyFourHoursFromNow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

      const { data: orders, error } = await supabase
        .from("orders")
        .select("id, order_number, case_caption, motion_type, filing_deadline, status, client_id")
        .lt("filing_deadline", twentyFourHoursFromNow)
        .not("status", "in", "(completed,delivered,cancelled)")
        .order("filing_deadline", { ascending: true });

      if (error) {
        console.error("Failed to fetch urgent orders:", error);
        return [];
      }

      return orders || [];
    });

    if (urgentOrders.length === 0) {
      return { urgentCount: 0 };
    }

    // Send alerts
    await step.run("send-deadline-alerts", async () => {
      try {
        const { Resend } = await import("resend");
        const resend = new Resend(process.env.RESEND_API_KEY);

        const orderList = urgentOrders
          .map((o) => {
            const deadline = new Date(o.filing_deadline);
            const hoursLeft = Math.round((deadline.getTime() - Date.now()) / (1000 * 60 * 60));
            return `- ${o.order_number}: ${o.case_caption} (${o.motion_type}) - ${hoursLeft}h left - Status: ${o.status}`;
          })
          .join("\n");

        await resend.emails.send({
          from: EMAIL_FROM.alerts,
          to: ALERT_EMAIL,
          subject: `[URGENT] ${urgentOrders.length} order(s) due within 24 hours`,
          text: `
Deadline Alert - Orders Due Within 24 Hours

The following orders have filing deadlines within the next 24 hours and are not yet completed:

${orderList}

Total: ${urgentOrders.length} order(s)

Please review these orders immediately in the admin dashboard:
${process.env.NEXT_PUBLIC_APP_URL}/admin/queue

---
Motion Granted Automated Alert System
          `.trim(),
        });

        // Log the alert
        await supabase.from("automation_logs").insert({
          action_type: "deadline_alert_sent",
          action_details: {
            urgentCount: urgentOrders.length,
            orderIds: urgentOrders.map((o) => o.id),
          },
        });
      } catch (emailError) {
        console.error("Failed to send deadline alert:", emailError);
      }
    });

    return {
      urgentCount: urgentOrders.length,
      orders: urgentOrders.map((o) => o.order_number),
    };
  }
);

/**
 * Queue Position Calculator
 *
 * Recalculates queue positions for all pending orders based on deadline priority.
 * Runs after each order is submitted or completed.
 */
export const updateQueuePositions = inngest.createFunction(
  {
    id: "update-queue-positions",
    // Debounce to avoid running too frequently (no key = all events debounced together)
    debounce: {
      period: "10s",
    },
  },
  { event: "order/submitted" },
  async ({ step }) => {
    const supabase = getSupabase();

    await step.run("recalculate-positions", async () => {
      // Get all orders in queue (submitted or in_progress)
      const { data: orders, error } = await supabase
        .from("orders")
        .select("id, filing_deadline")
        .in("status", ["submitted", "under_review", "in_progress"])
        .order("filing_deadline", { ascending: true });

      if (error || !orders) {
        console.error("Failed to fetch queue orders:", error);
        return;
      }

      // Update queue positions based on deadline order
      for (let i = 0; i < orders.length; i++) {
        await supabase
          .from("orders")
          .update({ queue_position: i + 1 })
          .eq("id", orders[i].id);
      }

      return { updated: orders.length };
    });
  }
);

// ============================================================================
// v7.2 WORKFLOW FUNCTIONS
// ============================================================================

import { executePhase } from "@/lib/workflow/phase-executor";
import {
  PhaseId,
  Tier,
  getNextPhase,
  isBlockingCheckpoint,
  hasCheckpoint,
  getPhaseConfig,
  gradePasses,
} from "@/lib/workflow/phase-config";

/**
 * v7.2 Workflow Phase Execution
 *
 * Executes individual phases of the 14-phase workflow system.
 * Handles checkpoints, grade-based branching, and revision loops.
 */
export const executeWorkflowPhase = inngest.createFunction(
  {
    id: "workflow-execute-phase",
    retries: 3,
    concurrency: {
      limit: 5,  // Inngest plan limit
    },
  },
  { event: "workflow/execute-phase" },
  async ({ event, step }) => {
    const { orderId, workflowId, phase } = event.data;
    const supabase = getSupabase();

    // Step 1: Get workflow state
    const state = await step.run("get-workflow-state", async () => {
      const { data, error } = await supabase
        .from("workflow_state")
        .select("*")
        .eq("id", workflowId)
        .single();

      if (error || !data) {
        throw new Error(`Workflow state not found: ${error?.message}`);
      }

      return data;
    });

    // Step 2: Get order data
    const order = await step.run("get-order-data", async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("*, order_documents:documents(*)")
        .eq("id", orderId)
        .single();

      if (error || !data) {
        throw new Error(`Order not found: ${error?.message}`);
      }

      return data;
    });

    // Step 3: Update workflow status to RUNNING
    await step.run("mark-phase-running", async () => {
      await supabase
        .from("workflow_state")
        .update({
          current_phase: phase,
          phase_status: "RUNNING",
          updated_at: new Date().toISOString(),
        })
        .eq("id", workflowId);
    });

    // Step 4: Build phase input
    const phaseInput = await step.run("build-phase-input", async () => {
      return {
        order_id: order.id,
        submitted_at: order.created_at,
        customer_intake: {
          motion_type: order.motion_type,
          filing_posture: order.filing_posture,
          filing_deadline: order.filing_deadline,
          hearing_date: order.hearing_date,
          party_represented: order.party_represented,
          party_name: order.party_name,
          statement_of_facts: order.statement_of_facts,
          arguments_caselaw: order.arguments_caselaw,
          opposing_party_name: order.opposing_party_name,
          opposing_counsel_name: order.opposing_counsel_name,
          judge_name: order.judge_name,
        },
        uploaded_documents: order.order_documents?.map((doc: Record<string, unknown>) => ({
          document_id: doc.id,
          filename: doc.file_name,
          document_type: doc.document_type,
          content_text: doc.parsed_content,
        })) || [],
        previous_phases: state.phase_outputs || {},
      };
    });

    // Step 5: Execute phase
    const result = await step.run("execute-phase", async () => {
      // Build order context from state and order data
      const orderContext = {
        id: orderId,
        tier: (state.tier || 'A') as 'A' | 'B' | 'C',
        motionType: order.motion_type || '',
        jurisdiction: order.jurisdiction || '',
        state: order.jurisdiction?.split('-')[0] || '',
        courtType: 'state' as const,
        judgeOrderedSeparateStatement: order.judge_ordered_separate_statement || false,
      };
      return await executePhase({
        orderId,
        workflowId,
        phase: phase as PhaseId,
        orderContext,
        input: phaseInput,
      });
    });

    // Step 6: Log execution
    await step.run("log-execution", async () => {
      await supabase.from("phase_executions").insert({
        order_id: orderId,
        workflow_id: workflowId,
        phase,
        model_used: (result.output as Record<string, unknown>)?.model_used || "unknown",
        input_data: phaseInput,
        output_data: result.output,
        status: result.success ? "COMPLETE" : "ERROR",
        error_message: result.error,
        input_tokens: null, // Token tracking in workflow-orchestration.ts
        output_tokens: null,
        duration_ms: result.durationMs,
        completed_at: new Date().toISOString(),
      });
    });

    if (!result.success) {
      // Update workflow to error state
      await step.run("mark-phase-error", async () => {
        await supabase
          .from("workflow_state")
          .update({
            phase_status: "ERROR",
            updated_at: new Date().toISOString(),
          })
          .eq("id", workflowId);
      });

      throw new Error(`Phase ${phase} failed: ${result.error}`);
    }

    // Step 7: Update workflow state with output
    const nextPhaseResult = await step.run("update-workflow-state", async () => {
      // Extract tier and path from Phase I output
      let tierUpdate: Record<string, string> = {};
      if (phase === "I" && result.output) {
        const phaseIOutput = result.output as { determinations?: { tier: string; path: string } };
        if (phaseIOutput.determinations) {
          tierUpdate = {
            tier: phaseIOutput.determinations.tier,
            path: phaseIOutput.determinations.path,
          };
        }
      }

      // Update phase outputs
      const updatedOutputs = {
        ...state.phase_outputs,
        [phase]: result.output,
      };

      // Determine next phase
      const phaseConfig = getPhaseConfig(phase as PhaseId);
      let nextPhase: PhaseId | null = null;
      let checkpointPending = false;
      let checkpointData = null;

      // Check Phase VII grading
      if (phase === "VII") {
        const phaseVIIOutput = result.output as { grading?: {
          numeric_grade?: number;
          grade?: string;
          strengths?: string[];
          weaknesses?: string[];
          feedback?: string;
          suggestions?: string[];
        } };
        const numericGrade = phaseVIIOutput?.grading?.numeric_grade || 0;
        const passes = gradePasses(numericGrade);

        // Save judge simulation result
        await supabase.from("judge_simulation_results").insert({
          workflow_id: workflowId,
          order_id: orderId,
          grade: phaseVIIOutput?.grading?.grade || "F",
          numeric_grade: numericGrade,
          passes,
          strengths: phaseVIIOutput?.grading?.strengths || [],
          weaknesses: phaseVIIOutput?.grading?.weaknesses || [],
          specific_feedback: phaseVIIOutput?.grading?.feedback || "",
          revision_suggestions: phaseVIIOutput?.grading?.suggestions || [],
          loop_number: state.revision_loop_count + 1,
        });

        nextPhase = getNextPhase(phase as PhaseId, {
          gradePasses: passes,
          revisionLoopCount: state.revision_loop_count,
        });
      } else if (phase === "VIII") {
        const phaseVIIIOutput = result.output as { new_citations_added?: boolean };
        const newCitations = phaseVIIIOutput?.new_citations_added || false;
        nextPhase = getNextPhase(phase as PhaseId, { newCitationsAdded: newCitations });
      } else if (phase === "IX") {
        const phaseIOutput = state.phase_outputs?.["I"] as { motion_type?: string } | undefined;
        const motionType = phaseIOutput?.motion_type || "";
        nextPhase = getNextPhase(phase as PhaseId, { motionType });
      } else {
        nextPhase = getNextPhase(phase as PhaseId);
      }

      // Check for checkpoint
      if (hasCheckpoint(phase as PhaseId)) {
        if (isBlockingCheckpoint(phase as PhaseId)) {
          checkpointPending = true;
          checkpointData = {
            type: phaseConfig.checkpoint?.type,
            phase,
            actions: phaseConfig.checkpoint?.actions,
            data: result.output,
          };
        }
      }

      // Update workflow state
      await supabase
        .from("workflow_state")
        .update({
          ...tierUpdate,
          current_phase: checkpointPending ? phase : (nextPhase || phase),
          phase_status: checkpointPending ? "CHECKPOINT" : (nextPhase ? "PENDING" : "COMPLETE"),
          phase_outputs: updatedOutputs,
          checkpoint_pending: checkpointPending,
          checkpoint_type: checkpointPending ? phaseConfig.checkpoint?.type : null,
          checkpoint_data: checkpointData,
          revision_loop_count: phase === "VIII" ? state.revision_loop_count + 1 : state.revision_loop_count,
          updated_at: new Date().toISOString(),
          ...(nextPhase === null && !checkpointPending && { completed_at: new Date().toISOString() }),
        })
        .eq("id", workflowId);

      return { nextPhase, checkpointPending, checkpointData };
    });

    // Step 8: Trigger next phase or checkpoint notification
    if (nextPhaseResult.checkpointPending) {
      await step.sendEvent("checkpoint-notification", {
        name: "workflow/checkpoint-reached",
        data: {
          orderId,
          workflowId,
          checkpoint: nextPhaseResult.checkpointData,
        },
      });
    } else if (nextPhaseResult.nextPhase) {
      await step.sendEvent("trigger-next-phase", {
        name: "workflow/execute-phase",
        data: {
          orderId,
          workflowId,
          phase: nextPhaseResult.nextPhase,
        },
      });
    }

    return {
      success: true,
      phase,
      nextPhase: nextPhaseResult.nextPhase,
      checkpointPending: nextPhaseResult.checkpointPending,
    };
  }
);

/**
 * Handle Checkpoint Approval
 *
 * Called when an admin approves/rejects a blocking checkpoint.
 */
export const handleCheckpointApproval = inngest.createFunction(
  {
    id: "workflow-checkpoint-approval",
  },
  { event: "workflow/checkpoint-approved" },
  async ({ event, step }) => {
    const { orderId, workflowId, action, nextPhase } = event.data;
    const supabase = getSupabase();

    await step.run("process-approval", async () => {
      if (action === "APPROVE" && nextPhase) {
        // Clear checkpoint and continue
        await supabase
          .from("workflow_state")
          .update({
            checkpoint_pending: false,
            checkpoint_type: null,
            checkpoint_data: null,
            phase_status: "PENDING",
          })
          .eq("id", workflowId);

        // Update order status
        await supabase
          .from("orders")
          .update({ status: "completed" })
          .eq("id", orderId);
      } else if (action === "REQUEST_CHANGES") {
        // Route back to Phase VIII
        await supabase
          .from("workflow_state")
          .update({
            checkpoint_pending: false,
            checkpoint_type: null,
            checkpoint_data: null,
            current_phase: "VIII",
            phase_status: "PENDING",
          })
          .eq("id", workflowId);
      } else if (action === "CANCEL") {
        await supabase
          .from("workflow_state")
          .update({
            checkpoint_pending: false,
            phase_status: "CANCELLED",
          })
          .eq("id", workflowId);

        await supabase
          .from("orders")
          .update({ status: "cancelled" })
          .eq("id", orderId);
      }
    });

    // Continue workflow if approved
    if (action === "APPROVE" && nextPhase) {
      await step.sendEvent("continue-workflow", {
        name: "workflow/execute-phase",
        data: {
          orderId,
          workflowId,
          phase: nextPhase,
        },
      });
    } else if (action === "REQUEST_CHANGES") {
      await step.sendEvent("request-changes", {
        name: "workflow/execute-phase",
        data: {
          orderId,
          workflowId,
          phase: "VIII",
        },
      });
    }

    return { action, continued: action === "APPROVE" };
  }
);

/**
 * Start Workflow on Order Submission (v7.2)
 *
 * Alternative to direct generation - starts the 14-phase workflow.
 */
export const startWorkflowOnOrder = inngest.createFunction(
  {
    id: "workflow-start-on-order",
  },
  { event: "order/submitted" },
  async ({ event, step }) => {
    const { orderId } = event.data;
    const supabase = getSupabase();

    // Check if workflow_state table exists and if we should use v7.2 workflow
    const useV72Workflow = process.env.USE_V72_WORKFLOW === "true";

    if (!useV72Workflow) {
      // Let the existing generateOrderDraft function handle it
      return { skipped: true, reason: "v7.2 workflow not enabled" };
    }

    const workflowId = await step.run("create-workflow-state", async () => {
      const id = crypto.randomUUID();

      await supabase.from("workflow_state").insert({
        id,
        order_id: orderId,
        current_phase: "I",
        phase_status: "PENDING",
      });

      return id;
    });

    // Trigger first phase
    await step.sendEvent("start-phase-i", {
      name: "workflow/execute-phase",
      data: {
        orderId,
        workflowId,
        phase: "I",
      },
    });

    return { workflowId, started: true };
  }
);

// Export all functions for registration
// v7.4.1: generateOrderWorkflow (from workflowFunctions) now handles order/submitted directly
// Legacy functions commented out to prevent duplicate event handling
export const functions = [
  // generateOrderDraft,      // DISABLED: Legacy single-call superprompt (conflicts with 14-phase workflow)
  handleGenerationFailure,
  // New 14-phase workflow - PRIMARY HANDLER for order/submitted
  ...workflowFunctions,    // Includes: generateOrderWorkflow, handleWorkflowFailure
  // Supporting functions
  deadlineCheck,
  updateQueuePositions,
  // v7.2 Workflow Functions (placeholder implementations - disabled in favor of workflow-orchestration.ts)
  // executeWorkflowPhase,      // DISABLED: Uses placeholder phase-executor.ts
  handleCheckpointApproval,
  // startWorkflowOnOrder,      // DISABLED: Routes to placeholder executeWorkflowPhase
];
