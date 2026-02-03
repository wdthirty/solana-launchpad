import { NextRequest, NextResponse } from 'next/server';
import { SupabaseDB } from '@/lib/supabase-db';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * GET /api/users/wallet/[walletAddress]/profile
 *
 * Consolidated profile endpoint that returns ALL profile data in a single request.
 * This is optimized for SSR/initial page load - fetches profile, stats, created tokens,
 * and followers in parallel.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ walletAddress: string }> }
) {
  try {
    const { walletAddress } = await params;

    // First, get the user to obtain their ID for the followers query
    const userResult = await SupabaseDB.getUserByWalletAddress(walletAddress);
    const userId = userResult?.id;

    // Fetch remaining profile data in parallel for maximum speed
    const [statsResult, tokensResult, followersResult] = await Promise.all([
      // 1. User stats (followers, following, created coins count)
      supabase.rpc('get_user_stats', { wallet_addr: walletAddress }).single(),

      // 2. Created tokens (limit 20)
      supabase
        .from('tokens')
        .select('id, address, name, symbol, market_cap, created_at, metadata')
        .eq('creator_wallet', walletAddress)
        .order('created_at', { ascending: false })
        .limit(20),

      // 3. Followers - query by user ID (following_id), not wallet address
      userId
        ? supabase
            .from('user_follows')
            .select(`
              follower:users!user_follows_follower_id_fkey (
                id, username, avatar, wallet_address
              )
            `)
            .eq('following_id', userId)
            .limit(50)
        : Promise.resolve({ data: [], error: null }),
    ]);

    // Process results
    const profile = userResult ? {
      id: userResult.id,
      username: userResult.username,
      avatar: userResult.avatar,
      points: userResult.points,
      wallet_address: userResult.wallet_address,
    } : null;

    // Stats - handle RPC errors gracefully
    const statsData = statsResult.data as { followers_count?: number; following_count?: number; created_coins_count?: number } | null;
    const stats = statsData ? {
      followers: statsData.followers_count || 0,
      following: statsData.following_count || 0,
      createdCoins: statsData.created_coins_count || 0,
    } : {
      followers: 0,
      following: 0,
      createdCoins: tokensResult.data?.length || 0,
    };

    // Tokens
    const tokens = tokensResult.data || [];

    // Followers
    const followers = (followersResult.data || [])
      .map((f: any) => f.follower)
      .filter(Boolean);

    // Set cache headers for CDN/browser caching (30s fresh, 2min stale-while-revalidate)
    const headers = new Headers();
    headers.set('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=120');

    return NextResponse.json({
      profile,
      stats,
      tokens,
      followers,
    }, { headers });
  } catch (error) {
    console.error('Error fetching profile data:', error);
    return NextResponse.json(
      { error: 'Failed to fetch profile data' },
      { status: 500 }
    );
  }
}
