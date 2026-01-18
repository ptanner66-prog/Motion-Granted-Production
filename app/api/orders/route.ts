import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient, isSupabaseConfigured } from '@/lib/supabase/server'
import { stripe } from '@/lib/stripe'
import { sendEmail } from '@/lib/resend'
import { OrderConfirmationEmail } from '@/emails/order-confirmation'
import { formatMotionType } from '@/config/motion-types'
import { startOrderAutomation } from '@/lib/workflow/automation-service'

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

    // Create Stripe PaymentIntent if Stripe is configured
    let paymentIntent = null
    if (stripe) {
      paymentIntent = await stripe.paymentIntents.create({
        amount: Math.round(body.total_price * 100),
        currency: 'usd',
        metadata: {
          user_id: user.id,
          motion_type: body.motion_type,
        },
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
        stripe_payment_status: paymentIntent ? 'pending' : 'not_configured',
      })
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
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

      const documentsData = body.documents.map((doc: DocumentInput) => ({
        order_id: order.id,
        file_name: doc.file_name,
        file_type: doc.file_type,
        file_size: doc.file_size,
        file_url: doc.file_url,
        document_type: doc.document_type || 'other',
        uploaded_by: user.id,
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

    sendEmail({
      to: user.email!,
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

    // AUTO-TRIGGER: Start workflow automation (non-blocking)
    // This kicks off the entire drafting process automatically
    startOrderAutomation(order.id, {
      autoRun: true,
      generatePDF: true,
      sendNotifications: true,
    }).catch((err) => {
      console.error('Failed to start order automation:', err)
      // Non-fatal - workflow can be started manually via admin panel
    })

    return NextResponse.json({
      order,
      clientSecret: paymentIntent?.client_secret || null,
      stripeConfigured: !!stripe,
    })
  } catch (error) {
    console.error('Order creation error:', error)
    return NextResponse.json(
      { error: 'We couldn\'t process your order. Please try again, or contact support@motiongranted.com if the issue persists.' },
      { status: 500 }
    )
  }
}
