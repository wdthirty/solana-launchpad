'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Copy, Check, CheckCircle2, XCircle, Loader2, Shield } from 'lucide-react';
import { VerifiedBadge } from '@/components/ui/verified-badge';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn, getOptimizedImageUrl } from '@/lib/utils';
import type { TokenWithCreator } from '@/lib/types';

const DEFAULT_AVATAR_URL = 'https://ipfs.io/ipfs/bafkreifn2verhnir6r3lj6rmu4tdtmcpoyfl7epvm7y2nvpwsubbha6ora';

type DexPaidStatus = 'paid' | 'not_paid' | 'loading' | null;

// Simple in-memory cache for fetched logos
const logoCache = new Map<string, string | null>();
const pendingFetches = new Map<string, Promise<string | null>>();

function TokenAvatar({ name, symbol, tokenImage, metaplexUri }: { name?: string; symbol?: string; tokenImage?: string; metaplexUri?: string }) {
  const [cdnFailed, setCdnFailed] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [fetchedLogo, setFetchedLogo] = useState<string | null>(null);
  const fallbackLetter = (name || symbol || 'T')?.[0]?.toUpperCase();

  // Lazy logo fetching from metaplex_uri if no logo exists
  useEffect(() => {
    if (tokenImage || !metaplexUri) return;

    // Check cache first
    if (logoCache.has(metaplexUri)) {
      const cached = logoCache.get(metaplexUri);
      if (cached) setFetchedLogo(cached);
      return;
    }

    // Check if fetch is already in progress
    if (pendingFetches.has(metaplexUri)) {
      pendingFetches.get(metaplexUri)!.then(logo => {
        if (logo) setFetchedLogo(logo);
      });
      return;
    }

    // Start fetch
    const fetchPromise = (async (): Promise<string | null> => {
      try {
        const response = await fetch(metaplexUri, {
          signal: AbortSignal.timeout(3000),
          headers: { 'Accept': 'application/json' }
        });
        if (!response.ok) return null;

        const contentType = response.headers.get('content-type');
        if (contentType?.includes('application/json') || contentType?.includes('text/plain')) {
          const metadata = await response.json();
          return metadata.image || null;
        }
        return null;
      } catch {
        return null;
      }
    })();

    pendingFetches.set(metaplexUri, fetchPromise);

    fetchPromise.then(logo => {
      logoCache.set(metaplexUri, logo);
      pendingFetches.delete(metaplexUri);
      if (logo) setFetchedLogo(logo);
    });
  }, [tokenImage, metaplexUri]);

  const logoToShow = tokenImage || fetchedLogo || undefined;

  // Use 128px for CDN optimization
  const optimizedSrc = logoToShow ? getOptimizedImageUrl(logoToShow, 128) : undefined;
  const imageSrc = cdnFailed ? logoToShow : optimizedSrc;

  if (!logoToShow || hasError) {
    return (
      <div className="size-20 sm:size-20 lg:size-28 shrink-0 rounded-lg bg-muted flex items-center justify-center">
        <span className="text-primary font-bold text-xl sm:text-2xl lg:text-3xl">{fallbackLetter}</span>
      </div>
    );
  }

  return (
    <div className="size-20 sm:size-20 lg:size-28 shrink-0 rounded-lg overflow-hidden bg-muted">
      <img
        src={imageSrc}
        alt={name || 'Token'}
        className="size-full object-cover"
        onError={() => {
          if (!cdnFailed && optimizedSrc !== logoToShow) {
            setCdnFailed(true);
          } else {
            setHasError(true);
          }
        }}
      />
    </div>
  );
}

function DexStatusIndicator({ status }: { status: DexPaidStatus }) {
  if (!status) return null;

  const baseClasses = 'inline-flex items-center gap-1 sm:gap-1.5 px-2 sm:px-2.5 py-1 rounded-full text-xs sm:text-sm cursor-help';

  if (status === 'loading') {
    return (
      <span className={cn(baseClasses, 'bg-muted text-muted-foreground')}>
        <span>Checking</span>
        <Loader2 className="size-3 sm:size-3.5 animate-spin" />
      </span>
    );
  }

  const tooltipText = status === 'paid'
    ? 'Token is listed and verified on DexScreener'
    : 'Token is not yet listed on DexScreener';

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn(
            baseClasses,
            status === 'paid'
              ? 'bg-green-500/20 text-green-500'
              : 'bg-destructive/20 text-destructive'
          )}
        >
          <span>Dex</span>
          {status === 'paid' ? (
            <CheckCircle2 className="size-3 sm:size-3.5" />
          ) : (
            <XCircle className="size-3 sm:size-3.5" />
          )}
        </span>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        <p>{tooltipText}</p>
      </TooltipContent>
    </Tooltip>
  );
}

function GracePeriodIndicator() {
  const baseClasses = 'inline-flex items-center gap-1 sm:gap-1.5 px-2 sm:px-2.5 py-1 rounded-full text-xs sm:text-sm cursor-help';

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={cn(baseClasses, 'bg-emerald-500/20 text-emerald-400')}>
          <Shield className="size-3 sm:size-3.5" />
          <span>Grace</span>
        </span>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-[250px]">
        <p>This token was created with Grace Period protection, which helps prevent snipers at launch by applying high fees that gradually decrease over the first 20 seconds until normal trading resumes.</p>
      </TooltipContent>
    </Tooltip>
  );
}

function useDexPaidStatus(tokenAddress: string | undefined, initialIsDexPaid?: boolean | null) {
  const [status, setStatus] = useState<DexPaidStatus>(
    initialIsDexPaid === true ? 'paid' : null
  );

  useEffect(() => {
    if (initialIsDexPaid === true) return;
    if (!tokenAddress || tokenAddress.includes('...')) return;

    const checkStatus = async () => {
      setStatus('loading');

      try {
        const response = await fetch(
          `https://api.dexscreener.com/orders/v1/solana/${tokenAddress}`,
          { headers: { Accept: '*/*' } }
        );

        if (!response.ok) {
          setStatus('not_paid');
          return;
        }

        const data = await response.json();
        const orders = Array.isArray(data) ? data : (data?.orders || []);
        const isPaid = orders.some((order: { status: string }) => order.status === 'approved');

        setStatus(isPaid ? 'paid' : 'not_paid');

        if (isPaid) {
          fetch(`/api/tokens/${tokenAddress}/dex-status`, { method: 'POST' }).catch(() => {});
        }
      } catch {
        setStatus('not_paid');
      }
    };

    checkStatus();
  }, [tokenAddress, initialIsDexPaid]);

  return status;
}

interface CommunityTokenHeaderProps {
  token: TokenWithCreator;
}

export function CommunityTokenHeader({ token }: CommunityTokenHeaderProps) {
  const dexPaidStatus = useDexPaidStatus(token.address, token.is_dex_paid);
  const [copied, setCopied] = useState(false);

  const handleCopyAddress = async () => {
    if (!token.address) return;

    try {
      await navigator.clipboard.writeText(token.address);
      setCopied(true);
      toast.success('Address copied!');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Failed to copy');
    }
  };

  // Format time ago
  const formatTimeAgo = (date: string) => {
    const now = new Date();
    const created = new Date(date);
    const diffMs = now.getTime() - created.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  };

  const creatorUsername = token.creator?.username || (token.creator_wallet ? token.creator_wallet.slice(0, 6) : 'Unknown');
  const creatorAvatar = token.creator?.avatar || DEFAULT_AVATAR_URL;
  const creatorVerified = token.creator?.verified || false;
  const shortAddress = token.address ? `${token.address.slice(0, 4)}...${token.address.slice(-4)}` : '';

  return (
    <div className="relative w-full rounded-2xl p-4 sm:p-4 lg:p-5 bg-background">
      {/* Top right: Detail button */}
      <div className="absolute top-3 right-3 sm:top-4 sm:right-4 lg:top-5 lg:right-5 z-20">
        <Link href={`/token/${token.address}`}>
          <Button size="sm">
            Details
          </Button>
        </Link>
      </div>

      <div className="relative z-10 flex items-center gap-3 sm:gap-4">
        {/* Left: Token info */}
        <div className="flex items-center flex-1 min-w-0 gap-3 sm:gap-4">
          <TokenAvatar
            name={token.name}
            symbol={token.symbol}
            tokenImage={token.metadata?.logo}
            metaplexUri={token.metadata?.metaplex_uri}
          />

          <div className="flex flex-col gap-1 sm:gap-1.5 min-w-0 flex-1">
            {/* Token name + symbol */}
            <div className="flex flex-row items-center gap-1.5 sm:gap-2 max-w-[calc(100%-80px)] sm:max-w-[calc(100%-100px)]">
              <span className="font-semibold text-base sm:text-lg whitespace-nowrap truncate">
                {token.name || 'Unknown Token'}
              </span>
              <span className="text-xs sm:text-sm text-muted-foreground shrink-0">
                {token.symbol || 'N/A'}
              </span>
            </div>

            {/* Creator + time row */}
            <div className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm text-muted-foreground">
              <img
                src={creatorAvatar}
                alt=""
                className="size-3.5 sm:size-4 rounded-full object-cover"
                onError={(e) => {
                  e.currentTarget.src = DEFAULT_AVATAR_URL;
                }}
              />
              {token.creator_wallet ? (
                <Link
                  href={`/profile/${token.creator?.username || token.creator_wallet}`}
                  className="hover:underline hover:text-foreground transition-colors truncate max-w-[80px] sm:max-w-none flex items-center gap-1"
                >
                  {creatorUsername}
                  {creatorVerified && <VerifiedBadge size="sm" />}
                </Link>
              ) : (
                <span className="truncate max-w-[80px] sm:max-w-none flex items-center gap-1">
                  {creatorUsername}
                  {creatorVerified && <VerifiedBadge size="sm" />}
                </span>
              )}
              <span className="text-muted-foreground/50 text-xs shrink-0">{formatTimeAgo(token.created_at)}</span>
            </div>

            {/* Address + dex + grace period row */}
            <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
              <button
                onClick={handleCopyAddress}
                className="flex items-center gap-1 sm:gap-1.5 px-2 sm:px-2.5 py-1 rounded-full text-xs sm:text-sm transition-colors cursor-pointer text-white bg-muted hover:bg-muted/80"
              >
                <span>{shortAddress}</span>
                {copied ? <Check className="size-3 sm:size-3.5 text-green-500" /> : <Copy className="size-3 sm:size-3.5" />}
              </button>
              <TooltipProvider>
                <DexStatusIndicator status={dexPaidStatus} />
                {token.grace_mode_enabled && <GracePeriodIndicator />}
              </TooltipProvider>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
