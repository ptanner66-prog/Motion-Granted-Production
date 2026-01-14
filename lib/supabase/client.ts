import { createBrowserClient } from '@supabase/ssr'

// Check if Supabase is configured
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

export const isSupabaseConfigured = !!(
  supabaseUrl &&
  supabaseAnonKey &&
  !supabaseUrl.includes('your-project') &&
  supabaseUrl.startsWith('https://')
)

export function createClient() {
  if (!isSupabaseConfigured) {
    // Return a mock client for build time
    return {
      auth: {
        getUser: async () => ({ data: { user: null }, error: new Error('Supabase not configured') }),
        signInWithPassword: async () => ({ data: { user: null, session: null }, error: new Error('Supabase not configured') }),
        signUp: async () => ({ data: { user: null, session: null }, error: new Error('Supabase not configured') }),
        signOut: async () => ({ error: null }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      },
      from: () => ({
        select: () => ({ data: null, error: new Error('Supabase not configured') }),
        insert: () => ({ data: null, error: new Error('Supabase not configured') }),
        update: () => ({ data: null, error: new Error('Supabase not configured') }),
        delete: () => ({ data: null, error: new Error('Supabase not configured') }),
      }),
    } as any
  }

  return createBrowserClient(
    supabaseUrl!,
    supabaseAnonKey!
  )
}
