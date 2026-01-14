import Stripe from 'stripe'

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-12-15.clover',
  typescript: true,
})

export async function createPaymentIntent(amount: number, metadata: Record<string, string>) {
  const paymentIntent = await stripe.paymentIntents.create({
    amount: Math.round(amount * 100), // Convert to cents
    currency: 'usd',
    metadata,
    automatic_payment_methods: {
      enabled: true,
    },
  })

  return paymentIntent
}

export async function capturePaymentIntent(paymentIntentId: string) {
  const paymentIntent = await stripe.paymentIntents.capture(paymentIntentId)
  return paymentIntent
}

export async function cancelPaymentIntent(paymentIntentId: string) {
  const paymentIntent = await stripe.paymentIntents.cancel(paymentIntentId)
  return paymentIntent
}

export async function createRefund(paymentIntentId: string, amount?: number) {
  const refund = await stripe.refunds.create({
    payment_intent: paymentIntentId,
    amount: amount ? Math.round(amount * 100) : undefined,
  })
  return refund
}
