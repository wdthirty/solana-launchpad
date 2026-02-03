'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { supabase, clearAuthStorage, isPhantomBrowser } from '@/lib/supabase';
import { User, Session } from '@supabase/supabase-js';
import { useFrameworkKitWallet } from '@/contexts/FrameworkKitWalletContext';
import { toast } from 'sonner';
import { clearApiCache } from '@/lib/api';
import { clearAllAuthState } from '@/lib/wallet-auth-recovery';
import { PublicKey } from '@solana/web3.js';

// Generic wallet provider type for Supabase Web3 auth
// Supabase expects signMessage() to return Uint8Array directly and publicKey.toBase58() for Solana
type SolanaWalletProvider = {
  signMessage: (message: Uint8Array, display?: string) => Promise<Uint8Array>;
  publicKey?: { toBytes(): Uint8Array; toBase58?(): string };
  isConnected?: boolean;
};

/**
 * Get Phantom's window provider for fallback signing in mobile in-app browser.
 * This is needed when framework-kit hasn't fully initialized but Phantom is available.
 */
function getPhantomWindowProvider(): {
  signMessage: (message: Uint8Array) => Promise<Uint8Array>;
  publicKey: PublicKey;
} | null {
  if (typeof window === 'undefined') return null;

  const phantom = (window as { phantom?: { solana?: {
    isPhantom?: boolean;
    publicKey?: { toBase58(): string; toBytes(): Uint8Array };
    signMessage?: (message: Uint8Array, encoding?: string) => Promise<{ signature: Uint8Array }>;
  } } }).phantom?.solana;

  if (!phantom?.isPhantom || !phantom.publicKey || !phantom.signMessage) {
    return null;
  }

  try {
    const pubkey = new PublicKey(phantom.publicKey.toBase58());
    return {
      signMessage: async (message: Uint8Array) => {
        const result = await phantom.signMessage!(message, 'utf8');
        return result.signature;
      },
      publicKey: pubkey,
    };
  } catch {
    return null;
  }
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  isAuthenticated: boolean;
  isSigningOut: boolean;
  signIn: (statement?: string) => Promise<void>;
  signOut: (reason?: string) => Promise<void>;
  /** Force clear all auth state and start fresh */
  resetAuthState: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const { publicKey, disconnect: disconnectWallet, connecting, autoConnecting, wallet, signMessage } = useFrameworkKitWallet();

  // Sign out when wallet disconnects or changes to a different address
  useEffect(() => {
    // Skip during initial load or sign out
    if (loading || isSigningOut) return;

    // Skip if no session (nothing to invalidate)
    if (!session || !user) return;

    // Skip if wallet is still connecting or auto-connecting
    if (connecting || autoConnecting) return;

    const sessionWalletAddress = user.user_metadata?.custom_claims?.address;

    // Wallet disconnected - sign out
    if (!publicKey) {
      console.log('[AuthContext] Wallet disconnected, signing out');
      setIsSigningOut(true);
      clearApiCache();
      clearAuthStorage();
      supabase.auth.signOut({ scope: 'local' }).finally(() => {
        setSession(null);
        setUser(null);
        setIsSigningOut(false);
      });
      return;
    }

    // Wallet changed to different address - sign out and refresh
    if (sessionWalletAddress && publicKey.toString() !== sessionWalletAddress) {
      console.log('[AuthContext] Wallet changed, signing out');
      setIsSigningOut(true);
      clearApiCache();
      clearAuthStorage();
      supabase.auth.signOut({ scope: 'local' }).finally(() => {
        window.location.reload();
      });
    }
  }, [publicKey, session, user, loading, connecting, autoConnecting, isSigningOut]);

  useEffect(() => {
    // Initialize auth state on mount
    const initializeAuth = async () => {
      try {
        const { data: { session: currentSession }, error } = await supabase.auth.getSession();

        if (error) {
          console.error('[AuthContext] Error getting session:', error);
          // Clear stale auth data on error
          clearAuthStorage();
          await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
          setLoading(false);
          return;
        }

        if (currentSession?.user) {
          // Check if session was created on a different domain (e.g., vercel.app vs launchpad.fun)
          // The SIWS URI is stored in custom_claims and must match current domain
          const sessionUri = currentSession.user.user_metadata?.custom_claims?.uri;
          const currentOrigin = typeof window !== 'undefined' ? window.location.origin : '';

          if (sessionUri && currentOrigin && !sessionUri.startsWith(currentOrigin)) {
            // Session was signed on different domain - clear it silently
            console.log('[AuthContext] Clearing session from different domain:', sessionUri);
            clearAuthStorage();
            await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
            setLoading(false);
            return;
          }

          setSession(currentSession);
          setUser(currentSession.user);
        } else {
          // No valid session - clear any stale auth data (localStorage + cookies)
          // This helps users with polluted storage from previous deployments
          clearAuthStorage();
          await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
        }
      } catch (error) {
        console.error('[AuthContext] Error initializing auth:', error);
        // Clear stale auth data on error
        clearAuthStorage();
        await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
      } finally {
        setLoading(false);
      }
    };

    initializeAuth();

    // Listen for auth state changes (sign in, sign out, token refresh, etc.)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, newSession) => {
        setSession(newSession);
        setUser(newSession?.user ?? null);
        setLoading(false);
      }
    );

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const clearStaleAuthState = async () => {
    // Clear all Supabase auth localStorage (handles stale data from previous deployments)
    clearAuthStorage();

    // Sign out locally - this clears cookies via @supabase/ssr
    // scope: 'local' avoids 403 errors with invalid tokens
    try {
      await supabase.auth.signOut({ scope: 'local' });
    } catch {
      // Ignore errors during cleanup
    }

    // Reset local state
    setSession(null);
    setUser(null);
  };

  const signIn = async (statement?: string) => {
    try {
      // Try framework-kit first, fallback to Phantom window provider for mobile in-app browser
      const phantomFallback = getPhantomWindowProvider();
      const effectivePublicKey = publicKey || phantomFallback?.publicKey;
      const effectiveSignMessage = signMessage || phantomFallback?.signMessage;

      // Ensure wallet is connected and ready before attempting sign-in
      if (!effectivePublicKey || !effectiveSignMessage) {
        toast.error('Wallet not ready', {
          description: 'Please ensure your wallet is connected and try again.',
        });
        return;
      }

      console.log('[AuthContext] signIn using:', publicKey ? 'framework-kit' : 'phantom-fallback');

      // Build wallet provider for Supabase
      const walletProvider: SolanaWalletProvider = {
        signMessage: async (message: Uint8Array) => {
          return await effectiveSignMessage(message);
        },
        publicKey: {
          toBase58: () => effectivePublicKey.toBase58(),
          toBytes: () => effectivePublicKey.toBytes(),
        },
        isConnected: true,
      };

      // Build options with wallet parameter
      const options: Parameters<typeof supabase.auth.signInWithWeb3>[0] = {
        chain: 'solana',
        statement: statement || 'I accept the Terms of Service at https://launchpad.fun/terms',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        wallet: walletProvider as any,
      };

      const { data, error } = await supabase.auth.signInWithWeb3(options);

      if (error) {
        // Check if this is a URI mismatch error (signed on different domain like localhost)
        if (error.message?.includes('URI which is not allowed') ||
            error.message?.includes('signed for another app')) {
          await clearStaleAuthState();

          // Silently clear and let user try again - no confusing message needed
          return;
        }

        throw error;
      }

      // For Phantom, we need to be more aggressive about session persistence
      if (isPhantomBrowser() && data?.session) {
        // Force set the session to ensure it's stored
        await supabase.auth.setSession({
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
        });

        // Also manually update state since onAuthStateChange might not fire
        setSession(data.session);
        setUser(data.user);

        // Small delay to ensure storage is flushed
        await new Promise(resolve => setTimeout(resolve, 100));
        return;
      }

      // Verify session was stored - if not, manually set it
      const { data: sessionCheck } = await supabase.auth.getSession();
      if (data?.session && !sessionCheck?.session) {
        await supabase.auth.setSession({
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
        });
      }
    } catch (error) {
      console.error('[AuthContext] Sign in failed:', error);
      throw error;
    }
  };

  const signOut = async (reason?: string) => {
    try {
      setIsSigningOut(true);
      clearApiCache(); // Clear cached user data
      clearAuthStorage(); // Clear localStorage auth data (especially for mobile in-app browsers)

      // Try global signOut first, fall back to local if session is invalid (403)
      const { error } = await supabase.auth.signOut();

      if (error) {
        console.error('[AuthContext] Sign out error:', error);
        // If global signOut fails (e.g., 403 due to invalid token), do local signOut
        await supabase.auth.signOut({ scope: 'local' });
      }

      // Disconnect wallet
      if (disconnectWallet) {
        try {
          await disconnectWallet();
        } catch (err) {
          console.error('[AuthContext] Wallet disconnect error:', err);
        }
      }

      // Show toast notification
      if (!reason) {
        toast.success('Signed Out', {
          description: 'You have been successfully signed out.',
        });
      }
    } catch (error) {
      console.error('[AuthContext] Sign out failed:', error);
      // Even if everything fails, clear local state
      clearAuthStorage();
      await supabase.auth.signOut({ scope: 'local' });
    } finally {
      setIsSigningOut(false);
    }
  };

  /**
   * Force reset all auth state - nuclear option for recovery
   * Use when state is corrupted and normal sign-out doesn't work
   */
  const resetAuthState = useCallback(async () => {
    console.log('[AuthContext] Resetting all auth state');
    setIsSigningOut(true);

    try {
      // Clear all auth data using the recovery utility
      await clearAllAuthState();

      // Clear API cache
      clearApiCache();

      // Disconnect wallet
      if (disconnectWallet) {
        try {
          await disconnectWallet();
        } catch (err) {
          console.error('[AuthContext] Wallet disconnect error:', err);
        }
      }

      // Reset local state
      setSession(null);
      setUser(null);

      toast.success('Connection Reset', {
        description: 'All connection data cleared. You can now reconnect.',
      });
    } catch (error) {
      console.error('[AuthContext] Reset auth state failed:', error);
    } finally {
      setIsSigningOut(false);
    }
  }, [disconnectWallet]);

  // Validate auth state when wallet connects/changes
  // This catches address mismatches (user connected different wallet than session)
  // NOTE: We only check for address mismatch, not stale sessions - let middleware handle that
  useEffect(() => {
    // Skip during loading or sign out
    if (loading || isSigningOut) return;

    // Only validate when wallet is connected AND we have an existing session
    // No point validating if there's no session to mismatch against
    if (!publicKey || !session || !user) return;

    const validateAddressMatch = () => {
      const sessionWalletAddress = user.user_metadata?.custom_claims?.address;

      // Only clear if there's an actual address mismatch
      // This is different from the wallet disconnect effect - that handles disconnect
      // This handles: user has session for wallet A, but connected wallet B
      if (sessionWalletAddress && publicKey.toString() !== sessionWalletAddress) {
        console.log('[AuthContext] Address mismatch detected, clearing session');
        toast.info('Wallet Changed', {
          description: 'Please sign in with your current wallet.',
        });

        // Clear session state - user needs to sign in with new wallet
        clearAuthStorage();
        supabase.auth.signOut({ scope: 'local' }).catch(() => {});
        setSession(null);
        setUser(null);
      }
    };

    // Run validation after a short delay to let wallet adapter settle
    const timeoutId = setTimeout(validateAddressMatch, 500);
    return () => clearTimeout(timeoutId);
  }, [publicKey, session, user, loading, isSigningOut]);

  const value: AuthContextType = {
    user,
    session,
    loading,
    isAuthenticated: !!session && !!user,
    isSigningOut,
    signIn,
    signOut,
    resetAuthState,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
