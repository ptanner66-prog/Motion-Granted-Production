import { Metadata } from 'next'
import { PricingTable } from '@/components/marketing/pricing-table'

export const metadata: Metadata = {
  title: 'Pricing',
  description: 'Transparent, flat-fee pricing for all motion types. No hourly surprises.',
}

export default function PricingPage() {
  return (
    <div className="bg-white">
      {/* Header */}
      <section className="bg-gray-50 py-16 sm:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <h1 className="text-4xl font-bold tracking-tight text-navy sm:text-5xl">
              Transparent, Flat-Fee Pricing
            </h1>
            <p className="mt-6 text-lg text-gray-600">
              Know your cost upfront. No hourly surprises. Payment due at order submission.
              One round of revisions included with every order.
            </p>
          </div>
        </div>
      </section>

      {/* Pricing table */}
      <section className="py-16 sm:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <PricingTable />
        </div>
      </section>

      {/* Additional info */}
      <section className="border-t border-gray-200 bg-gray-50 py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-3xl">
            <h2 className="text-2xl font-bold text-navy text-center mb-8">
              Important Pricing Information
            </h2>
            <div className="space-y-6 text-gray-600">
              <div>
                <h3 className="font-semibold text-navy">Rush Orders</h3>
                <p className="mt-1">
                  Rush orders are available at an additional charge: 72-hour delivery (+25%) or
                  48-hour delivery (+50%). Rush availability depends on current workload and may
                  not always be available.
                </p>
              </div>
              <div>
                <h3 className="font-semibold text-navy">Revisions</h3>
                <p className="mt-1">
                  One round of revisions is included with every order. Additional revision rounds
                  or substantial scope changes may incur additional charges.
                </p>
              </div>
              <div>
                <h3 className="font-semibold text-navy">Custom Quotes</h3>
                <p className="mt-1">
                  For motions not listed or complex matters, we provide custom quotes. Contact us
                  with the details and we&apos;ll respond within one business day.
                </p>
              </div>
              <div>
                <h3 className="font-semibold text-navy">Payment</h3>
                <p className="mt-1">
                  Payment is due at the time of order submission. We accept all major credit cards
                  via Stripe.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
