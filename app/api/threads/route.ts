import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';

// Helper function to count all comments including nested replies
function countComments(comments: any[]): number {
  if (!Array.isArray(comments)) return 0;

  return comments.reduce((total, comment) => {
    const replyCount = comment.replies ? countComments(comment.replies) : 0;
    return total + 1 + replyCount;
  }, 0);
}

// GET /api/threads - Get all threads from all tokens with token info and comment counts
// Query params:
//   - sort: 'newest' | 'featured' | 'newComments' (default: 'newest')
//   - view: 'allThreads' | 'byProject' (default: 'allThreads')
export async function GET(request: NextRequest) {
  try {
    const supabase = createServerSupabaseClient();
    const { searchParams } = new URL(request.url);
    const sort = searchParams.get('sort') || 'newest';
    const view = searchParams.get('view') || 'allThreads';

    if (view === 'byProject') {
      // For "By Project" view, return aggregated data by token
      return getThreadsByProject(supabase, sort);
    }

    // For "All Threads" view, return individual threads
    // Get all threads from the threads table
    let query = supabase
      .from('threads')
      .select(`
        *,
        author:users!threads_author_id_fkey(id, username, avatar, points, wallet_address, verified)
      `);

    // Apply sorting
    switch (sort) {
      case 'newest':
        query = query.order('created_at', { ascending: false });
        break;
      case 'featured':
        // For featured, sort by created_at for now
        query = query.order('created_at', { ascending: false });
        break;
      case 'newComments':
        // Sort by last activity
        query = query.order('updated_at', { ascending: false });
        break;
      default:
        query = query.order('created_at', { ascending: false });
    }

    const { data: threads, error: threadsError } = await query;

    if (threadsError) {
      throw threadsError;
    }

    // Get corresponding thread_pages for comments
    const threadIds = (threads || []).map((t: any) => t.id);
    const { data: threadPages } = await supabase
      .from('thread_pages')
      .select('id, thread_id')
      .in('thread_id', threadIds.length > 0 ? threadIds : ['']);

    // Create a map of thread ID to page ID
    const threadToPageMap = new Map();
    if (threadPages) {
      threadPages.forEach((threadPage: any) => {
        threadToPageMap.set(threadPage.thread_id, threadPage.id);
      });
    }

    // Fetch comment counts for all thread pages in a single query
    const pageIds = threadPages?.map((tp: any) => tp.id) || [];
    const commentCountsMap = new Map();

    if (pageIds.length > 0) {
      const { data: comments } = await supabase
        .from('comments')
        .select('page_id, replies')
        .in('page_id', pageIds)
        .is('parent_id', null); // Only get top-level comments

      if (comments) {
        // Count comments by page_id
        comments.forEach((comment: any) => {
          const pageId = comment.page_id;
          const currentCount = commentCountsMap.get(pageId) || 0;
          const nestedCount = countComments(comment.replies || []);
          commentCountsMap.set(pageId, currentCount + 1 + nestedCount);
        });
      }
    }

    // Transform threads to match the expected format with comment counts
    const allThreads = (threads || []).map((thread: any) => {
      const pageId = threadToPageMap.get(thread.id) || null;
      const commentCount = pageId ? (commentCountsMap.get(pageId) || 0) : 0;

      return {
        id: thread.id,
        title: thread.title,
        description: thread.description,
        author: thread.author,
        created_at: thread.created_at,
        slug: thread.slug,
        token_address: thread.token_address,
        pageId,
        commentCount,
        metadata: {
          image: thread.image_url,
          websiteLink: thread.website_link,
          ...thread.metadata,
        },
      };
    });

    return NextResponse.json(allThreads);
  } catch (error: any) {
    console.error('Error fetching all threads:', error);
    return NextResponse.json(
      { error: 'Failed to fetch threads', details: error.message },
      { status: 500 }
    );
  }
}

// Get threads grouped by token for "By Project" view
async function getThreadsByProject(supabase: any, sort: string) {
  try {
    // Get all threads with their token addresses
    const { data: threads, error: threadsError } = await supabase
      .from('threads')
      .select('token_address, id, created_at, updated_at')
      .order('created_at', { ascending: false });

    if (threadsError) {
      throw threadsError;
    }

    if (!threads || threads.length === 0) {
      return NextResponse.json([]);
    }

    // Group threads by token address
    const tokenGroups = new Map<string, any>();
    threads.forEach((thread: any) => {
      if (!tokenGroups.has(thread.token_address)) {
        tokenGroups.set(thread.token_address, {
          token_address: thread.token_address,
          thread_count: 0,
          last_comment_time: null,
          latest_thread_created_at: thread.created_at,
        });
      }
      const group = tokenGroups.get(thread.token_address);
      group.thread_count += 1;

      // Track latest thread creation
      if (new Date(thread.created_at) > new Date(group.latest_thread_created_at)) {
        group.latest_thread_created_at = thread.created_at;
      }
    });

    // Get token information for each unique token
    const tokenAddresses = Array.from(tokenGroups.keys());
    const { data: tokens, error: tokensError } = await supabase
      .from('tokens')
      .select(`
        address,
        name,
        symbol,
        creator_wallet,
        created_at,
        current_price,
        market_cap,
        volume_24h,
        price_change_24h,
        metadata,
        creator:users!tokens_creator_user_id_fkey(id, username, avatar, wallet_address, verified)
      `)
      .in('address', tokenAddresses);

    if (tokensError) {
      console.error('Error fetching token data:', tokensError);
    }

    // For each token, get the last comment time from all its threads
    const threadIds = threads.map((t: any) => t.id);
    const { data: threadPages } = await supabase
      .from('thread_pages')
      .select('id, thread_id')
      .in('thread_id', threadIds);

    if (threadPages && threadPages.length > 0) {
      const pageIds = threadPages.map((tp: any) => tp.id);

      // Get the most recent comment for each page
      const { data: recentComments } = await supabase
        .from('comments')
        .select('page_id, created_at')
        .in('page_id', pageIds)
        .order('created_at', { ascending: false });

      if (recentComments) {
        // Map page_id to thread_id
        const pageToThreadMap = new Map();
        threadPages.forEach((tp: any) => {
          pageToThreadMap.set(tp.id, tp.thread_id);
        });

        // Find thread_id's token_address
        const threadToTokenMap = new Map();
        threads.forEach((t: any) => {
          threadToTokenMap.set(t.id, t.token_address);
        });

        // Update last_comment_time for each token
        recentComments.forEach((comment: any) => {
          const threadId = pageToThreadMap.get(comment.page_id);
          const tokenAddress = threadToTokenMap.get(threadId);

          if (tokenAddress && tokenGroups.has(tokenAddress)) {
            const group = tokenGroups.get(tokenAddress);
            if (!group.last_comment_time ||
                new Date(comment.created_at) > new Date(group.last_comment_time)) {
              group.last_comment_time = comment.created_at;
            }
          }
        });
      }
    }

    // Combine token data with thread counts
    const tokensMap = new Map();
    if (tokens) {
      tokens.forEach((token: any) => {
        tokensMap.set(token.address, token);
      });
    }

    let result = Array.from(tokenGroups.values())
      .filter(group => group.thread_count > 0)
      .map(group => {
        const tokenData = tokensMap.get(group.token_address);
        return {
          address: group.token_address,
          thread_count: group.thread_count,
          last_comment_time: group.last_comment_time,
          // Include token data if available
          ...(tokenData || {}),
        };
      });

    // Apply sorting
    switch (sort) {
      case 'featured':
        // Sort by market cap or some featured metric
        result.sort((a, b) => (b.market_cap || 0) - (a.market_cap || 0));
        break;
      case 'latest':
      case 'newest':
        // Already sorted by thread creation
        result.sort((a, b) =>
          new Date(b.latest_thread_created_at).getTime() - new Date(a.latest_thread_created_at).getTime()
        );
        break;
      case 'newComments':
        // Sort by last comment time
        result.sort((a, b) => {
          if (!a.last_comment_time && !b.last_comment_time) return 0;
          if (!a.last_comment_time) return 1;
          if (!b.last_comment_time) return -1;
          return new Date(b.last_comment_time).getTime() - new Date(a.last_comment_time).getTime();
        });
        break;
    }

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('Error fetching threads by project:', error);
    throw error;
  }
}

