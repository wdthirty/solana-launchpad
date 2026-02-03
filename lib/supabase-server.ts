/**
 * Server-side Supabase utilities
 *
 * This module provides secure JWT verification using Supabase's getUser() method.
 * Supabase uses HS256 (symmetric) for JWTs, so we validate tokens server-side
 * via the Supabase API rather than using JWKS (which would require RS256).
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { NextRequest } from 'next/server';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing Supabase environment variables. Please add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to your .env.local file'
  );
}

/**
 * User object returned from getUserFromToken
 * Maintains backward compatibility with existing code
 */
export interface AuthUser {
  id: string;
  email?: string;
  user_metadata: {
    wallet_address?: string;
    custom_claims?: {
      address?: string;
    };
    [key: string]: unknown;
  };
  app_metadata: Record<string, unknown>;
}

/**
 * Result from getUserFromToken
 */
export interface GetUserResult {
  user: AuthUser | null;
  supabase: SupabaseClient | null;
  /** Verified wallet address from Web3 auth (cryptographically verified) */
  walletAddress: string | null;
}

/**
 * Create a basic server-side Supabase client (unauthenticated)
 */
export const createServerSupabaseClient = () => {
  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
};

/**
 * Create a Supabase client with JWT token for authenticated database operations
 */
export const createAuthenticatedSupabaseClient = (jwtToken: string) => {
  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: {
        Authorization: `Bearer ${jwtToken}`,
      },
    },
  });
};

/**
 * Extract bearer token from request
 */
function extractBearerToken(request: NextRequest): string | null {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return null;
  }
  return authHeader.slice(7);
}

/**
 * Get user from JWT token using Supabase's getUser() method
 *
 * This function:
 * 1. Extracts the Bearer token from the Authorization header
 * 2. Verifies the JWT via Supabase's API (handles HS256 tokens)
 * 3. Extracts the wallet address from Web3 auth claims
 * 4. Returns an authenticated Supabase client for database operations
 *
 * @param request - Next.js request object
 * @returns User info, authenticated Supabase client, and verified wallet address
 */
export const getUserFromToken = async (
  request?: NextRequest
): Promise<GetUserResult> => {
  if (!request) {
    return { user: null, supabase: null, walletAddress: null };
  }

  const token = extractBearerToken(request);
  if (!token) {
    return { user: null, supabase: null, walletAddress: null };
  }

  // Create authenticated Supabase client with the token
  const authenticatedSupabase = createAuthenticatedSupabaseClient(token);

  // Verify the token by calling getUser() - this validates with Supabase's servers
  const { data: { user: supabaseUser }, error } = await authenticatedSupabase.auth.getUser();

  if (error || !supabaseUser) {
    if (error) {
      console.error('❌ getUserFromToken - Supabase getUser failed:', error.message);
    }
    return { user: null, supabase: null, walletAddress: null };
  }

  // Extract wallet address from Web3 auth custom claims
  const walletAddress = supabaseUser.user_metadata?.custom_claims?.address || null;

  // Build user object (backward compatible with existing code)
  const user: AuthUser = {
    id: supabaseUser.id,
    user_metadata: {
      wallet_address: walletAddress || undefined,
      custom_claims: walletAddress
        ? { address: walletAddress }
        : undefined,
      ...supabaseUser.user_metadata,
    },
    app_metadata: supabaseUser.app_metadata || {},
  };

  return {
    user,
    supabase: authenticatedSupabase,
    walletAddress,
  };
};

/**
 * Alias for getUserFromToken (backward compatibility)
 */
export const getAuthenticatedUser = getUserFromToken;
