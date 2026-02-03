/**
 * GET /api/orders/[id]/citations
 *
 * Returns all citations associated with an order.
 *
 * Path params:
 *   id: UUID of the order
 *
 * Query params:
 *   type: 'case' | 'statute' | 'all' (default: 'all')
 *
 * Auth: Requires authenticated user who owns the order, OR admin
 *
 * Citation Viewer Feature — January 30, 2026
 */

// Vercel Pro: Extended timeout for database queries and potential CourtListener lookups
export const maxDuration = 60;

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getOrderCitations } from '@/lib/services/citations/citation-service';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: orderId } = await params;

    if (!orderId) {
      return NextResponse.json(
        { success: false, error: 'Order ID is required' },
        { status: 400 }
      );
    }

    // Verify user is authenticated
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Check if user has access to this order
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    const isAdmin = profile?.role === 'admin' || profile?.role === 'clerk';

    // If not admin, verify they own the order
    if (!isAdmin) {
      const { data: order } = await supabase
        .from('orders')
        .select('id, client_id, order_number')
        .eq('id', orderId)
        .eq('client_id', user.id)
        .single();

      if (!order) {
        return NextResponse.json(
          { success: false, error: 'Order not found or access denied' },
          { status: 404 }
        );
      }
    }

    // Get order info for response
    const { data: orderInfo } = await supabase
      .from('orders')
      .select('id, order_number')
      .eq('id', orderId)
      .single();

    if (!orderInfo) {
      return NextResponse.json(
        { success: false, error: 'Order not found' },
        { status: 404 }
      );
    }

    // Fetch citations
    const result = await getOrderCitations(orderId);

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error || 'Failed to fetch citations' },
        { status: 500 }
      );
    }

    // Filter by type if requested
    const searchParams = request.nextUrl.searchParams;
    const filterType = searchParams.get('type');

    let caseCitations = result.data?.caseCitations || [];
    let statutoryCitations = result.data?.statutoryCitations || [];

    if (filterType === 'case') {
      statutoryCitations = [];
    } else if (filterType === 'statute') {
      caseCitations = [];
    }

    return NextResponse.json({
      success: true,
      data: {
        orderId: orderInfo.id,
        orderNumber: orderInfo.order_number,
        totalCitations: caseCitations.length + statutoryCitations.length,
        caseCitations,
        statutoryCitations,
      },
    });
  } catch (error) {
    console.error('[API] Error fetching order citations:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
