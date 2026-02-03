import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useUserProfile } from '@/contexts/UserProfileContext';

/**
 * Unified hook that determines when the app is ready to render.
 * Prevents flickering by waiting for all authentication and profile data to load.
 *
 * Returns true when:
 * - User is not authenticated (can show login UI)
 * - User is authenticated AND profile is loaded (can show user UI)
 */
export function useAppReady() {
  const { loading: authLoading, isAuthenticated } = useAuth();
  const { loading: profileLoading, profile } = useUserProfile();
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    // Wait for auth to finish loading first
    if (authLoading) {
      setIsReady(false);
      return;
    }

    // If not authenticated, we're ready to show login UI
    if (!isAuthenticated) {
      setIsReady(true);
      return;
    }

    // If authenticated, wait for profile to load
    if (isAuthenticated && !profileLoading && profile) {
      setIsReady(true);
      return;
    }

    // Still loading profile for authenticated user
    if (isAuthenticated && profileLoading) {
      setIsReady(false);
      return;
    }

  }, [authLoading, isAuthenticated, profileLoading, profile]);

  return {
    isReady,
    isAuthenticating: authLoading,
    isLoadingProfile: profileLoading && isAuthenticated,
  };
}
