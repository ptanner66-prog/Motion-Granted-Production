'use client'

import { useScrollAnimation } from '@/hooks/use-scroll-animation'
import { Quote } from 'lucide-react'

export function TrustSection() {
const { ref, isInView } = useScrollAnimation<HTMLDivElement>({ threshold: 0.2 })

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

<div ref={ref} className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
{/* Centered card container for visual interest */}
<div className="mx-auto max-w-4xl">
<div 
className={`relative rounded-3xl border border-white/10 bg-white/[0.03] p-10 backdrop-blur-sm sm:p-14 transition-all duration-700 ${
isInView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
}`}
>
{/* Quote icon */}
<div className="absolute -top-6 left-10 sm:left-14">
<div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-teal to-teal-dark shadow-lg">
<Quote className="h-6 w-6 text-white" />
</div>
</div>

<div className="text-center pt-4">
{/* Decorative accent line */}
<div className="mb-8 flex justify-center">
<div className="h-1 w-20 rounded-full bg-gradient-to-r from-teal/30 via-teal to-teal/30" />
</div>

<h2 
className={`text-3xl font-bold tracking-tight text-white sm:text-4xl lg:text-5xl transition-all duration-700 delay-100 ${
isInView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
}`}
>
Built for Solo Practitioners and Small Firms
</h2>

<div className="mt-10 space-y-6">
<p 
className={`text-lg leading-8 text-gray-300 sm:text-xl sm:leading-9 transition-all duration-700 delay-200 ${
isInView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
}`}
>
You don&apos;t have associates to delegate to. You don&apos;t have time to draft a
20-page summary judgment brief while juggling court appearances, client
calls, and discovery deadlines.
</p>
<p 
className={`text-lg leading-8 text-gray-300 sm:text-xl sm:leading-9 transition-all duration-700 delay-300 ${
isInView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
}`}
>
That&apos;s where we come in.
</p>
<p 
className={`text-lg leading-8 font-medium sm:text-xl sm:leading-9 transition-all duration-700 delay-400 ${
isInView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
}`}
>
<span className="text-gradient">
Motion Granted gives you a reliable drafting team on demand—without the
overhead of full-time staff.
</span>
</p>
</div>

{/* Decorative bottom accent */}
<div className="mt-12 flex justify-center">
<div className="flex items-center gap-3">
<div className="h-px w-16 bg-gradient-to-r from-transparent to-teal/50" />
<div className="h-2.5 w-2.5 rounded-full bg-teal/60 shadow-sm shadow-teal/30" />
<div className="h-px w-16 bg-gradient-to-l from-transparent to-teal/50" />
</div>
</div>
</div>
</div>
</div>
</div>
</section>
)
}
