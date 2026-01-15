import { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { AdminSettingsContent } from '@/components/admin/admin-settings-content'

export const metadata: Metadata = {
  title: 'Settings - Admin',
  description: 'Admin account settings.',
}

export default async function AdminSettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user?.id)
    .single()

  return <AdminSettingsContent profile={profile} userEmail={user?.email || ''} />
}
