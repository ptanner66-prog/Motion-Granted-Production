/**
 * Customer Feedback Collection (Task 74)
 *
 * Feedback collection system for completed orders.
 *
 * Features:
 * - Star ratings (1-5)
 * - Would recommend (NPS-style)
 * - Issue categorization
 * - Free-text feedback
 * - Email trigger 24 hours after delivery
 *
 * Source: Chunk 10, Task 74 - P2 Pre-Launch
 */

import { createClient } from '@/lib/supabase/client';
import { createClient as createAdminClient } from '@supabase/supabase-js';

import { createLogger } from '@/lib/security/logger';

const log = createLogger('feedback-feedback-service');
// ============================================================================
// TYPES
// ============================================================================

export interface CustomerFeedback {
  id: string;
  orderId: string;
  userId: string;
  rating: 1 | 2 | 3 | 4 | 5;
  wouldRecommend: boolean;
  feedbackText?: string;
  issues: FeedbackIssue[];
  createdAt: Date;
}

export type FeedbackIssue = 'quality' | 'timing' | 'communication' | 'price' | 'other';

export interface FeedbackInput {
  orderId: string;
  rating: 1 | 2 | 3 | 4 | 5;
  wouldRecommend: boolean;
  feedbackText?: string;
  issues?: FeedbackIssue[];
}

export interface FeedbackStats {
  totalResponses: number;
  averageRating: number;
  wouldRecommendPercentage: number;
  ratingDistribution: Record<number, number>;
  issueBreakdown: Record<FeedbackIssue, number>;
  timeRange: { start: Date; end: Date };
}

export interface FeedbackRequest {
  id: string;
  orderId: string;
  userId: string;
  scheduledFor: Date;
  sentAt?: Date;
  status: 'pending' | 'sent' | 'completed' | 'cancelled';
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function getAdminSupabase() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return null;
  }

  return createAdminClient(supabaseUrl, supabaseKey);
}

// ============================================================================
// FEEDBACK SUBMISSION
// ============================================================================

/**
 * Submit customer feedback for an order
 */
export async function submitFeedback(
  feedback: FeedbackInput
): Promise<CustomerFeedback | null> {
  const supabase = createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    log.error('[Feedback] No authenticated user');
    return null;
  }

  // Verify user owns the order
  const { data: order } = await supabase
    .from('orders')
    .select('id, client_id')
    .eq('id', feedback.orderId)
    .single();

  if (!order || order.client_id !== user.id) {
    log.error('[Feedback] User does not own order');
    return null;
  }

  // Check if feedback already exists
  const { data: existing } = await supabase
    .from('customer_feedback')
    .select('id')
    .eq('order_id', feedback.orderId)
    .single();

  if (existing) {
    log.error('[Feedback] Feedback already submitted for this order');
    return null;
  }

  // Insert feedback
  const { data, error } = await supabase
    .from('customer_feedback')
    .insert({
      order_id: feedback.orderId,
      user_id: user.id,
      rating: feedback.rating,
      would_recommend: feedback.wouldRecommend,
      feedback_text: feedback.feedbackText || null,
      issues: feedback.issues || [],
    })
    .select()
    .single();

  if (error || !data) {
    log.error('[Feedback] Submit error:', error);
    return null;
  }

  // Update feedback request status if exists
  await supabase
    .from('feedback_requests')
    .update({ status: 'completed' })
    .eq('order_id', feedback.orderId);

  return {
    id: data.id,
    orderId: data.order_id,
    userId: data.user_id,
    rating: data.rating as 1 | 2 | 3 | 4 | 5,
    wouldRecommend: data.would_recommend,
    feedbackText: data.feedback_text || undefined,
    issues: data.issues as FeedbackIssue[],
    createdAt: new Date(data.created_at),
  };
}

/**
 * Get feedback for a specific order
 */
export async function getFeedbackForOrder(
  orderId: string
): Promise<CustomerFeedback | null> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from('customer_feedback')
    .select('*')
    .eq('order_id', orderId)
    .single();

  if (error || !data) {
    return null;
  }

  return {
    id: data.id,
    orderId: data.order_id,
    userId: data.user_id,
    rating: data.rating as 1 | 2 | 3 | 4 | 5,
    wouldRecommend: data.would_recommend,
    feedbackText: data.feedback_text || undefined,
    issues: data.issues as FeedbackIssue[],
    createdAt: new Date(data.created_at),
  };
}

// ============================================================================
// FEEDBACK STATISTICS
// ============================================================================

/**
 * Get aggregated feedback statistics
 */
export async function getFeedbackStats(
  timeRange?: { start: Date; end: Date }
): Promise<FeedbackStats> {
  const supabase = getAdminSupabase();

  if (!supabase) {
    return getEmptyStats(timeRange);
  }

  let query = supabase.from('customer_feedback').select('*');

  if (timeRange) {
    query = query
      .gte('created_at', timeRange.start.toISOString())
      .lte('created_at', timeRange.end.toISOString());
  }

  const { data, error } = await query;

  if (error || !data || data.length === 0) {
    return getEmptyStats(timeRange);
  }

  // Calculate statistics
  const totalResponses = data.length;
  const averageRating = data.reduce((sum, f) => sum + f.rating, 0) / totalResponses;
  const wouldRecommendCount = data.filter((f) => f.would_recommend).length;
  const wouldRecommendPercentage = (wouldRecommendCount / totalResponses) * 100;

  // Rating distribution
  const ratingDistribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  data.forEach((f) => {
    ratingDistribution[f.rating] = (ratingDistribution[f.rating] || 0) + 1;
  });

  // Issue breakdown
  const issueBreakdown: Record<FeedbackIssue, number> = {
    quality: 0,
    timing: 0,
    communication: 0,
    price: 0,
    other: 0,
  };
  data.forEach((f) => {
    (f.issues as FeedbackIssue[]).forEach((issue) => {
      issueBreakdown[issue] = (issueBreakdown[issue] || 0) + 1;
    });
  });

  // Determine time range from data
  const dates = data.map((f) => new Date(f.created_at).getTime());
  const actualTimeRange = timeRange || {
    start: new Date(Math.min(...dates)),
    end: new Date(Math.max(...dates)),
  };

  return {
    totalResponses,
    averageRating: Math.round(averageRating * 100) / 100,
    wouldRecommendPercentage: Math.round(wouldRecommendPercentage * 100) / 100,
    ratingDistribution,
    issueBreakdown,
    timeRange: actualTimeRange,
  };
}

function getEmptyStats(timeRange?: { start: Date; end: Date }): FeedbackStats {
  const now = new Date();
  return {
    totalResponses: 0,
    averageRating: 0,
    wouldRecommendPercentage: 0,
    ratingDistribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
    issueBreakdown: {
      quality: 0,
      timing: 0,
      communication: 0,
      price: 0,
      other: 0,
    },
    timeRange: timeRange || { start: now, end: now },
  };
}

// ============================================================================
// FEEDBACK REQUEST SCHEDULING
// ============================================================================

/**
 * Schedule a feedback request email 24 hours after delivery
 */
export async function scheduleFeedbackRequest(
  orderId: string
): Promise<FeedbackRequest | null> {
  const supabase = getAdminSupabase();

  if (!supabase) {
    log.error('[Feedback] No admin client available');
    return null;
  }

  // Get order details
  const { data: order } = await supabase
    .from('orders')
    .select('id, client_id, status')
    .eq('id', orderId)
    .single();

  if (!order) {
    log.error('[Feedback] Order not found');
    return null;
  }

  // Only schedule for completed/delivered orders
  if (order.status !== 'completed' && order.status !== 'delivered') {
    log.error('[Feedback] Order not in completed/delivered status');
    return null;
  }

  // Check if feedback already exists
  const { data: existingFeedback } = await supabase
    .from('customer_feedback')
    .select('id')
    .eq('order_id', orderId)
    .single();

  if (existingFeedback) {
    log.info('[Feedback] Feedback already submitted, skipping request');
    return null;
  }

  // Check if request already scheduled
  const { data: existingRequest } = await supabase
    .from('feedback_requests')
    .select('*')
    .eq('order_id', orderId)
    .in('status', ['pending', 'sent'])
    .single();

  if (existingRequest) {
    return {
      id: existingRequest.id,
      orderId: existingRequest.order_id,
      userId: existingRequest.user_id,
      scheduledFor: new Date(existingRequest.scheduled_for),
      sentAt: existingRequest.sent_at ? new Date(existingRequest.sent_at) : undefined,
      status: existingRequest.status,
    };
  }

  // Schedule for 24 hours from now
  const scheduledFor = new Date();
  scheduledFor.setHours(scheduledFor.getHours() + 24);

  const { data, error } = await supabase
    .from('feedback_requests')
    .insert({
      order_id: orderId,
      user_id: order.client_id,
      scheduled_for: scheduledFor.toISOString(),
      status: 'pending',
    })
    .select()
    .single();

  if (error || !data) {
    log.error('[Feedback] Schedule error:', error);
    return null;
  }

  log.info(`[Feedback] Scheduled feedback request for order ${orderId} at ${scheduledFor}`);

  return {
    id: data.id,
    orderId: data.order_id,
    userId: data.user_id,
    scheduledFor: new Date(data.scheduled_for),
    status: data.status,
  };
}

/**
 * Get pending feedback requests (for cron job processing)
 */
export async function getPendingFeedbackRequests(): Promise<FeedbackRequest[]> {
  const supabase = getAdminSupabase();

  if (!supabase) {
    return [];
  }

  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from('feedback_requests')
    .select('*')
    .eq('status', 'pending')
    .lte('scheduled_for', now)
    .order('scheduled_for', { ascending: true })
    .limit(100);

  if (error || !data) {
    return [];
  }

  return data.map((row) => ({
    id: row.id,
    orderId: row.order_id,
    userId: row.user_id,
    scheduledFor: new Date(row.scheduled_for),
    sentAt: row.sent_at ? new Date(row.sent_at) : undefined,
    status: row.status,
  }));
}

/**
 * Mark feedback request as sent
 */
export async function markFeedbackRequestSent(
  requestId: string
): Promise<boolean> {
  const supabase = getAdminSupabase();

  if (!supabase) {
    return false;
  }

  const { error } = await supabase
    .from('feedback_requests')
    .update({
      status: 'sent',
      sent_at: new Date().toISOString(),
    })
    .eq('id', requestId);

  return !error;
}

/**
 * Cancel a pending feedback request
 */
export async function cancelFeedbackRequest(
  orderId: string
): Promise<boolean> {
  const supabase = getAdminSupabase();

  if (!supabase) {
    return false;
  }

  const { error } = await supabase
    .from('feedback_requests')
    .update({ status: 'cancelled' })
    .eq('order_id', orderId)
    .eq('status', 'pending');

  return !error;
}

// ============================================================================
// FEEDBACK ANALYTICS
// ============================================================================

/**
 * Get recent feedback with optional filters
 */
export async function getRecentFeedback(
  options: {
    limit?: number;
    minRating?: number;
    maxRating?: number;
    hasIssues?: boolean;
  } = {}
): Promise<CustomerFeedback[]> {
  const supabase = getAdminSupabase();

  if (!supabase) {
    return [];
  }

  let query = supabase
    .from('customer_feedback')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(options.limit || 50);

  if (options.minRating) {
    query = query.gte('rating', options.minRating);
  }

  if (options.maxRating) {
    query = query.lte('rating', options.maxRating);
  }

  const { data, error } = await query;

  if (error || !data) {
    return [];
  }

  let results = data.map((row) => ({
    id: row.id,
    orderId: row.order_id,
    userId: row.user_id,
    rating: row.rating as 1 | 2 | 3 | 4 | 5,
    wouldRecommend: row.would_recommend,
    feedbackText: row.feedback_text || undefined,
    issues: row.issues as FeedbackIssue[],
    createdAt: new Date(row.created_at),
  }));

  // Filter by issues if requested
  if (options.hasIssues !== undefined) {
    results = results.filter((f) =>
      options.hasIssues ? f.issues.length > 0 : f.issues.length === 0
    );
  }

  return results;
}

/**
 * Calculate Net Promoter Score (NPS)
 * - Promoters: rating 5 and would recommend
 * - Detractors: rating 1-2 or would not recommend
 * - NPS = % Promoters - % Detractors
 */
export async function calculateNPS(
  timeRange?: { start: Date; end: Date }
): Promise<{
  score: number;
  promoters: number;
  passives: number;
  detractors: number;
  totalResponses: number;
}> {
  const supabase = getAdminSupabase();

  if (!supabase) {
    return { score: 0, promoters: 0, passives: 0, detractors: 0, totalResponses: 0 };
  }

  let query = supabase.from('customer_feedback').select('rating, would_recommend');

  if (timeRange) {
    query = query
      .gte('created_at', timeRange.start.toISOString())
      .lte('created_at', timeRange.end.toISOString());
  }

  const { data, error } = await query;

  if (error || !data || data.length === 0) {
    return { score: 0, promoters: 0, passives: 0, detractors: 0, totalResponses: 0 };
  }

  const totalResponses = data.length;
  let promoters = 0;
  let detractors = 0;
  let passives = 0;

  data.forEach((f) => {
    if (f.rating >= 5 && f.would_recommend) {
      promoters++;
    } else if (f.rating <= 2 || !f.would_recommend) {
      detractors++;
    } else {
      passives++;
    }
  });

  const score = Math.round(((promoters - detractors) / totalResponses) * 100);

  return { score, promoters, passives, detractors, totalResponses };
}
