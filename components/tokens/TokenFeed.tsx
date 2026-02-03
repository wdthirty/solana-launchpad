// TokenFeed Component
// Main token feed with real-time updates and pagination
// Created: 2025-10-18

'use client';

import { useEffect, useState, useRef } from 'react';
import { useTokenFeed } from '@/hooks/use-token-feed';
import { TokenFeedTable } from './TokenFeedTable';
import { Pagination } from './Pagination';

// Storage keys for scroll restoration
const SCROLL_POSITION_KEY = 'token-feed-scroll';
const PAGE_KEY = 'token-feed-page';

// Save scroll position and page before navigating away
export const saveScrollState = (page: number): void => {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(SCROLL_POSITION_KEY, String(window.scrollY));
    sessionStorage.setItem(PAGE_KEY, String(page));
  } catch {
    // Silent fail
  }
};

// Get saved scroll state
const getSavedScrollState = (): { scrollY: number; page: number } | null => {
  if (typeof window === 'undefined') return null;
  try {
    const scrollY = sessionStorage.getItem(SCROLL_POSITION_KEY);
    const page = sessionStorage.getItem(PAGE_KEY);
    if (scrollY && page) {
      // Clear after reading (one-time restore)
      sessionStorage.removeItem(SCROLL_POSITION_KEY);
      sessionStorage.removeItem(PAGE_KEY);
      return { scrollY: parseInt(scrollY, 10), page: parseInt(page, 10) };
    }
  } catch {
    // Silent fail
  }
  return null;
};

export interface TokenFeedProps {
  enableRealtime?: boolean;
}

/**
 * TokenFeed component - displays paginated table of tokens with real-time updates
 * Uses the default feed (sorted by market cap)
 */
export function TokenFeed({
  enableRealtime = true,
}: TokenFeedProps) {
  // Scroll restoration state - read synchronously on initial render
  const scrollRestoredRef = useRef(false);
  const [savedScrollState] = useState(() => getSavedScrollState());

  // Get initial page from saved state (for back navigation)
  const initialPage = savedScrollState?.page || 1;

  const {
    tokens,
    pagination,
    isLoading,
    error,
    currentPage,
    goToPage,
    refresh,
  } = useTokenFeed({
    category: 'default',
    limit: 25,
    enableRealtime,
    initialPage,
  });

  // Restore scroll position after tokens load (when navigating back)
  useEffect(() => {
    if (
      !scrollRestoredRef.current &&
      savedScrollState &&
      tokens.length > 0 &&
      !isLoading
    ) {
      scrollRestoredRef.current = true;
      // Use requestAnimationFrame to ensure DOM is updated
      requestAnimationFrame(() => {
        window.scrollTo(0, savedScrollState.scrollY);
      });
    }
  }, [tokens, isLoading, savedScrollState]);

  // Listen for Ably reconnection after inactivity and refresh feed
  useEffect(() => {
    const handleReconnect = () => {
      refresh();
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('ably-reconnected-after-inactivity', handleReconnect);
    }

    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('ably-reconnected-after-inactivity', handleReconnect);
      }
    };
  }, [refresh]);

  return (
    <div className="w-full max-w-5xl mx-auto">
      {/* Error State */}
        {error && (
          <div className="flex flex-col items-center justify-center py-16 px-4">
            <div className="text-4xl mb-4">😔</div>
            <h3 className="text-lg font-medium text-foreground mb-2">Unable to load tokens</h3>
            <p className="text-sm text-muted-foreground text-center max-w-md">
              We&apos;re having trouble connecting to our servers. Please try again in a moment.
            </p>
          </div>
        )}

        {/* Loading State - table skeleton */}
        {isLoading && tokens.length === 0 && (
          <div className="w-full overflow-x-auto relative">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border text-xs text-muted-foreground uppercase tracking-wider">
                  <th className="text-left py-3 px-3 font-medium w-[5%]">#</th>
                  <th className="text-left py-3 px-3 font-medium w-[25%]">TOKEN</th>
                  <th className="text-left py-3 px-3 font-medium whitespace-nowrap w-[15%]">24H PRICE</th>
                  <th className="text-left py-3 px-3 font-medium whitespace-nowrap w-[15%]">MARKET CAP</th>
                  <th className="text-left py-3 px-3 font-medium whitespace-nowrap w-[15%]">24H VOL</th>
                  <th className="text-center py-3 px-3 font-medium w-[12%]">X</th>
                  <th className="text-center py-3 px-3 font-medium w-[13%]">WEBSITE</th>
                </tr>
              </thead>
              <tbody>
                {/* Show 6 rows for height < 850px, 12 rows for height >= 850px */}
                {[...Array(12)].map((_, i) => (
                  <tr key={`skeleton-${i}`} className={`border-b border-border/50 ${i >= 6 ? 'skeleton-tall-row' : ''}`}>
                    {/* Rank */}
                    <td className="py-4 px-3 text-sm text-muted-foreground">
                      <div className="w-4 h-5 bg-muted rounded animate-pulse" />
                    </td>

                    {/* Token */}
                    <td className="py-4 px-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-muted animate-pulse flex-shrink-0" />
                        <div className="min-w-0 flex-1">
                          <div className="w-14 h-5 bg-muted rounded animate-pulse mb-1" />
                          <div className="w-24 h-4 bg-muted rounded animate-pulse" />
                        </div>
                      </div>
                    </td>

                    {/* 24H Change */}
                    <td className="py-4 px-3 text-left">
                      <div className="w-16 h-5 bg-muted rounded animate-pulse" />
                    </td>

                    {/* Market Cap */}
                    <td className="py-4 px-3 text-left">
                      <div className="w-20 h-5 bg-muted rounded animate-pulse" />
                    </td>

                    {/* 24H Volume */}
                    <td className="py-4 px-3 text-left">
                      <div className="w-16 h-5 bg-muted rounded animate-pulse" />
                    </td>

                    {/* Twitter/X */}
                    <td className="py-4 px-3">
                      <div className="flex justify-center">
                        <div className="w-20 h-5 bg-muted rounded animate-pulse" />
                      </div>
                    </td>

                    {/* Website */}
                    <td className="py-4 px-3">
                      <div className="flex justify-center">
                        <div className="w-8 h-8 rounded-full bg-muted animate-pulse" />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-background to-transparent pointer-events-none" />
          </div>
        )}

        {/* Empty State */}
        {!isLoading && tokens.length === 0 && !error && (
          <div className="text-center py-16">
            <h3 className="typo-title font-semibold text-foreground mb-2">
              No tokens found
            </h3>
            <p className="text-muted-foreground typo-body">
              Tokens will appear here as they are created
            </p>
          </div>
        )}

        {/* Token Table */}
        {tokens.length > 0 && (
          <>
            <TokenFeedTable
              tokens={tokens}
              onRowClick={() => saveScrollState(currentPage)}
            />

            {/* Pagination */}
            {pagination && pagination.totalPages > 1 && (
              <div className="mt-8">
                <Pagination
                  currentPage={currentPage}
                  totalPages={pagination.totalPages}
                  onPageChange={goToPage}
                />
              </div>
            )}
          </>
        )}
    </div>
  );
}
