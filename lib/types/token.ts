// Token-related TypeScript types for Meteora launchpad
// Created: 2025-10-17

import type { User } from './index';

// ===========================
// DATABASE TYPES
// ===========================

/**
 * Token database record
 * Corresponds to the `tokens` table in Supabase
 */
export interface Token {
  id: string;

  // Token identification
  address: string;
  name: string | null;
  symbol: string | null;
  decimals: number;
  supply: bigint | null;

  // Creator info
  creator_wallet: string;
  creator_user_id: string | null;
  page_id: string | null; // Reference to page template used

  // Market data
  current_price: number | null;
  market_cap: number | null;
  volume_24h: number | null;
  price_change_24h: number | null;
  price_change_1h: number | null;

  // Timestamps
  created_at: string;
  last_price_update: string | null;
  updated_at: string;

  // Metadata (flexible JSONB)
  metadata: TokenMetadata;

  // Status flags
  is_active: boolean;
  is_verified: boolean;

  // Grace period fields
  grace_mode_enabled: boolean;
  fee_tier_bp: number | null; // Fee tier in basis points (25, 100, 200, 300, 400, 500)
  launch_timestamp: string | null; // Exact timestamp of token launch

  // Bonding curve tracking
  bonding_curve_progress: number | null; // Bonding curve progress percentage (0-100)
  is_migrated: boolean; // Whether token has graduated from bonding curve

  // ATH (All-Time High) tracking
  ath_market_cap: number | null; // All-time high market cap in USD

  // Editor permissions
  editor_wallets: string[]; // Additional wallets that can customize this token page

  // Featured scoring (computed fields, not stored in DB)
  featured_score?: number;
  unique_traders_1h?: number;
  unique_traders_24h?: number;
  volume_1h?: number;

  // Project token fields
  token_type: 'meme' | 'project';
  category?: string;
  industry?: string;
  stage?: string;
  roadmap?: RoadmapMilestone[];
  vesting_config?: VestingConfig;
  graduation_threshold?: number;

  // Pool addresses
  pool_address?: string; // Meteora DBC pool address
  damm_v2_pool_address?: string; // DAMM v2 pool address after migration
}

/**
 * Token metadata stored in JSONB
 * Flexible structure for additional token information
 */
export interface TokenMetadata {
  // Visual
  logo?: string;
  banner?: string;

  // Description
  description?: string;
  tagline?: string;

  // Social links
  website?: string;
  twitter?: string;
  telegram?: string;
  discord?: string;

  // Tags/categories
  tags?: string[];
  category?: string;

  // On-chain metadata
  metaplex_uri?: string;

  // Additional flexible fields
  [key: string]: any;
}

/**
 * Roadmap milestone for project tokens
 */
export interface RoadmapMilestone {
  id: string;
  title: string;
  targetDate: string;
  status: 'planned' | 'in_progress' | 'completed';
  description: string;
}

/**
 * Vesting configuration for project tokens
 */
export interface VestingConfig {
  enabled: boolean;
  vestingPercentage: number;
  vestingDuration: number;
  vestingDurationUnit: 'days' | 'weeks' | 'months';
  unlockSchedule: 'daily' | 'weekly' | 'bi-weekly' | 'monthly';
  cliffEnabled: boolean;
  cliffDuration: number;
  cliffDurationUnit: 'days' | 'weeks' | 'months';
  cliffPercentage: number;
}

/**
 * Token with populated creator information
 */
export interface TokenWithCreator extends Token {
  creator: Pick<User, 'id' | 'username' | 'avatar' | 'points' | 'verified'> | null;
}

// ===========================
// REAL-TIME EVENT TYPES
// ===========================

/**
 * Event published when a new token is created
 * Published to Ably channel: tokens:new
 */
export interface TokenCreatedEvent {
  type: 'token_created';
  data: {
    address: string;
    creator: string;
    name: string | null;
    symbol: string | null;
    supply: string; // Sent as string to avoid bigint serialization issues
    decimals: number;
    timestamp: number;
    metadata: TokenMetadata;
  };
}

/**
 * Event published when token market data is updated
 * Published to Ably channel: tokens:market-cap-updates
 */
export interface MarketCapUpdateEvent {
  type: 'market_cap_update';
  data: {
    address: string;
    marketCap: number;
    price: number;
    priceChange24h: number;
    priceChange1h: number;
    volume24h: number;
    timestamp: number;
  };
}

/**
 * Union type for all token-related events
 */
export type TokenEvent = TokenCreatedEvent | MarketCapUpdateEvent;

// ===========================
// API REQUEST/RESPONSE TYPES
// ===========================

/**
 * Query parameters for GET /api/tokens
 */
export interface GetTokensParams {
  sort?: 'featured' | 'newest' | 'last_traded' | 'market_cap' | 'top_gainers' | 'price_change_24h';
  page?: number;
  limit?: number;
  cursor?: string;
  creator?: string; // Filter by creator wallet
  search?: string; // Search by name or symbol
}

/**
 * Response for GET /api/tokens
 */
export interface GetTokensResponse {
  tokens: TokenWithCreator[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    hasMore: boolean;
    nextCursor?: string;
  };
}

/**
 * Response for GET /api/tokens/[address]
 */
export interface GetTokenResponse {
  token: TokenWithCreator;
}

/**
 * Response for GET /api/tokens/trending
 */
export interface GetTrendingTokensResponse {
  tokens: TokenWithCreator[];
  timeframe: '1h' | '24h';
}

// ===========================
// BLOCKCHAIN/PARSER TYPES
// ===========================

/**
 * Parsed token creation data from Meteora transaction
 */
export interface ParsedTokenCreation {
  tokenAddress: string;
  creatorWallet: string;
  name?: string;
  symbol?: string;
  decimals: number;
  supply: bigint;
  transactionSignature: string;
  slot: number;
  timestamp: number;
  metadata?: TokenMetadata;
}

/**
 * Jupiter Data API pool response
 * From: https://datapi.jup.ag/v1/pools?assetIds=...
 */
export interface JupiterPoolData {
  address: string;
  name: string;
  verified: boolean;
  tokenMint: string;
  lpMint: string;
  liquidity: number;
  price: number;
  volume24h: number;
  fees24h: number;
  apr7d: number;
  apr30d: number;
}

/**
 * Batch price update data
 */
export interface TokenPriceUpdate {
  address: string;
  price: number;
  marketCap: number;
  volume24h: number;
  priceChange24h: number;
  priceChange1h: number;
  lastUpdated: Date;
}

// ===========================
// FRONTEND/HOOK TYPES
// ===========================

/**
 * Return type for useTokenFeed hook
 */
export interface UseTokenFeedReturn {
  tokens: TokenWithCreator[];
  loading: boolean;
  error: string | null;
  hasMore: boolean;
  loadMore: () => void;
  refresh: () => void;
  sortBy: 'newest' | 'market_cap' | 'price_change_24h';
  setSortBy: (sort: 'newest' | 'market_cap' | 'price_change_24h') => void;
}

/**
 * Return type for useTokenDetails hook
 */
export interface UseTokenDetailsReturn {
  token: TokenWithCreator | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

/**
 * Options for useTokenFeed hook
 */
export interface UseTokenFeedOptions {
  sortBy?: 'newest' | 'market_cap' | 'price_change_24h';
  limit?: number;
  creator?: string;
  autoRefresh?: boolean;
  refreshInterval?: number;
}

// ===========================
// DATABASE OPERATION TYPES
// ===========================

/**
 * Input for creating a new token in the database
 */
export interface CreateTokenInput {
  address: string;
  creator_wallet: string;
  creator_user_id?: string;
  name?: string;
  symbol?: string;
  decimals: number;
  supply: bigint;
  metadata?: TokenMetadata;
}

/**
 * Input for updating token market data
 */
export interface UpdateTokenMarketDataInput {
  address: string;
  current_price?: number;
  market_cap?: number;
  volume_24h?: number;
  price_change_24h?: number;
  price_change_1h?: number;
  last_price_update?: Date;
}

/**
 * Input for batch updating multiple tokens
 */
export interface BatchUpdateTokensInput {
  updates: UpdateTokenMarketDataInput[];
}

// ===========================
// UTILITY TYPES
// ===========================

/**
 * Token sort options
 */
export type TokenSortBy = 'newest' | 'market_cap' | 'price_change_24h';

/**
 * Token status filter
 */
export type TokenStatusFilter = 'all' | 'active' | 'inactive' | 'verified';

/**
 * Price change timeframe
 */
export type PriceChangeTimeframe = '1h' | '24h';

/**
 * Market cap tier (for categorization)
 */
export type MarketCapTier = 'micro' | 'small' | 'medium' | 'large' | 'mega';

/**
 * Helper type for token statistics
 */
export interface TokenStats {
  totalTokens: number;
  totalMarketCap: number;
  averageMarketCap: number;
  tokens24h: number;
  topGainer24h: TokenWithCreator | null;
  topLoser24h: TokenWithCreator | null;
}
