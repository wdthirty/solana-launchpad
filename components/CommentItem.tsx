'use client';

import React from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { ThumbsUp, ThumbsDown, MessageSquare } from 'lucide-react';

export interface Comment {
  _id: string;
  content: string;
  authorId: string;
  authorName?: string;
  authorAvatar?: string;
  createdAt: string;
  upvotes?: number;
  downvotes?: number;
}

interface CommentItemProps {
  comment: Comment;
  onUpvote?: (commentId: string) => void;
  onDownvote?: (commentId: string) => void;
  onReply?: (commentId: string) => void;
}

export function CommentItem({ comment, onUpvote, onDownvote, onReply }: CommentItemProps) {
  return (
    <div className="flex gap-3 p-4 rounded-lg border bg-card">
      <Avatar>
        <AvatarImage src={comment.authorAvatar} />
        <AvatarFallback>{comment.authorName?.[0] || 'U'}</AvatarFallback>
      </Avatar>

      <div className="flex-1 space-y-2">
        <div className="flex items-center gap-2">
          <span className="font-semibold">{comment.authorName || 'Anonymous'}</span>
          <span className="text-xs text-muted-foreground">
            {new Date(comment.createdAt).toLocaleString()}
          </span>
        </div>

        <p className="text-sm">{comment.content}</p>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onUpvote?.(comment._id)}
            className="gap-1"
          >
            <ThumbsUp className="w-4 h-4" />
            <span>{comment.upvotes || 0}</span>
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => onDownvote?.(comment._id)}
            className="gap-1"
          >
            <ThumbsDown className="w-4 h-4" />
            <span>{comment.downvotes || 0}</span>
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => onReply?.(comment._id)}
            className="gap-1"
          >
            <MessageSquare className="w-4 h-4" />
            Reply
          </Button>
        </div>
      </div>
    </div>
  );
}
