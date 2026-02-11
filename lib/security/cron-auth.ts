/**
 * CRON Endpoint Authentication
 *
 * Timing-safe secret comparison for CRON job endpoints.
 * Expects: Authorization: Bearer <CRON_SECRET>
 */

import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';

export function validateCronAuth(request: NextRequest): { valid: boolean; error?: string } {
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    console.error('[cron-auth] CRON_SECRET not configured');
    return { valid: false, error: 'CRON_SECRET not configured' };
  }

  const authHeader = request.headers.get('authorization');
  if (!authHeader) {
    return { valid: false, error: 'Missing Authorization header' };
  }

  const [scheme, token] = authHeader.split(' ');
  if (scheme !== 'Bearer' || !token) {
    return { valid: false, error: 'Invalid Authorization format. Expected: Bearer <token>' };
  }

  try {
    const expected = Buffer.from(cronSecret, 'utf-8');
    const provided = Buffer.from(token, 'utf-8');

    if (expected.byteLength !== provided.byteLength) {
      return { valid: false, error: 'Invalid CRON secret' };
    }

    if (!timingSafeEqual(expected, provided)) {
      return { valid: false, error: 'Invalid CRON secret' };
    }

    return { valid: true };
  } catch {
    return { valid: false, error: 'Authentication failed' };
  }
}

export function withCronAuth(
  handler: (request: NextRequest) => Promise<NextResponse>
): (request: NextRequest) => Promise<NextResponse> {
  return async (request: NextRequest) => {
    const auth = validateCronAuth(request);

    if (!auth.valid) {
      console.warn('[cron-auth] Rejected request:', {
        path: request.nextUrl.pathname,
        ip: request.headers.get('x-vercel-forwarded-for'),
        error: auth.error,
      });
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    return handler(request);
  };
}
