'use client';

import React, { useState, useMemo, useEffect, useCallback, memo, Suspense } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Copy, Check, ExternalLink, Edit2, X, Loader2, LogOut } from 'lucide-react';
import { VerifiedBadge } from '@/components/ui/verified-badge';
import { TruncatedAddress } from '@/components/TrucatedAddress';
import { useWalletUser } from '@/hooks/use-wallet-user';
import { useUserProfile } from '@/contexts/UserProfileContext';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { useQueryClient } from '@tanstack/react-query';
import { useWallet } from '@/contexts/FrameworkKitWalletContext';
import { useAuth } from '@/contexts/AuthContext';
import { TokenImage } from '@/components/TokenImage';
import {
  useProfileData,
  useWalletBalances,
  useFollowStatus,
  UserProfile,
  UserStats,
  Token,
  Follower,
  CreatorRewards,
  RewardsChartPoint,
  ProfileDataResponse,
} from '@/hooks/useProfileData';
import { useSolPrice } from '@/contexts/SolPriceContext';
import { validateUsername } from '@/lib/utils/username-validation';

// Lazy load heavy Solana dependencies - only when claiming rewards
const loadClaimDependencies = async () => {
  const [{ RewardClaimBuilder }, { getConnection }, { VersionedTransaction }] = await Promise.all([
    import('@/lib/services/reward-claim-builder.service'),
    import('@/lib/solana/config'),
    import('@solana/web3.js'),
  ]);
  return { RewardClaimBuilder, getConnection, VersionedTransaction };
};

// Type for Phantom's signAndSendAllTransactions
interface PhantomProvider {
  signAndSendAllTransactions: (
    transactions: unknown[], // VersionedTransaction[] - type is lazy loaded
    options?: { skipPreflight?: boolean; preflightCommitment?: string }
  ) => Promise<{ signatures: string[]; publicKey: { toBase58: () => string } }>;
  isPhantom?: boolean;
}

// Get Phantom provider if available
function getPhantomProvider(): PhantomProvider | null {
  if (typeof window === 'undefined') return null;
  const provider = (window as any).phantom?.solana;
  if (provider?.isPhantom) {
    return provider as PhantomProvider;
  }
  return null;
}

// Token rewards type
interface TokenRewards {
  tokenAddress: string;
  tokenName: string;
  tokenSymbol: string;
  quoteToken: 'SOL' | 'USDC';
  dbcFeesSol: number;
  dbcFeesUsdc: number;
  dammFeesSol: number;
  dammFeesUsdc: number;
  migrationFeeClaimable: boolean;
  migrationFeeSol: number;
  totalClaimableSol: number;
  totalClaimableUsdc: number;
  // OCN special token flag - uses custom claim flow
  isOcnToken?: boolean;
}

// Skeleton components for progressive loading
function ProfileSkeleton() {
  return (
    <div className="min-h-screen">
      <div className="flex-1 p-4 md:p-6 lg:p-8 overflow-auto">
        <div className="max-w-5xl mx-auto">
            {/* Profile & Main Content */}
            <div className="space-y-6">
              {/* Profile Header */}
              <div className="flex items-start gap-4 animate-pulse">
                <div className="w-20 h-20 rounded-full bg-muted flex-shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="h-7 w-36 bg-muted rounded" />
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="h-7 w-32 bg-muted rounded-md" />
                    <div className="h-5 w-16 bg-muted rounded" />
                  </div>
                </div>
              </div>
              {/* Stats Row */}
              <div className="flex items-center gap-6 animate-pulse">
                <div className="text-center">
                  <div className="h-7 w-10 bg-muted rounded mx-auto mb-1" />
                  <div className="h-4 w-16 bg-muted rounded mx-auto" />
                </div>
                <div className="text-center">
                  <div className="h-7 w-10 bg-muted rounded mx-auto mb-1" />
                  <div className="h-4 w-16 bg-muted rounded mx-auto" />
                </div>
                <div className="text-center">
                  <div className="h-7 w-10 bg-muted rounded mx-auto mb-1" />
                  <div className="h-4 w-24 bg-muted rounded mx-auto" />
                </div>
              </div>
              {/* Tabs */}
              <div className="flex gap-6 animate-pulse">
                <div className="h-6 w-20 bg-muted rounded" />
                <div className="h-6 w-14 bg-muted rounded" />
                <div className="h-6 w-20 bg-muted rounded" />
                <div className="h-6 w-20 bg-muted rounded" />
              </div>
              {/* Content placeholder - Balance cards */}
              <div className="space-y-3 animate-pulse">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="bg-muted/50 border border-border/50 rounded-lg p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-muted" />
                        <div className="space-y-2">
                          <div className="h-5 w-28 bg-muted rounded" />
                          <div className="h-4 w-20 bg-muted rounded" />
                        </div>
                      </div>
                      <div className="h-5 w-20 bg-muted rounded" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
        </div>
      </div>
    </div>
  );
}

function BalancesSkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="bg-muted/50 border border-border/50 rounded-lg p-4 animate-pulse">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-muted" />
              <div className="space-y-2">
                <div className="h-5 w-28 bg-muted rounded" />
                <div className="h-4 w-20 bg-muted rounded" />
              </div>
            </div>
            <div className="h-5 w-20 bg-muted rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}

// Simple area chart component for rewards growth - memoized for performance
const RewardsChart = memo(function RewardsChart({ data }: { data: RewardsChartPoint[] }) {
  const chartData = useMemo(() => {
    if (!data || data.length === 0) {
      return [];
    }
    // If only 1 data point, add a starting point at 0 to show growth
    if (data.length === 1) {
      const point = data[0];
      const startDate = new Date(point.date);
      startDate.setDate(startDate.getDate() - 1); // 1 day before
      return [
        { date: startDate.toISOString(), total: 0 },
        point,
      ];
    }
    return data;
  }, [data]);

  if (chartData.length === 0) {
    return (
      <div className="h-40 flex items-center justify-center typo-body text-muted-foreground">
        No rewards history yet
      </div>
    );
  }

  // Calculate SVG path for area chart
  const width = 400;
  const height = 140;
  const padding = { top: 10, right: 10, bottom: 10, left: 10 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  const maxValue = Math.max(...chartData.map((d) => d.total), 0.001);
  const minValue = 0;

  const points = chartData.map((d, i) => {
    const x = padding.left + (i / Math.max(chartData.length - 1, 1)) * chartWidth;
    const y = padding.top + chartHeight - ((d.total - minValue) / (maxValue - minValue)) * chartHeight;
    return { x, y };
  });

  // Create smooth path
  const linePath = points.map((p, i) => (i === 0 ? `M ${p.x} ${p.y}` : `L ${p.x} ${p.y}`)).join(' ');
  const areaPath = `${linePath} L ${points[points.length - 1].x} ${height - padding.bottom} L ${padding.left} ${height - padding.bottom} Z`;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-40" preserveAspectRatio="none">
      <defs>
        <linearGradient id="rewardsGradient" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="var(--vivid-tangerine)" stopOpacity="0.4" />
          <stop offset="100%" stopColor="var(--vivid-tangerine)" stopOpacity="0.05" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill="url(#rewardsGradient)" />
      <path d={linePath} fill="none" stroke="var(--vivid-tangerine)" strokeWidth="2" />
    </svg>
  );
});

type TabType = 'balances' | 'coins' | 'followers' | 'following';
const VALID_TABS: TabType[] = ['balances', 'coins', 'followers', 'following'];

/**
 * Inner component that uses useSearchParams - must be wrapped in Suspense
 */
function ProfilePageInner() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const slug = params.slug as string;
  const { user: currentUser, isAuthenticated } = useWalletUser();
  const { refreshProfile } = useUserProfile();
  const queryClient = useQueryClient();

  // React Query hooks - profile loads fast, balances load progressively
  const {
    data: profileData,
    isLoading: isProfileLoading,
    error: profileError,
  } = useProfileData(slug);

  // Get the resolved wallet address from profile data (handles username slugs)
  const walletAddress = profileData?.walletAddress || slug;

  const {
    data: balanceData,
    isLoading: isBalanceLoading,
  } = useWalletBalances(walletAddress);

  const { solPrice } = useSolPrice();

  const { data: isFollowing = false } = useFollowStatus(
    walletAddress,
    currentUser?.walletAddress,
    isAuthenticated
  );

  // Get initial tab from URL or default to 'balances'
  const getInitialTab = (): TabType => {
    const viewParam = searchParams.get('view');
    if (viewParam && VALID_TABS.includes(viewParam as TabType)) {
      return viewParam as TabType;
    }
    return 'balances';
  };

  // Wallet hooks for claiming rewards
  const { publicKey, signTransaction, disconnect } = useWallet();
  const { signOut } = useAuth();

  // Local state for UI interactions
  const [activeTab, setActiveTab] = useState<TabType>(getInitialTab);
  const [copied, setCopied] = useState(false);
  const [isEditingUsername, setIsEditingUsername] = useState(false);
  const [editedUsername, setEditedUsername] = useState('');
  const [isSavingUsername, setIsSavingUsername] = useState(false);
  const [isFollowingLoading, setIsFollowingLoading] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [isDraggingAvatar, setIsDraggingAvatar] = useState(false);
  const [localIsFollowing, setLocalIsFollowing] = useState<boolean | null>(null);

  // Token rewards state (for claim buttons)
  const [tokenRewards, setTokenRewards] = useState<TokenRewards[]>([]);
  const [isLoadingRewards, setIsLoadingRewards] = useState(true); // Track on-chain rewards loading
  const [claimingTokenAddress, setClaimingTokenAddress] = useState<string | null>(null);

  // Public rewards for viewing other profiles (unauthenticated)
  const [publicRewards, setPublicRewards] = useState<{
    totalClaimableSol: number;
    totalClaimableUsdc: number;
    totalClaimedSol: number;
    totalClaimedUsdc: number;
  } | null>(null);

  // Pagination state for coins tab
  const [coinsPage, setCoinsPage] = useState(1);
  const COINS_PER_PAGE = 10;

  // Sync URL when tab changes
  const handleTabChange = (tab: TabType) => {
    setActiveTab(tab);
    const newUrl = `/profile/${slug}?view=${tab}`;
    router.replace(newUrl, { scroll: false });
  };

  // Sync tab state when URL changes (e.g., browser back/forward)
  useEffect(() => {
    const viewParam = searchParams.get('view');
    if (viewParam && VALID_TABS.includes(viewParam as TabType)) {
      setActiveTab(viewParam as TabType);
    }
  }, [searchParams]);

  // Determine if viewing own profile
  const isOwnProfile = currentUser?.walletAddress === walletAddress;

  // Fetch public rewards for non-own profiles (anyone can view)
  useEffect(() => {
    const fetchPublicRewards = async () => {
      // Only fetch for non-own profiles or unauthenticated users
      if (isOwnProfile && isAuthenticated) {
        setPublicRewards(null);
        return;
      }

      if (!walletAddress) {
        setPublicRewards(null);
        setIsLoadingRewards(false);
        return;
      }

      setIsLoadingRewards(true);

      try {
        const response = await fetch(`/api/rewards/public/${walletAddress}`);
        if (response.ok) {
          const data = await response.json();
          if (data.success && data.data) {
            setPublicRewards({
              totalClaimableSol: data.data.totalClaimableSol,
              totalClaimableUsdc: data.data.totalClaimableUsdc || 0,
              totalClaimedSol: data.data.totalClaimedSol,
              totalClaimedUsdc: data.data.totalClaimedUsdc || 0,
            });
          }
        }
      } catch (error) {
        console.error('Error fetching public rewards:', error);
      } finally {
        setIsLoadingRewards(false);
      }
    };

    fetchPublicRewards();
  }, [isOwnProfile, isAuthenticated, walletAddress]);

  // Fetch token rewards for own profile (to enable claim buttons)
  // Uses sessionStorage cache to avoid RPC calls on every page visit
  useEffect(() => {
    const CACHE_KEY = `rewards_${walletAddress}`;
    const CACHE_TTL = 60 * 1000; // 60 seconds

    const fetchTokenRewards = async () => {
      if (!isOwnProfile || !walletAddress || !isAuthenticated) {
        setTokenRewards([]);
        if (isOwnProfile) setIsLoadingRewards(false);
        return;
      }

      // Check sessionStorage cache first
      try {
        const cached = sessionStorage.getItem(CACHE_KEY);
        if (cached) {
          const { data: cachedData, timestamp } = JSON.parse(cached);
          const age = Date.now() - timestamp;
          if (age < CACHE_TTL) {
            // Cache is fresh - use it immediately, no loading state
            setTokenRewards(cachedData);
            setIsLoadingRewards(false);
            return;
          }
          // Cache is stale but exists - show it immediately while fetching fresh data
          setTokenRewards(cachedData);
          setIsLoadingRewards(false); // Don't show loading, we have stale data to show
        } else {
          // No cache - show loading state
          setIsLoadingRewards(true);
        }
      } catch {
        // sessionStorage error - continue to fetch
        setIsLoadingRewards(true);
      }

      try {
        // Get session for auth header
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) {
          setTokenRewards([]);
          setIsLoadingRewards(false);
          return;
        }

        const response = await fetch(`/api/rewards/${walletAddress}`, {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        });

        if (!response.ok) {
          if (response.status === 404) {
            setTokenRewards([]);
            setIsLoadingRewards(false);
            // Cache empty result too
            sessionStorage.setItem(CACHE_KEY, JSON.stringify({ data: [], timestamp: Date.now() }));
            return;
          }
          throw new Error('Failed to fetch rewards');
        }

        const data = await response.json();
        if (data.success && data.data?.tokens) {
          // Filter out tokens with less than 0.01 SOL or 0.01 USDC claimable (minimum threshold)
          const MIN_CLAIMABLE = 0.01;
          const filteredTokens = data.data.tokens.filter(
            (t: TokenRewards) => t.totalClaimableSol >= MIN_CLAIMABLE || t.totalClaimableUsdc >= MIN_CLAIMABLE
          );
          setTokenRewards(filteredTokens);
          // Cache the result
          sessionStorage.setItem(CACHE_KEY, JSON.stringify({ data: filteredTokens, timestamp: Date.now() }));
        }
      } catch (error) {
        console.error('Error fetching token rewards:', error);
        // Don't clear tokenRewards if we had cached data - keep showing stale
      } finally {
        setIsLoadingRewards(false);
      }
    };

    fetchTokenRewards();
  }, [isOwnProfile, walletAddress, isAuthenticated]);

  // Use local state if we've toggled, otherwise use server state
  const effectiveIsFollowing = localIsFollowing !== null ? localIsFollowing : isFollowing;

  const copyToClipboard = async () => {
    if (walletAddress) {
      await navigator.clipboard.writeText(walletAddress);
      setCopied(true);
      toast.success('Wallet address copied!');
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const getInitials = (username: string) => {
    return username
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const handleSaveUsername = async () => {
    if (!editedUsername.trim() || editedUsername.trim() === displayProfile.username) {
      handleCancelEdit();
      return;
    }

    // Validate username before sending to server
    const validationError = validateUsername(editedUsername);
    if (validationError) {
      toast.error(validationError);
      return;
    }

    try {
      setIsSavingUsername(true);

      const { data: { session }, error: sessionError } = await supabase.auth.getSession();

      if (sessionError || !session) {
        throw new Error('Not authenticated. Please log in again.');
      }

      const headers: HeadersInit = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      };

      if (walletAddress) {
        headers['x-wallet-address'] = walletAddress;
      }

      const response = await fetch('/api/users/current', {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ username: editedUsername.trim() }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update username');
      }

      const newUsername = editedUsername.trim();

      // Optimistically update the React Query cache with the new username immediately
      queryClient.setQueryData(['profile', slug], (oldData: ProfileDataResponse | undefined) => {
        if (!oldData) return oldData;
        return {
          ...oldData,
          profile: oldData.profile ? { ...oldData.profile, username: newUsername } : null,
        };
      });

      // Refresh the global user profile context (don't await - let it run in background)
      refreshProfile();

      toast.success('Username updated successfully');
      setIsEditingUsername(false);
    } catch (error: any) {
      console.error('Error updating username:', error);
      toast.error(error.message || 'Failed to update username');
    } finally {
      setIsSavingUsername(false);
    }
  };

  const handleCancelEdit = () => {
    setIsEditingUsername(false);
    setEditedUsername('');
  };

  const processAvatarFile = async (file: File) => {
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      toast.error('Invalid file type. Only JPEG, PNG, GIF, and WebP images are allowed.');
      return;
    }

    const maxSize = 5 * 1024 * 1024;
    if (file.size > maxSize) {
      toast.error('File size too large. Maximum size is 5MB.');
      return;
    }

    try {
      setIsUploadingAvatar(true);

      const { data: { session }, error: sessionError } = await supabase.auth.getSession();

      if (sessionError || !session) {
        throw new Error('Not authenticated. Please log in again.');
      }

      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/users/current/avatar', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to upload avatar');
      }

      const updatedUser = await response.json();

      // Update the React Query cache immediately with the new avatar URL
      queryClient.setQueryData(['profile', slug], (oldData: ProfileDataResponse | undefined) => {
        if (!oldData) return oldData;
        return {
          ...oldData,
          profile: oldData.profile ? { ...oldData.profile, avatar: updatedUser.avatar } : null,
        };
      });

      await refreshProfile();

      toast.success('Profile picture updated successfully');
    } catch (error: any) {
      console.error('Error uploading avatar:', error);
      toast.error(error.message || 'Failed to upload profile picture');
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  const handleAvatarUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    await processAvatarFile(file);
    event.target.value = '';
  };

  const handleAvatarDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (isOwnProfile && !isUploadingAvatar) {
      setIsDraggingAvatar(true);
    }
  };

  const handleAvatarDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingAvatar(false);
  };

  const handleAvatarDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingAvatar(false);
    if (!isOwnProfile || isUploadingAvatar) return;
    const file = e.dataTransfer.files?.[0];
    if (file) {
      await processAvatarFile(file);
    }
  };

  const handleLogout = async () => {
    try {
      setIsLoggingOut(true);
      await signOut();
      if (disconnect) {
        await disconnect();
      }
      router.push('/');
    } catch (error) {
      toast.error('Failed to log out. Please try again.');
    } finally {
      setIsLoggingOut(false);
    }
  };

  const handleFollowToggle = async () => {
    if (!isAuthenticated) {
      toast.error('Please log in to follow users');
      return;
    }

    // Store previous state for rollback on error
    const previousFollowingState = effectiveIsFollowing;
    const newFollowingState = !effectiveIsFollowing;

    // OPTIMISTIC UPDATE: Update UI immediately before API call
    setLocalIsFollowing(newFollowingState);
    setIsFollowingLoading(true);

    // Build current user as follower object
    const meAsFollower: Follower = {
      id: currentUser?.id || '',
      username: currentUser?.username || currentUser?.walletAddress?.slice(0, 8) || '',
      avatar: currentUser?.avatar || 'https://ipfs.io/ipfs/bafkreifn2verhnir6r3lj6rmu4tdtmcpoyfl7epvm7y2nvpwsubbha6ora',
      wallet_address: currentUser?.walletAddress || '',
    };

    // Update profile cache immediately
    queryClient.setQueryData(['profile', slug], (oldData: ProfileDataResponse | undefined) => {
      if (!oldData) return oldData;

      const followerDelta = newFollowingState ? 1 : -1;

      // Update followers list
      let newFollowers = [...(oldData.followers || [])];
      if (newFollowingState) {
        // Add current user to followers if not already there
        if (!newFollowers.some(f => f.wallet_address === meAsFollower.wallet_address)) {
          newFollowers = [meAsFollower, ...newFollowers];
        }
      } else {
        // Remove current user from followers
        newFollowers = newFollowers.filter(f => f.wallet_address !== meAsFollower.wallet_address);
      }

      return {
        ...oldData,
        stats: {
          ...oldData.stats,
          followers: Math.max(0, (oldData.stats?.followers || 0) + followerDelta),
        },
        followers: newFollowers,
      };
    });

    // Update follow status cache immediately
    queryClient.setQueryData(['followStatus', walletAddress, currentUser?.walletAddress], newFollowingState);

    try {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();

      if (sessionError || !session) {
        throw new Error('Not authenticated. Please log in again.');
      }

      const action = newFollowingState ? 'follow' : 'unfollow';
      const headers: HeadersInit = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      };

      const response = await fetch(`/api/users/wallet/${walletAddress}/follow`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ action }),
      });

      if (!response.ok) {
        const errorData = await response.json();

        if (response.status === 503) {
          throw new Error('Follow feature is not yet set up.');
        }

        throw new Error(errorData.error || 'Failed to follow/unfollow user');
      }

      toast.success(newFollowingState ? 'Now following this user' : 'Unfollowed this user');
    } catch (error: any) {
      console.error('Error toggling follow:', error);

      // ROLLBACK: Revert optimistic update on error
      setLocalIsFollowing(previousFollowingState);

      // Revert profile cache
      queryClient.setQueryData(['profile', slug], (oldData: ProfileDataResponse | undefined) => {
        if (!oldData) return oldData;

        const followerDelta = previousFollowingState ? 1 : -1;
        let newFollowers = [...(oldData.followers || [])];

        if (previousFollowingState) {
          // Was following, add back
          if (!newFollowers.some(f => f.wallet_address === meAsFollower.wallet_address)) {
            newFollowers = [meAsFollower, ...newFollowers];
          }
        } else {
          // Was not following, remove
          newFollowers = newFollowers.filter(f => f.wallet_address !== meAsFollower.wallet_address);
        }

        return {
          ...oldData,
          stats: {
            ...oldData.stats,
            followers: Math.max(0, (oldData.stats?.followers || 0) + followerDelta),
          },
          followers: newFollowers,
        };
      });

      // Revert follow status cache
      queryClient.setQueryData(['followStatus', walletAddress, currentUser?.walletAddress], previousFollowingState);

      if (
        error.message?.includes('Could not find the table') ||
        error.message?.includes('does not exist') ||
        error.message?.includes('schema cache') ||
        error.message?.includes('Follow feature')
      ) {
        toast.error('Follow feature is not yet set up.');
      } else {
        toast.error(error.message || 'Failed to follow/unfollow user');
      }
    } finally {
      setIsFollowingLoading(false);
    }
  };

  // Handle claiming rewards for a specific token
  const handleClaimToken = useCallback(async (tokenAddress: string) => {
    if (!walletAddress || !isAuthenticated || !publicKey || !signTransaction) {
      toast.error('Please connect your wallet');
      return;
    }

    // Check if this is an OCN token (special claim flow)
    const tokenReward = tokenRewards.find((t) => t.tokenAddress === tokenAddress);
    const isOcnToken = tokenReward?.isOcnToken || false;

    try {
      setClaimingTokenAddress(tokenAddress);

      // Get auth session
      const { supabase } = await import('@/lib/supabase');
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        toast.error('Please connect your wallet');
        return;
      }

      // OCN Token uses special claim flow
      if (isOcnToken) {
        await handleOcnClaim(tokenAddress, session.access_token);
        return;
      }

      // Regular claim flow for non-OCN tokens
      // Step 1: Prepare claim (RPC calls on Vercel) - start this while loading dependencies
      const [prepareResponse, { RewardClaimBuilder, getConnection }] = await Promise.all([
        fetch('/api/rewards/prepare-claim', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            walletAddress,
            tokenAddress,
          }),
        }),
        // Lazy load heavy Solana dependencies only when user clicks claim
        loadClaimDependencies(),
      ]);

      if (!prepareResponse.ok) {
        const errorData = await prepareResponse.json();
        throw new Error(errorData.error || 'Failed to prepare claim');
      }

      const prepareData = await prepareResponse.json();
      if (!prepareData.success || !prepareData.data) {
        throw new Error('Invalid prepare response');
      }

      const claimData = prepareData.data;
      const claimId = claimData.claimId; // Store claim ID for logging

      // Step 2: Build transactions
      const connection = getConnection();
      const claimBuilder = new RewardClaimBuilder(connection);

      const transactions = await claimBuilder.buildClaimTransactions(claimData, publicKey);

      // Step 3: Simulate all transactions before signing
      for (let i = 0; i < transactions.length; i++) {
        const simulation = await connection.simulateTransaction(transactions[i], {
          sigVerify: false,
        });

        if (simulation.value.err) {
          console.error(`Transaction ${i + 1} simulation failed:`, simulation.value.err);
          throw new Error(`Transaction validation failed: ${JSON.stringify(simulation.value.err)}`);
        }
      }

      // Step 4: Sign and send transactions
      const phantomProvider = getPhantomProvider();
      let signatures: string[] = [];

      if (phantomProvider) {
        toast.info(`Approve ${transactions.length} transaction(s) in your wallet...`);

        const result = await phantomProvider.signAndSendAllTransactions(transactions, {
          skipPreflight: false,
          preflightCommitment: 'confirmed',
        });

        signatures = result.signatures;

        await Promise.all(
          signatures.map(async (sig) => {
            const latestBlockhash = await connection.getLatestBlockhash('confirmed');
            await connection.confirmTransaction({
              signature: sig,
              blockhash: latestBlockhash.blockhash,
              lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
            }, 'confirmed');
          })
        );
      } else {
        for (const tx of transactions) {
          const signedTx = await signTransaction(tx);
          const signature = await connection.sendRawTransaction(signedTx.serialize(), {
            skipPreflight: false,
            preflightCommitment: 'confirmed',
          });
          signatures.push(signature);

          const latestBlockhash = await connection.getLatestBlockhash('confirmed');
          await connection.confirmTransaction({
            signature,
            blockhash: latestBlockhash.blockhash,
            lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
          }, 'confirmed');
        }
      }

      // Step 5: Log claim in database using claimId (server-side amounts)
      const logResponse = await fetch('/api/rewards/log-claim', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          claimId,
          transactionSignature: signatures[0],
        }),
      });

      if (!logResponse.ok) {
        console.warn('Failed to log claim, but transaction succeeded');
      }

      toast.success(`Successfully claimed ${claimData.amounts.totalSol.toFixed(4)} SOL!`);

      const claimedAmount = claimData.amounts.totalSol;

      // Remove the claimed token from the rewards list
      setTokenRewards((prev) => prev.filter((t) => t.tokenAddress !== tokenAddress));

      // Clear the sessionStorage cache so next visit fetches fresh on-chain data
      sessionStorage.removeItem(`rewards_${walletAddress}`);

      // Optimistically update creator rewards in the cache immediately
      queryClient.setQueryData(['profile', slug], (oldData: any) => {
        if (!oldData?.creatorRewards) return oldData;
        return {
          ...oldData,
          creatorRewards: {
            ...oldData.creatorRewards,
            totalClaimableSol: Math.max(0, oldData.creatorRewards.totalClaimableSol - claimedAmount),
            totalClaimedSol: oldData.creatorRewards.totalClaimedSol + claimedAmount,
          },
        };
      });

      // Also invalidate to ensure data is fresh on next navigation
      queryClient.invalidateQueries({ queryKey: ['profile', slug] });
    } catch (error: any) {
      console.error('Error claiming rewards:', error);
      toast.error(error.message || 'Failed to claim rewards');
    } finally {
      setClaimingTokenAddress(null);
    }
  }, [walletAddress, isAuthenticated, publicKey, signTransaction, queryClient, slug, tokenRewards]);

  // Handle OCN token claim (special flow with platform wallet)
  const handleOcnClaim = useCallback(async (tokenAddress: string, accessToken: string) => {
    const { getConnection, VersionedTransaction } = await loadClaimDependencies();

    // Step 1: Get partially-signed transaction from server
    const ocnResponse = await fetch('/api/rewards/ocn-claim', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ tokenAddress }),
    });

    if (!ocnResponse.ok) {
      const errorData = await ocnResponse.json();
      throw new Error(errorData.error || 'Failed to prepare OCN claim');
    }

    const ocnData = await ocnResponse.json();
    if (!ocnData.success || !ocnData.data) {
      throw new Error('Invalid OCN claim response');
    }

    const { claimId, serializedTransaction, creatorShareUsdc } = ocnData.data;

    // Step 2: Deserialize and sign the transaction
    const transactionBuffer = Buffer.from(serializedTransaction, 'base64');
    const transaction = VersionedTransaction.deserialize(transactionBuffer);

    toast.info('Approve transaction in your wallet to receive USDC...');

    // Step 3: Sign with creator wallet (completes the partially-signed transaction)
    const connection = getConnection();
    const phantomProvider = getPhantomProvider();
    let signature: string;

    if (phantomProvider) {
      // Phantom can sign and send
      const result = await phantomProvider.signAndSendAllTransactions([transaction], {
        skipPreflight: false,
        preflightCommitment: 'confirmed',
      });
      signature = result.signatures[0];
    } else {
      // Standard wallet adapter
      const signedTx = await signTransaction!(transaction);
      signature = await connection.sendRawTransaction(signedTx.serialize(), {
        skipPreflight: false,
        preflightCommitment: 'confirmed',
      });
    }

    // Step 4: Wait for confirmation
    const latestBlockhash = await connection.getLatestBlockhash('confirmed');
    await connection.confirmTransaction({
      signature,
      blockhash: latestBlockhash.blockhash,
      lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
    }, 'confirmed');

    // Step 5: Log claim in database
    const logResponse = await fetch('/api/rewards/log-claim', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        claimId,
        transactionSignature: signature,
      }),
    });

    if (!logResponse.ok) {
      console.warn('Failed to log OCN claim, but transaction succeeded');
    }

    toast.success(`Successfully claimed ${creatorShareUsdc.toFixed(2)} USDC!`);

    // Remove the claimed token from the rewards list
    setTokenRewards((prev) => prev.filter((t) => t.tokenAddress !== tokenAddress));

    // Clear the sessionStorage cache
    sessionStorage.removeItem(`rewards_${walletAddress}`);

    // Update cache for USDC
    queryClient.setQueryData(['profile', slug], (oldData: any) => {
      if (!oldData?.creatorRewards) return oldData;
      return {
        ...oldData,
        creatorRewards: {
          ...oldData.creatorRewards,
          totalClaimableUsdc: Math.max(0, (oldData.creatorRewards.totalClaimableUsdc || 0) - creatorShareUsdc),
          totalClaimedUsdc: (oldData.creatorRewards.totalClaimedUsdc || 0) + creatorShareUsdc,
        },
      };
    });

    queryClient.invalidateQueries({ queryKey: ['profile', slug] });
  }, [walletAddress, signTransaction, queryClient, slug]);

  // Get claimable amount for a token
  const getTokenClaimable = (tokenAddress: string): TokenRewards | undefined => {
    return tokenRewards.find((t) => t.tokenAddress === tokenAddress);
  };

  // Memoized utility functions to prevent recreating on every render
  const formatTimeAgo = useCallback((dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (diffInSeconds < 60) return `${diffInSeconds}s ago`;
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
    return `${Math.floor(diffInSeconds / 86400)}d ago`;
  }, []);

  const formatMarketCap = useCallback((value: number | null) => {
    if (!value) return '$0';
    if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
    if (value >= 1000) return `$${(value / 1000).toFixed(1)}K`;
    return `$${value.toFixed(2)}`;
  }, []);

  const getSolscanUrl = useCallback((address: string) => {
    const network = process.env.NEXT_PUBLIC_SOLANA_NETWORK || 'devnet';
    return `https://solscan.io/${network === 'devnet' ? '?cluster=devnet' : ''}/account/${address}`;
  }, []);

  // Show skeleton while profile is loading
  if (isProfileLoading) {
    return <ProfileSkeleton />;
  }

  // Error state
  if (profileError) {
    return (
      <div className="min-h-screen">
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center">
            <p className="typo-body text-destructive">Failed to load profile</p>
          </div>
        </div>
      </div>
    );
  }

  // Create default profile if not found
  const displayProfile: UserProfile = profileData?.profile || {
    id: '',
    username: walletAddress.slice(0, 8),
    avatar: 'https://ipfs.io/ipfs/bafkreifn2verhnir6r3lj6rmu4tdtmcpoyfl7epvm7y2nvpwsubbha6ora',
    points: 0,
    wallet_address: walletAddress,
  };

  const displayStats: UserStats = profileData?.stats || {
    followers: 0,
    following: 0,
    createdCoins: 0,
  };

  const tokens: Token[] = profileData?.tokens || [];
  const followers: Follower[] = profileData?.followers || [];
  const following: Follower[] = profileData?.following || [];

  // Sort tokens by rewards for the Coins tab (tokens with claimable rewards first)
  // Note: This is intentionally NOT a useMemo because it's after conditional returns.
  // React hooks must be called unconditionally and in the same order every render.
  const tokensSortedByRewards = (() => {
    if (!isOwnProfile || tokenRewards.length === 0) {
      return tokens; // Already sorted by market cap from API
    }
    // Create a map of token address to claimable rewards
    const rewardsMap = new Map(
      tokenRewards.map((r) => [r.tokenAddress, r.totalClaimableSol])
    );
    return [...tokens].sort((a, b) => {
      const aRewards = rewardsMap.get(a.address) || 0;
      const bRewards = rewardsMap.get(b.address) || 0;
      // Tokens with rewards come first
      if (aRewards > 0 && bRewards === 0) return -1;
      if (aRewards === 0 && bRewards > 0) return 1;
      if (aRewards > 0 && bRewards > 0) return bRewards - aRewards;
      // Both have no rewards - keep market cap order (already sorted)
      return 0;
    });
  })();

  // Pagination calculations for coins (using rewards-sorted tokens for own profile)
  const totalCoinsPages = Math.ceil(tokensSortedByRewards.length / COINS_PER_PAGE);
  const paginatedTokens = tokensSortedByRewards.slice(
    (coinsPage - 1) * COINS_PER_PAGE,
    coinsPage * COINS_PER_PAGE
  );

  // For own profile, use on-chain tokenRewards data to calculate totals
  // This ensures the summary matches the claim buttons (rewards API fetches from chain)
  // Only show on-chain data after it's loaded to avoid showing stale DB values first
  const liveClaimableSol = isOwnProfile && !isLoadingRewards
    ? tokenRewards.reduce((sum, t) => sum + t.totalClaimableSol, 0)
    : null;
  const liveClaimableUsdc = isOwnProfile && !isLoadingRewards
    ? tokenRewards.reduce((sum, t) => sum + (t.totalClaimableUsdc || 0), 0)
    : null;

  const baseCreatorRewards = profileData?.creatorRewards || {
    totalClaimableSol: 0,
    totalClaimableUsdc: 0,
    totalClaimedSol: 0,
    totalClaimedUsdc: 0,
    totalEarnedSol: 0,
    totalEarnedUsdc: 0,
    chartData: [],
  };

  // For own profile: use on-chain data from authenticated endpoint
  // For other profiles: use public rewards endpoint data
  const creatorRewards: CreatorRewards = isOwnProfile
    ? {
        ...baseCreatorRewards,
        // Use on-chain total once loaded, otherwise 0 (will show loading state)
        totalClaimableSol: liveClaimableSol ?? 0,
        totalClaimableUsdc: liveClaimableUsdc ?? 0,
        totalEarnedSol: (liveClaimableSol ?? 0) + baseCreatorRewards.totalClaimedSol,
        totalEarnedUsdc: (liveClaimableUsdc ?? 0) + baseCreatorRewards.totalClaimedUsdc,
      }
    : {
        ...baseCreatorRewards,
        // Use public rewards data for non-own profiles
        totalClaimableSol: publicRewards?.totalClaimableSol ?? 0,
        totalClaimableUsdc: publicRewards?.totalClaimableUsdc ?? 0,
        totalClaimedSol: publicRewards?.totalClaimedSol ?? baseCreatorRewards.totalClaimedSol,
        totalClaimedUsdc: publicRewards?.totalClaimedUsdc ?? baseCreatorRewards.totalClaimedUsdc,
        totalEarnedSol: (publicRewards?.totalClaimableSol ?? 0) + (publicRewards?.totalClaimedSol ?? baseCreatorRewards.totalClaimedSol),
        totalEarnedUsdc: (publicRewards?.totalClaimableUsdc ?? 0) + (publicRewards?.totalClaimedUsdc ?? baseCreatorRewards.totalClaimedUsdc),
      };

  const userId = displayProfile.id
    ? walletAddress.slice(0, 6).toUpperCase()
    : walletAddress.slice(0, 6).toUpperCase();

  // Format USD value using live SOL price
  const formatUsd = (solAmount: number) => {
    const usdValue = solAmount * (solPrice || 0);
    if (usdValue >= 1000000) return `$${(usdValue / 1000000).toFixed(2)}M`;
    if (usdValue >= 1000) return `$${(usdValue / 1000).toFixed(2)}K`;
    return `$${usdValue.toFixed(2)}`;
  };

  // Format SOL amount
  const formatSol = (amount: number) => {
    if (amount >= 1000) return `${(amount / 1000).toFixed(2)}K`;
    return amount.toFixed(2);
  };

  // Format USDC amount (already in USD, just needs formatting)
  const formatUsdc = (amount: number) => {
    if (amount >= 1000000) return `$${(amount / 1000000).toFixed(2)}M`;
    if (amount >= 1000) return `$${(amount / 1000).toFixed(2)}K`;
    return `$${amount.toFixed(2)}`;
  };

  // Calculate combined USD value for display (SOL converted + USDC)
  const getTotalUsdValue = (solAmount: number, usdcAmount: number) => {
    const solUsd = solAmount * (solPrice || 0);
    return solUsd + usdcAmount;
  };

  // Format combined total
  const formatTotalUsd = (solAmount: number, usdcAmount: number) => {
    const totalUsd = getTotalUsdValue(solAmount, usdcAmount);
    if (totalUsd >= 1000000) return `$${(totalUsd / 1000000).toFixed(2)}M`;
    if (totalUsd >= 1000) return `$${(totalUsd / 1000).toFixed(2)}K`;
    return `$${totalUsd.toFixed(2)}`;
  };

  return (
    <div
      className="min-h-screen"
    >
      <div className="flex-1 p-4 md:p-6 lg:p-8 overflow-auto">
        <div className="max-w-5xl mx-auto">
            {/* Profile & Main Content */}
            <div className="space-y-6">
              {/* Profile Header */}
              <div className="flex items-start gap-4">
                <div
                  className={`relative rounded-full transition-all ${
                    isDraggingAvatar ? 'ring-2 ring-primary ring-offset-2 ring-offset-background' : ''
                  }`}
                  onDragOver={handleAvatarDragOver}
                  onDragLeave={handleAvatarDragLeave}
                  onDrop={handleAvatarDrop}
                >
                  <Avatar className="w-20 h-20">
                    <AvatarImage
                      src={displayProfile.avatar || 'https://ipfs.io/ipfs/bafkreifn2verhnir6r3lj6rmu4tdtmcpoyfl7epvm7y2nvpwsubbha6ora'}
                      alt={displayProfile.username}
                      className="object-cover"
                    />
                    <AvatarFallback className="text-xl">{getInitials(displayProfile.username)}</AvatarFallback>
                  </Avatar>
                  {isOwnProfile && (
                    <label
                      htmlFor="avatar-upload"
                      className="absolute bottom-0 right-0 p-1.5 rounded-full bg-primary/80 text-black cursor-pointer hover:bg-primary transition-all"
                      title="Drag & drop or click to change profile picture"
                    >
                      {isUploadingAvatar ? (
                        <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <Edit2 className="w-3 h-3" />
                      )}
                    </label>
                  )}
                  <input
                    id="avatar-upload"
                    type="file"
                    accept="image/jpeg,image/jpg,image/png,image/gif,image/webp"
                    className="hidden"
                    onChange={handleAvatarUpload}
                    disabled={isUploadingAvatar || !isOwnProfile}
                  />
                </div>

                <div className="flex-1 space-y-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    {isEditingUsername ? (
                      <div className="flex items-center gap-2 flex-1">
                        <Input
                          value={editedUsername}
                          onChange={(e) => setEditedUsername(e.target.value)}
                          maxLength={15}
                          className="max-w-xs"
                          disabled={isSavingUsername}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              handleSaveUsername();
                            } else if (e.key === 'Escape') {
                              handleCancelEdit();
                            }
                          }}
                          autoFocus
                        />
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={handleSaveUsername}
                          disabled={isSavingUsername || editedUsername.trim().length === 0}
                          className="h-8"
                        >
                          <Check className="w-4 h-4 text-green-500" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={handleCancelEdit}
                          disabled={isSavingUsername}
                          className="h-8"
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                    ) : (
                      <>
                        <span className="typo-title flex items-center gap-2">
                          {displayProfile.username || userId}
                          {displayProfile.verified && <VerifiedBadge size="md" />}
                        </span>
                        {isOwnProfile && (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setEditedUsername(displayProfile.username || '');
                                setIsEditingUsername(true);
                              }}
                              className="h-5 w-5"
                            >
                              <Edit2 className="size-5 text-muted-foreground rounded-md p-1 bg-muted hover:bg-muted/80 transition-colors" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={handleLogout}
                              disabled={isLoggingOut}
                              className="h-5 w-5 p-0 md:hidden"
                            >
                              {isLoggingOut ? (
                                <Loader2 className="size-5 text-destructive rounded-md p-1 bg-muted hover:bg-muted/80 transition-colors animate-spin" />
                              ) : (
                                <LogOut className="size-5 text-destructive rounded-md p-1 bg-muted hover:bg-muted/80 transition-colors" />
                              )}
                            </Button>
                          </>
                        )}
                        {!isOwnProfile && (
                          <Button
                            variant={effectiveIsFollowing ? 'outline' : 'default'}
                            size="sm"
                            className={`ml-2 ${
                              effectiveIsFollowing
                                ? 'border-muted-foreground/50 text-muted-foreground hover:border-destructive hover:text-destructive hover:bg-destructive/10'
                                : 'bg-primary hover:bg-primary/80 text-primary-foreground'
                            }`}
                            onClick={handleFollowToggle}
                            disabled={isFollowingLoading || !isAuthenticated}
                          >
                            {isFollowingLoading
                              ? 'Loading...'
                              : isAuthenticated
                                ? effectiveIsFollowing
                                  ? 'Following'
                                  : 'Follow'
                                : 'Follow'}
                          </Button>
                        )}
                      </>
                    )}
                  </div>

                  <div className="flex items-center gap-2 typo-caption text-muted-foreground">
                    <button
                      onClick={copyToClipboard}
                      className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-muted hover:bg-muted/80 transition-colors cursor-pointer"
                    >
                      <TruncatedAddress address={displayProfile.wallet_address} />
                      {copied ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
                    </button>
                    <a
                      href={getSolscanUrl(walletAddress)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 typo-caption hover:text-primary"
                    >
                      Solscan
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                </div>
              </div>

              {/* Stats Row */}
              <div className="flex items-center gap-6">
                <div className="text-center">
                  <div className="typo-title">{displayStats.followers}</div>
                  <div className="typo-caption text-muted-foreground">Followers</div>
                </div>
                <div className="text-center">
                  <div className="typo-title">{displayStats.following}</div>
                  <div className="typo-caption text-muted-foreground">Following</div>
                </div>
                <div className="text-center">
                  <div className="typo-title">{tokens.length}</div>
                  <div className="typo-caption text-muted-foreground">Created coins</div>
                </div>
              </div>

              {/* Tabs */}
              <div className="flex gap-6">
                <button
                  onClick={() => handleTabChange('balances')}
                  className={`pb-1 typo-body transition-colors cursor-pointer ${
                    activeTab === 'balances'
                      ? 'text-white border-b-2 border-primary'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Balances
                </button>
                <button
                  onClick={() => handleTabChange('coins')}
                  className={`pb-1 typo-body transition-colors cursor-pointer ${
                    activeTab === 'coins'
                      ? 'text-white border-b-2 border-primary'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Coins
                </button>
                <button
                  onClick={() => handleTabChange('followers')}
                  className={`pb-1 typo-body transition-colors cursor-pointer ${
                    activeTab === 'followers'
                      ? 'text-white border-b-2 border-primary'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Followers
                </button>
                <button
                  onClick={() => handleTabChange('following')}
                  className={`pb-1 typo-body transition-colors cursor-pointer ${
                    activeTab === 'following'
                      ? 'text-white border-b-2 border-primary'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Following
                </button>
              </div>

              {/* Creator Rewards Card - Shows on Coins tab */}
              {activeTab === 'coins' && (
                <Card className="border-border/50 overflow-hidden" style={{
                  background: 'radial-gradient(ellipse at top left, rgba(102, 245, 144, 0.1) 0%, transparent 50%)',
                }}>
                  <CardContent className="py-1">
                    <div className="flex items-center justify-between mb-4">
                      <span className="typo-title text-periwinkle-light">Creator Rewards</span>
                      <Button
                        size="sm"
                        className="h-7 px-3 typo-button bg-primary hover:bg-primary/80 text-primary-foreground"
                        onClick={() => {
                          const profileUrl = `${window.location.origin}/profile/${displayProfile.username}`;
                          navigator.clipboard.writeText(profileUrl);
                          toast.success('Profile link copied!');
                        }}
                      >
                        Share
                      </Button>
                    </div>
                    <div className="mb-1">
                      <span className="typo-caption text-muted-foreground">Total Earned</span>
                    </div>
                    <div className="text-3xl font-bold text-white mb-1">
                      {isLoadingRewards ? (
                        <span className="animate-pulse">-</span>
                      ) : (
                        formatTotalUsd(creatorRewards.totalEarnedSol, creatorRewards.totalEarnedUsdc)
                      )}
                    </div>
                    <div className="typo-body text-periwinkle-light mb-4">
                      {isLoadingRewards ? (
                        <span className="animate-pulse">-</span>
                      ) : (
                        <>
                          {creatorRewards.totalEarnedSol > 0 && `${formatSol(creatorRewards.totalEarnedSol)} SOL`}
                          {creatorRewards.totalEarnedSol > 0 && creatorRewards.totalEarnedUsdc > 0 && ' + '}
                          {creatorRewards.totalEarnedUsdc > 0 && `${creatorRewards.totalEarnedUsdc.toFixed(2)} USDC`}
                          {creatorRewards.totalEarnedSol === 0 && creatorRewards.totalEarnedUsdc === 0 && '0 SOL'}
                        </>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-4 mb-4">
                      <div>
                        <div className="typo-caption text-muted-foreground mb-1">Unclaimed</div>
                        <div className="text-xl font-bold text-green-500">
                          {isLoadingRewards ? (
                            <span className="animate-pulse text-muted-foreground">-</span>
                          ) : creatorRewards.totalClaimableSol >= 0.01 || creatorRewards.totalClaimableUsdc >= 0.01 ? (
                            formatTotalUsd(creatorRewards.totalClaimableSol, creatorRewards.totalClaimableUsdc)
                          ) : (
                            '$0.00'
                          )}
                        </div>
                        <div className="typo-caption text-green-500/70">
                          {isLoadingRewards ? (
                            <span className="animate-pulse text-muted-foreground">-</span>
                          ) : (
                            <>
                              {creatorRewards.totalClaimableSol >= 0.01 && `${formatSol(creatorRewards.totalClaimableSol)} SOL`}
                              {creatorRewards.totalClaimableSol >= 0.01 && creatorRewards.totalClaimableUsdc >= 0.01 && ' + '}
                              {creatorRewards.totalClaimableUsdc >= 0.01 && `${creatorRewards.totalClaimableUsdc.toFixed(2)} USDC`}
                              {creatorRewards.totalClaimableSol < 0.01 && creatorRewards.totalClaimableUsdc < 0.01 && '0 SOL'}
                            </>
                          )}
                        </div>
                      </div>
                      <div>
                        <div className="typo-caption text-muted-foreground mb-1">Claimed</div>
                        <div className="text-xl font-bold text-white">
                          {formatTotalUsd(creatorRewards.totalClaimedSol, creatorRewards.totalClaimedUsdc)}
                        </div>
                        <div className="typo-caption text-periwinkle-light">
                          {creatorRewards.totalClaimedSol > 0 && `${formatSol(creatorRewards.totalClaimedSol)} SOL`}
                          {creatorRewards.totalClaimedSol > 0 && creatorRewards.totalClaimedUsdc > 0 && ' + '}
                          {creatorRewards.totalClaimedUsdc > 0 && `${creatorRewards.totalClaimedUsdc.toFixed(2)} USDC`}
                          {creatorRewards.totalClaimedSol === 0 && creatorRewards.totalClaimedUsdc === 0 && '0 SOL'}
                        </div>
                      </div>
                    </div>

                    {/* Rewards Chart */}
                    <RewardsChart data={creatorRewards.chartData} />
                  </CardContent>
                </Card>
              )}

              {/* coins list under the rewards card */}
              {activeTab === 'coins' && (
                <div className="space-y-1">
                  <div className="flex items-center typo-caption text-muted-foreground px-2 py-2">
                    <span className="flex-1">Created Coins ({tokens.length})</span>
                    {isOwnProfile && <span className="w-24 text-right">Rewards</span>}
                    <span className="w-16 text-right">MCap</span>
                  </div>
                  {tokensSortedByRewards.length === 0 ? (
                    <div className="text-center py-8 typo-body text-muted-foreground">
                      No coins created yet
                    </div>
                  ) : (
                    paginatedTokens.map((token) => {
                      const claimable = getTokenClaimable(token.address);
                      const hasRewards = claimable && claimable.totalClaimableSol > 0;
                      return (
                        <div
                          key={token.id}
                          className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted/50 transition-colors"
                          style={hasRewards ? {
                            background: 'linear-gradient(90deg, rgba(255, 138, 101, 0.08) 0%, transparent 100%)',
                            borderLeft: '2px solid rgba(255, 138, 101, 0.5)',
                          } : undefined}
                        >
                          <div
                            className="flex items-center gap-3 flex-1 min-w-0 cursor-pointer"
                            onClick={() => router.push(`/token/${token.address}`)}
                          >
                            <TokenImage
                              src={token.metadata?.logo}
                              alt={token.symbol || 'Token'}
                              fallbackText={token.symbol?.slice(0, 2).toUpperCase() || token.address.slice(0, 2).toUpperCase()}
                              size={40}
                            />
                            <div className="flex-1 min-w-0">
                              <div className="typo-body truncate" style={{ fontWeight: 'var(--weight-button)' }}>{token.name || 'Unnamed'}</div>
                              <div className="typo-caption text-muted-foreground truncate">{token.symbol || 'N/A'}</div>
                            </div>
                          </div>
                          {/* Claim button for own profile */}
                          {isOwnProfile && (
                            <div className="w-24 flex items-center justify-end flex-shrink-0">
                              {claimable && (claimable.totalClaimableSol > 0 || claimable.totalClaimableUsdc > 0) ? (
                                <Button
                                  size="sm"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleClaimToken(token.address);
                                  }}
                                  disabled={claimingTokenAddress === token.address}
                                  className="bg-primary hover:bg-primary/80 text-primary-foreground typo-button px-3 py-1 h-7"
                                >
                                  {claimingTokenAddress === token.address ? (
                                    <>
                                      <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                                      Claiming
                                    </>
                                  ) : claimable.totalClaimableUsdc > 0 ? (
                                    `Claim ${claimable.totalClaimableUsdc.toFixed(2)} USDC`
                                  ) : (
                                    `Claim ${claimable.totalClaimableSol.toFixed(3)} SOL`
                                  )}
                                </Button>
                              ) : (
                                <span className="typo-caption text-muted-foreground">-</span>
                              )}
                            </div>
                          )}
                          <div
                            className="w-16 text-right flex-shrink-0 cursor-pointer"
                            onClick={() => router.push(`/token/${token.address}`)}
                          >
                            <div className="typo-body" style={{ fontWeight: 'var(--weight-button)' }}>{formatMarketCap(token.market_cap)}</div>
                          </div>
                        </div>
                      );
                    })
                  )}

                  {/* Pagination Controls */}
                  {totalCoinsPages > 1 && (
                    <div className="flex items-center justify-center gap-2 pt-4 pb-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCoinsPage((p) => Math.max(1, p - 1))}
                        disabled={coinsPage === 1}
                        className="h-8 px-3 typo-button"
                      >
                        Previous
                      </Button>
                      <span className="typo-caption text-muted-foreground px-2">
                        Page {coinsPage} of {totalCoinsPages}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCoinsPage((p) => Math.min(totalCoinsPages, p + 1))}
                        disabled={coinsPage === totalCoinsPages}
                        className="h-8 px-3 typo-button"
                      >
                        Next
                      </Button>
                    </div>
                  )}
                </div>
              )}

              {/* Balances Tab Content */}
              {activeTab === 'balances' && (
                <div className="space-y-3">
                  {isBalanceLoading ? (
                    <BalancesSkeleton />
                  ) : (
                    <>
                      {balanceData && (
                        <Card className="border-border/50">
                          <CardContent className="p-4">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full flex items-center justify-center overflow-hidden">
                                  <Image
                                    src="https://ipfs.io/ipfs/bafkreifn2verhnir6r3lj6rmu4tdtmcpoyfl7epvm7y2nvpwsubbha6ora"
                                    alt="SOL"
                                    width={40}
                                    height={40}
                                    className="w-full h-full object-cover"
                                  />
                                </div>
                                <div>
                                  <div className="typo-subtitle">Solana</div>
                                  <div className="typo-body text-muted-foreground">
                                    {balanceData.sol.toFixed(4)} SOL
                                  </div>
                                </div>
                              </div>
                              <div className="text-right">
                                <div className="typo-subtitle">
                                  ${(balanceData.sol * (solPrice || 0)).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                </div>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      )}
                      {balanceData?.tokens && balanceData.tokens.length > 0 ? (
                        balanceData.tokens.map((token) => {
                          const hasMetadata = token.name || token.symbol;
                          const CardWrapper = hasMetadata
                            ? ({ children }: { children: React.ReactNode }) => (
                                <div
                                  onClick={() => router.push(`/token/${token.mint}`)}
                                  className="cursor-pointer hover:opacity-80 transition-opacity"
                                >
                                  {children}
                                </div>
                              )
                            : ({ children }: { children: React.ReactNode }) => <>{children}</>;
                          return (
                            <CardWrapper key={token.mint}>
                              <Card className="border-border/50">
                                <CardContent className="p-4">
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                      <TokenImage
                                        src={token.logoURI}
                                        alt={token.symbol || 'Token'}
                                        fallbackText={token.symbol?.slice(0, 2).toUpperCase() || token.mint.slice(0, 2).toUpperCase()}
                                        size={40}
                                      />
                                      <div>
                                        <div className="typo-subtitle">{token.name || token.symbol || token.mint.slice(0, 8)}</div>
                                        <div className="typo-body text-muted-foreground">
                                          {parseFloat(token.amountString).toLocaleString(undefined, { maximumFractionDigits: 2 })} {token.symbol || 'TOKEN'}
                                        </div>
                                      </div>
                                    </div>
                                    <div className="text-right">
                                      {token.usdValue !== undefined && token.usdValue > 0 ? (
                                        <div className="typo-subtitle">
                                          ${token.usdValue >= 1000000
                                            ? `${(token.usdValue / 1000000).toFixed(2)}M`
                                            : token.usdValue >= 1000
                                              ? `${(token.usdValue / 1000).toFixed(2)}K`
                                              : token.usdValue.toFixed(2)}
                                        </div>
                                      ) : (
                                        <div className="typo-caption text-muted-foreground">-</div>
                                      )}
                                    </div>
                                  </div>
                                </CardContent>
                              </Card>
                            </CardWrapper>
                          );
                        })
                      ) : balanceData?.tokens && balanceData.tokens.length === 0 ? (
                        <p className="typo-body text-muted-foreground text-center py-4">No token balances to display</p>
                      ) : null}
                    </>
                  )}
                </div>
              )}

              {/* Followers Tab Content */}
              {activeTab === 'followers' && (
                <div className="space-y-2">
                  {followers.length === 0 ? (
                    <div className="text-center py-8 typo-body text-muted-foreground">No followers yet</div>
                  ) : (
                    followers.map((follower) => (
                      <div
                        key={follower.id}
                        className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted/50 cursor-pointer transition-colors"
                        onClick={() => router.push(`/profile/${follower.username}`)}
                      >
                        <Avatar className="w-10 h-10 flex-shrink-0">
                          <AvatarImage
                            src={follower.avatar || 'https://ipfs.io/ipfs/bafkreifn2verhnir6r3lj6rmu4tdtmcpoyfl7epvm7y2nvpwsubbha6ora'}
                            alt={follower.username}
                            className="object-cover"
                          />
                          <AvatarFallback>{getInitials(follower.username)}</AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <div className="typo-body truncate flex items-center gap-1" style={{ fontWeight: 'var(--weight-button)' }}>
                            {follower.username}
                            {follower.verified && <VerifiedBadge size="sm" />}
                          </div>
                          <div className="typo-caption text-muted-foreground truncate">
                            <TruncatedAddress address={follower.wallet_address} />
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* Following Tab Content */}
              {activeTab === 'following' && (
                <div className="space-y-2">
                  {following.length === 0 ? (
                    <div className="text-center py-8 typo-body text-muted-foreground">Not following anyone yet</div>
                  ) : (
                    following.map((user) => (
                      <div
                        key={user.id}
                        className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted/50 cursor-pointer transition-colors"
                        onClick={() => router.push(`/profile/${user.username}`)}
                      >
                        <Avatar className="w-10 h-10 flex-shrink-0">
                          <AvatarImage
                            src={user.avatar || 'https://ipfs.io/ipfs/bafkreifn2verhnir6r3lj6rmu4tdtmcpoyfl7epvm7y2nvpwsubbha6ora'}
                            alt={user.username}
                            className="object-cover"
                          />
                          <AvatarFallback>{getInitials(user.username)}</AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <div className="typo-body truncate flex items-center gap-1" style={{ fontWeight: 'var(--weight-button)' }}>
                            {user.username}
                            {user.verified && <VerifiedBadge size="sm" />}
                          </div>
                          <div className="typo-caption text-muted-foreground truncate">
                            <TruncatedAddress address={user.wallet_address} />
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

            </div>
        </div>
      </div>
    </div>
  );
}

/**
 * ProfilePage - The main exported component.
 * Wraps ProfilePageInner in Suspense because useSearchParams requires it
 * to avoid React hydration errors (error #310).
 */
export default function ProfilePage() {
  return (
    <Suspense fallback={<ProfileSkeleton />}>
      <ProfilePageInner />
    </Suspense>
  );
}
