'use client';

import Link from 'next/link';

export function HeroSection() {
  return (
    <section className="hero">
      <div className="hero-inner">
        <div className="hero-content">
          <div className="hero-badge animate-in">Accepting new clients</div>
          <h1 className="animate-in delay-1">
            Court-ready motions.<br />
            <em>Every citation verified.</em>
          </h1>
          <p className="hero-sub animate-in delay-2">
            Complete filing packages delivered to your inbox — motions, memoranda,
            declarations, and proposed orders — with every authority independently
            verified against primary sources.
          </p>
          <div className="hero-ctas animate-in delay-3">
            <Link href="/register" className="btn-gold">
              Start Your First Order &rarr;
            </Link>
            <Link href="/pricing" className="btn-outline">
              View Pricing
            </Link>
          </div>
          <div className="hero-proof animate-in delay-4">
            <div className="hero-proof-item">
              <strong>&lt; 0.1%</strong>
              <span>Hallucination rate</span>
            </div>
            <div className="hero-proof-item">
              <strong>3 Days</strong>
              <span>Standard delivery</span>
            </div>
            <div className="hero-proof-item">
              <strong>From $299</strong>
              <span>Flat-fee pricing</span>
            </div>
            <div className="hero-proof-item">
              <strong>50 States</strong>
              <span>Federal &amp; state courts</span>
            </div>
          </div>
        </div>

        <div className="hero-visual animate-in delay-3">
          <div className="doc-float-1">
            <div className="doc-float-label">Supporting Document</div>
            <div className="doc-float-title">Declaration of J. Smith</div>
            <div className="doc-float-meta">3 pages &bull; Verified</div>
          </div>
          <div className="doc-float-2">
            <div className="doc-float-label">Proposed</div>
            <div className="doc-float-title">Order Granting MSJ</div>
            <div className="doc-float-meta">Court-formatted</div>
          </div>
          <div className="doc-stack">
            <div className="doc-page">
              <div className="doc-page-header">
                <div className="doc-page-header-left">
                  <DocumentIcon />
                  <span>Motion for Summary Judgment</span>
                </div>
                <div className="doc-verified-badge">
                  <CheckIcon />
                  All Citations Verified
                </div>
              </div>
              <div className="doc-page-body">
                <div className="doc-caption">
                  <div className="court">United States District Court — Eastern District</div>
                  <div className="title">Defendant&apos;s Motion for Summary Judgment</div>
                  <div className="case-no">Civil Action No. 25-XXXXX</div>
                </div>
                <div className="doc-lines">
                  <div className="doc-line w-full" />
                  <div className="doc-line w-90" />
                  <div className="doc-line w-full" />
                  <div className="doc-line w-80" />
                </div>
                <div className="doc-citation-row">
                  <span className="cite-text">
                    Anderson v. Liberty Lobby, Inc., 477 U.S. 242, 255 (1986)
                  </span>
                  <span className="cite-check">
                    <CheckIcon />
                  </span>
                </div>
                <div className="doc-lines" style={{ marginTop: '0.75rem' }}>
                  <div className="doc-line w-full" />
                  <div className="doc-line w-70" />
                  <div className="doc-line w-90" />
                </div>
                <div className="doc-citation-row">
                  <span className="cite-text">
                    Celotex Corp. v. Catrett, 477 U.S. 317 (1986)
                  </span>
                  <span className="cite-check">
                    <CheckIcon />
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function DocumentIcon() {
  return (
    <svg className="doc-icon" viewBox="0 0 24 24">
      <path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm-1 7V3.5L18.5 9H13zM6 20V4h6v6h6v10H6z" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor">
      <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" />
    </svg>
  );
}
