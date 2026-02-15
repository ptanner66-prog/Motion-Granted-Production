// app/faq/page.tsx
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ChevronDown, ArrowRight } from 'lucide-react';

interface FAQItem {
  question: string;
  answer: string;
}

const FAQ_CATEGORIES: { name: string; items: FAQItem[] }[] = [
  {
    name: 'Getting Started',
    items: [
      {
        question: 'What is Motion Granted?',
        answer: 'Motion Granted is a legal process outsourcing (LPO) service that provides motion drafting support to solo practitioners and small law firms. We use AI-assisted drafting combined with attorney review to deliver court-ready motions at flat-fee pricing.',
      },
      {
        question: 'Is Motion Granted a law firm?',
        answer: 'No. Motion Granted is NOT a law firm and does not provide legal advice or legal representation. We provide drafting services under the direction and supervision of the hiring attorney. The attorney of record reviews all work product and assumes full responsibility for the final document filed with the court.',
      },
      {
        question: 'What jurisdictions do you serve?',
        answer: 'We currently serve Louisiana and California state courts, plus federal courts in the 5th and 9th Circuits. We plan to expand to additional states in 2026. All work product is prepared to comply with the local rules of the target jurisdiction.',
      },
      {
        question: 'How do I submit my first order?',
        answer: 'Click "Get Started" to create an account, then follow our 8-step intake wizard. You\'ll upload your case documents, describe the motion you need, select your deadline, and pay the flat fee. Our system handles the rest.',
      },
    ],
  },
  {
    name: 'Pricing & Payment',
    items: [
      {
        question: 'How is pricing determined?',
        answer: 'Pricing is based on motion complexity. Tier A ($150) covers simple procedural motions. Tier B ($350) covers standard substantive motions. Tier C ($850) covers complex multi-issue motions. Tier D ($1,500+) covers major dispositive motions like summary judgment. Rush delivery is available for an additional fee.',
      },
      {
        question: 'Are there any subscriptions or minimums?',
        answer: 'No. We operate on a per-order basis with flat-fee pricing. No subscriptions, no retainers, no minimum order requirements. You pay only for what you order.',
      },
      {
        question: 'What payment methods do you accept?',
        answer: 'We accept all major credit cards via Stripe. Payment is collected at the time of order submission. We do not currently accept ACH, wire transfers, or payment on account.',
      },
      {
        question: 'What if I\'m not satisfied with the work?',
        answer: 'Every order includes one revision at no additional charge. If the revision still doesn\'t meet your needs, contact us to discuss a refund. We want you to be satisfied with every order.',
      },
    ],
  },
  {
    name: 'Quality & Accuracy',
    items: [
      {
        question: 'How do you ensure citation accuracy?',
        answer: 'Every citation in our motions goes through a 7-step verification pipeline. We check case existence, extract holdings, analyze subsequent history, and flag any negative treatment. Our screening uses open-source legal databases and is not a substitute for Shepard\'s\u00AE or KeyCite\u00AE research.',
      },
      {
        question: 'Do attorneys review the AI-generated drafts?',
        answer: 'Yes. All work product is reviewed by a licensed attorney before delivery. The AI handles initial drafting and citation research; the attorney reviews for legal accuracy, proper argument structure, and compliance with local rules.',
      },
      {
        question: 'What is your turnaround time?',
        answer: 'Standard turnaround is 24-48 hours depending on motion complexity. Rush delivery (same-day or next-day) is available for an additional fee. Deadlines are guaranteed; if we can\'t meet your deadline, we\'ll tell you before you submit.',
      },
    ],
  },
  {
    name: 'Working With Us',
    items: [
      {
        question: 'What documents do I need to provide?',
        answer: 'At minimum: the operative complaint or petition, any relevant prior orders, and a brief description of what you need. For more complex motions, you may want to include discovery responses, deposition excerpts, or key exhibits. The more context you provide, the better the draft.',
      },
      {
        question: 'How do I communicate with the drafting team?',
        answer: 'Your order includes a secure client portal where you can upload documents, leave notes, and track status. For urgent questions, you can email us directly. We aim to respond to all inquiries within 4 business hours.',
      },
      {
        question: 'Can I request a specific attorney?',
        answer: 'We assign attorneys based on expertise and availability. While we can\'t guarantee a specific attorney, you can note preferences in your order and we\'ll accommodate when possible.',
      },
      {
        question: 'Is my case information confidential?',
        answer: 'Absolutely. All case information is protected by strict confidentiality agreements and industry-standard security measures. We never share client information with third parties except as required to complete your order.',
      },
    ],
  },
];

export default function FAQPage() {
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [openItems, setOpenItems] = useState<Set<string>>(new Set());

  const toggleItem = (id: string) => {
    setOpenItems(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const filteredCategories = activeCategory === 'all'
    ? FAQ_CATEGORIES
    : FAQ_CATEGORIES.filter(c => c.name === activeCategory);

  return (
    <div className="font-sans">
      {/* Page Header */}
      <section className="pt-32 pb-12 bg-gradient-to-b from-white to-slate-50">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <span className="text-sm font-bold text-[#C9A227] uppercase tracking-wider">
            FREQUENTLY ASKED QUESTIONS
          </span>
          <h1 className="font-serif text-5xl text-[#0F1F33] mt-3 mb-4">
            Questions? <em className="text-[#C9A227]">Answers.</em>
          </h1>
          <p className="text-lg text-slate-500">
            Everything you need to know about working with Motion Granted.
          </p>
        </div>
      </section>

      {/* Category Navigation */}
      <div className="max-w-4xl mx-auto px-6 -mt-6 mb-8">
        <div className="flex flex-wrap justify-center gap-2">
          <button
            onClick={() => setActiveCategory('all')}
            className={`px-5 py-2 rounded-full font-semibold text-sm transition-all ${
              activeCategory === 'all'
                ? 'bg-[#1E3A5F] text-white'
                : 'bg-white border border-slate-200 text-slate-600 hover:border-[#1E3A5F]'
            }`}
          >
            All
          </button>
          {FAQ_CATEGORIES.map(cat => (
            <button
              key={cat.name}
              onClick={() => setActiveCategory(cat.name)}
              className={`px-5 py-2 rounded-full font-semibold text-sm transition-all ${
                activeCategory === cat.name
                  ? 'bg-[#1E3A5F] text-white'
                  : 'bg-white border border-slate-200 text-slate-600 hover:border-[#1E3A5F]'
              }`}
            >
              {cat.name}
            </button>
          ))}
        </div>
      </div>

      {/* FAQ Content */}
      <section className="pb-20">
        <div className="max-w-3xl mx-auto px-6">
          {filteredCategories.map(category => (
            <div key={category.name} className="mb-10">
              <h2 className="font-serif text-2xl text-[#0F1F33] pb-4 border-b-2 border-[#C9A227] mb-4">
                {category.name}
              </h2>
              <div className="space-y-2">
                {category.items.map((item, idx) => {
                  const itemId = `${category.name}-${idx}`;
                  const isOpen = openItems.has(itemId);

                  return (
                    <div key={itemId} className="border-b border-slate-200">
                      <button
                        onClick={() => toggleItem(itemId)}
                        className="w-full py-5 flex items-center justify-between gap-4 text-left"
                      >
                        <span className="font-semibold text-[#0F1F33]">{item.question}</span>
                        <span className={`
                          w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 transition-all
                          ${isOpen ? 'bg-[#1E3A5F] text-white' : 'bg-slate-100 text-slate-400'}
                        `}>
                          <ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                        </span>
                      </button>
                      <div className={`overflow-hidden transition-all duration-300 ${
                        isOpen ? 'max-h-96 pb-5' : 'max-h-0'
                      }`}>
                        <p className="text-slate-600 leading-relaxed">{item.answer}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 bg-[#0F1F33]">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <h2 className="font-serif text-3xl text-white mb-4">
            Still have <em className="text-[#C9A227]">questions?</em>
          </h2>
          <p className="text-slate-300 mb-8">
            Contact us directly and we'll get back to you within 24 hours.
          </p>
          <div className="flex gap-4 justify-center">
            <Link
              href="/contact"
              className="inline-flex items-center gap-2 px-6 py-3 bg-white text-[#0F1F33] font-semibold rounded-lg hover:bg-slate-100 transition-colors"
            >
              Contact Us
            </Link>
            <Link
              href="/orders/new"
              className="inline-flex items-center gap-2 px-6 py-3 bg-[#C9A227] text-[#0F1F33] font-semibold rounded-lg hover:bg-[#D4B33A] transition-colors"
            >
              Get Started
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
