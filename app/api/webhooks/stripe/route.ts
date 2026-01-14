import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import Stripe from 'stripe'

const stripeSecretKey = process.env.STRIPE_SECRET_KEY
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET

// Only initialize Stripe if keys are available and valid
const stripe = stripeSecretKey && !stripeSecretKey.includes('xxxxx')
  ? new Stripe(stripeSecretKey, {
      apiVersion: '2025-12-15.clover',
    })
  : null

export async function POST(req: Request) {
  // Return early if Stripe is not configured
  if (!stripe || !webhookSecret || webhookSecret.includes('xxxxx')) {
    return NextResponse.json({ error: 'Stripe not configured' }, { status: 503 })
  }

  const body = await req.text()
  const headersList = await headers()
  const signature = headersList.get('stripe-signature')!

  let event: Stripe.Event

  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret)
  } catch (err) {
    console.error('Webhook signature verification failed:', err)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  // Handle the event
  switch (event.type) {
    case 'payment_intent.succeeded':
      const paymentIntent = event.data.object as Stripe.PaymentIntent
      console.log('Payment succeeded:', paymentIntent.id)
      // TODO: Update order status in database
      // TODO: Send confirmation email
      break

    case 'payment_intent.payment_failed':
      const failedPayment = event.data.object as Stripe.PaymentIntent
      console.log('Payment failed:', failedPayment.id)
      // TODO: Notify user of failed payment
      break

    case 'charge.refunded':
      const refund = event.data.object as Stripe.Charge
      console.log('Charge refunded:', refund.id)
      // TODO: Update order status
      break

    default:
      console.log(`Unhandled event type: ${event.type}`)
  }

  return NextResponse.json({ received: true })
}
