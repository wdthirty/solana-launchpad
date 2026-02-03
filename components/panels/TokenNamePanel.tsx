'use client';

import { useState, useEffect, useRef, useLayoutEffect } from 'react';
import Link from 'next/link';
import { Copy, Check, CheckCircle2, XCircle, Loader2, Edit2, Shield, Heart } from 'lucide-react';
import { VerifiedBadge } from '@/components/ui/verified-badge';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn, parseBackgroundPosition, getOptimizedImageUrl } from '@/lib/utils';

// =============================================================================
// Types
// =============================================================================

const DEFAULT_AVATAR_URL = 'https://ipfs.io/ipfs/bafkreifn2verhnir6r3lj6rmu4tdtmcpoyfl7epvm7y2nvpwsubbha6ora';

interface TokenNamePanelProps {
  name?: string;
  subtitle?: string;
  username?: string;
  timeAgo?: string;
  address?: string;
  fullAddress?: string;
  creatorWallet?: string;
  creatorAvatar?: string;
  creatorVerified?: boolean;
  tokenImage?: string;
  metaplexUri?: string;
  onShare?: () => void;
  // Creator edit functionality
  showEditButton?: boolean;
  onEditPage?: () => void;
  // Grace period indicator
  graceModeEnabled?: boolean;
  // DEX paid status from DB (avoids API call if already verified)
  isDexPaid?: boolean | null;
  // Like functionality
  likeCount?: number;
  hasLiked?: boolean;
  onLike?: () => void;
  // Customization props for page creator
  backgroundColor?: string;
  textColor?: string;
  backgroundImage?: string;
  backgroundSize?: string;
  backgroundPosition?: string;
  overlayColor?: string;
  overlayOpacity?: number;
  textBackgroundColor?: string;
}

type DexPaidStatus = 'paid' | 'not_paid' | 'loading' | null;

// =============================================================================
// Sub-components
// =============================================================================

function PanelBackground({
  backgroundColor,
  backgroundImage,
  backgroundSize,
  backgroundPosition,
  overlayColor,
  overlayOpacity,
}: {
  backgroundColor?: string;
  backgroundImage?: string;
  backgroundSize?: string;
  backgroundPosition?: string;
  overlayColor?: string;
  overlayOpacity?: number;
}) {
  // Only render background if custom styling is provided (for page creator)
  const hasCustomBackground = backgroundColor || backgroundImage;
  if (!hasCustomBackground && !overlayColor) return null;

  const bgPos = parseBackgroundPosition(backgroundPosition);
  const useTransform = bgPos.transform && backgroundSize === 'cover';

  return (
    <div className="absolute inset-0 rounded-2xl" style={{ zIndex: 0 }}>
      {hasCustomBackground && (
        <div
          className="absolute inset-0 overflow-hidden rounded-2xl"
          style={{
            backgroundColor: backgroundImage ? 'transparent' : backgroundColor,
            zIndex: 1,
          }}
        >
          {backgroundImage && useTransform ? (
            // Transform-based approach for accurate crop display (matches react-easy-crop preview)
            <img
              src={backgroundImage}
              alt=""
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                transform: bgPos.transform,
                transformOrigin: bgPos.transformOrigin,
                width: bgPos.width,
                height: bgPos.height,
              }}
            />
          ) : backgroundImage ? (
            // Fallback to background-image for repeat/contain modes
            <div
              className="absolute inset-0 rounded-2xl"
              style={{
                backgroundImage: `url(${backgroundImage})`,
                backgroundSize: backgroundSize === 'repeat' ? 'auto' : (backgroundSize || 'cover'),
                backgroundPosition: backgroundSize === 'repeat' ? 'top left' : bgPos.position,
                backgroundRepeat: backgroundSize === 'repeat' ? 'repeat' : 'no-repeat',
              }}
            />
          ) : null}
        </div>
      )}
      {overlayColor && overlayOpacity !== undefined && overlayOpacity > 0 && (
        <div
          className="absolute inset-0 rounded-2xl pointer-events-none"
          style={{ backgroundColor: overlayColor, opacity: overlayOpacity, zIndex: 2 }}
        />
      )}
    </div>
  );
}

function MarqueeText({
  text,
  className,
  style
}: {
  text: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div className="overflow-hidden w-full">
      <div className="inline-flex animate-marquee">
        <span className={cn(className, 'shrink-0 whitespace-nowrap px-3')} style={style}>
          {text}
        </span>
        <span className={cn(className, 'shrink-0 whitespace-nowrap px-3')} style={style} aria-hidden>
          {text}
        </span>
      </div>
    </div>
  );
}

// Hook to measure if name + symbol fits in container
function useNameOverflow(name: string, symbol: string) {
  const containerRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const [isOverflowing, setIsOverflowing] = useState(false);
  const [hasMeasured, setHasMeasured] = useState(false);

  useLayoutEffect(() => {
    const measure = () => {
      if (containerRef.current && measureRef.current) {
        const containerWidth = containerRef.current.offsetWidth;
        const contentWidth = measureRef.current.offsetWidth;
        setIsOverflowing(contentWidth > containerWidth);
        setHasMeasured(true);
      }
    };

    // Measure after a small delay to ensure layout is ready
    const timer = setTimeout(measure, 50);

    // Only remeasure on actual resize
    const handleResize = () => {
      measure();
    };

    window.addEventListener('resize', handleResize);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', handleResize);
    };
  }, [name, symbol]);

  return { containerRef, measureRef, isOverflowing, hasMeasured };
}

// Simple in-memory cache for fetched logos (shared across all TokenAvatar instances)
const logoCache = new Map<string, string | null>();
const pendingFetches = new Map<string, Promise<string | null>>();

function TokenAvatar({ name, subtitle, tokenImage, metaplexUri }: { name?: string; subtitle?: string; tokenImage?: string; metaplexUri?: string }) {
  const [cdnFailed, setCdnFailed] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [fetchedLogo, setFetchedLogo] = useState<string | null>(null);
  const fallbackLetter = (name || subtitle || 'T')?.[0]?.toUpperCase();

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

  // Use 128px for CDN optimization (covers lg:size-28 = 112px)
  const optimizedSrc = logoToShow ? getOptimizedImageUrl(logoToShow, 128) : undefined;
  const imageSrc = cdnFailed ? logoToShow : optimizedSrc;

  if (!logoToShow || hasError) {
    return (
      <div className="size-20 sm:size-20 lg:size-28 shrink-0 rounded-lg bg-[#111114] flex items-center justify-center">
        <span className="text-primary font-bold text-xl sm:text-2xl lg:text-3xl">{fallbackLetter}</span>
      </div>
    );
  }

  return (
    <div className="size-20 sm:size-20 lg:size-28 shrink-0 rounded-lg overflow-hidden bg-[#111114]">
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

function DexStatusIndicator({ status, hasBackgroundImage, textBackgroundColor }: { status: DexPaidStatus; hasBackgroundImage?: boolean; textBackgroundColor?: string }) {
  if (!status) return null;

  const baseClasses = hasBackgroundImage
    ? 'inline-flex items-center gap-1 sm:gap-1.5 px-2 sm:px-2.5 py-1 rounded-full text-xs sm:text-sm backdrop-blur-sm cursor-help'
    : 'inline-flex items-center gap-1 sm:gap-1.5 px-2 sm:px-2.5 py-1 rounded-full text-xs sm:text-sm cursor-help';

  // Helper for text background style - use consistent color across all panels
  const textBgStyle = hasBackgroundImage ? {
    backgroundColor: `${textBackgroundColor || '#000000'}cc`,
  } : undefined;

  if (status === 'loading') {
    return (
      <span className={cn(baseClasses, hasBackgroundImage ? 'text-muted-foreground' : 'bg-muted text-muted-foreground')} style={textBgStyle}>
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
              ? (hasBackgroundImage ? 'text-green-500' : 'bg-green-500/20 text-green-500')
              : (hasBackgroundImage ? 'text-destructive' : 'bg-destructive/20 text-destructive')
          )}
          style={textBgStyle}
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

function GracePeriodIndicator({ hasBackgroundImage, textBackgroundColor }: { hasBackgroundImage?: boolean; textBackgroundColor?: string }) {
  const baseClasses = hasBackgroundImage
    ? 'inline-flex items-center gap-1 sm:gap-1.5 px-2 sm:px-2.5 py-1 rounded-full text-xs sm:text-sm backdrop-blur-sm cursor-help'
    : 'inline-flex items-center gap-1 sm:gap-1.5 px-2 sm:px-2.5 py-1 rounded-full text-xs sm:text-sm cursor-help';

  // Helper for text background style - use consistent color across all panels
  const textBgStyle = hasBackgroundImage ? {
    backgroundColor: `${textBackgroundColor || '#000000'}cc`,
  } : undefined;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn(baseClasses, hasBackgroundImage ? 'text-emerald-400' : 'bg-emerald-500/20 text-emerald-400')}
          style={textBgStyle}
        >
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

// =============================================================================
// Hooks
// =============================================================================

function useDexPaidStatus(tokenAddress: string | undefined, initialIsDexPaid?: boolean | null) {
  // If we already know it's paid from token data, skip all checks
  const [status, setStatus] = useState<DexPaidStatus>(
    initialIsDexPaid === true ? 'paid' : null
  );

  useEffect(() => {
    // Skip if already verified as paid from initial data
    if (initialIsDexPaid === true) return;
    if (!tokenAddress || tokenAddress.includes('...')) return;

    const checkStatus = async () => {
      // Only show loading if we need to check DexScreener
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

// =============================================================================
// Main Component
// =============================================================================

export function TokenNamePanel({
  name = 'Token',
  subtitle = 'TOKEN',
  username = 'user',
  timeAgo = '0m ago',
  address = '000...EVRY',
  fullAddress,
  creatorWallet,
  creatorAvatar,
  creatorVerified,
  tokenImage,
  metaplexUri,
  onShare,
  showEditButton,
  onEditPage,
  graceModeEnabled,
  isDexPaid,
  likeCount = 0,
  hasLiked = false,
  onLike,
  backgroundColor,
  textColor,
  backgroundImage,
  backgroundSize,
  backgroundPosition,
  overlayColor,
  overlayOpacity,
  textBackgroundColor,
}: TokenNamePanelProps) {
  const dexPaidStatus = useDexPaidStatus(fullAddress, isDexPaid);
  const [copied, setCopied] = useState(false);
  // Measure if name + symbol fits in available space
  const { containerRef, measureRef, isOverflowing, hasMeasured } = useNameOverflow(name, subtitle);
  // Helper for text background style - apply when any custom background exists (image or color)
  const hasCustomBackground = backgroundImage || (backgroundColor && backgroundColor !== '#111114');
  const textBgStyle = hasCustomBackground ? {
    backgroundColor: `${textBackgroundColor || '#0c0c0e'}cc`,
  } : undefined;

  const handleCopyAddress = async () => {
    const addressToCopy = fullAddress || address;
    if (!addressToCopy) return;

    try {
      await navigator.clipboard.writeText(addressToCopy);
      setCopied(true);
      toast.success('Address copied!');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Failed to copy');
    }
  };

  const textStyle = textColor ? { color: textColor } : undefined;

  return (
    <div className="relative w-full rounded-2xl p-4 sm:p-4 lg:p-5">
      <PanelBackground
        backgroundColor={backgroundColor}
        backgroundImage={backgroundImage}
        backgroundSize={backgroundSize}
        backgroundPosition={backgroundPosition}
        overlayColor={overlayColor}
        overlayOpacity={overlayOpacity}
      />

      {/* Top right: Share + Edit + Like buttons */}
      <div className="absolute top-3 right-3 sm:top-4 sm:right-4 lg:top-5 lg:right-5 z-20 flex flex-col items-end gap-2">
        {/* Share and Edit row */}
        <div className="flex items-center gap-2">
          {/* Like button - hidden on mobile, shown on desktop */}
          <button
            onClick={onLike}
            className={cn(
              'hidden sm:flex items-center gap-1.5 px-4 h-9 rounded-full transition-all cursor-pointer',
              hasLiked
                ? 'bg-red-500/20 text-red-500 hover:bg-red-500/30'
                : hasCustomBackground
                  ? 'backdrop-blur-sm text-muted-foreground hover:opacity-80'
                  : 'bg-muted/80 backdrop-blur-sm text-muted-foreground hover:bg-muted'
            )}
            style={!hasLiked ? textBgStyle : undefined}
            title={hasLiked ? 'Unlike' : 'Like'}
          >
            <Heart className={cn('size-4', hasLiked && 'fill-current')} />
            {likeCount > 0 && (
              <span className="text-sm font-medium">{likeCount}</span>
            )}
          </button>

          <Button onClick={onShare} size="sm">
            Share
          </Button>
        </div>

        {/* Edit button - desktop only */}
        {showEditButton && onEditPage && (
          <Button
            onClick={onEditPage}
            size="sm"
            variant="secondary"
            className={cn(
              'hidden sm:flex',
              hasCustomBackground
                ? 'backdrop-blur-sm hover:opacity-80'
                : 'bg-muted/80 backdrop-blur-sm hover:bg-muted'
            )}
            style={textBgStyle}
          >
            <Edit2 className="size-3.5" />
            Edit
          </Button>
        )}

        {/* Like button - mobile only */}
        <button
          onClick={onLike}
          className={cn(
            'flex sm:hidden items-center gap-1.5 px-4 h-9 rounded-full transition-all cursor-pointer',
            hasLiked
              ? 'bg-red-500/20 text-red-500 hover:bg-red-500/30'
              : hasCustomBackground
                ? 'backdrop-blur-sm text-muted-foreground hover:opacity-80'
                : 'bg-muted/80 backdrop-blur-sm text-muted-foreground hover:bg-muted'
          )}
          style={!hasLiked ? textBgStyle : undefined}
          title={hasLiked ? 'Unlike' : 'Like'}
        >
          <Heart className={cn('size-4', hasLiked && 'fill-current')} />
          {likeCount > 0 && (
            <span className="text-sm font-medium">{likeCount}</span>
          )}
        </button>
      </div>

      <div className="relative z-10 flex items-center gap-3 sm:gap-4">
        {/* Left: Token info */}
        <div className="flex items-center flex-1 min-w-0 gap-3 sm:gap-4">
          <TokenAvatar name={name} subtitle={subtitle} tokenImage={tokenImage} metaplexUri={metaplexUri} />

          <div className="flex flex-col gap-1 sm:gap-1.5 min-w-0 flex-1">
            {/* Token name + symbol - constrained to avoid like/share buttons */}
            <div
              ref={containerRef}
              className={cn(
                'flex w-full max-w-[calc(100%-120px)] sm:max-w-[calc(100%-130px)]',
                isOverflowing ? 'flex-col gap-0.5' : 'flex-row items-center gap-1.5 sm:gap-2',
                hasCustomBackground && 'backdrop-blur-sm px-1.5 sm:px-2 py-0.5 rounded-md w-fit'
              )}
              style={textBgStyle}
            >
              {/* Hidden measurement div - measures name + symbol together */}
              <div
                ref={measureRef}
                className="absolute invisible pointer-events-none flex items-center gap-1.5 sm:gap-2 whitespace-nowrap"
                aria-hidden
              >
                <span className="font-semibold text-base sm:text-lg">{name}</span>
                <span className="text-xs sm:text-sm">{subtitle}</span>
              </div>

              <div className={cn('min-w-0 overflow-hidden', isOverflowing && 'w-full')}>
                {hasMeasured && isOverflowing ? (
                  <MarqueeText
                    text={name}
                    className="font-semibold text-base sm:text-lg"
                    style={textStyle}
                  />
                ) : (
                  <span
                    className="font-semibold text-base sm:text-lg whitespace-nowrap"
                    style={textStyle}
                  >
                    {name}
                  </span>
                )}
              </div>
              <span
                className="text-xs sm:text-sm text-muted-foreground shrink-0"
                style={textStyle}
              >
                {subtitle}
              </span>
            </div>

            {/* Creator + time row */}
            <div
              className={cn(
                'flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm text-muted-foreground',
                hasCustomBackground && 'backdrop-blur-sm px-1.5 sm:px-2 py-1 rounded-md w-fit'
              )}
              style={textBgStyle}
            >
              <img
                src={creatorAvatar || DEFAULT_AVATAR_URL}
                alt=""
                className="size-3.5 sm:size-4 rounded-full object-cover"
                onError={(e) => {
                  e.currentTarget.src = DEFAULT_AVATAR_URL;
                }}
              />
              {creatorWallet ? (
                <Link
                  href={`/profile/${username || creatorWallet}`}
                  className="hover:underline hover:text-foreground transition-colors truncate max-w-[80px] sm:max-w-none flex items-center gap-1"
                  style={textStyle}
                >
                  {username}
                  {creatorVerified && <VerifiedBadge size="sm" />}
                </Link>
              ) : (
                <span className="truncate max-w-[80px] sm:max-w-none flex items-center gap-1" style={textStyle}>
                  {username}
                  {creatorVerified && <VerifiedBadge size="sm" />}
                </span>
              )}
              <span className="text-muted-foreground/50 text-xs shrink-0">{timeAgo}</span>
            </div>

            {/* Address + dex + grace period row */}
            <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
              <button
                onClick={handleCopyAddress}
                className={cn(
                  'flex items-center gap-1 sm:gap-1.5 px-2 sm:px-2.5 py-1 rounded-full text-xs sm:text-sm transition-colors cursor-pointer text-white',
                  hasCustomBackground
                    ? 'backdrop-blur-sm hover:opacity-90'
                    : 'bg-muted hover:bg-muted/80'
                )}
                style={textBgStyle}
              >
                <span style={textStyle}>
                  {address && address.length > 8
                    ? `${address.slice(0, 4)}...${address.slice(-4)}`
                    : address}
                </span>
                {copied ? <Check className="size-3 sm:size-3.5 text-green-500" /> : <Copy className="size-3 sm:size-3.5" />}
              </button>
              <TooltipProvider>
                <DexStatusIndicator status={dexPaidStatus} hasBackgroundImage={!!hasCustomBackground} textBackgroundColor={textBackgroundColor} />
                {graceModeEnabled && (
                  <GracePeriodIndicator hasBackgroundImage={!!hasCustomBackground} textBackgroundColor={textBackgroundColor} />
                )}
              </TooltipProvider>
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}
