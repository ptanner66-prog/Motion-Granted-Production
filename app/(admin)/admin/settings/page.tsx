import { Metadata } from 'next'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Settings,
  User,
  Shield,
  Bell,
  Mail,
  Lock,
  Building,
  CreditCard,
  ChevronRight,
  DollarSign,
} from 'lucide-react'
import {
  ChangePasswordButton,
  Enable2FAButton,
  ConfigureEmailButton,
  ManagePaymentButton,
  ConfigurePricingButton,
} from '@/components/admin/settings-buttons'
import { APIKeysSettings } from '@/components/admin/api-keys-settings'

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

  return (
    <div className="p-6 lg:p-8 max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-navy tracking-tight">Settings</h1>
        <p className="text-gray-500 mt-1">Manage your admin account settings</p>
      </div>

      <div className="space-y-6">
        {/* Profile Settings */}
        <Card className="bg-white border-gray-200">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="bg-teal/20 p-2 rounded-lg">
                <User className="h-5 w-5 text-teal" />
              </div>
              <div>
                <CardTitle className="text-lg font-semibold text-navy">Profile Information</CardTitle>
                <CardDescription className="text-gray-400">Your personal details</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="name" className="text-gray-600">Full Name</Label>
                <Input
                  id="name"
                  defaultValue={profile?.full_name || ''}
                  className="bg-gray-100 border-gray-200 text-navy"
                  disabled
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email" className="text-gray-600">Email</Label>
                <Input
                  id="email"
                  type="email"
                  defaultValue={user?.email || ''}
                  className="bg-gray-100 border-gray-200 text-navy"
                  disabled
                />
              </div>
            </div>
            <p className="text-sm text-gray-400">
              Contact support to update your profile information.
            </p>
          </CardContent>
        </Card>

        {/* Security Settings */}
        <Card className="bg-white border-gray-200">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="bg-orange-500/20 p-2 rounded-lg">
                <Shield className="h-5 w-5 text-orange-500" />
              </div>
              <div>
                <CardTitle className="text-lg font-semibold text-navy">Security</CardTitle>
                <CardDescription className="text-gray-400">Manage your account security</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <div className="flex items-center gap-3">
                <Lock className="h-5 w-5 text-gray-500" />
                <div>
                  <p className="text-navy font-medium">Password</p>
                  <p className="text-sm text-gray-400">Last changed: Unknown</p>
                </div>
              </div>
              <ChangePasswordButton />
            </div>
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <div className="flex items-center gap-3">
                <Shield className="h-5 w-5 text-gray-500" />
                <div>
                  <p className="text-navy font-medium">Two-Factor Authentication</p>
                  <p className="text-sm text-gray-400">Add extra security to your account</p>
                </div>
              </div>
              <Enable2FAButton />
            </div>
          </CardContent>
        </Card>

        {/* Notification Settings */}
        <Card className="bg-white border-gray-200">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="bg-blue-500/20 p-2 rounded-lg">
                <Bell className="h-5 w-5 text-blue-500" />
              </div>
              <div>
                <CardTitle className="text-lg font-semibold text-navy">Notifications</CardTitle>
                <CardDescription className="text-gray-400">Configure how you receive alerts</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <Link href="/admin/settings/email" className="flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
              <div className="flex items-center gap-3">
                <Mail className="h-5 w-5 text-gray-500" />
                <div>
                  <p className="text-navy font-medium">Email Notifications</p>
                  <p className="text-sm text-gray-400">Configure notification settings</p>
                </div>
              </div>
              <ChevronRight className="h-5 w-5 text-gray-300" />
            </Link>
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <div className="flex items-center gap-3">
                <Bell className="h-5 w-5 text-gray-500" />
                <div>
                  <p className="text-navy font-medium">New Order Alerts</p>
                  <p className="text-sm text-gray-400">Get notified when new orders come in</p>
                </div>
              </div>
              <div className="flex items-center">
                <span className="px-2 py-1 text-xs font-medium bg-emerald-500/20 text-emerald-600 rounded">
                  Enabled
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Business Settings */}
        <Card className="bg-white border-gray-200">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="bg-purple-500/20 p-2 rounded-lg">
                <Building className="h-5 w-5 text-purple-500" />
              </div>
              <div>
                <CardTitle className="text-lg font-semibold text-navy">Business Settings</CardTitle>
                <CardDescription className="text-gray-400">Configure business operations</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <div className="flex items-center gap-3">
                <CreditCard className="h-5 w-5 text-gray-500" />
                <div>
                  <p className="text-navy font-medium">Payment Settings</p>
                  <p className="text-sm text-gray-400">Stripe configuration</p>
                </div>
              </div>
              <ManagePaymentButton />
            </div>
            <Link href="/admin/settings/pricing" className="flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
              <div className="flex items-center gap-3">
                <DollarSign className="h-5 w-5 text-gray-500" />
                <div>
                  <p className="text-navy font-medium">Pricing Configuration</p>
                  <p className="text-sm text-gray-400">Motion types and pricing tiers</p>
                </div>
              </div>
              <ChevronRight className="h-5 w-5 text-gray-300" />
            </Link>
          </CardContent>
        </Card>

        {/* API Keys & Integration Settings */}
        <APIKeysSettings />
      </div>
    </div>
  )
}
