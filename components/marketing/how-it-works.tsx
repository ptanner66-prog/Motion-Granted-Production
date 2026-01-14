import { Upload, PenTool, CheckCircle } from 'lucide-react'

const steps = [
  {
    icon: Upload,
    title: 'Submit',
    description:
      'Tell us what you need. Upload your case documents, select your motion type, and provide your instructions.',
  },
  {
    icon: PenTool,
    title: 'We Draft',
    description:
      'Our law clerks prepare a polished draft based on your direction. Track progress in your dashboard.',
  },
  {
    icon: CheckCircle,
    title: 'You File',
    description:
      'Download, review, and file under your name. One round of revisions included.',
  },
]

export function HowItWorks() {
  return (
    <section className="bg-gray-50 py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Section header */}
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight text-navy sm:text-4xl">
            How It Works
          </h2>
          <p className="mt-4 text-lg text-gray-600">
            Three simple steps to professional motion drafts
          </p>
        </div>

        {/* Steps */}
        <div className="mx-auto mt-16 max-w-5xl">
          <div className="grid gap-8 sm:grid-cols-3">
            {steps.map((step, index) => (
              <div key={step.title} className="relative">
                {/* Connector line */}
                {index < steps.length - 1 && (
                  <div className="absolute left-1/2 top-12 hidden h-0.5 w-full bg-gray-200 sm:block" />
                )}

                <div className="relative flex flex-col items-center text-center">
                  {/* Step number and icon */}
                  <div className="relative">
                    <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white shadow-md ring-1 ring-gray-100">
                      <step.icon className="h-7 w-7 text-teal" />
                    </div>
                    <span className="absolute -right-2 -top-2 flex h-7 w-7 items-center justify-center rounded-full bg-navy text-sm font-bold text-white">
                      {index + 1}
                    </span>
                  </div>

                  {/* Content */}
                  <h3 className="mt-6 text-xl font-semibold text-navy">
                    {step.title}
                  </h3>
                  <p className="mt-2 text-gray-600 leading-relaxed">
                    {step.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
