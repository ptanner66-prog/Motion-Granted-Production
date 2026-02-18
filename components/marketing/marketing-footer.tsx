import Link from 'next/link';
import { Logo } from '@/components/shared/logo';

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
            <Logo variant="dark" size="md" />
            <p>
              Court-ready litigation documents with verified citations.
              We draft. You review. You file.
            </p>
            <a href="mailto:support@motion-granted.com">support@motion-granted.com</a>
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
