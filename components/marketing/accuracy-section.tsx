import { Check } from 'lucide-react';

const accuracyPoints = [
  {
    title: 'Every citation checked for existence',
    description: 'confirmed against primary legal databases, not assumed.',
  },
  {
    title: 'Holdings verified for accuracy',
    description: 'we confirm the case actually says what we claim it says.',
  },
  {
    title: 'Subsequent history reviewed',
    description: 'overruled, distinguished, or questioned authority is caught before delivery.',
  },
  {
    title: 'Court-ready formatting',
    description: 'Bluebook citations, jurisdiction-specific local rules, complete filing packages.',
  },
];

const comparisonData = [
  { label: 'ChatGPT (GPT-4)', percentage: 69, variant: 'bad' as const },
  { label: 'Westlaw AI', percentage: 33, variant: 'bad' as const },
  { label: 'Lexis+ AI', percentage: 17, variant: 'warn' as const },
  { label: 'Motion Granted', percentage: 5, variant: 'good' as const, displayValue: '<0.1%', highlight: true },
];

export function AccuracySection() {
  return (
    <section className="section accuracy-section">
      <div className="section-inner">
        <div className="accuracy-grid">
          <div className="accuracy-content">
            <div className="section-label">Why Motion Granted</div>
            <h2 className="section-title">
              Accuracy you can<br />file with confidence.
            </h2>
            <p className="section-subtitle">
              Other AI legal tools hallucinate citations at alarming rates. We built
              something different — every authority is independently verified before
              it reaches your desk.
            </p>

            <div className="accuracy-points">
              {accuracyPoints.map((point) => (
                <div key={point.title} className="accuracy-point">
                  <div className="accuracy-check">
                    <Check className="w-3 h-3" />
                  </div>
                  <p>
                    <strong>{point.title}</strong> — {point.description}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="comparison-card">
            <div className="cc-header">
              <h4>AI Citation Error Rates</h4>
              <p>Documented hallucination rates by platform</p>
            </div>
            <div className="cc-body">
              <div className="cc-rows">
                {comparisonData.map((item, index) => (
                  <div key={item.label}>
                    {index === comparisonData.length - 1 && <div className="cc-divider" />}
                    <div className="cc-row">
                      <span
                        className="cc-label"
                        style={item.highlight ? { fontWeight: 700, color: 'var(--navy-700)' } : undefined}
                      >
                        {item.label}
                      </span>
                      <div className="cc-bar-track">
                        <div
                          className={`cc-bar-fill ${item.variant}`}
                          style={{ width: `${item.percentage}%` }}
                        >
                          {item.displayValue || `${item.percentage}%`}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <p className="cc-footnote">
                Sources: Stanford CodeX (2024), Yale/Stanford study on LLM hallucination.
                Motion Granted rate based on internal verification pipeline testing.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
