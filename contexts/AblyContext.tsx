'use client';

import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import * as Ably from 'ably';

interface AblyContextType {
  client: Ably.Realtime | null;
  isConnected: boolean;
}

const AblyContext = createContext<AblyContextType>({
  client: null,
  isConnected: false,
});

export function useAblyClient() {
  return useContext(AblyContext);
}

interface AblyProviderProps {
  children: React.ReactNode;
}

export function AblyProvider({ children }: AblyProviderProps) {
  // Use state for client so updates trigger re-renders and context consumers get the new value
  const [client, setClient] = useState<Ably.Realtime | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const inactivityTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isReconnectingRef = useRef(false);
  const wasDisconnectedRef = useRef(false);
  // Keep a ref for synchronous access in cleanup and visibility handlers
  const clientRef = useRef<Ably.Realtime | null>(null);

  useEffect(() => {
    let mounted = true;

    async function connect() {
      // If we're already connected, don't create a new client
      if (clientRef.current?.connection.state === 'connected' ||
          clientRef.current?.connection.state === 'connecting') {
        return;
      }

      // If we have a closed client, clear it first
      if (clientRef.current) {
        try {
          clientRef.current.close();
        } catch {
          // Silent cleanup error
        }
        clientRef.current = null;
      }

      try {
        isReconnectingRef.current = true;

        const ablyKey = process.env.NEXT_PUBLIC_ABLY_KEY;
        if (!ablyKey) {
          console.error('[Ably] NEXT_PUBLIC_ABLY_KEY is not configured');
          isReconnectingRef.current = false;
          return;
        }

        // Create single Ably client for entire app using subscribe-only key
        // clientId is required for presence - use a random ID (actual user info is in presence data)
        const client = new Ably.Realtime({
          key: ablyKey,
          clientId: `client_${Math.random().toString(36).substring(2, 15)}`,
          disconnectedRetryTimeout: 15000,
          suspendedRetryTimeout: 30000,
          closeOnUnload: false, // Keep connection alive during page transitions
        });

        // Handle connection state
        client.connection.on('connected', () => {
          isReconnectingRef.current = false;
          if (mounted) setIsConnected(true);
        });

        client.connection.on('disconnected', () => {
          if (mounted) setIsConnected(false);
        });

        client.connection.on('failed', (stateChange) => {
          console.error('[Ably] Connection failed:', stateChange.reason);
          isReconnectingRef.current = false;
          if (mounted) setIsConnected(false);
        });

        if (mounted) {
          clientRef.current = client;
          setClient(client);
        }
      } catch (err) {
        console.error('[Ably] Failed to create client:', err);
        isReconnectingRef.current = false;
      }
    }

    // Handle page visibility - disconnect after 10 minutes of inactivity
    function handleVisibilityChange() {
      // Clear any existing timer
      if (inactivityTimerRef.current) {
        clearTimeout(inactivityTimerRef.current);
        inactivityTimerRef.current = null;
      }

      if (document.hidden) {
        // User switched away - start 10 minute countdown
        inactivityTimerRef.current = setTimeout(() => {
          if (clientRef.current && mounted && document.hidden) {
            const connectionState = clientRef.current.connection.state;
            if (connectionState === 'connected' || connectionState === 'connecting') {
              clientRef.current.close();
              clientRef.current = null;
              setClient(null);
              setIsConnected(false);
              wasDisconnectedRef.current = true;
            }
          }
        }, 600000); // 10 minutes = 600,000ms
      } else {
        // User came back - ensure we're connected
        const needsReconnect = wasDisconnectedRef.current;

        if (clientRef.current) {
          const connectionState = clientRef.current.connection.state;
          // Reconnect if disconnected
          if (connectionState === 'closed' || connectionState === 'failed') {
            if (!isReconnectingRef.current) {
              connect();
            }
          }
        } else if (!isReconnectingRef.current) {
          // No client exists, create one
          connect();
        }

        // If we were disconnected and user is on home page, trigger a page refresh
        if (needsReconnect) {
          wasDisconnectedRef.current = false;

          // Dispatch custom event that token feed can listen to
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('ably-reconnected-after-inactivity'));
          }
        }
      }
    }

    // Initial connection
    connect();

    // Listen for page visibility changes (but don't disconnect on navigation)
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibilityChange);
    }

    // Cleanup only when component unmounts (app closes)
    return () => {
      mounted = false;

      // Clear inactivity timer
      if (inactivityTimerRef.current) {
        clearTimeout(inactivityTimerRef.current);
        inactivityTimerRef.current = null;
      }

      // Remove visibility listener
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      }

      // Close connection
      if (clientRef.current) {
        try {
          clientRef.current.close();
        } catch (err) {
          console.error('[Ably] Error closing client:', err);
        }
        clientRef.current = null;
      }
    };
  }, []);

  return (
    <AblyContext.Provider value={{ client, isConnected }}>
      {children}
    </AblyContext.Provider>
  );
}
