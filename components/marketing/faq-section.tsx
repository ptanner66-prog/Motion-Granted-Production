'use client'

import { useState } from 'react'
import { ChevronDown, HelpCircle } from 'lucide-react'

const faqs = [
  {
    question: "How do I know the citations are accurate?",
    answer: "Every citation is verified against our Verified Precedent Index (VPI)—a curated library of court-validated legal principles. We check that each authority exists, is accurately quoted, and remains good law. If our verification flags any issues, production stops and you're notified before receiving the draft."
  },
  {
    question: "What's included in a typical motion package?",
    answer: "A standard motion package includes the motion itself, memorandum of points and authorities, separate statement of facts (where required), proposed order, and all supporting declarations. You also receive the ABA 512 disclosure language and a verification report documenting our citation checking."
  },
  {
    question: "How fast can you turn around a rush order?",
    answer: "We offer 72-hour and 48-hour rush options for time-sensitive matters. Rush availability depends on current queue capacity—check the pricing page for real-time availability. Standard turnaround is 5 business days for most motion types."
  },
  {
    question: "Are you a law firm? Do you provide legal advice?",
    answer: "No. Motion Granted is a legal process outsourcing (LPO) company providing drafting support to licensed attorneys. We do not provide legal advice, create attorney-client relationships, or make strategic decisions about your case. You review all work product, exercise your professional judgment, and file under your name."
  },
  {
    question: "How does pricing work?",
    answer: "We use flat-fee pricing based on motion complexity, not hourly billing. You know your cost upfront before placing an order. This lets you quote fees to clients with confidence. See our pricing page for specific rates by motion type."
  },
  {
    question: "What jurisdictions do you cover?",
    answer: "We produce work product for all 50 states and federal courts. Each deliverable is formatted according to your specific court's local rules. Just tell us the jurisdiction and court when you submit your order."
  },
  {
    question: "What if I need revisions?",
    answer: "One round of revisions is included with every order. We want you satisfied with the final product. If the revision involves a material change to the scope or legal theory, we'll discuss it with you first."
  },
  {
    question: "How do you handle confidential case materials?",
    answer: "All case materials are processed in isolated environments. We don't use your data for training AI models. Data is scrubbed according to your retention preferences after delivery. Attorney-client privilege is preserved—we're simply your drafting vendor."
  },
]

export function FAQSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(0)

  return (
    <section className="bg-white py-20">
      <div className="max-w-4xl mx-auto px-6">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-3 mb-4">
            <HelpCircle className="w-5 h-5 text-gold" />
            <span className="text-xs font-bold uppercase tracking-[0.3em] text-gold">
              Common Questions
            </span>
          </div>
          <h2 className="font-serif text-3xl md:text-4xl text-navy">
            Frequently asked questions
          </h2>
        </div>

        {/* FAQ Accordion */}
        <div className="space-y-4">
          {faqs.map((faq, index) => (
            <div
              key={index}
              className="border border-navy/10 rounded-lg overflow-hidden"
            >
              <button
                onClick={() => setOpenIndex(openIndex === index ? null : index)}
                className="w-full px-6 py-5 text-left flex items-center justify-between gap-4 hover:bg-cream/50 transition-colors"
              >
                <span className="font-medium text-navy">{faq.question}</span>
                <ChevronDown
                  className={`w-5 h-5 text-gold flex-shrink-0 transition-transform duration-200 ${
                    openIndex === index ? 'rotate-180' : ''
                  }`}
                />
              </button>
              <div
                className={`overflow-hidden transition-all duration-300 ${
                  openIndex === index ? 'max-h-96' : 'max-h-0'
                }`}
              >
                <div className="px-6 pb-5 text-gray-600 leading-relaxed">
                  {faq.answer}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Contact CTA */}
        <div className="mt-12 text-center p-8 bg-cream rounded-lg">
          <p className="text-gray-600 mb-4">
            Still have questions? We&apos;re here to help.
          </p>
          <a
            href="mailto:support@motiongranted.com"
            className="text-navy font-medium hover:text-gold transition-colors"
          >
            Contact us at support@motiongranted.com
          </a>
        </div>
      </div>
    </section>
  )
}
