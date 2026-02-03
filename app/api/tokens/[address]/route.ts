// Token by Address API
// Fetches a single token by its address with layout data in a single request
// Created: 2025-11-14

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ address: string }> }
) {
  try {
    const { address } = await params;

    if (!address) {
      return NextResponse.json(
        { error: 'Token address is required' },
        { status: 400 }
      );
    }

    // Fetch token and token_layout in parallel for faster response
    const [tokenResult, tokenLayoutResult] = await Promise.all([
      supabase
        .from('tokens')
        .select(`
          *,
          creator:users!tokens_creator_user_id_fkey (
            id,
            wallet_address,
            username,
            avatar,
            points,
            verified
          )
        `)
        .eq('address', address)
        .single(),
      supabase
        .from('token_layouts')
        .select('layout')
        .eq('token_address', address)
        .single(),
    ]);

    const { data: token, error } = tokenResult;
    const { data: tokenLayout } = tokenLayoutResult;

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json(
          { error: 'Token not found' },
          { status: 404 }
        );
      }
      throw error;
    }

    // If token has page_id, fetch page layout in parallel with page slug
    let layout = tokenLayout?.layout || null;
    let pageSlug = null;

    if (token.page_id) {
      // Combine pages query to fetch both layout and slug in one request (was 3 queries, now 2)
      const [pageLayoutResult, pageResult] = await Promise.all([
        supabase
          .from('page_layouts')
          .select('layout')
          .eq('page_id', token.page_id)
          .single(),
        supabase
          .from('pages')
          .select('layout, slug')
          .eq('id', token.page_id)
          .single(),
      ]);

      // Prefer page_layouts, then pages.layout, then token_layouts
      if (!pageLayoutResult.error && pageLayoutResult.data?.layout) {
        layout = pageLayoutResult.data.layout;
      } else if (!pageResult.error && pageResult.data?.layout) {
        layout = pageResult.data.layout;
      }

      if (!pageResult.error && pageResult.data?.slug) {
        pageSlug = pageResult.data.slug;
      }
    }

    // Transform the token data to include baseAsset for chart compatibility
    const transformedToken = {
      ...token,
      layout, // Include layout in response
      pageSlug, // Include page slug in response
      baseAsset: {
        id: token.address,
        symbol: token.symbol,
        name: token.name,
        logo: token.metadata?.logo,
        decimals: token.decimals || 6,
        dev: token.creator_wallet || token.creator?.wallet_address,
        usdPrice: token.current_price,
        mcap: token.market_cap,
        fdv: token.fdv,
        liquidity: token.liquidity,
        circSupply: token.total_supply,
        totalSupply: token.total_supply,
        isVerified: false,
        launchpad: 'Pump.Fun',
        stats24h: token.stats_24h,
        stats5m: token.stats_5m,
        stats1h: token.stats_1h,
        stats6h: token.stats_6h,
        firstPool: token.created_at ? {
          createdAt: token.created_at
        } : undefined
      }
    };

    // Return with cache headers - cache for 30 seconds, stale-while-revalidate for 60 seconds
    return NextResponse.json(transformedToken, {
      headers: {
        'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60',
      },
    });
  } catch (error) {
    console.error('Error fetching token:', error);
    return NextResponse.json(
      { error: 'Failed to fetch token' },
      { status: 500 }
    );
  }
}
