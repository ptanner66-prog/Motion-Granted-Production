/**
 * Waitlist API Endpoint (Task 84)
 *
 * Captures email addresses for "Coming Soon" states.
 * Rate limited to 10 requests per IP per hour.
 *
 * Source: Chunk 11, Task 84 - MOTION_TYPES_BY_STATE_SPEC_v2_EXPANDED.md
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { headers } from 'next/headers';
import { createLogger } from '@/lib/security/logger';

const log = createLogger('api-waitlist');

// Rate limiting in-memory store (would use Redis in production)
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();

const RATE_LIMIT = 10; // requests per hour
const RATE_WINDOW = 60 * 60 * 1000; // 1 hour in ms

async function getClientIP(request: NextRequest): Promise<string> {
  const headersList = await headers();
  const forwardedFor = headersList.get('x-forwarded-for');
  if (forwardedFor) {
    return forwardedFor.split(',')[0].trim();
  }
  const realIP = headersList.get('x-real-ip');
  if (realIP) {
    return realIP;
  }
  return 'unknown';
}

function checkRateLimit(ip: string): { allowed: boolean; remaining: number; resetIn: number } {
  const now = Date.now();
  const record = rateLimitStore.get(ip);

  if (!record || record.resetAt < now) {
    // New window
    rateLimitStore.set(ip, { count: 1, resetAt: now + RATE_WINDOW });
    return { allowed: true, remaining: RATE_LIMIT - 1, resetIn: RATE_WINDOW };
  }

  if (record.count >= RATE_LIMIT) {
    return { allowed: false, remaining: 0, resetIn: record.resetAt - now };
  }

  record.count++;
  return { allowed: true, remaining: RATE_LIMIT - record.count, resetIn: record.resetAt - now };
}

function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email) && email.length <= 255;
}

function isValidStateCode(code: string): boolean {
  return /^[A-Z]{2}$/.test(code);
}

export async function POST(request: NextRequest) {
  try {
    // Rate limiting
    const clientIP = await getClientIP(request);
    const rateLimit = checkRateLimit(clientIP);

    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          error: 'Too many requests',
          message: 'Please wait before signing up again',
          retryAfter: Math.ceil(rateLimit.resetIn / 1000),
        },
        {
          status: 429,
          headers: {
            'Retry-After': String(Math.ceil(rateLimit.resetIn / 1000)),
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': String(Math.ceil(rateLimit.resetIn / 1000)),
          },
        }
      );
    }

    // Parse request body
    const body = await request.json();
    const { email, state_code } = body;

    // Validate email
    if (!email || typeof email !== 'string') {
      return NextResponse.json(
        { error: 'Email is required' },
        { status: 400 }
      );
    }

    if (!isValidEmail(email)) {
      return NextResponse.json(
        { error: 'Invalid email format' },
        { status: 400 }
      );
    }

    // Validate state code
    if (!state_code || typeof state_code !== 'string') {
      return NextResponse.json(
        { error: 'State code is required' },
        { status: 400 }
      );
    }

    const normalizedStateCode = state_code.toUpperCase();
    if (!isValidStateCode(normalizedStateCode)) {
      return NextResponse.json(
        { error: 'Invalid state code format' },
        { status: 400 }
      );
    }

    // Initialize Supabase client
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      log.error('Missing Supabase credentials');
      return NextResponse.json(
        { error: 'Service configuration error' },
        { status: 500 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Check if already signed up for this state
    const { data: existing } = await supabase
      .from('state_waitlist')
      .select('id')
      .eq('email', email.toLowerCase())
      .eq('state_code', normalizedStateCode)
      .single();

    if (existing) {
      // Already signed up - return success (idempotent)
      return NextResponse.json(
        {
          success: true,
          message: 'You are already on the waitlist for this state',
        },
        {
          status: 200,
          headers: {
            'X-RateLimit-Remaining': String(rateLimit.remaining),
          },
        }
      );
    }

    // Insert into waitlist
    const { error: insertError } = await supabase
      .from('state_waitlist')
      .insert({
        email: email.toLowerCase(),
        state_code: normalizedStateCode,
      });

    if (insertError) {
      log.error('Insert error', { error: insertError });
      return NextResponse.json(
        { error: 'Failed to add to waitlist' },
        { status: 500 }
      );
    }

    log.info('New waitlist signup', { stateCode: normalizedStateCode });

    return NextResponse.json(
      {
        success: true,
        message: `You'll be notified when we launch in ${normalizedStateCode}`,
      },
      {
        status: 201,
        headers: {
          'X-RateLimit-Remaining': String(rateLimit.remaining),
        },
      }
    );
  } catch (error) {
    log.error('Unexpected error', { error: error instanceof Error ? error.message : error });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// GET method to check waitlist count (admin use)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const stateCode = searchParams.get('state');

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json({ error: 'Service unavailable' }, { status: 500 });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    if (stateCode) {
      // Count for specific state
      const { count } = await supabase
        .from('state_waitlist')
        .select('*', { count: 'exact', head: true })
        .eq('state_code', stateCode.toUpperCase());

      return NextResponse.json({ state: stateCode.toUpperCase(), count: count || 0 });
    }

    // Get counts for all states
    const { data } = await supabase
      .from('state_waitlist')
      .select('state_code');

    const counts: Record<string, number> = {};
    (data || []).forEach((row) => {
      counts[row.state_code] = (counts[row.state_code] || 0) + 1;
    });

    return NextResponse.json({ counts });
  } catch (error) {
    log.error('GET error', { error: error instanceof Error ? error.message : error });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
