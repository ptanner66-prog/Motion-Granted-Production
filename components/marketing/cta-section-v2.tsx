import Link from 'next/link';
import { Check } from 'lucide-react';

const reassurances = [
  'No retainer required',
  'Flat-fee pricing',
  'Every citation verified',
  'One revision included',
];

export function CTASectionV2() {
  return (
    <section className="cta-section">
      <div className="section-inner">
        <h2 className="section-title">Stop the Sunday night research.</h2>
        <p className="section-subtitle">
          Your next motion doesn&apos;t have to cost you a weekend.
          Delegate the drafting. Keep your evenings.
        </p>
        <div className="cta-buttons">
          <Link href="/register" className="btn-gold">
            Start Your First Order &rarr;
          </Link>
          <Link href="/pricing" className="btn-outline-white">
            View Pricing
          </Link>
        </div>
        <div className="cta-reassurance">
          {reassurances.map((text) => (
            <span key={text}>
              <Check className="w-3.5 h-3.5" />
              {text}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
