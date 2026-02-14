/**
 * POST /api/citations/batch
 *
 * Fetches multiple citations in a single request.
 * Uses cache aggressively, only hits CourtListener for cache misses.
 *
 * Request body:
 * {
 *   opinionIds: ["3153867", "9414832", "539193"],
 *   includeText: false,
 * }
 *
 * Rate limiting: Max 20 citations per request
 *
 * Citation Viewer Feature — January 30, 2026
 */

// Vercel Pro: Extended timeout for batch external API calls to CourtListener
export const maxDuration = 60;

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { batchGetCitationDetailsService } from '@/lib/services/citations/citation-service';
import { createLogger } from '@/lib/security/logger';

const log = createLogger('api-citations-batch');

interface BatchRequestBody {
  opinionIds: string[];
  includeText?: boolean;
}

export async function POST(request: NextRequest) {
  try {
    // Verify user is authenticated
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Parse request body
    let body: BatchRequestBody;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: 'Invalid JSON body' },
        { status: 400 }
      );
    }

    // Validate request
    if (!body.opinionIds || !Array.isArray(body.opinionIds)) {
      return NextResponse.json(
        { success: false, error: 'opinionIds array is required' },
        { status: 400 }
      );
    }

    if (body.opinionIds.length === 0) {
      return NextResponse.json({
        success: true,
        data: {
          citations: [],
          cacheHits: 0,
          cacheMisses: 0,
          errors: [],
        },
      });
    }

    if (body.opinionIds.length > 20) {
      return NextResponse.json(
        { success: false, error: 'Maximum 20 citations per request' },
        { status: 400 }
      );
    }

    // Validate opinion IDs are strings
    const invalidIds = body.opinionIds.filter(id => typeof id !== 'string' || !id.trim());
    if (invalidIds.length > 0) {
      return NextResponse.json(
        { success: false, error: 'All opinion IDs must be non-empty strings' },
        { status: 400 }
      );
    }

    // Fetch citations
    const result = await batchGetCitationDetailsService(body.opinionIds);

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error || 'Failed to fetch citations' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: result.data,
    });
  } catch (error) {
    log.error('Error in batch citation fetch', { error: error instanceof Error ? error.message : error });
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
