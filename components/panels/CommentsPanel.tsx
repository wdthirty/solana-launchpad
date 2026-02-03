'use client';

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { ArrowDownUp, Reply, Loader2, ChevronDown, Check } from 'lucide-react';
import { VerifiedBadge } from '@/components/ui/verified-badge';
import { Triangle } from '@/components/ui/icons/triangle';
import { CommentWithAuthor } from '@/lib/types';
import { formatRelativeTime } from '@/lib/format/date';
import { useWalletUser } from '@/hooks/use-wallet-user';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { TokenBottomPanel } from '@/components/TokenTable';
import { parseBackgroundPosition } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/animate-ui/components/radix/dropdown-menu';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

type CommentSortOption = 'newest' | 'top';

interface Comment {
  id: string;
  username: string;
  avatar: string;
  timestamp: string;
  text: string;
  score: number;
  replies?: Comment[];
  isUpvoted?: boolean;
  isDownvoted?: boolean;
}

interface Trade {
  id: string;
  username: string;
  avatar: string;
  timestamp: string;
  action: 'buy' | 'sell';
  amount: string;
  token: string;
  price: string;
}

interface CommentsPanelProps {
  backgroundColor?: string;
  textColor?: string;
  activeTabColor?: string;
  comments?: Comment[];
  trades?: Trade[];
  backgroundImage?: string;
  backgroundSize?: string;
  backgroundPosition?: string;
  overlayColor?: string;
  overlayOpacity?: number;
  textBackgroundColor?: string;
  address?: string; // Token address
  token?: any; // Token data
  pageId?: string; // Page ID for regular pages
  showRealTransactions?: boolean; // Whether to show real transactions instead of mock trades
}

const defaultTrades: Trade[] = [];

const defaultComments: Comment[] = [];

export function CommentsPanel({
  backgroundColor,
  textColor,
  activeTabColor,
  comments: propComments,
  trades = defaultTrades,
  backgroundImage,
  backgroundSize,
  backgroundPosition,
  overlayColor,
  overlayOpacity,
  textBackgroundColor,
  address,
  token,
  pageId,
  showRealTransactions = false
}: CommentsPanelProps) {
  const bgPos = parseBackgroundPosition(backgroundPosition);
  // Helper for text background style - apply when any custom background exists (image or color)
  const hasCustomBackground = backgroundImage || (backgroundColor && backgroundColor !== '#111114');
  const defaultTextBgColor = '#0c0c0e';
  const textBgStyle = hasCustomBackground ? {
    backgroundColor: `${textBackgroundColor || defaultTextBgColor}cc`,
  } : undefined;
  const { user: walletUser, isAuthenticated } = useWalletUser();
  const [activeTab, setActiveTab] = useState<'comments' | 'trades'>('comments');
  const [newComment, setNewComment] = useState('');
  const [realComments, setRealComments] = useState<CommentWithAuthor[]>([]);
  const [isLoadingComments, setIsLoadingComments] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMoreComments, setHasMoreComments] = useState(false);
  const [commentsOffset, setCommentsOffset] = useState(0);
  const [isPostingComment, setIsPostingComment] = useState(false);
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const COMMENTS_LIMIT = 15;
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyContent, setReplyContent] = useState('');
  const [isPostingReply, setIsPostingReply] = useState(false);
  const [votingCommentId, setVotingCommentId] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<CommentSortOption>('top');

  // Use real comments if token address or pageId is provided, otherwise use prop comments or defaults
  const rawComments = (address || pageId) ? realComments : (propComments || defaultComments);

  // Sort comments client-side to avoid refetching on sort change
  const comments = useMemo(() => {
    if (!rawComments || rawComments.length === 0) return rawComments;

    const sorted = [...rawComments];
    if (sortBy === 'newest') {
      sorted.sort((a, b) => {
        const dateA = 'created_at' in a ? new Date(a.created_at).getTime() : 0;
        const dateB = 'created_at' in b ? new Date(b.created_at).getTime() : 0;
        return dateB - dateA;
      });
    } else if (sortBy === 'top') {
      sorted.sort((a, b) => {
        const scoreA = 'upvotes' in a ? (a.upvotes || 0) - (a.downvotes || 0) : ('score' in a ? a.score : 0);
        const scoreB = 'upvotes' in b ? (b.upvotes || 0) - (b.downvotes || 0) : ('score' in b ? b.score : 0);
        return scoreB - scoreA;
      });
    }
    return sorted;
  }, [rawComments, sortBy]);

  // Fetch comments for token or page (sortBy removed - sorting is done client-side)
  useEffect(() => {
    if (address || pageId) {
      fetchComments();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address, pageId, isAuthenticated]);

  // Infinite scroll observer
  const handleLoadMore = useCallback(() => {
    if (hasMoreComments && !isLoadingMore && !isLoadingComments) {
      fetchComments(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasMoreComments, isLoadingMore, isLoadingComments, commentsOffset]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMoreComments && !isLoadingMore) {
          handleLoadMore();
        }
      },
      { threshold: 0.1 }
    );

    if (loadMoreRef.current) {
      observer.observe(loadMoreRef.current);
    }

    return () => observer.disconnect();
  }, [handleLoadMore, hasMoreComments, isLoadingMore]);

  const fetchComments = async (loadMore = false) => {
    if (!address && !pageId) return;

    if (loadMore) {
      setIsLoadingMore(true);
    } else {
      setIsLoadingComments(true);
      setCommentsOffset(0);
    }

    try {
      // Build headers - only fetch session if authenticated (avoid slow getSession call)
      const headers: HeadersInit = {
        'Content-Type': 'application/json',
      };

      if (isAuthenticated) {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.access_token) {
          headers['Authorization'] = `Bearer ${session.access_token}`;
        }
      }

      const currentOffset = loadMore ? commentsOffset : 0;
      let response;
      if (address) {
        // Fetch comments for token with pagination
        response = await fetch(`/api/tokens/${address}/comments?limit=${COMMENTS_LIMIT}&offset=${currentOffset}`, {
          headers,
        });
      } else if (pageId) {
        // Fetch comments for page (sorting done client-side)
        response = await fetch(`/api/comments?pageId=${pageId}`, {
          headers,
        });
      } else {
        return;
      }

      if (response.ok) {
        const data = await response.json();
        // Handle paginated response from token comments API
        if (data.comments !== undefined) {
          if (loadMore) {
            setRealComments(prev => [...prev, ...data.comments]);
          } else {
            setRealComments(data.comments);
          }
          setHasMoreComments(data.hasMore);
          setCommentsOffset(currentOffset + data.comments.length);
        } else {
          // Fallback for non-paginated response (pageId comments)
          setRealComments(data);
          setHasMoreComments(false);
        }
      } else {
        const errorData = await response.json().catch(() => ({}));
        console.error('Failed to fetch comments:', {
          status: response.status,
          statusText: response.statusText,
          error: errorData,
          url: response.url,
          address,
          pageId
        });
        toast.error(`Failed to load comments: ${errorData.error || response.statusText}`);
      }
    } catch (error: any) {
      console.error('Error fetching comments:', error);
      toast.error('Failed to load comments', {
        description: error.message || 'Network error',
      });
    } finally {
      setIsLoadingComments(false);
      setIsLoadingMore(false);
    }
  };

  const handlePostComment = async () => {
    if ((!address && !pageId) || !newComment.trim() || !isAuthenticated) {
      if (!isAuthenticated) {
        toast.error('Please log in to post a comment');
      }
      return;
    }

    setIsPostingComment(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error('Please log in to post a comment');
        return;
      }

      let response;
      if (address) {
        // Post comment for token
        response = await fetch(`/api/tokens/${address}/comments`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            content: newComment.trim(),
          }),
        });
      } else if (pageId) {
        // Post comment for page
        response = await fetch(`/api/comments`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            content: newComment.trim(),
            pageId: pageId,
          }),
        });
      } else {
        return;
      }

      if (response.ok) {
        const newCommentData = await response.json();
        // Optimistically add the new comment to the state
        setRealComments(prev => [newCommentData, ...prev]);
        setNewComment('');
        toast.success('Comment posted!');
      } else {
        const errorData = await response.json();
        toast.error(errorData.error || 'Failed to post comment');
      }
    } catch (error) {
      console.error('Error posting comment:', error);
      toast.error('Failed to post comment');
    } finally {
      setIsPostingComment(false);
    }
  };

  const handlePostReply = async (parentId: string) => {
    if ((!address && !pageId) || !replyContent.trim() || !isAuthenticated) {
      if (!isAuthenticated) {
        toast.error('Please log in to post a reply');
      }
      return;
    }

    setIsPostingReply(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error('Please log in to post a reply');
        return;
      }

      let response;
      if (address) {
        // Post reply for token
        response = await fetch(`/api/tokens/${address}/comments`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            content: replyContent.trim(),
            parentId: parentId,
          }),
        });
      } else if (pageId) {
        // Post reply for page
        response = await fetch(`/api/comments`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            content: replyContent.trim(),
            pageId: pageId,
            parentId: parentId,
          }),
        });
      } else {
        return;
      }

      if (response.ok) {
        const newReplyData = await response.json();
        // Optimistically add the reply to the parent comment
        setRealComments(prev => {
          const updateComment = (comment: CommentWithAuthor): CommentWithAuthor => {
            if (comment.id === parentId) {
              return {
                ...comment,
                replies: [...(comment.replies || []), newReplyData]
              };
            }
            if (comment.replies) {
              return {
                ...comment,
                replies: comment.replies.map(updateComment)
              };
            }
            return comment;
          };
          return prev.map(updateComment);
        });
        setReplyContent('');
        setReplyingTo(null);
        toast.success('Reply posted!');
      } else {
        const errorData = await response.json();
        toast.error(errorData.error || 'Failed to post reply');
      }
    } catch (error) {
      console.error('Error posting reply:', error);
      toast.error('Failed to post reply');
    } finally {
      setIsPostingReply(false);
    }
  };

  const handleVote = async (commentId: string, voteType: 'up' | 'down') => {
    if (!isAuthenticated) {
      toast.error('Please log in to vote');
      return;
    }

    // Prevent double-clicking - check and set immediately
    if (votingCommentId === commentId) {
      return;
    }

    setVotingCommentId(commentId);

    // Store the previous state for rollback if needed
    let previousState: CommentWithAuthor[] = [];

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error('Please log in to vote');
        setVotingCommentId(null);
        return;
      }

      // Optimistically update the UI immediately before API call
      setRealComments(prev => {
        previousState = [...prev];
        const updateComment = (comment: CommentWithAuthor): CommentWithAuthor => {
          if (comment.id === commentId) {
            const currentVote = comment.userVote;
            let newUpvotes = comment.upvotes || 0;
            let newDownvotes = comment.downvotes || 0;
            let newUserVote: 'up' | 'down' | null = voteType;

            // Handle vote toggle logic
            if (currentVote === voteType) {
              // Toggle off: remove the vote
              newUserVote = null;
              if (voteType === 'up') {
                newUpvotes = Math.max(0, newUpvotes - 1);
              } else {
                newDownvotes = Math.max(0, newDownvotes - 1);
              }
            } else if (currentVote) {
              // Switching from one vote to another
              if (currentVote === 'up') {
                newUpvotes = Math.max(0, newUpvotes - 1);
              } else {
                newDownvotes = Math.max(0, newDownvotes - 1);
              }
              if (voteType === 'up') {
                newUpvotes += 1;
              } else {
                newDownvotes += 1;
              }
            } else {
              // New vote
              if (voteType === 'up') {
                newUpvotes += 1;
              } else {
                newDownvotes += 1;
              }
            }

            return {
              ...comment,
              upvotes: newUpvotes,
              downvotes: newDownvotes,
              userVote: newUserVote
            };
          }
          if (comment.replies) {
            return {
              ...comment,
              replies: comment.replies.map(updateComment)
            };
          }
          return comment;
        };
        return prev.map(updateComment);
      });

      const response = await fetch(`/api/comments/${commentId}/vote`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ voteType }),
      });

      if (response.ok) {
        const result = await response.json();
        // Update with server response to ensure consistency
        setRealComments(prev => {
          const updateComment = (comment: CommentWithAuthor): CommentWithAuthor => {
            if (comment.id === commentId) {
              return {
                ...comment,
                upvotes: result.upvotes || comment.upvotes,
                downvotes: result.downvotes || comment.downvotes,
                userVote: result.userVote || comment.userVote
              };
            }
            if (comment.replies) {
              return {
                ...comment,
                replies: comment.replies.map(updateComment)
              };
            }
            return comment;
          };
          return prev.map(updateComment);
        });
      } else {
        // Rollback to previous state on error
        setRealComments(previousState);
        const errorData = await response.json();
        console.error('Vote failed:', errorData);
        toast.error(errorData.error || 'Failed to vote');
      }
    } catch (error) {
      // Rollback to previous state on error
      setRealComments(previousState);
      console.error('Error voting:', error);
      toast.error('Failed to vote. Please try again.');
    } finally {
      setVotingCommentId(null);
    }
  };

  // Flatten nested comments into a single list with parent author info (for mobile)
  const flattenComments = (commentsList: (CommentWithAuthor | Comment)[], parentAuthor?: string): Array<{ comment: CommentWithAuthor | Comment; parentAuthor?: string }> => {
    const result: Array<{ comment: CommentWithAuthor | Comment; parentAuthor?: string }> = [];
    for (const comment of commentsList) {
      result.push({ comment, parentAuthor });
      const replies = 'author' in comment ? (comment as CommentWithAuthor).replies : (comment as Comment).replies;
      if (replies && replies.length > 0) {
        const author = 'author' in comment ? (comment as CommentWithAuthor).author?.username || 'Anonymous' : (comment as Comment).username;
        result.push(...flattenComments(replies as (CommentWithAuthor | Comment)[], author));
      }
    }
    return result;
  };

  // Shared comment body renderer (used by both mobile and desktop views)
  const renderCommentBody = (comment: CommentWithAuthor | Comment, showReplyingTo?: string) => {
    const isRealComment = 'author' in comment;
    const author = isRealComment ? (comment as CommentWithAuthor).author : null;
    const username = isRealComment ? author?.username || 'Anonymous' : (comment as Comment).username;
    const avatar = isRealComment ? author?.avatar || '' : (comment as Comment).avatar;
    const content = isRealComment ? (comment as CommentWithAuthor).content : (comment as Comment).text;
    const timestamp = isRealComment
      ? formatRelativeTime((comment as CommentWithAuthor).created_at)
      : (comment as Comment).timestamp;
    const score = isRealComment
      ? ((comment as CommentWithAuthor).upvotes || 0) - ((comment as CommentWithAuthor).downvotes || 0)
      : (comment as Comment).score;
    const userVote = isRealComment ? (comment as CommentWithAuthor).userVote : null;
    const commentId = comment.id;

    const walletAddress = isRealComment ? author?.wallet_address : null;
    const isVerified = isRealComment ? author?.verified : false;
    const profileSlug = username && username !== 'Anonymous' ? username : walletAddress;
    const hasProfileLink = !!profileSlug;

    // Check if comment author is the token creator (dev)
    const isDev = token?.creator_wallet && walletAddress && token.creator_wallet === walletAddress;

    return (
      <div className="flex gap-2 sm:gap-3">
        {/* Voting Section */}
        <div className="flex flex-col items-center gap-1">
          <button
            onClick={() => handleVote(commentId, 'up')}
            className={`hover:opacity-80 transition-opacity cursor-pointer ${userVote === 'up' ? 'text-orange-500' : 'text-muted-foreground'}`}
            disabled={!isAuthenticated || votingCommentId === commentId}
            title={!isAuthenticated ? 'Log in to vote' : 'Upvote'}
          >
            <Triangle size={14} />
          </button>
          <span className={`typo-caption font-medium ${userVote === 'up' ? 'text-orange-500' : userVote === 'down' ? 'text-blue-500' : 'text-white'}`}>
            {score}
          </span>
          <button
            onClick={() => handleVote(commentId, 'down')}
            className={`hover:opacity-80 transition-opacity cursor-pointer ${userVote === 'down' ? 'text-blue-500' : 'text-muted-foreground'}`}
            disabled={!isAuthenticated || votingCommentId === commentId}
            title={!isAuthenticated ? 'Log in to vote' : 'Downvote'}
          >
            <Triangle size={14} className="rotate-180" />
          </button>
        </div>

        <div className="flex-1 min-w-0">
          {showReplyingTo && (
            <div className="text-xs text-muted-foreground mb-1">
              Replying to <span className="text-primary">@{showReplyingTo}</span>
            </div>
          )}
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            {hasProfileLink ? (
              <Link href={`/profile/${profileSlug}`} className="flex items-center gap-2 hover:opacity-80 transition-opacity">
                <Avatar className="w-5 h-5 sm:w-6 sm:h-6 shrink-0">
                  <AvatarImage src={avatar || "https://ipfs.io/ipfs/bafkreifn2verhnir6r3lj6rmu4tdtmcpoyfl7epvm7y2nvpwsubbha6ora"} alt={username} className="object-cover aspect-square" />
                  <AvatarFallback>{username?.slice(0, 2).toUpperCase() || 'AN'}</AvatarFallback>
                </Avatar>
                <span className="text-xs sm:text-sm font-medium text-white hover:underline flex items-center gap-1">
                  {username}
                  {isVerified && <VerifiedBadge size="sm" />}
                </span>
              </Link>
            ) : (
              <>
                <Avatar className="w-5 h-5 sm:w-6 sm:h-6 shrink-0">
                  <AvatarImage src={avatar || "https://ipfs.io/ipfs/bafkreifn2verhnir6r3lj6rmu4tdtmcpoyfl7epvm7y2nvpwsubbha6ora"} alt={username} className="object-cover aspect-square" />
                  <AvatarFallback>{username?.slice(0, 2).toUpperCase() || 'AN'}</AvatarFallback>
                </Avatar>
                <span className="text-xs sm:text-sm font-medium text-white flex items-center gap-1">
                  {username}
                  {isVerified && <VerifiedBadge size="sm" />}
                </span>
              </>
            )}
            {isDev && (
              <Badge className="bg-primary text-black text-[10px] px-1.5 py-0 h-4">
                Dev
              </Badge>
            )}
            <span className="text-xs sm:text-sm text-muted-foreground">
              {timestamp}
            </span>
          </div>
          <p className="text-sm sm:typo-body text-white mb-3 break-words overflow-hidden">
            {content}
          </p>
          <div className="flex items-center gap-4">
            <button
              onClick={() => setReplyingTo(replyingTo === commentId ? null : commentId)}
              className="flex items-center gap-1 text-xs sm:text-sm hover:opacity-80 transition-opacity cursor-pointer text-muted-foreground"
              disabled={!isAuthenticated}
            >
              <Reply size={14} />
              Reply
            </button>
          </div>

          {/* Reply Input */}
          {replyingTo === commentId && (
            <div className="mt-4 p-4 rounded-lg bg-background/50">
              <textarea
                value={replyContent}
                onChange={(e) => setReplyContent(e.target.value)}
                placeholder="Write a reply..."
                className="w-full p-3 rounded-lg resize-none typo-body bg-background/50 text-white border border-border/50 focus:border-border focus:outline-none"
                style={{ minHeight: '80px' }}
              />
              <div className="flex justify-end gap-3 mt-3">
                <button
                  onClick={() => {
                    setReplyingTo(null);
                    setReplyContent('');
                  }}
                  className="px-4 py-2 rounded-lg typo-body cursor-pointer bg-muted text-white hover:bg-muted/80 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handlePostReply(commentId)}
                  disabled={!replyContent.trim() || isPostingReply}
                  className="px-4 py-2 rounded-lg typo-body font-medium cursor-pointer bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
                >
                  {isPostingReply ? 'Posting...' : 'Post Reply'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  // Desktop: Nested view with indentation
  const renderNestedComment = (comment: CommentWithAuthor | Comment, depth = 0) => {
    const isRealComment = 'author' in comment;
    const replies = isRealComment ? (comment as CommentWithAuthor).replies : (comment as Comment).replies;
    const commentId = comment.id;

    // Only apply background styling to root-level comments
    const isRoot = depth === 0;

    return (
      <div
        key={commentId}
        className={`${isRoot ? (hasCustomBackground ? 'mb-2' : 'mb-4') : 'mt-4 ml-4 pl-3 border-l-2 border-border/50'} ${isRoot && hasCustomBackground ? 'backdrop-blur-sm px-4 py-3 sm:rounded-lg' : ''}`}
        style={isRoot ? textBgStyle : undefined}
      >
        {renderCommentBody(comment)}

        {/* Nested Replies */}
        {replies && replies.length > 0 && (
          <div>
            {(replies as (CommentWithAuthor | Comment)[]).map((reply) => renderNestedComment(reply, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  // Mobile: Flat view with "Replying to" indicator
  const renderFlatComment = (comment: CommentWithAuthor | Comment, parentAuthor?: string) => {
    const isReply = !!parentAuthor;
    const commentId = comment.id;

    return (
      <div
        key={commentId}
        className={`py-3 px-3 border-b border-border/50 last:border-b-0 ${isReply ? 'pl-4 border-l border-l-border/50 ml-2' : ''} ${hasCustomBackground ? 'backdrop-blur-sm' : ''}`}
        style={textBgStyle}
      >
        {renderCommentBody(comment, parentAuthor)}
      </div>
    );
  };

  const flattenedComments = flattenComments(comments);

  return (
    <div
      className="rounded-2xl relative overflow-hidden flex flex-col"
    >
      {/* Background container */}
      <div
        className="absolute inset-0 rounded-2xl pointer-events-none"
        style={{
          zIndex: 0,
        }}
      >
        {/* Overlay - child above background */}
        {overlayColor && overlayOpacity !== undefined && overlayOpacity > 0 && (
          <div
            className="absolute inset-0 rounded-2xl"
            style={{
              backgroundColor: overlayColor,
              opacity: overlayOpacity,
              zIndex: 2,
              pointerEvents: 'none',
            }}
          />
        )}
        {/* Background image/color - child below overlay */}
        <div
          className="absolute inset-0 rounded-2xl overflow-hidden"
          style={{
            backgroundColor: backgroundImage ? 'transparent' : (backgroundColor || '#0a0a0c'),
            zIndex: 1,
          }}
        >
          {backgroundImage && bgPos.transform && backgroundSize === 'cover' ? (
            // Transform-based approach for accurate crop display
            <img
              src={backgroundImage}
              alt=""
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                transform: bgPos.transform,
                transformOrigin: bgPos.transformOrigin,
                width: bgPos.width,
                height: bgPos.height,
              }}
            />
          ) : backgroundImage ? (
            <div
              className="absolute inset-0"
              style={{
                backgroundImage: `url(${backgroundImage})`,
                backgroundSize: backgroundSize === 'repeat' ? 'auto' : (backgroundSize || 'cover'),
                backgroundPosition: backgroundSize === 'repeat' ? 'top left' : bgPos.position,
                backgroundRepeat: backgroundSize === 'repeat' ? 'repeat' : 'no-repeat',
              }}
            />
          ) : null}
        </div>
      </div>
      <div className="relative flex flex-col" style={{ zIndex: 2 }}>
      {/* Header with Tabs */}
      <div className="flex items-center justify-between p-3 sm:p-5">
        <div
          className={`flex items-center gap-6 ${hasCustomBackground ? 'backdrop-blur-sm px-2 py-1 rounded' : ''}`}
          style={textBgStyle}
        >
          <button
            onClick={() => setActiveTab('comments')}
            className={`text-sm sm:text-base font-medium cursor-pointer pb-1 transition-all ${activeTab === 'comments' ? 'text-white border-b-2 border-primary' : 'text-muted-foreground border-b-2 border-transparent'}`}
          >
            Comments
          </button>
          <button
            onClick={() => setActiveTab('trades')}
            className={`text-sm sm:text-base font-medium cursor-pointer pb-1 transition-all ${activeTab === 'trades' ? 'text-white border-b-2 border-primary' : 'text-muted-foreground border-b-2 border-transparent'}`}
          >
            Trades
          </button>
        </div>

        {activeTab === 'comments' && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className={`flex items-center gap-2 px-3 py-1.5 rounded cursor-pointer text-muted-foreground hover:text-white transition-colors focus-visible:outline-none ${hasCustomBackground ? 'backdrop-blur-sm' : 'bg-background/50'}`}
                style={textBgStyle}
              >
                <ArrowDownUp size={16} />
                <span className="text-xs sm:text-sm capitalize">{sortBy}</span>
                <ChevronDown size={14} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              className="w-[120px] bg-background border-border/50"
              align="end"
              sideOffset={8}
            >
              <DropdownMenuItem
                onClick={() => setSortBy('newest')}
                className={`cursor-pointer focus:bg-muted ${sortBy === 'newest' ? 'bg-muted/50' : ''}`}
              >
                <span>Newest</span>
                {sortBy === 'newest' && <Check className="ml-auto h-4 w-4 text-primary" />}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => setSortBy('top')}
                className={`cursor-pointer focus:bg-muted ${sortBy === 'top' ? 'bg-muted/50' : ''}`}
              >
                <span>Top</span>
                {sortBy === 'top' && <Check className="ml-auto h-4 w-4 text-primary" />}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {/* Add Comment Input - Only shown for Comments tab */}
      {activeTab === 'comments' && (
        <div className="px-3 pb-3 sm:px-5">
          <div className="flex gap-3">
            <Avatar className="w-8 h-8 shrink-0">
              <AvatarImage src={walletUser?.avatar || "https://ipfs.io/ipfs/bafkreifn2verhnir6r3lj6rmu4tdtmcpoyfl7epvm7y2nvpwsubbha6ora"} alt="User" className="object-cover aspect-square" />
              <AvatarFallback>👤</AvatarFallback>
            </Avatar>
            <div className="flex-1">
              <textarea
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                placeholder="What are your thoughts?"
                className="w-full p-3 rounded-lg resize-none bg-background/80 backdrop-blur-sm text-white border border-border/50 focus:border-border focus:outline-none"
                style={{ minHeight: '80px' }}
              />
              <div className="flex justify-end mt-2">
                <Button
                  size="sm"
                  disabled={!newComment.trim() || isPostingComment || !isAuthenticated}
                  onClick={handlePostComment}
                >
                  {isPostingComment ? 'Posting...' : 'Post'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Comments/Trades List */}
      <div
        className="flex-1 overflow-y-auto"
        style={showRealTransactions && address && activeTab === 'trades'
          ? { height: '700px', overflow: 'hidden' }
          : undefined
        }
      >
        <div>
          {activeTab === 'comments' ? (
            <div className="pb-5 sm:px-5">
              {isLoadingComments ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-primary" />
                </div>
              ) : comments.length === 0 ? (
                <div className="flex flex-col items-center py-8">
                  <p
                    className={`text-xs sm:text-sm text-muted-foreground ${hasCustomBackground ? 'backdrop-blur-sm px-2 py-1 rounded' : ''}`}
                    style={textBgStyle}
                  >
                    No comments yet.
                  </p>
                </div>
              ) : (
                <>
                  {/* Mobile: Flat view */}
                  <div className="sm:hidden">
                    {flattenedComments.map(({ comment, parentAuthor }) => renderFlatComment(comment, parentAuthor))}
                  </div>
                  {/* Desktop: Nested view */}
                  <div className="hidden sm:block">
                    {comments.map((comment) => renderNestedComment(comment))}
                  </div>

                  {/* Infinite scroll trigger */}
                  {hasMoreComments && (
                    <div ref={loadMoreRef} className="flex items-center justify-center py-4">
                      {isLoadingMore ? (
                        <Loader2 className="w-5 h-5 animate-spin text-primary" />
                      ) : (
                        <span className="text-xs text-muted-foreground">Scroll for more</span>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          ) : showRealTransactions && address ? (
            // Show real transactions using TokenBottomPanel (transactions only, no holders)
            <div className="h-[800px] overflow-hidden sm:px-5 sm:pt-2 sm:pb-5">
              <TokenBottomPanel
                className="flex h-full flex-col overflow-hidden"
                hideHolders={true}
                textBackgroundColor={hasCustomBackground ? (textBackgroundColor || '#0c0c0e') : undefined}
              />
            </div>
          ) : (
            trades.map((trade) => (
              <div
                key={trade.id}
                className={`p-5 ${hasCustomBackground ? 'backdrop-blur-sm rounded-lg m-2' : ''}`}
                style={textBgStyle}
              >
                <div className="flex gap-3">
                  {/* Avatar */}
                  <Avatar className="w-8 h-8 shrink-0">
                    <AvatarImage src={trade.avatar || "https://ipfs.io/ipfs/bafkreifn2verhnir6r3lj6rmu4tdtmcpoyfl7epvm7y2nvpwsubbha6ora"} alt={trade.username} className="object-cover aspect-square" />
                    <AvatarFallback>{trade.username?.slice(0, 2).toUpperCase() || 'AN'}</AvatarFallback>
                  </Avatar>

                  {/* Trade Content */}
                  <div className="flex-1">
                    {/* Username and Timestamp */}
                    <div className="flex items-center gap-2 mb-1">
                      <span className="typo-caption font-semibold text-white">
                        {trade.username}
                      </span>
                      <span className="typo-caption text-muted-foreground">
                        {trade.timestamp}
                      </span>
                    </div>

                    {/* Trade Info */}
                    <div className="flex items-center gap-2 typo-caption">
                      <span className={`font-bold ${trade.action === 'buy' ? 'text-green-500' : 'text-red-500'}`}>
                        {trade.action.toUpperCase()}
                      </span>
                      <span className="text-white">{trade.amount} {trade.token}</span>
                      <span className="text-muted-foreground">@ {trade.price}</span>
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
      </div>
    </div>
  );
}