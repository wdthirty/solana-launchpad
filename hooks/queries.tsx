'use client';

import { useParams } from 'next/navigation';
import { NATIVE_MINT } from '@solana/spl-token';
import { ApeQueries, QueryData, TokenInfoQueryData } from '@/components/Explore/queries';
import { useQuery } from '@tanstack/react-query';
import { formatPoolAsTokenInfo } from '@/components/Explore/pool-utils';
import { useDataStreamStatus } from '@/contexts/DataStreamProvider';

export function useTokenAddress() {
  const params = useParams();
  // Support both tokenId (from tokenTest) and address (from token page)
  const tokenId = (params?.tokenId || params?.address) as string | undefined;
  return tokenId || NATIVE_MINT.toString();
}

export function usePageTokenInfo<T = TokenInfoQueryData>(select?: (data: TokenInfoQueryData) => T) {
  const tokenId = useTokenAddress();
  const { isConnected } = useDataStreamStatus();

  return useQuery({
    ...ApeQueries.tokenInfo({ id: tokenId || '' }),
    // When WebSocket is connected, don't poll - rely on real-time updates
    // When disconnected, poll every 30s as fallback
    refetchInterval: isConnected ? false : 30 * 1000,
    // Trust WebSocket data longer when connected
    staleTime: isConnected ? 5 * 60 * 1000 : 30 * 1000,
    refetchIntervalInBackground: false,
    enabled: !!tokenId,
    select,
  });
}

export function useTokenInfo<T = QueryData<typeof ApeQueries.tokenInfo>>(
  select?: (data: QueryData<typeof ApeQueries.tokenInfo>) => T
) {
  const tokenId = useTokenAddress();
  const { isConnected } = useDataStreamStatus();

  return useQuery({
    ...ApeQueries.tokenInfo({ id: tokenId || '' }),
    // When WebSocket is connected, don't poll - rely on real-time updates via patchStreamPool
    // When disconnected, poll every 30s as fallback
    refetchInterval: isConnected ? false : 30 * 1000,
    refetchIntervalInBackground: false,
    // Trust WebSocket data longer when connected (5 min), shorter when polling (30s)
    staleTime: isConnected ? 5 * 60 * 1000 : 30 * 1000,
    enabled: !!tokenId,
    select,
  });
}

export function useHolders() {
  const address = useTokenAddress();
  // Holders data doesn't come from WebSocket, but we can still be smarter about polling
  // Poll every 60s since holder changes are less frequent than price/volume
  return useQuery({
    ...ApeQueries.tokenHolders({ id: address || '' }),
    refetchInterval: 60 * 1000, // Holders change less frequently, 60s is sufficient
    refetchIntervalInBackground: false,
    staleTime: 30 * 1000, // Consider data fresh for 30 seconds
    enabled: !!address,
  });
}

export function usePoolMinimalTokenInfo() {
  const tokenId = useTokenAddress();
  const { isConnected } = useDataStreamStatus();

  return useQuery({
    ...ApeQueries.tokenInfo({ id: tokenId || '' }),
    enabled: !!tokenId,
    select: (pool) => {
      if (!pool) {
        return;
      }
      return formatPoolAsTokenInfo(pool);
    },
    // Same smart polling strategy as useTokenInfo
    refetchInterval: isConnected ? false : 30 * 1000,
    staleTime: isConnected ? 5 * 60 * 1000 : 30 * 1000,
    refetchIntervalInBackground: false,
  });
}

export function useMinimalTokenInfo() {
  const main = usePoolMinimalTokenInfo();
  return main;
}
