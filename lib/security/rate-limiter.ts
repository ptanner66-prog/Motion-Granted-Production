/**
 * Production Rate Limiter
 *
 * In-memory rate limiter with IP extraction using Vercel's trusted header.
 *
 * SECURITY FIX: Uses x-vercel-forwarded-for (set by Vercel edge, cannot be spoofed)
 * instead of x-forwarded-for (can be spoofed by the client).
 */

import { NextRequest } from 'next/server';

interface RateLimitEntry {
  count: number;
  windowStart: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();

export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  keyPrefix?: string;
}

const DEFAULT_CONFIGS: Record<string, RateLimitConfig> = {
  api: { windowMs: 60_000, maxRequests: 60, keyPrefix: 'api' },
  auth: { windowMs: 300_000, maxRequests: 10, keyPrefix: 'auth' },
  webhook: { windowMs: 60_000, maxRequests: 100, keyPrefix: 'webhook' },
  admin: { windowMs: 60_000, maxRequests: 30, keyPrefix: 'admin' },
};

/**
 * Get real client IP using Vercel's trusted header.
 * Priority: x-vercel-forwarded-for > x-real-ip > 'unknown'
 * DO NOT use x-forwarded-for — can be spoofed.
 */
export function getClientIP(request: NextRequest): string {
  const vercelIp = request.headers.get('x-vercel-forwarded-for');
  if (vercelIp) {
    return vercelIp.split(',')[0].trim();
  }

  const realIp = request.headers.get('x-real-ip');
  if (realIp) {
    return realIp.trim();
  }

  return 'unknown';
}

export function checkRateLimit(
  request: NextRequest,
  configName: string = 'api'
): { allowed: boolean; remaining: number; resetAt: number } {
  const config = DEFAULT_CONFIGS[configName] || DEFAULT_CONFIGS.api;
  const ip = getClientIP(request);
  const key = `${config.keyPrefix}:${ip}`;
  const now = Date.now();

  const entry = rateLimitStore.get(key);

  if (!entry || now - entry.windowStart > config.windowMs) {
    rateLimitStore.set(key, { count: 1, windowStart: now });
    return {
      allowed: true,
      remaining: config.maxRequests - 1,
      resetAt: now + config.windowMs,
    };
  }

  entry.count++;

  if (entry.count > config.maxRequests) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: entry.windowStart + config.windowMs,
    };
  }

  return {
    allowed: true,
    remaining: config.maxRequests - entry.count,
    resetAt: entry.windowStart + config.windowMs,
  };
}

export function cleanupRateLimits(): void {
  const now = Date.now();
  const maxWindow = Math.max(...Object.values(DEFAULT_CONFIGS).map(c => c.windowMs));

  for (const [key, entry] of rateLimitStore.entries()) {
    if (now - entry.windowStart > maxWindow * 2) {
      rateLimitStore.delete(key);
    }
  }
}
