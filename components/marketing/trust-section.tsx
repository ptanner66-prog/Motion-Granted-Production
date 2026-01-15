export function TrustSection() {
  return (
    <section className="relative overflow-hidden bg-navy py-28 sm:py-36">
      {/* Decorative background elements */}
      <div className="absolute inset-0 overflow-hidden">
        {/* Gradient orbs */}
        <div className="absolute -top-40 -left-40 h-80 w-80 rounded-full bg-teal/10 blur-3xl" />
        <div className="absolute -bottom-40 -right-40 h-80 w-80 rounded-full bg-teal/5 blur-3xl" />

        {/* Subtle pattern overlay */}
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
          }}
        />
      </div>

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          {/* Decorative accent line */}
          <div className="mb-8 flex justify-center">
            <div className="h-1 w-16 rounded-full bg-gradient-to-r from-teal/50 via-teal to-teal/50" />
          </div>

          <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl lg:text-5xl">
            Built for Solo Practitioners and Small Firms
          </h2>

          <div className="mt-10 space-y-6">
            <p className="text-lg leading-8 text-gray-300 sm:text-xl sm:leading-9">
              You don&apos;t have associates to delegate to. You don&apos;t have time to draft a
              20-page summary judgment brief while juggling court appearances, client
              calls, and discovery deadlines.
            </p>
            <p className="text-lg leading-8 text-gray-300 sm:text-xl sm:leading-9">
              That&apos;s where we come in.
            </p>
            <p className="text-lg leading-8 font-medium sm:text-xl sm:leading-9">
              <span className="text-gradient">
                Motion Granted gives you a reliable drafting team on demand—without the
                overhead of full-time staff.
              </span>
            </p>
          </div>

          {/* Decorative bottom accent */}
          <div className="mt-12 flex justify-center">
            <div className="flex items-center gap-3">
              <div className="h-px w-12 bg-gradient-to-r from-transparent to-teal/50" />
              <div className="h-2 w-2 rounded-full bg-teal/50" />
              <div className="h-px w-12 bg-gradient-to-l from-transparent to-teal/50" />
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
