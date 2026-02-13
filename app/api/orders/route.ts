import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient, isSupabaseConfigured } from '@/lib/supabase/server'
import { stripe } from '@/lib/stripe'
import { sendEmail } from '@/lib/resend'
import { OrderConfirmationEmail } from '@/emails/order-confirmation'
import { formatMotionType } from '@/config/motion-types'
import { startOrderAutomation } from '@/lib/workflow/automation-service'
import { isStateAcceptingOrders } from '@/lib/admin/state-toggle'

// Server-side validation schema for order creation
const createOrderSchema = z.object({
  motion_type: z.string().min(1, 'Motion type is required'),
  motion_tier: z.number().int().min(0).max(3),
  base_price: z.number().nullable(),
  turnaround: z.enum(['standard', 'rush_72', 'rush_48']),
  rush_surcharge: z.number().min(0),
  total_price: z.number().min(0),
  filing_deadline: z.string().min(1, 'Filing deadline is required'),
  jurisdiction: z.string().min(1, 'Jurisdiction is required'),
  court_division: z.string().nullable().optional(),
  case_number: z.string().min(1, 'Case number is required'),
  case_caption: z.string().min(1, 'Case caption is required'),
  statement_of_facts: z.string().min(100, 'Statement of facts is too short'),
  procedural_history: z.string().min(50, 'Procedural history is too short'),
  instructions: z.string().min(50, 'Instructions are too short'),
  related_entities: z.string().nullable().optional(),
  parties: z.array(z.object({
    name: z.string().min(1),
    role: z.string().min(1),
  })).min(2, 'At least two parties are required'),
  documents: z.array(z.any()).optional(),
})

export async function GET() {
  // Return early if Supabase is not configured
  if (!isSupabaseConfigured) {
    return NextResponse.json({ error: 'Database not configured', orders: [] }, { status: 503 })
  }

  try {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: orders, error } = await supabase
      .from('orders')
      .select('*')
      .eq('client_id', user.id)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Error fetching orders:', error)
      return NextResponse.json({ error: 'Unable to retrieve your orders. Please try again.' }, { status: 500 })
    }

    return NextResponse.json(orders)
  } catch (error) {
    console.error('Orders fetch error:', error)
    return NextResponse.json({ error: 'Unable to retrieve your orders. Please try again.' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  // Return early if Supabase is not configured
  if (!isSupabaseConfigured) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 503 })
  }

  try {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const rawBody = await req.json()

    // Validate request body
    const parseResult = createOrderSchema.safeParse(rawBody)
    if (!parseResult.success) {
      const firstError = parseResult.error.issues[0]
      return NextResponse.json(
        { error: `Validation failed: ${firstError.message}` },
        { status: 400 }
      )
    }
    const body = parseResult.data

    // Server-side jurisdiction validation: verify the selected state is accepting orders
    const jurisdictionValue = body.jurisdiction.toUpperCase().trim()
    // Extract state code: handle both "LA" format and "Louisiana State Court" format
    const stateCodeMatch = jurisdictionValue.match(/^([A-Z]{2})(?:\s|$)/)
    if (stateCodeMatch) {
      const stateCode = stateCodeMatch[1]
      const stateAccepting = await isStateAcceptingOrders(supabase, stateCode, body.motion_type)
      if (!stateAccepting) {
        return NextResponse.json(
          { error: `We are not currently accepting orders for ${stateCode}. Please contact support@motiongranted.com.` },
          { status: 400 }
        )
      }
    }

    // Create Stripe PaymentIntent if Stripe is configured and payment is required
    // SECURITY FIX: Use crypto.randomUUID() for cryptographically secure idempotency key
    let paymentIntent = null
    const stripePaymentRequired = process.env.STRIPE_PAYMENT_REQUIRED?.toLowerCase().trim() !== 'false'
    if (stripe && stripePaymentRequired && body.total_price > 0) {
      const idempotencyKey = `order_${user.id}_${Date.now()}_${crypto.randomUUID()}`
      paymentIntent = await stripe.paymentIntents.create({
        amount: Math.round(body.total_price * 100),
        currency: 'usd',
        metadata: {
          // SECURITY: Only include order_id after creation, not PII
          motion_type: body.motion_type,
        },
      }, {
        idempotencyKey,
      })
    }

    // Calculate expected delivery date
    const filingDeadline = new Date(body.filing_deadline)
    const daysBeforeDeadline = body.turnaround === 'rush_48' ? 2 : body.turnaround === 'rush_72' ? 3 : 5
    const expectedDelivery = new Date(filingDeadline)
    expectedDelivery.setDate(expectedDelivery.getDate() - daysBeforeDeadline)

    // Create order
    const { data: order, error } = await supabase
      .from('orders')
      .insert({
        client_id: user.id,
        motion_type: body.motion_type,
        motion_tier: body.motion_tier,
        base_price: body.base_price,
        turnaround: body.turnaround,
        rush_surcharge: body.rush_surcharge,
        total_price: body.total_price,
        filing_deadline: body.filing_deadline,
        expected_delivery: expectedDelivery.toISOString().split('T')[0],
        jurisdiction: body.jurisdiction,
        court_division: body.court_division || null,
        case_number: body.case_number,
        case_caption: body.case_caption,
        statement_of_facts: body.statement_of_facts,
        procedural_history: body.procedural_history,
        instructions: body.instructions,
        related_entities: body.related_entities || null,
        stripe_payment_intent_id: paymentIntent?.id || null,
        stripe_payment_status: paymentIntent ? 'pending' : (stripePaymentRequired ? 'not_configured' : 'not_required'),
      })
      .select()
      .single()

    if (error) {
      console.error('Order creation database error:', error)
      return NextResponse.json({ error: 'Failed to create order. Please try again.' }, { status: 500 })
    }

    // Insert parties
    if (body.parties && body.parties.length > 0) {
      const partiesData = body.parties
        .filter((p: { name: string; role: string }) => p.name && p.role)
        .map((p: { name: string; role: string }) => ({
          order_id: order.id,
          party_name: p.name,
          party_name_normalized: p.name.toLowerCase().trim(),
          party_role: p.role,
        }))

      if (partiesData.length > 0) {
        await supabase.from('parties').insert(partiesData)
      }
    }

    // Insert documents
    if (body.documents && body.documents.length > 0) {
      interface DocumentInput {
        file_name: string
        file_type: string
        file_size: number
        file_url: string
        document_type: string
      }

      // SP12-02 FIX: Explicitly set is_deliverable: false so document extractor
      // query .neq('is_deliverable', true) can find these rows.
      // Without this, Postgres defaults to NULL, and NULL != true → NULL → row excluded.
      const documentsData = body.documents.map((doc: DocumentInput) => ({
        order_id: order.id,
        file_name: doc.file_name,
        file_type: doc.file_type,
        file_size: doc.file_size,
        file_url: doc.file_url,
        document_type: doc.document_type || 'other',
        uploaded_by: user.id,
        is_deliverable: false,
      }))

      const { error: docError } = await supabase.from('documents').insert(documentsData)
      if (docError) {
        // Continue even if document insert fails
      }
    }

    // Send confirmation email (non-blocking)
    const turnaroundLabels: Record<string, string> = {
      standard: 'Standard (5-7 business days)',
      rush_72: '72-Hour Rush',
      rush_48: '48-Hour Rush',
    }

    // Only send email if user has an email address
    if (user.email) {
      sendEmail({
        to: user.email,
        subject: `Order Confirmed: ${order.order_number}`,
        react: OrderConfirmationEmail({
          orderNumber: order.order_number,
          motionType: formatMotionType(body.motion_type),
          caseCaption: body.case_caption,
          turnaround: turnaroundLabels[body.turnaround] || body.turnaround,
          expectedDelivery: new Date(expectedDelivery).toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          }),
          totalPrice: `$${body.total_price.toFixed(2)}`,
          portalUrl: `${process.env.NEXT_PUBLIC_APP_URL || 'https://motiongranted.com'}/orders/${order.id}`,
        }),
      }).catch((err) => {
        console.error('Failed to send confirmation email:', err)
      })
    } else {
      console.warn('[Orders] User has no email address, skipping confirmation email')
    }

    // NOTE: Automation is NOT started here. It is triggered by:
    // 1. Client calling POST /api/automation/start after documents are uploaded
    // 2. Admin manually via the workflow control panel
    // This prevents the race condition where automation runs before documents are uploaded.

    return NextResponse.json({
      order,
      clientSecret: paymentIntent?.client_secret || null,
      stripeConfigured: !!stripe,
      // Tell client to call /api/automation/start after uploading documents
      triggerAutomationUrl: `/api/automation/start?orderId=${order.id}`,
    })
  } catch (error) {
    console.error('Order creation error:', error)
    return NextResponse.json(
      { error: 'We couldn\'t process your order. Please try again, or contact support@motiongranted.com if the issue persists.' },
      { status: 500 }
    )
  }
}
