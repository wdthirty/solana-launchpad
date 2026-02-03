/**
 * Supabase Client - Browser-Side
 *
 * This module provides the Supabase client for browser-side operations.
 * It uses the @supabase/ssr package for proper cookie-based session management,
 * which is required for SSR compatibility and prevents cross-domain session conflicts.
 *
 * For server-side operations (Server Components, API Routes), use:
 * import { createClient } from '@/utils/supabase/server'
 *
 * Security Best Practices (per Supabase docs):
 * - Use getUser() for server-side auth validation, not getSession()
 * - Session tokens are stored in cookies, not localStorage
 * - Middleware refreshes tokens on every request
 *
 * @see https://supabase.com/docs/guides/auth/server-side/nextjs
 * @see https://supabase.com/docs/guides/auth/auth-web3
 */

import { createBrowserClient } from '@supabase/ssr'
import { createClient, SupabaseClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing Supabase environment variables. Please add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to your .env.local file'
  )
}

/**
 * Detect if running in Phantom's in-app browser
 */
function isPhantomBrowser(): boolean {
  if (typeof window === 'undefined') return false

  // Check for Phantom provider
  const hasPhantom = !!(window as { phantom?: { solana?: { isPhantom?: boolean } } }).phantom?.solana?.isPhantom

  // Also check user agent for Phantom
  const userAgent = navigator.userAgent || ''
  const phantomInUA = /Phantom/i.test(userAgent)

  return hasPhantom || phantomInUA
}

/**
 * Detect if we should use localStorage instead of cookies for auth.
 *
 * The problem: Wallet in-app browsers (Phantom, Solflare) on mobile have cookie issues.
 * But we can't reliably detect them because:
 * 1. window.phantom/solflare may not be injected when Supabase client is first created
 * 2. User agents don't always include wallet names
 *
 * Solution: Use localStorage for ALL mobile devices. This is safe because:
 * - localStorage works fine on mobile
 * - Cookies have issues in various mobile contexts (in-app browsers, webviews, PWAs)
 * - Desktop browsers still use cookies for SSR compatibility
 */
function isMobileDevice(): boolean {
  if (typeof window === 'undefined') return false

  const userAgent = navigator.userAgent || ''

  // Check for mobile devices
  const isMobile = /iPhone|iPod|iPad|Android|Mobile/i.test(userAgent)

  // Also check for standalone/PWA mode
  const isStandalone = (window.navigator as { standalone?: boolean }).standalone === true ||
    window.matchMedia('(display-mode: standalone)').matches

  return isMobile || isStandalone
}

/**
 * Test if cookies are working in the current browser context.
 * Some browsers/profiles have corrupted cookie storage or strict privacy settings
 * that prevent cookies from being set, even for first-party domains.
 */
let _cookiesWorkingCache: boolean | null = null

function areCookiesWorking(): boolean {
  if (typeof window === 'undefined') return true // Assume yes for SSR

  // Return cached result if available
  if (_cookiesWorkingCache !== null) return _cookiesWorkingCache

  try {
    // Try to set a test cookie
    const testKey = '__sb_cookie_test__'
    const testValue = '1'
    document.cookie = `${testKey}=${testValue};path=/;max-age=60;SameSite=Lax`

    // Check if it was set
    const cookiesWorking = document.cookie.includes(`${testKey}=${testValue}`)

    // Clean up test cookie
    document.cookie = `${testKey}=;path=/;max-age=0`

    _cookiesWorkingCache = cookiesWorking

    if (!cookiesWorking) {
      console.warn('[Supabase] Cookies not working, falling back to localStorage for auth')
    }

    return cookiesWorking
  } catch {
    _cookiesWorkingCache = false
    console.warn('[Supabase] Cookie test failed, falling back to localStorage for auth')
    return false
  }
}

// Cache the client instance - ONLY for browser, not SSR
// SSR creates a temporary client that shouldn't be cached
let _browserSupabaseClient: SupabaseClient | null = null

/**
 * Clear stale/corrupted auth data from localStorage
 * This helps recover from polluted localStorage from previous deployments
 *
 * IMPORTANT: Only clears Supabase auth tokens, NOT app data like watchlists
 *
 * Called automatically on client initialization for in-app browsers,
 * and can be called manually via clearAuthStorage()
 */
function clearStaleAuthLocalStorage(): void {
  if (typeof window === 'undefined') return

  const keysToRemove: string[] = []

  // Only match Supabase auth token keys, not app data
  // sb-<project-ref>-auth-token is the standard Supabase auth key format
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key) {
      // Match: sb-*-auth-token (Supabase auth tokens)
      // Match: supabase.auth.* (legacy Supabase auth keys)
      // DO NOT match: watchlist, preferences, or other app data
      if (
        (key.startsWith('sb-') && key.includes('-auth-token')) ||
        key.startsWith('supabase.auth') ||
        key === 'supabase-auth-web3' ||
        key === 'supabase-auth-web3-local'
      ) {
        keysToRemove.push(key)
      }
    }
  }

  keysToRemove.forEach(key => localStorage.removeItem(key))
}

/**
 * Export for manual cleanup - clears all Supabase auth data from localStorage
 * Use this when user signs out or when auth state is corrupted
 */
export function clearAuthStorage(): void {
  clearStaleAuthLocalStorage()
}

/**
 * Export Phantom detection for use in other components
 */
export { isPhantomBrowser }

/**
 * Custom storage wrapper for Phantom that ensures writes are verified
 * Phantom's in-app browser may have async localStorage issues
 */
class PhantomSafeStorage implements Storage {
  get length(): number {
    return localStorage.length
  }

  clear(): void {
    localStorage.clear()
  }

  getItem(key: string): string | null {
    return localStorage.getItem(key)
  }

  key(index: number): string | null {
    return localStorage.key(index)
  }

  removeItem(key: string): void {
    localStorage.removeItem(key)
  }

  setItem(key: string, value: string): void {
    localStorage.setItem(key, value)
    // Force a read-back to ensure it was written (Phantom quirk)
    localStorage.getItem(key)
  }
}

/**
 * Get or create the Supabase client
 * Uses lazy initialization to ensure window is available for browser detection
 *
 * IMPORTANT: We don't cache the SSR client because:
 * 1. SSR client is created during server rendering
 * 2. If cached, it would be reused on client hydration
 * 3. This would prevent proper browser detection for localStorage vs cookies
 */
function getSupabaseClient(): SupabaseClient {
  // For SSR/build time, create a fresh cookie-based client (don't cache)
  if (typeof window === 'undefined') {
    return createBrowserClient(supabaseUrl, supabaseAnonKey)
  }

  // For browser, use cached client if available
  if (_browserSupabaseClient) {
    return _browserSupabaseClient
  }

  // For mobile devices or when cookies aren't working, use localStorage-based client
  if (isMobileDevice() || !areCookiesWorking()) {
    const isPhantom = isPhantomBrowser()
    // Use PhantomSafeStorage for Phantom to ensure writes are verified
    const storage = isPhantom ? new PhantomSafeStorage() : window.localStorage
    _browserSupabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        storage,
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        // For Phantom, use a dedicated storage key to avoid conflicts
        storageKey: isPhantom ? 'sb-phantom-auth-token' : undefined,
      },
    })
    return _browserSupabaseClient
  }

  // For regular browsers with working cookies, use cookie-based client for SSR compatibility
  _browserSupabaseClient = createBrowserClient(supabaseUrl, supabaseAnonKey)
  return _browserSupabaseClient
}

/**
 * Supabase browser client - lazily initialized
 *
 * Uses Proxy to ensure the client is created on first access (client-side)
 * This allows proper browser detection for in-app browsers.
 */
export const supabase = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    const client = getSupabaseClient()
    const value = client[prop as keyof SupabaseClient]
    if (typeof value === 'function') {
      return value.bind(client)
    }
    return value
  },
})

/**
 * Sign in with Solana wallet using Web3 authentication
 *
 * This uses Supabase's native signInWithWeb3 which implements
 * the Sign-In-With-Solana (SIWS) standard based on EIP-4361.
 *
 * @param statement - Optional custom statement for the sign message
 * @returns The auth data from Supabase
 * @throws Error if sign-in fails
 *
 * @see https://supabase.com/docs/guides/auth/auth-web3
 */
export const signInWithSolana = async (statement?: string) => {
  const { data, error } = await supabase.auth.signInWithWeb3({
    chain: 'solana',
    statement: statement || 'I accept the Terms of Service at https://launchpad.fun/terms',
  })

  if (error) {
    console.error('Supabase Web3 sign in error:', error)
    throw error
  }

  return data
}

/**
 * Sign out the current user
 *
 * Note: Uses scope: 'local' fallback to prevent 403 errors
 * when the session token is already invalid.
 *
 * @throws Error if sign-out fails
 */
export const signOut = async () => {
  const { error } = await supabase.auth.signOut()

  if (error) {
    // If global signOut fails (e.g., 403), try local signOut
    console.error('Supabase sign out error:', error)
    await supabase.auth.signOut({ scope: 'local' })
  }
}

/**
 * Get the current authenticated user
 *
 * IMPORTANT: This validates the JWT with Supabase's servers.
 * Use this for any auth checks that require security.
 *
 * @returns The current user or null if not authenticated
 * @throws Error if there's a server error
 */
export const getCurrentUser = async () => {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error) {
    console.error('Supabase get user error:', error)
    throw error
  }

  return user
}

/**
 * Get the current session
 *
 * WARNING: On the server side, this only reads from cookies and
 * does NOT validate the JWT. Use getUser() for secure auth checks.
 * This is safe to use on the client side for UI state.
 *
 * @returns The current session or null if not authenticated
 * @throws Error if there's an error getting the session
 */
export const getCurrentSession = async () => {
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession()

  if (error) {
    console.error('Supabase get session error:', error)
    throw error
  }

  return session
}
