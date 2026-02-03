'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Copy, Check } from 'lucide-react';
import { toast } from 'sonner';

interface ShareModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tokenAddress: string;
  tokenName?: string;
  tokenSymbol?: string;
  tokenDescription?: string;
  tokenImage?: string;
  launchpad?: string;
}

export function ShareModal({
  open,
  onOpenChange,
  tokenAddress,
  tokenName,
  tokenSymbol,
  tokenDescription,
  tokenImage,
}: ShareModalProps) {
  const [copied, setCopied] = useState(false);

  const shareUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/token/${tokenAddress}`
    : '';

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      toast.success('Link copied!');
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
      toast.error('Failed to copy link');
    }
  };

  const handleShareOnX = () => {
    const text = `I'm proud to shill $${tokenSymbol || tokenName || 'this token'}!\n\n${shareUrl}`;
    const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm p-0 bg-[#111114] border-border/50">
        <div className="p-5 sm:p-1">
          {/* Header */}
          <DialogHeader className="mb-5">
            <DialogTitle className="text-base font-semibold">
              Share
            </DialogTitle>
          </DialogHeader>

          {/* Token Preview Card */}
          <div className="rounded-xl overflow-hidden mb-5 p-4 bg-[#1a1a1d] border border-border/30">
            <div className="flex items-center gap-3">
              {/* Token Image */}
              <div className="shrink-0">
                {tokenImage ? (
                  <Image
                    src={tokenImage}
                    alt={tokenName || tokenSymbol || 'Token'}
                    width={48}
                    height={48}
                    className="size-12 rounded-lg object-cover"
                    unoptimized
                  />
                ) : (
                  <div className="size-12 rounded-lg flex items-center justify-center bg-primary">
                    <span className="text-primary-foreground font-bold text-lg">
                      {(tokenName || tokenSymbol || 'T')?.[0]?.toUpperCase()}
                    </span>
                  </div>
                )}
              </div>

              {/* Token Info */}
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-sm truncate">
                  {tokenName || 'Token'}
                </h3>
                {tokenSymbol && (
                  <p className="text-xs text-muted-foreground uppercase">
                    {tokenSymbol}
                  </p>
                )}
              </div>
            </div>

            {tokenDescription && (
              <p className="text-xs text-muted-foreground mt-3 line-clamp-2">
                {tokenDescription}
              </p>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3">
            <button
              onClick={handleCopyLink}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-full text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/80 transition-colors cursor-pointer"
            >
              {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
              {copied ? 'Copied!' : 'Copy Link'}
            </button>

            <button
              onClick={handleShareOnX}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-full text-sm font-medium bg-[#1d1d20] hover:bg-[#2a2a2e] border border-border/50 transition-colors cursor-pointer"
            >
              <svg className="size-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
              </svg>
              Share on X
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
