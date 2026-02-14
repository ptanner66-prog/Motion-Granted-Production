import Link from 'next/link'
import Image from 'next/image'

interface LogoProps {
  variant?: 'light' | 'dark'
  size?: 'sm' | 'md' | 'lg'
  className?: string
  href?: string
}

export function Logo({ variant = 'light', size = 'md', className, href = '/' }: LogoProps) {
  const sizes = {
    sm: { width: 160, height: 86 },
    md: { width: 220, height: 119 },
    lg: { width: 300, height: 162 },
  }

  const { width, height } = sizes[size]

  return (
    <Link href={href} className="inline-flex items-center">
      <Image
        src="/logo.jpg"
        alt="Motion Granted — For Solo Practitioners & Small Firms"
        width={width}
        height={height}
        className={`object-contain ${variant === 'dark' ? 'rounded-lg brightness-110' : ''} ${className || ''}`}
        priority
      />
    </Link>
  )
}

export function LogoIcon({ size = 32, className }: { size?: number, className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" className={className}>
      <rect x="0" y="0" width="32" height="32" rx="6" fill="#0f172a"/>
      <text x="50%" y="55%" dominantBaseline="middle" textAnchor="middle" fill="#c5a059" fontFamily="Georgia, serif" fontSize="16" fontWeight="bold">MG</text>
    </svg>
  )
}

export function LogoLarge({ className }: { className?: string }) {
  return (
    <Image
      src="/logo.jpg"
      alt="Motion Granted — For Solo Practitioners & Small Firms"
      width={500}
      height={270}
      className={`object-contain ${className || ''}`}
      priority
    />
  )
}
