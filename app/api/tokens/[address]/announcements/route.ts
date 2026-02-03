import { NextRequest, NextResponse } from 'next/server';
import { SupabaseDB } from '@/lib/supabase-db';
import { getUserFromToken, createServerSupabaseClient } from '@/lib/supabase-server';
import { DEFAULT_AVATAR_URL, NATIVE_TOKEN_ADDRESS } from '@/lib/config/app-config';

// Allowed image URL domains
const ALLOWED_IMAGE_DOMAINS = [
  'cdn.launchpad.fun',
  'YOUR_SUPABASE_PROJECT_ID.supabase.co', // Supabase storage fallback
];

function isAllowedImageUrl(url: string | null | undefined): boolean {
  if (!url) return true; // Empty is allowed (optional field)
  try {
    const parsed = new URL(url);
    return ALLOWED_IMAGE_DOMAINS.includes(parsed.hostname);
  } catch {
    return false;
  }
}

// GET /api/tokens/[address]/announcements - Get announcements for a token
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ address: string }> }
) {
  try {
    const { address } = await params;
    const { searchParams } = new URL(request.url);
    const creatorWallet = searchParams.get('creatorWallet');
    const supabase = createServerSupabaseClient();

    // Get authenticated user for tracking user votes
    const { user: authUser, supabase: authenticatedSupabase } = await getUserFromToken(request);
    const client = authenticatedSupabase || supabase;

    // Try to use the RPC function for pre-sorted results
    const { data: rpcData, error: rpcError } = await client.rpc('get_featured_announcements', {
      token_addr: address,
      creator_wallet: creatorWallet || null
    });

    if (!rpcError && rpcData) {
      // Get user votes if authenticated
      let userVotesMap = new Map<string, 'up' | 'down'>();
      if (authUser && rpcData.length > 0) {
        const threadIds = rpcData.map((row: any) => row.id);
        const { data: userVotes } = await client
          .from('thread_votes')
          .select('thread_id, vote_type')
          .eq('user_id', authUser.id)
          .in('thread_id', threadIds);

        if (userVotes) {
          userVotes.forEach((vote: any) => {
            userVotesMap.set(vote.thread_id, vote.vote_type);
          });
        }
      }

      // Transform RPC results to match expected format
      const announcements = rpcData.map((row: any) => ({
        id: row.id,
        title: row.title,
        description: row.description,
        author: {
          id: row.author_id,
          username: row.author_username,
          avatar: row.author_avatar,
          points: row.author_points,
          wallet_address: row.author_wallet_address,
        },
        created_at: row.created_at,
        slug: row.slug,
        pageId: row.page_id,
        commentCount: Number(row.comment_count) || 0,
        upvotes: Number(row.upvotes) || 0,
        downvotes: Number(row.downvotes) || 0,
        userVote: userVotesMap.get(row.id) || null,
        metadata: {
          image: row.image_url,
          websiteLink: row.website_link,
          ...(row.metadata || {}),
        },
      }));

      return NextResponse.json(announcements);
    }

    // Fallback to manual query if RPC function doesn't exist yet

    // Get threads from the threads table
    const { data: threads, error: threadsError } = await supabase
      .from('threads')
      .select(`
        *,
        author:users!threads_author_id_fkey(id, username, avatar, points, wallet_address, verified)
      `)
      .eq('token_address', address)
      .order('created_at', { ascending: false });

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
    const pageIds: string[] = [];
    if (threadPages) {
      threadPages.forEach((threadPage: any) => {
        threadToPageMap.set(threadPage.thread_id, threadPage.id);
        pageIds.push(threadPage.id);
      });
    }

    // Get comment counts for each page
    const commentCountsMap = new Map<string, number>();
    if (pageIds.length > 0) {
      const { data: comments } = await supabase
        .from('comments')
        .select('page_id')
        .in('page_id', pageIds);

      if (comments) {
        comments.forEach((comment: any) => {
          const pageId = comment.page_id;
          const currentCount = commentCountsMap.get(pageId) || 0;
          commentCountsMap.set(pageId, currentCount + 1);
        });
      }
    }

    // Get all votes for these threads to calculate accurate counts
    let voteCountsMap = new Map<string, { upvotes: number; downvotes: number }>();
    let userVotesMap = new Map<string, 'up' | 'down'>();

    if (threadIds.length > 0) {
      // Get all votes for these threads
      const { data: allVotes, error: votesError } = await client
        .from('thread_votes')
        .select('thread_id, vote_type, user_id')
        .in('thread_id', threadIds);

      if (!votesError && allVotes) {
        // Calculate vote counts per thread
        allVotes.forEach((vote: any) => {
          const threadId = vote.thread_id;
          const current = voteCountsMap.get(threadId) || { upvotes: 0, downvotes: 0 };

          if (vote.vote_type === 'up') {
            current.upvotes += 1;
          } else if (vote.vote_type === 'down') {
            current.downvotes += 1;
          }

          voteCountsMap.set(threadId, current);

          // Track user's votes if authenticated
          if (authUser && vote.user_id === authUser.id) {
            userVotesMap.set(threadId, vote.vote_type);
          }
        });
      }
    }

    // Transform threads to match the expected announcement format
    const announcements = (threads || []).map((thread: any) => {
      const voteCounts = voteCountsMap.get(thread.id) || { upvotes: 0, downvotes: 0 };
      const pageId = threadToPageMap.get(thread.id) || null;
      const commentCount = pageId ? (commentCountsMap.get(pageId) || 0) : 0;

      return {
        id: thread.id,
        title: thread.title,
        description: thread.description,
        author: thread.author,
        created_at: thread.created_at,
        slug: thread.slug,
        pageId,
        commentCount,
        upvotes: voteCounts.upvotes,
        downvotes: voteCounts.downvotes,
        userVote: userVotesMap.get(thread.id) || null,
        metadata: {
          image: thread.image_url,
          websiteLink: thread.website_link,
          ...thread.metadata,
        },
      };
    });

    // Sort by featured score: 60% upvotes, 40% comments (normalized)
    // But prioritize dev posts from the last 30 days as the first result
    const maxVotes = Math.max(...announcements.map(a => (a.upvotes || 0) - (a.downvotes || 0)), 1);
    const maxComments = Math.max(...announcements.map(a => a.commentCount || 0), 1);
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    announcements.sort((a, b) => {
      // Check if either post is from the dev within the last 30 days
      const aIsRecentDevPost = creatorWallet &&
        a.author?.wallet_address?.toLowerCase() === creatorWallet.toLowerCase() &&
        new Date(a.created_at) >= thirtyDaysAgo;
      const bIsRecentDevPost = creatorWallet &&
        b.author?.wallet_address?.toLowerCase() === creatorWallet.toLowerCase() &&
        new Date(b.created_at) >= thirtyDaysAgo;

      // Prioritize recent dev posts (most recent dev post first)
      if (aIsRecentDevPost && !bIsRecentDevPost) return -1;
      if (!aIsRecentDevPost && bIsRecentDevPost) return 1;
      if (aIsRecentDevPost && bIsRecentDevPost) {
        // Both are recent dev posts, sort by most recent
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }

      // Otherwise, sort by featured score
      const aVoteScore = ((a.upvotes || 0) - (a.downvotes || 0)) / maxVotes;
      const aCommentScore = (a.commentCount || 0) / maxComments;
      const aFeaturedScore = (aVoteScore * 0.6) + (aCommentScore * 0.4);

      const bVoteScore = ((b.upvotes || 0) - (b.downvotes || 0)) / maxVotes;
      const bCommentScore = (b.commentCount || 0) / maxComments;
      const bFeaturedScore = (bVoteScore * 0.6) + (bCommentScore * 0.4);

      return bFeaturedScore - aFeaturedScore;
    });

    return NextResponse.json(announcements);
  } catch (error: any) {
    console.error('Error fetching announcements:', error);
    return NextResponse.json(
      { error: 'Failed to fetch announcements', details: error.message },
      { status: 500 }
    );
  }
}

// POST /api/tokens/[address]/announcements - Create a new announcement for a token
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ address: string }> }
) {
  try {
    const { address } = await params;

    // Block posting to Native token communities
    if (address === NATIVE_TOKEN_ADDRESS) {
      return NextResponse.json(
        { error: 'Posting is not allowed for this community' },
        { status: 403 }
      );
    }

    const { title, description, image, websiteLink } = await request.json();

    if (!title || !description) {
      return NextResponse.json(
        { error: 'Title and description are required' },
        { status: 400 }
      );
    }

    // Validate image URL if provided - must be from our CDN
    if (image && !isAllowedImageUrl(image)) {
      return NextResponse.json(
        { error: 'Image must be uploaded through the platform. External URLs are not allowed.' },
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

    // Create announcement thread with unique slug
    const announcementId = crypto.randomUUID().slice(0, 8);
    const slug = `token-${address}-announcement-${announcementId}`;

    // Store additional metadata in JSONB field
    const metadata: any = {};

    // Insert into threads table
    const { data: thread, error: insertError } = await supabaseClient
      .from('threads')
      .insert({
        token_address: address,
        title: title.trim(),
        description: description.trim(),
        author_id: user.id,
        slug: slug,
        image_url: image || null,
        website_link: websiteLink || null,
        metadata: Object.keys(metadata).length > 0 ? metadata : {},
      })
      .select(`
        *,
        author:users!threads_author_id_fkey(id, username, avatar, points, wallet_address, verified)
      `)
      .single();

    if (insertError) {
      console.error('Error inserting thread:', insertError);
      throw insertError;
    }

    // Create a corresponding thread_page for comments to work
    // Comments are linked to pages via pageId, so we need a thread_page for each thread
    const { data: threadPage, error: threadPageError } = await supabaseClient
      .from('thread_pages')
      .insert({
        thread_id: thread.id,
      })
      .select()
      .single();

    if (threadPageError) {
      console.error('Error creating thread_page for thread:', threadPageError);
      // Don't fail the request, but log the error
    }

    // Transform to match expected announcement format
    const announcement = {
      id: thread.id,
      title: thread.title,
      description: thread.description,
      author: thread.author,
      created_at: thread.created_at,
      slug: thread.slug,
      pageId: threadPage?.id || null, // Include page ID for comments
      upvotes: thread.upvotes || 0,
      downvotes: thread.downvotes || 0,
      userVote: null, // New threads have no votes
      metadata: {
        image: thread.image_url,
        websiteLink: thread.website_link,
        ...thread.metadata,
      },
    };

    return NextResponse.json(announcement);
  } catch (error: any) {
    console.error('Error creating announcement:', error);
    return NextResponse.json(
      { error: 'Failed to create announcement', details: error.message },
      { status: 500 }
    );
  }
}

