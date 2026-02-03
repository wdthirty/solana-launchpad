import { NextRequest, NextResponse } from 'next/server';
import { getUserFromToken } from '@/lib/supabase-server';
import { supabase } from '@/lib/supabase';

// POST /api/users/wallet/[walletAddress]/follow - Follow or unfollow a user
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ walletAddress: string }> }
) {
  try {
    // Get the current authenticated user from Supabase Auth
    const { user: authUser, supabase: supabaseClient } = await getUserFromToken(request);

    if (!authUser || !supabaseClient) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      );
    }

    const { walletAddress } = await params;
    const body = await request.json();
    const { action } = body; // 'follow' or 'unfollow'

    if (!action || !['follow', 'unfollow'].includes(action)) {
      return NextResponse.json(
        { error: 'Invalid action. Must be "follow" or "unfollow"' },
        { status: 400 }
      );
    }

    // Get the user being followed by wallet address
    const { data: targetUser, error: targetError } = await supabaseClient
      .from('users')
      .select('id')
      .eq('wallet_address', walletAddress)
      .single();

    if (targetError || !targetUser) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // Prevent users from following themselves
    if (targetUser.id === authUser.id) {
      return NextResponse.json(
        { error: 'Cannot follow yourself' },
        { status: 400 }
      );
    }

    if (action === 'follow') {
      // Check if already following
      const { data: existingFollow, error: checkError } = await supabaseClient
        .from('user_follows')
        .select('id')
        .eq('follower_id', authUser.id)
        .eq('following_id', targetUser.id)
        .single();

      if (checkError) {
        // Check if table doesn't exist
        if (checkError.message?.includes('relation') && checkError.message?.includes('does not exist') ||
            checkError.message?.includes('Could not find the table') ||
            checkError.message?.includes('schema cache')) {
          return NextResponse.json(
            { error: 'Follow feature not yet set up. Please run the migration to create the user_follows table.' },
            { status: 503 }
          );
        }
        // PGRST116 = no rows returned, which is fine
        if (checkError.code !== 'PGRST116') {
          throw checkError;
        }
      }

      if (existingFollow) {
        return NextResponse.json(
          { error: 'Already following this user' },
          { status: 409 }
        );
      }

      // Create follow relationship
      const { data: follow, error: followError } = await supabaseClient
        .from('user_follows')
        .insert({
          follower_id: authUser.id,
          following_id: targetUser.id,
        })
        .select()
        .single();

      if (followError) {
        // Check if table doesn't exist
        if (followError.message?.includes('relation') && followError.message?.includes('does not exist')) {
          return NextResponse.json(
            { error: 'Follow feature not yet set up. Please run the migration to create the user_follows table.' },
            { status: 503 }
          );
        }
        throw followError;
      }

      return NextResponse.json({ success: true, following: true });
    } else {
      // Unfollow
      const { data: deletedData, error: unfollowError } = await supabaseClient
        .from('user_follows')
        .delete()
        .eq('follower_id', authUser.id)
        .eq('following_id', targetUser.id)
        .select();

      if (unfollowError) {
        // Check if table doesn't exist
        if (unfollowError.message?.includes('relation') && unfollowError.message?.includes('does not exist')) {
          return NextResponse.json(
            { error: 'Follow feature not yet set up. Please run the migration to create the user_follows table.' },
            { status: 503 }
          );
        }
        console.error('[Unfollow] Error:', unfollowError);
        throw unfollowError;
      }

      return NextResponse.json({ success: true, following: false });
    }
  } catch (error: any) {
    console.error('Error following/unfollowing user:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to follow/unfollow user' },
      { status: 500 }
    );
  }
}

// GET /api/users/wallet/[walletAddress]/follow - Check if current user is following this user
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ walletAddress: string }> }
) {
  try {
    // Get the current authenticated user from Supabase Auth
    const { user: authUser, supabase: supabaseClient } = await getUserFromToken(request);

    if (!authUser || !supabaseClient) {
      return NextResponse.json({ following: false });
    }

    const { walletAddress } = await params;

    // Get the user being checked by wallet address
    const { data: targetUser, error: targetError } = await supabaseClient
      .from('users')
      .select('id')
      .eq('wallet_address', walletAddress)
      .single();

    if (targetError || !targetUser) {
      return NextResponse.json({ following: false });
    }

    // Check if following
    const { data: follow, error: followError } = await supabaseClient
      .from('user_follows')
      .select('id')
      .eq('follower_id', authUser.id)
      .eq('following_id', targetUser.id)
      .single();

    if (followError) {
      // If table doesn't exist, return false (not following)
      if (followError.message?.includes('relation') && followError.message?.includes('does not exist')) {
        return NextResponse.json({ following: false });
      }
      // PGRST116 = no rows returned, which is fine
      if (followError.code !== 'PGRST116') {
        throw followError;
      }
    }

    return NextResponse.json({ following: !!follow });
  } catch (error: any) {
    console.error('Error checking follow status:', error);
    return NextResponse.json({ following: false });
  }
}

