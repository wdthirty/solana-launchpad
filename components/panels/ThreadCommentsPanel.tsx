'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Reply, Loader2, ChevronUp, ChevronDown } from 'lucide-react';
import { VerifiedBadge } from '@/components/ui/verified-badge';
import { CommentWithAuthor } from '@/lib/types';
import { formatRelativeTime } from '@/lib/format/date';
import { useWalletUser } from '@/hooks/use-wallet-user';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import type { TokenWithCreator } from '@/lib/types';

interface ThreadCommentsPanelProps {
  pageId: string;
  token?: TokenWithCreator | null;
  announcementAuthorId?: string | null;
  announcementAuthorWallet?: string | null;
  /** If true, disables new comments and replies (upvotes/downvotes still allowed for authenticated users) */
  disableReplies?: boolean;
  /** If true, hides the "No comments yet" message when there are no comments */
  hideEmptyState?: boolean;
}

export function ThreadCommentsPanel({
  pageId,
  token,
  announcementAuthorId,
  announcementAuthorWallet,
  disableReplies = false,
  hideEmptyState = false
}: ThreadCommentsPanelProps) {
  const { isAuthenticated } = useWalletUser();
  const [comments, setComments] = useState<CommentWithAuthor[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [newComment, setNewComment] = useState('');
  const [isPosting, setIsPosting] = useState(false);
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyContent, setReplyContent] = useState('');
  const [isPostingReply, setIsPostingReply] = useState(false);
  const [votingCommentId, setVotingCommentId] = useState<string | null>(null);
  const [expandedComments, setExpandedComments] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (pageId) {
      fetchComments();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageId, isAuthenticated]);

  const fetchComments = async () => {
    if (!pageId) return;

    setIsLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const headers: HeadersInit = {
        'Content-Type': 'application/json',
      };

      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
      }

      const response = await fetch(`/api/comments?pageId=${pageId}`, {
        headers,
      });

      if (response.ok) {
        const data = await response.json();
        setComments(data);
        // Expand all comments by default
        const allIds = new Set<string>();
        const collectIds = (comments: CommentWithAuthor[]) => {
          comments.forEach(comment => {
            allIds.add(comment.id);
            if (comment.replies) {
              collectIds(comment.replies);
            }
          });
        };
        collectIds(data);
        setExpandedComments(allIds);
      } else {
        toast.error('Failed to load comments');
      }
    } catch (error) {
      console.error('Error fetching comments:', error);
      toast.error('Failed to load comments');
    } finally {
      setIsLoading(false);
    }
  };

  const handlePostComment = async () => {
    if (!pageId || !newComment.trim() || !isAuthenticated) {
      if (!isAuthenticated) {
        toast.error('Please log in to post a comment');
      }
      return;
    }

    setIsPosting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error('Please log in to post a comment');
        return;
      }

      const response = await fetch(`/api/comments`, {
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

      if (response.ok) {
        const newCommentData = await response.json();
        setComments(prev => [newCommentData, ...prev]);
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
      setIsPosting(false);
    }
  };

  const handlePostReply = async (parentId: string) => {
    if (!pageId || !replyContent.trim() || !isAuthenticated) {
      return;
    }

    setIsPostingReply(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error('Please log in to post a reply');
        return;
      }

      const response = await fetch(`/api/comments`, {
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

      if (response.ok) {
        const newReplyData = await response.json();
        setComments(prev => {
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

    if (votingCommentId === commentId) {
      return;
    }

    setVotingCommentId(commentId);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error('Please log in to vote');
        setVotingCommentId(null);
        return;
      }

      setComments(prev => {
        const updateComment = (comment: CommentWithAuthor): CommentWithAuthor => {
          if (comment.id === commentId) {
            const currentVote = comment.userVote;
            let newUpvotes = comment.upvotes || 0;
            let newDownvotes = comment.downvotes || 0;
            let newUserVote: 'up' | 'down' | null = null;

            if (currentVote) {
              newUserVote = null;
              if (currentVote === 'up') {
                newUpvotes = Math.max(0, newUpvotes - 1);
              } else {
                newDownvotes = Math.max(0, newDownvotes - 1);
              }
            } else {
              newUserVote = voteType;
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
        body: JSON.stringify({
          voteType: voteType,
        }),
      });

      if (response.ok) {
        const updatedComment = await response.json();
        setComments(prev => {
          const updateComment = (comment: CommentWithAuthor): CommentWithAuthor => {
            if (comment.id === commentId) {
              return {
                ...comment,
                upvotes: updatedComment.upvotes,
                downvotes: updatedComment.downvotes,
                userVote: updatedComment.userVote,
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
        fetchComments();
      }
    } catch {
      fetchComments();
    } finally {
      setVotingCommentId(null);
    }
  };

  const toggleComment = (commentId: string) => {
    setExpandedComments(prev => {
      const next = new Set(prev);
      if (next.has(commentId)) {
        next.delete(commentId);
      } else {
        next.add(commentId);
      }
      return next;
    });
  };

  // Flatten nested comments into a single list with parent author info (for mobile)
  const flattenComments = (commentsList: CommentWithAuthor[], parentAuthor?: string): Array<{ comment: CommentWithAuthor; parentAuthor?: string }> => {
    const result: Array<{ comment: CommentWithAuthor; parentAuthor?: string }> = [];
    for (const comment of commentsList) {
      result.push({ comment, parentAuthor });
      if (comment.replies && comment.replies.length > 0 && expandedComments.has(comment.id)) {
        result.push(...flattenComments(comment.replies, comment.author.username));
      }
    }
    return result;
  };

  // Comment content (shared between mobile and desktop)
  const renderCommentBody = (comment: CommentWithAuthor, showReplyingTo?: string) => {
    const score = (comment.upvotes || 0) - (comment.downvotes || 0);
    const hasReplies = comment.replies && comment.replies.length > 0;
    const isExpanded = expandedComments.has(comment.id);

    const isTokenCreator =
      (token?.creator?.id && comment.author.id && comment.author.id === token.creator.id) ||
      (token?.creator_wallet && comment.author.wallet_address &&
       token.creator_wallet.toLowerCase() === comment.author.wallet_address.toLowerCase()) ||
      (token?.creator_user_id && comment.author.id && comment.author.id === token.creator_user_id);

    const isAnnouncementAuthor =
      (announcementAuthorId && comment.author.id && comment.author.id === announcementAuthorId) ||
      (announcementAuthorWallet && comment.author.wallet_address &&
       announcementAuthorWallet.toLowerCase() === comment.author.wallet_address.toLowerCase());

    return (
      <div className="flex gap-2 sm:gap-3">
        <Avatar className="w-8 h-8 shrink-0">
          <AvatarImage src={comment.author.avatar || "https://ipfs.io/ipfs/bafkreifn2verhnir6r3lj6rmu4tdtmcpoyfl7epvm7y2nvpwsubbha6ora"} className="object-cover aspect-square" />
          <AvatarFallback>{comment.author.username[0]}</AvatarFallback>
        </Avatar>

        <div className="flex-1 min-w-0">
          {showReplyingTo && (
            <div className="text-xs text-muted-foreground mb-1">
              Replying to <span className="text-primary">@{showReplyingTo}</span>
            </div>
          )}
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            {comment.author.wallet_address ? (
              <Link
                href={`/profile/${comment.author.username}`}
                className="font-medium text-sm hover:underline text-primary flex items-center gap-1"
              >
                {comment.author.username}
                {comment.author.verified && <VerifiedBadge size="sm" />}
              </Link>
            ) : (
              <span className="font-medium text-sm flex items-center gap-1">
                {comment.author.username}
                {comment.author.verified && <VerifiedBadge size="sm" />}
              </span>
            )}
            {(isTokenCreator || isAnnouncementAuthor) && (
              <div className="flex items-center gap-1">
                {isTokenCreator && (
                  <Badge
                    className="!bg-[#fe9226] !text-white !border-[#fe9226] hover:!bg-[#fe9226]/90 font-bold text-[10px] px-1.5 py-0"
                  >
                    Dev
                  </Badge>
                )}
                {isAnnouncementAuthor && (
                  <Badge
                    className="!bg-blue-600 !text-white !border-blue-600 hover:!bg-blue-600/90 font-bold text-[10px] px-1.5 py-0"
                  >
                    Author
                  </Badge>
                )}
              </div>
            )}
            <span className="text-xs text-muted-foreground">
              {formatRelativeTime(comment.created_at)}
            </span>
          </div>

          <p className="text-sm mb-2 whitespace-pre-wrap break-words overflow-hidden">{comment.content}</p>

          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 bg-transparent hover:bg-transparent"
                  onClick={() => handleVote(comment.id, 'up')}
                  disabled={votingCommentId === comment.id}
                >
                  <ChevronUp
                    className={`w-4 h-4 ${comment.userVote === 'up' ? 'text-green-500' : ''}`}
                  />
                </Button>
                <span className="text-xs font-medium min-w-[2ch] text-center">{score}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 bg-transparent hover:bg-transparent"
                  onClick={() => handleVote(comment.id, 'down')}
                  disabled={votingCommentId === comment.id}
                >
                  <ChevronDown
                    className={`w-4 h-4 ${comment.userVote === 'down' ? 'text-red-500' : ''}`}
                  />
                </Button>
              </div>

              {!disableReplies && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() => {
                    if (replyingTo === comment.id) {
                      setReplyingTo(null);
                      setReplyContent('');
                    } else {
                      setReplyingTo(comment.id);
                    }
                  }}
                >
                  <Reply className="w-3 h-3 mr-1" />
                  Reply
                </Button>
              )}
            </div>

            {hasReplies && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs w-fit"
                onClick={() => toggleComment(comment.id)}
              >
                {isExpanded ? 'Hide' : 'Show'} {comment.replies?.length} {comment.replies?.length === 1 ? 'reply' : 'replies'}
              </Button>
            )}
          </div>

          {/* Reply Form */}
          {!disableReplies && replyingTo === comment.id && (
            <div className="mt-3 space-y-2">
              <Textarea
                placeholder="Write a reply..."
                value={replyContent}
                onChange={(e) => setReplyContent(e.target.value)}
                rows={2}
                className="text-sm"
              />
              <div className="flex gap-2 justify-end">
                <Button
                  size="sm"
                  onClick={() => handlePostReply(comment.id)}
                  disabled={isPostingReply || !replyContent.trim()}
                >
                  {isPostingReply ? 'Posting...' : 'Post Reply'}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setReplyingTo(null);
                    setReplyContent('');
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  // Desktop: Nested view with indentation (max 4 levels, then flatten)
  const MAX_NEST_DEPTH = 4;

  const renderNestedComment = (comment: CommentWithAuthor, depth = 0, parentAuthor?: string): React.ReactNode => {
    const isExpanded = expandedComments.has(comment.id);
    const hasReplies = comment.replies && comment.replies.length > 0;

    // If we've exceeded max depth, show "Replying to" instead of further indentation
    const isOverMaxDepth = depth > MAX_NEST_DEPTH;
    const showReplyingTo = isOverMaxDepth && parentAuthor;
    const shouldIndent = depth > 0 && depth <= MAX_NEST_DEPTH;

    // Build class names - don't add border at MAX_NEST_DEPTH since wrapper handles it
    const indentClass = shouldIndent && depth < MAX_NEST_DEPTH
      ? 'ml-3 mt-3 border-l pl-3 border-l-neutral-800'
      : depth > 0 ? 'mt-3' : '';

    return (
      <div key={comment.id} className={indentClass}>
        {renderCommentBody(comment, showReplyingTo ? parentAuthor : undefined)}

        {/* Nested Replies - group by parent at max depth */}
        {hasReplies && isExpanded && (
          <div className="mt-3 space-y-3">
            {depth === MAX_NEST_DEPTH - 1 ? (
              // At max depth, render each reply in its own bordered container
              comment.replies!.map(reply => (
                <div key={reply.id} className="ml-3 mt-3 border-l pl-3 border-l-amber-600/50">
                  {renderNestedComment(reply, depth + 1, comment.author.username)}
                </div>
              ))
            ) : (
              comment.replies!.map(reply => renderNestedComment(reply, depth + 1, comment.author.username))
            )}
          </div>
        )}
      </div>
    );
  };

  // Mobile: Flat view with "Replying to" indicator
  const renderFlatComment = (comment: CommentWithAuthor, parentAuthor?: string) => {
    const isReply = !!parentAuthor;

    return (
      <div key={comment.id} className={`py-3 border-b border-neutral-800 last:border-b-0 ${isReply ? 'bg-neutral-900/50 px-2' : ''}`}>
        {renderCommentBody(comment, parentAuthor)}
      </div>
    );
  };

  const flattenedComments = flattenComments(comments);

  return (
    <div className="space-y-4">
      {/* New Comment Form */}
      {isAuthenticated && !disableReplies && (
        <div className="space-y-3 rounded-lg">
          <Textarea
            placeholder="Write a comment..."
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            rows={6}
          />
          <div className="flex justify-end">
            <Button
              onClick={handlePostComment}
              disabled={isPosting || !newComment.trim()}
              size="sm"
            >
              {isPosting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Posting...
                </>
              ) : (
                'Post Comment'
              )}
            </Button>
          </div>
        </div>
      )}

      {/* Comments List */}
      {isLoading ? (
        <div className="text-center py-8">
          <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Loading comments...</p>
        </div>
      ) : comments.length > 0 ? (
        <>
          {/* Mobile: Flat view */}
          <div className="sm:hidden">
            {flattenedComments.map(({ comment, parentAuthor }) => renderFlatComment(comment, parentAuthor))}
          </div>
          {/* Desktop: Nested view */}
          <div className="hidden sm:block space-y-4">
            {comments.map(comment => renderNestedComment(comment))}
          </div>
        </>
      ) : !hideEmptyState ? (
        <div className="text-center py-8 text-muted-foreground">
          <p className="text-sm">No comments yet</p>
        </div>
      ) : null}
    </div>
  );
}
