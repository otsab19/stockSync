import { createServerClient } from '@supabase/ssr'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { Database } from '@/types/supabase'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

export function hasSupabaseEnv() {
  return Boolean(supabaseUrl && supabaseAnonKey)
}

export function getSupabaseSetupMessage() {
  return 'Supabase environment variables are missing. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to .env.local.'
}

export function getSupabaseServiceRoleSetupMessage() {
  return 'Supabase service role key is missing. Add SUPABASE_SERVICE_ROLE_KEY to server environment variables for cron jobs.'
}

export async function createClient() {
  const url = supabaseUrl
  const anonKey = supabaseAnonKey

  if (!url || !anonKey) {
    return null
  }

  const cookieStore = await cookies()

  return createServerClient<Database>(
    url,
    anonKey,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet: Array<{ name: string; value: string; options?: Parameters<typeof cookieStore.set>[2] }>) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
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

export function createServiceRoleClient() {
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    return null
  }

  return createSupabaseClient<Database>(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })
}
