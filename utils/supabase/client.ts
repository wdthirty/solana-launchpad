/**
 * Supabase Browser Client
 *
 * This client is for use in Client Components (browser-side).
 * It uses cookies for session storage to support SSR and prevent
 * cross-domain session conflicts.
 *
 * Based on Supabase's official @supabase/ssr package recommendations:
 * https://supabase.com/docs/guides/auth/server-side/nextjs
 */

import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
