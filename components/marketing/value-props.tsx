import { CalendarX, Shield, Compass, DollarSign } from 'lucide-react'

const props = [
  {
    icon: CalendarX,
    title: 'No Commitment',
    description:
      'Order what you need, when you need it. No retainers, no subscriptions, no minimums.',
    gradient: 'from-rose-500/10 to-orange-500/10',
    iconBg: 'bg-gradient-to-br from-rose-500/20 to-orange-500/10',
    iconColor: 'text-rose-600',
  },
  {
    icon: Shield,
    title: 'Confidential & Secure',
    description:
      'Your case information stays protected. All staff bound by confidentiality obligations.',
    gradient: 'from-blue-500/10 to-cyan-500/10',
    iconBg: 'bg-gradient-to-br from-blue-500/20 to-cyan-500/10',
    iconColor: 'text-blue-600',
  },
  {
    icon: Compass,
    title: 'You Stay in Control',
    description:
      'You direct the strategy. You provide the arguments. We execute the drafting.',
    gradient: 'from-violet-500/10 to-purple-500/10',
    iconBg: 'bg-gradient-to-br from-violet-500/20 to-purple-500/10',
    iconColor: 'text-violet-600',
  },
  {
    icon: DollarSign,
    title: 'Flat-Fee Pricing',
    description:
      'Know your cost upfront. No hourly surprises. See our full pricing menu.',
    gradient: 'from-emerald-500/10 to-teal-500/10',
    iconBg: 'bg-gradient-to-br from-emerald-500/20 to-teal-500/10',
    iconColor: 'text-emerald-600',
  },
]

export function ValueProps() {
  return (
    <section className="relative bg-white py-28 sm:py-36">
      {/* Subtle background pattern */}
      <div className="absolute inset-0 opacity-[0.02]" style={{
        backgroundImage: `radial-gradient(circle at 1px 1px, #0f172a 1px, transparent 0)`,
        backgroundSize: '32px 32px',
      }} />

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Section header */}
        <div className="mx-auto max-w-2xl text-center">
          <div className="mb-4 inline-flex items-center rounded-full bg-navy/5 px-4 py-1.5 text-sm font-medium text-navy">
            Why Choose Us
          </div>
          <h2 className="text-3xl font-bold tracking-tight text-navy sm:text-4xl lg:text-5xl">
            Why Motion Granted?
          </h2>
          <p className="mt-5 text-lg text-gray-600 sm:text-xl">
            Built for busy attorneys who need reliable support
          </p>
        </div>

        {/* Props grid */}
        <div className="mx-auto mt-20 max-w-6xl">
          <div className="grid gap-6 sm:grid-cols-2 lg:gap-8">
            {props.map((prop, index) => (
              <div
                key={prop.title}
                className="group relative overflow-hidden rounded-2xl border border-gray-100 bg-white p-8 shadow-sm transition-all duration-500 hover:-translate-y-1 hover:shadow-xl lg:p-10"
                style={{ animationDelay: `${index * 100}ms` }}
              >
                {/* Gradient background on hover */}
                <div className={`absolute inset-0 bg-gradient-to-br ${prop.gradient} opacity-0 transition-opacity duration-500 group-hover:opacity-100`} />

                {/* Content */}
                <div className="relative">
                  {/* Icon */}
                  <div className={`inline-flex h-14 w-14 items-center justify-center rounded-xl ${prop.iconBg} transition-transform duration-500 group-hover:scale-110`}>
                    <prop.icon className={`h-7 w-7 ${prop.iconColor}`} />
                  </div>

                  <h3 className="mt-6 text-xl font-semibold text-navy lg:text-2xl">
                    {prop.title}
                  </h3>
                  <p className="mt-3 text-gray-600 leading-relaxed lg:text-lg">
                    {prop.description}
                  </p>
                </div>

                {/* Decorative corner accent */}
                <div className="absolute -bottom-2 -right-2 h-24 w-24 rounded-full bg-gradient-to-br from-teal/5 to-transparent opacity-0 blur-2xl transition-opacity duration-500 group-hover:opacity-100" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
