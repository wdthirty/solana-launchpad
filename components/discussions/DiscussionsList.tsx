'use client';

import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { MessageSquare, Coins } from 'lucide-react';
import { DiscussionItem } from '@/components/DiscussionItem';
import type { DiscussionWithAuthor, WalletUser } from '@/lib/types';

interface DiscussionsListProps {
  discussions: DiscussionWithAuthor[];
  isConnected: boolean;
  walletUser: WalletUser;
  onVote: (discussionId: string, voteType: 'up' | 'down', isReply?: boolean, parentId?: string) => void;
  onReply: (parentId: string, content: string) => void;
  onGiveAward: (discussionId: string, isReply?: boolean, replyId?: string) => void;
  onDelete: (discussionId: string) => void;
}

export const DiscussionsList: React.FC<DiscussionsListProps> = ({
  discussions,
  isConnected,
  walletUser,
  onVote,
  onReply,
  onGiveAward,
  onDelete,
}) => {
  if (discussions.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <MessageSquare className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">No discussions yet</h3>
          <p className="text-muted-foreground">Be the first to share your thoughts!</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Replies ({discussions.length})</h2>

      {/* Wallet Connection Notice */}
      {!isConnected && (
        <Card className="border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-full bg-amber-100 dark:bg-amber-900 flex items-center justify-center">
                <Coins className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <h3 className="font-semibold text-amber-900 dark:text-amber-100">Wallet Required</h3>
                <p className="text-sm text-amber-700 dark:text-amber-300">
                  Connect your Solana wallet to discuss, vote, and give awards
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Discussions */}
      {discussions
        .filter(discussion => discussion && discussion.id)
        .sort((a, b) => {
          // Sort by upvotes (most upvoted first)
          const aUpvotes = a.upvotes || 0;
          const bUpvotes = b.upvotes || 0;
          return bUpvotes - aUpvotes;
        })
        .map((discussion) => {
          if (!discussion.id) {
            console.error('Discussion missing id:', discussion);
            return null;
          }

          return (
            <DiscussionItem
              key={discussion.id}
              discussion={discussion}
              depth={0}
              isConnected={isConnected}
              walletUser={walletUser}
              onVote={onVote}
              onReply={onReply}
              onGiveAward={onGiveAward}
              onDelete={onDelete}
              maxDepth={10}
            />
          );
        })}
    </div>
  );
};
