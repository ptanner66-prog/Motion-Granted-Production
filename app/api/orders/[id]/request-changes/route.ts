import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const MAX_NOTES_LENGTH = 5000

/**
 * POST /api/orders/[id]/request-changes
 *
 * Submits a revision request for an order at CP3.
 * Auth: Must be the order owner.
 * Body: { notes: string } — non-empty, max 5000 chars.
 * Returns: { success: true, revisionId: string }
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
    let body: { notes?: unknown }
    try {
      body = (await request.json()) as { notes?: unknown }
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

    // Fetch the order and verify ownership
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('id, client_id, status, order_number, revision_count')
      .eq('id', orderId)
      .single()

    if (orderError || !order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }

    if (order.client_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Verify the order is in a reviewable state
    const reviewableStatuses = ['draft_delivered', 'pending_review']
    if (!reviewableStatuses.includes(order.status)) {
      return NextResponse.json(
        {
          error:
            order.status === 'completed'
              ? 'This order has already been approved and cannot be revised.'
              : 'This order is not in a state that accepts revision requests.',
        },
        { status: 400 }
      )
    }

    // Check for existing pending revision requests
    const { data: existingRequests } = await supabase
      .from('revision_requests')
      .select('id')
      .eq('order_id', orderId)
      .in('status', ['pending', 'in_progress'])
      .limit(1)

    if (existingRequests && existingRequests.length > 0) {
      return NextResponse.json(
        { error: 'A revision request is already pending for this order.' },
        { status: 409 }
      )
    }

    // Create revision request
    const { data: revision, error: revisionError } = await supabase
      .from('revision_requests')
      .insert({
        order_id: orderId,
        instructions: notes,
        status: 'pending',
      })
      .select('id')
      .single()

    if (revisionError || !revision) {
      return NextResponse.json(
        { error: 'Failed to create revision request' },
        { status: 500 }
      )
    }

    // Update order status to revision_requested
    const { error: updateError } = await supabase
      .from('orders')
      .update({
        status: 'revision_requested',
        revision_count: (order.revision_count ?? 0) + 1,
        updated_at: new Date().toISOString(),
      })
      .eq('id', orderId)

    if (updateError) {
      return NextResponse.json(
        { error: 'Failed to update order status' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      revisionId: revision.id,
      orderNumber: order.order_number,
    })
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
