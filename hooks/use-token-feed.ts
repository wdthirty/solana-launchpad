// useTokenFeed Hook
// Fetches tokens with pagination and real-time updates
// Updated: 2025-10-21 - Added support for new categories and real-time swap updates
// Updated: 2025-11-29 - Added sessionStorage sync to persist Ably tokens across refreshes

'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useAblyChannel } from './use-ably-channel';
import type { TokenWithCreator } from '@/lib/types';

// Session storage key for recently created tokens (survives refresh, clears on tab close)
const RECENT_TOKENS_KEY = 'token-feed:recent-tokens';
const RECENT_TOKENS_MAX_AGE_MS = 60 * 1000; // Only keep tokens from last 60 seconds
const RECENT_TOKENS_MAX_COUNT = 20; // Max tokens to store

interface RecentToken {
  address: string;
  timestamp: number;
  data: any; // The full token event data
}

// Helper to get recent tokens from sessionStorage
function getRecentTokensFromStorage(): RecentToken[] {
  if (typeof window === 'undefined') return [];
  try {
    const stored = sessionStorage.getItem(RECENT_TOKENS_KEY);
    if (!stored) return [];
    const tokens: RecentToken[] = JSON.parse(stored);
    const now = Date.now();
    // Filter out old tokens
    return tokens.filter(t => now - t.timestamp < RECENT_TOKENS_MAX_AGE_MS);
  } catch {
    return [];
  }
}

// Helper to save recent token to sessionStorage
function saveRecentTokenToStorage(token: RecentToken): void {
  if (typeof window === 'undefined') return;
  try {
    const existing = getRecentTokensFromStorage();
    // Check if already exists
    if (existing.some(t => t.address === token.address)) return;
    // Add new token at beginning, keep max count
    const updated = [token, ...existing].slice(0, RECENT_TOKENS_MAX_COUNT);
    sessionStorage.setItem(RECENT_TOKENS_KEY, JSON.stringify(updated));
  } catch {
    // Storage might be full, ignore
  }
}

// Helper to clear old tokens from storage
function cleanupRecentTokensStorage(): void {
  if (typeof window === 'undefined') return;
  try {
    const tokens = getRecentTokensFromStorage();
    sessionStorage.setItem(RECENT_TOKENS_KEY, JSON.stringify(tokens));
  } catch {
    // Ignore
  }
}

// Cache for creator profiles to avoid redundant fetches
const creatorProfileCache = new Map<string, { id: string; username: string; avatar: string | null; points: number; verified?: boolean } | null>();

// Fetch creator profile by wallet address
async function fetchCreatorProfile(wallet: string): Promise<{ id: string; username: string; avatar: string | null; points: number; verified?: boolean } | null> {
  // Check cache first
  if (creatorProfileCache.has(wallet)) {
    return creatorProfileCache.get(wallet) || null;
  }

  try {
    const response = await fetch('/api/users/batch-profiles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ wallets: [wallet] }),
    });

    if (!response.ok) return null;

    const data = await response.json();
    const profile = data.profiles?.[wallet] || null;

    // Cache the result
    creatorProfileCache.set(wallet, profile);

    return profile;
  } catch {
    return null;
  }
}

export type TokenFeedCategory = 'default' | 'featured' | 'newest' | 'last_traded' | 'market_cap' | 'top_gainers';

export interface UseTokenFeedOptions {
  category?: TokenFeedCategory;
  limit?: number;
  enableRealtime?: boolean;
  lazy?: boolean; // If true, don't fetch until explicitly requested
  initialPage?: number; // Initial page to load (for scroll restoration)
}

export interface TokenFeedPagination {
  page: number;
  limit: number;
  total: number;
  hasMore: boolean;
  totalPages: number;
}

export interface UseTokenFeedReturn {
  tokens: TokenWithCreator[];
  pagination: TokenFeedPagination | null;
  isLoading: boolean;
  error: Error | null;
  currentPage: number;
  goToPage: (page: number) => void;
  nextPage: () => void;
  prevPage: () => void;
  refresh: () => void;
  isRealtimeConnected: boolean;
  setPaused: (paused: boolean) => void;
  isPaused: boolean;
  pendingUpdatesCount: number;
}

interface TokenUpdateEvent {
  address: string;
  updates: {
    last_trade_time?: string;
    last_trade_price?: number;
    current_price?: number;
    market_cap?: number;
    price_change_1h?: number;
    price_change_24h?: number;
    volume_1h?: number;
    volume_24h?: number;
    trades_1h?: number;
    trades_24h?: number;
    bonding_curve_progress?: number;
    is_migrated?: boolean;
    quote_reserve_amount?: number;
    migration_threshold?: number;
    // Token metadata (included in swap updates)
    name?: string;
    symbol?: string;
    logo?: string;
    description?: string;
    creator_wallet?: string;
    created_at?: string;
    // ATH (All-Time High) field - backend sends snake_case
    ath_market_cap?: number;
  };
  timestamp: number;
}

/**
 * Hook for fetching and managing token feed with pagination
 * Includes real-time updates via Ably for page 1 only
 */
export function useTokenFeed({
  category = 'default',
  limit = 50,
  enableRealtime = true,
  lazy = false,
  initialPage = 1,
}: UseTokenFeedOptions = {}): UseTokenFeedReturn {
  const [tokens, setTokens] = useState<TokenWithCreator[]>([]);
  const [pagination, setPagination] = useState<TokenFeedPagination | null>(null);
  const [isLoading, setIsLoading] = useState(!lazy); // Start as not loading if lazy
  const [error, setError] = useState<Error | null>(null);
  const [currentPage, setCurrentPage] = useState(initialPage);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false); // Track if we've loaded at least once

  // Hover-to-pause state
  const [isPaused, setIsPaused] = useState(false);
  const [newTokenBuffer, setNewTokenBuffer] = useState<any[]>([]);

  // Debounced sorting - track if sort is needed and debounce it
  const [needsSort, setNeedsSort] = useState(false);
  const sortTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch tokens from API
  const fetchTokens = useCallback(async (page: number) => {
    try {
      setIsLoading(true);
      setError(null);

      const params = new URLSearchParams({
        sort: category,
        page: page.toString(),
        limit: limit.toString(),
      });

      const response = await fetch(`/api/tokens?${params}`);

      if (!response.ok) {
        throw new Error(`Failed to fetch tokens: ${response.statusText}`);
      }

      const data = await response.json();
      let finalTokens = data.tokens || [];

      // For 'newest' category page 1, merge with sessionStorage tokens
      // This ensures recently created tokens (seen via Ably) aren't lost on refresh
      if (category === 'newest' && page === 1) {
        const recentTokens = getRecentTokensFromStorage();

        if (recentTokens.length > 0) {
          const existingAddresses = new Set(finalTokens.map((t: TokenWithCreator) => t.address));

          // Convert stored events to TokenWithCreator format and prepend missing ones
          const missingTokens = recentTokens
            .filter(rt => !existingAddresses.has(rt.address))
            .map(rt => {
              const event = rt.data;
              return {
                id: crypto.randomUUID(),
                address: event.address,
                creator_wallet: event.creator || '',
                name: event.name || null,
                symbol: event.symbol || null,
                decimals: event.decimals || 0,
                supply: event.supply ? BigInt(event.supply) : null,
                created_at: new Date(rt.timestamp).toISOString(),
                current_price: null,
                market_cap: null,
                volume_24h: null,
                price_change_24h: null,
                price_change_1h: null,
                last_price_update: null,
                updated_at: new Date(rt.timestamp).toISOString(),
                metadata: {
                  logo: event.logo,
                  description: event.description,
                  metaplex_uri: event.metaplex_uri,
                },
                is_active: true,
                is_verified: false,
                creator_user_id: null,
                creator: null,
                volume_1h: undefined,
                grace_mode_enabled: event.grace_mode_enabled || false,
                fee_tier_bp: event.fee_tier_bp || null,
                launch_timestamp: event.launch_timestamp || null,
                bonding_curve_progress: event.bonding_curve_progress ?? 0,
                is_migrated: event.is_migrated || false,
                page_id: null,
              } as TokenWithCreator;
            });

          if (missingTokens.length > 0) {
            // Prepend missing tokens (newest first) and keep within limit
            finalTokens = [...missingTokens, ...finalTokens].slice(0, limit);

            // Fetch creator profiles for missing tokens (from sessionStorage)
            const wallets = missingTokens
              .map(t => t.creator_wallet)
              .filter((w): w is string => !!w);

            if (wallets.length > 0) {
              const uniqueWallets = [...new Set(wallets)];
              Promise.all(uniqueWallets.map(wallet => fetchCreatorProfile(wallet))).then((profiles) => {
                const profileMap = new Map<string, typeof profiles[0]>();
                uniqueWallets.forEach((wallet, i) => {
                  if (profiles[i]) profileMap.set(wallet, profiles[i]);
                });

                if (profileMap.size > 0) {
                  setTokens((prev) => {
                    return prev.map((token) => {
                      const profile = profileMap.get(token.creator_wallet);
                      if (profile && !token.creator) {
                        return { ...token, creator: profile };
                      }
                      return token;
                    });
                  });
                }
              });
            }
          }
        }

        // Cleanup old tokens from storage
        cleanupRecentTokensStorage();
      }

      setTokens(finalTokens);
      setPagination(data.pagination ? {
        ...data.pagination,
        totalPages: Math.ceil((data.pagination.total || 0) / limit),
      } : null);
      setHasLoadedOnce(true);
    } catch (err) {
      setError(err as Error);
      setTokens([]);
    } finally {
      setIsLoading(false);
    }
  }, [category, limit]);

  // Initial fetch and fetch on page change (skip if lazy and hasn't loaded once)
  useEffect(() => {
    if (!lazy || hasLoadedOnce) {
      fetchTokens(currentPage);
    }
  }, [currentPage, fetchTokens, lazy, hasLoadedOnce]);

  // Apply buffered new tokens when unpausing (only new tokens, not updates)
  useEffect(() => {
    if (!isPaused && newTokenBuffer.length > 0) {
      // Apply all buffered new tokens
      if (newTokenBuffer.length > 0 && category === 'newest' && currentPage === 1) {
        // Collect creator wallets to fetch
        const creatorWallets: string[] = [];

        setTokens((prev) => {
          const existing = new Set(prev.map(t => t.address));
          // Reverse the buffer so newest tokens appear first (they were added to buffer in chronological order)
          const newTokens = [...newTokenBuffer]
            .reverse()
            .filter(event => !existing.has(event.address))
            .map(event => {
              const creatorWallet = event.creator || '';
              if (creatorWallet) creatorWallets.push(creatorWallet);
              return {
                id: crypto.randomUUID(),
                address: event.address,
                creator_wallet: creatorWallet,
                name: event.name || null,
                symbol: event.symbol || null,
                decimals: event.decimals || 0,
                supply: event.supply ? BigInt(event.supply) : null,
                created_at: new Date(event.timestamp).toISOString(),
                current_price: null,
                market_cap: null,
                volume_24h: null,
                price_change_24h: null,
                price_change_1h: null,
                last_price_update: null,
                updated_at: new Date(event.timestamp).toISOString(),
                metadata: {
                  logo: event.logo,
                  description: event.description,
                  metaplex_uri: event.metaplex_uri,
                },
                is_active: true,
                is_verified: false,
                creator_user_id: null,
                creator: null,
                volume_1h: undefined,
                grace_mode_enabled: event.grace_mode_enabled || false,
                fee_tier_bp: event.fee_tier_bp || null,
                launch_timestamp: event.launch_timestamp || null,
                bonding_curve_progress: event.bonding_curve_progress ?? 0,
                is_migrated: event.is_migrated || false,
                page_id: null,
              } as TokenWithCreator;
            });

          return [...newTokens, ...prev].slice(0, limit);
        });

        setPagination((prev) => prev ? {
          ...prev,
          total: prev.total + newTokenBuffer.length,
          totalPages: Math.ceil((prev.total + newTokenBuffer.length) / limit),
        } : null);

        // Fetch creator profiles for buffered tokens
        if (creatorWallets.length > 0) {
          const uniqueWallets = [...new Set(creatorWallets)];
          Promise.all(uniqueWallets.map(wallet => fetchCreatorProfile(wallet))).then((profiles) => {
            const profileMap = new Map<string, typeof profiles[0]>();
            uniqueWallets.forEach((wallet, i) => {
              if (profiles[i]) profileMap.set(wallet, profiles[i]);
            });

            if (profileMap.size > 0) {
              setTokens((prev) => {
                return prev.map((token) => {
                  const profile = profileMap.get(token.creator_wallet);
                  if (profile && !token.creator) {
                    return { ...token, creator: profile };
                  }
                  return token;
                });
              });
            }
          });
        }

        setNewTokenBuffer([]);
      }
    }
  }, [isPaused, newTokenBuffer, category, currentPage, limit]);

  // Clear buffers when changing pages or categories
  useEffect(() => {
    setNewTokenBuffer([]);
  }, [currentPage, category]);

  // Debounced sort effect - runs 500ms after last update that needs sorting
  useEffect(() => {
    if (!needsSort || isPaused) return;

    // Categories that don't need re-sorting
    if (category === 'newest' || category === 'featured') {
      setNeedsSort(false);
      return;
    }

    // Clear any existing timeout
    if (sortTimeoutRef.current) {
      clearTimeout(sortTimeoutRef.current);
    }

    // Debounce the sort by 500ms
    sortTimeoutRef.current = setTimeout(() => {
      setTokens((prev) => {
        const sorted = [...prev];

        if (category === 'last_traded') {
          sorted.sort((a, b) => {
            const timeA = a.last_price_update ? new Date(a.last_price_update).getTime() : 0;
            const timeB = b.last_price_update ? new Date(b.last_price_update).getTime() : 0;
            return timeB - timeA;
          });
        } else if (category === 'top_gainers') {
          sorted.sort((a, b) => {
            const changeA = a.price_change_24h || 0;
            const changeB = b.price_change_24h || 0;
            return changeB - changeA;
          });
        } else if (category === 'market_cap' || category === 'default') {
          sorted.sort((a, b) => {
            const capA = a.market_cap || 0;
            const capB = b.market_cap || 0;
            return capB - capA;
          });
        }

        return sorted;
      });

      setNeedsSort(false);
    }, 500);

    return () => {
      if (sortTimeoutRef.current) {
        clearTimeout(sortTimeoutRef.current);
      }
    };
  }, [needsSort, isPaused, category]);

  // Handle token updates from real-time swaps (single update)
  const handleTokenUpdate = useCallback((message: any) => {
    const event = message.data as TokenUpdateEvent;

    setTokens((prev) => {
      const index = prev.findIndex((t) => t.address === event.address);

      // Token already in current list - update it
      if (index !== -1) {
        const updated = [...prev];
        // Backend sends snake_case (ath_market_cap), spread directly
        const { logo, description, ...otherUpdates } = event.updates;

        updated[index] = {
          ...updated[index],
          ...otherUpdates,
          // Merge metadata fields properly
          ...(logo || description ? {
            metadata: {
              ...updated[index].metadata,
              ...(logo && { logo }),
              ...(description && { description }),
            }
          } : {}),
          updated_at: new Date(event.timestamp).toISOString(),
        };

        return updated;
      }

      // Token not in current list - ignore it
      return prev;
    });

    // Signal that sorting is needed (will be debounced)
    if (category !== 'newest' && category !== 'featured') {
      setNeedsSort(true);
    }
  }, [category]);

  // Handle new token creation (auto-insert at position #1)
  const handleNewToken = useCallback((message: any) => {
    const event = message.data;
    const creatorWallet = event.creator || '';

    // Save to sessionStorage for persistence across refreshes (regardless of category)
    // This ensures the token survives page refresh even if DB hasn't caught up
    saveRecentTokenToStorage({
      address: event.address,
      timestamp: Date.now(),
      data: event,
    });

    // Only add to first page of 'newest' category
    if (category === 'newest' && currentPage === 1) {
      // If paused, buffer the new token (deduplicate by address)
      if (isPaused) {
        setNewTokenBuffer((prev) => {
          // Check if this token is already in the buffer
          if (prev.some(buffered => buffered.address === event.address)) {
            return prev; // Already buffered, skip
          }
          return [...prev, event];
        });
        return;
      }

      // Create token with null creator initially (for instant UI feedback)
      const newToken: TokenWithCreator = {
        id: crypto.randomUUID(),
        address: event.address,
        creator_wallet: creatorWallet,
        name: event.name || null,
        symbol: event.symbol || null,
        decimals: event.decimals || 0,
        supply: event.supply ? BigInt(event.supply) : null,
        created_at: new Date(event.timestamp).toISOString(),
        current_price: null,
        market_cap: null,
        volume_24h: null,
        price_change_24h: null,
        price_change_1h: null,
        last_price_update: null,
        updated_at: new Date(event.timestamp).toISOString(),
        metadata: {
          logo: event.logo,
          description: event.description,
          metaplex_uri: event.metaplex_uri,
        },
        is_active: true,
        is_verified: false,
        creator_user_id: null,
        creator: null,
        volume_1h: undefined,
        grace_mode_enabled: event.grace_mode_enabled || false,
        fee_tier_bp: event.fee_tier_bp || null,
        launch_timestamp: event.launch_timestamp || null,
        bonding_curve_progress: event.bonding_curve_progress ?? 0,
        is_migrated: event.is_migrated || false,
        page_id: null,
      } as TokenWithCreator;

      setTokens((prev) => {
        // Check if token already exists
        if (prev.some((t) => t.address === event.address)) {
          return prev;
        }
        // Add to beginning, keep only limit items
        return [newToken, ...prev].slice(0, limit);
      });

      // Update total count
      setPagination((prev) => prev ? {
        ...prev,
        total: prev.total + 1,
        totalPages: Math.ceil((prev.total + 1) / limit),
      } : null);

      // Fetch creator profile asynchronously and update the token
      if (creatorWallet) {
        fetchCreatorProfile(creatorWallet).then((profile) => {
          if (profile) {
            setTokens((prev) => {
              const index = prev.findIndex((t) => t.address === event.address);
              if (index === -1) return prev;

              const updated = [...prev];
              updated[index] = {
                ...updated[index],
                creator: profile,
              };
              return updated;
            });
          }
        });
      }
    }
  }, [category, currentPage, limit, isPaused]);

  // Use a single channel for all token updates
  // Frontend will update any token that's in the current list, regardless of category
  const channelName = 'tokens:updates';

  // Subscribe to real-time updates (all pages)
  // Updates any token that's in the current list
  const { isConnected: isRealtimeConnected } = useAblyChannel({
    channelName,
    eventName: 'TOKEN_UPDATED',
    onMessage: handleTokenUpdate,
    enabled: enableRealtime,
  });

  // Subscribe to new token events (for 'newest' category, page 1 only)
  // New tokens only appear at the top of page 1
  useAblyChannel({
    channelName: 'tokens:newly-created',
    eventName: 'token-created',
    onMessage: handleNewToken,
    enabled: enableRealtime && currentPage === 1 && category === 'newest',
  });

  // Pagination controls
  const goToPage = useCallback((page: number) => {
    if (pagination && page >= 1 && page <= pagination.totalPages) {
      setCurrentPage(page);
    }
  }, [pagination]);

  const nextPage = useCallback(() => {
    if (pagination?.hasMore) {
      goToPage(currentPage + 1);
    }
  }, [currentPage, pagination, goToPage]);

  const prevPage = useCallback(() => {
    if (currentPage > 1) {
      goToPage(currentPage - 1);
    }
  }, [currentPage, goToPage]);

  const refresh = useCallback(() => {
    fetchTokens(currentPage);
  }, [currentPage, fetchTokens]);

  return {
    tokens,
    pagination,
    isLoading,
    error,
    currentPage,
    goToPage,
    nextPage,
    prevPage,
    refresh,
    isRealtimeConnected,
    setPaused: setIsPaused,
    isPaused,
    pendingUpdatesCount: newTokenBuffer.length, // Only count new tokens (updates still flow through)
  };
}
