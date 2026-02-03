import { useEffect, useState, useRef } from 'react';
import { useWallet } from '@/contexts/FrameworkKitWalletContext';
import { useAuth } from '@/contexts/AuthContext';
import { createHeliusWebSocketClient, HeliusWebSocketClient } from '@/lib/solana';

/**
 * React hook for subscribing to real-time SOL balance updates
 * Uses Helius Enhanced WebSockets for live balance polling
 *
 * IMPORTANT: Only subscribes when user is authenticated AND wallet is connected
 * Automatically disconnects when user logs out or wallet disconnects
 *
 * @returns Object with balance, loading state, and error
 */
export function useSolBalance() {
  const { publicKey, connected } = useWallet();
  const { isAuthenticated } = useAuth();
  const [balance, setBalance] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const clientRef = useRef<HeliusWebSocketClient | null>(null);
  const subscriptionIdRef = useRef<number | null>(null);

  useEffect(() => {
    // Only subscribe if user is authenticated AND wallet is connected with public key
    if (!isAuthenticated || !connected || !publicKey) {
      // Reset state when logged out or disconnected
      setBalance(null);
      setIsLoading(false);
      setError(null);
      return;
    }

    setIsLoading(true);
    setError(null);

    let mounted = true;

    const setupSubscription = async () => {
      try {
        // Create WebSocket client
        const client = createHeliusWebSocketClient();
        clientRef.current = client;

        // Set up error handler
        client.onError((err) => {
          if (mounted) {
            setError(err);
            setIsLoading(false);
          }
        });

        // Set up close handler
        client.onClose(() => {
          if (mounted) {
            setIsLoading(false);
          }
        });

        // Connect to WebSocket
        await client.connect();

        // Subscribe to balance updates
        const subscriptionId = await client.subscribeToBalance(
          publicKey.toString(),
          (balanceInSol) => {
            if (mounted) {
              setBalance(balanceInSol);
              setIsLoading(false);
            }
          }
        );

        subscriptionIdRef.current = subscriptionId;
      } catch (err) {
        if (mounted) {
          const errorMessage = err instanceof Error ? err.message : 'Failed to subscribe to balance';
          setError(err instanceof Error ? err : new Error(errorMessage));
          setIsLoading(false);

          // Clean up client if connection failed
          if (clientRef.current) {
            clientRef.current.disconnect();
            clientRef.current = null;
          }
        }
      }
    };

    setupSubscription();

    // Cleanup function - called when user logs out, wallet disconnects, or component unmounts
    return () => {
      mounted = false;

      if (clientRef.current) {
        // Unsubscribe if we have a subscription ID
        if (subscriptionIdRef.current !== null) {
          clientRef.current.unsubscribeFromAccount(subscriptionIdRef.current);
          subscriptionIdRef.current = null;
        }

        // Disconnect the WebSocket
        clientRef.current.disconnect();
        clientRef.current = null;
      }
    };
  }, [publicKey, connected, isAuthenticated]);

  return {
    balance,
    isLoading,
    error,
  };
}
