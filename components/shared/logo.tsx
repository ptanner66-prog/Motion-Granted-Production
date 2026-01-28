import Link from 'next/link'

interface LogoProps {
  variant?: 'light' | 'dark'
  size?: 'sm' | 'md' | 'lg'
  className?: string
  href?: string
}

export function Logo({ variant = 'light', size = 'md', className, href = '/' }: LogoProps) {
  const sizes = {
    sm: { width: 180, height: 30 },
    md: { width: 240, height: 40 },
    lg: { width: 300, height: 50 },
  }

  const { width, height } = sizes[size]

  return (
    <Link href={href} className="inline-flex items-center">
      {variant === 'light' ? (
        <svg width={width} height={height} viewBox="0 0 300 50" xmlns="http://www.w3.org/2000/svg" className={className}>
          <rect x="0" y="3" width="44" height="44" rx="8" fill="#0f172a"/>
          <path d="M12 25 L17 30 L30 17" stroke="#00d4aa" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
          <text x="56" y="33" fontFamily="var(--font-geist-sans), Inter, system-ui, sans-serif" fontSize="22" fontWeight="700" fill="#0f172a">
            MOTION <tspan fill="#00d4aa">GRANTED</tspan>
          </text>
        </svg>
      ) : (
        <svg width={width} height={height} viewBox="0 0 300 50" xmlns="http://www.w3.org/2000/svg" className={className}>
          <rect x="0" y="3" width="44" height="44" rx="8" fill="#00d4aa"/>
          <path d="M12 25 L17 30 L30 17" stroke="#0f172a" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
          <text x="56" y="33" fontFamily="var(--font-geist-sans), Inter, system-ui, sans-serif" fontSize="22" fontWeight="700" fill="#ffffff">
            MOTION <tspan fill="#00d4aa">GRANTED</tspan>
          </text>
        </svg>
      )}
    </Link>
  )
}

export function LogoIcon({ size = 32, className }: { size?: number, className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" className={className}>
      <rect x="0" y="0" width="32" height="32" rx="6" fill="#0f172a"/>
      <path d="M8 16 L13 21 L24 10" stroke="#00d4aa" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
    </svg>
  )
}

export function LogoLarge({ className }: { className?: string }) {
  return (
    <svg width={512} height={512} viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg" className={className}>
      <rect x="0" y="0" width="512" height="512" rx="93" fill="#0f172a"/>
      <path d="M140 256 L198 314 L372 140" stroke="#00d4aa" strokeWidth="48" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
    </svg>
  )
}
