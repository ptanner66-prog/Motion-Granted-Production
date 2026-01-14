import { Metadata } from 'next'
import { LoginForm } from '@/components/forms/login-form'

export const metadata: Metadata = {
  title: 'Sign In',
  description: 'Sign in to your Motion Granted account.',
}

export default function LoginPage() {
  return <LoginForm />
}
