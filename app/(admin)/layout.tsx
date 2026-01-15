import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { AdminShell } from '@/components/layout/admin-shell'

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

  // Check if user is admin
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, full_name')
    .eq('id', user.id)
    .single()

  // Only allow admin users (case-insensitive check)
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
