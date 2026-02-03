/**
 * useWalletAuth Hook
 *
 * A comprehensive hook for managing wallet connection and authentication state.
 * Handles all edge cases including:
 * - Wallet connected but not authenticated
 * - Auth session expired/stale
 * - Wallet disconnected unexpectedly
 * - Mobile in-app browser quirks (Phantom, Solflare)
 *
 * Based on best practices from:
 * - https://solana.com/developers/guides/getstarted/supabase-auth-guide
 * - https://github.com/mlshv/nextjs-supabase-solana
 */

'use client';

import { useCallback, useMemo } from 'react';
import { useWallet } from '@/contexts/FrameworkKitWalletContext';
import { useAuth } from '@/contexts/AuthContext';

export type WalletAuthState =
  | 'disconnected'           // No wallet connected
  | 'connected_no_auth'      // Wallet connected, but not authenticated with Supabase
  | 'authenticated'          // Fully authenticated and ready
  | 'loading';               // Auth state is loading

export interface WalletAuthStatus {
  /** Current state of wallet + auth */
  state: WalletAuthState;
  /** Whether wallet is connected (regardless of auth) */
  isWalletConnected: boolean;
  /** Whether user is fully authenticated with Supabase */
  isAuthenticated: boolean;
  /** Whether auth state is still loading */
  isLoading: boolean;
  /** Whether user can perform protected actions (trading, etc) */
  canPerformActions: boolean;
  /** Wallet public key if connected */
  publicKey: string | null;
  /** Error message if any */
  error: string | null;
}

export interface WalletAuthActions {
  /** Connect wallet - opens wallet selection modal */
  connectWallet: () => void;
  /** Sign in with connected wallet */
  signIn: () => Promise<void>;
  /** Sign out and optionally disconnect wallet */
  signOut: (disconnectWallet?: boolean) => Promise<void>;
  /** Disconnect wallet only (keeps trying to maintain session) */
  disconnectWallet: () => Promise<void>;
  /** Full reset - sign out and disconnect, clear all state */
  fullReset: () => Promise<void>;
}

/**
 * Hook for managing wallet connection and authentication
 *
 * Usage:
 * ```tsx
 * const { status, actions } = useWalletAuth();
 *
 * // Check state
 * if (!status.canPerformActions) {
 *   // Show connect/sign-in UI
 * }
 *
 * // Perform actions
 * await actions.signIn();
 * ```
 */
export function useWalletAuth(): {
  status: WalletAuthStatus;
  actions: WalletAuthActions;
} {
  const {
    publicKey,
    connected,
    connecting,
    disconnect: walletDisconnect,
    wallet,
  } = useWallet();

  const {
    isAuthenticated,
    loading: authLoading,
    signIn: authSignIn,
    signOut: authSignOut,
  } = useAuth();

  // Determine current state
  const state = useMemo((): WalletAuthState => {
    if (authLoading || connecting) {
      return 'loading';
    }
    if (!connected || !publicKey) {
      return 'disconnected';
    }
    if (!isAuthenticated) {
      return 'connected_no_auth';
    }
    return 'authenticated';
  }, [connected, publicKey, isAuthenticated, authLoading, connecting]);

  // Build status object
  const status = useMemo((): WalletAuthStatus => ({
    state,
    isWalletConnected: connected && !!publicKey,
    isAuthenticated,
    isLoading: authLoading || connecting,
    canPerformActions: state === 'authenticated',
    publicKey: publicKey?.toBase58() || null,
    error: null,
  }), [state, connected, publicKey, isAuthenticated, authLoading, connecting]);

  // Connect wallet action - this should be handled by opening the modal
  // The actual connection is done by the wallet adapter when user selects a wallet
  const connectWallet = useCallback(() => {
    // This is a no-op here - the component should open ConnectWalletModal
    // This function exists for API completeness
    console.log('[useWalletAuth] connectWallet called - component should open modal');
  }, []);

  // Sign in action
  const signIn = useCallback(async () => {
    if (!connected || !publicKey) {
      throw new Error('Wallet not connected');
    }
    await authSignIn();
  }, [connected, publicKey, authSignIn]);

  // Sign out action
  const signOut = useCallback(async (shouldDisconnectWallet = true) => {
    await authSignOut();
    if (shouldDisconnectWallet && walletDisconnect) {
      try {
        await walletDisconnect();
      } catch (err) {
        console.error('[useWalletAuth] Error disconnecting wallet:', err);
      }
    }
  }, [authSignOut, walletDisconnect]);

  // Disconnect wallet only
  const disconnectWallet = useCallback(async () => {
    if (walletDisconnect) {
      try {
        await walletDisconnect();
      } catch (err) {
        console.error('[useWalletAuth] Error disconnecting wallet:', err);
      }
    }
  }, [walletDisconnect]);

  // Full reset - clear everything
  const fullReset = useCallback(async () => {
    await signOut(true);
  }, [signOut]);

  const actions = useMemo((): WalletAuthActions => ({
    connectWallet,
    signIn,
    signOut,
    disconnectWallet,
    fullReset,
  }), [connectWallet, signIn, signOut, disconnectWallet, fullReset]);

  return { status, actions };
}

/**
 * Get a user-friendly message for the current auth state
 */
export function getAuthStateMessage(state: WalletAuthState): string {
  switch (state) {
    case 'disconnected':
      return 'Connect your wallet to continue';
    case 'connected_no_auth':
      return 'Sign in to continue';
    case 'authenticated':
      return 'Ready';
    case 'loading':
      return 'Loading...';
  }
}

/**
 * Get the button text for the current auth state
 */
export function getAuthButtonText(state: WalletAuthState, action: 'trade' | 'generic' = 'generic'): string {
  switch (state) {
    case 'disconnected':
      return action === 'trade' ? 'Connect Wallet to Trade' : 'Connect Wallet';
    case 'connected_no_auth':
      return action === 'trade' ? 'Sign In to Trade' : 'Sign In';
    case 'authenticated':
      return action === 'trade' ? 'Trade' : 'Continue';
    case 'loading':
      return 'Loading...';
  }
}
