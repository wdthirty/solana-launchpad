// POST /api/tokens/by-addresses - Fetch tokens by list of addresses (for watchlist)
// Created: 2025-01-XX

import { NextRequest, NextResponse } from 'next/server';
import { SupabaseDB } from '@/lib/supabase-db';
import type { TokenWithCreator } from '@/lib/types';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { addresses } = body as { addresses: string[] };

    if (!addresses || !Array.isArray(addresses)) {
      return NextResponse.json(
        { error: 'Invalid request: addresses array required' },
        { status: 400 }
      );
    }

    // Limit to 100 addresses max to prevent abuse
    if (addresses.length > 100) {
      return NextResponse.json(
        { error: 'Too many addresses: max 100 allowed' },
        { status: 400 }
      );
    }

    // Fetch tokens by addresses
    const tokens = await SupabaseDB.getTokensByAddresses(addresses);

    return NextResponse.json(
      { tokens },
      {
        status: 200,
        headers: {
          'Cache-Control': 'public, s-maxage=10, stale-while-revalidate=30',
        },
      }
    );
  } catch (error) {
    console.error('Error fetching tokens by addresses:', error);

    return NextResponse.json(
      {
        error: 'Failed to fetch tokens',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
