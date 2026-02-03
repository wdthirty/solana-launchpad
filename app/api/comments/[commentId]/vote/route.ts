import { NextRequest, NextResponse } from 'next/server';
import { SupabaseDB } from '@/lib/supabase-db';
import { getUserFromToken } from '@/lib/supabase-server';

// POST /api/comments/[commentId]/vote - Vote on a comment
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ commentId: string }> }
) {
  try {
    const { voteType } = await request.json();
    const { commentId } = await params;

    if (!voteType || !['up', 'down'].includes(voteType)) {
      return NextResponse.json(
        { error: 'voteType (up/down) is required' },
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

    // Get user profile
    const user = await SupabaseDB.getUserById(authUser.id, supabaseClient);
    if (!user) {
      return NextResponse.json(
        { error: 'User profile not found' },
        { status: 404 }
      );
    }

    // Get the comment
    const comment = await SupabaseDB.getCommentById(commentId, supabaseClient);
    if (!comment) {
      return NextResponse.json(
        { error: 'Comment not found' },
        { status: 404 }
      );
    }

    if (comment.is_deleted) {
      return NextResponse.json(
        { error: 'Cannot vote on deleted comment' },
        { status: 400 }
      );
    }

    // Check if user already voted on this comment
    const existingVote = await SupabaseDB.getUserVote(user.id, commentId, supabaseClient);

    if (existingVote) {
      // User has an existing vote - always REMOVE it (toggle off)
      // Whether they clicked the same button or opposite button, we remove the vote
      await SupabaseDB.removeVote(user.id, commentId, supabaseClient);
      await SupabaseDB.updateUserPoints(user.id, 1, supabaseClient);
    } else {
      // No existing vote - add new vote
      await SupabaseDB.voteOnComment(user.id, commentId, voteType, supabaseClient);
      await SupabaseDB.updateUserPoints(user.id, 1, supabaseClient);
    }

    // Get updated comment with author info
    const updatedComment = await SupabaseDB.getCommentById(commentId, supabaseClient);
    if (!updatedComment) {
      return NextResponse.json(
        { error: 'Comment not found after update' },
        { status: 404 }
      );
    }

    // Get user's current vote
    const currentVote = await SupabaseDB.getUserVote(user.id, commentId, supabaseClient);

    return NextResponse.json({
      ...updatedComment,
      pointsEarned: updatedComment.upvotes - updatedComment.downvotes,
      userVote: currentVote?.vote_type || null,
    });
  } catch (error) {
    console.error('Error voting on comment:', error);
    return NextResponse.json(
      { error: 'Failed to vote on comment' },
      { status: 500 }
    );
  }
}
