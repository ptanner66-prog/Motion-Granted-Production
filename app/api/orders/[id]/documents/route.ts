import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * GET /api/orders/[id]/documents
 *
 * Returns the list of deliverable documents for an order.
 * Auth: Must be the order owner OR an admin.
 */
export async function GET(
  _request: Request,
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

    // Fetch the order
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('id, client_id, order_number, status, status_version')
      .eq('id', orderId)
      .single()

    if (orderError || !order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }

    // Verify ownership or admin role
    if (order.client_id !== user.id) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()

      const role = profile?.role?.toString().toLowerCase().trim()
      if (role !== 'admin') {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
    }

    // Fetch deliverable documents
    const { data: documents, error: docsError } = await supabase
      .from('documents')
      .select(
        'id, file_name, file_url, file_type, file_size, document_type, is_deliverable, created_at'
      )
      .eq('order_id', orderId)
      .eq('is_deliverable', true)
      .order('created_at', { ascending: true })

    if (docsError) {
      return NextResponse.json(
        { error: 'Failed to fetch documents' },
        { status: 500 }
      )
    }

    // Build response with structured document info
    const formattedDocuments = (documents ?? []).map((doc: { id: string; file_name: string; file_url: string; file_type: string; file_size: number; document_type: string; is_deliverable: boolean; created_at: string }) => ({
      id: doc.id,
      type: doc.document_type,
      filename: doc.file_name,
      downloadUrl: doc.file_url,
      fileType: doc.file_type,
      fileSizeBytes: doc.file_size,
      createdAt: doc.created_at,
    }))

    return NextResponse.json({
      orderId: order.id,
      orderNumber: order.order_number,
      orderStatus: order.status,
      statusVersion: order.status_version ?? 0,
      documents: formattedDocuments,
    })
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
