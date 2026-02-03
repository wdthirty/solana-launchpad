import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { RedisHelpers } from '@/lib/redis/client';
import type { TokenWithCreator } from '@/lib/types';

interface SearchResult {
  tokens: TokenWithCreator[];
}

/**
 * ULTRA-FAST parallel search with fuzzy matching
 * Runs exact + prefix + fuzzy searches simultaneously for max speed
 * GET /api/search?q=query
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const query = searchParams.get('q');

    if (!query || query.trim().length === 0) {
      return NextResponse.json({ tokens: [] });
    }

    const searchTerm = query.trim();

    // Limit search query length to prevent abuse
    // Allow up to 50 characters to support token addresses (44 chars) and wallet addresses
    const MAX_SEARCH_LENGTH = 50;
    if (searchTerm.length > MAX_SEARCH_LENGTH) {
      return NextResponse.json(
        {
          error: 'Search query too long',
          message: `Search queries must be ${MAX_SEARCH_LENGTH} characters or less`
        },
        { status: 400 }
      );
    }

    // Check Redis cache first
    const cached = await RedisHelpers.getCachedSearchResults(searchTerm);
    if (cached) {
      const strategy = cached._strategy || 'unknown';
      const { _strategy, ...cleanResults } = cached;
      return NextResponse.json(cleanResults, {
        headers: {
          'X-Cache': 'HIT',
          'X-Search-Strategy': strategy,
          'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=60',
        },
      });
    }

    const isWalletAddress = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(searchTerm);
    const searchLower = searchTerm.toLowerCase();

    // ==================== PARALLEL TOKEN SEARCH ====================
    const tokenSearchPromises = [];
    let searchStrategy = 'prefix-match'; // Default

    if (isWalletAddress) {
      // Wallet address search (single query)
      tokenSearchPromises.push(
        supabase
          .from('tokens')
          .select(`*, creator:users!tokens_creator_user_id_fkey(id, username, avatar, points, verified)`)
          .eq('is_active', true)
          .eq('address', searchTerm)
          .limit(20)
          .then(({ data }) => ({ strategy: 'exact-address', tokens: data || [] }))
      );
    } else {
      // Run exact + prefix + fuzzy in parallel (all at once!)
      tokenSearchPromises.push(
        // Exact match
        supabase
          .from('tokens')
          .select(`*, creator:users!tokens_creator_user_id_fkey(id, username, avatar, points, verified)`)
          .eq('is_active', true)
          .or(`name.ilike.${searchLower},symbol.ilike.${searchLower}`)
          .order('market_cap', { ascending: false, nullsFirst: false })
          .limit(20)
          .then(({ data }) => ({ strategy: 'exact-match', tokens: data || [] })),

        // Prefix match (parallel)
        supabase
          .from('tokens')
          .select(`*, creator:users!tokens_creator_user_id_fkey(id, username, avatar, points, verified)`)
          .eq('is_active', true)
          .or(`name.ilike.${searchLower}%,symbol.ilike.${searchLower}%`)
          .order('market_cap', { ascending: false, nullsFirst: false })
          .limit(20)
          .then(({ data }) => ({ strategy: 'prefix-match', tokens: data || [] })),

        // Fuzzy match (parallel) - handles typos!
        supabase
          .rpc('fuzzy_search_tokens', {
            search_term: searchTerm,
            similarity_threshold: 0.2,
            limit_count: 20
          })
          .then(({ data, error }) => {
            if (error || !data) return { strategy: 'fuzzy-match', tokens: [] };

            // Transform fuzzy results to match TokenWithCreator structure
            const tokens = data.map((token: any) => ({
              ...token,
              creator: token.creator_id ? {
                id: token.creator_id,
                username: token.creator_username,
                avatar: token.creator_avatar,
                points: token.creator_points,
              } : null,
            }));
            return { strategy: 'fuzzy-match', tokens };
          })
          .catch(() => ({ strategy: 'fuzzy-match', tokens: [] }))
      );
    }

    // Execute all token searches in parallel
    const tokenResults = await Promise.all(tokenSearchPromises);

    // Pick the best result (first non-empty)
    let finalTokens: TokenWithCreator[] = [];
    for (const result of tokenResults) {
      if (result.tokens.length > 0) {
        finalTokens = result.tokens;
        searchStrategy = result.strategy;
        break;
      }
    }

    const results: SearchResult = {
      tokens: finalTokens,
    };

    // Cache results
    const resultsWithMeta = { ...results, _strategy: searchStrategy };
    RedisHelpers.cacheSearchResults(searchTerm, resultsWithMeta).catch(() => {
      // Cache errors are non-critical, fail silently
    });

    return NextResponse.json(results, {
      headers: {
        'X-Cache': 'MISS',
        'X-Search-Strategy': searchStrategy,
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=60',
      },
    });
  } catch (error) {
    console.error('[Search] Error:', error);
    return NextResponse.json(
      {
        error: 'Failed to perform search',
        details: process.env.NODE_ENV === 'development' ? String(error) : undefined
      },
      { status: 500 }
    );
  }
}
