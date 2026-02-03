'use client';

import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { MessageSquare, Send } from 'lucide-react';
import type { WalletUser } from '@/lib/types';

interface DiscussionFormProps {
  walletUser: WalletUser;
  isConnected: boolean;
  onSubmit: (content: string) => Promise<void>;
  isSubmitting?: boolean;
}

export const DiscussionForm: React.FC<DiscussionFormProps> = ({
  walletUser,
  isConnected,
  onSubmit,
  isSubmitting = false,
}) => {
  const [content, setContent] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim() || !isConnected || isSubmitting) return;

    try {
      await onSubmit(content.trim());
      setContent('');
    } catch (error) {
      console.error('Error submitting discussion:', error);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessageSquare className="h-5 w-5" />
          Add a Reply
          {!isConnected && (
            <span className="text-sm text-muted-foreground ml-2">
              (Connect wallet to discuss)
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex gap-4">
            <Avatar className="h-10 w-10">
              <AvatarImage src={walletUser.avatar} alt={walletUser.username || 'User'} />
              <AvatarFallback>{(walletUser.username || 'U')[0]}</AvatarFallback>
            </Avatar>
            <div className="flex-1 space-y-2">
              <Textarea
                placeholder={isConnected ? "What are your thoughts?" : "Connect your wallet to discuss..."}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                className="min-h-[100px] resize-none"
                disabled={!isConnected || isSubmitting}
              />
              <div className="flex justify-between items-center">
                <div className="text-sm text-muted-foreground">
                  {isConnected ? `Posting as ${walletUser.username || 'Anonymous'}` : 'Wallet not connected'}
                </div>
                <Button
                  type="submit"
                  disabled={!content.trim() || !isConnected || isSubmitting}
                >
                  {isSubmitting ? (
                    <>
                      <div className="h-4 w-4 mr-2 animate-spin rounded-full border-2 border-current border-t-transparent" />
                      Posting...
                    </>
                  ) : (
                    <>
                      <Send className="h-4 w-4 mr-2" />
                      Post Discussion
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        </form>
      </CardContent>
    </Card>
  );
};
