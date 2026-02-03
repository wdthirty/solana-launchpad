// TokenCard Component
// Displays individual token information
// Created: 2025-10-18

'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Triangle } from '@/components/ui/icons/triangle';
import { VerifiedBadge } from '@/components/ui/verified-badge';
import type { TokenWithCreator } from '@/lib/types';
import { formatMarketCap } from '@/lib/solana/jupiter-data-client';
import { GracePeriodBadge } from './GracePeriodBadge';
import { FeeTier } from '@/lib/config/dbc-configs';
import { isGracePeriodActive } from '@/lib/utils/grace-period';
import { getOptimizedImageUrl } from '@/lib/utils';

// Simple in-memory cache for fetched logos (shared across all TokenCard instances)
const logoCache = new Map<string, string | null>();
const pendingFetches = new Map<string, Promise<string | null>>();

/**
 * Optimized token card image with CDN resizing, skeleton loading, and fallback
 * Supports priority loading for above-the-fold images
 */
const TokenCardImage = React.memo(function TokenCardImage({
  src,
  alt,
  fallback,
  priority = false,
}: {
  src: string;
  alt: string;
  fallback: string;
  priority?: boolean;
}) {
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [cdnFailed, setCdnFailed] = useState(false);

  // Use 128px (largest size) for CDN - will be displayed at 96px or 128px
  const optimizedSrc = useMemo(() => getOptimizedImageUrl(src, 128), [src]);
  const imageSrc = cdnFailed ? src : optimizedSrc;

  if (hasError) {
    return (
      <div className="w-24 h-24 sm:w-32 sm:h-32 rounded-lg flex items-center justify-center flex-shrink-0 bg-muted">
        <span className="text-primary font-bold text-2xl sm:text-3xl">{fallback}</span>
      </div>
    );
  }

  return (
    <div className="w-24 h-24 sm:w-32 sm:h-32 rounded-lg flex-shrink-0 overflow-hidden relative bg-muted">
      {isLoading && (
        <div className="absolute inset-0 bg-muted animate-pulse" />
      )}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={imageSrc}
        alt={alt}
        className={`w-full h-full object-cover transition-opacity duration-200 ${isLoading ? 'opacity-0' : 'opacity-100'}`}
        onLoad={() => setIsLoading(false)}
        onError={() => {
          if (!cdnFailed && optimizedSrc !== src) {
            setCdnFailed(true);
            setIsLoading(true);
          } else {
            setHasError(true);
          }
        }}
        loading={priority ? "eager" : "lazy"}
        decoding={priority ? "sync" : "async"}
        fetchPriority={priority ? "high" : "auto"}
        draggable={false}
      />
    </div>
  );
});

export interface TokenCardProps {
  token: TokenWithCreator;
  showAnimation?: boolean;
  disableHoverScale?: boolean;
  href?: string; // Optional custom href to override default /token/[address]
  onClick?: () => void; // Optional click handler to override default navigation
  priority?: boolean; // Priority loading for above-the-fold images
}

/**
 * TokenCard component - displays token information
 * Memoized to prevent unnecessary re-renders
 */
export const TokenCard = React.memo(function TokenCard({ token, showAnimation = false, disableHoverScale = false, href, onClick, priority = false }: TokenCardProps) {
  const hasMarketCap = token.market_cap !== null && token.market_cap !== undefined;
  const priceChange = token.price_change_24h || 0;
  const isPositive = priceChange >= 0;

  // Track new token animation - use expanded state instead of badge
  const [isExpanded, setIsExpanded] = useState(false);
  const hasAnimatedRef = useRef(false);

  // Lazy logo fetching - fetch from metaplex_uri if no logo exists
  const [fetchedLogo, setFetchedLogo] = useState<string | null>(null);
  const logoToShow = token.metadata?.logo || fetchedLogo;

  useEffect(() => {
    const metaplexUri = token.metadata?.metaplex_uri;
    // Skip if we already have a logo or no URI to fetch from
    if (token.metadata?.logo || !metaplexUri) return;

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
  }, [token.metadata?.logo, token.metadata?.metaplex_uri]);

  // Track market cap updates for flash animation
  const [isFlashing, setIsFlashing] = useState(false);
  const [flashDirection, setFlashDirection] = useState<'up' | 'down'>('up');
  const prevMarketCapRef = useRef<number | null>(token.market_cap);
  const prevUpdatedAtRef = useRef<string>(token.updated_at);

  // Trigger expansion animation when new token appears (only once)
  useEffect(() => {
    if (showAnimation && !hasAnimatedRef.current) {
      hasAnimatedRef.current = true;

      // Start expansion immediately
      setIsExpanded(true);

      // Collapse immediately after expansion completes (300ms expansion duration)
      const collapseTimer = setTimeout(() => {
        setIsExpanded(false);
      }, 300); // Match the expansion duration

      return () => {
        clearTimeout(collapseTimer);
      };
    }
  }, [showAnimation]);

  // Detect when market cap changes from Ably updates
  useEffect(() => {
    const currentMarketCap = token.market_cap;
    const prevMarketCap = prevMarketCapRef.current;
    const hasUpdated = token.updated_at !== prevUpdatedAtRef.current;

    // Only flash if the update is recent (within last 2 seconds) and market cap changed
    if (hasUpdated && currentMarketCap !== null && prevMarketCap !== null && currentMarketCap !== prevMarketCap) {
      const direction = currentMarketCap > prevMarketCap ? 'up' : 'down';
      setFlashDirection(direction);
      setIsFlashing(true);

      // Remove flash after 1 second
      const timer = setTimeout(() => {
        setIsFlashing(false);
      }, 1000);

      prevMarketCapRef.current = currentMarketCap;
      prevUpdatedAtRef.current = token.updated_at;

      return () => clearTimeout(timer);
    } else if (hasUpdated) {
      // Update refs even if no flash
      prevMarketCapRef.current = currentMarketCap;
      prevUpdatedAtRef.current = token.updated_at;
    }
  }, [token.market_cap, token.updated_at]);

  // Format price
  const formatPrice = (price: number | null) => {
    if (price === null || price === undefined) return 'N/A';
    if (price < 0.01) return `$${price.toFixed(6)}`;
    if (price < 1) return `$${price.toFixed(4)}`;
    return `$${price.toFixed(2)}`;
  };

  // Format percentage with K/M suffix for large values
  const formatPercentage = (percent: number) => {
    const abs = Math.abs(percent);
    if (abs >= 1000000) {
      return `${(percent / 1000000).toFixed(1)}M%`;
    }
    if (abs >= 1000) {
      return `${(percent / 1000).toFixed(1)}K%`;
    }
    return `${abs.toFixed(2)}%`;
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

  // Memoize expensive calculations
  const hasGracePeriod = useMemo(
    () => token.grace_mode_enabled &&
      token.launch_timestamp &&
      token.fee_tier_bp !== null &&
      isGracePeriodActive(new Date(token.launch_timestamp).getTime()),
    [token.grace_mode_enabled, token.launch_timestamp, token.fee_tier_bp]
  );

  // Bonding curve progress (0-100)
  const bondingProgress = token.bonding_curve_progress ?? 0;
  const isMigrated = token.is_migrated || false;

  // Memoize clamped progress value
  // When migrated, show 100% to display full gold bar
  const clampedProgress = useMemo(
    () => {
      if (isMigrated) return 100;
      return Math.min(100, Math.max(0, bondingProgress));
    },
    [bondingProgress, isMigrated]
  );

  const cardContent = (
    <div
      className={`
        relative cursor-pointer rounded-lg
        transition-all
        ${isExpanded ? 'duration-300 ease-out scale-110 z-50' : `duration-500 ease-in-out scale-100 ${disableHoverScale ? '' : 'hover:scale-105'}`}
      `}
    >
      <div className="relative flex gap-3 items-start min-w-0 overflow-hidden z-0">
        {/* Token Logo */}
        {logoToShow ? (
          <TokenCardImage src={logoToShow} alt={`${token.name || 'Token'} logo`} fallback={(token.symbol || token.name || '?').charAt(0).toUpperCase()} priority={priority} />
        ) : (
          <div className="w-24 h-24 sm:w-32 sm:h-32 rounded-lg flex items-center justify-center flex-shrink-0 bg-muted">
            <span className="text-primary font-bold text-2xl sm:text-3xl">
              {(token.symbol || token.name || '?').charAt(0).toUpperCase()}
            </span>
          </div>
        )}

        {/* Token Info */}
        <div className="relative flex-1 min-w-0 overflow-hidden z-0">
          {/* Token Name */}
          <h3 className="text-base font-bold text-foreground truncate mb-0.5">
            {token.name || 'Unknown Token'}
          </h3>

          {/* Ticker */}
          <p className="text-sm text-foreground mb-2">
            {token.symbol || 'N/A'}
          </p>

          {/* Creator Info */}
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-2 flex-wrap">
            {token.is_verified && (
              <svg className="w-3 h-3 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
            )}
            {token.creator_wallet && (
              <span
                className="hover:underline font-mono relative z-10 flex items-center gap-1.5 cursor-pointer"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  window.location.href = `/profile/${token.creator?.username || token.creator_wallet}`;
                }}
              >
                {token.creator?.avatar && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={getOptimizedImageUrl(token.creator.avatar, 16) || token.creator.avatar}
                    alt={token.creator.username || 'Creator'}
                    className="w-4 h-4 rounded-full object-cover"
                    loading="lazy"
                    decoding="async"
                  />
                )}
                <span>{token.creator?.username || token.creator_wallet.slice(0, 6)}</span>
                {token.creator?.verified && <VerifiedBadge size="sm" />}
              </span>
            )}
            <span>{formatTimeAgo(token.created_at)}</span>
            {hasGracePeriod && (
              <GracePeriodBadge
                launchTimestamp={token.launch_timestamp!}
                feeTier={token.fee_tier_bp as FeeTier}
              />
            )}
          </div>

          {/* Market Cap, Bonding Curve Progress & Price Change */}
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <span
              className={`
                text-xs font-semibold whitespace-nowrap transition-all duration-300
                ${isFlashing
                  ? flashDirection === 'up'
                    ? 'bg-green-500/30 text-green-300 shadow-lg shadow-green-500/20 px-1.5 py-0.5 rounded'
                    : 'bg-red-500/30 text-red-300 shadow-lg shadow-red-500/20 px-1.5 py-0.5 rounded'
                  : 'text-foreground'
                }
              `}
            >
              MC {hasMarketCap ? formatMarketCap(token.market_cap!) : <span className="text-muted-foreground">-</span>}
            </span>

            {/* Bonding Curve Progress Bar */}
            <div className="flex-1 min-w-[60px] max-w-[100px]">
              <div className="w-full rounded-md overflow-hidden bg-muted border border-border" style={{ height: '10px' }}>
                <div
                  className="h-full transition-all duration-500 ease-in-out"
                  style={{
                    width: `${clampedProgress}%`,
                    backgroundColor: isMigrated ? '#FFD700' : '#22c55e'
                  }}
                />
              </div>
            </div>

            <div
              className={`
                flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-semibold whitespace-nowrap overflow-visible
                ${isPositive
                  ? 'bg-green-500/10 text-green-400'
                  : 'bg-red-500/10 text-red-400'
                }
              `}
            >
              <Triangle size={10} direction={isPositive ? "up" : "down"} className="flex-shrink-0" />
              <span>{formatPercentage(priceChange)}</span>
            </div>
          </div>

          {/* Description */}
          {token.metadata?.description && (
            <p className="text-xs text-muted-foreground line-clamp-2 mb-2">
              {token.metadata.description}
            </p>
          )}
        </div>
      </div>
    </div>
  );

  // Use custom href if provided, otherwise default to token page
  const linkHref = href || `/token/${token.address}`;

  // If onClick is provided, call it before navigating (for scroll state saving)
  const handleClick = onClick ? () => {
    onClick();
    // Let the Link handle navigation normally
  } : undefined;

  return (
    <Link href={linkHref} className="block relative isolate" onClick={handleClick}>
      {cardContent}
    </Link>
  );
}, (prevProps, nextProps) => {
  // Custom comparison function - return true if props are equal (skip re-render)
  // Only re-render if these specific values change
  const tokenEqual =
    prevProps.token.address === nextProps.token.address &&
    prevProps.token.current_price === nextProps.token.current_price &&
    prevProps.token.market_cap === nextProps.token.market_cap &&
    prevProps.token.price_change_24h === nextProps.token.price_change_24h &&
    prevProps.token.volume_24h === nextProps.token.volume_24h &&
    prevProps.token.bonding_curve_progress === nextProps.token.bonding_curve_progress &&
    prevProps.token.is_migrated === nextProps.token.is_migrated &&
    prevProps.token.updated_at === nextProps.token.updated_at;

  const propsEqual =
    tokenEqual &&
    prevProps.showAnimation === nextProps.showAnimation &&
    prevProps.disableHoverScale === nextProps.disableHoverScale &&
    prevProps.href === nextProps.href &&
    prevProps.onClick === nextProps.onClick &&
    prevProps.priority === nextProps.priority;

  return propsEqual;
});
