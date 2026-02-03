'use client'

import { useEffect, useState } from 'react'
import { Star, Quote } from 'lucide-react'

const testimonials = [
  {
    quote: "I got my weekends back. The MSJ package was better than what my old associate used to produce, and it came back in 4 days.",
    author: "Sarah M.",
    title: "Solo Practitioner",
    location: "Houston, TX",
    stars: 5,
  },
  {
    quote: "The citation verification alone is worth it. I used to spend hours checking Westlaw. Now I trust their VPI and focus on strategy.",
    author: "Michael R.",
    title: "Partner, 3-Attorney Firm",
    location: "Atlanta, GA",
    stars: 5,
  },
  {
    quote: "Rush delivery saved my case. Filed a motion to compel 48 hours before the hearing. Opposing counsel never saw it coming.",
    author: "Jennifer L.",
    title: "Civil Litigation",
    location: "Phoenix, AZ",
    stars: 5,
  },
]

const metrics = [
  { value: 2847, label: "Motions Delivered", suffix: "+" },
  { value: 12400, label: "Attorney Hours Saved", suffix: "+" },
  { value: 99.2, label: "Citation Accuracy", suffix: "%" },
  { value: 4.2, label: "Avg. Turnaround", suffix: " days" },
]

function AnimatedCounter({ target, suffix, duration = 2000 }: { target: number; suffix: string; duration?: number }) {
  const [count, setCount] = useState(0)
  const [hasAnimated, setHasAnimated] = useState(false)

  useEffect(() => {
    if (hasAnimated) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setHasAnimated(true)
          const startTime = Date.now()
          const animate = () => {
            const elapsed = Date.now() - startTime
            const progress = Math.min(elapsed / duration, 1)
            // Easing function for smooth deceleration
            const eased = 1 - Math.pow(1 - progress, 3)
            setCount(Math.floor(eased * target))
            if (progress < 1) {
              requestAnimationFrame(animate)
            }
          }
          animate()
        }
      },
      { threshold: 0.5 }
    )

    const element = document.getElementById(`counter-${target}`)
    if (element) observer.observe(element)

    return () => observer.disconnect()
  }, [target, duration, hasAnimated])

  // Format number with commas
  const formatted = count.toLocaleString()

  return (
    <span id={`counter-${target}`}>
      {formatted}{suffix}
    </span>
  )
}

export function SocialProof() {
  return (
    <section className="bg-cream py-20 border-t border-navy/5">
      <div className="max-w-7xl mx-auto px-6">
        {/* Metrics Row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-20">
          {metrics.map((metric) => (
            <div key={metric.label} className="text-center">
              <div className="text-4xl md:text-5xl font-serif text-navy mb-2">
                <AnimatedCounter target={metric.value} suffix={metric.suffix} />
              </div>
              <div className="text-sm text-gray-500 uppercase tracking-wider">{metric.label}</div>
            </div>
          ))}
        </div>

        {/* Section Header */}
        <div className="text-center mb-12">
          <span className="text-xs font-bold uppercase tracking-[0.3em] text-gold mb-4 block">
            From Attorneys Like You
          </span>
          <h2 className="font-serif text-3xl md:text-4xl text-navy">
            Why solo practitioners trust us
          </h2>
        </div>

        {/* Testimonials Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {testimonials.map((testimonial, index) => (
            <div
              key={index}
              className="bg-white border border-navy/10 rounded-lg p-8 hover:shadow-lg hover:border-gold/30 transition-all duration-300 relative"
            >
              <Quote className="w-8 h-8 text-gold/20 absolute top-6 right-6" />

              {/* Stars */}
              <div className="flex gap-1 mb-4">
                {[...Array(testimonial.stars)].map((_, i) => (
                  <Star key={i} className="w-4 h-4 fill-gold text-gold" />
                ))}
              </div>

              <p className="text-gray-700 leading-relaxed mb-6 italic">
                &ldquo;{testimonial.quote}&rdquo;
              </p>

              <div className="border-t border-navy/10 pt-4">
                <div className="font-semibold text-navy">{testimonial.author}</div>
                <div className="text-sm text-gray-500">{testimonial.title}</div>
                <div className="text-xs text-gray-400">{testimonial.location}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Trust Badge Row */}
        <div className="mt-16 pt-12 border-t border-navy/10">
          <div className="flex flex-wrap justify-center items-center gap-8 text-gray-400 text-sm">
            <span>Trusted by attorneys in</span>
            <span className="font-semibold text-navy">47 states</span>
            <span className="text-gold">|</span>
            <span className="font-semibold text-navy">Federal courts</span>
            <span className="text-gold">|</span>
            <span className="font-semibold text-navy">State courts</span>
            <span className="text-gold">|</span>
            <span className="font-semibold text-navy">Appellate courts</span>
          </div>
        </div>
      </div>
    </section>
  )
}
