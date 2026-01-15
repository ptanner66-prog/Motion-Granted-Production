import { redirect } from 'next/navigation'
import { DashboardShell } from '@/components/layout/dashboard-shell'
import { AdminRedirect } from '@/components/auth/admin-redirect'
import { createClient } from '@/lib/supabase/server'

// Force dynamic rendering - no caching
export const dynamic = 'force-dynamic'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Redirect to login if not authenticated
  if (!user) {
    redirect('/login')
  }

  // Get user profile directly (not using getProfile helper)
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  console.log('Dashboard Layout - User ID:', user.id)
  console.log('Dashboard Layout - Profile:', profile)
  console.log('Dashboard Layout - Profile Error:', error)
  console.log('Dashboard Layout - Role:', profile?.role)

  // Server-side redirect for admins
  const role = profile?.role?.toString().toLowerCase().trim()
  if (role === 'admin') {
    console.log('Dashboard Layout - Redirecting to /admin')
    redirect('/admin')
  }

  const userData = {
    name: profile?.full_name || user.email?.split('@')[0] || 'User',
    email: user.email || '',
  }

  // Wrap with client-side AdminRedirect as backup
  return (
    <AdminRedirect>
      <DashboardShell user={userData}>{children}</DashboardShell>
    </AdminRedirect>
  )
}
