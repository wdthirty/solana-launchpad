// Featured Token Scoring - Frontend Read Functions
// Reads from Redis sorted set populated by backend service
// Key: tokens:featured:ranked

import { redis } from '../redis/client';

// Redis key for featured tokens sorted set (populated by backend)
export const FEATURED_SORTED_SET_KEY = 'tokens:featured:ranked';

/**
 * Get top featured tokens from Redis sorted set
 * Ultra-fast: Single ZRANGE operation
 *
 * @param offset - Starting position (for pagination)
 * @param limit - Number of tokens to fetch
 * @returns Array of token addresses sorted by score (highest first)
 */
export async function getTopFeaturedTokens(
  offset: number = 0,
  limit: number = 20
): Promise<string[]> {
  try {
    // ZRANGE with REV option returns highest scores first
    // This is a single Redis operation - extremely fast!
    const tokens = await redis.zrange(
      FEATURED_SORTED_SET_KEY,
      offset,
      offset + limit - 1,
      { rev: true }
    );

    return tokens;
  } catch (error) {
    console.error('[SimpleFeaturedScore] Error fetching featured tokens:', error);
    return [];
  }
}

/**
 * Get total count of featured tokens
 * Used for pagination
 */
export async function getFeaturedTokenCount(): Promise<number> {
  try {
    return await redis.zcard(FEATURED_SORTED_SET_KEY);
  } catch (error) {
    console.error('[SimpleFeaturedScore] Error getting featured count:', error);
    return 0;
  }
}

/**
 * Get score for a specific token (for debugging)
 */
export async function getTokenScore(tokenAddress: string): Promise<number | null> {
  try {
    const score = await redis.zscore(FEATURED_SORTED_SET_KEY, tokenAddress);
    return score !== null ? parseFloat(score) : null;
  } catch (error) {
    console.error(`[SimpleFeaturedScore] Error getting score for ${tokenAddress}:`, error);
    return null;
  }
}

/**
 * Get featured tokens with their scores (for debugging/monitoring)
 */
export async function getFeaturedTokensWithScores(
  offset: number = 0,
  limit: number = 20
): Promise<Array<{ address: string; score: number }>> {
  try {
    // ZRANGE with WITHSCORES and REV options
    const results = await redis.zrange(
      FEATURED_SORTED_SET_KEY,
      offset,
      offset + limit - 1,
      { rev: true, withScores: true }
    );

    // Parse results: [token1, score1, token2, score2, ...]
    const tokens: Array<{ address: string; score: number }> = [];
    for (let i = 0; i < results.length; i += 2) {
      tokens.push({
        address: results[i] as string,
        score: typeof results[i + 1] === 'number' ? results[i + 1] : parseFloat(results[i + 1] as string),
      });
    }

    return tokens;
  } catch (error) {
    console.error('[SimpleFeaturedScore] Error fetching featured tokens with scores:', error);
    return [];
  }
}
