/**
 * Rate limiting utility using Redis sliding window
 * Used to prevent abuse of upload endpoints
 */

import { redis } from './client';

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetInSeconds: number;
}

/**
 * Check and increment rate limit for a user action
 * Uses sliding window counter pattern for accurate rate limiting
 *
 * @param userId - User ID to rate limit
 * @param action - Action being rate limited (e.g., 'upload')
 * @param limit - Maximum allowed actions per window
 * @param windowSeconds - Time window in seconds (default: 3600 = 1 hour)
 */
export async function checkRateLimit(
  userId: string,
  action: string,
  limit: number,
  windowSeconds: number = 3600
): Promise<RateLimitResult> {
  const key = `ratelimit:${action}:${userId}`;
  const now = Date.now();
  const windowStart = now - (windowSeconds * 1000);

  // Use pipeline for atomic operations
  const pipeline = redis.pipeline();

  // Remove old entries outside the window
  pipeline.zremrangebyscore(key, 0, windowStart);

  // Count current entries in window
  pipeline.zcard(key);

  // Add current request with timestamp as score
  pipeline.zadd(key, { score: now, member: `${now}-${Math.random()}` });

  // Set expiry on the key
  pipeline.expire(key, windowSeconds);

  const results = await pipeline.exec();

  // Get the count before adding current request
  const countResult = results[1] as number;
  const currentCount = typeof countResult === 'number' ? countResult : 0;

  if (currentCount >= limit) {
    // Get the oldest entry to calculate reset time
    const oldest = await redis.zrange<string[]>(key, 0, 0, { withScores: true });
    const oldestScore = oldest && oldest.length >= 2 ? Number(oldest[1]) : now;
    const resetTime = Math.ceil((oldestScore + (windowSeconds * 1000) - now) / 1000);

    return {
      allowed: false,
      remaining: 0,
      resetInSeconds: Math.max(resetTime, 1),
    };
  }

  return {
    allowed: true,
    remaining: limit - currentCount - 1,
    resetInSeconds: windowSeconds,
  };
}

/**
 * Get current rate limit status without incrementing
 */
export async function getRateLimitStatus(
  userId: string,
  action: string,
  limit: number,
  windowSeconds: number = 3600
): Promise<RateLimitResult> {
  const key = `ratelimit:${action}:${userId}`;
  const now = Date.now();
  const windowStart = now - (windowSeconds * 1000);

  // Clean up old entries and get count
  await redis.zremrangebyscore(key, 0, windowStart);
  const currentCount = await redis.zcard(key);

  return {
    allowed: currentCount < limit,
    remaining: Math.max(0, limit - currentCount),
    resetInSeconds: windowSeconds,
  };
}

// Pre-configured rate limiters
export const RATE_LIMITS = {
  // 50 uploads per hour per user
  UPLOAD: { limit: 50, windowSeconds: 3600 },
} as const;

/**
 * Check upload rate limit for a user
 */
export async function checkUploadRateLimit(userId: string): Promise<RateLimitResult> {
  return checkRateLimit(userId, 'upload', RATE_LIMITS.UPLOAD.limit, RATE_LIMITS.UPLOAD.windowSeconds);
}
