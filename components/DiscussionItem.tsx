'use client';

import * as React from 'react';
import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { AwardDisplay } from '@/components/AwardDisplay';
import type { UserAward, DiscussionWithAuthor, WalletUser, DiscussionItemProps } from '@/lib/types';
import { formatNumber, formatRelativeTime } from '@/lib/format';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/animate-ui/components/radix/dropdown-menu';
import {
  ChevronUp,
  ChevronDown,
  MessageSquare,
  Gift,
  MoreHorizontal,
  Coins,
  ChevronRight,
} from 'lucide-react';
import { VerifiedBadge } from '@/components/ui/verified-badge';

// Use centralized types from lib/types

export const DiscussionItem: React.FC<DiscussionItemProps> = ({
  discussion,
  depth,
  isConnected,
  walletUser,
  onVote,
  onReply,
  onGiveAward,
  onDelete,
  maxDepth = 10, // Prevent infinite nesting in UI
}) => {
  const [isReplying, setIsReplying] = useState(false);
  const [replyContent, setReplyContent] = useState('');
  const [isCollapsed, setIsCollapsed] = useState(false);

  const handleSubmitReply = (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyContent.trim() || !isConnected) return;

    if (!discussion.id) {
      return;
    }

    onReply(discussion.id, replyContent.trim());
    setReplyContent('');
    setIsReplying(false);
  };

  const handleDelete = () => {
    if (confirm('Are you sure you want to delete this comment?')) {
      onDelete(discussion.id);
    }
  };

  // Count total replies including nested ones
  const countTotalReplies = (replies: DiscussionWithAuthor[]): number => {
    return replies.reduce((count, reply) => {
      return count + 1 + (reply.replies ? countTotalReplies(reply.replies) : 0);
    }, 0);
  };

  const totalReplies = discussion.replies ? countTotalReplies(discussion.replies) : 0;
  const shouldShowReplies = depth < maxDepth;

  return (
    <div className="space-y-3">
      <div className="relative">
        {/* Reddit-style connecting lines */}
        {depth > 0 && (
          <div className="absolute left-0 top-0 bottom-0">
            {/* Vertical line that extends down */}
            <div className="absolute left-0 top-0 w-0.5 h-full bg-border/40"></div>
            {/* Horizontal connector line */}
            <div className="absolute left-0 top-6 w-4 h-0.5 bg-border/40"></div>
          </div>
        )}
        
        <Card className={`${depth > 0 ? "ml-6 border-l-2 border-muted/50" : ""} ${depth > 0 ? "bg-muted/20" : ""}`}>
          <CardContent className="p-4">
            <div className="flex gap-3">
              <Avatar className="h-8 w-8">
                <AvatarImage src={discussion.author.avatar} alt={discussion.author.username} />
                <AvatarFallback>{(discussion.author.username || 'U')[0]}</AvatarFallback>
              </Avatar>
            <div className="flex-1 space-y-2">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-sm flex items-center gap-1">
                  {discussion.author.username}
                  {discussion.author.verified && <VerifiedBadge size="sm" />}
                </span>
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Coins className="h-3 w-3" />
                  <span>{formatNumber(discussion.author.points || 0, 0)}</span>
                </div>
                <span className="text-xs text-muted-foreground">•</span>
                <span className="text-xs text-muted-foreground">{formatRelativeTime(discussion.created_at)}</span>
              </div>
              <p className="text-sm leading-relaxed">{discussion.content}</p>

              {/* Awards Display */}
              {discussion.awards && discussion.awards.length > 0 && (
                <div className="mt-2">
                  <AwardDisplay awards={discussion.awards} />
                </div>
              )}
              
              <div className="flex items-center gap-3">
                {/* Collapse/Expand Button */}
                {totalReplies > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setIsCollapsed(!isCollapsed)}
                    className="h-7 px-1 text-muted-foreground hover:text-foreground"
                  >
                    {isCollapsed ? (
                      <ChevronRight className="h-3 w-3" />
                    ) : (
                      <ChevronDown className="h-3 w-3" />
                    )}
                    <span className="ml-1 text-xs">
                      {totalReplies} {totalReplies === 1 ? 'reply' : 'replies'}
                    </span>
                  </Button>
                )}
                
                {/* Voting */}
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onVote(discussion.id, 'up', depth > 0, discussion.id)}
                    className={`h-7 px-1 transition-all duration-200 ${
                      discussion.userVote === 'up'
                        ? 'text-primary hover:text-primary/80'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                    disabled={!isConnected}
                    title={discussion.userVote === 'up' ? 'Remove upvote' : 'Upvote'}
                  >
                    <ChevronUp className="h-3 w-3" />
                  </Button>
                  <span className={`text-xs min-w-[1.5rem] text-center transition-all duration-200 ${
                    discussion.userVote ? 'font-bold text-primary' : 'font-medium'
                  }`}>
                    {formatNumber(discussion.upvotes - discussion.downvotes, 0)}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onVote(discussion.id, 'down', depth > 0, discussion.id)}
                    className={`h-7 px-1 transition-all duration-200 ${
                      discussion.userVote === 'down'
                        ? 'text-primary hover:text-primary/80'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                    disabled={!isConnected}
                    title={discussion.userVote === 'down' ? 'Remove downvote' : 'Downvote'}
                  >
                    <ChevronDown className="h-3 w-3" />
                  </Button>
                </div>
                
                {/* Reply Button */}
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="h-7 px-1 text-muted-foreground"
                  onClick={() => setIsReplying(!isReplying)}
                  disabled={!isConnected}
                >
                  <MessageSquare className="h-3 w-3 mr-1" />
                  Reply
                </Button>
                
                {/* Award Button */}
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-1 text-muted-foreground"
                  onClick={() => onGiveAward(discussion.id, depth > 0, discussion.id)}
                  disabled={!isConnected}
                >
                  <Gift className="h-3 w-3 mr-1" />
                  Award
                </Button>
                
                {/* More Options */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground">
                      <MoreHorizontal className="h-3 w-3" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem>Report</DropdownMenuItem>
                    {walletUser.id === discussion.author.id && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem className="text-destructive" onClick={handleDelete}>
                          Delete
                        </DropdownMenuItem>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </div>
          
          {/* Reply Form */}
          {isReplying && (
            <Card className="ml-8 border-l-2 border-border/50 mt-3">
              <CardContent className="p-4">
                <form onSubmit={handleSubmitReply} className="space-y-3">
                  <div className="flex gap-3">
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={walletUser.avatar} alt={walletUser.username} />
                      <AvatarFallback>{(walletUser.username || 'U')[0]}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 space-y-2">
                      <Textarea
                        placeholder={isConnected ? `Reply to ${discussion.author.username}...` : "Connect wallet to reply..."}
                        value={replyContent}
                        onChange={(e) => setReplyContent(e.target.value)}
                        className="min-h-[80px] resize-none"
                        disabled={!isConnected}
                      />
                      <div className="flex justify-between items-center">
                        <div className="text-xs text-muted-foreground">
                          {isConnected ? `Replying as ${walletUser.username}` : 'Wallet not connected'}
                        </div>
                        <div className="flex gap-2">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => setIsReplying(false)}
                          >
                            Cancel
                          </Button>
                          <Button
                            type="submit"
                            size="sm"
                            disabled={!replyContent.trim() || !isConnected}
                          >
                            Reply
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                </form>
              </CardContent>
            </Card>
          )}
        </CardContent>
      </Card>
      </div>
      
      {/* Recursive Replies */}
      {shouldShowReplies && discussion.replies && discussion.replies.length > 0 && !isCollapsed && (
        <div className="ml-6 space-y-3">
          {discussion.replies.map((reply) => (
            <DiscussionItem
              key={reply.id}
              discussion={reply}
              depth={depth + 1}
              isConnected={isConnected}
              walletUser={walletUser}
              onVote={onVote}
              onReply={onReply}
              onGiveAward={onGiveAward}
              onDelete={onDelete}
              maxDepth={maxDepth}
            />
          ))}
        </div>
      )}
      
      {/* Collapsed state indicator */}
      {isCollapsed && totalReplies > 0 && (
        <div className="ml-6 mt-2">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <div className="w-4 h-0.5 bg-border/40"></div>
            <span>{totalReplies} {totalReplies === 1 ? 'reply' : 'replies'} hidden</span>
          </div>
        </div>
      )}
      
    </div>
  );
};
