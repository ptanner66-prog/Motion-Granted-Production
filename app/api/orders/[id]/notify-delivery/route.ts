import { NextResponse } from 'next/server'
import { createClient, isSupabaseConfigured } from '@/lib/supabase/server'
import { sendEmail } from '@/lib/resend'
import { DraftReadyEmail } from '@/emails/draft-ready'
import { formatMotionType } from '@/config/motion-types'
import { createLogger } from '@/lib/security/logger'

const log = createLogger('api-orders-notify-delivery')

// POST /api/orders/[id]/notify-delivery
// Sends draft delivery notification email to the client
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!isSupabaseConfigured) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 503 })
  }

  try {
    const { id: orderId } = await params
    const supabase = await createClient()

    // Verify admin user
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check if user is admin
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (profile?.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    // Fetch order with client info
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select(`
        *,
        profiles:client_id (
          email,
          full_name
        )
      `)
      .eq('id', orderId)
      .single()

    if (orderError || !order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }

    const clientEmail = order.profiles?.email
    if (!clientEmail) {
      return NextResponse.json({ error: 'Client email not found' }, { status: 400 })
    }

    // Send draft ready email
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://motiongranted.com'

    const result = await sendEmail({
      to: clientEmail,
      subject: `Your Draft is Ready: ${order.order_number}`,
      react: DraftReadyEmail({
        orderNumber: order.order_number,
        motionType: formatMotionType(order.motion_type),
        caseCaption: order.case_caption,
        deliveredDate: new Date().toLocaleDateString('en-US', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        }),
        portalUrl: `${appUrl}/dashboard`,
        orderUrl: `${appUrl}/orders/${order.id}`,
      }),
    })

    if (!result.success) {
      log.error('Failed to send draft ready email', { error: result.error })
      return NextResponse.json({ error: 'Failed to send email' }, { status: 500 })
    }

    return NextResponse.json({ success: true, message: 'Delivery notification sent' })
  } catch (error) {
    log.error('Error sending delivery notification', { error: error instanceof Error ? error.message : error })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
