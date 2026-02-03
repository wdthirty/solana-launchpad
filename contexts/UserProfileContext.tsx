'use client';

import React, { createContext, useContext, useState, useEffect, useMemo, ReactNode } from 'react';
import { useWallet } from '@/contexts/FrameworkKitWalletContext';
import { usersApi, clearApiCache } from '@/lib/api';
import { useAuth } from './AuthContext';
import { useBalanceSubscription } from '@/hooks/use-balance-subscription';
import type { TokenBalance } from '@/types/balance';

interface UserProfile {
  id: string;
  username: string;
  avatar: string;
  points: number;
  wallet_address?: string;
  verified?: boolean;
  solBalance?: number | null; // SOL balance from balance-aggregator
  tokens?: TokenBalance[]; // Platform token balances
}

interface UserProfileContextType {
  profile: UserProfile | null;
  loading: boolean;
  balanceLoading: boolean;
  error: string | null;
  refreshProfile: () => Promise<void>;
  clearProfile: () => void;
}

const UserProfileContext = createContext<UserProfileContextType | undefined>(undefined);

interface UserProfileProviderProps {
  children: ReactNode;
}

export const UserProfileProvider: React.FC<UserProfileProviderProps> = ({ children }) => {
  const { user, session, isAuthenticated } = useAuth();
  const { publicKey } = useWallet();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastFetchTime, setLastFetchTime] = useState<number>(0);

  // Use the new balance subscription hook (Ably presence with Helius fallback)
  const { sol, tokens, isLoading: balanceLoading } = useBalanceSubscription();

  // Memoize publicKey string to prevent unnecessary re-renders
  const publicKeyString = useMemo(() => publicKey?.toString(), [publicKey]);

  const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

  const fetchProfile = async (forceRefresh = false) => {
    if (!user || !session || !isAuthenticated) {
      setProfile(null);
      setError(null);
      return;
    }

    // Check if we have a recent profile and don't need to refresh
    const now = Date.now();
    if (!forceRefresh && profile && (now - lastFetchTime) < CACHE_DURATION) {
      return; // Use cached profile
    }

    setLoading(true);
    setError(null);

    try {
      // Pass wallet address and access token directly from session
      // This avoids race conditions where getSession() doesn't have cookies set yet
      const walletAddress = publicKey?.toString();
      const accessToken = session?.access_token;

      // Debug: Log if we have an access token
      if (!accessToken) {
        console.warn('[UserProfileContext] No access token available from session');
      }

      const userProfile = await usersApi.getCurrentUser(walletAddress, accessToken);
      setProfile(userProfile);
      setLastFetchTime(now);
    } catch (err: unknown) {
      // Handle 401 errors silently (user not authenticated)
      const error = err as { status?: number };
      if (error?.status === 401) {
        setProfile(null);
        setError(null);
      } else {
        const errorMessage = err instanceof Error ? err.message : 'Failed to fetch user profile';
        setError(errorMessage);
        console.error('[UserProfileContext] Error fetching user profile:', err);
      }
    } finally {
      setLoading(false);
    }
  };

  const refreshProfile = async () => {
    await fetchProfile(true);
  };

  const clearProfile = () => {
    setProfile(null);
    setError(null);
    setLastFetchTime(0);
    clearApiCache(); // Clear API cache when profile is cleared
  };

  // Fetch profile when authentication state changes OR wallet changes
  useEffect(() => {
    // Ensure we have a valid session with access_token before fetching
    if (isAuthenticated && user && publicKeyString && session?.access_token) {
      // Force refresh when wallet changes to get new user data
      // Access token is passed directly from session, avoiding cookie race conditions
      fetchProfile(true);
    } else if (!isAuthenticated) {
      clearProfile();
    }
    // Note: If authenticated but no access_token yet, we wait for session to update
  }, [isAuthenticated, user?.id, publicKeyString, session?.access_token]);

  // Merge balance data with profile (from useBalanceSubscription)
  // Even if profile hasn't loaded yet, we can still show the balance
  const profileWithBalance = useMemo(() => {
    if (!profile) {
      // If no profile but we have balance data, create a minimal profile with just balance
      if (sol !== null) {
        return {
          id: user?.id || '',
          username: '',
          avatar: '',
          points: 0,
          wallet_address: publicKey?.toString(),
          solBalance: sol,
          tokens: tokens,
        } as UserProfile;
      }
      return null;
    }
    return {
      ...profile,
      solBalance: sol,
      tokens: tokens,
    };
  }, [profile, sol, tokens, user?.id, publicKey, balanceLoading]);

  const value: UserProfileContextType = {
    profile: profileWithBalance,
    loading,
    balanceLoading,
    error,
    refreshProfile,
    clearProfile,
  };

  return (
    <UserProfileContext.Provider value={value}>
      {children}
    </UserProfileContext.Provider>
  );
};

export const useUserProfile = (): UserProfileContextType => {
  const context = useContext(UserProfileContext);
  if (context === undefined) {
    throw new Error('useUserProfile must be used within a UserProfileProvider');
  }
  return context;
};
