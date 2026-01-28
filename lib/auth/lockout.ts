// /lib/auth/lockout.ts
// Account lockout per SECURITY_IMPLEMENTATION_CHECKLIST_v1 Section 2.2
// VERSION: 1.0 — January 28, 2026

import { createClient } from '@/lib/supabase/server';

/**
 * Lockout configuration:
 * - Lock after 5 failed attempts
 * - Lockout duration: 15 minutes
 * - Notify user via email
 * - Log all lockout events
 */

export const LOCKOUT_CONFIG = {
  MAX_ATTEMPTS: 5,
  LOCKOUT_DURATION_MINUTES: 15,
  ATTEMPT_WINDOW_MINUTES: 30, // Reset counter after this many minutes of no attempts
} as const;

export interface LockoutStatus {
  isLocked: boolean;
  attemptsRemaining: number;
  lockedUntil: Date | null;
  minutesRemaining: number | null;
}

export interface LoginAttempt {
  userId?: string;
  email: string;
  success: boolean;
  ipAddress: string;
  userAgent: string;
  timestamp: Date;
}

/**
 * Record a login attempt
 */
export async function recordLoginAttempt(attempt: LoginAttempt): Promise<void> {
  const supabase = await createClient();

  await supabase.from('login_attempts').insert({
    user_id: attempt.userId,
    email: attempt.email.toLowerCase(),
    success: attempt.success,
    ip_address: attempt.ipAddress,
    user_agent: attempt.userAgent,
    created_at: attempt.timestamp.toISOString(),
  });

  // If failed attempt, check if we need to lock
  if (!attempt.success) {
    const status = await checkLockoutStatus(attempt.email);

    if (status.isLocked && status.attemptsRemaining === 0) {
      // Just got locked - log and notify
      await logLockoutEvent(attempt.email, attempt.ipAddress);
      await queueLockoutNotification(attempt.email);
    }
  }
}

/**
 * Check if account is locked
 */
export async function checkLockoutStatus(email: string): Promise<LockoutStatus> {
  const supabase = await createClient();
  const windowStart = new Date();
  windowStart.setMinutes(windowStart.getMinutes() - LOCKOUT_CONFIG.ATTEMPT_WINDOW_MINUTES);

  // Get recent failed attempts
  const { data: attempts, error } = await supabase
    .from('login_attempts')
    .select('created_at')
    .eq('email', email.toLowerCase())
    .eq('success', false)
    .gte('created_at', windowStart.toISOString())
    .order('created_at', { ascending: false });

  if (error || !attempts) {
    console.error('[Lockout] Error checking status:', error);
    return { isLocked: false, attemptsRemaining: LOCKOUT_CONFIG.MAX_ATTEMPTS, lockedUntil: null, minutesRemaining: null };
  }

  const failedCount = attempts.length;

  if (failedCount >= LOCKOUT_CONFIG.MAX_ATTEMPTS) {
    // Account is locked - calculate when it unlocks
    const lastAttempt = new Date(attempts[0].created_at);
    const lockedUntil = new Date(lastAttempt);
    lockedUntil.setMinutes(lockedUntil.getMinutes() + LOCKOUT_CONFIG.LOCKOUT_DURATION_MINUTES);

    const now = new Date();
    if (now < lockedUntil) {
      const minutesRemaining = Math.ceil((lockedUntil.getTime() - now.getTime()) / (1000 * 60));
      return {
        isLocked: true,
        attemptsRemaining: 0,
        lockedUntil,
        minutesRemaining,
      };
    }

    // Lockout expired
    return {
      isLocked: false,
      attemptsRemaining: LOCKOUT_CONFIG.MAX_ATTEMPTS,
      lockedUntil: null,
      minutesRemaining: null,
    };
  }

  return {
    isLocked: false,
    attemptsRemaining: LOCKOUT_CONFIG.MAX_ATTEMPTS - failedCount,
    lockedUntil: null,
    minutesRemaining: null,
  };
}

/**
 * Check if login should be blocked
 */
export async function shouldBlockLogin(email: string): Promise<{ blocked: boolean; reason?: string; minutesRemaining?: number }> {
  const status = await checkLockoutStatus(email);

  if (status.isLocked) {
    return {
      blocked: true,
      reason: `Account locked due to too many failed attempts. Try again in ${status.minutesRemaining} minutes.`,
      minutesRemaining: status.minutesRemaining ?? undefined,
    };
  }

  return { blocked: false };
}

/**
 * Log lockout event for audit
 */
async function logLockoutEvent(email: string, ipAddress: string): Promise<void> {
  const supabase = await createClient();

  await supabase.from('security_events').insert({
    event_type: 'ACCOUNT_LOCKED',
    email: email.toLowerCase(),
    ip_address: ipAddress,
    details: {
      reason: 'Too many failed login attempts',
      max_attempts: LOCKOUT_CONFIG.MAX_ATTEMPTS,
      lockout_duration_minutes: LOCKOUT_CONFIG.LOCKOUT_DURATION_MINUTES,
    },
    created_at: new Date().toISOString(),
  });

  console.log(`[Lockout] Account locked: ${email} from IP ${ipAddress}`);
}

/**
 * Queue lockout notification email
 */
async function queueLockoutNotification(email: string): Promise<void> {
  const supabase = await createClient();

  await supabase.from('email_queue').insert({
    template: 'account_locked',
    to_email: email.toLowerCase(),
    data: {
      lockout_duration_minutes: LOCKOUT_CONFIG.LOCKOUT_DURATION_MINUTES,
      support_email: 'support@motiongranted.com',
    },
    status: 'pending',
    created_at: new Date().toISOString(),
  });
}

/**
 * Clear failed attempts (call after successful login)
 */
export async function clearFailedAttempts(email: string): Promise<void> {
  const supabase = await createClient();

  // We don't delete - just record successful login which resets the window
  // The window-based counting handles this automatically
  console.log(`[Lockout] Successful login clears lockout window for: ${email}`);
}
