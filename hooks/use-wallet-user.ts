'use client';

import { useWallet } from '@/contexts/FrameworkKitWalletContext';
import { useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useUserProfile } from '@/contexts/UserProfileContext';
import { DEFAULT_AVATAR_URL } from '@/lib/config/app-config';

export const useWalletUser = () => {
  const { publicKey, connected, connecting } = useWallet();
  const { user: supabaseUser, session, loading: authLoading, isAuthenticated } = useAuth();
  const { profile: userProfile, loading: profileLoading } = useUserProfile();

  const user = useMemo(() => {
    // If not authenticated with Supabase, return anonymous user
    if (!isAuthenticated || !supabaseUser || !session) {
      return {
        id: null,
        username: 'anon',
        avatar: DEFAULT_AVATAR_URL,
        points: 0,
        walletAddress: publicKey?.toString() || null,
        isConnected: connected,
        isAuthenticated: false,
      };
    }

    // User is authenticated - show their profile data
    const walletAddress = publicKey?.toString() || null;

    return {
      id: supabaseUser.id,
      username: userProfile?.username || 'anon',
      avatar: userProfile?.avatar || DEFAULT_AVATAR_URL,
      points: userProfile?.points || 0,
      walletAddress,
      isConnected: connected,
      isAuthenticated: true,
    };
  }, [connected, publicKey, supabaseUser, session, userProfile, isAuthenticated]);


  return {
    user,
    isConnected: connected,
    isConnecting: connecting,
    isLoadingPoints: authLoading || profileLoading,
    walletAddress: publicKey?.toString() || null,
    isAuthenticated,
  };
};
