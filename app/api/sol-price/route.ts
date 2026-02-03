/**
 * GET /api/sol-price - Get cached SOL price
 *
 * Caches SOL price for 30 seconds to reduce external API calls
 */

import { NextResponse } from 'next/server';

const JUPITER_API = 'https://datapi.jup.ag';
const SOL_MINT = 'So11111111111111111111111111111111111111112';

// In-memory cache
let cachedPrice: { price: number; timestamp: number } | null = null;
const CACHE_TTL = 30 * 1000; // 30 seconds

interface PoolResponse {
  pools: Array<{
    id: string;
    baseAsset: {
      id: string;
      usdPrice: number;
    };
    quoteAsset?: {
      id: string;
      usdPrice: number;
    };
  }>;
}

async function fetchSolPrice(): Promise<number> {
  const response = await fetch(
    `${JUPITER_API}/v1/pools?assetIds=${SOL_MINT}`,
    {
      headers: { 'Accept': 'application/json' },
      next: { revalidate: 30 }, // Next.js fetch cache
    }
  );

  if (!response.ok) {
    throw new Error(`Jupiter API returned ${response.status}`);
  }

  const data = await response.json() as PoolResponse;

  for (const pool of data.pools || []) {
    if (pool.baseAsset?.id === SOL_MINT && pool.baseAsset?.usdPrice) {
      return pool.baseAsset.usdPrice;
    }
    if (pool.quoteAsset?.id === SOL_MINT && pool.quoteAsset?.usdPrice) {
      return pool.quoteAsset.usdPrice;
    }
  }

  throw new Error('SOL price not found in response');
}

export async function GET() {
  try {
    const now = Date.now();

    // Return cached price if still valid
    if (cachedPrice && (now - cachedPrice.timestamp) < CACHE_TTL) {
      return NextResponse.json({
        price: cachedPrice.price,
        cached: true,
        age: now - cachedPrice.timestamp,
      });
    }

    // Fetch fresh price
    const price = await fetchSolPrice();

    // Update cache
    cachedPrice = { price, timestamp: now };

    return NextResponse.json({
      price,
      cached: false,
    });
  } catch (error) {
    console.error('Failed to fetch SOL price:', error);

    // Return stale cache if available
    if (cachedPrice) {
      return NextResponse.json({
        price: cachedPrice.price,
        cached: true,
        stale: true,
        age: Date.now() - cachedPrice.timestamp,
      });
    }

    return NextResponse.json(
      { error: 'Failed to fetch SOL price' },
      { status: 500 }
    );
  }
}
