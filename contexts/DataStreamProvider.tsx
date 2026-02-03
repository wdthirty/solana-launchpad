'use client';

import { ApeQueries, QueryData } from '@/components/Explore/queries';
import { atomMsgWithListeners } from '@/lib/jotai';
import { InfiniteData, useQueryClient } from '@tanstack/react-query';
import { useSetAtom, atom, useAtomValue } from 'jotai';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef } from 'react';
import { StreamRequest, StreamResponse } from './TokenChart/msg';
import { delay } from '@/lib/utils';

const WS_URL = 'wss://trench-stream.jup.ag/ws';

const RECONNECT_DELAY_MILLIS = 2_500;

const [dataStreamMsgAtom, useDataStreamListener] = atomMsgWithListeners<StreamResponse | null>(
  null
);
export { useDataStreamListener };

// WebSocket connection status atom
type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'reconnecting';
const connectionStatusAtom = atom<ConnectionStatus>('disconnected');

// Track last successful message time for health monitoring
const lastMessageTimeAtom = atom<number | null>(null);

/**
 * Hook to get WebSocket connection status
 * Use this to conditionally enable/disable HTTP polling
 */
export function useDataStreamStatus() {
  const status = useAtomValue(connectionStatusAtom);
  const lastMessageTime = useAtomValue(lastMessageTimeAtom);

  const isConnected = status === 'connected';
  const isHealthy = isConnected && lastMessageTime !== null &&
    (Date.now() - lastMessageTime) < 60_000; // Consider healthy if message received in last 60s

  return {
    status,
    isConnected,
    isHealthy,
    lastMessageTime,
  };
}

type DataStreamContextType = {
  subscribePools: (pools: string[]) => void;
  unsubscribePools: (pools: string[]) => void;
  subscribeRecentTokenList: () => void;
  unsubscribeRecentTokenList: () => void;
  subscribeTxns: (assets: string[]) => void;
  unsubscribeTxns: (assets: string[]) => void;
};

const DataStreamContext = createContext<DataStreamContextType | null>(null);

export const DataStreamProvider = ({ children }: { children: React.ReactNode }) => {
  const queryClient = useQueryClient();
  const partnerConfigs = useMemo(
    () => process.env.NEXT_PUBLIC_POOL_CONFIG_KEY?.split(',') || [],
    []
  );
  const setDataStreamMsg = useSetAtom(dataStreamMsgAtom);
  const setConnectionStatus = useSetAtom(connectionStatusAtom);
  const setLastMessageTime = useSetAtom(lastMessageTimeAtom);

  const ws = useRef<WebSocket | null>(null);
  const shouldReconnect = useRef(true);
  const subRecentTokenList = useRef(false);
  const subPools = useRef<Set<string>>(new Set());
  const subTxnsAssets = useRef<Set<string>>(new Set());

  const subscribeRecentTokenList = useCallback(() => {
    subRecentTokenList.current = true;

    if (ws?.current?.readyState === WebSocket.OPEN) {
      ws.current.send(
        createRequest({
          type: 'subscribe:recent',
          filters: {
            partnerConfigs,
          },
        })
      );
    }
  }, [partnerConfigs]);

  const unsubscribeRecentTokenList = useCallback(() => {
    subRecentTokenList.current = false;

    if (ws?.current?.readyState === WebSocket.OPEN) {
      ws.current.send(createRequest({ type: 'unsubscribe:recent' }));
    }
  }, []);

  const subscribePools = useCallback((pools: string[]) => {
    for (const pool of pools) {
      subPools.current.add(pool);
    }

    if (ws?.current?.readyState === WebSocket.OPEN) {
      ws.current.send(createRequest({ type: 'subscribe:pool', pools: pools }));
    }
  }, []);

  const unsubscribePools = useCallback((pools: string[]) => {
    for (const pool of pools) {
      subPools.current.delete(pool);
    }
    if (ws?.current?.readyState === WebSocket.OPEN) {
      ws.current.send(createRequest({ type: 'unsubscribe:pool', pools: pools }));
    }
  }, []);

  const subscribeTxns = useCallback((assets: string[]) => {
    for (const asset of assets) {
      subTxnsAssets.current.add(asset);
    }
    if (ws?.current?.readyState === WebSocket.OPEN) {
      ws.current.send(createRequest({ type: 'subscribe:txns', assets: assets }));
    }
  }, []);

  const unsubscribeTxns = useCallback((assets: string[]) => {
    for (const asset of assets) {
      subTxnsAssets.current.delete(asset);
    }
    if (ws?.current?.readyState === WebSocket.OPEN) {
      ws.current.send(createRequest({ type: 'unsubscribe:txns', assets: assets }));
    }
  }, []);

  // const subscribePrices = useCallback((assets: string[]) => {
  //   for (const asset of assets) {
  //     subPricesAssets.current.add(asset);
  //     // TODO: refactor stream context to support decoupling this logic
  //     // Garbage collect unsubscribed asset prices
  //     assetPricesFamily.remove(asset);
  //   }
  //   if (ws?.current?.readyState === WebSocket.OPEN) {
  //     ws.current.send(createRequest({ type: 'subscribe:prices', assets: assets }));
  //   }
  // }, []);

  // const unsubscribePrices = useCallback((assets: string[]) => {
  //   for (const asset of assets) {
  //     subPricesAssets.current.delete(asset);
  //   }
  //   if (ws?.current?.readyState === WebSocket.OPEN) {
  //     ws.current.send(createRequest({ type: 'unsubscribe:prices', assets: assets }));
  //   }
  // }, []);

  const init = useCallback(() => {
    setConnectionStatus('connecting');
    const initws = new WebSocket(WS_URL);
    ws.current = initws;

    // Resubscribe to existing
    initws.onopen = () => {
      setConnectionStatus('connected');
      if (subRecentTokenList.current) {
        subscribeRecentTokenList();
      }
      if (subPools.current) {
        subscribePools(Array.from(subPools.current));
      }
      if (subTxnsAssets.current) {
        subscribeTxns(Array.from(subTxnsAssets.current));
      }
      // if (subPricesAssets.current) {
      //   subscribePrices(Array.from(subPricesAssets.current));
      // }
    };

    initws.onmessage = (event) => {
      const msg: StreamResponse = JSON.parse(event.data);
      setDataStreamMsg(msg);
      setLastMessageTime(Date.now()); // Track last successful message

      // We assume all actions are related to the subscribed token-tx-table
      if (msg.type === 'actions') {
        const tokenId = msg.data?.[0]?.asset;
        if (!tokenId) {
          return;
        }
        // Update token tx
        queryClient.setQueriesData(
          {
            type: 'active',
            queryKey: ApeQueries.tokenTxs({ id: tokenId }).queryKey,
          },
          (prev?: InfiniteData<QueryData<typeof ApeQueries.tokenTxs>>) => {
            if (!prev?.pages || prev.pages.length === 0) {
              return;
            }
            const firstPage = prev.pages[0];
            if (!firstPage) {
              return;
            }
            const next = firstPage.next;

            // Update first page data with deduplication
            const firstPageTxs = firstPage ? [...firstPage.txs] : [];
            const existingTxHashes = new Set(firstPageTxs.map((tx) => tx.txHash));

            // Only add new transactions that don't already exist
            const newTxs = msg.data.filter((tx) => !existingTxHashes.has(tx.txHash));
            firstPageTxs.unshift(...newTxs);

            // Sort by timestamp descending (most recent first) with stable sort
            firstPageTxs.sort((a, b) => {
              const timeA = new Date(a.timestamp).getTime();
              const timeB = new Date(b.timestamp).getTime();
              // Handle invalid dates - put them at the end
              if (isNaN(timeA) && isNaN(timeB)) return a.txHash.localeCompare(b.txHash);
              if (isNaN(timeA)) return 1;
              if (isNaN(timeB)) return -1;
              // Descending order (newest first)
              if (timeB !== timeA) return timeB - timeA;
              // Stable sort by txHash for same timestamps
              return b.txHash.localeCompare(a.txHash);
            });

            // Overwrite previous first page
            const newPages = prev.pages.slice(1);
            newPages.unshift({
              txs: firstPageTxs,
              next,
              args: { ...firstPage.args },
            });

            return {
              pages: newPages,
              pageParams: prev.pageParams,
            };
          }
        );
      }
    };

    initws.onerror = () => {
      // WebSocket errors are common (network issues, server issues, etc.)
      // The error object is often empty, so we don't log it
      // Reconnection is handled in onclose
      setConnectionStatus('disconnected');
      initws.close();
    };

    initws.onclose = async () => {
      setConnectionStatus('disconnected');
      if (!shouldReconnect.current) return;
      setConnectionStatus('reconnecting');
      await delay(RECONNECT_DELAY_MILLIS);
      init();
    };

    return () => {
      initws?.close();
    };
  }, [queryClient, setDataStreamMsg, setConnectionStatus, setLastMessageTime, subscribePools, subscribeRecentTokenList, subscribeTxns]);

  useEffect(() => {
    const cleanup = init();
    return () => {
      shouldReconnect.current = false;
      cleanup();
    };
  }, [init]);

  return (
    <DataStreamContext.Provider
      value={{
        subscribePools,
        unsubscribePools,
        subscribeRecentTokenList,
        unsubscribeRecentTokenList,
        subscribeTxns,
        unsubscribeTxns,
      }}
    >
      {children}
    </DataStreamContext.Provider>
  );
};

export const useDataStream = () => {
  const context = useContext(DataStreamContext);
  if (!context) {
    throw new Error('useDataStream must be used within DataStreamProvider');
  }
  return context;
};

function createRequest(req: StreamRequest): string {
  return JSON.stringify({ ...req });
}
