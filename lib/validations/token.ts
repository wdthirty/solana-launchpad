// Zod validation schemas for token API endpoints
// Created: 2025-10-17

import { z } from 'zod';

/**
 * Validation schema for GET /api/tokens query parameters
 */
export const getTokensSchema = z.object({
  sort: z.enum([
    'default',         // Default feed (market_cap DESC)
    'featured',        // Featured tokens (verified, high market cap, high volume)
    'newest',          // Newly created tokens (created_at DESC)
    'last_traded',     // Last traded tokens (last_trade_time DESC)
    'market_cap',      // Highest market cap (market_cap DESC)
    'top_gainers',     // Top gainers (price_change_24h DESC)
    'price_change_24h' // Deprecated, use 'top_gainers'
  ]).optional().default('default'),
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(50), // Updated default to 50
  cursor: z.string().optional(),
  creator: z.string().optional(), // Solana wallet address
  search: z.string().min(1).max(50).optional(),
});

export type GetTokensQuery = z.infer<typeof getTokensSchema>;

/**
 * Validation schema for GET /api/tokens/[address] path parameter
 */
export const tokenAddressSchema = z.object({
  address: z.string().min(32).max(44), // Solana addresses are 32-44 chars
});

export type TokenAddressParam = z.infer<typeof tokenAddressSchema>;

/**
 * Validation schema for GET /api/tokens/trending query parameters
 */
export const getTrendingTokensSchema = z.object({
  timeframe: z.enum(['1h', '24h']).optional().default('24h'),
  limit: z.coerce.number().int().min(1).max(50).optional().default(20),
});

export type GetTrendingTokensQuery = z.infer<typeof getTrendingTokensSchema>;

/**
 * Validation schema for creating a token (service role only)
 */
export const createTokenSchema = z.object({
  address: z.string().min(32).max(44),
  creator_wallet: z.string().min(32).max(44),
  creator_user_id: z.string().uuid().optional(),
  name: z.string().min(1).max(100).optional(),
  symbol: z.string().min(1).max(20).optional(),
  decimals: z.number().int().min(0).max(18),
  supply: z.string(), // Sent as string to avoid bigint serialization issues
  metadata: z.record(z.any()).optional(),
});

export type CreateTokenBody = z.infer<typeof createTokenSchema>;

/**
 * Validation schema for updating token metadata (admin only)
 */
export const updateTokenMetadataSchema = z.object({
  metadata: z.object({
    logo: z.string().url().optional(),
    banner: z.string().url().optional(),
    description: z.string().max(1000).optional(),
    tagline: z.string().max(100).optional(),
    website: z.string().url().optional(),
    twitter: z.string().url().optional(),
    telegram: z.string().url().optional(),
    discord: z.string().url().optional(),
    tags: z.array(z.string()).max(10).optional(),
    category: z.string().max(50).optional(),
  }),
});

export type UpdateTokenMetadataBody = z.infer<typeof updateTokenMetadataSchema>;

/**
 * Helper function to validate and parse request data
 */
export function validateRequest<T>(
  schema: z.ZodSchema<T>,
  data: unknown
): { success: true; data: T } | { success: false; error: string } {
  try {
    const parsed = schema.parse(data);
    return { success: true, data: parsed };
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errorMessage = error.errors
        .map((err) => `${err.path.join('.')}: ${err.message}`)
        .join(', ');
      return { success: false, error: errorMessage };
    }
    return { success: false, error: 'Validation failed' };
  }
}
