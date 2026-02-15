import { Header } from '@/components/layout/header'
import { Footer } from '@/components/layout/footer'

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div
      className="flex min-h-screen flex-col"
      style={{
        '--font-sans': '"DM Sans", system-ui, sans-serif',
        '--font-serif': '"Instrument Serif", Georgia, serif',
      } as React.CSSProperties}
    >
      {/* Google Fonts for Clay's approved design: Instrument Serif + DM Sans */}
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link
        href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,100..1000;1,9..40,100..1000&family=Instrument+Serif&display=swap"
        rel="stylesheet"
      />
      <Header />
      <main className="flex-1">{children}</main>
      <Footer />
    </div>
  )
}
