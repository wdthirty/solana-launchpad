import { Suspense } from 'react';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { ThreadDetailClient } from './thread-detail-client';
import { Card } from '@/components/ui/card';

export const dynamic = 'force-dynamic';

interface Announcement {
  id: string;
  title: string;
  description: string;
  author: {
    id: string;
    username: string;
    avatar: string;
    points: number;
    wallet_address?: string | null;
  };
  created_at: string;
  slug: string;
  pageId?: string | null;
  commentCount: number;
  upvotes?: number;
  downvotes?: number;
  metadata?: {
    image?: string;
    websiteLink?: string;
  } | null;
}

async function getTokenData(tokenAddress: string) {
  const supabase = createServerSupabaseClient();

  const { data: token } = await supabase
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
      bonding_curve_progress,
      is_migrated,
      updated_at,
      creator:users!tokens_creator_user_id_fkey(id, username, avatar, wallet_address)
    `)
    .eq('address', tokenAddress)
    .single();

  if (!token) return null;

  // Transform creator from array to single object (Supabase returns array for joins)
  return {
    ...token,
    creator: Array.isArray(token.creator) ? token.creator[0] || null : token.creator,
  };
}

async function getAnnouncements(tokenAddress: string): Promise<Announcement[]> {
  const supabase = createServerSupabaseClient();

  // Try to use the RPC function for pre-sorted results
  const { data: rpcData, error: rpcError } = await supabase.rpc('get_featured_announcements', {
    token_addr: tokenAddress
  });

  if (!rpcError && rpcData) {
    // Transform RPC results to match expected format
    return rpcData.map((row: any) => ({
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
      metadata: {
        image: row.image_url,
        websiteLink: row.website_link,
        ...(row.metadata || {}),
      },
    }));
  }

  // Fallback to manual query if RPC function doesn't exist yet

  // Fetch threads for this token
  const { data: threads, error } = await supabase
    .from('threads')
    .select(`
      *,
      author:users!threads_author_id_fkey(id, username, avatar, points, wallet_address)
    `)
    .eq('token_address', tokenAddress)
    .order('created_at', { ascending: false });

  if (error || !threads) {
    return [];
  }

  // Get thread pages for comments
  const threadIds = threads.map((t: any) => t.id);
  const { data: threadPages } = await supabase
    .from('thread_pages')
    .select('id, thread_id')
    .in('thread_id', threadIds.length > 0 ? threadIds : ['']);

  const threadToPageMap = new Map();
  const pageIds: string[] = [];
  if (threadPages) {
    threadPages.forEach((tp: any) => {
      threadToPageMap.set(tp.thread_id, tp.id);
      pageIds.push(tp.id);
    });
  }

  // Batch fetch comment counts
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

  // Fetch vote counts from thread_votes table for accurate counts
  const voteCountsMap = new Map<string, { upvotes: number; downvotes: number }>();
  if (threadIds.length > 0) {
    const { data: allVotes } = await supabase
      .from('thread_votes')
      .select('thread_id, vote_type')
      .in('thread_id', threadIds);

    if (allVotes) {
      allVotes.forEach((vote: any) => {
        const threadId = vote.thread_id;
        const current = voteCountsMap.get(threadId) || { upvotes: 0, downvotes: 0 };
        if (vote.vote_type === 'up') {
          current.upvotes += 1;
        } else if (vote.vote_type === 'down') {
          current.downvotes += 1;
        }
        voteCountsMap.set(threadId, current);
      });
    }
  }

  const announcements = threads.map((thread: any) => {
    const pageId = threadToPageMap.get(thread.id) || null;
    const commentCount = pageId ? (commentCountsMap.get(pageId) || 0) : 0;
    const voteCounts = voteCountsMap.get(thread.id) || { upvotes: 0, downvotes: 0 };

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
      metadata: {
        image: thread.image_url,
        websiteLink: thread.website_link,
        ...thread.metadata,
      },
    };
  });

  // Sort by featured score: 60% upvotes, 40% comments (normalized)
  const maxVotes = Math.max(...announcements.map(a => (a.upvotes || 0) - (a.downvotes || 0)), 1);
  const maxComments = Math.max(...announcements.map(a => a.commentCount || 0), 1);

  return announcements.sort((a, b) => {
    const aVoteScore = ((a.upvotes || 0) - (a.downvotes || 0)) / maxVotes;
    const aCommentScore = (a.commentCount || 0) / maxComments;
    const aFeaturedScore = (aVoteScore * 0.6) + (aCommentScore * 0.4);

    const bVoteScore = ((b.upvotes || 0) - (b.downvotes || 0)) / maxVotes;
    const bCommentScore = (b.commentCount || 0) / maxComments;
    const bFeaturedScore = (bVoteScore * 0.6) + (bCommentScore * 0.4);

    return bFeaturedScore - aFeaturedScore;
  });
}

// Loading skeleton
function ThreadDetailSkeleton() {
  return (
    <div className="min-h-screen">
      <div className="flex-1 p-4 md:p-6 lg:p-8 overflow-auto">
        <div className="max-w-5xl mx-auto">
          {/* Token card skeleton - matches TokenCard component */}
          <div className="mb-6 animate-pulse">
            <div className="relative flex gap-3 items-start min-w-0 overflow-hidden">
              {/* Token Logo - 24x24 sm:32x32 */}
              <div className="w-24 h-24 sm:w-32 sm:h-32 bg-muted rounded-lg flex-shrink-0" />
              {/* Token Info */}
              <div className="flex-1 min-w-0">
                {/* Token Name */}
                <div className="h-5 w-40 bg-muted rounded mb-1" />
                {/* Ticker */}
                <div className="h-3 w-16 bg-muted rounded mb-2" />
                {/* Creator Info */}
                <div className="flex items-center gap-1.5 mb-2">
                  <div className="w-4 h-4 bg-muted rounded-full" />
                  <div className="h-3 w-20 bg-muted rounded" />
                  <div className="h-3 w-14 bg-muted rounded" />
                </div>
                {/* Market Cap, Progress Bar, Price Change */}
                <div className="flex items-center gap-2 mb-2">
                  <div className="h-4 w-16 bg-muted rounded" />
                  <div className="flex-1 min-w-[60px] max-w-[100px] h-2.5 bg-muted rounded-md" />
                  <div className="h-5 w-16 bg-muted rounded" />
                </div>
                {/* Description */}
                <div className="h-3 w-full bg-muted rounded mb-1" />
                <div className="h-3 w-3/4 bg-muted rounded" />
              </div>
            </div>
          </div>

          {/* Filter buttons skeleton - matches Featured, New, Dev */}
          <div className="flex items-center gap-1.5 mb-6 flex-wrap">
            <div className="h-8 w-20 bg-muted rounded animate-pulse" />
            <div className="h-8 w-12 bg-muted rounded animate-pulse" />
            <div className="h-8 w-12 bg-muted rounded animate-pulse" />
          </div>

          {/* Post cards skeleton - matches Card layout with voting section */}
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="border-border/50 animate-pulse overflow-hidden">
                <div className="flex">
                  {/* Voting Section - Left Side */}
                  <div className="flex flex-col items-center gap-1 px-4 py-4 flex-shrink-0">
                    <div className="h-8 w-8 bg-muted rounded" />
                    <div className="h-5 w-8 bg-muted rounded" />
                    <div className="h-8 w-8 bg-muted rounded" />
                  </div>
                  {/* Content Section - Right Side */}
                  <div className="flex-1 min-w-0 py-4 pr-4">
                    {/* Title and Dev badge */}
                    <div className="flex items-center gap-2 mb-2">
                      <div className="h-6 w-48 bg-muted rounded" />
                      {i === 1 && <div className="h-5 w-10 bg-muted rounded" />}
                    </div>
                    {/* Time and comment count */}
                    <div className="flex items-center gap-3 mb-4">
                      <div className="h-4 w-16 bg-muted rounded" />
                      <div className="flex items-center gap-1">
                        <div className="h-4 w-4 bg-muted rounded" />
                        <div className="h-4 w-20 bg-muted rounded" />
                      </div>
                    </div>
                    {/* Optional image placeholder (show on first card) */}
                    {i === 1 && (
                      <div className="h-48 w-64 bg-muted rounded-lg mb-4" />
                    )}
                    {/* Description lines */}
                    <div className="space-y-2">
                      <div className="h-4 w-full bg-muted rounded" />
                      <div className="h-4 w-full bg-muted rounded" />
                      <div className="h-4 w-2/3 bg-muted rounded" />
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

interface PageProps {
  params: Promise<{ slug: string }>;
}

export default async function ThreadDetailPage({ params }: PageProps) {
  const { slug: tokenAddress } = await params;

  // Fetch token and announcements in parallel
  const [token, announcements] = await Promise.all([
    getTokenData(tokenAddress),
    getAnnouncements(tokenAddress),
  ]);

  return (
    <Suspense fallback={<ThreadDetailSkeleton />}>
      <ThreadDetailClient
        tokenAddress={tokenAddress}
        initialToken={token as any}
        initialAnnouncements={announcements}
      />
    </Suspense>
  );
}
