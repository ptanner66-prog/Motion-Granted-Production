import Stripe from 'stripe'

// Only initialize Stripe if the secret key is available and valid
const stripeSecretKey = process.env.STRIPE_SECRET_KEY

// Use the API version that matches the installed Stripe package
// The version string is enforced by TypeScript types in the Stripe package
export const stripe = stripeSecretKey && !stripeSecretKey.includes('xxxxx')
  ? new Stripe(stripeSecretKey, {
      // @ts-expect-error - Using latest stable API version compatible with package
      apiVersion: '2024-12-18.acacia',
      typescript: true,
    })
  : null

export async function createPaymentIntent(amount: number, metadata: Record<string, string>) {
  if (!stripe) {
    throw new Error('Stripe is not configured')
  }
  const paymentIntent = await stripe.paymentIntents.create({
    amount: Math.round(amount * 100),
    currency: 'usd',
    metadata,
    automatic_payment_methods: {
      enabled: true,
    },
  })
  return paymentIntent
}

export async function capturePaymentIntent(paymentIntentId: string) {
  if (!stripe) {
    throw new Error('Stripe is not configured')
  }
  const paymentIntent = await stripe.paymentIntents.capture(paymentIntentId)
  return paymentIntent
}

export async function cancelPaymentIntent(paymentIntentId: string) {
  if (!stripe) {
    throw new Error('Stripe is not configured')
  }
  const paymentIntent = await stripe.paymentIntents.cancel(paymentIntentId)
  return paymentIntent
}

export async function createRefund(paymentIntentId: string, amount?: number) {
  if (!stripe) {
    throw new Error('Stripe is not configured')
  }
  const refund = await stripe.refunds.create({
    payment_intent: paymentIntentId,
    amount: amount ? Math.round(amount * 100) : undefined,
  })
  return refund
}
