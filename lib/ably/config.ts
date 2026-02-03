// Ably Configuration
// Real-time pub/sub channels for token feed
// Created: 2025-10-18

import type * as Ably from 'ably';

/**
 * Ably channel names
 * Centralized channel naming to prevent typos
 */
export const ABLY_CHANNELS = {
  // Legacy channels (keep for backwards compatibility)
  TOKENS_NEW: 'tokens:new',
  TOKENS_PRICE_UPDATES: 'tokens:price-updates',
  TOKENS_TRENDING: 'tokens:trending',

  // Unified updates channel
  TOKENS_UPDATES: 'tokens:updates',

  // Token creation channel
  TOKENS_NEWLY_CREATED: 'tokens:newly-created',

  // Legacy category-specific channels (deprecated)
  TOKENS_LAST_TRADED_PAGE_1: 'tokens:last-traded:page-1',
  TOKENS_TOP_GAINERS_PAGE_1: 'tokens:top-gainers:page-1',

  // System status and health
  SYSTEM_STATUS: 'system:status',
} as const;

/**
 * Event types for each channel
 */
export const ABLY_EVENTS = {
  // Legacy events
  TOKEN_CREATED: 'token-created',
  PRICE_UPDATE: 'price-update',
  BULK_PRICE_UPDATE: 'bulk-price-update',
  TRENDING_UPDATE: 'trending-update',

  // New category-specific events
  TOKEN_UPDATED: 'TOKEN_UPDATED',

  // system:status channel events
  SERVICE_ONLINE: 'service-online',
  SERVICE_OFFLINE: 'service-offline',
} as const;

/**
 * Get Ably server-side client
 * Uses API key for full permissions
 */
export async function getAblyServerClient(): Promise<Ably.Rest> {
  const apiKey = process.env.ABLY_API_KEY;

  if (!apiKey) {
    throw new Error('ABLY_API_KEY environment variable is required');
  }

  const AblyModule = await import('ably');
  return new AblyModule.Rest({ key: apiKey });
}

/**
 * Get Ably realtime client for server-side
 * Used for subscriptions and bidirectional communication
 */
export async function getAblyRealtimeClient(): Promise<Ably.Realtime> {
  const apiKey = process.env.ABLY_API_KEY;

  if (!apiKey) {
    throw new Error('ABLY_API_KEY environment variable is required');
  }

  const AblyModule = await import('ably');
  return new AblyModule.Realtime({ key: apiKey });
}

/**
 * Generate client token for frontend
 * Provides limited permissions for client-side connections
 *
 * @param clientId Optional client identifier
 * @param capability Optional custom capabilities (defaults to subscribe-only)
 */
export async function generateClientToken(
  clientId?: string,
  capability?: Ably.Types.CapabilityOp
): Promise<string> {
  const client = await getAblyServerClient();

  const tokenParams: Ably.Types.TokenParams = {
    clientId: clientId || `client-${Date.now()}`,
    // Default capability: subscribe to all token channels
    capability: capability || {
      // Legacy channels
      [ABLY_CHANNELS.TOKENS_NEW]: ['subscribe'],
      [ABLY_CHANNELS.TOKENS_PRICE_UPDATES]: ['subscribe'],
      [ABLY_CHANNELS.TOKENS_TRENDING]: ['subscribe'],
      // Unified updates channel
      [ABLY_CHANNELS.TOKENS_UPDATES]: ['subscribe'],
      // Token creation channel
      [ABLY_CHANNELS.TOKENS_NEWLY_CREATED]: ['subscribe'],
      // Legacy category-specific channels
      [ABLY_CHANNELS.TOKENS_LAST_TRADED_PAGE_1]: ['subscribe'],
      [ABLY_CHANNELS.TOKENS_TOP_GAINERS_PAGE_1]: ['subscribe'],
      // System channels
      [ABLY_CHANNELS.SYSTEM_STATUS]: ['subscribe'],
    },
    // Token valid for 1 hour
    ttl: 60 * 60 * 1000,
  };

  // createTokenRequest returns a token request object, we need the full token details
  const tokenDetails = await client.auth.requestToken(tokenParams);
  return tokenDetails.token;
}

/**
 * Configuration for Ably client
 */
export interface AblyConfig {
  apiKey?: string;
  environment?: 'production' | 'sandbox';
  logLevel?: number;
}

/**
 * Create Ably configuration from environment
 */
export function createAblyConfig(): AblyConfig {
  return {
    apiKey: process.env.ABLY_API_KEY,
    environment: process.env.NODE_ENV === 'production' ? 'production' : 'sandbox',
    logLevel: process.env.NODE_ENV === 'development' ? 4 : 1, // 4=debug, 1=errors
  };
}
