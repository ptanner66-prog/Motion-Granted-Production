import { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
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
} from 'lucide-react'

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
        <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">Settings</h1>
        <p className="text-gray-400 mt-1">Manage your admin account settings</p>
      </div>

      <div className="space-y-6">
        {/* Profile Settings */}
        <Card className="bg-gray-900 border-gray-800">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="bg-teal/20 p-2 rounded-lg">
                <User className="h-5 w-5 text-teal" />
              </div>
              <div>
                <CardTitle className="text-lg font-semibold text-white">Profile Information</CardTitle>
                <CardDescription className="text-gray-500">Your personal details</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="name" className="text-gray-300">Full Name</Label>
                <Input
                  id="name"
                  defaultValue={profile?.full_name || ''}
                  className="bg-gray-800 border-gray-700 text-white"
                  disabled
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email" className="text-gray-300">Email</Label>
                <Input
                  id="email"
                  type="email"
                  defaultValue={user?.email || ''}
                  className="bg-gray-800 border-gray-700 text-white"
                  disabled
                />
              </div>
            </div>
            <p className="text-sm text-gray-500">
              Contact support to update your profile information.
            </p>
          </CardContent>
        </Card>

        {/* Security Settings */}
        <Card className="bg-gray-900 border-gray-800">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="bg-orange-500/20 p-2 rounded-lg">
                <Shield className="h-5 w-5 text-orange-400" />
              </div>
              <div>
                <CardTitle className="text-lg font-semibold text-white">Security</CardTitle>
                <CardDescription className="text-gray-500">Manage your account security</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-gray-800/50 rounded-lg">
              <div className="flex items-center gap-3">
                <Lock className="h-5 w-5 text-gray-400" />
                <div>
                  <p className="text-white font-medium">Password</p>
                  <p className="text-sm text-gray-500">Last changed: Unknown</p>
                </div>
              </div>
              <Button variant="outline" size="sm" className="border-gray-700 text-gray-300 hover:bg-gray-800">
                Change Password
              </Button>
            </div>
            <div className="flex items-center justify-between p-4 bg-gray-800/50 rounded-lg">
              <div className="flex items-center gap-3">
                <Shield className="h-5 w-5 text-gray-400" />
                <div>
                  <p className="text-white font-medium">Two-Factor Authentication</p>
                  <p className="text-sm text-gray-500">Add extra security to your account</p>
                </div>
              </div>
              <Button variant="outline" size="sm" className="border-gray-700 text-gray-300 hover:bg-gray-800">
                Enable
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Notification Settings */}
        <Card className="bg-gray-900 border-gray-800">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="bg-blue-500/20 p-2 rounded-lg">
                <Bell className="h-5 w-5 text-blue-400" />
              </div>
              <div>
                <CardTitle className="text-lg font-semibold text-white">Notifications</CardTitle>
                <CardDescription className="text-gray-500">Configure how you receive alerts</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-gray-800/50 rounded-lg">
              <div className="flex items-center gap-3">
                <Mail className="h-5 w-5 text-gray-400" />
                <div>
                  <p className="text-white font-medium">Email Notifications</p>
                  <p className="text-sm text-gray-500">Receive updates via email</p>
                </div>
              </div>
              <Button variant="outline" size="sm" className="border-gray-700 text-gray-300 hover:bg-gray-800">
                Configure
              </Button>
            </div>
            <div className="flex items-center justify-between p-4 bg-gray-800/50 rounded-lg">
              <div className="flex items-center gap-3">
                <Bell className="h-5 w-5 text-gray-400" />
                <div>
                  <p className="text-white font-medium">New Order Alerts</p>
                  <p className="text-sm text-gray-500">Get notified when new orders come in</p>
                </div>
              </div>
              <div className="flex items-center">
                <span className="px-2 py-1 text-xs font-medium bg-emerald-500/20 text-emerald-400 rounded">
                  Enabled
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Business Settings */}
        <Card className="bg-gray-900 border-gray-800">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="bg-purple-500/20 p-2 rounded-lg">
                <Building className="h-5 w-5 text-purple-400" />
              </div>
              <div>
                <CardTitle className="text-lg font-semibold text-white">Business Settings</CardTitle>
                <CardDescription className="text-gray-500">Configure business operations</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-gray-800/50 rounded-lg">
              <div className="flex items-center gap-3">
                <CreditCard className="h-5 w-5 text-gray-400" />
                <div>
                  <p className="text-white font-medium">Payment Settings</p>
                  <p className="text-sm text-gray-500">Stripe configuration</p>
                </div>
              </div>
              <Button variant="outline" size="sm" className="border-gray-700 text-gray-300 hover:bg-gray-800">
                Manage
              </Button>
            </div>
            <div className="flex items-center justify-between p-4 bg-gray-800/50 rounded-lg">
              <div className="flex items-center gap-3">
                <Settings className="h-5 w-5 text-gray-400" />
                <div>
                  <p className="text-white font-medium">Pricing Configuration</p>
                  <p className="text-sm text-gray-500">Motion types and pricing tiers</p>
                </div>
              </div>
              <Button variant="outline" size="sm" className="border-gray-700 text-gray-300 hover:bg-gray-800">
                Configure
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
