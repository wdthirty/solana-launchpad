/**
 * JWT Verification using Supabase's getUser()
 *
 * This module provides JWT verification using Supabase's server-side validation.
 * Supabase uses HS256 (symmetric signing) which doesn't support JWKS, so we
 * validate tokens via Supabase's getUser() API call.
 *
 * Performance:
 * - getUser() takes ~50-200ms (network call to Supabase)
 * - This is acceptable for API routes that need wallet verification
 *
 * Security:
 * - JWTs are verified by Supabase's servers
 * - Wallet address is cryptographically verified via Web3 signature during login
 * - Can detect server-side session revocation (unlike local JWT parsing)
 *
 * @see https://supabase.com/docs/guides/auth/jwts
 */

import { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

/**
 * Verified JWT payload with wallet address extracted
 */
export interface VerifiedUser {
  /** Supabase user ID (UUID) */
  id: string;
  /** Wallet address from Web3 auth (verified via signature) */
  walletAddress: string | null;
  /** Token expiration timestamp (if available) */
  exp: number;
  /** Full user metadata */
  userMetadata: Record<string, unknown>;
}

/**
 * Result of JWT verification
 */
export interface VerifyResult {
  user: VerifiedUser | null;
  error: string | null;
}

/**
 * Extract bearer token from Authorization header
 */
function extractBearerToken(request: NextRequest): string | null {
  const authHeader = request.headers.get('authorization');

  if (!authHeader?.startsWith('Bearer ')) {
    return null;
  }

  return authHeader.slice(7); // Remove 'Bearer ' prefix
}

/**
 * Create authenticated Supabase client with token
 */
function createAuthenticatedClient(token: string) {
  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  });
}

/**
 * Verify a JWT token using Supabase's getUser() method
 *
 * @param token - The JWT token to verify
 * @returns Verified user info or null if invalid
 */
export async function verifyJwt(token: string): Promise<VerifyResult> {
  try {
    const supabase = createAuthenticatedClient(token);
    const { data: { user }, error } = await supabase.auth.getUser();

    if (error || !user) {
      console.error('[jwt-verify] Verification failed:', error?.message || 'No user returned');

      if (error?.message?.includes('expired')) {
        return { user: null, error: 'Token expired' };
      }

      if (error?.message?.includes('invalid')) {
        return { user: null, error: 'Invalid token' };
      }

      return { user: null, error: error?.message || 'Token verification failed' };
    }

    // Extract wallet address from Web3 auth custom claims
    const walletAddress = user.user_metadata?.custom_claims?.address || null;

    return {
      user: {
        id: user.id,
        walletAddress,
        exp: 0, // Supabase handles expiry server-side
        userMetadata: user.user_metadata || {},
      },
      error: null,
    };
  } catch (err) {
    const error = err as Error;
    console.error('[jwt-verify] Verification error:', error.message);
    return { user: null, error: 'Token verification failed' };
  }
}

/**
 * Verify JWT from request Authorization header
 *
 * @param request - Next.js request object
 * @returns Verified user info or null if not authenticated
 */
export async function verifyRequest(request: NextRequest): Promise<VerifyResult> {
  const token = extractBearerToken(request);

  if (!token) {
    return { user: null, error: 'No authorization token provided' };
  }

  return verifyJwt(token);
}

/**
 * Require authentication - returns user or returns error
 *
 * @param request - Next.js request object
 * @returns Verified user
 */
export async function requireAuth(request: NextRequest): Promise<VerifyResult> {
  const result = await verifyRequest(request);

  if (!result.user) {
    return { user: null, error: result.error || 'Authentication required' };
  }

  return result;
}

/**
 * Require authentication AND a verified wallet address
 *
 * @param request - Next.js request object
 * @returns Verified user with wallet address
 */
export async function requireWalletAuth(request: NextRequest): Promise<
  | { user: VerifiedUser & { walletAddress: string }; error: null }
  | { user: null; error: string }
> {
  const result = await requireAuth(request);

  if (!result.user) {
    return { user: null, error: result.error || 'Authentication required' };
  }

  if (!result.user.walletAddress) {
    return { user: null, error: 'Wallet authentication required' };
  }

  return {
    user: result.user as VerifiedUser & { walletAddress: string },
    error: null,
  };
}
