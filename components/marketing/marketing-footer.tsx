import Link from 'next/link';

const footerSections = [
  {
    title: 'Services',
    links: [
      { href: '/pricing', label: 'Pricing' },
      { href: '/how-it-works', label: 'How It Works' },
      { href: '/faq', label: 'FAQ' },
    ],
  },
  {
    title: 'Company',
    links: [
      { href: '/about', label: 'About' },
      { href: '/contact', label: 'Contact' },
      { href: '/security', label: 'Security' },
    ],
  },
  {
    title: 'Legal',
    links: [
      { href: '/terms', label: 'Terms of Service' },
      { href: '/privacy', label: 'Privacy Policy' },
      { href: '/disclaimer', label: 'Disclaimer' },
      { href: '/dpa', label: 'Data Processing Agreement' },
    ],
  },
  {
    title: 'Get Started',
    links: [
      { href: '/register', label: 'Create Account' },
      { href: '/login', label: 'Sign In' },
      { href: '/dashboard', label: 'Client Portal' },
    ],
  },
];

export function MarketingFooter() {
  return (
    <footer>
      <div className="footer-inner">
        <div className="footer-grid">
          <div className="footer-brand-col">
            <div className="nav-brand" style={{ marginBottom: 0 }}>
              <div className="nav-logo">
                <svg viewBox="0 0 24 24">
                  <path
                    d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"
                    fill="#C9A227"
                  />
                </svg>
              </div>
              <span className="nav-wordmark" style={{ color: 'rgba(255,255,255,0.9)' }}>
                MOTION GRANTED
              </span>
            </div>
            <p>
              Court-ready litigation documents with verified citations.
              We draft. You review. You file.
            </p>
            <a href="mailto:support@motiongranted.com">support@motiongranted.com</a>
          </div>
          {footerSections.map((section) => (
            <div key={section.title} className="footer-col">
              <h4>{section.title}</h4>
              <ul>
                {section.links.map((link) => (
                  <li key={link.href}>
                    <Link href={link.href}>{link.label}</Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="footer-bottom">
          <span className="footer-copyright">
            &copy; 2026 Motion Granted, LLC. All rights reserved.
          </span>
          <span className="footer-disclaimer">
            Motion Granted is not a law firm and does not provide legal advice or
            representation. All work product is prepared under the direction and
            supervision of the hiring attorney, who remains responsible for all
            strategic decisions and court filings.
          </span>
        </div>
      </div>
    </footer>
  );
}
