import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { stripe } from '@/lib/stripe'

export async function GET() {
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
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json(orders)
  } catch (error) {
    console.error('Error fetching orders:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()

    // Create Stripe PaymentIntent
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(body.total_price * 100),
      currency: 'usd',
      metadata: {
        user_id: user.id,
        motion_type: body.motion_type,
      },
    })

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
        stripe_payment_intent_id: paymentIntent.id,
        stripe_payment_status: 'pending',
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

    return NextResponse.json({
      order,
      clientSecret: paymentIntent.client_secret,
    })
  } catch (error) {
    console.error('Error creating order:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
