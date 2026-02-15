import { MarketingNav } from '@/components/marketing/marketing-nav'
import { MarketingFooter } from '@/components/marketing/marketing-footer'
import './marketing.css'

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div
      style={{
        fontFamily: 'var(--font-body)',
      }}
    >
      {/* Google Fonts for approved design: Instrument Serif + DM Sans */}
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link
        href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,100..1000;1,9..40,100..1000&family=Instrument+Serif&display=swap"
        rel="stylesheet"
      />
      <MarketingNav />
      <main>{children}</main>
      <MarketingFooter />
    </div>
  )
}
