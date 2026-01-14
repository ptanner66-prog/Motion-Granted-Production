import { Metadata } from 'next'
import { RegisterForm } from '@/components/forms/register-form'

export const metadata: Metadata = {
  title: 'Create Account',
  description: 'Create your Motion Granted account.',
}

export default function RegisterPage() {
  return <RegisterForm />
}
