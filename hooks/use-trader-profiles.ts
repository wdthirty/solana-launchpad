import { useEffect, useState, useRef, useCallback } from 'react';

export type TraderProfile = {
  id: string;
  username: string;
  avatar: string | null;
  points: number;
  verified?: boolean;
};

type BatchProfilesResponse = {
  profiles: Record<string, TraderProfile | null>;
};

// Global cache for trader profiles - persists across component re-renders
// Key: wallet address, Value: profile or null (if not a registered user)
const globalProfileCache = new Map<string, TraderProfile | null>();

// Track addresses we've already looked up (including ones with no profile)
const lookedUpAddresses = new Set<string>();

// Pending fetch promise to deduplicate concurrent requests
let pendingFetch: Promise<void> | null = null;
let pendingAddresses: Set<string> = new Set();

/**
 * Fetch profiles for addresses not in cache.
 * Batches concurrent requests to minimize API calls.
 */
async function fetchMissingProfiles(addresses: string[]): Promise<void> {
  // Filter to only addresses we haven't looked up yet
  const missingAddresses = addresses.filter(addr => !lookedUpAddresses.has(addr));

  if (missingAddresses.length === 0) {
    return;
  }

  // Add to pending batch
  missingAddresses.forEach(addr => pendingAddresses.add(addr));

  // If there's already a pending fetch, wait for it
  if (pendingFetch) {
    await pendingFetch;
    return;
  }

  // Debounce: wait a tick to batch concurrent requests
  await new Promise(resolve => setTimeout(resolve, 10));

  // Get all pending addresses and clear the set
  const addressesToFetch = Array.from(pendingAddresses);
  pendingAddresses = new Set();

  if (addressesToFetch.length === 0) {
    return;
  }

  // Mark as looked up immediately to prevent duplicate fetches
  addressesToFetch.forEach(addr => lookedUpAddresses.add(addr));

  pendingFetch = (async () => {
    try {
      const response = await fetch('/api/users/batch-profiles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallets: addressesToFetch }),
      });

      if (response.ok) {
        const data: BatchProfilesResponse = await response.json();
        // Update global cache with results
        for (const [wallet, profile] of Object.entries(data.profiles)) {
          globalProfileCache.set(wallet, profile);
        }
      }
    } catch (error) {
      // On error, remove from lookedUp so they can be retried
      addressesToFetch.forEach(addr => lookedUpAddresses.delete(addr));
      console.error('Failed to fetch trader profiles:', error);
    } finally {
      pendingFetch = null;
    }
  })();

  await pendingFetch;
}

/**
 * Hook to fetch and cache trader profiles for transaction lists.
 * Uses a global cache to minimize API calls across re-renders and new transactions.
 *
 * Optimizations:
 * - Global cache persists across component updates
 * - Only fetches addresses not already in cache
 * - Batches concurrent requests with 10ms debounce
 * - Null results are cached to avoid re-fetching non-users
 */
export function useTraderProfiles(walletAddresses: string[]) {
  const [profiles, setProfiles] = useState<Record<string, TraderProfile | null>>({});
  const [, forceUpdate] = useState(0);

  // Track the addresses we're interested in
  const addressesRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const uniqueAddresses = Array.from(new Set(walletAddresses));
    addressesRef.current = new Set(uniqueAddresses);

    // Build current profiles from cache
    const currentProfiles: Record<string, TraderProfile | null> = {};
    const missingAddresses: string[] = [];

    for (const addr of uniqueAddresses) {
      if (globalProfileCache.has(addr)) {
        currentProfiles[addr] = globalProfileCache.get(addr)!;
      } else if (!lookedUpAddresses.has(addr)) {
        missingAddresses.push(addr);
      }
    }

    // Update state with cached profiles
    setProfiles(currentProfiles);

    // Fetch missing profiles if any
    if (missingAddresses.length > 0) {
      fetchMissingProfiles(missingAddresses).then(() => {
        // After fetch, update state with new profiles
        const updatedProfiles: Record<string, TraderProfile | null> = {};
        for (const addr of Array.from(addressesRef.current)) {
          if (globalProfileCache.has(addr)) {
            updatedProfiles[addr] = globalProfileCache.get(addr)!;
          }
        }
        setProfiles(updatedProfiles);
      });
    }
  }, [walletAddresses]);

  return { data: profiles };
}

/**
 * Prefetch trader profiles for a list of addresses.
 * Call this early (e.g., when tx data loads) to populate the cache
 * before the trades tab is visible.
 */
export function prefetchTraderProfiles(walletAddresses: string[]): void {
  const uniqueAddresses = Array.from(new Set(walletAddresses));
  const missingAddresses = uniqueAddresses.filter(addr => !lookedUpAddresses.has(addr));

  if (missingAddresses.length > 0) {
    // Fire and forget - don't await
    fetchMissingProfiles(missingAddresses);
  }
}
