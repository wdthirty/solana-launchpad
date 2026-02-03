// GET /api/tokens - List tokens with pagination and sorting
// Created: 2025-10-17

import { NextRequest, NextResponse } from 'next/server';
import { SupabaseDB } from '@/lib/supabase-db';
import { getTokensSchema, validateRequest } from '@/lib/validations/token';
import type { GetTokensResponse } from '@/lib/types';

export async function GET(request: NextRequest) {
  try {
    // Parse and validate query parameters
    const searchParams = Object.fromEntries(request.nextUrl.searchParams);
    const validation = validateRequest(getTokensSchema, searchParams);

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid query parameters', details: validation.error },
        { status: 400 }
      );
    }

    const { sort, page, limit, creator, search } = validation.data;

    // Fetch tokens from database - logos are now fetched client-side for faster response
    const { tokens, total } = await SupabaseDB.getTokens({
      sort,
      page,
      limit,
      creator,
      search,
    });

    // Calculate pagination metadata
    const totalPages = Math.ceil(total / limit);
    const hasMore = page < totalPages;

    // Build response
    const response: GetTokensResponse = {
      tokens,
      pagination: {
        page,
        limit,
        total,
        hasMore,
        nextCursor: hasMore ? `${page + 1}` : undefined,
      },
    };

    // Use shorter cache for "newest" sort since real-time updates are critical
    // Other sorts (market_cap, price_change) can tolerate longer caching
    const cacheControl = sort === 'newest' && page === 1
      ? 'public, s-maxage=2, stale-while-revalidate=5'  // 2s cache for newest page 1
      : 'public, s-maxage=10, stale-while-revalidate=30'; // 10s cache for other views

    return NextResponse.json(response, {
      status: 200,
      headers: {
        'Cache-Control': cacheControl,
      },
    });
  } catch (error) {
    console.error('Error fetching tokens:', error);

    return NextResponse.json(
      {
        error: 'Failed to fetch tokens',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
