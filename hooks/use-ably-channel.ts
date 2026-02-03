// useAblyChannel Hook
// Real-time Ably channel subscription hook (using shared client)
// Updated: 2025-11-14 - Now uses singleton client from AblyContext

'use client';

import { useEffect, useState, useRef } from 'react';
import type * as Ably from 'ably';
import { useAblyClient } from '@/contexts/AblyContext';

export interface UseAblyChannelOptions {
  channelName: string;
  eventName?: string;
  onMessage?: (message: Ably.Types.Message) => void;
  enabled?: boolean;
}

export interface UseAblyChannelReturn {
  isConnected: boolean;
  isConnecting: boolean;
  error: Error | null;
  channel: Ably.Types.RealtimeChannelCallbacks | null;
}

/**
 * Hook for subscribing to Ably channels using shared singleton client
 * Multiple hooks can subscribe to different channels on the same connection
 */
export function useAblyChannel({
  channelName,
  eventName,
  onMessage,
  enabled = true,
}: UseAblyChannelOptions): UseAblyChannelReturn {
  const { client, isConnected: clientConnected } = useAblyClient();
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [channel, setChannel] = useState<Ably.Types.RealtimeChannelCallbacks | null>(null);

  const onMessageRef = useRef(onMessage);
  const channelRef = useRef<Ably.Types.RealtimeChannelCallbacks | null>(null);
  const messageHandlerRef = useRef<((message: Ably.Types.Message) => void) | null>(null);
  const mountedRef = useRef(true);

  // Keep onMessage callback up to date
  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);

  useEffect(() => {
    if (!enabled || !channelName || !client) {
      return;
    }

    mountedRef.current = true;

    try {
      setIsConnecting(true);

      // Get channel from shared client
      const ablyChannel = client.channels.get(channelName);

      // Create a unique handler for this hook instance
      const messageHandler = (message: Ably.Types.Message) => {
        if (mountedRef.current && onMessageRef.current) {
          onMessageRef.current(message);
        }
      };

      // Store the handler so we can unsubscribe this specific handler later
      messageHandlerRef.current = messageHandler;

      if (eventName) {
        ablyChannel.subscribe(eventName, messageHandler);
      } else {
        ablyChannel.subscribe(messageHandler);
      }

      channelRef.current = ablyChannel;
      setChannel(ablyChannel);
      setIsConnecting(false);
      setError(null);
    } catch (err) {
      console.error(`[Ably] Error subscribing to ${channelName}:`, err);
      setError(err as Error);
      setIsConnecting(false);
    }

    // Cleanup: unsubscribe only THIS handler, not all handlers for the event
    return () => {
      mountedRef.current = false;

      if (channelRef.current && messageHandlerRef.current) {
        try {
          // Unsubscribe the specific handler, not all handlers for this event
          // This allows multiple components to subscribe to the same channel/event
          if (eventName) {
            channelRef.current.unsubscribe(eventName, messageHandlerRef.current);
          } else {
            channelRef.current.unsubscribe(messageHandlerRef.current);
          }
        } catch (err) {
          console.error(`[Ably] Error during cleanup for ${channelName}:`, err);
        } finally {
          channelRef.current = null;
          messageHandlerRef.current = null;
        }
      }
    };
  }, [enabled, channelName, eventName, client]);

  return {
    isConnected: clientConnected,
    isConnecting,
    error,
    channel,
  };
}
