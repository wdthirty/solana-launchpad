import { useState, useEffect, useCallback } from 'react';
import { useWallet } from '@/contexts/FrameworkKitWalletContext';
import { useAuth as useSupabaseAuth } from '@/contexts/AuthContext';
import { useUserProfile } from '@/contexts/UserProfileContext';
import { AppErrorHandler, withErrorHandling } from '@/lib/utils/error-handler';
import type { WalletUser, AuthState } from '@/lib/types';
import { DEFAULT_AVATAR_URL } from '@/lib/config/app-config';

interface UseAuthReturn {
  user: WalletUser;
  authState: AuthState;
  isConnected: boolean;
  isConnecting: boolean;
  isLoading: boolean;
  error: string | null;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  refreshUser: () => Promise<void>;
  clearError: () => void;
}

export const useAuth = (): UseAuthReturn => {
  const { publicKey, connected, connecting, connect: connectWallet, disconnect: disconnectWallet } = useWallet();
  const { user: supabaseUser, session, loading: authLoading, signIn, signOut } = useSupabaseAuth();
  const { profile: userProfile, loading: profileLoading, refreshProfile } = useUserProfile();

  const [error, setError] = useState<string | null>(null);

  // Derive auth state from wallet and Supabase states
  const authState: AuthState = {
    user: supabaseUser ? {
      id: supabaseUser.id,
      username: userProfile?.username || 'anon',
      avatar: userProfile?.avatar || DEFAULT_AVATAR_URL,
      points: userProfile?.points || 0,
      wallet_address: supabaseUser.user_metadata?.wallet_address,
      created_at: supabaseUser.created_at,
      updated_at: supabaseUser.updated_at || supabaseUser.created_at,
    } : null,
    session,
    loading: authLoading || profileLoading,
    connectionState: (() => {
      if (authLoading || profileLoading) return 'checking-session';
      if (session && supabaseUser) return 'authenticated';
      if (connected && publicKey) return 'wallet-connected';
      if (connecting) return 'wallet-connecting';
      return 'needs-auth';
    })(),
  };

  // Derive user object
  const user: WalletUser = {
    id: supabaseUser?.id || null,
    username: userProfile?.username || 'anon',
    avatar: userProfile?.avatar || DEFAULT_AVATAR_URL,
    points: userProfile?.points || 0,
    walletAddress: publicKey?.toString() || null,
    isConnected: connected && !!publicKey,
    isAuthenticated: !!session && !!supabaseUser,
  };

  const connect = useCallback(async () => {
    try {
      setError(null);
      
      if (!connected) {
        await connectWallet();
      }
      
      if (connected && publicKey && !session) {
        await signIn();
      }
    } catch (err) {
      const appError = AppErrorHandler.handleAuthError(err);
      setError(AppErrorHandler.getErrorMessage(appError));
      AppErrorHandler.logError(appError, 'useAuth.connect');
    }
  }, [connected, publicKey, session, connectWallet, signIn]);

  const disconnect = useCallback(async () => {
    try {
      setError(null);
      await signOut();
      await disconnectWallet();
    } catch (err) {
      const appError = AppErrorHandler.handleAuthError(err);
      setError(AppErrorHandler.getErrorMessage(appError));
      AppErrorHandler.logError(appError, 'useAuth.disconnect');
    }
  }, [signOut, disconnectWallet]);

  const refreshUser = useCallback(async () => {
    const { error } = await withErrorHandling(
      () => refreshProfile(),
      AppErrorHandler.handleAuthError,
      'useAuth.refreshUser'
    );

    if (error) {
      setError(AppErrorHandler.getErrorMessage(error));
    }
  }, [refreshProfile]);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  // Auto-refresh user profile when auth state changes
  useEffect(() => {
    if (session && supabaseUser && !profileLoading) {
      refreshProfile();
    }
  }, [session, supabaseUser, profileLoading, refreshProfile]);

  return {
    user,
    authState,
    isConnected: connected && !!publicKey,
    isConnecting: connecting,
    isLoading: authLoading || profileLoading,
    error,
    connect,
    disconnect,
    refreshUser,
    clearError,
  };
};
