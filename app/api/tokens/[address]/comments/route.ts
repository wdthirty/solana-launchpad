import { NextRequest, NextResponse } from 'next/server';
import { SupabaseDB } from '@/lib/supabase-db';
import { CommentWithAuthor } from '@/lib/types';
import { getUserFromToken, createServerSupabaseClient } from '@/lib/supabase-server';
import { DEFAULT_AVATAR_URL } from '@/lib/config/app-config';

// GET /api/tokens/[address]/comments - Get comments for a token
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ address: string }> }
) {
  try {
    const { address } = await params;
    const { searchParams } = new URL(request.url);
    const sort = searchParams.get('sort') || 'newest';
    const limit = parseInt(searchParams.get('limit') || '15', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    const slug = `token-${address}`;
    const supabaseClient = createServerSupabaseClient();

    // Check for auth header to avoid expensive getUserFromToken call when not needed
    const authHeader = request.headers.get('Authorization');
    const hasAuth = authHeader?.startsWith('Bearer ');

    // Run page lookup and auth check in parallel
    const [pageResult, authResult] = await Promise.all([
      supabaseClient
        .from('pages')
        .select('id')
        .eq('slug', slug)
        .single(),
      hasAuth ? getUserFromToken(request) : Promise.resolve({ user: null }),
    ]);

    const { data: existingPage } = pageResult;
    const currentUserId = authResult.user?.id;

    // If no page exists, return empty immediately
    if (!existingPage) {
      return NextResponse.json({ comments: [], hasMore: false, totalCount: 0 });
    }

    // Fetch top-level comments with pagination
    const { data: topLevelComments, error: topLevelError, count: totalCount } = await supabaseClient
      .from('comments')
      .select(`
        *,
        author:users!comments_author_id_fkey(id, username, avatar, points, wallet_address, verified)
      `, { count: 'exact' })
      .eq('page_id', existingPage.id)
      .eq('is_deleted', false)
      .is('parent_id', null)
      .order(sort === 'top' ? 'upvotes' : 'created_at', { ascending: sort !== 'newest' })
      .range(offset, offset + limit - 1);

    if (topLevelError) {
      console.error('Error fetching top-level comments:', topLevelError);
      throw topLevelError;
    }

    if (!topLevelComments || topLevelComments.length === 0) {
      return NextResponse.json({ comments: [], hasMore: false, totalCount: 0 });
    }

    const topLevelIds = topLevelComments.map(c => c.id);

    // Fetch all replies for this page in a single query (faster than iterative depth queries)
    // We filter to relevant ones using BFS below
    const { data: allReplies } = await supabaseClient
      .from('comments')
      .select(`
        *,
        author:users!comments_author_id_fkey(id, username, avatar, points, wallet_address, verified)
      `)
      .eq('page_id', existingPage.id)
      .eq('is_deleted', false)
      .not('parent_id', 'is', null)
      .order('created_at', { ascending: true });

    // Build reply tree efficiently using Map
    const repliesByParent = new Map<string, any[]>();
    if (allReplies) {
      for (const reply of allReplies) {
        const arr = repliesByParent.get(reply.parent_id);
        if (arr) {
          arr.push(reply);
        } else {
          repliesByParent.set(reply.parent_id, [reply]);
        }
      }
    }

    // Find relevant replies using BFS (only replies under our paginated top-level comments)
    const relevantReplies: any[] = [];
    const bfsQueue = [...topLevelIds];
    while (bfsQueue.length > 0) {
      const parentId = bfsQueue.shift()!;
      const children = repliesByParent.get(parentId);
      if (children) {
        for (const child of children) {
          relevantReplies.push(child);
          bfsQueue.push(child.id);
        }
      }
    }

    // Fetch votes only for comments we're returning (targeted query)
    const allCommentIds = [...topLevelIds, ...relevantReplies.map(r => r.id)];
    let userVotesMap = new Map<string, 'up' | 'down'>();
    if (currentUserId && allCommentIds.length > 0) {
      const { data: votesData } = await supabaseClient
        .from('user_votes')
        .select('comment_id, vote_type')
        .eq('user_id', currentUserId)
        .in('comment_id', allCommentIds);

      if (votesData) {
        for (const v of votesData) {
          userVotesMap.set(v.comment_id, v.vote_type);
        }
      }
    }

    // Build comment tree - single pass
    const commentsById = new Map<string, CommentWithAuthor>();

    // Add top-level comments
    for (const comment of topLevelComments) {
      commentsById.set(comment.id, {
        ...comment,
        replies: [],
        userVote: userVotesMap.get(comment.id) || null,
      });
    }

    // Add replies and link to parents (relevantReplies is already in BFS order)
    for (const reply of relevantReplies) {
      const replyObj: CommentWithAuthor = {
        ...reply,
        replies: [],
        userVote: userVotesMap.get(reply.id) || null,
      };
      commentsById.set(reply.id, replyObj);

      const parent = commentsById.get(reply.parent_id);
      if (parent) {
        parent.replies!.push(replyObj);
      }
    }

    // Get result (top-level comments with nested replies)
    const resultComments = topLevelIds.map(id => commentsById.get(id)!);
    const hasMore = (totalCount || 0) > offset + limit;

    return NextResponse.json({
      comments: resultComments,
      hasMore,
      totalCount: totalCount || 0,
    });
  } catch (error) {
    console.error('Error fetching token comments:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch comments',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

// POST /api/tokens/[address]/comments - Create a new comment for a token
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ address: string }> }
) {
  try {
    const { address } = await params;
    const { content, parentId } = await request.json();

    if (!content) {
      return NextResponse.json(
        { error: 'Content is required' },
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
      const walletAddress = (authUser.user_metadata?.wallet_address ||
                           authUser.user_metadata?.public_key ||
                           authUser.user_metadata?.address) as string | undefined;

      user = await SupabaseDB.createUser({
        id: authUser.id,
        username: `@${authUser.id.slice(0, 8)}`,
        avatar: DEFAULT_AVATAR_URL,
        wallet_address: walletAddress,
      }, supabaseClient);
    }

    // Get or create a page for this token
    const tokenPage = await getOrCreateTokenPage(address, supabaseClient, user.id);
    if (!tokenPage) {
      return NextResponse.json(
        { error: 'Failed to get or create token page' },
        { status: 500 }
      );
    }

    // If parentId is provided, verify parent comment exists
    if (parentId) {
      const parentComment = await SupabaseDB.getCommentById(parentId, supabaseClient);
      if (!parentComment) {
        return NextResponse.json(
          { error: 'Parent comment not found' },
          { status: 404 }
        );
      }
    }

    // Create the comment
    const comment = await SupabaseDB.createComment({
      content,
      author_id: user.id,
      page_id: tokenPage.id,
      parent_id: parentId || null,
    }, supabaseClient);

    // Update user points for commenting
    const pointsEarned = parentId ? 3 : 5;
    await SupabaseDB.updateUserPoints(user.id, pointsEarned, supabaseClient);

    return NextResponse.json({
      ...comment,
      pointsEarned: 0,
      userVote: null,
    }, { status: 201 });
  } catch (error) {
    console.error('Error creating token comment:', error);
    return NextResponse.json(
      { 
        error: 'Failed to create comment', 
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

// Helper function to get or create a page for a token
async function getOrCreateTokenPage(
  tokenAddress: string,
  supabaseClient: any,
  authorId: string
) {
  try {
    const slug = `token-${tokenAddress}`;

    // Fetch token data to prepare page info
    const { data: token } = await supabaseClient
      .from('tokens')
      .select('name, symbol, creator_user_id')
      .eq('address', tokenAddress)
      .single();

    const tokenName = token?.name || token?.symbol || 'Token';
    const pageTitle = `${tokenName} Discussion`;
    const pageDescription = `Discussion page for ${tokenName} (${tokenAddress})`;
    const pageAuthorId = token?.creator_user_id || authorId;

    // Use upsert with onConflict to handle race conditions gracefully
    // ignoreDuplicates: true means if slug exists, don't update it
    const { data: upsertedPages, error: upsertError } = await supabaseClient
      .from('pages')
      .upsert({
        title: pageTitle,
        description: pageDescription,
        author_id: pageAuthorId,
        slug: slug,
      }, {
        onConflict: 'slug',
        ignoreDuplicates: true,
      })
      .select();

    // Handle the upsert result
    if (upsertError) {
      console.error('❌ Upsert error:', upsertError.message);
      // Fallback: try to fetch existing page
      const { data: existingPage } = await supabaseClient
        .from('pages')
        .select('*')
        .eq('slug', slug)
        .single();

      return existingPage || null;
    }

    // With ignoreDuplicates, upsert returns empty array when slug exists
    // In that case, we need to fetch the existing page
    if (!upsertedPages || upsertedPages.length === 0) {
      const { data: existingPage } = await supabaseClient
        .from('pages')
        .select('*')
        .eq('slug', slug)
        .single();

      return existingPage || null;
    }

    // Successfully created or returned the page
    return upsertedPages[0];
  } catch (error) {
    console.error('Error in getOrCreateTokenPage:', error);
    return null;
  }
}

