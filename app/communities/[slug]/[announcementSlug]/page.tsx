'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ThreadCommentsPanel } from '@/components/panels/ThreadCommentsPanel';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ExternalLink, ArrowLeft, Lock } from 'lucide-react';
import { formatRelativeTime } from '@/lib/format/date';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { useQuery } from '@tanstack/react-query';
import { ApeQueries } from '@/components/Explore/queries';
import { CommunityTokenHeader } from '@/components/communities/CommunityTokenHeader';
import type { TokenWithCreator } from '@/lib/types';
import { supabase } from '@/lib/supabase';
import { useTokenHolding, MIN_TOKEN_HOLDING } from '@/hooks/use-token-holding';
import { NATIVE_TOKEN_ADDRESS } from '@/lib/config/app-config';

// Skeleton component for token card - matches TokenCard component structure
function TokenCardSkeleton() {
  return (
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
  );
}

// Skeleton component for post detail - matches announcement detail Card structure
function PostDetailSkeleton() {
  return (
    <Card className="border-border/50 animate-pulse">
      <CardHeader>
        {/* Title with Dev badge */}
        <div className="flex items-center gap-2">
          <div className="h-7 w-64 bg-muted rounded" />
          <div className="h-5 w-10 bg-muted rounded" />
        </div>
        {/* Author info: avatar, username, time */}
        <div className="flex items-center gap-2 mt-2">
          <div className="w-4 h-4 bg-muted rounded-full flex-shrink-0" />
          <div className="h-4 w-20 bg-muted rounded" />
          <div className="h-4 w-16 bg-muted rounded" />
        </div>
      </CardHeader>
      <CardContent>
        {/* Image placeholder - left-aligned, auto width */}
        <div className="mb-6 flex justify-start">
          <div className="h-48 w-64 bg-muted rounded-lg flex-shrink-0" />
        </div>
        {/* Description text */}
        <div className="mb-6 space-y-2">
          <div className="h-4 w-full bg-muted rounded" />
          <div className="h-4 w-full bg-muted rounded" />
          <div className="h-4 w-3/4 bg-muted rounded" />
          <div className="h-4 w-1/2 bg-muted rounded" />
        </div>
        {/* Website link placeholder */}
        <div className="mb-6 flex items-center gap-2">
          <div className="h-4 w-40 bg-muted rounded" />
          <div className="h-4 w-4 bg-muted rounded" />
        </div>
        {/* Comments section placeholder */}
        <div className="space-y-4">
          {/* Comment input area */}
          <div className="h-24 w-full bg-muted rounded border border-border" />
          {/* Submit button */}
          <div className="flex justify-end">
            <div className="h-9 w-24 bg-muted rounded" />
          </div>
          {/* Existing comments skeleton */}
          <div className="space-y-3 mt-4">
            {[1, 2].map((i) => (
              <div key={i} className="flex gap-3">
                <div className="w-8 h-8 bg-muted rounded-full flex-shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="h-4 w-20 bg-muted rounded" />
                    <div className="h-3 w-12 bg-muted rounded" />
                  </div>
                  <div className="h-4 w-full bg-muted rounded" />
                  <div className="h-4 w-2/3 bg-muted rounded" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

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
  metadata?: {
    image?: string;
    websiteLink?: string;
  } | null;
}

export default function AnnouncementDetailPage() {
  const params = useParams();
  const router = useRouter();
  const tokenAddress = params.slug as string;
  const announcementSlug = params.announcementSlug as string;
  const [announcement, setAnnouncement] = useState<Announcement | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [token, setToken] = useState<TokenWithCreator | null>(null);
  const [isLoadingToken, setIsLoadingToken] = useState(true);

  // Native token has public community access - no holder check required
  const isNativeToken = tokenAddress === NATIVE_TOKEN_ADDRESS;

  // Check if user has access (holder or developer)
  const { hasAccess: holderHasAccess, isLoading: isCheckingAccess } = useTokenHolding(
    tokenAddress,
    token?.creator_wallet
  );

  // Native token is public, others require holder access
  const hasAccess = isNativeToken || holderHasAccess;

  // Fetch token info using the address from URL
  const { data: tokenInfo } = useQuery({
    ...ApeQueries.tokenInfo({ id: tokenAddress || '' }),
    enabled: !!tokenAddress,
  });
  const tokenName = tokenInfo?.baseAsset?.name || tokenInfo?.baseAsset?.symbol || tokenAddress || 'Token';
  const tokenSymbol = tokenInfo?.baseAsset?.symbol || '';

  // Fetch full token data for TokenCard
  useEffect(() => {
    if (tokenAddress) {
      fetchTokenData();
    }
  }, [tokenAddress]);

  // Fetch announcement data
  useEffect(() => {
    if (tokenAddress && announcementSlug) {
      fetchAnnouncement();
    }
  }, [tokenAddress, announcementSlug]);

  const fetchTokenData = async () => {
    setIsLoadingToken(true);
    try {
      const response = await fetch(`/api/tokens/${tokenAddress}`);
      if (response.ok) {
        const data = await response.json();
        setToken(data);
      }
    } catch (error) {
      console.error('Error fetching token data:', error);
    } finally {
      setIsLoadingToken(false);
    }
  };

  const fetchAnnouncement = async () => {
    setIsLoading(true);
    try {
      // Construct the full slug: token-{address}-announcement-{id}
      const fullSlug = `token-${tokenAddress}-announcement-${announcementSlug}`;

      // Get auth token to include user's votes
      const { data: { session } } = await supabase.auth.getSession();
      const headers: HeadersInit = {};
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
      }

      // Fetch all announcements and find the matching one
      const announcementsResponse = await fetch(`/api/tokens/${tokenAddress}/announcements`, { headers });
      if (announcementsResponse.ok) {
        const announcements = await announcementsResponse.json();
        const found = announcements.find((a: Announcement) =>
          a.slug === fullSlug || a.slug.endsWith(`-${announcementSlug}`)
        );
        if (found) {
          setAnnouncement(found);
        }
      }
    } catch (error) {
      console.error('Error fetching announcement:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Show loading state while checking access (not needed for Native token which is public)
  if ((!isNativeToken && isCheckingAccess) || isLoadingToken) {
    return (
      <div className="min-h-screen">
        <div className="flex-1 p-4 md:p-6 lg:p-8 overflow-auto">
          <div className="max-w-5xl mx-auto">
            <TokenCardSkeleton />
            <PostDetailSkeleton />
          </div>
        </div>
      </div>
    );
  }

  // Show gated page if user doesn't have access
  if (!hasAccess) {
    return (
      <div className="min-h-screen">
        <div className="flex-1 p-4 md:p-6 lg:p-8 overflow-auto">
          <div className="max-w-5xl mx-auto">
            {/* Token Info Card */}
            {token && (
              <div className="mb-6">
                <CommunityTokenHeader token={token} />
              </div>
            )}

            {/* Gated Content Message */}
            <div className="flex flex-col items-center justify-center py-16 px-8">
              <div className="flex flex-col items-center gap-6 text-center max-w-md">
                <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center">
                  <Lock className="w-10 h-10 text-muted-foreground" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold mb-2">Holders Only Community</h2>
                  <p className="text-muted-foreground">
                    You need to hold at least {MIN_TOKEN_HOLDING.toLocaleString()} {token?.symbol || 'tokens'} to access this community and participate in discussions.
                  </p>
                </div>
                <Link href={`/token/${tokenAddress}`}>
                  <Button size="lg" className="bg-primary hover:bg-primary/80 text-primary-foreground gap-2">
                    Buy
                    {token?.metadata?.logo && (
                      <img src={token.metadata.logo} alt="" className="w-5 h-5 rounded-full object-cover" />
                    )}
                    {token?.symbol || 'Token'}
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
        <div className="flex-1 p-4 md:p-6 lg:p-8 overflow-auto">
          <div className="max-w-5xl mx-auto">
            {/* Token Info Card */}
            {token ? (
              <div className="mb-6">
                <CommunityTokenHeader token={token} />
              </div>
            ) : (
              <div className="mb-6">
                <h1 className="text-3xl font-bold mb-2">{tokenName} Threads</h1>
                <p className="text-muted-foreground">
                  Posts and discussions for {tokenSymbol || tokenAddress}
                </p>
              </div>
            )}

            {/* Loading State */}
            {isLoading && (
              <PostDetailSkeleton />
            )}

            {/* Post Detail */}
            {!isLoading && announcement && (
              <Card className="border-border/50 bg-background">
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-2xl">{announcement.title}</CardTitle>
                    {((token?.creator?.id && announcement.author.id === token.creator.id) ||
                      (token?.creator_wallet && announcement.author.wallet_address && 
                       token.creator_wallet.toLowerCase() === announcement.author.wallet_address.toLowerCase())) && (
                      <Badge 
                        className="bg-primary text-body text-black"
                      >
                        Dev
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2 typo-caption text-muted-foreground">
                    <Avatar className="w-4 h-4 shrink-0">
                      <AvatarImage src={announcement.author.avatar || "https://ipfs.io/ipfs/bafkreifn2verhnir6r3lj6rmu4tdtmcpoyfl7epvm7y2nvpwsubbha6ora"} className="object-cover aspect-square" />
                      <AvatarFallback>
                        {announcement.author.username[0]}
                      </AvatarFallback>
                    </Avatar>
                    {announcement.author.wallet_address ? (
                      <Link
                        href={`/profile/${announcement.author.wallet_address}`}
                        className="hover:underline text-primary"
                        onClick={(e: React.MouseEvent) => e.stopPropagation()}
                      >
                        {announcement.author.username}
                      </Link>
                    ) : (
                      <span>{announcement.author.username}</span>
                    )}
                    <span>{formatRelativeTime(announcement.created_at)}</span>
                  </div>
                </CardHeader>
                <CardContent>
                  {announcement.metadata?.image && (
                    <div className="mb-6 flex justify-start">
                      <img
                        src={announcement.metadata.image}
                        alt={announcement.title}
                        className="h-48 w-auto max-w-full flex-shrink-0 object-cover rounded-lg"
                      />
                    </div>
                  )}
                  <div className="mb-6">
                    <p className="text-body text-white whitespace-pre-wrap">
                      {announcement.description}
                    </p>
                  </div>
                  {announcement.metadata?.websiteLink && (
                    <div className="mb-6">
                      <a
                        href={announcement.metadata.websiteLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 text-sm text-primary hover:underline max-w-full"
                      >
                        <span className="truncate">
                          {(() => {
                            try {
                              const url = new URL(announcement.metadata.websiteLink);
                              const pathname = url.pathname.endsWith('/') && url.pathname !== '/'
                                ? url.pathname.slice(0, -1)
                                : url.pathname;
                              const display = url.hostname + (pathname === '/' ? '' : pathname);
                              return display.length > 50 ? display.slice(0, 50) + '...' : display;
                            } catch {
                              return announcement.metadata.websiteLink.length > 50
                                ? announcement.metadata.websiteLink.slice(0, 50) + '...'
                                : announcement.metadata.websiteLink;
                            }
                          })()}
                        </span>
                        <ExternalLink className="w-4 h-4 flex-shrink-0" />
                      </a>
                    </div>
                  )}
                  <div>
                    <ThreadCommentsPanel
                      pageId={announcement.pageId || announcement.id}
                      token={token}
                      announcementAuthorId={announcement.author.id}
                      announcementAuthorWallet={announcement.author.wallet_address || null}
                      disableReplies={isNativeToken}
                      hideEmptyState={isNativeToken}
                    />
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Not Found */}
            {!isLoading && !announcement && (
              <Card className="bg-background border-border/50">
                <CardContent className="py-12 text-center">
                  <p className="text-muted-foreground mb-2">Post not found</p>
                  <Button
                    variant="ghost"
                    onClick={() => router.push(`/communities/${tokenAddress}`)}
                    className="mt-4"
                  >
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Back to Community
                  </Button>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      
    </div>
  );
}

