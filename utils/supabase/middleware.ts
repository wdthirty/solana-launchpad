/**
 * Supabase Middleware Client
 *
 * Creates a Supabase client for middleware to refresh auth tokens.
 * This is critical for SSR - middleware refreshes tokens and passes them
 * to both Server Components and the browser.
 *
 * Based on Supabase's official @supabase/ssr package recommendations:
 * https://supabase.com/docs/guides/auth/server-side/nextjs
 */

import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // IMPORTANT: Do NOT use getSession() for server-side validation.
  // Use getUser() instead - it validates the JWT against Supabase's servers.
  // getSession() only reads from cookies and can be spoofed.
  //
  // For this middleware, we call getUser() to:
  // 1. Refresh the session if expired
  // 2. Validate the JWT signature
  // 3. Update cookies with fresh tokens
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Optional: Protect routes that require authentication
  // Uncomment and modify if you want to redirect unauthenticated users
  // if (
  //   !user &&
  //   !request.nextUrl.pathname.startsWith('/login') &&
  //   !request.nextUrl.pathname.startsWith('/auth')
  // ) {
  //   const url = request.nextUrl.clone()
  //   url.pathname = '/login'
  //   return NextResponse.redirect(url)
  // }

  return supabaseResponse
}
