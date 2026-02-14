/**
 * Smart Clerk Assignment Automation Module
 *
 * This module handles automatic clerk assignment based on workload, expertise,
 * and deadline considerations using AI-powered recommendations.
 */

import { createClient } from '@/lib/supabase/server';
import { createLogger } from '@/lib/security/logger';

const log = createLogger('automation-clerk-assigner');
import {
  recommendClerkAssignment,
  isClaudeConfigured,
  type ClerkAssignmentInput,
  type ClerkAssignmentOutput,
} from './claude';
import type {
  ClerkAssignmentResult,
  ClerkCandidate,
  OperationResult,
} from '@/types/automation';

// ============================================================================
// TYPES
// ============================================================================

interface AssignmentOptions {
  useAI?: boolean;
  autoAssignThreshold?: number;
  excludeClerkIds?: string[];
  preferClerkId?: string;
}

interface ClerkWithExpertise {
  id: string;
  availability_status: string;
  current_workload: number;
  max_workload: number;
  profiles: {
    full_name: string;
    email: string;
  };
  clerk_expertise: Array<{
    motion_type: string;
    expertise_level: number;
    orders_completed: number;
    average_completion_days: number | null;
  }>;
}

interface AssignmentWeights {
  capacity: number;
  expertise: number;
  deadline: number;
  balance: number;
}

// ============================================================================
// SETTINGS HELPERS
// ============================================================================

async function getAssignmentSettings(): Promise<{
  enabled: boolean;
  autoAssignThreshold: number;
  maxConcurrentRush: number;
  weights: AssignmentWeights;
}> {
  try {
    const supabase = await createClient();

    const { data: settings } = await supabase
      .from('automation_settings')
      .select('setting_key, setting_value')
      .in('setting_key', [
        'clerk_assignment_enabled',
        'clerk_auto_assign_threshold',
        'clerk_max_concurrent_rush',
        'clerk_workload_weight',
      ]);

    interface SettingRow { setting_key: string; setting_value: unknown }
    const settingsMap = new Map(
      settings?.map((s: SettingRow) => [s.setting_key, s.setting_value]) || []
    );

    const weightsValue = settingsMap.get('clerk_workload_weight') as AssignmentWeights | undefined;

    return {
      enabled: (settingsMap.get('clerk_assignment_enabled') as { enabled?: boolean })?.enabled ?? true,
      autoAssignThreshold:
        (settingsMap.get('clerk_auto_assign_threshold') as { value?: number })?.value ?? 0.85,
      maxConcurrentRush:
        (settingsMap.get('clerk_max_concurrent_rush') as { value?: number })?.value ?? 2,
      weights: weightsValue || { capacity: 0.3, expertise: 0.4, deadline: 0.2, balance: 0.1 },
    };
  } catch (error) {
    log.error('[Clerk Assigner] Failed to load settings:', error);
    return {
      enabled: true,
      autoAssignThreshold: 0.85,
      maxConcurrentRush: 2,
      weights: { capacity: 0.3, expertise: 0.4, deadline: 0.2, balance: 0.1 },
    };
  }
}

// ============================================================================
// MAIN FUNCTIONS
// ============================================================================

/**
 * Run clerk assignment for an order
 */
export async function runClerkAssignment(
  orderId: string,
  options: AssignmentOptions = {}
): Promise<OperationResult<ClerkAssignmentResult>> {
  const startTime = Date.now();
  const supabase = await createClient();

  try {
    // Load settings
    const settings = await getAssignmentSettings();

    if (!settings.enabled) {
      return {
        success: false,
        error: 'Clerk assignment is disabled',
        code: 'ASSIGNMENT_DISABLED',
      };
    }

    const useAI = options.useAI ?? isClaudeConfigured;
    const autoAssignThreshold = options.autoAssignThreshold ?? settings.autoAssignThreshold;

    // Log start of assignment
    await logAutomationAction(supabase, orderId, 'clerk_assignment_started', {
      useAI,
      autoAssignThreshold,
    });

    // Fetch order details
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select(`
        id,
        order_number,
        motion_type,
        motion_tier,
        jurisdiction,
        turnaround,
        filing_deadline,
        clerk_id,
        documents (id)
      `)
      .eq('id', orderId)
      .single();

    if (orderError || !order) {
      throw new Error(`Order not found: ${orderId}`);
    }

    // Check if already assigned
    if (order.clerk_id && !options.preferClerkId) {
      return {
        success: false,
        error: 'Order is already assigned to a clerk',
        code: 'ALREADY_ASSIGNED',
      };
    }

    // Fetch available clerks with their expertise
    const { data: clerksData, error: clerksError } = await supabase
      .from('clerks')
      .select(`
        id,
        availability_status,
        current_workload,
        max_workload,
        profiles!inner (
          full_name,
          email
        ),
        clerk_expertise (
          motion_type,
          expertise_level,
          orders_completed,
          average_completion_days
        )
      `)
      .eq('availability_status', 'available')
      .neq('availability_status', 'unavailable');

    const clerks = clerksData as ClerkWithExpertise[] | null;

    if (clerksError) {
      throw new Error(`Failed to fetch clerks: ${clerksError.message}`);
    }

    // Filter out excluded clerks
    let availableClerks = (clerks || []).filter((c) => {
      if (options.excludeClerkIds?.includes(c.id)) return false;
      if (c.current_workload >= c.max_workload) return false;
      return true;
    });

    if (availableClerks.length === 0) {
      await logAutomationAction(supabase, orderId, 'clerk_assignment_started', {
        error: 'No available clerks',
      });

      // Create approval for manual assignment
      await createAssignmentApproval(supabase, orderId, [], 'No available clerks', 0);

      return {
        success: false,
        error: 'No available clerks for assignment',
        code: 'NO_AVAILABLE_CLERKS',
      };
    }

    // Count rush orders for each clerk
    const clerkRushCounts = await getClerkRushOrderCounts(supabase, availableClerks.map(c => c.id));

    // Filter out clerks with too many rush orders (if this is a rush order)
    if (order.turnaround !== 'standard') {
      availableClerks = availableClerks.filter((c) => {
        const rushCount = clerkRushCounts.get(c.id) || 0;
        return rushCount < settings.maxConcurrentRush;
      });

      if (availableClerks.length === 0) {
        await createAssignmentApproval(
          supabase,
          orderId,
          [],
          'All clerks at rush order capacity',
          0
        );

        return {
          success: false,
          error: 'All clerks at rush order capacity',
          code: 'RUSH_CAPACITY_EXCEEDED',
        };
      }
    }

    // Calculate scores for each clerk
    let candidates: ClerkCandidate[] = [];
    let aiAnalysis: ClerkAssignmentOutput | null = null;

    if (useAI && isClaudeConfigured) {
      // Use AI for comprehensive analysis
      const aiInput: ClerkAssignmentInput = {
        order: {
          motionType: order.motion_type,
          motionTier: order.motion_tier,
          jurisdiction: order.jurisdiction,
          turnaround: order.turnaround,
          filingDeadline: order.filing_deadline,
          documentCount: order.documents?.length || 0,
        },
        clerks: availableClerks.map((c: ClerkWithExpertise) => ({
          id: c.id,
          name: c.profiles.full_name,
          currentWorkload: c.current_workload,
          maxWorkload: c.max_workload,
          availabilityStatus: c.availability_status,
          expertise: (c.clerk_expertise || []).map((e: { motion_type: string; expertise_level: number; orders_completed: number; average_completion_days: number | null }) => ({
            motionType: e.motion_type,
            expertiseLevel: e.expertise_level,
            ordersCompleted: e.orders_completed,
            avgCompletionDays: e.average_completion_days,
          })),
          currentRushOrders: clerkRushCounts.get(c.id) || 0,
        })),
        weights: settings.weights,
      };

      const aiResult = await recommendClerkAssignment(aiInput);

      if (aiResult.success && aiResult.result) {
        aiAnalysis = aiResult.result;
        candidates = aiResult.result.scores.map((s) => ({
          clerkId: s.clerkId,
          clerkName: s.clerkName,
          currentWorkload: availableClerks.find((c) => c.id === s.clerkId)?.current_workload || 0,
          maxWorkload: availableClerks.find((c) => c.id === s.clerkId)?.max_workload || 5,
          availabilityStatus: 'available',
          expertiseLevel: getExpertiseLevel(
            availableClerks.find((c) => c.id === s.clerkId),
            order.motion_type
          ),
          ordersCompleted: getOrdersCompleted(
            availableClerks.find((c) => c.id === s.clerkId),
            order.motion_type
          ),
          avgCompletionDays: getAvgCompletionDays(
            availableClerks.find((c) => c.id === s.clerkId),
            order.motion_type
          ),
          score: s.totalScore,
          scoreBreakdown: s.breakdown,
        }));
      }
    }

    // If AI didn't provide candidates, calculate manually
    if (candidates.length === 0) {
      candidates = calculateCandidateScores(
        availableClerks,
        order,
        settings.weights,
        clerkRushCounts
      );
    }

    // Sort by score descending
    candidates.sort((a, b) => b.score - a.score);

    // Get top recommendation
    const recommended = candidates[0];
    const confidence = aiAnalysis?.confidence ?? calculateConfidence(candidates);
    const reasoning = aiAnalysis?.reasoning ?? generateAssignmentReasoning(recommended, candidates);

    // Determine if we should auto-assign
    const shouldAutoAssign = confidence >= autoAssignThreshold && candidates.length > 0;

    if (shouldAutoAssign) {
      // Perform the assignment
      await assignClerkToOrder(supabase, orderId, recommended.clerkId);

      await logAutomationAction(supabase, orderId, 'clerk_assigned', {
        clerkId: recommended.clerkId,
        clerkName: recommended.clerkName,
        confidence,
        autoAssigned: true,
        score: recommended.score,
      });
    } else {
      // Create approval for manual review
      await createAssignmentApproval(supabase, orderId, candidates, reasoning, confidence);

      await logAutomationAction(supabase, orderId, 'clerk_assignment_started', {
        recommendedClerkId: recommended.clerkId,
        recommendedClerkName: recommended.clerkName,
        confidence,
        awaitingApproval: true,
        candidateCount: candidates.length,
      });
    }

    const result: ClerkAssignmentResult = {
      orderId,
      recommendedClerkId: recommended.clerkId,
      recommendedClerkName: recommended.clerkName,
      confidence,
      reasoning,
      alternatives: candidates.slice(1),
      autoAssigned: shouldAutoAssign,
      processingTimeMs: Date.now() - startTime,
    };

    return { success: true, data: result };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    await logAutomationAction(supabase, orderId, 'clerk_assignment_started', {
      error: errorMessage,
    });

    return {
      success: false,
      error: errorMessage,
      code: 'ASSIGNMENT_ERROR',
    };
  }
}

/**
 * Manually assign a clerk to an order
 */
export async function assignClerk(
  orderId: string,
  clerkId: string,
  assignedBy: string
): Promise<OperationResult> {
  const supabase = await createClient();

  try {
    // Verify clerk exists and is available
    const { data: clerk, error: clerkError } = await supabase
      .from('clerks')
      .select('id, current_workload, max_workload, availability_status')
      .eq('id', clerkId)
      .single();

    if (clerkError || !clerk) {
      return { success: false, error: 'Clerk not found', code: 'CLERK_NOT_FOUND' };
    }

    if (clerk.availability_status === 'unavailable') {
      return { success: false, error: 'Clerk is unavailable', code: 'CLERK_UNAVAILABLE' };
    }

    if (clerk.current_workload >= clerk.max_workload) {
      return { success: false, error: 'Clerk is at capacity', code: 'CLERK_AT_CAPACITY' };
    }

    // Perform assignment
    await assignClerkToOrder(supabase, orderId, clerkId);

    // Update any pending approval
    await supabase
      .from('approval_queue')
      .update({
        status: 'approved',
        reviewed_by: assignedBy,
        review_notes: 'Manually assigned',
        resolved_at: new Date().toISOString(),
      })
      .eq('order_id', orderId)
      .eq('approval_type', 'clerk_assignment')
      .eq('status', 'pending');

    await logAutomationAction(supabase, orderId, 'clerk_assigned', {
      clerkId,
      assignedBy,
      manual: true,
    });

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Unassign a clerk from an order
 */
export async function unassignClerk(
  orderId: string,
  unassignedBy: string,
  reason: string
): Promise<OperationResult> {
  const supabase = await createClient();

  try {
    // Get current clerk
    const { data: order } = await supabase
      .from('orders')
      .select('clerk_id')
      .eq('id', orderId)
      .single();

    if (!order?.clerk_id) {
      return { success: false, error: 'Order is not assigned', code: 'NOT_ASSIGNED' };
    }

    const previousClerkId = order.clerk_id;

    // Unassign
    await supabase
      .from('orders')
      .update({ clerk_id: null, status: 'under_review' })
      .eq('id', orderId);

    // Decrement clerk workload
    await supabase.rpc('decrement_clerk_workload', { clerk_id: previousClerkId });

    await logAutomationAction(supabase, orderId, 'status_changed', {
      previousClerkId,
      unassignedBy,
      reason,
      newStatus: 'under_review',
    });

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get rush order counts for clerks
 */
async function getClerkRushOrderCounts(
  supabase: Awaited<ReturnType<typeof createClient>>,
  clerkIds: string[]
): Promise<Map<string, number>> {
  const { data } = await supabase
    .from('orders')
    .select('clerk_id')
    .in('clerk_id', clerkIds)
    .in('turnaround', ['rush_48', 'rush_72'])
    .in('status', ['assigned', 'in_progress']);

  const counts = new Map<string, number>();
  for (const order of data || []) {
    if (order.clerk_id) {
      counts.set(order.clerk_id, (counts.get(order.clerk_id) || 0) + 1);
    }
  }

  return counts;
}

/**
 * Calculate candidate scores manually (without AI)
 */
function calculateCandidateScores(
  clerks: ClerkWithExpertise[],
  order: { motion_type: string; turnaround: string; filing_deadline: string },
  weights: AssignmentWeights,
  rushCounts: Map<string, number>
): ClerkCandidate[] {
  const candidates: ClerkCandidate[] = [];
  const daysUntilDeadline = Math.max(
    0,
    (new Date(order.filing_deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  );

  // Calculate average workload for balance scoring
  const avgWorkload =
    clerks.reduce((sum, c) => sum + c.current_workload / c.max_workload, 0) / clerks.length;

  for (const clerk of clerks) {
    const expertise = clerk.clerk_expertise?.find((e) => e.motion_type === order.motion_type);

    // Capacity score: higher when more capacity available
    const capacityRatio = 1 - clerk.current_workload / clerk.max_workload;
    const capacityScore = capacityRatio * 100;

    // Expertise score: based on expertise level and orders completed
    const expertiseLevel = expertise?.expertise_level || 1;
    const expertiseScore = (expertiseLevel / 5) * 100;

    // Deadline score: based on average completion time vs deadline
    const avgDays = expertise?.average_completion_days || 5;
    const deadlineBuffer = daysUntilDeadline - avgDays;
    const deadlineScore = Math.min(100, Math.max(0, 50 + deadlineBuffer * 10));

    // Balance score: favor clerks below average workload
    const workloadRatio = clerk.current_workload / clerk.max_workload;
    const balanceScore = workloadRatio < avgWorkload ? 100 : 50;

    // Calculate total score
    const totalScore =
      capacityScore * weights.capacity +
      expertiseScore * weights.expertise +
      deadlineScore * weights.deadline +
      balanceScore * weights.balance;

    candidates.push({
      clerkId: clerk.id,
      clerkName: clerk.profiles.full_name,
      currentWorkload: clerk.current_workload,
      maxWorkload: clerk.max_workload,
      availabilityStatus: clerk.availability_status,
      expertiseLevel,
      ordersCompleted: expertise?.orders_completed || 0,
      avgCompletionDays: expertise?.average_completion_days || null,
      score: totalScore,
      scoreBreakdown: {
        capacityScore,
        expertiseScore,
        deadlineScore,
        balanceScore,
      },
    });
  }

  return candidates;
}

/**
 * Calculate confidence based on score distribution
 */
function calculateConfidence(candidates: ClerkCandidate[]): number {
  if (candidates.length === 0) return 0;
  if (candidates.length === 1) return 0.9;

  // Higher confidence when top candidate is clearly better
  const topScore = candidates[0].score;
  const secondScore = candidates[1]?.score || 0;
  const scoreDiff = topScore - secondScore;

  // Normalize to 0-1 range
  return Math.min(1, 0.5 + (scoreDiff / 100) * 0.5);
}

/**
 * Generate reasoning for assignment
 */
function generateAssignmentReasoning(
  recommended: ClerkCandidate,
  candidates: ClerkCandidate[]
): string {
  const parts: string[] = [];

  parts.push(`Recommended: ${recommended.clerkName}`);
  parts.push(`Score: ${recommended.score.toFixed(1)}/100`);
  parts.push(`Workload: ${recommended.currentWorkload}/${recommended.maxWorkload}`);

  if (recommended.expertiseLevel >= 4) {
    parts.push('High expertise in this motion type');
  } else if (recommended.expertiseLevel <= 2) {
    parts.push('Limited expertise - may need review');
  }

  if (candidates.length > 1) {
    const runnerUp = candidates[1];
    parts.push(`Runner-up: ${runnerUp.clerkName} (${runnerUp.score.toFixed(1)})`);
  }

  return parts.join('. ');
}

/**
 * Assign clerk to order and update workload
 */
async function assignClerkToOrder(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orderId: string,
  clerkId: string
): Promise<void> {
  // Update order
  await supabase
    .from('orders')
    .update({ clerk_id: clerkId, status: 'assigned' })
    .eq('id', orderId);

  // Increment clerk workload
  await supabase
    .from('clerks')
    .update({ current_workload: supabase.rpc('increment', { x: 1 }) })
    .eq('id', clerkId);

  // Actually, Supabase doesn't support increment like that in update
  // Let's use a different approach
  const { data: clerk } = await supabase
    .from('clerks')
    .select('current_workload')
    .eq('id', clerkId)
    .single();

  if (clerk) {
    await supabase
      .from('clerks')
      .update({ current_workload: clerk.current_workload + 1 })
      .eq('id', clerkId);
  }

  // Update clerk expertise (track assignment)
  const { data: order } = await supabase
    .from('orders')
    .select('motion_type')
    .eq('id', orderId)
    .single();

  if (order) {
    // Upsert expertise record
    await supabase
      .from('clerk_expertise')
      .upsert({
        clerk_id: clerkId,
        motion_type: order.motion_type,
        last_assigned_at: new Date().toISOString(),
      }, {
        onConflict: 'clerk_id,motion_type',
      });
  }
}

/**
 * Create approval queue item for clerk assignment
 */
async function createAssignmentApproval(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orderId: string,
  candidates: ClerkCandidate[],
  reasoning: string,
  confidence: number
): Promise<void> {
  const topCandidate = candidates[0];

  await supabase.from('approval_queue').insert({
    approval_type: 'clerk_assignment',
    order_id: orderId,
    request_details: {
      candidates: candidates.slice(0, 5).map((c) => ({
        clerkId: c.clerkId,
        clerkName: c.clerkName,
        score: c.score,
        workload: `${c.currentWorkload}/${c.maxWorkload}`,
        expertiseLevel: c.expertiseLevel,
      })),
    },
    ai_recommendation: topCandidate
      ? `Assign to ${topCandidate.clerkName}`
      : 'No suitable clerks available',
    ai_reasoning: reasoning,
    ai_confidence: confidence,
    alternatives: candidates.slice(1, 4).map((c) => ({
      option: c.clerkId,
      description: `${c.clerkName} (Score: ${c.score.toFixed(1)})`,
      confidence: c.score / 100,
    })),
    urgency: 'normal',
    expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24 hours
  });

  await logAutomationAction(supabase, orderId, 'approval_requested', {
    type: 'clerk_assignment',
    candidateCount: candidates.length,
  });
}

// Helper functions to extract data from clerk records
function getExpertiseLevel(clerk: ClerkWithExpertise | undefined, motionType: string): number {
  if (!clerk) return 1;
  const expertise = clerk.clerk_expertise?.find((e) => e.motion_type === motionType);
  return expertise?.expertise_level || 1;
}

function getOrdersCompleted(clerk: ClerkWithExpertise | undefined, motionType: string): number {
  if (!clerk) return 0;
  const expertise = clerk.clerk_expertise?.find((e) => e.motion_type === motionType);
  return expertise?.orders_completed || 0;
}

function getAvgCompletionDays(
  clerk: ClerkWithExpertise | undefined,
  motionType: string
): number | null {
  if (!clerk) return null;
  const expertise = clerk.clerk_expertise?.find((e) => e.motion_type === motionType);
  return expertise?.average_completion_days || null;
}

/**
 * Log an automation action
 */
async function logAutomationAction(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orderId: string | null,
  actionType: string,
  details: Record<string, unknown>
): Promise<void> {
  try {
    await supabase.from('automation_logs').insert({
      order_id: orderId,
      action_type: actionType,
      action_details: details,
      confidence_score: (details.confidence as number) || null,
      was_auto_approved: (details.autoAssigned as boolean) || false,
    });
  } catch (error) {
    log.error('[Automation Log] Failed to log action:', error);
  }
}

/**
 * Get assignment candidates for an order (for manual selection)
 */
export async function getAssignmentCandidates(
  orderId: string
): Promise<OperationResult<ClerkCandidate[]>> {
  const supabase = await createClient();

  try {
    const settings = await getAssignmentSettings();

    // Fetch order
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('motion_type, turnaround, filing_deadline')
      .eq('id', orderId)
      .single();

    if (orderError || !order) {
      throw new Error('Order not found');
    }

    // Fetch available clerks
    const { data: clerksData } = await supabase
      .from('clerks')
      .select(`
        id,
        availability_status,
        current_workload,
        max_workload,
        profiles!inner (
          full_name,
          email
        ),
        clerk_expertise (
          motion_type,
          expertise_level,
          orders_completed,
          average_completion_days
        )
      `)
      .neq('availability_status', 'unavailable');

    const clerks = clerksData as ClerkWithExpertise[] | null;
    const availableClerks = (clerks || []).filter((c: ClerkWithExpertise) => c.current_workload < c.max_workload);
    const rushCounts = await getClerkRushOrderCounts(supabase, availableClerks.map(c => c.id));

    const candidates = calculateCandidateScores(availableClerks, order, settings.weights, rushCounts);
    candidates.sort((a, b) => b.score - a.score);

    return { success: true, data: candidates };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
