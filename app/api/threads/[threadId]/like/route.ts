import { NextRequest, NextResponse } from 'next/server';
import { getUserFromToken } from '@/lib/supabase-server';
import { SupabaseDB } from '@/lib/supabase-db';
import { DEFAULT_AVATAR_URL } from '@/lib/config/app-config';

// POST /api/threads/[threadId]/like - Like or unlike a thread
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ threadId: string }> }
) {
  try {
    const { threadId } = await params;

    if (!threadId) {
      return NextResponse.json(
        { error: 'Thread ID is required' },
        { status: 400 }
      );
    }

    const { user: authUser, supabase: supabaseClient } = await getUserFromToken(request);
    
    if (!authUser || !supabaseClient) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      );
    }

    // Get or create user profile
    let user = await SupabaseDB.getUserById(authUser.id, supabaseClient);
    if (!user) {
      const walletAddress = authUser.user_metadata?.wallet_address || 
                           authUser.user_metadata?.public_key ||
                           authUser.user_metadata?.address;
      
      user = await SupabaseDB.createUser({
        id: authUser.id,
        username: `@${authUser.id.slice(0, 8)}`,
        avatar: DEFAULT_AVATAR_URL,
        wallet_address: walletAddress,
      }, supabaseClient);
    }

    // Check if user already liked this thread
    const existingLike = await SupabaseDB.getUserThreadLike(user.id, threadId, supabaseClient);

    if (existingLike) {
      // User already liked - remove like (toggle off)
      await SupabaseDB.unlikeThread(user.id, threadId, supabaseClient);
    } else {
      // User hasn't liked - add like
      await SupabaseDB.likeThread(user.id, threadId, supabaseClient);
    }

    // Get updated thread with like count
    const { data: thread, error: threadError } = await supabaseClient
      .from('threads')
      .select('like_count')
      .eq('id', threadId)
      .single();

    if (threadError) {
      throw threadError;
    }

    // Check user's current like status
    const currentLike = await SupabaseDB.getUserThreadLike(user.id, threadId, supabaseClient);

    return NextResponse.json({
      like_count: thread.like_count || 0,
      is_liked: !!currentLike,
    });
  } catch (error: any) {
    console.error('Error liking thread:', error);
    return NextResponse.json(
      { error: 'Failed to like thread', details: error.message },
      { status: 500 }
    );
  }
}

