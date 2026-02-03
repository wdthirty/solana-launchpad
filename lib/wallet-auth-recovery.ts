/**
 * Wallet Auth Recovery
 *
 * Utilities for detecting and recovering from stale/corrupted wallet and auth states.
 * This handles edge cases like:
 * - Old auth tokens that no longer work
 * - Wallet connected but session has different address
 * - Session exists but is invalid/expired
 * - localStorage pollution from previous deployments
 */

import { supabase, clearAuthStorage } from '@/lib/supabase';

export interface WalletAuthDiagnostics {
  /** Is wallet adapter reporting connected? */
  walletConnected: boolean;
  /** Wallet public key (if connected) */
  walletAddress: string | null;
  /** Does a Supabase session exist? */
  hasSession: boolean;
  /** Is the session valid (not expired)? */
  sessionValid: boolean;
  /** Address stored in the session */
  sessionAddress: string | null;
  /** Do wallet and session addresses match? */
  addressesMatch: boolean;
  /** Overall state assessment */
  state: 'healthy' | 'stale_session' | 'address_mismatch' | 'no_session' | 'disconnected';
  /** Recommended action */
  recommendedAction: 'none' | 'sign_in' | 'clear_and_reconnect' | 'reconnect';
}

/**
 * Diagnose the current wallet and auth state
 */
export async function diagnoseWalletAuthState(
  walletConnected: boolean,
  walletAddress: string | null
): Promise<WalletAuthDiagnostics> {
  const result: WalletAuthDiagnostics = {
    walletConnected,
    walletAddress,
    hasSession: false,
    sessionValid: false,
    sessionAddress: null,
    addressesMatch: false,
    state: 'disconnected',
    recommendedAction: 'reconnect',
  };

  // If wallet not connected, state is simple
  if (!walletConnected || !walletAddress) {
    result.state = 'disconnected';
    result.recommendedAction = 'reconnect';
    return result;
  }

  try {
    // Check for existing session
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();

    if (sessionError) {
      console.error('[WalletAuthRecovery] Error getting session:', sessionError);
      result.state = 'stale_session';
      result.recommendedAction = 'clear_and_reconnect';
      return result;
    }

    if (!session) {
      // Wallet connected but no session - need to sign in
      result.state = 'no_session';
      result.recommendedAction = 'sign_in';
      return result;
    }

    result.hasSession = true;

    // Check if session is expired
    const expiresAt = session.expires_at;
    if (expiresAt && expiresAt * 1000 < Date.now()) {
      result.state = 'stale_session';
      result.recommendedAction = 'clear_and_reconnect';
      return result;
    }

    // Validate session with server (this catches invalid/revoked tokens)
    // NOTE: We only treat specific errors as stale sessions, not network errors
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError) {
      // Check if this is a real auth error or just a network/timing issue
      const errorMessage = userError.message?.toLowerCase() || '';
      const isAuthError = errorMessage.includes('invalid') ||
                          errorMessage.includes('expired') ||
                          errorMessage.includes('not authenticated') ||
                          errorMessage.includes('jwt') ||
                          userError.status === 401 ||
                          userError.status === 403;

      if (isAuthError) {
        console.error('[WalletAuthRecovery] Session validation failed:', userError);
        result.state = 'stale_session';
        result.recommendedAction = 'clear_and_reconnect';
        return result;
      }

      // Network or timing error - don't clear session, just return healthy
      // The session might be valid, we just couldn't verify it
      console.warn('[WalletAuthRecovery] Could not verify session (network issue?):', userError);
      result.sessionValid = true;
      result.state = 'healthy';
      result.recommendedAction = 'none';
      return result;
    }

    if (!user) {
      // No user returned but no error - treat as stale
      result.state = 'stale_session';
      result.recommendedAction = 'clear_and_reconnect';
      return result;
    }

    result.sessionValid = true;

    // Check if session address matches wallet address
    result.sessionAddress = user.user_metadata?.custom_claims?.address || null;

    if (result.sessionAddress && result.sessionAddress !== walletAddress) {
      result.state = 'address_mismatch';
      result.addressesMatch = false;
      result.recommendedAction = 'clear_and_reconnect';
      return result;
    }

    result.addressesMatch = true;
    result.state = 'healthy';
    result.recommendedAction = 'none';
    return result;

  } catch (error) {
    console.error('[WalletAuthRecovery] Diagnosis error:', error);
    result.state = 'stale_session';
    result.recommendedAction = 'clear_and_reconnect';
    return result;
  }
}

/**
 * Clear all auth state and prepare for fresh sign-in
 * This is the nuclear option for recovery
 */
export async function clearAllAuthState(): Promise<void> {
  console.log('[WalletAuthRecovery] Clearing all auth state');

  // 1. Clear Supabase localStorage tokens
  clearAuthStorage();

  // 2. Clear any cookies via Supabase signOut
  try {
    await supabase.auth.signOut({ scope: 'local' });
  } catch (error) {
    console.error('[WalletAuthRecovery] Error during signOut:', error);
  }

  // 3. Clear wallet adapter localStorage (wallet name selection)
  if (typeof window !== 'undefined') {
    // The wallet adapter stores the selected wallet name
    const walletKeys = ['walletName', 'wallet-adapter-wallet-name'];
    walletKeys.forEach(key => {
      try {
        localStorage.removeItem(key);
      } catch {
        // Ignore
      }
    });
  }

  console.log('[WalletAuthRecovery] Auth state cleared');
}

/**
 * Attempt automatic recovery based on diagnostics
 * Returns true if recovery was attempted, false if state is healthy
 */
export async function attemptAutoRecovery(
  diagnostics: WalletAuthDiagnostics,
  disconnectWallet?: () => Promise<void>
): Promise<boolean> {
  switch (diagnostics.recommendedAction) {
    case 'none':
      return false;

    case 'sign_in':
      // State is fine, just need to sign in
      return false;

    case 'clear_and_reconnect':
      console.log('[WalletAuthRecovery] Auto-recovering: clearing state');
      await clearAllAuthState();

      // Disconnect wallet if possible
      if (disconnectWallet) {
        try {
          await disconnectWallet();
        } catch (error) {
          console.error('[WalletAuthRecovery] Error disconnecting wallet:', error);
        }
      }
      return true;

    case 'reconnect':
      // Just need to reconnect wallet
      return false;

    default:
      return false;
  }
}

/**
 * Get a user-friendly message for the current state
 */
export function getRecoveryMessage(diagnostics: WalletAuthDiagnostics): string | null {
  switch (diagnostics.state) {
    case 'healthy':
      return null;
    case 'stale_session':
      return 'Your session has expired. Please sign in again.';
    case 'address_mismatch':
      return 'Your wallet changed. Please sign in with your current wallet.';
    case 'no_session':
      return 'Please sign in to continue.';
    case 'disconnected':
      return 'Connect your wallet to continue.';
    default:
      return null;
  }
}

/**
 * Check if we should show a recovery UI instead of the normal flow
 */
export function needsRecoveryUI(diagnostics: WalletAuthDiagnostics): boolean {
  return diagnostics.recommendedAction === 'clear_and_reconnect';
}
