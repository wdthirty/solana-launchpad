import { NextRequest, NextResponse } from 'next/server';
import { SupabaseDB } from '@/lib/supabase-db';
import { CommentWithAuthor } from '@/lib/types';
import { getUserFromToken, createServerSupabaseClient } from '@/lib/supabase-server';
import { DEFAULT_AVATAR_URL } from '@/lib/config/app-config';

// GET /api/comments - Get comments for a page
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const pageId = searchParams.get('pageId');
    const sort = searchParams.get('sort') || 'newest'; // 'newest' or 'top'

    if (!pageId) {
      return NextResponse.json(
        { error: 'pageId parameter is required' },
        { status: 400 }
      );
    }

    // Get current user for vote information
    const { user: authUser, supabase: authenticatedSupabase } = await getUserFromToken(request);
    const currentUserId = authUser?.id;
    const supabase = authenticatedSupabase || createServerSupabaseClient();

    // Fetch ALL comments for this page in a single query (both top-level and replies)
    const { data: allComments, error: commentsError } = await supabase
      .from('comments')
      .select(`
        *,
        author:users!comments_author_id_fkey(id, username, avatar, points, wallet_address, verified)
      `)
      .eq('page_id', pageId)
      .eq('is_deleted', false)
      .order('created_at', { ascending: true });

    if (commentsError) throw commentsError;

    if (!allComments || allComments.length === 0) {
      return NextResponse.json([]);
    }

    // Get user votes for ALL comments in a single query
    let userVotesMap = new Map<string, 'up' | 'down'>();
    if (currentUserId) {
      const commentIds = allComments.map(c => c.id);
      const { data: votes, error: votesError } = await supabase
        .from('user_votes')
        .select('comment_id, vote_type')
        .eq('user_id', currentUserId)
        .in('comment_id', commentIds);

      if (!votesError && votes) {
        votes.forEach(v => userVotesMap.set(v.comment_id, v.vote_type));
      }
    }

    // Build comment tree in memory (single pass)
    const commentsById = new Map<string, CommentWithAuthor>();
    const topLevelComments: CommentWithAuthor[] = [];

    // First pass: create all comment objects with userVote
    for (const comment of allComments) {
      const commentWithReplies: CommentWithAuthor = {
        ...comment,
        replies: [],
        userVote: userVotesMap.get(comment.id) || null,
      };
      commentsById.set(comment.id, commentWithReplies);
    }

    // Second pass: build the tree structure
    for (const comment of allComments) {
      const commentObj = commentsById.get(comment.id)!;
      if (comment.parent_id) {
        const parent = commentsById.get(comment.parent_id);
        if (parent) {
          parent.replies!.push(commentObj);
        }
      } else {
        topLevelComments.push(commentObj);
      }
    }

    // Sort top-level comments based on sort parameter
    if (sort === 'top') {
      topLevelComments.sort((a, b) => {
        const scoreA = (a.upvotes || 0) - (a.downvotes || 0);
        const scoreB = (b.upvotes || 0) - (b.downvotes || 0);
        if (scoreB === scoreA) {
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        }
        return scoreB - scoreA;
      });
    } else {
      // newest first for top-level
      topLevelComments.sort((a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
    }

    return NextResponse.json(topLevelComments);
  } catch (error) {
    console.error('Error fetching comments:', error);
    return NextResponse.json(
      { error: 'Failed to fetch comments' },
      { status: 500 }
    );
  }
}

// POST /api/comments - Create a new comment
export async function POST(request: NextRequest) {
  try {
    const { content, pageId, parentId } = await request.json();

    if (!content || !pageId) {
      return NextResponse.json(
        { error: 'Content and pageId are required' },
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
    let user = await SupabaseDB.getUserById(authUser.id);
    if (!user) {
      // Get wallet address from the request headers or user metadata
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

    // Verify page exists - check both pages and thread_pages tables
    let page = await SupabaseDB.getPageById(pageId);

    // If not found in pages table, check thread_pages table
    if (!page) {
      const { data: threadPage, error: threadPageError } = await supabaseClient
        .from('thread_pages')
        .select('id, thread_id')
        .eq('id', pageId)
        .single();
      
      if (threadPage && !threadPageError) {
        // Found in thread_pages, create a minimal page object for validation
        page = {
          id: threadPage.id,
          title: 'Thread',
          description: '',
          author_id: '',
          slug: '',
          discussion_count: 0,
          last_activity: '',
          created_at: '',
          updated_at: '',
        } as any;
      }
    }

    if (!page) {
      return NextResponse.json(
        { error: 'Page not found' },
        { status: 404 }
      );
    }

    // If parentId is provided, verify parent comment exists
    if (parentId) {
      const parentComment = await SupabaseDB.getCommentById(parentId);
      if (!parentComment) {
        return NextResponse.json(
          { error: 'Parent comment not found' },
          { status: 404 }
        );
      }
    }
    const comment = await SupabaseDB.createComment({
      content,
      author_id: user.id,
      page_id: pageId,
      parent_id: parentId || null,
    }, supabaseClient);

    // Update user points for commenting
    const pointsEarned = parentId ? 3 : 5; // More points for top-level comments
    await SupabaseDB.updateUserPoints(user.id, pointsEarned, supabaseClient);

    return NextResponse.json({
      ...comment,
      pointsEarned: 0,
      userVote: null,
    }, { status: 201 });
  } catch (error) {
    console.error('❌ Error creating comment:', error);
    console.error('❌ Error details:', {
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      name: error instanceof Error ? error.name : 'Unknown',
      code: error instanceof Error && 'code' in error ? (error as Error & { code: string }).code : undefined
    });
    return NextResponse.json(
      { 
        error: 'Failed to create comment', 
        details: error instanceof Error ? error.message : 'Unknown error',
        stack: process.env.NODE_ENV === 'development' && error instanceof Error ? error.stack : undefined
      },
      { status: 500 }
    );
  }
}
