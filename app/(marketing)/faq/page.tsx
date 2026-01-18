import { Metadata } from 'next'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'

export const metadata: Metadata = {
  title: 'FAQ',
  description: 'Frequently asked questions about Motion Granted services.',
}

const faqCategories = [
  {
    title: 'General Questions',
    questions: [
      {
        q: 'What is Motion Granted?',
        a: 'Motion Granted is a legal process outsourcing company that provides motion drafting services to attorneys. We employ law clerks who prepare motion drafts under the direction and supervision of the hiring attorney. We are not a law firm and do not provide legal advice or representation.',
      },
      {
        q: 'Who prepares the work product?',
        a: 'All drafts are prepared by qualified law clerks with legal research and writing experience. Our clerks work under the direction you provide in your order instructions. You, as the hiring attorney, remain responsible for supervising the work product and making all legal and strategic decisions.',
      },
      {
        q: 'Is this the unauthorized practice of law?',
        a: 'No. Motion Granted functions similarly to an in-house law clerk or contract attorney working under your supervision. We prepare drafts based on your instructions and under your direction. You review, revise, and file all work product. We do not interact with your clients, appear in court, or make legal decisions. This arrangement is analogous to hiring any non-attorney support staff for drafting assistance.',
      },
      {
        q: 'What jurisdictions do you serve?',
        a: 'We currently serve attorneys practicing in Louisiana state and federal courts. We are expanding to additional jurisdictions—contact us if you practice elsewhere and would like to be notified when we expand.',
      },
    ],
  },
  {
    title: 'How It Works',
    questions: [
      {
        q: 'How do I place an order?',
        a: "Create an account, then use our intake form to select your motion type, provide case information, upload documents, and submit your instructions. Payment is collected at the time of order. You'll receive a confirmation email and can track your order status in your dashboard.",
      },
      {
        q: 'What information do I need to provide?',
        a: 'You\'ll need to provide: (1) Motion type and deadline, (2) Case information including court, case number, and parties, (3) Statement of facts and procedural history, (4) Your specific instructions on what arguments to make, and (5) Relevant case documents (complaint, answer, prior motions, discovery, etc.).',
      },
      {
        q: 'How long does it take?',
        a: 'Standard turnaround varies by motion complexity: Tier 1 (procedural) motions typically take 3-5 business days, Tier 2 (substantive) motions take 5-7 business days, and Tier 3 (complex) motions take 7-14 business days. Rush delivery is available for most orders at an additional charge.',
      },
      {
        q: 'Can I request rush delivery?',
        a: 'Yes. We offer 72-hour rush (+25%) and 48-hour rush (+50%) delivery for most motion types. Rush availability depends on current workload. If rush delivery is not available for your order, we will contact you.',
      },
    ],
  },
  {
    title: 'Your Responsibilities',
    questions: [
      {
        q: 'What is my role in the process?',
        a: 'You provide the case documents, facts, and drafting instructions. You also supervise the drafting process, review the completed draft, and ultimately file the motion under your name. You remain responsible for all legal judgment and client relationships.',
      },
      {
        q: 'Do I need to review the draft before filing?',
        a: 'Absolutely. You must review and approve all work product before filing. Our drafts are starting points—you should revise as necessary to reflect your professional judgment, verify all citations and facts, and ensure the arguments align with your case strategy.',
      },
      {
        q: 'Who is responsible for the accuracy of the work?',
        a: 'You are. While we strive for accuracy and quality, you are the supervising attorney. You must verify all facts, check all citations, and ensure the legal arguments are sound. We prepare drafts; you bear professional responsibility for anything filed with the court.',
      },
    ],
  },
  {
    title: 'Pricing and Payment',
    questions: [
      {
        q: 'How does pricing work?',
        a: 'We charge flat fees based on motion type. Prices are listed on our pricing page. There are no hourly fees or hidden charges. What you see is what you pay (plus any rush surcharge if applicable).',
      },
      {
        q: 'When is payment due?',
        a: 'Payment is due at the time of order submission. We accept all major credit cards via Stripe.',
      },
      {
        q: 'What if my matter is more complex than a standard motion?',
        a: 'If your matter requires substantially more work than a typical motion of that type, we may contact you to discuss a supplemental quote before proceeding. We will not charge additional fees without your approval.',
      },
      {
        q: 'Do you offer refunds?',
        a: 'We do not offer refunds for completed work. If we are unable to complete your order for any reason, we will provide a full refund. If you are dissatisfied with the quality of a draft, please contact support.',
      },
    ],
  },
  {
    title: 'Documents and Delivery',
    questions: [
      {
        q: 'What file formats do you deliver?',
        a: 'We deliver Microsoft Word documents (.docx) so you can easily make edits before filing.',
      },
      {
        q: 'How do I receive my completed draft?',
        a: 'Completed drafts are uploaded to your order in the client portal. You will receive an email notification when your draft is ready for download.',
      },
      {
        q: 'Can I communicate with the clerk working on my matter?',
        a: 'Yes. Each order has a messaging feature that allows you to communicate with your assigned clerk. Use this for clarifications or to provide additional information.',
      },
    ],
  },
  {
    title: 'Confidentiality and Security',
    questions: [
      {
        q: 'Is my case information confidential?',
        a: 'Yes. All staff are bound by confidentiality obligations. We treat your case information with the same care you would expect from any professional legal service provider.',
      },
      {
        q: 'How do you handle conflicts of interest?',
        a: 'We maintain a conflicts database and check all new orders against it. If a potential conflict is identified, we will notify you and either obtain appropriate waivers or decline the engagement.',
      },
      {
        q: 'How is my data secured?',
        a: 'We use industry-standard security measures including encrypted data transmission (SSL/TLS), secure cloud storage, and access controls. Our platform is built on trusted infrastructure providers.',
      },
    ],
  },
  {
    title: 'Account and Support',
    questions: [
      {
        q: 'How do I create an account?',
        a: "Click \"Get Started\" and complete the registration form. You'll need to provide your bar number and state(s) of licensure. Account creation is free—you only pay when you place an order.",
      },
      {
        q: 'What if I have questions not answered here?',
        a: 'Contact us at support@motiongranted.com or use the contact form on our website. We typically respond within one business day.',
      },
    ],
  },
]

export default function FAQPage() {
  return (
    <div className="bg-white">
      {/* Header */}
      <section className="bg-gray-50 py-16 sm:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <h1 className="text-4xl font-bold tracking-tight text-navy sm:text-5xl">
              Frequently Asked Questions
            </h1>
            <p className="mt-6 text-lg text-gray-600">
              Everything you need to know about Motion Granted
            </p>
          </div>
        </div>
      </section>

      {/* FAQ Content */}
      <section className="py-16 sm:py-24">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
          {faqCategories.map((category) => (
            <div key={category.title} className="mb-12">
              <h2 className="text-2xl font-bold text-navy mb-6">{category.title}</h2>
              <Accordion type="single" collapsible className="w-full">
                {category.questions.map((faq, index) => (
                  <AccordionItem key={index} value={`${category.title}-${index}`}>
                    <AccordionTrigger className="text-left text-navy">
                      {faq.q}
                    </AccordionTrigger>
                    <AccordionContent>{faq.a}</AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </div>
          ))}
        </div>
      </section>

      {/* Contact CTA */}
      <section className="bg-gray-50 py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-2xl font-bold text-navy">Still have questions?</h2>
            <p className="mt-4 text-gray-600">
              We&apos;re here to help. Contact us and we&apos;ll get back to you within one business day.
            </p>
            <div className="mt-8">
              <Button size="lg" asChild>
                <Link href="/contact">Contact Us</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
