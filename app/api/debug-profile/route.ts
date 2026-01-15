import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError) {
      return NextResponse.json({
        error: 'Auth error',
        details: authError.message
      })
    }

    if (!user) {
      return NextResponse.json({ error: 'Not authenticated - no user found' })
    }

    // Try to get the profile
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single()

    // Also try a raw query to check RLS
    const { data: allProfiles, error: allError } = await supabase
      .from('profiles')
      .select('id, role')

    return NextResponse.json({
      authenticated: true,
      userId: user.id,
      email: user.email,
      profile: profile,
      profileError: profileError?.message || null,
      profileErrorCode: profileError?.code || null,
      visibleProfiles: allProfiles?.length || 0,
      allProfilesError: allError?.message || null,
      roleValue: profile?.role,
      roleType: typeof profile?.role,
      isExactlyAdmin: profile?.role === 'admin',
      roleLowerTrimmed: profile?.role?.toString().toLowerCase().trim()
    })
  } catch (e: unknown) {
    const errorMessage = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ error: 'Caught exception', details: errorMessage })
  }
}
