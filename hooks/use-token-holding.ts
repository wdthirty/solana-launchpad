'use client';

import { useState, useEffect, useCallback } from 'react';
import { useWallet } from '@/contexts/FrameworkKitWalletContext';

// Minimum token amount required to access community
export const MIN_TOKEN_HOLDING = 10000;

interface TokenHoldingResult {
  isHolder: boolean;
  isDeveloper: boolean;
  hasAccess: boolean;
  balance: number;
  minRequired: number;
  isLoading: boolean;
  isInitializing: boolean; // True until first check completes
  error: string | null;
  refetch: () => void;
}

interface TokenHoldingCache {
  [key: string]: {
    isHolder: boolean;
    isDeveloper: boolean;
    balance: number;
    timestamp: number;
  };
}

// Cache holdings for 30 seconds to avoid excessive API calls
const CACHE_DURATION = 30 * 1000;
const holdingsCache: TokenHoldingCache = {};

export function useTokenHolding(
  tokenAddress: string | undefined,
  creatorWallet: string | undefined
): TokenHoldingResult {
  const { publicKey, connected } = useWallet();
  const [isHolder, setIsHolder] = useState(false);
  const [isDeveloper, setIsDeveloper] = useState(false);
  const [balance, setBalance] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [hasInitialized, setHasInitialized] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const walletAddress = publicKey?.toString();
  const cacheKey = `${walletAddress}-${tokenAddress}`;

  const checkHolding = useCallback(async () => {
    // No wallet connected - no access
    if (!connected || !walletAddress) {
      setIsHolder(false);
      setIsDeveloper(false);
      setBalance(0);
      setIsLoading(false);
      setHasInitialized(true);
      setError(null);
      return;
    }

    // No token address - nothing to check
    if (!tokenAddress) {
      setIsHolder(false);
      setIsDeveloper(false);
      setBalance(0);
      setIsLoading(false);
      setHasInitialized(true);
      setError(null);
      return;
    }

    // Check if user is the developer (creator)
    const isCreator = creatorWallet
      ? walletAddress.toLowerCase() === creatorWallet.toLowerCase()
      : false;

    // Check cache first
    const cached = holdingsCache[cacheKey];
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      setIsHolder(cached.isHolder);
      setIsDeveloper(cached.isDeveloper || isCreator);
      setBalance(cached.balance);
      setIsLoading(false);
      setHasInitialized(true);
      setError(null);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/users/wallet/${walletAddress}/balance`);

      if (!response.ok) {
        throw new Error('Failed to fetch token holdings');
      }

      const data = await response.json();
      const tokens = data.tokens || [];

      // Find the specific token in wallet holdings
      const tokenHolding = tokens.find(
        (t: { mint: string }) => t.mint.toLowerCase() === tokenAddress.toLowerCase()
      );

      const tokenBalance = tokenHolding?.amount || 0;
      const holdsToken = tokenBalance >= MIN_TOKEN_HOLDING;

      // Cache the result
      holdingsCache[cacheKey] = {
        isHolder: holdsToken,
        isDeveloper: isCreator,
        balance: tokenBalance,
        timestamp: Date.now(),
      };

      setIsHolder(holdsToken);
      setIsDeveloper(isCreator);
      setBalance(tokenBalance);
    } catch (err) {
      console.error('Error checking token holding:', err);
      setError(err instanceof Error ? err.message : 'Failed to check holdings');
      setIsHolder(false);
      setBalance(0);
    } finally {
      setIsLoading(false);
      setHasInitialized(true);
    }
  }, [connected, walletAddress, tokenAddress, creatorWallet, cacheKey]);

  useEffect(() => {
    checkHolding();
  }, [checkHolding]);

  // User has access if they are a holder OR the developer
  const hasAccess = isHolder || isDeveloper;

  return {
    isHolder,
    isDeveloper,
    hasAccess,
    balance,
    minRequired: MIN_TOKEN_HOLDING,
    isLoading,
    isInitializing: !hasInitialized,
    error,
    refetch: checkHolding,
  };
}

// Clear cache for a specific token (useful after buying)
export function clearTokenHoldingCache(walletAddress: string, tokenAddress: string) {
  const cacheKey = `${walletAddress}-${tokenAddress}`;
  delete holdingsCache[cacheKey];
}

// Clear all cache (useful after wallet change)
export function clearAllTokenHoldingCache() {
  Object.keys(holdingsCache).forEach((key) => {
    delete holdingsCache[key];
  });
}
