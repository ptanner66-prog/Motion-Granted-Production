import { inngest } from "./client";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";
import { canMakeRequest, logRequest } from "@/lib/rate-limit";
import { parseFileOperations, executeFileOperations } from "@/lib/workflow/file-system";
import { ADMIN_EMAIL, ALERT_EMAIL, EMAIL_FROM } from "@/lib/config/notifications";
import { createMessageWithRetry } from "@/lib/claude-client";

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
 * Order Draft Generation Function
 *
 * Processes paid orders through Claude API to generate motion drafts.
 * Features:
 * - Priority-based processing (deadline-ordered)
 * - Step-based checkpointing (resume on failure, don't restart)
 * - 3 retries with exponential backoff
 * - Concurrency limit of 5 for Claude rate limit safety
 * - Failure alerting via email
 * - Continuous execution mode (all 9 phases in one shot)
 */
export const generateOrderDraft = inngest.createFunction(
  {
    id: "generate-order-draft",
    // Process one order at a time for reliability and cost control
    // Increase to 2-3 once system is proven stable
    concurrency: {
      limit: 1,
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

      // Build document content
      const documentContent = documents
        ?.map((doc) => `[${doc.document_type}] ${doc.file_name}:\n${doc.parsed_content || ""}`)
        .join("\n\n---\n\n") || "";

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
          model: "claude-opus-4-20250514",
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

      // Update order status to draft_delivered so admin can approve
      // Using 'draft_delivered' as it's valid in all database constraint versions
      await supabase
        .from("orders")
        .update({
          status: "draft_delivered",
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
          model: "claude-opus-4-20250514",
          fileOperations: operations.length,
          generationTimeMs:
            Date.now() - new Date(orderData.generation_started_at || Date.now()).getTime(),
        },
      });

      return { conversationId: conversation?.id };
    });

    // Step 6: Send notification to admin
    await step.run("send-notification", async () => {
      // Queue notification for admin
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

      // Also log as automation event
      await supabase.from("automation_logs").insert({
        order_id: orderId,
        action_type: "admin_notified",
        action_details: {
          notificationType: "draft_ready",
        },
      });
    });

    return {
      success: true,
      orderId,
      conversationId: conversationData.conversationId,
      status: "draft_delivered",
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

// Export all functions for registration
export const functions = [
  generateOrderDraft,
  handleGenerationFailure,
  deadlineCheck,
  updateQueuePositions,
];
