// useBalanceSubscription Hook
// Real-time balance subscription via Ably presence and pub/sub channels
// Connects to the balance-aggregator backend service
// Falls back to Helius WebSocket + RPC polling after 3 failed retries

'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import type * as Ably from 'ably';
import { useAblyClient } from '@/contexts/AblyContext';
import { useAuth } from '@/contexts/AuthContext';
import { useWallet } from '@/contexts/FrameworkKitWalletContext';
import { createHeliusWebSocketClient, createHeliusRpcClient, HeliusWebSocketClient, getConnection } from '@/lib/solana';
import { LAMPORTS_PER_SOL } from '@solana/web3.js';
import type { BalanceState, BalanceUpdate } from '@/types/balance';

const PRESENCE_CHANNEL = 'balance:presence';
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;
const FALLBACK_POLL_INTERVAL_MS = 30000; // 30 seconds

/**
 * Hook for subscribing to real-time balance updates via the balance-aggregator service
 *
 * Flow:
 * 1. User authenticates + connects wallet
 * 2. Subscribe to `user:{userId}:balance` FIRST (to catch initial publish)
 * 3. Enter presence on `balance:presence` with { wallet, userId } (triggers server to publish)
 * 4. Receive real-time SOL + token balance updates
 * 5. Leave presence on disconnect/logout
 *
 * Fallback:
 * - After 3 failed attempts to connect via Ably presence, falls back to Helius WebSocket
 * - If WebSocket fails, uses RPC polling every 30 seconds
 *
 * @returns BalanceState with sol, tokens, isLoading, isConnected, and lastUpdated
 */
export function useBalanceSubscription(): BalanceState {
  const { client, isConnected: ablyConnected } = useAblyClient();
  const { user, isAuthenticated } = useAuth();
  const { publicKey, connected, autoConnecting } = useWallet();

  const [state, setState] = useState<BalanceState>({
    sol: null,
    tokens: [],
    isLoading: true,
    isConnected: false,
    lastUpdated: null,
  });

  // Track cleanup state and refs
  const isCleanedUpRef = useRef(false);
  const presenceChannelRef = useRef<Ably.Types.RealtimeChannelCallbacks | null>(null);
  const balanceChannelRef = useRef<Ably.Types.RealtimeChannelCallbacks | null>(null);
  const retryCountRef = useRef(0);
  const usingFallbackRef = useRef(false);
  const wsClientRef = useRef<HeliusWebSocketClient | null>(null);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Memoize wallet string to prevent infinite loops
  const walletAddress = publicKey?.toBase58();
  const userId = user?.id;

  // Effect 1: Fetch and poll balance via RPC when wallet is connected
  // This runs independently of Ably and provides immediate balance data
  // NOTE: We fetch balance even without authentication so users can see their balance
  // before signing in (important for trading flow)
  // Polls every 10 seconds as a fallback for real-time updates
  useEffect(() => {
    if (!connected || !walletAddress) {
      return;
    }

    let cancelled = false;
    let pollInterval: NodeJS.Timeout | null = null;

    const fetchBalance = async () => {
      try {
        const connection = getConnection();
        const { PublicKey } = await import('@solana/web3.js');
        const pubkey = new PublicKey(walletAddress);
        const lamports = await connection.getBalance(pubkey, 'confirmed');
        const balance = lamports / LAMPORTS_PER_SOL;

        if (!cancelled) {
          setState(prev => {
            // Always update SOL balance from RPC
            // Real-time Ably updates will override this with more frequent updates
            if (prev.sol !== balance) {
              return {
                ...prev,
                sol: balance,
                isLoading: false,
                lastUpdated: Date.now(),
              };
            }
            // Just clear loading state if balance hasn't changed
            if (prev.isLoading) {
              return { ...prev, isLoading: false };
            }
            return prev;
          });
        }
      } catch (error) {
        console.error('[useBalanceSubscription] Failed to fetch balance:', error);
        if (!cancelled) {
          setState(prev => ({ ...prev, isLoading: false }));
        }
      }
    };

    // Fetch immediately
    fetchBalance();

    // Poll every 10 seconds as fallback for real-time updates
    pollInterval = setInterval(fetchBalance, 10000);

    return () => {
      cancelled = true;
      if (pollInterval) {
        clearInterval(pollInterval);
      }
    };
  }, [connected, walletAddress]);

  // Effect 2: Set up Ably presence for real-time updates
  // NOTE: Real-time updates via Ably require authentication, but basic balance
  // display works without auth (via Effect 1)
  useEffect(() => {
    // Wait for auto-connect to complete before setting up presence
    // This prevents race conditions where presence is entered/left multiple times
    if (autoConnecting) {
      return;
    }

    // Guard: need auth + wallet + ably client for real-time updates
    if (!isAuthenticated || !connected || !walletAddress || !userId || !client) {
      // Only reset state if wallet is disconnected (not just unauthenticated)
      // This allows balance to remain visible when connected but not authenticated
      if (!connected) {
        setState({
          sol: null,
          tokens: [],
          isLoading: false,
          isConnected: false,
          lastUpdated: null,
        });
      }
      return;
    }

    // Wait for Ably to be connected before setting up presence
    if (!ablyConnected) {
      return;
    }

    isCleanedUpRef.current = false;
    retryCountRef.current = 0;
    usingFallbackRef.current = false;

    // Fallback: Use Helius WebSocket + RPC polling
    const setupFallback = async () => {
      if (isCleanedUpRef.current) return;

      console.log('[useBalanceSubscription] Using Helius fallback after Ably failures');
      usingFallbackRef.current = true;

      try {
        // Step 1: Fetch initial balance via RPC
        const rpcClient = createHeliusRpcClient();
        const initialBalance = await rpcClient.getBalanceInSol({
          publicKey: walletAddress,
          commitment: 'confirmed',
        });

        if (isCleanedUpRef.current) return;

        setState(prev => ({
          ...prev,
          sol: initialBalance,
          tokens: [], // Fallback doesn't track platform tokens
          isLoading: false,
          isConnected: true,
          lastUpdated: Date.now(),
        }));

        // Step 2: Try WebSocket for real-time updates
        try {
          const wsClient = createHeliusWebSocketClient();
          wsClientRef.current = wsClient;

          await wsClient.connect();

          if (isCleanedUpRef.current) {
            wsClient.disconnect();
            return;
          }

          await wsClient.subscribeToBalance(walletAddress, (balanceInSol) => {
            if (!isCleanedUpRef.current) {
              setState(prev => ({
                ...prev,
                sol: balanceInSol,
                lastUpdated: Date.now(),
              }));
            }
          });
        } catch (wsError) {
          console.warn('[useBalanceSubscription] WebSocket fallback failed, using polling:', wsError);

          // Step 3: Fall back to polling
          pollingIntervalRef.current = setInterval(async () => {
            if (isCleanedUpRef.current) return;
            try {
              const balance = await rpcClient.getBalanceInSol({
                publicKey: walletAddress,
                commitment: 'confirmed',
              });
              if (!isCleanedUpRef.current) {
                setState(prev => ({
                  ...prev,
                  sol: balance,
                  lastUpdated: Date.now(),
                }));
              }
            } catch {
              // Silent polling error
            }
          }, FALLBACK_POLL_INTERVAL_MS);
        }
      } catch (error) {
        console.error('[useBalanceSubscription] Fallback setup error:', error);
        if (!isCleanedUpRef.current) {
          setState(prev => ({ ...prev, isLoading: false, isConnected: false }));
        }
      }
    };

    // Primary: Ably presence subscription with retry logic
    const setupAblySubscription = async (attempt: number): Promise<boolean> => {
      if (isCleanedUpRef.current) return false;
      if (!client || !ablyConnected) {
        console.warn(`[useBalanceSubscription] Ably not ready (attempt ${attempt}/${MAX_RETRIES})`);
        return false;
      }

      try {
        // 1. Subscribe to user-specific balance channel FIRST
        const balanceChannel = client.channels.get(`user:${userId}:balance`);
        balanceChannelRef.current = balanceChannel;

        balanceChannel.subscribe('update', (message) => {
          if (isCleanedUpRef.current) return;

          const data = message.data as BalanceUpdate;

          // Verify this update is for our wallet
          if (data.wallet === walletAddress) {
            setState({
              sol: data.sol,
              tokens: data.tokens,
              isLoading: false,
              isConnected: true,
              lastUpdated: data.timestamp,
            });
          }
        });

        if (isCleanedUpRef.current) return false;

        // 2. THEN enter presence (triggers server to fetch & publish balance)
        const presenceChannel = client.channels.get(PRESENCE_CHANNEL);
        presenceChannelRef.current = presenceChannel;

        await presenceChannel.presence.enter({ wallet: walletAddress, userId });

        if (!isCleanedUpRef.current) {
          setState(prev => ({ ...prev, isConnected: true, isLoading: false }));
        }

        return true;
      } catch (error) {
        console.error(`[useBalanceSubscription] Ably setup error (attempt ${attempt}/${MAX_RETRIES}):`, error);

        // Clean up failed channels
        if (balanceChannelRef.current) {
          balanceChannelRef.current.unsubscribe('update');
          balanceChannelRef.current = null;
        }
        if (presenceChannelRef.current) {
          presenceChannelRef.current = null;
        }

        return false;
      }
    };

    const setupWithRetry = async () => {
      // Initial balance is already fetched above via fetchInitialBalanceOnce()
      // Try Ably with retries
      for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        if (isCleanedUpRef.current) return;

        retryCountRef.current = attempt;
        const success = await setupAblySubscription(attempt);

        if (success) {
          return; // Connected successfully
        }

        // Wait before retry (except on last attempt)
        if (attempt < MAX_RETRIES) {
          await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
        }
      }

      // All retries failed, use fallback
      if (!isCleanedUpRef.current) {
        await setupFallback();
      }
    };

    setupWithRetry();

    // Cleanup
    return () => {
      isCleanedUpRef.current = true;

      // Leave Ably presence
      if (presenceChannelRef.current) {
        presenceChannelRef.current.presence.leave().catch(() => {
          // Silent cleanup error
        });
        presenceChannelRef.current = null;
      }

      // Unsubscribe from Ably balance channel
      if (balanceChannelRef.current) {
        balanceChannelRef.current.unsubscribe('update');
        balanceChannelRef.current = null;
      }

      // Clean up Helius WebSocket fallback
      if (wsClientRef.current) {
        try {
          wsClientRef.current.disconnect();
        } catch {
          // Ignore cleanup errors
        }
        wsClientRef.current = null;
      }

      // Clean up polling fallback
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    };
  }, [isAuthenticated, connected, walletAddress, client, userId, ablyConnected, autoConnecting]);

  return state;
}

/**
 * Notify the balance-aggregator that a user acquired a new token
 * Call this after a successful swap where the user acquired a new platform token
 * for faster updates (instead of waiting for the 60s rescan)
 */
export function useNotifyTokenAcquired() {
  const { client, isConnected: ablyConnected } = useAblyClient();
  const { user, isAuthenticated } = useAuth();
  const { publicKey, connected } = useWallet();

  const notifyTokenAcquired = useCallback(
    async (mint: string) => {
      if (!client || !ablyConnected || !isAuthenticated || !connected || !publicKey || !user?.id) {
        console.warn('[useNotifyTokenAcquired] Cannot notify: missing required state');
        return false;
      }

      try {
        const channel = client.channels.get('balance:token-acquired');
        await channel.publish('acquired', {
          userId: user.id,
          wallet: publicKey.toBase58(),
          mint,
        });
        return true;
      } catch (error) {
        console.error('[useNotifyTokenAcquired] Failed to publish:', error);
        return false;
      }
    },
    [client, ablyConnected, isAuthenticated, connected, publicKey, user?.id]
  );

  return { notifyTokenAcquired };
}
