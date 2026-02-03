import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// GET /api/users/wallet/[walletAddress]/stats - Get user stats (followers, following, created coins)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ walletAddress: string }> }
) {
  try {
    const { walletAddress } = await params;

    // Run user lookup and tokens count in parallel (tokens don't depend on user)
    const [userResult, tokensResult] = await Promise.all([
      supabase
        .from('users')
        .select('id')
        .eq('wallet_address', walletAddress)
        .single(),
      supabase
        .from('tokens')
        .select('*', { count: 'exact', head: true })
        .eq('creator_wallet', walletAddress)
        .eq('is_active', true),
    ]);

    const { data: user, error: userError } = userResult;
    const { count: tokensCount, error: tokensError } = tokensResult;

    if (tokensError) {
      console.error('Error counting tokens:', tokensError);
    }

    // If user doesn't exist, still return stats with 0 values
    if (userError || !user) {
      return NextResponse.json({
        followers: 0,
        following: 0,
        createdCoins: tokensCount || 0,
      });
    }

    // Run followers and following counts in parallel (both depend on user.id)
    const [followersResult, followingResult] = await Promise.all([
      supabase
        .from('user_follows')
        .select('*', { count: 'exact', head: true })
        .eq('following_id', user.id),
      supabase
        .from('user_follows')
        .select('*', { count: 'exact', head: true })
        .eq('follower_id', user.id),
    ]);

    const { count: followersCount, error: followersError } = followersResult;
    const { count: followingCount, error: followingError } = followingResult;

    if (followersError) {
      console.error('Error counting followers:', followersError);
    }
    if (followingError) {
      console.error('Error counting following:', followingError);
    }

    return NextResponse.json({
      followers: followersCount || 0,
      following: followingCount || 0,
      createdCoins: tokensCount || 0,
    });
  } catch (error) {
    console.error('Error getting user stats:', error);
    return NextResponse.json(
      { error: 'Failed to get user stats' },
      { status: 500 }
    );
  }
}


