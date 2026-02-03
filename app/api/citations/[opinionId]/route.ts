/**
 * GET /api/citations/[opinionId]
 *
 * Fetches full case details from cache or CourtListener.
 *
 * Path params:
 *   opinionId: CourtListener opinion ID (e.g., "3153867")
 *
 * Query params:
 *   includeText: boolean - Whether to include full opinion text (default: false)
 *   refresh: boolean - Force refresh from CourtListener (default: false)
 *
 * Citation Viewer Feature — January 30, 2026
 */

// Vercel Pro: Extended timeout for external API calls to CourtListener
export const maxDuration = 60;

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getCitationDetails } from '@/lib/services/citations/citation-service';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ opinionId: string }> }
) {
  try {
    const { opinionId } = await params;

    if (!opinionId) {
      return NextResponse.json(
        { success: false, error: 'Opinion ID is required' },
        { status: 400 }
      );
    }

    // Get query params
    const searchParams = request.nextUrl.searchParams;
    const includeText = searchParams.get('includeText') === 'true';
    const forceRefresh = searchParams.get('refresh') === 'true';

    // Verify user is authenticated
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Fetch citation details
    const result = await getCitationDetails(opinionId, {
      includeText,
      forceRefresh,
    });

    if (!result.success) {
      // Check if it's a 404
      if (result.error?.includes('not found')) {
        return NextResponse.json(
          { success: false, error: 'Citation not found in CourtListener' },
          { status: 404 }
        );
      }

      // Check if it's a rate limit
      if (result.error?.includes('rate limit') || result.error?.includes('429')) {
        return NextResponse.json(
          { success: false, error: 'CourtListener rate limit exceeded. Please try again later.' },
          { status: 429 }
        );
      }

      return NextResponse.json(
        { success: false, error: result.error || 'Failed to fetch citation' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: result.data,
    });
  } catch (error) {
    console.error('[API] Error fetching citation:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
