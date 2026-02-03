'use client';

import { useState, useEffect, useCallback } from 'react';
import { useWallet } from '@/contexts/FrameworkKitWalletContext';

interface UseTokenLikeResult {
  likeCount: number;
  hasLiked: boolean;
  isLoading: boolean;
  toggleLike: () => Promise<void>;
}

export function useTokenLike(tokenAddress: string | undefined): UseTokenLikeResult {
  const { publicKey } = useWallet();
  const [likeCount, setLikeCount] = useState(0);
  const [hasLiked, setHasLiked] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Fetch initial like status
  useEffect(() => {
    if (!tokenAddress) return;

    const fetchLikeStatus = async () => {
      try {
        const response = await fetch(`/api/tokens/${tokenAddress}/like`);
        if (response.ok) {
          const data = await response.json();
          setLikeCount(data.likeCount);
          setHasLiked(data.hasLiked);
        }
      } catch (error) {
        console.error('Failed to fetch like status:', error);
      }
    };

    fetchLikeStatus();
  }, [tokenAddress, publicKey]);

  const toggleLike = useCallback(async () => {
    if (!tokenAddress || isLoading) return;

    // Optimistic update
    const previousLikeCount = likeCount;
    const previousHasLiked = hasLiked;

    setHasLiked(!hasLiked);
    setLikeCount(hasLiked ? likeCount - 1 : likeCount + 1);
    setIsLoading(true);

    try {
      const response = await fetch(`/api/tokens/${tokenAddress}/like`, {
        method: hasLiked ? 'DELETE' : 'POST',
      });

      if (response.ok) {
        const data = await response.json();
        setLikeCount(data.likeCount);
        setHasLiked(data.hasLiked);
      } else if (response.status === 401) {
        // Revert optimistic update on auth error
        setHasLiked(previousHasLiked);
        setLikeCount(previousLikeCount);
        throw new Error('Please connect your wallet to like');
      } else {
        // Revert optimistic update on error
        setHasLiked(previousHasLiked);
        setLikeCount(previousLikeCount);
        throw new Error('Failed to update like');
      }
    } catch (error) {
      // Already reverted above, just rethrow
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [tokenAddress, hasLiked, likeCount, isLoading]);

  return {
    likeCount,
    hasLiked,
    isLoading,
    toggleLike,
  };
}
