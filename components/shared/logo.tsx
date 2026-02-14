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
    sm: { width: 160, height: 25 },
    md: { width: 220, height: 34 },
    lg: { width: 300, height: 46 },
  }

  const { width, height } = sizes[size]

  return (
    <Link href={href} className="inline-flex items-center">
      {variant === 'dark' ? (
        <span className="inline-block rounded-md bg-white/10 px-2 py-1.5">
          <Image
            src="/logo.png"
            alt="Motion Granted — For Solo Practitioners & Small Firms"
            width={width}
            height={height}
            className={`object-contain brightness-[1.8] ${className || ''}`}
            priority
          />
        </span>
      ) : (
        <Image
          src="/logo.png"
          alt="Motion Granted — For Solo Practitioners & Small Firms"
          width={width}
          height={height}
          className={`object-contain ${className || ''}`}
          priority
        />
      )}
    </Link>
  )
}

export function LogoIcon({ size = 32, className }: { size?: number, className?: string }) {
  return (
    <Image
      src="/logo-icon.png"
      alt="Motion Granted"
      width={size}
      height={size}
      className={`object-contain ${className || ''}`}
    />
  )
}

export function LogoLarge({ className }: { className?: string }) {
  return (
    <Image
      src="/logo.png"
      alt="Motion Granted — For Solo Practitioners & Small Firms"
      width={500}
      height={77}
      className={`object-contain ${className || ''}`}
      priority
    />
  )
}
