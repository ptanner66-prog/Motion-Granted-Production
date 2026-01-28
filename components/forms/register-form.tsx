'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { registerSchema, type RegisterInput } from '@/lib/validations/auth'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from '@/components/ui/form'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useToast } from '@/hooks/use-toast'
import { Loader2 } from 'lucide-react'

const US_STATES = [
  'Alabama', 'Alaska', 'Arizona', 'Arkansas', 'California', 'Colorado',
  'Connecticut', 'Delaware', 'Florida', 'Georgia', 'Hawaii', 'Idaho',
  'Illinois', 'Indiana', 'Iowa', 'Kansas', 'Kentucky', 'Louisiana',
  'Maine', 'Maryland', 'Massachusetts', 'Michigan', 'Minnesota',
  'Mississippi', 'Missouri', 'Montana', 'Nebraska', 'Nevada',
  'New Hampshire', 'New Jersey', 'New Mexico', 'New York',
  'North Carolina', 'North Dakota', 'Ohio', 'Oklahoma', 'Oregon',
  'Pennsylvania', 'Rhode Island', 'South Carolina', 'South Dakota',
  'Tennessee', 'Texas', 'Utah', 'Vermont', 'Virginia', 'Washington',
  'West Virginia', 'Wisconsin', 'Wyoming', 'District of Columbia'
]

export function RegisterForm() {
  const [isLoading, setIsLoading] = useState(false)
  const [selectedStates, setSelectedStates] = useState<string[]>([])
  const router = useRouter()
  const { toast } = useToast()
  const supabase = createClient()

  const form = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      full_name: '',
      bar_number: '',
      states_licensed: [],
      email: '',
      phone: '',
      password: '',
      confirm_password: '',
      firm_name: '',
      firm_address: '',
      firm_phone: '',
      terms_accepted: false as unknown as true,
      disclaimer_accepted: false as unknown as true,
    },
  })

  const toggleState = (state: string) => {
    const newStates = selectedStates.includes(state)
      ? selectedStates.filter(s => s !== state)
      : [...selectedStates, state]
    setSelectedStates(newStates)
    form.setValue('states_licensed', newStates)
  }

  async function onSubmit(data: RegisterInput) {
    setIsLoading(true)

    try {
      // Create auth user
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: data.email,
        password: data.password,
        options: {
          data: {
            full_name: data.full_name,
          },
        },
      })

      if (authError) {
        toast({
          title: 'Error',
          description: authError.message,
          variant: 'destructive',
        })
        return
      }

      if (authData.user) {
        // Create profile
        const { error: profileError } = await supabase.from('profiles').insert({
          id: authData.user.id,
          email: data.email,
          full_name: data.full_name,
          phone: data.phone,
          bar_number: data.bar_number,
          states_licensed: data.states_licensed,
          firm_name: data.firm_name || 'Solo Practitioner',
          firm_address: data.firm_address || null,
          firm_phone: data.firm_phone || null,
          role: 'client',
        })

        if (profileError) {
          // Continue anyway - profile might be created by trigger
        }
      }

      toast({
        title: 'Account created!',
        description: 'Please check your email to verify your account.',
      })

      router.push('/login?message=Please check your email to verify your account')
    } catch {
      toast({
        title: 'Registration Failed',
        description: 'We couldn\'t create your account. Please try again, or contact support@motiongranted.com if the issue persists.',
        variant: 'destructive',
      })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-8 shadow-sm">
      <div className="mb-6 text-center">
        <h1 className="text-2xl font-bold text-navy">Create Account</h1>
        <p className="mt-2 text-gray-500">Join Motion Granted today</p>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          {/* Attorney Information */}
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-navy">Attorney Information</h2>

            <FormField
              control={form.control}
              name="full_name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Full Name</FormLabel>
                  <FormControl>
                    <Input placeholder="John Smith" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="bar_number"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Bar Number</FormLabel>
                    <FormControl>
                      <Input placeholder="12345" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="states_licensed"
                render={() => (
                  <FormItem>
                    <FormLabel>State(s) of Licensure</FormLabel>
                    <Select onValueChange={toggleState}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder={
                            selectedStates.length > 0
                              ? `${selectedStates.length} selected`
                              : 'Select states'
                          } />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {US_STATES.map(state => (
                          <SelectItem key={state} value={state}>
                            <div className="flex items-center gap-2">
                              <Checkbox checked={selectedStates.includes(state)} />
                              {state}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {selectedStates.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {selectedStates.map(state => (
                          <span
                            key={state}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-teal/10 text-xs font-medium text-navy"
                          >
                            {state}
                            <button
                              type="button"
                              onClick={() => toggleState(state)}
                              className="hover:text-red-600"
                            >
                              ×
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input type="email" placeholder="you@lawfirm.com" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Phone</FormLabel>
                    <FormControl>
                      <Input type="tel" placeholder="(555) 123-4567" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Password</FormLabel>
                    <FormControl>
                      <Input type="password" placeholder="••••••••" {...field} />
                    </FormControl>
                    <FormDescription>Minimum 8 characters</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="confirm_password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Confirm Password</FormLabel>
                    <FormControl>
                      <Input type="password" placeholder="••••••••" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </div>

          {/* Firm Information */}
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-navy">Firm Information <span className="text-sm font-normal text-gray-500">(Optional)</span></h2>

            <FormField
              control={form.control}
              name="firm_name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Firm Name</FormLabel>
                  <FormControl>
                    <Input placeholder="Smith Law Firm (or Solo Practitioner)" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="firm_address"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Firm Address</FormLabel>
                  <FormControl>
                    <Input placeholder="123 Main St, Suite 100, City, State ZIP" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="firm_phone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Firm Phone (if different)</FormLabel>
                  <FormControl>
                    <Input type="tel" placeholder="(555) 123-4567" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          {/* Terms Acceptance */}
          <div className="space-y-4">
            <FormField
              control={form.control}
              name="terms_accepted"
              render={({ field }) => (
                <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                  <FormControl>
                    <Checkbox
                      checked={!!field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                  <div className="space-y-1 leading-none">
                    <FormLabel className="font-normal cursor-pointer">
                      I have read and agree to the{' '}
                      <Link href="/terms" className="text-teal hover:underline" target="_blank">
                        Terms of Service
                      </Link>{' '}
                      and{' '}
                      <Link href="/privacy" className="text-teal hover:underline" target="_blank">
                        Privacy Policy
                      </Link>
                    </FormLabel>
                    <FormMessage />
                  </div>
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="disclaimer_accepted"
              render={({ field }) => (
                <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                  <FormControl>
                    <Checkbox
                      checked={!!field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                  <div className="space-y-1 leading-none">
                    <FormLabel className="font-normal cursor-pointer">
                      I understand that I am responsible for supervising all work product and
                      that Motion Granted does not provide legal advice or representation.{' '}
                      <Link href="/disclaimer" className="text-teal hover:underline" target="_blank">
                        View Disclaimer
                      </Link>
                    </FormLabel>
                    <FormMessage />
                  </div>
                </FormItem>
              )}
            />
          </div>

          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creating account...
              </>
            ) : (
              'Create Account'
            )}
          </Button>
        </form>
      </Form>

      <p className="mt-6 text-center text-sm text-gray-500">
        Already have an account?{' '}
        <Link href="/login" className="text-teal hover:underline font-medium">
          Sign in
        </Link>
      </p>
    </div>
  )
}
