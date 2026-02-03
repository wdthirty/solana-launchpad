// GET /api/tokens/trending - Get trending tokens (top gainers)
// Created: 2025-10-17

import { NextRequest, NextResponse } from 'next/server';
import { SupabaseDB } from '@/lib/supabase-db';
import { getTrendingTokensSchema, validateRequest } from '@/lib/validations/token';
import type { GetTrendingTokensResponse } from '@/lib/types';

export async function GET(request: NextRequest) {
  try {
    // Parse and validate query parameters
    const searchParams = Object.fromEntries(request.nextUrl.searchParams);
    const validation = validateRequest(getTrendingTokensSchema, searchParams);

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid query parameters', details: validation.error },
        { status: 400 }
      );
    }

    const { timeframe, limit } = validation.data;

    // Fetch trending tokens from database
    const tokens = await SupabaseDB.getTrendingTokens(limit, timeframe);

    // Build response
    const response: GetTrendingTokensResponse = {
      tokens,
      timeframe,
    };

    return NextResponse.json(response, {
      status: 200,
      headers: {
        'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60',
      },
    });
  } catch (error) {
    console.error('Error fetching trending tokens:', error);

    return NextResponse.json(
      {
        error: 'Failed to fetch trending tokens',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
