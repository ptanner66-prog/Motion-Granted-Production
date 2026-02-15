'use client'

import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/hooks/use-toast'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Loader2 } from 'lucide-react'

// Password change schema
const changePasswordSchema = z.object({
  current_password: z.string().min(1, 'Current password is required'),
  new_password: z.string().min(8, 'Password must be at least 8 characters'),
  confirm_password: z.string(),
}).refine((data) => data.new_password === data.confirm_password, {
  message: 'Passwords do not match',
  path: ['confirm_password'],
})

type ChangePasswordInput = z.infer<typeof changePasswordSchema>

export function ChangePasswordButton() {
  const [open, setOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const { toast } = useToast()
  const supabase = createClient()

  const form = useForm<ChangePasswordInput>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: {
      current_password: '',
      new_password: '',
      confirm_password: '',
    },
  })

  async function onSubmit(data: ChangePasswordInput) {
    setIsLoading(true)

    try {
      // First verify current password by re-authenticating
      const { data: userData } = await supabase.auth.getUser()
      if (!userData.user?.email) {
        throw new Error('User not found')
      }

      // Try to sign in with current password to verify it
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: userData.user.email,
        password: data.current_password,
      })

      if (signInError) {
        toast({
          title: 'Invalid current password',
          description: 'Please check your current password and try again.',
          variant: 'destructive',
        })
        setIsLoading(false)
        return
      }

      // Update to new password
      const { error } = await supabase.auth.updateUser({
        password: data.new_password,
      })

      if (error) {
        toast({
          title: 'Error updating password',
          description: error.message,
          variant: 'destructive',
        })
        return
      }

      toast({
        title: 'Password updated',
        description: 'Your password has been changed successfully.',
      })

      form.reset()
      setOpen(false)
    } catch {
      toast({
        title: 'Error',
        description: 'Something went wrong. Please try again.',
        variant: 'destructive',
      })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="border-gray-200 text-gray-600 hover:bg-gray-100">
          Change Password
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="text-navy">Change Password</DialogTitle>
          <DialogDescription>
            Enter your current password and choose a new one.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-4">
            <FormField
              control={form.control}
              name="current_password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Current Password</FormLabel>
                  <FormControl>
                    <Input type="password" placeholder="••••••••" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="new_password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>New Password</FormLabel>
                  <FormControl>
                    <Input type="password" placeholder="••••••••" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="confirm_password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Confirm New Password</FormLabel>
                  <FormControl>
                    <Input type="password" placeholder="••••••••" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter className="pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
                disabled={isLoading}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isLoading} className="bg-teal hover:bg-teal-dark text-white">
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Updating...
                  </>
                ) : (
                  'Update Password'
                )}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}

export function Enable2FAButton() {
  const [mfaStatus, setMfaStatus] = useState<{
    enrolled: boolean;
    loading: boolean;
  }>({ enrolled: false, loading: true })

  useEffect(() => {
    async function checkMFA() {
      try {
        const res = await fetch('/api/auth/mfa/status')
        if (res.ok) {
          const data = await res.json()
          setMfaStatus({ enrolled: !!data.factorId, loading: false })
        } else {
          setMfaStatus({ enrolled: false, loading: false })
        }
      } catch {
        setMfaStatus({ enrolled: false, loading: false })
      }
    }
    checkMFA()
  }, [])

  if (mfaStatus.loading) {
    return (
      <Button
        variant="outline"
        size="sm"
        className="border-gray-200 text-gray-600"
        disabled
      >
        <Loader2 className="h-4 w-4 animate-spin" />
      </Button>
    )
  }

  if (mfaStatus.enrolled) {
    return (
      <span className="px-2 py-1 text-xs font-medium bg-emerald-500/20 text-emerald-600 rounded">
        Enabled
      </span>
    )
  }

  return (
    <Button
      variant="outline"
      size="sm"
      className="border-gray-200 text-gray-600 hover:bg-gray-100"
      onClick={() => { window.location.href = '/admin/setup-mfa' }}
    >
      Enable
    </Button>
  )
}

export function ConfigureEmailButton() {
  const { toast } = useToast()

  const handleClick = () => {
    toast({
      title: 'Coming Soon',
      description: 'Email notification settings will be available in a future update.',
    })
  }

  return (
    <Button
      variant="outline"
      size="sm"
      className="border-gray-200 text-gray-600 hover:bg-gray-100"
      onClick={handleClick}
    >
      Configure
    </Button>
  )
}

export function ManagePaymentButton() {
  const { toast } = useToast()

  const handleClick = () => {
    toast({
      title: 'Coming Soon',
      description: 'Payment settings management will be available in a future update.',
    })
  }

  return (
    <Button
      variant="outline"
      size="sm"
      className="border-gray-200 text-gray-600 hover:bg-gray-100"
      onClick={handleClick}
    >
      Manage
    </Button>
  )
}

export function ConfigurePricingButton() {
  const { toast } = useToast()

  const handleClick = () => {
    toast({
      title: 'Coming Soon',
      description: 'Pricing configuration will be available in a future update.',
    })
  }

  return (
    <Button
      variant="outline"
      size="sm"
      className="border-gray-200 text-gray-600 hover:bg-gray-100"
      onClick={handleClick}
    >
      Configure
    </Button>
  )
}
