import { CreditCard, AlertTriangle, CheckCircle, XCircle } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'

function getStripeStatus() {
  const hasStripeKey = !!(process.env.STRIPE_SECRET_KEY && !process.env.STRIPE_SECRET_KEY.includes('xxxxx'))
  const paymentRequired = process.env.STRIPE_PAYMENT_REQUIRED?.toLowerCase().trim() !== 'false'
  // If STRIPE_PAYMENT_REQUIRED is not set or is anything other than 'false', payment IS required (safe default)

  return {
    hasStripeKey,
    paymentRequired,
    mode: hasStripeKey
      ? (process.env.STRIPE_SECRET_KEY?.startsWith('sk_live_') ? 'live' : 'test')
      : 'not_configured',
  }
}

export function StripeStatusCard() {
  const status = getStripeStatus()

  return (
    <Card className="bg-white border-gray-200">
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="bg-purple-500/20 p-2 rounded-lg">
            <CreditCard className="h-5 w-5 text-purple-500" />
          </div>
          <div>
            <CardTitle className="text-lg font-semibold text-navy">Stripe Payments</CardTitle>
            <CardDescription className="text-gray-400">Payment processing configuration</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Stripe API Key Status */}
        <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
          <div className="flex items-center gap-3">
            {status.hasStripeKey ? (
              <CheckCircle className="h-5 w-5 text-emerald-500" />
            ) : (
              <XCircle className="h-5 w-5 text-red-400" />
            )}
            <div>
              <p className="text-navy font-medium">Stripe API Key</p>
              <p className="text-sm text-gray-400">
                {status.hasStripeKey
                  ? `Connected (${status.mode} mode)`
                  : 'Not configured — set STRIPE_SECRET_KEY in Vercel env vars'}
              </p>
            </div>
          </div>
          {status.hasStripeKey && (
            <span className={`px-2 py-1 text-xs font-medium rounded ${
              status.mode === 'live'
                ? 'bg-emerald-500/20 text-emerald-600'
                : 'bg-amber-500/20 text-amber-600'
            }`}>
              {status.mode === 'live' ? 'LIVE' : 'TEST'}
            </span>
          )}
        </div>

        {/* Payment Required Toggle Status */}
        <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
          <div className="flex items-center gap-3">
            {status.paymentRequired ? (
              <CheckCircle className="h-5 w-5 text-emerald-500" />
            ) : (
              <AlertTriangle className="h-5 w-5 text-amber-500" />
            )}
            <div>
              <p className="text-navy font-medium">Payment Collection</p>
              <p className="text-sm text-gray-400">
                {status.paymentRequired
                  ? 'Required — clients must pay before order processing'
                  : 'Disabled — orders accepted without payment (testing mode)'}
              </p>
            </div>
          </div>
          <span className={`px-2 py-1 text-xs font-medium rounded ${
            status.paymentRequired
              ? 'bg-emerald-500/20 text-emerald-600'
              : 'bg-amber-500/20 text-amber-600'
          }`}>
            {status.paymentRequired ? 'ACTIVE' : 'OFF'}
          </span>
        </div>

        {/* Instructions */}
        <div className="p-4 bg-blue-50/50 border border-blue-200/50 rounded-lg">
          <p className="text-sm text-navy font-medium mb-1">Toggle Payment Collection</p>
          <p className="text-xs text-gray-500">
            Set <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs font-mono">STRIPE_PAYMENT_REQUIRED</code> in
            Vercel Environment Variables. Use <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs font-mono">false</code> for
            testing (free orders), <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs font-mono">true</code> for
            production. Redeploy after changing.
          </p>
        </div>
      </CardContent>
    </Card>
  )
}
