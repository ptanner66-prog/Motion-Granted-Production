'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { useToast } from '@/hooks/use-toast'
import { Loader2 } from 'lucide-react'

// Mock user data - in production, fetch from Supabase
const user = {
  full_name: 'John Smith',
  email: 'john.smith@lawfirm.com',
  phone: '(555) 123-4567',
  bar_number: '12345',
  states_licensed: ['Louisiana'],
  firm_name: 'Smith Law Firm',
  firm_address: '123 Main Street, Suite 100, Baton Rouge, LA 70801',
  firm_phone: '(555) 987-6543',
}

export default function SettingsPage() {
  const [isLoading, setIsLoading] = useState(false)
  const { toast } = useToast()

  const handleSave = async () => {
    setIsLoading(true)
    // Simulate API call
    await new Promise((resolve) => setTimeout(resolve, 1000))
    toast({
      title: 'Settings saved',
      description: 'Your account settings have been updated.',
    })
    setIsLoading(false)
  }

  return (
    <div className="p-6 lg:p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-navy">Account Settings</h1>
        <p className="text-gray-500">Manage your account information</p>
      </div>

      <div className="max-w-3xl space-y-6">
        {/* Personal Information */}
        <Card>
          <CardHeader>
            <CardTitle>Personal Information</CardTitle>
            <CardDescription>Update your personal details</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="full_name">Full Name</Label>
                <Input id="full_name" defaultValue={user.full_name} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" defaultValue={user.email} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Phone</Label>
                <Input id="phone" type="tel" defaultValue={user.phone} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="bar_number">Bar Number</Label>
                <Input id="bar_number" defaultValue={user.bar_number} />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="states">State(s) of Licensure</Label>
              <Input
                id="states"
                defaultValue={user.states_licensed.join(', ')}
                disabled
                className="bg-gray-50"
              />
              <p className="text-xs text-gray-500">
                Contact support to update your state licensure
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Firm Information */}
        <Card>
          <CardHeader>
            <CardTitle>Firm Information</CardTitle>
            <CardDescription>Update your firm details</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="firm_name">Firm Name</Label>
              <Input id="firm_name" defaultValue={user.firm_name} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="firm_address">Firm Address</Label>
              <Input id="firm_address" defaultValue={user.firm_address} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="firm_phone">Firm Phone</Label>
              <Input id="firm_phone" type="tel" defaultValue={user.firm_phone} />
            </div>
          </CardContent>
        </Card>

        {/* Password */}
        <Card>
          <CardHeader>
            <CardTitle>Change Password</CardTitle>
            <CardDescription>Update your password</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="current_password">Current Password</Label>
              <Input id="current_password" type="password" />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="new_password">New Password</Label>
                <Input id="new_password" type="password" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm_password">Confirm New Password</Label>
                <Input id="confirm_password" type="password" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Notifications */}
        <Card>
          <CardHeader>
            <CardTitle>Email Notifications</CardTitle>
            <CardDescription>Manage your notification preferences</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-navy">Order Updates</p>
                <p className="text-sm text-gray-500">
                  Receive notifications when your order status changes
                </p>
              </div>
              <input type="checkbox" defaultChecked className="h-5 w-5 rounded" />
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-navy">Draft Delivery</p>
                <p className="text-sm text-gray-500">
                  Get notified when your draft is ready for download
                </p>
              </div>
              <input type="checkbox" defaultChecked className="h-5 w-5 rounded" />
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-navy">Messages</p>
                <p className="text-sm text-gray-500">
                  Receive notifications for new messages
                </p>
              </div>
              <input type="checkbox" defaultChecked className="h-5 w-5 rounded" />
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-navy">Marketing Emails</p>
                <p className="text-sm text-gray-500">
                  Receive updates about new features and promotions
                </p>
              </div>
              <input type="checkbox" className="h-5 w-5 rounded" />
            </div>
          </CardContent>
        </Card>

        {/* Save Button */}
        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={isLoading}>
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              'Save Changes'
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}
