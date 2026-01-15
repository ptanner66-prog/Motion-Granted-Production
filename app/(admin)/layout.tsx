import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { AdminShell } from '@/components/layout/admin-shell'

export const dynamic = 'force-dynamic'

export default async function AdminLayout({
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

  // Get profile including role
  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, role')
    .eq('id', user.id)
    .single()

  // Check if user is admin - redirect non-admins to client dashboard
  const role = profile?.role?.toString().toLowerCase().trim()
  if (role !== 'admin') {
    redirect('/dashboard')
  }

  const userData = {
    name: profile?.full_name || user.email?.split('@')[0] || 'Admin',
    email: user.email || '',
  }

  return <AdminShell user={userData}>{children}</AdminShell>
}
