'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { useToast } from '@/hooks/use-toast'
import { createClient } from '@/lib/supabase/client'
import { Loader2, LogOut } from 'lucide-react'

interface UserProfile {
  full_name: string
  email: string
  phone: string | null
  bar_number: string | null
  states_licensed: string[]
  firm_name: string | null
  firm_address: string | null
  firm_phone: string | null
}

export default function SettingsPage() {
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const { toast } = useToast()
  const router = useRouter()
  const supabase = createClient()

  // Load user profile on mount
  useEffect(() => {
    async function loadProfile() {
      setIsLoading(true)
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
          router.push('/login')
          return
        }

        // Try to fetch existing profile
        const { data: profileData, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .single()

        if (error && error.code === 'PGRST116') {
          // Profile doesn't exist — should have been created by handle_new_user trigger.
          // Insert with correct defaults matching the trigger's schema constraints.
          const newProfile = {
            id: user.id,
            email: user.email || '',
            full_name: user.user_metadata?.full_name || user.email?.split('@')[0] || '',
            phone: null,
            bar_number: '',
            states_licensed: [],
            firm_name: null,
            firm_address: null,
            firm_phone: null,
            role: 'customer',
          }

          const { error: insertError } = await supabase
            .from('profiles')
            .insert(newProfile)

          if (insertError) {
            console.error('[Settings] Profile insert error:', insertError.code, insertError.message)
          }

          setProfile({
            full_name: newProfile.full_name,
            email: user.email || '',
            phone: null,
            bar_number: null,
            states_licensed: [],
            firm_name: null,
            firm_address: null,
            firm_phone: null,
          })
        } else if (error) {
          throw error
        } else {
          setProfile({
            full_name: profileData.full_name || '',
            email: user.email || '',
            phone: profileData.phone,
            bar_number: profileData.bar_number,
            states_licensed: profileData.states_licensed || [],
            firm_name: profileData.firm_name,
            firm_address: profileData.firm_address,
            firm_phone: profileData.firm_phone,
          })
        }
      } catch (error) {
        // Show form with empty values instead of error
        const { data: { user } } = await supabase.auth.getUser()
        setProfile({
          full_name: user?.email?.split('@')[0] || '',
          email: user?.email || '',
          phone: null,
          bar_number: null,
          states_licensed: [],
          firm_name: null,
          firm_address: null,
          firm_phone: null,
        })
      } finally {
        setIsLoading(false)
      }
    }

    loadProfile()
  }, [])

  const handleSave = async () => {
    if (!profile) return

    setIsSaving(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      // Update profile — do NOT include `role` (blocked by RLS privilege escalation policy)
      // and do NOT include `id`/`email` (immutable identity fields)
      const { error } = await supabase
        .from('profiles')
        .update({
          full_name: profile.full_name,
          phone: profile.phone,
          bar_number: profile.bar_number || '',
          firm_name: profile.firm_name,
          firm_address: profile.firm_address,
          firm_phone: profile.firm_phone,
          updated_at: new Date().toISOString(),
        })
        .eq('id', user.id)

      if (error) {
        console.error('[Settings] Save error:', error.code, error.message, error.details)
        throw error
      }

      toast({
        title: 'Settings saved',
        description: 'Your account settings have been updated.',
      })
    } catch (error) {
      console.error('[Settings] handleSave failed:', error)
      const message = error instanceof Error ? error.message : 'Unknown error'
      toast({
        title: 'Error saving settings',
        description: message.includes('violates') ? 'A required field is missing.' : 'Please try again later.',
        variant: 'destructive',
      })
    } finally {
      setIsSaving(false)
    }
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  if (isLoading) {
    return (
      <div className="p-6 lg:p-8 flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-teal" />
      </div>
    )
  }

  if (!profile) {
    return (
      <div className="p-6 lg:p-8 text-center">
        <p className="text-gray-500">Unable to load profile. Please try refreshing the page.</p>
        <Button onClick={() => window.location.reload()} className="mt-4">
          Refresh Page
        </Button>
      </div>
    )
  }

  return (
    <div className="p-6 lg:p-8 max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-navy tracking-tight">Account Settings</h1>
        <p className="text-gray-500 mt-1">Manage your account information</p>
      </div>

      <div className="space-y-6">
        {/* Personal Information */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="bg-gradient-to-r from-gray-50 to-transparent border-b border-gray-100">
            <CardTitle>Personal Information</CardTitle>
            <CardDescription>Update your personal details</CardDescription>
          </CardHeader>
          <CardContent className="p-6 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="full_name">Full Name</Label>
                <Input
                  id="full_name"
                  value={profile.full_name}
                  onChange={(e) => setProfile({ ...profile, full_name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={profile.email}
                  disabled
                  className="bg-gray-50"
                />
                <p className="text-xs text-gray-500">
                  Contact support to change your email
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Phone</Label>
                <Input
                  id="phone"
                  type="tel"
                  value={profile.phone || ''}
                  onChange={(e) => setProfile({ ...profile, phone: e.target.value || null })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="bar_number">Bar Number</Label>
                <Input
                  id="bar_number"
                  value={profile.bar_number || ''}
                  onChange={(e) => setProfile({ ...profile, bar_number: e.target.value || null })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="states">State(s) of Licensure</Label>
              <Input
                id="states"
                value={profile.states_licensed.join(', ') || 'Not specified'}
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
        <Card className="border-0 shadow-sm">
          <CardHeader className="bg-gradient-to-r from-gray-50 to-transparent border-b border-gray-100">
            <CardTitle>Firm Information</CardTitle>
            <CardDescription>Update your firm details</CardDescription>
          </CardHeader>
          <CardContent className="p-6 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="firm_name">Firm Name</Label>
              <Input
                id="firm_name"
                value={profile.firm_name || ''}
                onChange={(e) => setProfile({ ...profile, firm_name: e.target.value || null })}
                placeholder="Solo Practitioner"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="firm_address">Firm Address</Label>
              <Input
                id="firm_address"
                value={profile.firm_address || ''}
                onChange={(e) => setProfile({ ...profile, firm_address: e.target.value || null })}
                placeholder="123 Main St, Suite 100, City, State ZIP"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="firm_phone">Firm Phone</Label>
              <Input
                id="firm_phone"
                type="tel"
                value={profile.firm_phone || ''}
                onChange={(e) => setProfile({ ...profile, firm_phone: e.target.value || null })}
                placeholder="(555) 123-4567"
              />
            </div>
          </CardContent>
        </Card>

        {/* Email Notifications */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="bg-gradient-to-r from-gray-50 to-transparent border-b border-gray-100">
            <CardTitle>Email Notifications</CardTitle>
            <CardDescription>Manage your notification preferences</CardDescription>
          </CardHeader>
          <CardContent className="p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-navy">Order Updates</p>
                <p className="text-sm text-gray-500">
                  Receive notifications when your order status changes
                </p>
              </div>
              <Switch defaultChecked />
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-navy">Draft Delivery</p>
                <p className="text-sm text-gray-500">
                  Get notified when your draft is ready for download
                </p>
              </div>
              <Switch defaultChecked />
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-navy">Messages</p>
                <p className="text-sm text-gray-500">
                  Receive notifications for new messages
                </p>
              </div>
              <Switch defaultChecked />
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-navy">Marketing Emails</p>
                <p className="text-sm text-gray-500">
                  Receive updates about new features and promotions
                </p>
              </div>
              <Switch />
            </div>
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row justify-between gap-4">
          <Button
            variant="outline"
            onClick={handleSignOut}
            className="text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200"
          >
            <LogOut className="mr-2 h-4 w-4" />
            Sign Out
          </Button>
          <Button onClick={handleSave} disabled={isSaving} className="btn-premium">
            {isSaving ? (
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
