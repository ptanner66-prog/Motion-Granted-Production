import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient, isSupabaseConfigured } from '@/lib/supabase/server'
import { stripe } from '@/lib/stripe'
import { sendEmail } from '@/lib/resend'
import { OrderConfirmationEmail } from '@/emails/order-confirmation'
import { formatMotionType } from '@/config/motion-types'
import { startOrderAutomation } from '@/lib/workflow/automation-service'
import { createLogger } from '@/lib/security/logger'

const log = createLogger('api-orders')
import { isStateAcceptingOrders } from '@/lib/admin/state-toggle'

// Map tier letter to DB integer
const TIER_TO_INT: Record<string, number> = { A: 0, B: 1, C: 2, D: 3 }

// Server-side validation schema for order creation
// SP-14: Backward-compatible with old wizard + new consolidated form
const createOrderSchema = z.object({
  motion_type: z.string().min(1, 'Motion type is required'),
  // Accept number (correct) or string letter (old wizard sends 'A','B',etc.)
  motion_tier: z.union([z.number().int().min(0).max(3), z.string()]),
  base_price: z.number().nullable(),
  turnaround: z.enum(['standard', 'rush_72', 'rush_48']),
  rush_surcharge: z.number().min(0),
  total_price: z.number().min(0),
  // SP-14: filing_deadline optional — attorney manages own deadlines
  filing_deadline: z.string().optional().default(''),
  jurisdiction: z.string().min(1, 'Jurisdiction is required'),
  court_division: z.string().nullable().optional(),
  case_number: z.string().min(1, 'Case number is required'),
  // SP-14: case_caption optional — generated from plaintiff/defendant names
  case_caption: z.string().optional().default(''),
  statement_of_facts: z.string().min(100, 'Statement of facts is too short'),
  // SP-14: procedural_history removed from intake form
  procedural_history: z.string().optional().default(''),
  instructions: z.string().min(50, 'Instructions are too short'),
  related_entities: z.string().nullable().optional(),
  // SP-14: parties now optional — generated from plaintiff/defendant names
  parties: z.array(z.object({
    name: z.string().min(1),
    role: z.string().min(1),
  })).optional().default([]),
  documents: z.array(z.any()).optional(),
  // SP-14: New fields from consolidated intake form
  filing_posture: z.enum(['FILING', 'RESPONDING']).optional(),
  plaintiff_names: z.string().optional(),
  defendant_names: z.string().optional(),
  party_represented: z.string().optional(),
  judge_name: z.string().optional(),
  opposing_counsel_name: z.string().optional(),
  opposing_counsel_firm: z.string().optional(),
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
      log.error('Error fetching orders', { error })
      return NextResponse.json({ error: 'Unable to retrieve your orders. Please try again.' }, { status: 500 })
    }

    return NextResponse.json(orders)
  } catch (error) {
    log.error('Orders fetch error', { error: error instanceof Error ? error.message : error })
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

    // Normalize motion_type: trim whitespace to prevent duplicates in analytics
    const normalizedMotionType = body.motion_type.trim()

    // SP-14: Normalize motion_tier to integer
    const motionTier = typeof body.motion_tier === 'string'
      ? (TIER_TO_INT[body.motion_tier.toUpperCase()] ?? 1)
      : body.motion_tier

    // SP-14: Generate case_caption from plaintiff/defendant if not provided
    const caseCaption = body.case_caption ||
      (body.plaintiff_names && body.defendant_names
        ? `${body.plaintiff_names.split(';')[0].trim()} v. ${body.defendant_names.split(';')[0].trim()}`
        : 'Caption Pending')

    // SP-14: Generate filing_deadline default if not provided (attorney manages own deadlines)
    const turnaroundDays = body.turnaround === 'rush_48' ? 2 : body.turnaround === 'rush_72' ? 3 : 7
    const filingDeadlineStr = body.filing_deadline ||
      new Date(Date.now() + turnaroundDays * 2 * 86400000).toISOString().split('T')[0]

    // SP-14: Procedural history default — removed from intake
    const proceduralHistory = body.procedural_history || 'Not provided.'

    // SP-14: Build related_entities JSON with new intake metadata
    const existingEntities = body.related_entities ? body.related_entities : null
    const intakeMetadata: Record<string, string> = {}
    if (body.filing_posture) intakeMetadata.filing_posture = body.filing_posture
    if (body.plaintiff_names) intakeMetadata.plaintiff_names = body.plaintiff_names
    if (body.defendant_names) intakeMetadata.defendant_names = body.defendant_names
    if (body.party_represented) intakeMetadata.party_represented = body.party_represented
    if (body.judge_name) intakeMetadata.judge_name = body.judge_name
    if (body.opposing_counsel_name) intakeMetadata.opposing_counsel_name = body.opposing_counsel_name
    if (body.opposing_counsel_firm) intakeMetadata.opposing_counsel_firm = body.opposing_counsel_firm
    const relatedEntities = Object.keys(intakeMetadata).length > 0
      ? JSON.stringify(intakeMetadata)
      : existingEntities

    // Server-side jurisdiction validation: verify the selected state is accepting orders
    const jurisdictionValue = body.jurisdiction.toUpperCase().trim()
    // Extract state code: handle LA_STATE, CA_STATE, FEDERAL_5TH, FEDERAL_9TH, and legacy formats
    const stateCodeMap: Record<string, string> = {
      LA_STATE: 'LA', FEDERAL_5TH: 'LA', CA_STATE: 'CA', FEDERAL_9TH: 'CA',
    }
    const stateCode = stateCodeMap[jurisdictionValue] || jurisdictionValue.match(/^([A-Z]{2})(?:\s|$)/)?.[1]
    if (stateCode) {
      const stateAccepting = await isStateAcceptingOrders(supabase, stateCode, body.motion_type)
      if (!stateAccepting) {
        return NextResponse.json(
          { error: `We are not currently accepting orders for ${stateCode}. Please contact support@motion-granted.com.` },
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
          motion_type: normalizedMotionType,
        },
      }, {
        idempotencyKey,
      })
    }

    // Calculate expected delivery date
    const filingDeadline = new Date(filingDeadlineStr)
    const daysBeforeDeadline = body.turnaround === 'rush_48' ? 2 : body.turnaround === 'rush_72' ? 3 : 5
    const expectedDelivery = new Date(filingDeadline)
    expectedDelivery.setDate(expectedDelivery.getDate() - daysBeforeDeadline)

    // Create order
    const { data: order, error } = await supabase
      .from('orders')
      .insert({
        client_id: user.id,
        motion_type: normalizedMotionType,
        motion_tier: motionTier,
        base_price: body.base_price,
        turnaround: body.turnaround,
        rush_surcharge: body.rush_surcharge,
        total_price: body.total_price,
        filing_deadline: filingDeadlineStr,
        expected_delivery: expectedDelivery.toISOString().split('T')[0],
        jurisdiction: body.jurisdiction,
        court_division: body.court_division || null,
        case_number: body.case_number,
        case_caption: caseCaption,
        statement_of_facts: body.statement_of_facts,
        procedural_history: proceduralHistory,
        instructions: body.instructions,
        related_entities: relatedEntities,
        stripe_payment_intent_id: paymentIntent?.id || null,
        stripe_payment_status: paymentIntent ? 'pending' : (stripePaymentRequired ? 'not_configured' : 'not_required'),
      })
      .select()
      .single()

    if (error) {
      log.error('Order creation database error', { error })
      return NextResponse.json({ error: 'Failed to create order. Please try again.' }, { status: 500 })
    }

    // Insert parties — from explicit array or from plaintiff/defendant name fields
    const partyEntries: { name: string; role: string }[] = []

    if (body.parties && body.parties.length > 0) {
      partyEntries.push(...body.parties.filter((p: { name: string; role: string }) => p.name && p.role))
    }

    // SP-14: Build parties from plaintiff/defendant name strings (semicolon-separated)
    if (partyEntries.length === 0) {
      if (body.plaintiff_names) {
        body.plaintiff_names.split(';').filter(Boolean).forEach((name: string) => {
          partyEntries.push({ name: name.trim(), role: body.party_represented || 'Plaintiff' })
        })
      }
      if (body.defendant_names) {
        const defRole = body.party_represented === 'Defendant' ? 'Plaintiff' : 'Defendant'
        body.defendant_names.split(';').filter(Boolean).forEach((name: string) => {
          partyEntries.push({ name: name.trim(), role: defRole })
        })
      }
    }

    if (partyEntries.length > 0) {
      const partiesData = partyEntries.map(p => ({
        order_id: order.id,
        party_name: p.name,
        party_name_normalized: p.name.toLowerCase().trim(),
        party_role: p.role,
      }))
      await supabase.from('parties').insert(partiesData)
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
          portalUrl: `${process.env.NEXT_PUBLIC_APP_URL || 'https://motion-granted.com'}/orders/${order.id}`,
        }),
      }).catch((err) => {
        log.error('Failed to send confirmation email', { error: err instanceof Error ? err.message : err })
      })
    } else {
      log.warn('User has no email address, skipping confirmation email')
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
    log.error('Order creation error', { error: error instanceof Error ? error.message : error })
    return NextResponse.json(
      { error: 'We couldn\'t process your order. Please try again, or contact support@motion-granted.com if the issue persists.' },
      { status: 500 }
    )
  }
}
