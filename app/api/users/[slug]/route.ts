import { NextRequest, NextResponse } from 'next/server';
import { SupabaseDB } from '@/lib/supabase-db';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Check if a string looks like a Solana wallet address (base58, 32-44 chars)
function isWalletAddress(str: string): boolean {
  // Solana addresses are base58 encoded, typically 32-44 characters
  // Base58 alphabet: 123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz
  const base58Regex = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
  return base58Regex.test(str);
}

/**
 * GET /api/users/[slug]
 *
 * Consolidated profile endpoint that accepts either a username or wallet address.
 * Returns ALL profile data in a single request, optimized for SSR/initial page load.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;

    // Determine if slug is a wallet address or username
    let walletAddress: string;
    let user = null;

    if (isWalletAddress(slug)) {
      // Slug looks like a wallet address
      walletAddress = slug;
      user = await SupabaseDB.getUserByWalletAddress(walletAddress);
    } else {
      // Slug is a username - look up the user first
      user = await SupabaseDB.getUserByUsername(slug);
      if (!user?.wallet_address) {
        return NextResponse.json(
          { error: 'User not found' },
          { status: 404 }
        );
      }
      walletAddress = user.wallet_address;
    }

    // First, get the user ID for followers query (if user exists)
    // This is needed because user_follows uses user IDs, not wallet addresses
    const userId = user?.id;

    // Fetch ALL profile data in parallel for maximum speed
    const [tokensResult, followersResult, followingResult, followingCountResult, followersCountResult, rewardsResult, claimHistoryResult] = await Promise.all([
      // 1. Created tokens (fetch all, will sort with rewards data)
      supabase
        .from('tokens')
        .select('id, address, name, symbol, market_cap, created_at, metadata')
        .eq('creator_wallet', walletAddress)
        .limit(50),

      // 2. Followers - query by user ID (following_id), not wallet address
      userId
        ? supabase
            .from('user_follows')
            .select(`
              follower:users!user_follows_follower_id_fkey (
                id, username, avatar, wallet_address, verified
              )
            `)
            .eq('following_id', userId)
            .limit(50)
        : Promise.resolve({ data: [], error: null }),

      // 3. Following - users this profile follows
      userId
        ? supabase
            .from('user_follows')
            .select(`
              following:users!user_follows_following_id_fkey (
                id, username, avatar, wallet_address, verified
              )
            `)
            .eq('follower_id', userId)
            .limit(50)
        : Promise.resolve({ data: [], error: null }),

      // 4. Following count - how many users this user follows
      userId
        ? supabase
            .from('user_follows')
            .select('id', { count: 'exact', head: true })
            .eq('follower_id', userId)
        : Promise.resolve({ count: 0, error: null }),

      // 5. Followers count - how many users follow this user
      userId
        ? supabase
            .from('user_follows')
            .select('id', { count: 'exact', head: true })
            .eq('following_id', userId)
        : Promise.resolve({ count: 0, error: null }),

      // 6. Creator rewards (claimable fees) - include token_address for sorting
      supabase
        .from('creator_fees')
        .select('token_address, total_claimable_sol, dbc_fees_sol, damm_fees_sol, migration_fee_sol, migration_fee_claimable')
        .eq('creator_wallet', walletAddress),

      // 7. Claimed rewards history (for chart and total claimed)
      supabase
        .from('claimed_rewards_history')
        .select('total_claimed_sol, cumulative_earned_sol, claimed_at')
        .eq('creator_wallet', walletAddress)
        .order('claimed_at', { ascending: true }),
    ]);

    // Process results
    const profile = user ? {
      id: user.id,
      username: user.username,
      avatar: user.avatar,
      points: user.points,
      wallet_address: user.wallet_address,
      verified: user.verified,
    } : null;

    // Stats - use direct count queries
    const stats = {
      followers: followersCountResult.count || 0,
      following: followingCountResult.count || 0,
      createdCoins: tokensResult.data?.length || 0,
    };

    // Creator rewards - build lookup map by token address for sorting
    const rewardsData = rewardsResult.data || [];
    const rewardsByToken = new Map<string, number>();
    for (const reward of rewardsData) {
      if (reward.token_address) {
        rewardsByToken.set(
          reward.token_address,
          parseFloat(reward.total_claimable_sol || '0')
        );
      }
    }

    // Tokens - sort by market cap descending (client will re-sort for rewards tab)
    const rawTokens = tokensResult.data || [];
    const tokens = rawTokens
      .sort((a: any, b: any) => {
        const aMarketCap = a.market_cap || 0;
        const bMarketCap = b.market_cap || 0;
        return bMarketCap - aMarketCap;
      })
      .slice(0, 20);

    // Followers
    const followers = (followersResult.data || [])
      .map((f: any) => f.follower)
      .filter(Boolean);

    // Following (users this profile follows)
    const following = (followingResult.data || [])
      .map((f: any) => f.following)
      .filter(Boolean);

    // Don't use DB claimable value - it's often stale
    // Client fetches live on-chain data for own profile via /api/rewards/[wallet]
    const totalClaimableSol = 0;

    // Claimed history - calculate total claimed and build chart data
    const claimHistory = claimHistoryResult.data || [];
    const totalClaimedSol = claimHistory.reduce(
      (sum: number, c: any) => sum + parseFloat(c.total_claimed_sol || '0'),
      0
    );

    // Build chart data from cumulative_earned_sol (stored at each claim)
    // Fall back to calculating running total if cumulative_earned_sol is not yet populated
    let runningTotal = 0;
    const rewardsChartData = claimHistory.map((c: any) => {
      const claimAmount = parseFloat(c.total_claimed_sol || '0');
      // Use stored cumulative if available, otherwise calculate it
      if (c.cumulative_earned_sol != null) {
        runningTotal = parseFloat(c.cumulative_earned_sol);
      } else {
        runningTotal += claimAmount;
      }
      return {
        date: c.claimed_at,
        total: runningTotal,
      };
    });

    // Note: We no longer add current claimable to the chart from DB
    // The client will add it from on-chain data if needed

    const creatorRewards = {
      totalClaimableSol,
      totalClaimableUsdc: 0,
      totalClaimedSol,
      totalClaimedUsdc: 0,
      totalEarnedSol: totalClaimableSol + totalClaimedSol,
      totalEarnedUsdc: 0,
      chartData: rewardsChartData,
    };

    // No caching for profile data - users expect immediate updates after changes
    const headers = new Headers();
    headers.set('Cache-Control', 'no-store');

    return NextResponse.json({
      profile,
      stats,
      tokens,
      followers,
      following,
      creatorRewards,
      // Include wallet address in response for client-side use
      walletAddress,
    }, { headers });
  } catch (error) {
    console.error('Error fetching profile data:', error);
    return NextResponse.json(
      { error: 'Failed to fetch profile data' },
      { status: 500 }
    );
  }
}
