/**
 * POST /api/awards
 *
 * Give an award to a comment author.
 *
 * Security:
 * - Requires JWT authentication (JWKS verified via getUserFromToken)
 * - Award type and cost validated against server-side AWARD_TYPES
 * - Client-provided pointsCost is ignored, server determines actual cost
 */

import { NextRequest, NextResponse } from 'next/server';
import { SupabaseDB } from '@/lib/supabase-db';
import { getUserFromToken } from '@/lib/supabase-server';
import { AWARD_TYPES, getAwardById } from '@/lib/awards';

export async function POST(request: NextRequest) {
  try {
    const { commentId, awardType, receiverId, receiverName } = await request.json();

    if (!commentId || !awardType) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Validate award type and get server-side cost
    const award = getAwardById(awardType);
    if (!award) {
      return NextResponse.json(
        { error: `Invalid award type: ${awardType}. Valid types: ${AWARD_TYPES.map(a => a.id).join(', ')}` },
        { status: 400 }
      );
    }

    // Use server-side cost, NOT client-provided cost
    const pointsCost = award.cost;

    // Get the current authenticated user (giver)
    const { user: authUser, supabase: supabaseClient } = await getUserFromToken(request);

    if (!authUser || !supabaseClient) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      );
    }

    // Get giver user profile
    const giver = await SupabaseDB.getUserById(authUser.id);
    if (!giver) {
      return NextResponse.json(
        { error: 'Giver user profile not found' },
        { status: 404 }
      );
    }

    // Find the comment
    const comment = await SupabaseDB.getCommentById(commentId);
    if (!comment) {
      return NextResponse.json(
        { error: 'Comment not found' },
        { status: 404 }
      );
    }

    // Prevent self-awarding
    if (comment.author_id === giver.id) {
      return NextResponse.json(
        { error: 'Cannot give award to your own comment' },
        { status: 400 }
      );
    }

    // Check if giver has enough points
    if (giver.points < pointsCost) {
      return NextResponse.json(
        { error: `Insufficient points. You have ${giver.points}, but ${award.name} costs ${pointsCost}` },
        { status: 400 }
      );
    }

    // Create award object (using discussionId for type compatibility)
    const awardRecord = {
      id: `award-${Date.now()}`,
      awardType,
      giverId: giver.id,
      giverName: giver.username,
      receiverId: receiverId || comment.author_id,
      receiverName: receiverName || comment.author.username,
      discussionId: comment.id, // Comment ID stored as discussionId for type compatibility
      timestamp: new Date().toISOString(),
      pointsCost,
    };

    // Add award to comment
    await SupabaseDB.addAwardToComment(commentId, awardRecord);

    // Update giver's points (deduct award cost)
    await SupabaseDB.updateUserPoints(giver.id, -pointsCost);

    // Update receiver's points (add some points for receiving award)
    const receiverPoints = Math.floor(pointsCost * 0.1); // Give 10% of award cost to receiver
    await SupabaseDB.updateUserPoints(comment.author_id, receiverPoints);

    return NextResponse.json(awardRecord, { status: 201 });
  } catch (error) {
    console.error('Error creating award:', error);
    return NextResponse.json(
      { error: 'Failed to create award', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
