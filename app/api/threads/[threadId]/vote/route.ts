import { NextRequest, NextResponse } from 'next/server';
import { SupabaseDB } from '@/lib/supabase-db';
import { getUserFromToken } from '@/lib/supabase-server';
import { DEFAULT_AVATAR_URL } from '@/lib/config/app-config';

// POST /api/threads/[threadId]/vote - Vote on a thread (upvote/downvote)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ threadId: string }> }
) {
  try {
    const { voteType } = await request.json();
    const { threadId } = await params;

    if (!voteType || !['up', 'down'].includes(voteType)) {
      return NextResponse.json(
        { error: 'voteType (up/down) is required' },
        { status: 400 }
      );
    }

    if (!threadId) {
      return NextResponse.json(
        { error: 'Thread ID is required' },
        { status: 400 }
      );
    }

    // Get the current authenticated user
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

    // Get the thread
    const { data: thread, error: threadError } = await supabaseClient
      .from('threads')
      .select('id')
      .eq('id', threadId)
      .single();

    if (threadError || !thread) {
      return NextResponse.json(
        { error: 'Thread not found' },
        { status: 404 }
      );
    }

    const existingVote = await SupabaseDB.getUserThreadVote(user.id, threadId, supabaseClient);

    if (existingVote && existingVote.vote_type === voteType) {
      // User is clicking the same vote - REMOVE it (toggle off)
      await SupabaseDB.removeThreadVote(user.id, threadId, supabaseClient);
    } else if (existingVote && existingVote.vote_type !== voteType) {
      // User is switching their vote (upvote -> downvote or vice versa)
      await SupabaseDB.voteOnThread(user.id, threadId, voteType, supabaseClient);
    } else {
      // No existing vote - add new vote
      await SupabaseDB.voteOnThread(user.id, threadId, voteType, supabaseClient);
    }

    // Manually recalculate vote counts to ensure accuracy (triggers might have timing issues)
    const { data: voteCounts, error: countError } = await supabaseClient
      .from('thread_votes')
      .select('vote_type')
      .eq('thread_id', threadId);

    if (countError) {
      console.error('Error fetching vote counts:', countError);
    }

    const upvotes = voteCounts?.filter(v => v.vote_type === 'up').length || 0;
    const downvotes = voteCounts?.filter(v => v.vote_type === 'down').length || 0;

    // Update the thread with the calculated counts
    const { error: updateError } = await supabaseClient
      .from('threads')
      .update({ upvotes, downvotes })
      .eq('id', threadId);

    if (updateError) {
      console.error('Error updating thread vote counts:', updateError);
    }

    // Get user's current vote status
    const currentVote = await SupabaseDB.getUserThreadVote(user.id, threadId, supabaseClient);

    const responseData = {
      upvotes: upvotes,
      downvotes: downvotes,
      userVote: currentVote?.vote_type || null,
    };

    return NextResponse.json(responseData);
  } catch (error: any) {
    console.error('Error voting on thread:', error);
    return NextResponse.json(
      { error: 'Failed to vote on thread', details: error.message },
      { status: 500 }
    );
  }
}

