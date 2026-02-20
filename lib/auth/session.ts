// /lib/auth/session.ts
// Session management per SECURITY_IMPLEMENTATION_CHECKLIST_v1 Section 2.3
// VERSION: 1.0 — January 28, 2026

import { getServiceSupabase } from '@/lib/supabase/admin';

import { createLogger } from '@/lib/security/logger';

const log = createLogger('auth-session');
/**
 * Session configuration:
 * - Inactivity timeout: 4 hours
 * - Absolute timeout: 24 hours
 * - Invalidate all sessions on password change
 * - "Log out all devices" option
 */

export const SESSION_CONFIG = {
  INACTIVITY_TIMEOUT_HOURS: 4,
  ABSOLUTE_TIMEOUT_HOURS: 24,
} as const;

export interface SessionInfo {
  id: string;
  userId: string;
  createdAt: Date;
  lastActivityAt: Date;
  expiresAt: Date;
  ipAddress: string;
  userAgent: string;
  isCurrent: boolean;
}

/**
 * Check if session is still valid
 */
export function isSessionValid(session: SessionInfo): { valid: boolean; reason?: string } {
  const now = new Date();

  // Check absolute timeout
  const absoluteExpiry = new Date(session.createdAt);
  absoluteExpiry.setHours(absoluteExpiry.getHours() + SESSION_CONFIG.ABSOLUTE_TIMEOUT_HOURS);

  if (now > absoluteExpiry) {
    return { valid: false, reason: 'Session expired (24 hour limit)' };
  }

  // Check inactivity timeout
  const inactivityExpiry = new Date(session.lastActivityAt);
  inactivityExpiry.setHours(inactivityExpiry.getHours() + SESSION_CONFIG.INACTIVITY_TIMEOUT_HOURS);

  if (now > inactivityExpiry) {
    return { valid: false, reason: 'Session expired due to inactivity' };
  }

  return { valid: true };
}

/**
 * Update session activity timestamp
 */
export async function updateSessionActivity(sessionId: string): Promise<void> {
  const supabase = getServiceSupabase();

  await supabase
    .from('user_sessions')
    .update({ last_activity_at: new Date().toISOString() })
    .eq('id', sessionId);
}

/**
 * Get all active sessions for a user
 */
export async function getUserSessions(userId: string, currentSessionId?: string): Promise<SessionInfo[]> {
  const supabase = getServiceSupabase();

  const { data: sessions, error } = await supabase
    .from('user_sessions')
    .select('*')
    .eq('user_id', userId)
    .eq('is_active', true)
    .order('last_activity_at', { ascending: false });

  if (error || !sessions) {
    log.error('[Session] Error fetching sessions:', error);
    return [];
  }

  return sessions.map((s: {
    id: string;
    user_id: string;
    created_at: string;
    last_activity_at: string;
    expires_at: string;
    ip_address: string | null;
    user_agent: string | null;
  }) => ({
    id: s.id,
    userId: s.user_id,
    createdAt: new Date(s.created_at),
    lastActivityAt: new Date(s.last_activity_at),
    expiresAt: new Date(s.expires_at),
    ipAddress: s.ip_address,
    userAgent: s.user_agent,
    isCurrent: s.id === currentSessionId,
  }));
}

/**
 * Invalidate a specific session
 */
export async function invalidateSession(sessionId: string): Promise<void> {
  const supabase = getServiceSupabase();

  await supabase
    .from('user_sessions')
    .update({
      is_active: false,
      invalidated_at: new Date().toISOString(),
      invalidation_reason: 'user_logout',
    })
    .eq('id', sessionId);

  log.info(`[Session] Invalidated session: ${sessionId}`);
}

/**
 * Invalidate all sessions for a user (except current)
 */
export async function invalidateAllSessions(userId: string, exceptSessionId?: string): Promise<number> {
  const supabase = getServiceSupabase();

  let query = supabase
    .from('user_sessions')
    .update({
      is_active: false,
      invalidated_at: new Date().toISOString(),
      invalidation_reason: 'logout_all_devices',
    })
    .eq('user_id', userId)
    .eq('is_active', true);

  if (exceptSessionId) {
    query = query.neq('id', exceptSessionId);
  }

  const { data, error } = await query.select();

  if (error) {
    log.error('[Session] Error invalidating sessions:', error);
    return 0;
  }

  const count = data?.length || 0;
  log.info(`[Session] Invalidated ${count} sessions for user: ${userId}`);

  // Log security event
  await supabase.from('security_events').insert({
    event_type: 'LOGOUT_ALL_DEVICES',
    user_id: userId,
    details: { sessions_invalidated: count, kept_current: !!exceptSessionId },
    created_at: new Date().toISOString(),
  });

  return count;
}

/**
 * Invalidate all sessions on password change
 */
export async function onPasswordChange(userId: string, currentSessionId?: string): Promise<void> {
  const supabase = getServiceSupabase();

  // Invalidate all sessions except current
  const count = await invalidateAllSessions(userId, currentSessionId);

  // Log security event
  await supabase.from('security_events').insert({
    event_type: 'PASSWORD_CHANGED',
    user_id: userId,
    details: { sessions_invalidated: count },
    created_at: new Date().toISOString(),
  });

  log.info(`[Session] Password changed for user ${userId}, invalidated ${count} sessions`);
}

/**
 * Create a new session
 */
export async function createSession(
  userId: string,
  ipAddress: string,
  userAgent: string
): Promise<string> {
  const supabase = getServiceSupabase();

  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + SESSION_CONFIG.ABSOLUTE_TIMEOUT_HOURS);

  const { data, error } = await supabase
    .from('user_sessions')
    .insert({
      user_id: userId,
      ip_address: ipAddress,
      user_agent: userAgent,
      is_active: true,
      last_activity_at: new Date().toISOString(),
      expires_at: expiresAt.toISOString(),
      created_at: new Date().toISOString(),
    })
    .select('id')
    .single();

  if (error || !data) {
    throw new Error(`Failed to create session: ${error?.message}`);
  }

  log.info(`[Session] Created session ${data.id} for user ${userId}`);
  return data.id;
}
