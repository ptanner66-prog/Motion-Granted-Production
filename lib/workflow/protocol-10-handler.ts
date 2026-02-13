/**
 * Protocol 10: Max Revision Loops Exhausted
 *
 * When Phase VII never reaches the quality threshold after max loops:
 * 1. Generate Enhanced Disclosure text for the Attorney Instruction Sheet
 * 2. Flag the workflow with max_loops_reached
 * 3. Use the BEST version produced (the latest currentDraft)
 * 4. Route to Phase VIII.5 (caption validation) -> IX -> X as normal
 *
 * The Enhanced Disclosure informs the reviewing attorney that the motion
 * did not meet the automated quality threshold and requires extra review.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

/** Generate the disclosure text injected into the Attorney Instruction Sheet. */
export function generateProtocol10Disclosure(
  revisionCount: number,
  lastLetterGrade: string | undefined,
  numericGrade: number,
  threshold: number,
  tier: string,
): string {
  const gradeLabel = lastLetterGrade ? ` Final automated grade: ${lastLetterGrade} (${numericGrade.toFixed(1)}).` : '';
  return (
    `ENHANCED REVIEW DISCLOSURE (Protocol 10):\n` +
    `This motion underwent ${revisionCount} automated revision cycle(s) ` +
    `but did not reach the Tier ${tier} quality threshold of ${threshold.toFixed(1)}.` +
    `${gradeLabel}\n` +
    `Enhanced attorney review is required before filing.\n` +
    `This disclosure is provided for transparency per Motion Granted quality protocols.`
  );
}

/**
 * Persist Protocol 10 state to the database.
 *
 * Called from an Inngest step.run() inside the orchestration so the
 * Supabase client is passed in (service-role, not cookie-based).
 */
export async function handleProtocol10Exit(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  orderId: string,
  workflowId: string,
  tier: string,
  loopsCompleted: number,
  maxLoops: number,
  numericGrade: number,
  threshold: number,
  lastLetterGrade: string | undefined,
): Promise<string> {
  const disclosure = generateProtocol10Disclosure(
    loopsCompleted,
    lastLetterGrade,
    numericGrade,
    threshold,
    tier,
  );

  const now = new Date().toISOString();

  console.warn(
    `[${orderId}] PROTOCOL 10: Max loops exhausted (${loopsCompleted}/${maxLoops}). ` +
    `Last score: ${numericGrade.toFixed(1)}, Threshold: ${threshold.toFixed(1)}, Tier: ${tier}. ` +
    `Proceeding with Enhanced Disclosure.`
  );

  // Flag the workflow
  await supabase
    .from("order_workflows")
    .update({
      max_loops_reached: true,
      loop_exit_triggered_at: now,
      protocol_10_disclosure: disclosure,
    })
    .eq("id", workflowId);

  // Audit log
  await supabase.from("automation_logs").insert({
    order_id: orderId,
    action_type: "protocol_10_triggered",
    action_details: {
      workflowId,
      tier,
      loopsCompleted,
      maxLoops,
      lastNumericGrade: numericGrade,
      threshold,
      lastLetterGrade,
      disclosure,
      triggeredAt: now,
    },
  });

  return disclosure;
}
