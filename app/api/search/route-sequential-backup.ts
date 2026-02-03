import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { RedisHelpers } from '@/lib/redis/client';
import type { TokenWithCreator } from '@/lib/types';

interface SearchResult {
  tokens: TokenWithCreator[];
  users: Array<{
    type: 'user';
    wallet_address: string;
    username: string;
    avatar: string;
  }>;
}

/**
 * Advanced search with cascade: exact → prefix → OR → fuzzy
 * GET /api/search?q=query
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const query = searchParams.get('q');

    if (!query || query.trim().length === 0) {
      return NextResponse.json({
        tokens: [],
        users: [],
      });
    }

    const searchTerm = query.trim();

    // Check Redis cache first
    const cached = await RedisHelpers.getCachedSearchResults(searchTerm);
    if (cached) {
      const strategy = cached._strategy || 'unknown';
      // Remove metadata before returning
      const { _strategy, ...cleanResults } = cached;
      return NextResponse.json(cleanResults, {
        headers: {
          'X-Cache': 'HIT',
          'X-Search-Strategy': strategy,
          'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=60',
        },
      });
    }

    // Check if it looks like a wallet address (Solana addresses are 32-44 chars, base58)
    const isWalletAddress = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(searchTerm);

    const results: SearchResult = {
      tokens: [],
      users: [],
    };

    let searchStrategy = 'unknown';

    // ==================== TOKEN SEARCH ====================
    try {
      if (isWalletAddress) {
        // Exact wallet address match
        const { data: tokens } = await supabase
          .from('tokens')
          .select(`*, creator:users!tokens_creator_user_id_fkey(id, username, avatar, points)`)
          .eq('is_active', true)
          .eq('address', searchTerm)
          .limit(20);

        if (tokens && tokens.length > 0) {
          results.tokens = tokens;
          searchStrategy = 'exact-address';
        }
      } else {
        const searchLower = searchTerm.toLowerCase();

        // STRATEGY 1: Exact match (case-insensitive)
        const { data: exactMatches } = await supabase
          .from('tokens')
          .select(`*, creator:users!tokens_creator_user_id_fkey(id, username, avatar, points)`)
          .eq('is_active', true)
          .or(`name.ilike.${searchLower},symbol.ilike.${searchLower}`)
          .order('market_cap', { ascending: false, nullsFirst: false })
          .limit(20);

        if (exactMatches && exactMatches.length > 0) {
          results.tokens = exactMatches;
          searchStrategy = 'exact-match';
        } else {
          // STRATEGY 2: Prefix match only (no substring matching)
          const { data: prefixMatches } = await supabase
            .from('tokens')
            .select(`*, creator:users!tokens_creator_user_id_fkey(id, username, avatar, points)`)
            .eq('is_active', true)
            .or(`name.ilike.${searchLower}%,symbol.ilike.${searchLower}%`)
            .order('market_cap', { ascending: false, nullsFirst: false })
            .limit(20);

          if (prefixMatches && prefixMatches.length > 0) {
            results.tokens = prefixMatches;
            searchStrategy = 'prefix-match';
          } else {
            // STRATEGY 3: Full-text search with OR (multi-word queries)
            const words = searchTerm.split(/\s+/);
            const searchQuery = words.length === 1
              ? `${words[0]}:*`
              : words.map(w => `${w}:*`).join(' | ');

            try {
              const { data: ftsMatches, error: ftsError } = await supabase
                .from('tokens')
                .select(`*, creator:users!tokens_creator_user_id_fkey(id, username, avatar, points)`)
                .eq('is_active', true)
                .textSearch('search_vector', searchQuery, {
                  type: 'websearch',
                  config: 'english'
                })
                .order('market_cap', { ascending: false, nullsFirst: false })
                .limit(20);

              if (!ftsError && ftsMatches && ftsMatches.length > 0) {
                results.tokens = ftsMatches;
                searchStrategy = 'fulltext-or';
              }
            } catch (ftsErr) {
              // Full-text search not available
            }

            if (results.tokens.length === 0) {
              // STRATEGY 4: Fuzzy matching for typos
              try {
                const { data: fuzzyMatches, error: fuzzyError } = await supabase
                  .rpc('fuzzy_search_tokens', {
                    search_term: searchTerm,
                    similarity_threshold: 0.3,
                    limit_count: 20
                  });

                if (!fuzzyError && fuzzyMatches && fuzzyMatches.length > 0) {
                  // Transform fuzzy results to match TokenWithCreator structure
                  results.tokens = fuzzyMatches.map((token: any) => ({
                    ...token,
                    creator: token.creator_id ? {
                      id: token.creator_id,
                      username: token.creator_username,
                      avatar: token.creator_avatar,
                      points: token.creator_points,
                    } : null,
                  }));
                  searchStrategy = 'fuzzy-match';
                }
              } catch (fuzzyErr) {
                // Fuzzy search not available
              }
            }
          }
        }
      }
    } catch (error) {
      console.error('[Search] Error searching tokens:', error);
    }

    // ==================== USER SEARCH ====================
    try {
      if (isWalletAddress) {
        // Exact wallet address match
        const { data: user } = await supabase
          .from('users')
          .select('id, username, avatar, wallet_address')
          .eq('wallet_address', searchTerm)
          .single();

        if (user && user.wallet_address) {
          results.users.push({
            type: 'user',
            wallet_address: user.wallet_address,
            username: user.username,
            avatar: user.avatar,
          });
        }
      } else {
        const searchLower = searchTerm.toLowerCase();

        // STRATEGY 1: Exact match
        const { data: exactUsers } = await supabase
          .from('users')
          .select('id, username, avatar, wallet_address')
          .ilike('username', searchLower)
          .limit(5);

        if (exactUsers && exactUsers.length > 0) {
          results.users = exactUsers
            .filter(u => u.wallet_address)
            .map(user => ({
              type: 'user' as const,
              wallet_address: user.wallet_address || '',
              username: user.username,
              avatar: user.avatar,
            }));
        } else {
          // STRATEGY 2: Prefix match
          const { data: prefixUsers } = await supabase
            .from('users')
            .select('id, username, avatar, wallet_address')
            .ilike('username', `${searchLower}%`)
            .limit(5);

          if (prefixUsers && prefixUsers.length > 0) {
            results.users = prefixUsers
              .filter(u => u.wallet_address)
              .map(user => ({
                type: 'user' as const,
                wallet_address: user.wallet_address || '',
                username: user.username,
                avatar: user.avatar,
              }));
          } else {
            // STRATEGY 3: Full-text OR
            const words = searchTerm.split(/\s+/);
            const searchQuery = words.length === 1
              ? `${words[0]}:*`
              : words.map(w => `${w}:*`).join(' | ');

            try {
              const { data: ftsUsers, error: ftsUserError } = await supabase
                .from('users')
                .select('id, username, avatar, wallet_address')
                .textSearch('search_vector', searchQuery, {
                  type: 'websearch',
                  config: 'english'
                })
                .limit(5);

              if (!ftsUserError && ftsUsers && ftsUsers.length > 0) {
                results.users = ftsUsers
                  .filter(u => u.wallet_address)
                  .map(user => ({
                    type: 'user' as const,
                    wallet_address: user.wallet_address || '',
                    username: user.username,
                    avatar: user.avatar,
                  }));
              }
            } catch (ftsErr) {
              // User full-text search not available
            }

            if (results.users.length === 0) {
              // STRATEGY 4: Fuzzy match
              try {
                const { data: fuzzyUsers, error: fuzzyError } = await supabase
                  .rpc('fuzzy_search_users', {
                    search_term: searchTerm,
                    similarity_threshold: 0.3,
                    limit_count: 5
                  });

                if (!fuzzyError && fuzzyUsers && fuzzyUsers.length > 0) {
                  results.users = fuzzyUsers.map((user: any) => ({
                    type: 'user' as const,
                    wallet_address: user.wallet_address,
                    username: user.username,
                    avatar: user.avatar,
                  }));
                }
              } catch (fuzzyErr) {
                // Fuzzy user search not available
              }
            }
          }
        }
      }
    } catch (error) {
      console.error('[Search] Error searching users:', error);
    }

    // Add strategy metadata for debugging
    const resultsWithMeta = {
      ...results,
      _strategy: searchStrategy,
    };

    // Cache results in Redis (fire-and-forget)
    RedisHelpers.cacheSearchResults(searchTerm, resultsWithMeta).catch((err) => {
      console.error('[Search] Failed to cache results:', err);
    });

    return NextResponse.json(results, {
      headers: {
        'X-Cache': 'MISS',
        'X-Search-Strategy': searchStrategy,
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=60',
      },
    });
  } catch (error) {
    console.error('[Search] Error in search:', error);
    // Return more detailed error in development
    const errorMessage = error instanceof Error ? error.message : 'Failed to perform search';
    console.error('[Search] Full error:', errorMessage);
    return NextResponse.json(
      {
        error: 'Failed to perform search',
        details: process.env.NODE_ENV === 'development' ? errorMessage : undefined
      },
      { status: 500 }
    );
  }
}
