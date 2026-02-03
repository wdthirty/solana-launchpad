'use client';

import Link from 'next/link';
import { ThreadCommentsPanel } from '@/components/panels/ThreadCommentsPanel';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Link as LinkIcon } from 'lucide-react';
import { formatRelativeTime } from '@/lib/format/date';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { CommunityTokenHeader } from '@/components/communities/CommunityTokenHeader';
import type { TokenWithCreator } from '@/lib/types';

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

interface AnnouncementDetailClientProps {
  tokenAddress: string;
  initialToken: TokenWithCreator | null;
  initialAnnouncement: Announcement | null;
}

export function AnnouncementDetailClient({
  tokenAddress,
  initialToken,
  initialAnnouncement,
}: AnnouncementDetailClientProps) {
  const token = initialToken;
  const announcement = initialAnnouncement;

  return (
    <div className="min-h-screen">
            <div className="flex-1 p-4">
        <div className="max-w-5xl mx-auto">
          {/* Token Info Card */}
          {token ? (
            <div className="mb-6">
              <CommunityTokenHeader token={token} />
            </div>
          ) : (
            <div className="mb-6">
              <h1 className="text-3xl font-bold mb-2">Token Threads</h1>
              <p className="text-muted-foreground">
                Posts and discussions for {tokenAddress}
              </p>
            </div>
          )}

          {/* Post Detail */}
          {announcement && (
            <Card className="bg-background border-border/50">
              <CardHeader>
                <div className="flex items-center gap-2 mb-2">
                  <CardTitle className="text-2xl">{announcement.title}</CardTitle>
                  {((token?.creator?.id && announcement.author.id === token.creator.id) ||
                    (token?.creator_wallet && announcement.author.wallet_address &&
                     token.creator_wallet.toLowerCase() === announcement.author.wallet_address.toLowerCase())) && (
                    <Badge
                      className="bg-primary text-black text-body"
                    >
                      Dev
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Avatar className="w-5 h-5 shrink-0">
                    <AvatarImage src={announcement.author.avatar || "https://ipfs.io/ipfs/bafkreifn2verhnir6r3lj6rmu4tdtmcpoyfl7epvm7y2nvpwsubbha6ora"} className="object-cover aspect-square" />
                    <AvatarFallback>
                      {announcement.author.username[0]}
                    </AvatarFallback>
                  </Avatar>
                  {announcement.author.wallet_address ? (
                    <Link
                      href={`/profile/${announcement.author.username}`}
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
                  <p className="text-lg text-white whitespace-pre-wrap">
                    {announcement.description}
                  </p>
                </div>
                {announcement.metadata?.websiteLink && (
                  <div className="mb-6">
                    <a
                      href={announcement.metadata.websiteLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 text-sm text-primary hover:underline"
                    >
                      <LinkIcon className="w-4 h-4" />
                      Visit Link
                    </a>
                  </div>
                )}
                <div className="border-t pt-4">
                  <ThreadCommentsPanel
                    pageId={announcement.pageId || announcement.id}
                    token={token}
                    announcementAuthorId={announcement.author.id}
                    announcementAuthorWallet={announcement.author.wallet_address || null}
                  />
                </div>
              </CardContent>
            </Card>
          )}

          {/* Not Found */}
          {!announcement && (
            <Card className="bg-background border-border/50">
              <CardContent className="py-12 text-center">
                <p className="text-muted-foreground">Post not found</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
