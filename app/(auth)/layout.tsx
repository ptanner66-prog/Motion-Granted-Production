import Link from 'next/link'
import { Logo } from '@/components/shared/logo'

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-4 py-12 sm:px-6 lg:px-8">
      <div className="w-full max-w-md space-y-8">
        <div className="flex justify-center">
          <Logo size="md" />
        </div>
        {children}
        <p className="text-center text-sm text-gray-500">
          <Link href="/" className="hover:text-teal transition-colors">
            &larr; Back to home
          </Link>
        </p>
      </div>
    </div>
  )
}
