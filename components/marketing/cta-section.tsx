'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { ArrowRight, Sparkles } from 'lucide-react'
import { useScrollAnimation } from '@/hooks/use-scroll-animation'

export function CTASection() {
const { ref, isInView } = useScrollAnimation<HTMLDivElement>({ threshold: 0.2 })

return (
<section className="relative overflow-hidden bg-gradient-to-b from-white via-[#faf9f7] to-[#f8f7f4] py-28 sm:py-36">
{/* Decorative elements */}
<div className="absolute inset-0 overflow-hidden">
<div className="absolute top-0 left-1/2 -translate-x-1/2 h-px w-3/4 bg-gradient-to-r from-transparent via-gray-200 to-transparent" />
<div className="absolute -top-20 left-1/4 h-64 w-64 rounded-full bg-teal/5 blur-3xl" />
<div className="absolute -bottom-20 right-1/4 h-64 w-64 rounded-full bg-navy/5 blur-3xl" />
{/* Subtle dot pattern */}
<div className="absolute inset-0 opacity-[0.015]" style={{
backgroundImage: `radial-gradient(circle at 1px 1px, #0f172a 1px, transparent 0)`,
backgroundSize: '24px 24px',
}} />
</div>

<div ref={ref} className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
{/* CTA Card */}
<div className="mx-auto max-w-4xl">
<div 
className={`relative overflow-hidden rounded-3xl bg-gradient-to-br from-white via-white to-gray-50/80 p-10 shadow-2xl shadow-gray-200/50 ring-1 ring-gray-100 sm:p-16 transition-all duration-700 ${
isInView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
}`}
>
{/* Inner decorative gradient */}
<div className="absolute -top-24 -right-24 h-56 w-56 rounded-full bg-gradient-to-br from-teal/15 to-teal/5 blur-3xl" />
<div className="absolute -bottom-24 -left-24 h-56 w-56 rounded-full bg-gradient-to-tr from-navy/10 to-transparent blur-3xl" />

{/* Top accent bar */}
<div className="absolute top-0 left-1/2 -translate-x-1/2 h-1 w-32 rounded-b-full bg-gradient-to-r from-teal/50 via-teal to-teal/50" />

<div className="relative text-center">
{/* Icon badge */}
<div 
className={`mx-auto mb-6 inline-flex items-center justify-center h-14 w-14 rounded-2xl bg-teal/10 ring-1 ring-teal/20 transition-all duration-700 delay-100 ${
isInView ? 'opacity-100 scale-100' : 'opacity-0 scale-90'
}`}
>
<Sparkles className="h-7 w-7 text-teal" />
</div>

<h2 
className={`text-3xl font-bold tracking-tight text-navy sm:text-4xl lg:text-5xl transition-all duration-700 delay-150 ${
isInView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
}`}
>
Ready to delegate?
</h2>
<p 
className={`mx-auto mt-5 max-w-xl text-lg text-gray-600 sm:text-xl transition-all duration-700 delay-200 ${
isInView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
}`}
>
Join attorneys across Louisiana who trust Motion Granted for their motion drafting needs.
</p>
<div 
className={`mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row sm:gap-6 transition-all duration-700 delay-300 ${
isInView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
}`}
>
<Button 
size="xl" 
className="btn-premium group h-14 px-10 text-lg shadow-lg shadow-teal/25 ring-1 ring-teal/20" 
asChild
>
<Link href="/register">
Get Started
<ArrowRight className="ml-2 h-5 w-5 transition-transform group-hover:translate-x-1" />
</Link>
</Button>
<Button
variant="outline"
size="xl"
className="h-14 border-2 px-10 text-lg transition-all duration-300 hover:border-navy hover:bg-navy hover:text-white hover:shadow-lg"
asChild
>
<Link href="/pricing">View Pricing</Link>
</Button>
</div>
</div>
</div>
</div>
</div>
</section>
)
}
