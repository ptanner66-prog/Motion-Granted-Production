'use client'

import { useState } from 'react'
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
import { useToast } from '@/hooks/use-toast'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

interface AdminSettingsContentProps {
  profile: any
  userEmail: string
}

export function AdminSettingsContent({ profile, userEmail }: AdminSettingsContentProps) {
  const { toast } = useToast()
  const router = useRouter()
  const supabase = createClient()
  const [isChangingPassword, setIsChangingPassword] = useState(false)

  const handleChangePassword = async () => {
    setIsChangingPassword(true)
    try {
      // Send password reset email
      const { error } = await supabase.auth.resetPasswordForEmail(userEmail, {
        redirectTo: `${window.location.origin}/reset-password`,
      })

      if (error) {
        toast({
          title: 'Error',
          description: error.message,
          variant: 'destructive',
        })
      } else {
        toast({
          title: 'Check your email',
          description: 'We sent you a password reset link.',
        })
      }
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to send password reset email. Please try again.',
        variant: 'destructive',
      })
    } finally {
      setIsChangingPassword(false)
    }
  }

  const handleEnable2FA = () => {
    toast({
      title: 'Two-Factor Authentication',
      description: 'This feature will be available in a future update. Contact support for early access.',
    })
  }

  const handleConfigureNotifications = () => {
    toast({
      title: 'Email Notifications',
      description: 'Email notifications are currently managed automatically. Custom preferences coming soon.',
    })
  }

  const handleManagePayments = () => {
    toast({
      title: 'Payment Settings',
      description: 'Payment settings are managed via environment variables. Contact technical support to update Stripe configuration.',
    })
  }

  const handleConfigurePricing = () => {
    // For now, just show a message. In the future, this could redirect to a pricing config page
    toast({
      title: 'Pricing Configuration',
      description: 'Pricing is currently managed in /config/motion-types.ts. A UI editor is coming soon.',
    })
  }

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
                  defaultValue={userEmail || ''}
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
                  <p className="text-sm text-gray-400">Secure your account</p>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="border-gray-200 text-gray-600 hover:bg-gray-100"
                onClick={handleChangePassword}
                disabled={isChangingPassword}
              >
                {isChangingPassword ? 'Sending...' : 'Change Password'}
              </Button>
            </div>
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <div className="flex items-center gap-3">
                <Shield className="h-5 w-5 text-gray-500" />
                <div>
                  <p className="text-navy font-medium">Two-Factor Authentication</p>
                  <p className="text-sm text-gray-400">Add extra security to your account</p>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="border-gray-200 text-gray-600 hover:bg-gray-100"
                onClick={handleEnable2FA}
              >
                Enable
              </Button>
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
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <div className="flex items-center gap-3">
                <Mail className="h-5 w-5 text-gray-500" />
                <div>
                  <p className="text-navy font-medium">Email Notifications</p>
                  <p className="text-sm text-gray-400">Receive updates via email</p>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="border-gray-200 text-gray-600 hover:bg-gray-100"
                onClick={handleConfigureNotifications}
              >
                Configure
              </Button>
            </div>
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
              <Button
                variant="outline"
                size="sm"
                className="border-gray-200 text-gray-600 hover:bg-gray-100"
                onClick={handleManagePayments}
              >
                Manage
              </Button>
            </div>
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <div className="flex items-center gap-3">
                <Settings className="h-5 w-5 text-gray-500" />
                <div>
                  <p className="text-navy font-medium">Pricing Configuration</p>
                  <p className="text-sm text-gray-400">Motion types and pricing tiers</p>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="border-gray-200 text-gray-600 hover:bg-gray-100"
                onClick={handleConfigurePricing}
              >
                Configure
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
