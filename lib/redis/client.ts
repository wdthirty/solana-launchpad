/**
 * Redis client for token stats caching
 * Uses Upstash Redis for serverless compatibility
 */

import { Redis, Pipeline } from '@upstash/redis';

if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
  throw new Error('Missing Upstash Redis environment variables');
}

// Create Redis client instance
export const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

// Key prefixes for different data types
export const REDIS_KEYS = {
  // Token current stats: token:{address}
  token: (address: string) => `token:${address}`,

  // Token supply cache (rarely changes): token:{address}:supply
  supply: (address: string) => `token:${address}:supply`,

  // Token description cache (set during prepare, read during creation): token:{address}:description
  description: (address: string) => `token:${address}:description`,

  // Pool-to-token mapping (scalable lookup): pool:token:{poolAddress}
  poolToToken: (poolAddress: string) => `pool:token:${poolAddress}`,

  // Platform tokens set (for existence checks): platform:tokens
  platformTokensSet: () => 'platform:tokens',

  // Search results cache: search:{query_hash}
  searchCache: (queryHash: string) => `search:${queryHash}`,

  // Dex paid verification queue (sorted set): dex:verify:queue
  dexVerifyQueue: () => 'dex:verify:queue',

  // ATH (All-Time High) market cap: token:{address}:ath:mcap
  athMarketCap: (address: string) => `token:${address}:ath:mcap`,
} as const;

// TTL constants (in seconds)
export const REDIS_TTL = {
  TOKEN_STATS: 300, // 5 minutes - auto-expire inactive tokens
  SUPPLY: 86400,    // 24 hours - supply rarely changes
  DESCRIPTION: 600, // 10 minutes - temporary cache during token creation
  SEARCH: 300,      // 5 minutes - cache search results
} as const;

/**
 * Token stats stored in Redis
 */
export interface RedisTokenStats {
  current_price: string;
  market_cap: string;
  last_trade_time: string;
  last_trade_price: string;
  volume_24h?: string;
  trades_24h?: string;
  price_change_24h?: string;
  unique_traders_1h?: string;
  unique_traders_24h?: string;
}

/**
 * Helper functions for common Redis operations
 * All functions now support optional pipeline parameter for batching
 */
export const RedisHelpers = {
  /**
   * Get token stats from Redis
   */
  async getTokenStats(address: string): Promise<RedisTokenStats | null> {
    const stats = await redis.hgetall(REDIS_KEYS.token(address)) as RedisTokenStats | null;
    return stats && Object.keys(stats).length > 0 ? stats : null;
  },

  /**
   * Set token stats in Redis with TTL
   * @param pipeline - Optional pipeline for batching operations
   */
  setTokenStats(address: string, stats: Partial<RedisTokenStats>, pipeline?: Pipeline): void | Promise<void> {
    const key = REDIS_KEYS.token(address);
    if (pipeline) {
      pipeline.hset(key, stats);
      pipeline.expire(key, REDIS_TTL.TOKEN_STATS);
    } else {
      return (async () => {
        await redis.hset(key, stats);
        await redis.expire(key, REDIS_TTL.TOKEN_STATS);
      })();
    }
  },

  /**
   * Cache token supply (rarely changes)
   */
  async cacheSupply(address: string, supply: number): Promise<void> {
    await redis.set(REDIS_KEYS.supply(address), supply.toString(), {
      ex: REDIS_TTL.SUPPLY,
    });
  },

  /**
   * Get cached supply
   */
  async getSupply(address: string): Promise<number | null> {
    const supply = await redis.get<string>(REDIS_KEYS.supply(address));
    return supply ? parseFloat(supply) : null;
  },

  /**
   * Delete all data for a token (cleanup)
   */
  async deleteTokenData(address: string): Promise<void> {
    await redis.del(
      REDIS_KEYS.token(address),
      REDIS_KEYS.supply(address)
    );
  },

  /**
   * Cache token description during preparation (for cross-process sharing)
   */
  async cacheDescription(mintAddress: string, description: string): Promise<void> {
    await redis.set(REDIS_KEYS.description(mintAddress), description, {
      ex: REDIS_TTL.DESCRIPTION,
    });
  },

  /**
   * Get and delete cached description (one-time use)
   */
  async getAndDeleteDescription(mintAddress: string): Promise<string | null> {
    const key = REDIS_KEYS.description(mintAddress);
    const description = await redis.get<string>(key);
    if (description) {
      // Delete immediately after reading (one-time use)
      await redis.del(key);
    }
    return description;
  },

  /**
   * Store pool-to-token mapping in Redis
   * This allows O(1) lookup without loading all tokens into memory
   */
  async setPoolToToken(poolAddress: string, tokenAddress: string): Promise<void> {
    if (!poolAddress || !tokenAddress) return;
    await redis.set(REDIS_KEYS.poolToToken(poolAddress), tokenAddress);
  },

  /**
   * Get token address from pool address (O(1) lookup)
   */
  async getTokenByPool(poolAddress: string): Promise<string | null> {
    if (!poolAddress) return null;
    return await redis.get<string>(REDIS_KEYS.poolToToken(poolAddress));
  },

  /**
   * Add token to platform tokens set
   */
  async addPlatformToken(tokenAddress: string): Promise<void> {
    if (!tokenAddress) return;
    await redis.sadd(REDIS_KEYS.platformTokensSet(), tokenAddress);
  },

  /**
   * Check if token is a platform token (O(1) lookup)
   */
  async isPlatformToken(tokenAddress: string): Promise<boolean> {
    if (!tokenAddress) return false;
    const result = await redis.sismember(REDIS_KEYS.platformTokensSet(), tokenAddress);
    return result === 1;
  },

  /**
   * Get count of platform tokens
   */
  async getPlatformTokenCount(): Promise<number> {
    return await redis.scard(REDIS_KEYS.platformTokensSet());
  },

  /**
   * Add unique trader using HyperLogLog (99% accurate, 12KB vs 11MB for Sets)
   * OPTIMIZATION: Replaces SADD with PFADD for 99% storage reduction
   * @param pipeline - Optional pipeline for batching operations
   */
  addUniqueTrader(
    address: string,
    trader: string,
    window: '1h' | '24h',
    pipeline?: Pipeline
  ): void | Promise<void> {
    const key = `unique_traders_hll:${address}:${window}`;
    const ttl = window === '1h' ? 3600 : 86400;

    if (pipeline) {
      pipeline.pfadd(key, trader);
      pipeline.expire(key, ttl);
    } else {
      return (async () => {
        await redis.pfadd(key, trader);
        await redis.expire(key, ttl);
      })();
    }
  },

  /**
   * Get unique trader count using HyperLogLog
   * 99% accurate with minimal memory footprint
   */
  async getUniqueTraderCount(
    address: string,
    window: '1h' | '24h'
  ): Promise<number> {
    const key = `unique_traders_hll:${address}:${window}`;
    return await redis.pfcount(key);
  },

  /**
   * Get unique trader counts for multiple tokens in batch (optimized)
   * Uses pipeline to reduce roundtrips
   */
  async getUniqueTraderCountsBatch(
    addresses: string[],
    window: '1h' | '24h'
  ): Promise<Map<string, number>> {
    if (addresses.length === 0) return new Map();

    const pipeline = redis.pipeline();
    for (const address of addresses) {
      pipeline.pfcount(`unique_traders_hll:${address}:${window}`);
    }

    const results = await pipeline.exec();
    const counts = new Map<string, number>();

    addresses.forEach((address, index) => {
      const result = results?.[index] as { error?: any; result?: number } | null;
      if (result && !result.error && typeof result.result === 'number') {
        counts.set(address, result.result);
      } else {
        counts.set(address, 0);
      }
    });

    return counts;
  },

  /**
   * Batch load pool-to-token mappings from database to Redis
   * Use this for initial sync or periodic refresh
   */
  async syncPoolMappingsToRedis(supabase: any): Promise<{ tokens: number; dbcPools: number; dammV2Pools: number }> {
    let allTokens: any[] = [];
    let page = 0;
    const pageSize = 1000;
    let hasMore = true;

    // Paginate through all active tokens (includes migrated tokens)
    // Query: is_active = true (all active, regardless of migration state)
    // Also explicitly fetch is_migrated to log migrated pool counts
    while (hasMore) {
      const { data: tokens, error } = await supabase
        .from('tokens')
        .select('address, pool_address, damm_v2_pool_address, is_migrated')
        .eq('is_active', true)
        .range(page * pageSize, (page + 1) * pageSize - 1);

      if (error) {
        console.error('Error loading tokens for Redis sync:', error);
        break;
      }

      if (tokens && tokens.length > 0) {
        allTokens = allTokens.concat(tokens);
        hasMore = tokens.length === pageSize;
        page++;
      } else {
        hasMore = false;
      }
    }

    // Also fetch migrated tokens that might have is_active = false but have DAMM v2 pools
    // This ensures we don't miss any DAMM v2 pool mappings
    const { data: migratedTokens, error: migratedError } = await supabase
      .from('tokens')
      .select('address, pool_address, damm_v2_pool_address, is_migrated')
      .eq('is_migrated', true)
      .not('damm_v2_pool_address', 'is', null);

    if (!migratedError && migratedTokens) {
      // Add any migrated tokens not already in allTokens
      const existingAddresses = new Set(allTokens.map(t => t.address));
      for (const token of migratedTokens) {
        if (!existingAddresses.has(token.address)) {
          allTokens.push(token);
        }
      }
    }

    // Batch write to Redis using pipeline for performance
    const pipeline = redis.pipeline();
    let dbcPools = 0;
    let dammV2Pools = 0;

    for (const token of allTokens) {
      // Add to platform tokens set
      pipeline.sadd(REDIS_KEYS.platformTokensSet(), token.address);

      // Add pool mappings
      if (token.pool_address) {
        pipeline.set(REDIS_KEYS.poolToToken(token.pool_address), token.address);
        dbcPools++;
      }
      if (token.damm_v2_pool_address) {
        pipeline.set(REDIS_KEYS.poolToToken(token.damm_v2_pool_address), token.address);
        dammV2Pools++;
      }
    }

    await pipeline.exec();

    return {
      tokens: allTokens.length,
      dbcPools,
      dammV2Pools,
    };
  },

  /**
   * Cache search results in Redis
   */
  async cacheSearchResults(query: string, results: any): Promise<void> {
    const queryHash = Buffer.from(query.toLowerCase().trim()).toString('base64');
    await redis.set(REDIS_KEYS.searchCache(queryHash), JSON.stringify(results), {
      ex: REDIS_TTL.SEARCH,
    });
  },

  /**
   * Get cached search results from Redis
   */
  async getCachedSearchResults(query: string): Promise<any | null> {
    try {
      const queryHash = Buffer.from(query.toLowerCase().trim()).toString('base64');
      const cached = await redis.get(REDIS_KEYS.searchCache(queryHash));
      if (!cached) return null;

      // If cached is already an object, return it directly
      if (typeof cached === 'object') return cached;

      // If cached is a string, parse it
      return typeof cached === 'string' ? JSON.parse(cached) : cached;
    } catch (err) {
      console.error('[Redis] Error getting cached search results:', err);
      return null;
    }
  },

  /**
   * Get ATH (All-Time High) market cap from Redis
   * Returns null if no ATH has been recorded yet
   */
  async getAthMarketCap(address: string): Promise<number | null> {
    const ath = await redis.get<string>(REDIS_KEYS.athMarketCap(address));
    return ath ? parseFloat(ath) : null;
  },

  /**
   * Set ATH (All-Time High) market cap in Redis
   * No TTL - permanent storage (persisted to DB as backup)
   */
  async setAthMarketCap(address: string, marketCap: number): Promise<void> {
    await redis.set(REDIS_KEYS.athMarketCap(address), marketCap.toString());
  },

  /**
   * Update ATH market cap if current market cap is higher
   * Returns { isNewAth, athMarketCap, previousAth } for real-time notifications
   */
  async updateAthMarketCapIfHigher(
    address: string,
    currentMarketCap: number
  ): Promise<{
    isNewAth: boolean;
    athMarketCap: number;
    previousAth: number | null;
  }> {
    const previousAth = await this.getAthMarketCap(address);

    // If no previous ATH or current is higher, update
    if (previousAth === null || currentMarketCap > previousAth) {
      await this.setAthMarketCap(address, currentMarketCap);
      return {
        isNewAth: previousAth !== null, // Only true if we're breaking an existing record
        athMarketCap: currentMarketCap,
        previousAth,
      };
    }

    return {
      isNewAth: false,
      athMarketCap: previousAth,
      previousAth,
    };
  },
};
