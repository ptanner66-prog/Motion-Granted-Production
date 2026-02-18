'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import {
  ArrowLeft,
  Mail,
  Bell,
  FileText,
  CheckCircle,
  Clock,
  AlertCircle,
  Save,
} from 'lucide-react'
import { useToast } from '@/hooks/use-toast'

export default function EmailSettingsPage() {
  const { toast } = useToast()
  const [saving, setSaving] = useState(false)

  // Email notification settings
  const [settings, setSettings] = useState({
    newOrderAdmin: true,
    newOrderClient: true,
    orderStatusUpdate: true,
    orderAssigned: true,
    draftDelivered: true,
    revisionRequested: true,
    orderCompleted: true,
    paymentReceived: true,
    adminEmail: '',
    replyToEmail: 'support@motion-granted.com',
    emailFooter: 'Motion Granted - Professional Legal Motion Drafting',
  })

  const handleSave = async () => {
    setSaving(true)
    // In production, save to database/env
    await new Promise(resolve => setTimeout(resolve, 500))
    toast({
      title: 'Settings saved',
      description: 'Email notification settings have been updated.',
    })
    setSaving(false)
  }

  return (
    <div className="p-6 lg:p-8 max-w-4xl mx-auto">
      {/* Back button */}
      <Link
        href="/admin/settings"
        className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-teal mb-6 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Settings
      </Link>

      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-navy tracking-tight">Email Notifications</h1>
        <p className="text-gray-500 mt-1">Configure email notification settings</p>
      </div>

      <div className="space-y-6">
        {/* Admin Notifications */}
        <Card className="bg-white border-gray-200">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="bg-teal/20 p-2 rounded-lg">
                <Bell className="h-5 w-5 text-teal" />
              </div>
              <div>
                <CardTitle className="text-lg font-semibold text-navy">Admin Notifications</CardTitle>
                <CardDescription className="text-gray-400">Emails sent to admin</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <div className="flex items-center gap-3">
                <FileText className="h-5 w-5 text-gray-500" />
                <div>
                  <p className="text-navy font-medium">New Order Received</p>
                  <p className="text-sm text-gray-400">Get notified when a new order is placed</p>
                </div>
              </div>
              <Switch
                checked={settings.newOrderAdmin}
                onCheckedChange={(checked) => setSettings(s => ({ ...s, newOrderAdmin: checked }))}
              />
            </div>
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <div className="flex items-center gap-3">
                <AlertCircle className="h-5 w-5 text-gray-500" />
                <div>
                  <p className="text-navy font-medium">Revision Requested</p>
                  <p className="text-sm text-gray-400">Get notified when client requests revision</p>
                </div>
              </div>
              <Switch
                checked={settings.revisionRequested}
                onCheckedChange={(checked) => setSettings(s => ({ ...s, revisionRequested: checked }))}
              />
            </div>
          </CardContent>
        </Card>

        {/* Client Notifications */}
        <Card className="bg-white border-gray-200">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="bg-blue-500/20 p-2 rounded-lg">
                <Mail className="h-5 w-5 text-blue-500" />
              </div>
              <div>
                <CardTitle className="text-lg font-semibold text-navy">Client Notifications</CardTitle>
                <CardDescription className="text-gray-400">Emails sent to clients</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <div className="flex items-center gap-3">
                <CheckCircle className="h-5 w-5 text-gray-500" />
                <div>
                  <p className="text-navy font-medium">Order Confirmation</p>
                  <p className="text-sm text-gray-400">Send confirmation when order is placed</p>
                </div>
              </div>
              <Switch
                checked={settings.newOrderClient}
                onCheckedChange={(checked) => setSettings(s => ({ ...s, newOrderClient: checked }))}
              />
            </div>
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <div className="flex items-center gap-3">
                <Clock className="h-5 w-5 text-gray-500" />
                <div>
                  <p className="text-navy font-medium">Status Updates</p>
                  <p className="text-sm text-gray-400">Notify when order status changes</p>
                </div>
              </div>
              <Switch
                checked={settings.orderStatusUpdate}
                onCheckedChange={(checked) => setSettings(s => ({ ...s, orderStatusUpdate: checked }))}
              />
            </div>
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <div className="flex items-center gap-3">
                <FileText className="h-5 w-5 text-gray-500" />
                <div>
                  <p className="text-navy font-medium">Draft Delivered</p>
                  <p className="text-sm text-gray-400">Notify when draft is ready for review</p>
                </div>
              </div>
              <Switch
                checked={settings.draftDelivered}
                onCheckedChange={(checked) => setSettings(s => ({ ...s, draftDelivered: checked }))}
              />
            </div>
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <div className="flex items-center gap-3">
                <CheckCircle className="h-5 w-5 text-gray-500" />
                <div>
                  <p className="text-navy font-medium">Order Completed</p>
                  <p className="text-sm text-gray-400">Notify when order is finalized</p>
                </div>
              </div>
              <Switch
                checked={settings.orderCompleted}
                onCheckedChange={(checked) => setSettings(s => ({ ...s, orderCompleted: checked }))}
              />
            </div>
          </CardContent>
        </Card>

        {/* Email Settings */}
        <Card className="bg-white border-gray-200">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="bg-purple-500/20 p-2 rounded-lg">
                <Mail className="h-5 w-5 text-purple-500" />
              </div>
              <div>
                <CardTitle className="text-lg font-semibold text-navy">Email Configuration</CardTitle>
                <CardDescription className="text-gray-400">Sender and reply settings</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="adminEmail" className="text-gray-600">Admin Notification Email</Label>
                <Input
                  id="adminEmail"
                  type="email"
                  placeholder="admin@motion-granted.com"
                  value={settings.adminEmail}
                  onChange={(e) => setSettings(s => ({ ...s, adminEmail: e.target.value }))}
                  className="border-gray-200"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="replyTo" className="text-gray-600">Reply-To Email</Label>
                <Input
                  id="replyTo"
                  type="email"
                  placeholder="support@motion-granted.com"
                  value={settings.replyToEmail}
                  onChange={(e) => setSettings(s => ({ ...s, replyToEmail: e.target.value }))}
                  className="border-gray-200"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="footer" className="text-gray-600">Email Footer Text</Label>
              <Textarea
                id="footer"
                placeholder="Company name and contact info"
                value={settings.emailFooter}
                onChange={(e) => setSettings(s => ({ ...s, emailFooter: e.target.value }))}
                className="border-gray-200"
                rows={2}
              />
            </div>
          </CardContent>
        </Card>

        {/* Save Button */}
        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={saving} className="btn-premium gap-2">
            <Save className="h-4 w-4" />
            {saving ? 'Saving...' : 'Save Settings'}
          </Button>
        </div>
      </div>
    </div>
  )
}
