import Link from 'next/link'
import { Logo } from '@/components/shared/logo'
import { siteConfig } from '@/config/site'

const footerLinks = {
  services: [
    { name: 'Pricing', href: '/pricing' },
    { name: 'How It Works', href: '/how-it-works' },
    { name: 'FAQ', href: '/faq' },
  ],
  company: [
    { name: 'About', href: '/about' },
    { name: 'Contact', href: '/contact' },
  ],
  legal: [
    { name: 'Terms of Service', href: '/terms' },
    { name: 'Privacy Policy', href: '/privacy' },
    { name: 'Disclaimer', href: '/disclaimer' },
  ],
}

export function Footer() {
  return (
    <footer className="bg-navy" aria-labelledby="footer-heading">
      <h2 id="footer-heading" className="sr-only">
        Footer
      </h2>
      <div className="mx-auto max-w-7xl px-4 pb-8 pt-16 sm:px-6 lg:px-8 lg:pt-24">
        <div className="xl:grid xl:grid-cols-3 xl:gap-8">
          {/* Logo and description */}
          <div className="space-y-8">
            <Logo variant="dark" size="md" />
            <p className="text-sm leading-6 text-gray-400">
              Professional motion drafting services for solo practitioners and small law firms.
              We draft. You review. You file.
            </p>
            <div className="text-sm text-gray-400">
              <p>{siteConfig.contact.email}</p>
              <p className="mt-1">{siteConfig.contact.phone}</p>
            </div>
          </div>

          {/* Links */}
          <div className="mt-16 grid grid-cols-2 gap-8 xl:col-span-2 xl:mt-0">
            <div className="md:grid md:grid-cols-2 md:gap-8">
              <div>
                <h3 className="text-sm font-semibold leading-6 text-white">Services</h3>
                <ul role="list" className="mt-6 space-y-4">
                  {footerLinks.services.map((item) => (
                    <li key={item.name}>
                      <Link
                        href={item.href}
                        className="text-sm leading-6 text-gray-400 hover:text-teal transition-colors"
                      >
                        {item.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="mt-10 md:mt-0">
                <h3 className="text-sm font-semibold leading-6 text-white">Company</h3>
                <ul role="list" className="mt-6 space-y-4">
                  {footerLinks.company.map((item) => (
                    <li key={item.name}>
                      <Link
                        href={item.href}
                        className="text-sm leading-6 text-gray-400 hover:text-teal transition-colors"
                      >
                        {item.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            <div className="md:grid md:grid-cols-2 md:gap-8">
              <div>
                <h3 className="text-sm font-semibold leading-6 text-white">Legal</h3>
                <ul role="list" className="mt-6 space-y-4">
                  {footerLinks.legal.map((item) => (
                    <li key={item.name}>
                      <Link
                        href={item.href}
                        className="text-sm leading-6 text-gray-400 hover:text-teal transition-colors"
                      >
                        {item.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="mt-10 md:mt-0">
                <h3 className="text-sm font-semibold leading-6 text-white">Get Started</h3>
                <ul role="list" className="mt-6 space-y-4">
                  <li>
                    <Link
                      href="/register"
                      className="text-sm leading-6 text-gray-400 hover:text-teal transition-colors"
                    >
                      Create Account
                    </Link>
                  </li>
                  <li>
                    <Link
                      href="/login"
                      className="text-sm leading-6 text-gray-400 hover:text-teal transition-colors"
                    >
                      Sign In
                    </Link>
                  </li>
                  <li>
                    <Link
                      href="/dashboard"
                      className="text-sm leading-6 text-gray-400 hover:text-teal transition-colors"
                    >
                      Client Portal
                    </Link>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="mt-16 border-t border-white/10 pt-8 sm:mt-20 lg:mt-24">
          <p className="text-xs leading-5 text-gray-400">
            &copy; {new Date().getFullYear()} Motion Granted, LLC. All rights reserved.
          </p>
          <p className="mt-2 text-xs leading-5 text-gray-500">
            Motion Granted is not a law firm and does not provide legal advice or representation.
            All work product is prepared under the direction and supervision of the hiring attorney.
          </p>
        </div>
      </div>
    </footer>
  )
}
