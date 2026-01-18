import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

// Check if Supabase is configured
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

export const isSupabaseConfigured = !!(
  supabaseUrl &&
  supabaseAnonKey &&
  !supabaseUrl.includes('your-project') &&
  supabaseUrl.startsWith('https://')
)

export async function createClient() {
  if (!isSupabaseConfigured) {
    // Return a mock client that throws helpful errors
    return {
      auth: {
        getUser: async () => ({ data: { user: null }, error: new Error('Supabase not configured') }),
        signInWithPassword: async () => ({ data: { user: null, session: null }, error: new Error('Supabase not configured') }),
        signUp: async () => ({ data: { user: null, session: null }, error: new Error('Supabase not configured') }),
        signOut: async () => ({ error: null }),
      },
      from: () => ({
        select: () => ({ data: null, error: new Error('Supabase not configured') }),
        insert: () => ({ data: null, error: new Error('Supabase not configured') }),
        update: () => ({ data: null, error: new Error('Supabase not configured') }),
        delete: () => ({ data: null, error: new Error('Supabase not configured') }),
      }),
    } as unknown as Awaited<ReturnType<typeof createServerClient>>
  }

  const cookieStore = await cookies()

  return createServerClient(
    supabaseUrl!,
    supabaseAnonKey!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // The `setAll` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing
            // user sessions.
          }
        },
      },
    }
  )
}

export async function getUser() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

export async function getProfile() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  return profile
}
