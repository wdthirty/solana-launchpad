import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// GET /api/users/wallet/[walletAddress]/followers - Get users following this profile
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ walletAddress: string }> }
) {
  try {
    const { walletAddress } = await params;
    
    // Get user by wallet address
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq('wallet_address', walletAddress)
      .single();

    // If user doesn't exist, return empty array
    if (userError || !user) {
      return NextResponse.json([]);
    }

    // Check if followers table exists and fetch followers
    // For now, we'll check if a 'follows' or 'user_follows' table exists
    // This will work once the table is created
    try {
      const { data: followers, error: followersError } = await supabase
        .from('user_follows')
        .select(`
          follower:users!user_follows_follower_id_fkey (
            id,
            username,
            avatar,
            wallet_address,
            verified
          )
        `)
        .eq('following_id', user.id);

      if (followersError) {
        // Table might not exist yet, return empty array
        return NextResponse.json([]);
      }

      // Transform the data to flatten the nested structure
      const formattedFollowers = (followers || []).map((item: any) => ({
        id: item.follower?.id,
        username: item.follower?.username,
        avatar: item.follower?.avatar,
        wallet_address: item.follower?.wallet_address,
        verified: item.follower?.verified,
      })).filter((f: any) => f.id); // Filter out any null entries

      return NextResponse.json(formattedFollowers);
    } catch (tableError) {
      // Table doesn't exist yet, return empty array
      return NextResponse.json([]);
    }
  } catch (error) {
    console.error('Error getting followers:', error);
    return NextResponse.json(
      { error: 'Failed to get followers' },
      { status: 500 }
    );
  }
}

