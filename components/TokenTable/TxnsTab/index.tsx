import { useTokenAddress, useTokenInfo } from '@/hooks/queries';
import { useInfiniteQuery } from '@tanstack/react-query';
import { memo, useEffect, useMemo, useState } from 'react';
import { ApeQueries } from '../../Explore/queries';
import { TxTable } from './TxTable';
import { columns } from './columns';
import { Tx } from '../../Explore/types';
import { prefetchTraderProfiles } from '@/hooks/use-trader-profiles';

// Prefetch trader profiles when tx data loads so they're ready when TxTable renders
function usePrefetchProfiles(txs: Tx[]) {
  useEffect(() => {
    if (txs.length > 0) {
      const addresses = txs.map(tx => tx.traderAddress);
      prefetchTraderProfiles(addresses);
    }
  }, [txs]);
}

type TxnsTabProps = {
  textBackgroundColor?: string;
  className?: string;
};

export const TxnsTab: React.FC<TxnsTabProps> = memo(({ textBackgroundColor, className }) => {
  const tokenId = useTokenAddress();
  const { data: symbol } = useTokenInfo((data) => data?.baseAsset.symbol);

  const { data, isFetching, fetchNextPage, hasNextPage } = useInfiniteQuery({
    ...ApeQueries.tokenTxs({ id: tokenId || '' }),
    enabled: !!tokenId,
    initialPageParam: undefined,
  });

  const allRows = useMemo(
    () => {
      if (!data || !data.pages) return [];
      const allTxs = data.pages.flatMap((d) => d?.txs ?? []);

      // Deduplicate by txHash
      const seenTxHashes = new Set<string>();
      const uniqueTxs = allTxs.filter((tx) => {
        if (seenTxHashes.has(tx.txHash)) {
          return false;
        }
        seenTxHashes.add(tx.txHash);
        return true;
      });

      // Sort by timestamp descending (most recent first)
      // Use txHash as secondary sort key for stable sorting
      const sorted = [...uniqueTxs].sort((a, b) => {
        const timeA = new Date(a.timestamp).getTime();
        const timeB = new Date(b.timestamp).getTime();
        // Handle invalid dates - put them at the end
        if (isNaN(timeA) && isNaN(timeB)) return a.txHash.localeCompare(b.txHash);
        if (isNaN(timeA)) return 1;
        if (isNaN(timeB)) return -1;
        // Descending order (newest first) - higher timestamp comes first
        if (timeB !== timeA) return timeB - timeA;
        // Stable sort by txHash for same timestamps
        return b.txHash.localeCompare(a.txHash);
      });

      return sorted;
    },
    [data]
  );

  // TODO: optimize re-renders, seems like tables re-render unnecessarily while paused
  const [paused, setPaused] = useState<boolean>(false);
  const [pausedPage, setPausedPage] = useState<Tx[]>([]);

  useEffect(() => {
    if (paused) {
      return;
    }
    const firstPageTxs = data?.pages[0]?.txs ?? [];
    // Sort by timestamp descending (most recent first) with stable sort
    const sorted = [...firstPageTxs].sort((a, b) => {
      const timeA = new Date(a.timestamp).getTime();
      const timeB = new Date(b.timestamp).getTime();
      // Handle invalid dates
      if (isNaN(timeA) && isNaN(timeB)) return a.txHash.localeCompare(b.txHash);
      if (isNaN(timeA)) return 1;
      if (isNaN(timeB)) return -1;
      if (timeB !== timeA) return timeB - timeA;
      return b.txHash.localeCompare(a.txHash);
    });
    setPausedPage(sorted);
  }, [data, paused]);

  // Prefetch profiles for all loaded txs so they're ready when user views the table
  usePrefetchProfiles(allRows);

  const pausedRows = useMemo(() => {
    const fetchedPages =
      data && data.pages.length > 1 ? data.pages.slice(1).flatMap((d) => d?.txs ?? []) : [];
    const combined = [...pausedPage, ...fetchedPages];

    // Deduplicate by txHash
    const seenTxHashes = new Set<string>();
    const uniqueTxs = combined.filter((tx) => {
      if (seenTxHashes.has(tx.txHash)) {
        return false;
      }
      seenTxHashes.add(tx.txHash);
      return true;
    });

    // Sort by timestamp descending (most recent first) with stable sort
    return [...uniqueTxs].sort((a, b) => {
      const timeA = new Date(a.timestamp).getTime();
      const timeB = new Date(b.timestamp).getTime();
      // Handle invalid dates
      if (isNaN(timeA) && isNaN(timeB)) return a.txHash.localeCompare(b.txHash);
      if (isNaN(timeA)) return 1;
      if (isNaN(timeB)) return -1;
      if (timeB !== timeA) return timeB - timeA;
      return b.txHash.localeCompare(a.txHash);
    });
  }, [data, pausedPage]);

  // Don't render if tokenId is not available
  if (!tokenId) {
    return null;
  }

  return (
    <TxTable
      symbol={symbol}
      data={paused ? pausedRows : allRows}
      columns={columns}
      fetchNextPage={fetchNextPage}
      isFetching={isFetching}
      hasNextPage={hasNextPage}
      paused={paused}
      setPaused={setPaused}
      textBackgroundColor={textBackgroundColor}
      className={className}
    />
  );
});

TxnsTab.displayName = 'TxnsTab';
