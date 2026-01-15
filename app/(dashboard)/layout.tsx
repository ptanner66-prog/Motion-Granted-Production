import { redirect } from 'next/navigation'
import { DashboardShell } from '@/components/layout/dashboard-shell'
import { getUser, getProfile } from '@/lib/supabase/server'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await getUser()

  // Redirect to login if not authenticated
  if (!user) {
    redirect('/login')
  }

  // Get user profile
  const profile = await getProfile()

  // Redirect admins to admin dashboard
  if (profile?.role === 'admin') {
    redirect('/admin')
  }

  const userData = {
    name: profile?.full_name || user.email?.split('@')[0] || 'User',
    email: user.email || '',
  }

  return <DashboardShell user={userData}>{children}</DashboardShell>
}
