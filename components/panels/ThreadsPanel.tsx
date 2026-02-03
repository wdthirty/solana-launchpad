'use client';

import { useState, useEffect } from 'react';
import { MessageSquare, ArrowRight, Clock, Lock } from 'lucide-react';
import { VerifiedBadge } from '@/components/ui/verified-badge';
import { formatRelativeTime } from '@/lib/format/date';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';
import { parseBackgroundPosition } from '@/lib/utils';
import { useTokenHolding, MIN_TOKEN_HOLDING, clearTokenHoldingCache } from '@/hooks/use-token-holding';
import { useWallet } from '@/contexts/FrameworkKitWalletContext';
import { NATIVE_TOKEN_ADDRESS } from '@/lib/config/app-config';

interface Announcement {
  id: string;
  title: string;
  description: string;
  author: {
    id: string;
    username: string;
    avatar: string;
    points: number;
    wallet_address?: string;
    verified?: boolean;
  };
  created_at: string;
  slug: string;
}

interface ThreadsPanelProps {
  backgroundColor?: string;
  textColor?: string;
  backgroundImage?: string;
  backgroundSize?: string;
  backgroundPosition?: string;
  overlayColor?: string;
  overlayOpacity?: number;
  textBackgroundColor?: string;
  tokenAddress?: string;
  creatorWallet?: string;
  tokenSymbol?: string;
  tokenLogo?: string;
  // Key to trigger access recheck (e.g., after buying tokens)
  accessRefreshKey?: number;
}

export function ThreadsPanel({
  backgroundColor,
  textColor,
  backgroundImage,
  backgroundSize,
  backgroundPosition,
  overlayColor,
  overlayOpacity,
  textBackgroundColor,
  tokenAddress,
  creatorWallet,
  tokenSymbol,
  tokenLogo,
  accessRefreshKey,
}: ThreadsPanelProps) {
  const bgPos = parseBackgroundPosition(backgroundPosition);
  // Helper for text background style - apply when any custom background exists (image or color)
  const hasCustomBackground = backgroundImage || (backgroundColor && backgroundColor !== '#111114');
  const textBgStyle = hasCustomBackground ? {
    backgroundColor: `${textBackgroundColor || '#0c0c0e'}cc`,
  } : undefined;
  const [latestAnnouncement, setLatestAnnouncement] = useState<Announcement | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [announcementCount, setAnnouncementCount] = useState(0);

  const { publicKey } = useWallet();

  // Check if user has access (holder or developer)
  const { hasAccess, isLoading: isCheckingAccess, refetch: refetchAccess } = useTokenHolding(tokenAddress, creatorWallet);

  // Refetch access when accessRefreshKey changes (e.g., after buying tokens)
  useEffect(() => {
    if (accessRefreshKey && tokenAddress && publicKey) {
      // Clear cache first to ensure fresh data
      clearTokenHoldingCache(publicKey.toString(), tokenAddress);
      // Small delay to allow blockchain state to update
      const timer = setTimeout(() => {
        refetchAccess();
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [accessRefreshKey, tokenAddress, publicKey, refetchAccess]);

  useEffect(() => {
    if (tokenAddress) {
      fetchLatestAnnouncement();
    }
  }, [tokenAddress]);

  const fetchLatestAnnouncement = async () => {
    if (!tokenAddress) return;

    setIsLoading(true);
    try {
      const url = new URL(`/api/tokens/${tokenAddress}/announcements`, window.location.origin);
      if (creatorWallet) {
        url.searchParams.set('creatorWallet', creatorWallet);
      }
      const response = await fetch(url.toString());
      if (response.ok) {
        const announcements = await response.json();
        if (Array.isArray(announcements) && announcements.length > 0) {
          // Get the most recent announcement (first one is already sorted by created_at DESC)
          setLatestAnnouncement(announcements[0]);
          setAnnouncementCount(announcements.length);
        } else {
          setLatestAnnouncement(null);
          setAnnouncementCount(0);
        }
      }
    } catch (error) {
      console.error('Error fetching latest announcement:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Native token has public community access - no holder check required
  const isNativeToken = tokenAddress === NATIVE_TOKEN_ADDRESS;

  // Show locked state if user doesn't have access (except for Native token which is public)
  // Also show locked state while checking access to prevent flicker (assume locked until proven otherwise)
  const showLockedState = !isNativeToken && (isCheckingAccess || !hasAccess);

  return (
    <div className="overflow-hidden relative rounded-2xl p-3 sm:p-5">
      {/* Background container - always render */}
      <div
        className="absolute inset-0 rounded-2xl pointer-events-none"
        style={{ zIndex: 0 }}
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
          className="absolute inset-0 rounded-2xl"
          style={{
            backgroundColor: backgroundImage ? 'transparent' : (backgroundColor || 'hsl(var(--background))'),
            backgroundImage: backgroundImage ? `url(${backgroundImage})` : undefined,
            backgroundSize: backgroundSize === 'repeat' ? 'auto' : (backgroundSize === 'cover' ? bgPos.size : (backgroundSize || 'cover')),
            backgroundPosition: backgroundSize === 'repeat' ? 'top left' : bgPos.position,
            backgroundRepeat: backgroundSize === 'repeat' ? 'repeat' : 'no-repeat',
            zIndex: 1,
          }}
        />
      </div>

      {/* Locked overlay for non-holders */}
      {showLockedState && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-background/90 backdrop-blur-sm rounded-2xl">
          <div className="flex flex-col items-center gap-3 p-4 text-center">
            <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
              {isCheckingAccess ? (
                <Loader2 className="w-6 h-6 text-muted-foreground animate-spin" />
              ) : (
                <Lock className="w-6 h-6 text-muted-foreground" />
              )}
            </div>
            <div>
              <h3 className="text-sm font-semibold mb-1">Holders Only</h3>
              <p className="text-xs text-muted-foreground max-w-[220px]">
                Hold at least {MIN_TOKEN_HOLDING.toLocaleString()} {tokenSymbol || 'tokens'} to access the community
              </p>
            </div>
            {tokenAddress && (
              <a
                href={`https://jup.ag/swap?sell=So11111111111111111111111111111111111111112&buy=${tokenAddress}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Button size="sm">
                  Buy
                  {tokenLogo && (
                    <img src={tokenLogo} alt="" className="w-4 h-4 rounded-full object-cover" />
                  )}
                  {tokenSymbol || 'Token'}
                </Button>
              </a>
            )}
          </div>
        </div>
      )}

      <div className={`relative ${showLockedState ? 'blur-sm pointer-events-none select-none' : ''}`} style={{ zIndex: 2, ...(showLockedState ? { height: '180px' } : {}) }}>
        <div className="flex flex-col gap-4">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div
              className={`flex items-center gap-2 ${hasCustomBackground ? 'backdrop-blur-sm py-1 rounded' : ''}`}
              style={textBgStyle}
            >
              <MessageSquare className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
              <h3 className="text-sm sm:text-base font-bold text-white" style={textColor ? { color: textColor } : undefined}>
                Latest Community Posts
              </h3>
            </div>
            {tokenAddress && !showLockedState && !isLoading && !isCheckingAccess && (
              <Link href={`/communities/${tokenAddress}`}>
                <Button size="sm">
                  View All
                  <ArrowRight className="w-4 h-4" />
                </Button>
              </Link>
            )}
            {(isLoading || isCheckingAccess) && (
              <div className="h-8 w-20 sm:w-24 bg-muted rounded-md animate-pulse" />
            )}
          </div>

          {/* Content */}
          {isLoading || isCheckingAccess ? (
            // Skeleton Card - same structure as loaded Card
            <Card className={`border-0 p-0 ${hasCustomBackground ? 'bg-background/80 backdrop-blur-sm' : 'bg-transparent'}`}>
              <CardHeader className="p-0 pb-2">
                <CardTitle className="text-sm sm:text-base">
                  <div className="h-4 sm:h-5 w-3/4 bg-muted rounded animate-pulse" />
                </CardTitle>
                <div className="flex items-center gap-2 text-xs sm:text-sm">
                  <div className="w-4 h-4 sm:w-5 sm:h-5 bg-muted rounded-full animate-pulse" />
                  <div className="h-3 sm:h-4 w-20 bg-muted rounded animate-pulse" />
                  <div className="h-3 sm:h-4 w-16 bg-muted rounded animate-pulse" />
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="mb-4 space-y-1.5">
                  <div className="h-3 sm:h-4 w-full bg-muted rounded animate-pulse" />
                  <div className="h-3 sm:h-4 w-3/4 bg-muted rounded animate-pulse" />
                </div>
                <div className="h-8 sm:h-9 w-full bg-muted rounded-md animate-pulse" />
              </CardContent>
            </Card>
          ) : latestAnnouncement ? (() => {
            // Check if author is the token creator/dev
            const isTokenCreator = creatorWallet && latestAnnouncement.author.wallet_address &&
              creatorWallet.toLowerCase() === latestAnnouncement.author.wallet_address.toLowerCase();

            return (
            <Card className={`border-0 p-0 ${hasCustomBackground ? 'bg-background/80 backdrop-blur-sm' : 'bg-transparent'}`}>
              <CardHeader className="p-0 pb-2">
                <CardTitle className="text-sm sm:text-base text-white" style={textColor ? { color: textColor } : undefined}>
                  {latestAnnouncement.title}
                </CardTitle>
                <div className="flex items-center gap-2 text-xs sm:text-sm text-muted-foreground">
                  <Avatar className="w-4 h-4 sm:w-5 sm:h-5">
                    <AvatarImage src={latestAnnouncement.author.avatar || 'https://ipfs.io/ipfs/bafkreifn2verhnir6r3lj6rmu4tdtmcpoyfl7epvm7y2nvpwsubbha6ora'} />
                    <AvatarFallback>
                      {latestAnnouncement.author.username[0]}
                    </AvatarFallback>
                  </Avatar>
                  <span className="flex items-center gap-1">
                    {latestAnnouncement.author.username}
                    {latestAnnouncement.author.verified && <VerifiedBadge size="sm" />}
                  </span>
                  {isTokenCreator && (
                    <Badge className="!bg-primary !text-black !border-primary hover:!bg-primary/90 font-bold text-[10px] px-1.5 py-0">
                      Dev
                    </Badge>
                  )}

                  <div className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    <span>{formatRelativeTime(latestAnnouncement.created_at)}</span>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <p className="text-xs sm:text-sm text-muted-foreground line-clamp-3 mb-4">
                  {latestAnnouncement.description}
                </p>
                {!showLockedState && (
                  <Link href={`/communities/${tokenAddress}`}>
                    <Button size="sm" className="w-full h-auto py-3">
                      Read More
                      <ArrowRight className="w-4 h-4" />
                    </Button>
                  </Link>
                )}
              </CardContent>
            </Card>
            );
          })() : (
            <div className="flex flex-col items-center py-8">
              {hasCustomBackground ? (
                <div
                  className="flex items-center justify-center w-12 h-12 mb-4 backdrop-blur-sm rounded-lg"
                  style={textBgStyle}
                >
                  <MessageSquare className="w-8 h-8 opacity-50 text-muted-foreground" />
                </div>
              ) : (
                <MessageSquare className="w-12 h-12 mb-4 opacity-50 text-muted-foreground" />
              )}
              <p
                className={`text-xs sm:text-sm text-muted-foreground mb-4 ${hasCustomBackground ? 'backdrop-blur-sm px-2 py-1 rounded' : ''}`}
                style={textBgStyle}
              >
                No community posts yet
              </p>
              {tokenAddress && !showLockedState && (
                <Link href={`/communities/${tokenAddress}`}>
                  <Button size="sm">
                    Create First Post
                    <ArrowRight className="w-4 h-4" />
                  </Button>
                </Link>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

