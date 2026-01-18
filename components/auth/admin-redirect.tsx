'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export function AdminRedirect({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [isChecking, setIsChecking] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)

  useEffect(() => {
    async function checkRole() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()

      if (user) {
        // Retry profile fetch up to 3 times
        let profile = null
        for (let attempt = 0; attempt < 3; attempt++) {
          const { data, error } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', user.id)
            .single()


          if (data && !error) {
            profile = data
            break
          }
          if (attempt < 2) {
            await new Promise(resolve => setTimeout(resolve, 500))
          }
        }

        const role = profile?.role?.toString().toLowerCase().trim()
        if (role === 'admin') {
          setIsAdmin(true)
          window.location.href = '/admin'
          return
        }
      }

      setIsChecking(false)
    }

    checkRole()
  }, [router])

  // Show loading while checking
  if (isChecking) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal"></div>
      </div>
    )
  }

  // If admin, don't render children (we're redirecting)
  if (isAdmin) {
    return null
  }

  return <>{children}</>
}
