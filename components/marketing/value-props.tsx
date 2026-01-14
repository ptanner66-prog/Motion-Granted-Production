import { CalendarX, Shield, Compass, DollarSign } from 'lucide-react'

const props = [
  {
    icon: CalendarX,
    title: 'No Commitment',
    description:
      'Order what you need, when you need it. No retainers, no subscriptions, no minimums.',
  },
  {
    icon: Shield,
    title: 'Confidential & Secure',
    description:
      'Your case information stays protected. All staff bound by confidentiality obligations.',
  },
  {
    icon: Compass,
    title: 'You Stay in Control',
    description:
      'You direct the strategy. You provide the arguments. We execute the drafting.',
  },
  {
    icon: DollarSign,
    title: 'Flat-Fee Pricing',
    description:
      'Know your cost upfront. No hourly surprises. See our full pricing menu.',
  },
]

export function ValueProps() {
  return (
    <section className="bg-white py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Section header */}
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight text-navy sm:text-4xl">
            Why Motion Granted?
          </h2>
          <p className="mt-4 text-lg text-gray-600">
            Built for busy attorneys who need reliable support
          </p>
        </div>

        {/* Props grid */}
        <div className="mx-auto mt-16 max-w-5xl">
          <div className="grid gap-8 sm:grid-cols-2">
            {props.map((prop) => (
              <div
                key={prop.title}
                className="relative rounded-2xl border border-gray-100 bg-white p-8 shadow-sm transition-shadow hover:shadow-md"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-teal/10">
                  <prop.icon className="h-6 w-6 text-teal" />
                </div>
                <h3 className="mt-6 text-xl font-semibold text-navy">
                  {prop.title}
                </h3>
                <p className="mt-2 text-gray-600 leading-relaxed">
                  {prop.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
