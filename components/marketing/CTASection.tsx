import Link from 'next/link';
import { Check } from 'lucide-react';

interface CTASectionProps {
  title: string;
  subtitle?: string;
  primaryHref: string;
  primaryLabel: string;
  secondaryHref?: string;
  secondaryLabel?: string;
  reassurances?: string[];
}

export function CTASection({
  title,
  subtitle,
  primaryHref,
  primaryLabel,
  secondaryHref,
  secondaryLabel,
  reassurances,
}: CTASectionProps) {
  return (
    <section className="cta-section">
      <div className="section-inner" style={{ maxWidth: 600, textAlign: 'center' }}>
        <h2
          className="section-title"
          dangerouslySetInnerHTML={{ __html: title }}
        />
        {subtitle && <p className="section-subtitle">{subtitle}</p>}
        <div className="cta-buttons">
          <Link href={primaryHref} className="btn-gold">
            {primaryLabel} &rarr;
          </Link>
          {secondaryHref && secondaryLabel && (
            <Link href={secondaryHref} className="btn-outline-white">
              {secondaryLabel}
            </Link>
          )}
        </div>
        {reassurances && reassurances.length > 0 && (
          <div className="cta-reassurance">
            {reassurances.map((text) => (
              <span key={text}>
                <Check className="w-3.5 h-3.5" />
                {text}
              </span>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
