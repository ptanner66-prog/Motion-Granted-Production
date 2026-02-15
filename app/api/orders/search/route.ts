import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * GET /api/orders/search?q=<search term>
 *
 * Search the authenticated user's orders by order_number, motion_type,
 * or case_caption using case-insensitive partial matching (ilike).
 *
 * Returns: { results: Array<{ id, order_number, motion_type, case_caption, status }> }
 * Max 10 results.
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();

    // Authenticate
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse query params
    const { searchParams } = new URL(request.url);
    const query = (searchParams.get('q') ?? '').trim();

    if (query.length === 0) {
      return NextResponse.json(
        { results: [] },
        {
          headers: { 'Cache-Control': 'no-store' },
        }
      );
    }

    // Escape special characters for ilike pattern
    const escapedQuery = query
      .replace(/%/g, '\\%')
      .replace(/_/g, '\\_');
    const pattern = `%${escapedQuery}%`;

    // Search across order_number, motion_type, case_caption using OR filter
    const { data: results, error: searchError } = await supabase
      .from('orders')
      .select('id, order_number, motion_type, case_caption, status')
      .eq('client_id', user.id)
      .or(
        `order_number.ilike.${pattern},motion_type.ilike.${pattern},case_caption.ilike.${pattern}`
      )
      .order('created_at', { ascending: false })
      .limit(10);

    if (searchError) {
      return NextResponse.json(
        { error: 'Search failed' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        results: (results ?? []).map(
          (r: {
            id: string;
            order_number: string;
            motion_type: string;
            case_caption: string;
            status: string;
          }) => ({
            id: r.id,
            order_number: r.order_number,
            motion_type: r.motion_type,
            case_caption: r.case_caption,
            status: r.status,
          })
        ),
      },
      {
        headers: { 'Cache-Control': 'no-store' },
      }
    );
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
