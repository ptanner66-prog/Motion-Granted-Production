'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Check, Clock } from 'lucide-react';
import { SectionHeader } from '@/components/marketing/SectionHeader';
import { CTASection } from '@/components/marketing/CTASection';

const tiers = [
  {
    tier: 'A',
    price: 299,
    laPrice: 254,
    subtitle: 'Simple Procedural Motions',
    turnaround: '2–3 business days',
    description:
      'Motions that primarily address procedural or scheduling matters with established standards.',
    examples: [
      'Motion to Continue',
      'Motion to Extend Deadline',
      'Motion to Seal',
      'Motion to Relate Cases',
      'Motion to Set for Trial',
    ],
  },
  {
    tier: 'B',
    price: 599,
    laPrice: 509,
    subtitle: 'Intermediate Motions',
    turnaround: '3–4 business days',
    description:
      'Substantive motions requiring legal argument on established issues with moderate complexity.',
    examples: [
      'Motion to Compel Discovery',
      'Motion for Protective Order',
      'Declinatory / Dilatory Exceptions',
      'Peremptory Exception — No Cause of Action',
      'Motion in Limine (single issue)',
    ],
    featured: true,
  },
  {
    tier: 'C',
    price: 999,
    laPrice: 849,
    subtitle: 'Complex Motions',
    turnaround: '4–5 business days',
    description:
      'Multi-issue motions involving novel arguments, extensive authority research, or complex procedural history.',
    examples: [
      'Motion in Limine (complex / multiple)',
      'Anti-SLAPP Motion',
      'Motion for JNOV',
      'Motion for New Trial',
      'Motion for Sanctions (complex)',
    ],
  },
  {
    tier: 'D',
    price: 1499,
    laPrice: 1274,
    subtitle: 'High-Stakes / Dispositive Motions',
    turnaround: '5–7 business days',
    description:
      'Major dispositive motions requiring extensive research, detailed fact analysis, and comprehensive briefing.',
    examples: [
      'Motion for Summary Judgment',
      'Motion for Partial Summary Judgment',
      'Motion for Class Certification',
      'Motion for Preliminary Injunction',
      'Daubert / Sargent Motion',
    ],
  },
];

const rushOptions = [
  {
    name: '48-Hour Rush',
    turnaround: 'Delivered within 48 hours',
    surcharge: '+25%',
  },
  {
    name: '24-Hour Rush',
    turnaround: 'Delivered within 24 hours',
    surcharge: '+50%',
  },
];

const included = [
  'Full draft motion & memorandum of points and authorities',
  'Every citation independently verified',
  'Court-specific formatting and local rule compliance',
  'Declaration / affidavit template',
  'Proposed order',
  'ABA Opinion 512 AI-assistance disclosure',
  'One round of revisions at no additional cost',
  'Delivery via secure client portal (DOCX + PDF)',
];

const comparisonRows = [
  {
    category: 'Simple Procedural Motion',
    mg: '$299',
    attorney: '$1,500–$3,000',
    diy: '8–12 hours',
  },
  {
    category: 'Intermediate Motion',
    mg: '$599',
    attorney: '$3,000–$6,000',
    diy: '15–25 hours',
  },
  {
    category: 'Complex Motion',
    mg: '$999',
    attorney: '$6,000–$12,000',
    diy: '25–40 hours',
  },
  {
    category: 'Summary Judgment',
    mg: '$1,499',
    attorney: '$10,000–$25,000',
    diy: '40–80 hours',
  },
];

export default function PricingPage() {
  const [showLA, setShowLA] = useState(false);

  return (
    <>
      {/* ── Hero ── */}
      <section className="page-hero page-hero--light">
        <div className="section-inner">
          <div className="section-label">Pricing</div>
          <h1 className="section-title">
            Flat-fee pricing. No hourly billing, no estimates.
          </h1>
          <p className="section-subtitle">
            Know your cost before you submit. Every order includes citation
            verification, court-specific formatting, and one revision.
          </p>
        </div>
      </section>

      {/* ── Pricing Grid ── */}
      <section className="section">
        <div className="section-inner" style={{ maxWidth: 1200 }}>
          {/* Louisiana toggle */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'center',
              marginBottom: '2rem',
            }}
          >
            <button
              onClick={() => setShowLA(!showLA)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.625rem',
                padding: '0.625rem 1.25rem',
                borderRadius: '100px',
                border: showLA
                  ? '2px solid var(--gold-500)'
                  : '2px solid var(--slate-200)',
                background: showLA
                  ? 'rgba(201,162,39,0.08)'
                  : 'var(--white)',
                cursor: 'pointer',
                fontSize: '0.85rem',
                fontWeight: 600,
                color: showLA ? 'var(--gold-600)' : 'var(--slate-500)',
                transition: 'all 0.2s',
              }}
            >
              <span style={{ fontSize: '1.1rem' }}>⚜️</span>
              Louisiana attorneys — 15% off every tier
            </button>
          </div>

          <div className="pricing-grid">
            {tiers.map((t) => (
              <div
                key={t.tier}
                className={`pricing-card${t.featured ? ' pricing-card--featured' : ''}`}
              >
                {t.featured && (
                  <div className="pricing-card-badge">Most Popular</div>
                )}
                <div className="pricing-card-body">
                  <div className="pricing-card-tier">Tier {t.tier}</div>
                  <div className="pricing-card-price">
                    ${showLA ? t.laPrice.toLocaleString() : t.price.toLocaleString()}
                    {showLA && (
                      <span className="la-price">
                        LA price (15% off ${t.price.toLocaleString()})
                      </span>
                    )}
                  </div>
                  <div className="pricing-card-subtitle">{t.subtitle}</div>
                  <div className="pricing-card-desc">{t.description}</div>
                  <ul className="pricing-card-features">
                    {t.examples.map((ex) => (
                      <li key={ex}>
                        <Check />
                        {ex}
                      </li>
                    ))}
                  </ul>
                  <div
                    style={{
                      fontSize: '0.75rem',
                      color: 'var(--slate-400)',
                      marginBottom: '1rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.35rem',
                    }}
                  >
                    <Clock className="w-3.5 h-3.5" />
                    {t.turnaround}
                  </div>
                  <Link
                    href="/register"
                    className={`pricing-card-btn ${t.featured ? 'pricing-card-btn--gold' : 'pricing-card-btn--outline'}`}
                  >
                    Get Started
                  </Link>
                </div>
              </div>
            ))}
          </div>

          {/* Louisiana Banner */}
          <div className="la-banner">
            <div className="la-banner-icon">⚜️</div>
            <div>
              <strong>Louisiana attorneys — 15% off every tier</strong>
              <span>
                We&rsquo;re headquartered in Louisiana and offer a hometown discount on
                every order. The discount is applied automatically at checkout.
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* ── Rush Pricing ── */}
      <section className="section" style={{ background: 'var(--slate-50)' }}>
        <div className="section-inner" style={{ maxWidth: 720 }}>
          <SectionHeader
            label="Rush Delivery"
            title="Deadline approaching?"
            subtitle="Rush delivery is available for time-sensitive matters. The surcharge is applied to your tier price."
            center
          />
          <div
            style={{
              marginTop: '2rem',
              background: 'var(--white)',
              borderRadius: '14px',
              border: '1px solid var(--slate-200)',
              overflow: 'hidden',
            }}
          >
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr
                  style={{
                    background: 'var(--slate-50)',
                    borderBottom: '1px solid var(--slate-200)',
                  }}
                >
                  <th
                    style={{
                      padding: '0.875rem 1.5rem',
                      textAlign: 'left',
                      fontSize: '0.8rem',
                      fontWeight: 600,
                      color: 'var(--slate-500)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                    }}
                  >
                    Rush Option
                  </th>
                  <th
                    style={{
                      padding: '0.875rem 1.5rem',
                      textAlign: 'left',
                      fontSize: '0.8rem',
                      fontWeight: 600,
                      color: 'var(--slate-500)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                    }}
                  >
                    Turnaround
                  </th>
                  <th
                    style={{
                      padding: '0.875rem 1.5rem',
                      textAlign: 'left',
                      fontSize: '0.8rem',
                      fontWeight: 600,
                      color: 'var(--slate-500)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                    }}
                  >
                    Surcharge
                  </th>
                </tr>
              </thead>
              <tbody>
                {rushOptions.map((r) => (
                  <tr
                    key={r.name}
                    style={{ borderBottom: '1px solid var(--slate-100)' }}
                  >
                    <td
                      style={{
                        padding: '1rem 1.5rem',
                        fontWeight: 600,
                        fontSize: '0.9rem',
                        color: 'var(--navy-800)',
                      }}
                    >
                      {r.name}
                    </td>
                    <td
                      style={{
                        padding: '1rem 1.5rem',
                        fontSize: '0.9rem',
                        color: 'var(--slate-500)',
                      }}
                    >
                      {r.turnaround}
                    </td>
                    <td
                      style={{
                        padding: '1rem 1.5rem',
                        fontWeight: 700,
                        fontSize: '0.9rem',
                        color: 'var(--gold-600)',
                      }}
                    >
                      {r.surcharge}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ── What's Included ── */}
      <section className="section">
        <div className="section-inner" style={{ maxWidth: 720 }}>
          <SectionHeader
            label="What&rsquo;s Included"
            title="Everything you need to file."
            subtitle="Every order — regardless of tier — includes the full package."
            center
          />
          <ul
            style={{
              marginTop: '2rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.75rem',
              listStyle: 'none',
            }}
          >
            {included.map((item) => (
              <li
                key={item}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '0.75rem',
                  fontSize: '0.95rem',
                  color: 'var(--slate-700)',
                  lineHeight: 1.6,
                }}
              >
                <Check
                  className="w-5 h-5"
                  style={{
                    color: 'var(--green-500)',
                    flexShrink: 0,
                    marginTop: '2px',
                  }}
                />
                {item}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ── Cost Comparison ── */}
      <section className="section" style={{ background: 'var(--slate-50)' }}>
        <div className="section-inner" style={{ maxWidth: 900 }}>
          <SectionHeader
            label="Cost Comparison"
            title="See what you save."
            subtitle="Motion Granted vs. hiring an associate or drafting it yourself."
            center
          />
          <div
            style={{
              marginTop: '2rem',
              borderRadius: '14px',
              overflow: 'hidden',
              border: '1px solid var(--slate-200)',
            }}
          >
            <table className="comparison-table">
              <thead>
                <tr>
                  <th>Motion Type</th>
                  <th className="highlight-col">Motion Granted</th>
                  <th>Hire an Attorney</th>
                  <th>Draft It Yourself</th>
                </tr>
              </thead>
              <tbody>
                {comparisonRows.map((row) => (
                  <tr key={row.category}>
                    <td style={{ fontWeight: 600, color: 'var(--navy-800)' }}>
                      {row.category}
                    </td>
                    <td className="highlight-col">{row.mg}</td>
                    <td>{row.attorney}</td>
                    <td>{row.diy}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p
            style={{
              marginTop: '1rem',
              fontSize: '0.75rem',
              color: 'var(--slate-400)',
              textAlign: 'center',
              lineHeight: 1.6,
            }}
          >
            Attorney estimates based on national averages for associate billing
            at $250–$450/hr. &ldquo;Draft It Yourself&rdquo; reflects typical
            attorney time investment for research + drafting.
          </p>
        </div>
      </section>

      {/* ── CTA ── */}
      <CTASection
        title="Ready to submit your first matter?"
        subtitle="Create an account in 60 seconds. No retainer. No commitment. Just court-ready motions."
        primaryHref="/register"
        primaryLabel="Get Started"
        secondaryHref="/how-it-works"
        secondaryLabel="How It Works"
        reassurances={[
          'No retainer required',
          'Flat-fee pricing',
          'Every citation verified',
          'One revision included',
        ]}
      />
    </>
  );
}
