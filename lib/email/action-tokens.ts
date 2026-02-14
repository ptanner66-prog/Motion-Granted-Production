// /lib/email/action-tokens.ts
// Secure action tokens for email links (resume HOLD, approve conflict, etc.)
// Per Task 78 — PORTER_TASK_LIST_ADDENDUM_SIGNED_URLS_01282026.md
// VERSION: 1.0 — January 28, 2026

import { createClient } from '@/lib/supabase/server';
import crypto from 'crypto';

import { createLogger } from '@/lib/security/logger';

const log = createLogger('email-action-tokens');
export type ActionType =
  | 'resume_hold'
  | 'approve_conflict'
  | 'reject_conflict'
  | 'download'
  | 'extend_retention'
  | 'confirm_deletion';

export interface ActionToken {
  token: string;
  action: ActionType;
  orderId: string;
  userId: string;
  expiresAt: Date;
  metadata?: Record<string, unknown>;
}

export type ActionTokenResult = {
  valid: true;
  data: ActionToken;
} | {
  valid: false;
  error: string;
};

/**
 * Generate a secure action token for email links
 */
export async function generateActionToken(
  action: ActionType,
  orderId: string,
  userId: string,
  expiresInHours: number = 72,
  metadata?: Record<string, unknown>
): Promise<string> {
  const supabase = await createClient();

  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1000);

  const { error } = await supabase.from('email_action_tokens').insert({
    token,
    action,
    order_id: orderId,
    user_id: userId,
    expires_at: expiresAt.toISOString(),
    metadata: metadata || {},
    used: false,
    created_at: new Date().toISOString(),
  });

  if (error) {
    log.error('[ActionToken] Error creating token:', error);
    throw new Error('Failed to create action token');
  }

  log.info(`[ActionToken] Created ${action} token for order ${orderId}`);

  return token;
}

/**
 * Validate and consume an action token
 */
export async function validateActionToken(token: string): Promise<ActionTokenResult> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('email_action_tokens')
    .select('*')
    .eq('token', token)
    .single();

  if (error || !data) {
    log.warn('[ActionToken] Invalid token attempted');
    return { valid: false, error: 'Invalid token' };
  }

  if (data.used) {
    log.warn('[ActionToken] Token already used:', token.substring(0, 8));
    return { valid: false, error: 'This link has already been used' };
  }

  if (new Date(data.expires_at) < new Date()) {
    log.warn('[ActionToken] Token expired:', token.substring(0, 8));
    return { valid: false, error: 'This link has expired' };
  }

  // Mark token as used
  await supabase
    .from('email_action_tokens')
    .update({
      used: true,
      used_at: new Date().toISOString()
    })
    .eq('token', token);

  log.info(`[ActionToken] Token consumed: ${data.action} for order ${data.order_id}`);

  return {
    valid: true,
    data: {
      token: data.token,
      action: data.action as ActionType,
      orderId: data.order_id,
      userId: data.user_id,
      expiresAt: new Date(data.expires_at),
      metadata: data.metadata,
    },
  };
}

/**
 * Build action URL for email
 */
export function buildActionUrl(token: string): string {
  const baseUrl = process.env.NEXT_PUBLIC_URL || 'https://motiongranted.com';
  return `${baseUrl}/api/email-actions/${token}`;
}

/**
 * Generate action URL directly (combines token creation + URL building)
 */
export async function generateActionUrl(
  action: ActionType,
  orderId: string,
  userId: string,
  expiresInHours: number = 72
): Promise<string> {
  const token = await generateActionToken(action, orderId, userId, expiresInHours);
  return buildActionUrl(token);
}

/**
 * Revoke all unused tokens for an order (e.g., when HOLD is resolved manually)
 */
export async function revokeOrderTokens(orderId: string): Promise<number> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('email_action_tokens')
    .update({
      used: true,
      used_at: new Date().toISOString(),
      revoked: true,
    })
    .eq('order_id', orderId)
    .eq('used', false)
    .select();

  if (error) {
    log.error('[ActionToken] Error revoking tokens:', error);
    return 0;
  }

  const count = data?.length || 0;
  log.info(`[ActionToken] Revoked ${count} tokens for order ${orderId}`);

  return count;
}
