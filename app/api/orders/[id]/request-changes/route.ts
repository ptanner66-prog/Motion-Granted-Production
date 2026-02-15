import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const MAX_NOTES_LENGTH = 5000

/**
 * POST /api/orders/[id]/request-changes
 *
 * Submits a CP3 change request for an order awaiting customer approval.
 * This is a free CP3 rework — does NOT increment revision_count.
 * Auth: Must be the order owner.
 * Body: { notes: string, status_version: number }
 * Returns: { success: true }
 */
export async function POST(
  request: Request,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const { id: orderId } = await props.params
    const supabase = await createClient()

    // Authenticate
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Parse and validate body
    let body: { notes?: unknown; status_version?: unknown }
    try {
      body = (await request.json()) as { notes?: unknown; status_version?: unknown }
    } catch {
      return NextResponse.json(
        { error: 'Invalid request body' },
        { status: 400 }
      )
    }

    const notes =
      typeof body.notes === 'string' ? body.notes.trim() : ''

    if (notes.length === 0) {
      return NextResponse.json(
        { error: 'Revision notes are required. Please describe the changes needed.' },
        { status: 400 }
      )
    }

    if (notes.length > MAX_NOTES_LENGTH) {
      return NextResponse.json(
        {
          error: `Revision notes must be ${MAX_NOTES_LENGTH} characters or fewer. Current length: ${notes.length}`,
        },
        { status: 400 }
      )
    }

    // Validate status_version
    const statusVersion = typeof body.status_version === 'number' ? body.status_version : undefined
    if (statusVersion === undefined) {
      return NextResponse.json(
        { error: 'status_version is required' },
        { status: 400 }
      )
    }

    // Fetch the order and verify ownership
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('id, client_id, status, order_number, status_version')
      .eq('id', orderId)
      .single()

    if (orderError || !order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }

    if (order.client_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Verify the order is in a reviewable state (7-status + legacy)
    const reviewableStatuses = ['AWAITING_APPROVAL', 'draft_delivered', 'pending_review']
    if (!reviewableStatuses.includes(order.status)) {
      return NextResponse.json(
        {
          error:
            order.status === 'completed' || order.status === 'COMPLETED'
              ? 'This order has already been approved and cannot be revised.'
              : 'This order is not in a state that accepts change requests.',
        },
        { status: 400 }
      )
    }

    // Optimistic concurrency check
    const currentVersion = order.status_version ?? 0
    if (statusVersion !== currentVersion) {
      return NextResponse.json(
        {
          error: 'Version conflict. The order has been modified by another request.',
          current_version: currentVersion,
        },
        { status: 409 }
      )
    }

    const now = new Date().toISOString()

    // Update order status to in_progress with CP3 change notes
    // This does NOT increment revision_count (free CP3 rework)
    const { data: updatedOrder, error: updateError } = await supabase
      .from('orders')
      .update({
        status: 'in_progress',
        cp3_change_notes: notes,
        status_version: currentVersion + 1,
        updated_at: now,
      })
      .eq('id', orderId)
      .eq('status_version', currentVersion)
      .select('id')
      .single()

    if (updateError || !updatedOrder) {
      return NextResponse.json(
        { error: 'Failed to submit change request. The order may have been modified concurrently.' },
        { status: 409 }
      )
    }

    return NextResponse.json({
      success: true,
      orderNumber: order.order_number,
      status_version: currentVersion + 1,
    })
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
