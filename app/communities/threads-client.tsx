'use client';

import { useState, useMemo } from 'react';
import { MessageSquare } from 'lucide-react';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { TokenImage } from '@/components/TokenImage';
import { Pagination } from '@/components/tokens/Pagination';

type ThreadFilter = 'featured' | 'latest' | 'newComments';

const ITEMS_PER_PAGE = 24; // 6 rows * 4 columns

interface TokenWithThreads {
  address: string;
  thread_count: number;
  last_comment_time: string | null;
  latest_thread_created_at?: string;
  featured_score?: number;
  name?: string;
  symbol?: string;
  creator_wallet?: string;
  created_at?: string;
  current_price?: number;
  market_cap?: number;
  volume_24h?: number;
  price_change_24h?: number;
  metadata?: any;
  creator?: any;
}

interface Thread {
  id: string;
  title: string;
  description: string;
  author: any;
  created_at: string;
  slug: string;
  token_address: string;
  pageId: string | null;
  commentCount: number;
  metadata?: {
    image?: string;
    websiteLink?: string;
  };
}

interface ThreadsPageClientProps {
  initialTokensByProject: TokenWithThreads[];
  initialAllThreads: Thread[];
}

// Format market cap for display
function formatMarketCap(value: number | null | undefined): string {
  if (!value) return '-';
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value.toFixed(0)}`;
}

export function ThreadsPageClient({
  initialTokensByProject,
}: ThreadsPageClientProps) {
  const [filter, setFilter] = useState<ThreadFilter>('featured');
  const [currentPage, setCurrentPage] = useState(1);

  // Sort tokens client-side based on filter (data already loaded from server)
  const sortedTokens = useMemo(() => {
    const tokens = [...initialTokensByProject];

    switch (filter) {
      case 'featured':
        // Use pre-computed featured_score from server
        return tokens.sort((a, b) => (b.featured_score || 0) - (a.featured_score || 0));
      case 'latest':
        return tokens.sort((a, b) => {
          const dateA = a.latest_thread_created_at ? new Date(a.latest_thread_created_at).getTime() : 0;
          const dateB = b.latest_thread_created_at ? new Date(b.latest_thread_created_at).getTime() : 0;
          return dateB - dateA;
        });
      case 'newComments':
        return tokens.sort((a, b) => {
          if (!a.last_comment_time && !b.last_comment_time) return 0;
          if (!a.last_comment_time) return 1;
          if (!b.last_comment_time) return -1;
          return new Date(b.last_comment_time).getTime() - new Date(a.last_comment_time).getTime();
        });
      default:
        return tokens;
    }
  }, [initialTokensByProject, filter]);

  // Reset to page 1 when filter changes
  const handleFilterChange = (newFilter: ThreadFilter) => {
    setFilter(newFilter);
    setCurrentPage(1);
  };

  // Pagination calculations
  const totalPages = Math.ceil(sortedTokens.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const endIndex = startIndex + ITEMS_PER_PAGE;
  const paginatedTokens = sortedTokens.slice(startIndex, endIndex);

  return (
    <div className="min-h-screen">
      <div className="flex-1 p-4 md:p-6 lg:p-8 overflow-auto">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-2xl font-bold mb-1">Communities</h1>
          <p className="text-muted-foreground text-sm mb-6">
            Browse token communities
          </p>

          {/* Filter Buttons */}
          <div className="flex items-center gap-1.5 mb-6 flex-wrap">
            <button
              onClick={() => handleFilterChange('featured')}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors cursor-pointer ${
                filter === 'featured'
                  ? 'ring-2 ring-inset ring-primary text-foreground'
                  : 'bg-muted text-muted-foreground hover:text-foreground'
              }`}
            >
              Featured
            </button>
            <button
              onClick={() => handleFilterChange('latest')}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors cursor-pointer ${
                filter === 'latest'
                  ? 'ring-2 ring-inset ring-primary text-foreground'
                  : 'bg-muted text-muted-foreground hover:text-foreground'
              }`}
            >
              Latest
            </button>
            <button
              onClick={() => handleFilterChange('newComments')}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors cursor-pointer ${
                filter === 'newComments'
                  ? 'ring-2 ring-inset ring-primary text-foreground'
                  : 'bg-muted text-muted-foreground hover:text-foreground'
              }`}
            >
              New Comments
            </button>
          </div>

          {sortedTokens.length === 0 ? (
            <Card className="bg-[#111114] border-border/50">
              <div className="text-center py-12">
                <MessageSquare className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                <p className="text-muted-foreground">No communities found</p>
              </div>
            </Card>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {paginatedTokens.map((token, index) => (
                  <Link
                    key={token.address}
                    href={`/communities/${token.address}`}
                  >
                    <Card className="bg-[#111114] border-border/50 hover:border-primary transition-all duration-500 ease-in-out hover:scale-105 cursor-pointer shadow-none">
                      <div className="flex items-center gap-3 px-4">
                      <span className="text-white text-sm w-5 flex-shrink-0 -mr-2">
                        {startIndex + index + 1}
                      </span>
                      <TokenImage
                        src={token.metadata?.logo}
                        alt={token.symbol || 'Token'}
                        fallbackText={token.symbol?.slice(0, 2).toUpperCase() || token.address.slice(0, 2).toUpperCase()}
                        size={40}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm truncate">
                          {token.symbol || token.name || token.address.slice(0, 8)}
                        </div>
                        <div className="text-muted-foreground text-xs truncate">
                          {token.name || 'Unnamed token'}
                        </div>
                        <div className="text-muted-foreground text-xs">
                          {token.thread_count} {token.thread_count === 1 ? 'thread' : 'threads'}
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div className="font-medium text-sm">
                          {formatMarketCap(token.market_cap)}
                        </div>
                      </div>
                      </div>
                    </Card>
                  </Link>
                ))}
              </div>

              {/* Pagination - only show if there are more items than fit on one page */}
              {sortedTokens.length > ITEMS_PER_PAGE && (
                <div className="mt-4 md:mt-8">
                  <Pagination
                    currentPage={currentPage}
                    totalPages={totalPages}
                    onPageChange={setCurrentPage}
                  />
                </div>
              )}

            </>
          )}
        </div>
      </div>
    </div>
  );
}
