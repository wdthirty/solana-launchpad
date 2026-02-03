'use client';

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

// Types
export interface UserProfile {
  id: string;
  username: string;
  avatar: string;
  points: number;
  wallet_address: string;
  verified?: boolean;
}

export interface UserStats {
  followers: number;
  following: number;
  createdCoins: number;
}

export interface Token {
  id: string;
  address: string;
  name: string | null;
  symbol: string | null;
  market_cap: number | null;
  created_at: string;
  metadata: {
    logo?: string;
  };
}

export interface Follower {
  id: string;
  username: string;
  avatar: string;
  wallet_address: string;
  verified?: boolean;
}

export interface RewardsChartPoint {
  date: string;
  total: number;
}

export interface CreatorRewards {
  totalClaimableSol: number;
  totalClaimableUsdc: number;
  totalClaimedSol: number;
  totalClaimedUsdc: number;
  totalEarnedSol: number;
  totalEarnedUsdc: number;
  chartData: RewardsChartPoint[];
}

export interface ProfileData {
  profile: UserProfile | null;
  stats: UserStats;
  tokens: Token[];
  followers: Follower[];
  following: Follower[];
  creatorRewards: CreatorRewards;
}

export interface TokenBalance {
  mint: string;
  amount: number;
  amountString: string;
  decimals: number;
  name: string | null;
  symbol: string | null;
  marketCap: number | null;
  usdValue?: number;
  logoURI?: string;
}

export interface BalanceData {
  sol: number;
  tokens: TokenBalance[];
}

export interface ProfileDataResponse extends ProfileData {
  walletAddress: string; // The resolved wallet address (useful when slug is a username)
}

/**
 * Hook to fetch profile data (profile, stats, tokens, followers)
 * Uses React Query for caching and deduplication
 * Data is cached for 30 seconds and considered stale after 10 seconds
 *
 * @param slug - Either a wallet address or username
 */
export function useProfileData(slug: string | undefined) {
  return useQuery<ProfileDataResponse>({
    queryKey: ['profile', slug],
    queryFn: async () => {
      if (!slug) {
        throw new Error('Slug required');
      }

      const response = await fetch(`/api/users/${slug}`);

      if (!response.ok) {
        throw new Error('Failed to fetch profile data');
      }

      return response.json();
    },
    enabled: !!slug,
    staleTime: 30 * 1000, // Consider fresh for 30 seconds
    gcTime: 5 * 60 * 1000, // Keep in cache for 5 minutes (was cacheTime in v4)
    refetchOnWindowFocus: false, // Don't refetch on window focus (preserves optimistic updates)
  });
}

/**
 * Hook to fetch wallet balances from Jupiter API
 * Separate from profile data since it's slower and user-specific
 * Uses React Query for caching - balances are cached for 60 seconds
 */
// Validate Solana wallet address format (base58, 32-44 chars)
function isValidSolanaAddress(address: string): boolean {
  const base58Regex = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
  return base58Regex.test(address);
}

export function useWalletBalances(walletAddress: string | undefined) {
  return useQuery<BalanceData>({
    queryKey: ['balances', walletAddress],
    queryFn: async () => {
      if (!walletAddress) {
        throw new Error('Wallet address required');
      }

      // Validate wallet address format before making API call
      if (!isValidSolanaAddress(walletAddress)) {
        throw new Error('Invalid wallet address format');
      }

      // Fetch balances from Jupiter
      const balanceResponse = await fetch(
        `https://lite-api.jup.ag/ultra/v1/balances/${walletAddress}`
      );

      if (!balanceResponse.ok) {
        throw new Error('Failed to fetch balances');
      }

      const jupiterData = await balanceResponse.json();

      // Get SOL balance
      const solBalance = jupiterData.SOL?.uiAmount || 0;

      // Filter out SOL and get only tokens with non-zero balances
      const tokenMints = Object.keys(jupiterData).filter(
        (mint) => mint !== 'SOL' && jupiterData[mint]?.uiAmount > 0
      );

      if (tokenMints.length === 0) {
        return { sol: solBalance, tokens: [] };
      }

      // Batch token addresses into groups of 50 for Jupiter pools API
      const batchSize = 50;
      const addressBatches: string[][] = [];
      for (let i = 0; i < tokenMints.length; i += batchSize) {
        addressBatches.push(tokenMints.slice(i, i + batchSize));
      }

      // Fetch ALL batches in PARALLEL
      const batchPromises = addressBatches.map(async (batch) => {
        try {
          const assetIds = batch.join(',');
          const poolsResponse = await fetch(
            `https://datapi.jup.ag/v1/pools?assetIds=${encodeURIComponent(assetIds)}`
          );

          if (!poolsResponse.ok) {
            return [];
          }

          const poolsData = await poolsResponse.json();
          const batchTokens: TokenBalance[] = [];

          for (const mint of batch) {
            const poolData = poolsData.pools?.find(
              (pool: any) => pool.baseAsset?.id === mint
            );
            const balanceData = jupiterData[mint];

            if (poolData?.baseAsset && balanceData) {
              const price = poolData.baseAsset.usdPrice || 0;
              const usdValue = (balanceData.uiAmount || 0) * price;

              batchTokens.push({
                mint: mint,
                amount: balanceData.uiAmount || 0,
                amountString: (balanceData.uiAmount || 0).toString(),
                decimals: poolData.baseAsset.decimals || 6,
                name: poolData.baseAsset.name || null,
                symbol: poolData.baseAsset.symbol || null,
                marketCap: poolData.baseAsset.mcap || null,
                usdValue: usdValue,
                logoURI: poolData.baseAsset.icon || null,
              });
            }
          }
          return batchTokens;
        } catch (error) {
          console.warn('Failed to fetch Jupiter pools data for batch:', error);
          return [];
        }
      });

      // Wait for all batches in parallel
      const batchResults = await Promise.all(batchPromises);
      const allTokens = batchResults.flat();

      // Sort by USD value (highest first)
      allTokens.sort((a, b) => {
        const aUsdValue = a.usdValue || 0;
        const bUsdValue = b.usdValue || 0;

        if (aUsdValue > 0 && bUsdValue > 0) {
          return bUsdValue - aUsdValue;
        }
        if (aUsdValue > 0 && bUsdValue === 0) return -1;
        if (aUsdValue === 0 && bUsdValue > 0) return 1;
        return (b.amount || 0) - (a.amount || 0);
      });

      return { sol: solBalance, tokens: allTokens };
    },
    enabled: !!walletAddress,
    staleTime: 60 * 1000, // Consider fresh for 60 seconds
    gcTime: 5 * 60 * 1000, // Keep in cache for 5 minutes
    refetchOnWindowFocus: false, // Don't refetch on window focus (expensive API calls)
  });
}

/**
 * Hook to check if the current user is following this wallet
 */
export function useFollowStatus(
  walletAddress: string | undefined,
  currentUserWallet: string | undefined | null,
  isAuthenticated: boolean
) {
  return useQuery<boolean>({
    queryKey: ['followStatus', walletAddress, currentUserWallet],
    queryFn: async () => {
      if (!walletAddress || !currentUserWallet || walletAddress === currentUserWallet) {
        return false;
      }

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        return false;
      }

      const response = await fetch(`/api/users/wallet/${walletAddress}/follow`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (!response.ok) {
        return false;
      }

      const data = await response.json();
      return data.following || false;
    },
    enabled: !!walletAddress && !!currentUserWallet && isAuthenticated && walletAddress !== currentUserWallet,
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
  });
}
