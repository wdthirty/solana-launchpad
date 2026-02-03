// TokenFeedTable Component
// Table-based token feed display
// Created: 2025-01-15

'use client';

import React, { useMemo, useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowUpDown } from 'lucide-react';
import { Triangle } from '@/components/ui/icons/triangle';
import { VerifiedBadge } from '@/components/ui/verified-badge';
import type { TokenWithCreator } from '@/lib/types';
import { formatMarketCap } from '@/lib/solana/jupiter-data-client';
import { getOptimizedImageUrl } from '@/lib/utils';

// X (Twitter) icon component
function XIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

// Globe icon for website
function GlobeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="M2 12h20" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  );
}

// Market cap cell with flash animation on value changes
function MarketCapCell({ marketCap }: { marketCap: number | null }) {
  const [flashState, setFlashState] = useState<'up' | 'down' | null>(null);
  const prevMarketCapRef = useRef<number | null>(marketCap);

  useEffect(() => {
    const prevMarketCap = prevMarketCapRef.current;

    if (prevMarketCap === null || marketCap === null) {
      prevMarketCapRef.current = marketCap;
      return;
    }

    if (marketCap > prevMarketCap) {
      setFlashState('up');
    } else if (marketCap < prevMarketCap) {
      setFlashState('down');
    }

    prevMarketCapRef.current = marketCap;

    const timeout = setTimeout(() => {
      setFlashState(null);
    }, 1000);

    return () => clearTimeout(timeout);
  }, [marketCap]);

  const flashClass = flashState === 'up'
    ? 'bg-primary/30 text-[#66f590] shadow-lg shadow-primary/20 px-1.5 py-0.5 rounded'
    : flashState === 'down'
    ? 'bg-[#eb002f]/30 text-[#ff6b6b] shadow-lg shadow-[#eb002f]/20 px-1.5 py-0.5 rounded'
    : 'text-foreground';

  return (
    <span className={`text-sm transition-all duration-300 ${flashClass}`}>
      {marketCap ? formatMarketCap(marketCap) : '-'}
    </span>
  );
}

interface TokenFeedTableProps {
  tokens: TokenWithCreator[];
  onRowClick?: (token: TokenWithCreator) => void;
}

type SortField = '24h_change' | 'market_cap' | 'volume_24h';
type SortDirection = 'asc' | 'desc';

export function TokenFeedTable({ tokens, onRowClick }: TokenFeedTableProps) {
  const router = useRouter();
  const [sortField, setSortField] = useState<SortField | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'desc' ? 'asc' : 'desc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  // Create a map of token address to market cap rank (1-indexed)
  const marketCapRanks = useMemo(() => {
    const sorted = [...tokens].sort((a, b) => (b.market_cap || 0) - (a.market_cap || 0));
    const ranks = new Map<string, number>();
    sorted.forEach((token, index) => {
      ranks.set(token.address, index + 1);
    });
    return ranks;
  }, [tokens]);

  const sortedTokens = useMemo(() => {
    if (!sortField) return tokens;

    return [...tokens].sort((a, b) => {
      let aVal: number = 0;
      let bVal: number = 0;

      switch (sortField) {
        case '24h_change':
          aVal = a.price_change_24h || 0;
          bVal = b.price_change_24h || 0;
          break;
        case 'market_cap':
          aVal = a.market_cap || 0;
          bVal = b.market_cap || 0;
          break;
        case 'volume_24h':
          aVal = a.volume_24h || 0;
          bVal = b.volume_24h || 0;
          break;
      }

      return sortDirection === 'desc' ? bVal - aVal : aVal - bVal;
    });
  }, [tokens, sortField, sortDirection]);

  const formatVolume = (volume: number | null) => {
    if (volume === null || volume === undefined) return '-';
    return formatMarketCap(volume);
  };

  const formatPercentage = (percent: number | null) => {
    if (percent === null || percent === undefined) return '-';
    const abs = Math.abs(percent);
    if (abs >= 1000000) {
      return `${(abs / 1000000).toFixed(1)}M%`;
    }
    if (abs >= 1000) {
      return `${(abs / 1000).toFixed(1)}K%`;
    }
    return `${abs.toFixed(2)}%`;
  };

  const SortButton = ({ field, children }: { field: SortField; children: React.ReactNode }) => (
    <button
      onClick={() => handleSort(field)}
      className="inline-flex items-center gap-1 hover:text-foreground transition-colors cursor-pointer justify-start w-full"
    >
      {children}
      <ArrowUpDown className={`w-3 h-3 flex-shrink-0 ${sortField === field ? 'text-primary' : ''}`} />
    </button>
  );

  return (
    <div className="w-full overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-border text-xs text-muted-foreground uppercase tracking-wider">
            <th className="text-left py-3 px-3 font-medium w-[5%]">#</th>
            <th className="text-left py-3 px-3 font-medium w-[25%]">TOKEN</th>
            <th className="text-left py-3 px-3 font-medium whitespace-nowrap w-[15%]">
              <SortButton field="24h_change">24H PRICE</SortButton>
            </th>
            <th className="text-left py-3 px-3 font-medium whitespace-nowrap w-[15%]">
              <SortButton field="market_cap">MARKET CAP</SortButton>
            </th>
            <th className="text-left py-3 px-3 font-medium whitespace-nowrap w-[15%]">
              <SortButton field="volume_24h">24H VOLUME</SortButton>
            </th>
            <th className="text-center py-3 px-3 font-medium w-[12%]">X</th>
            <th className="text-center py-3 px-3 font-medium w-[13%]">Website</th>
          </tr>
        </thead>
        <tbody>
          {sortedTokens.map((token, index) => {
            const priceChange = token.price_change_24h || 0;
            const isPositive = priceChange >= 0;
            const logo = token.metadata?.logo;
            const twitter = token.metadata?.twitter;
            const website = token.metadata?.website;

            return (
              <tr
                key={token.address}
                onClick={() => {
                  onRowClick?.(token);
                  router.push(`/token/${token.address}`);
                }}
                className="group border-b border-border/50 hover:bg-muted/30 transition-colors cursor-pointer"
              >
                {/* Rank (based on market cap) */}
                <td className="py-4 px-3 text-sm text-muted-foreground">
                  {marketCapRanks.get(token.address) || index + 1}
                </td>

                {/* Token */}
                <td className="py-4 px-3">
                  <div className="flex items-center gap-3">
                    {/* Token Logo */}
                    <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center flex-shrink-0 overflow-hidden">
                      {logo ? (
                        <img
                          src={getOptimizedImageUrl(logo, 40)}
                          alt={token.symbol || 'Token'}
                          className="w-full h-full object-cover"
                          loading="lazy"
                          onError={(e) => {
                            e.currentTarget.style.display = 'none';
                            const parent = e.currentTarget.parentElement;
                            if (parent) {
                              parent.innerHTML = `<span class="text-primary font-bold text-sm">${(token.symbol || token.name || '?').charAt(0).toUpperCase()}</span>`;
                            }
                          }}
                        />
                      ) : (
                        <span className="text-primary font-bold text-sm">
                          {(token.symbol || token.name || '?').charAt(0).toUpperCase()}
                        </span>
                      )}
                    </div>

                    {/* Token Info */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-foreground group-hover:text-primary transition-colors truncate">
                          {token.symbol || 'N/A'}
                        </span>
                        {token.is_verified && <VerifiedBadge size="sm" />}
                      </div>
                      <span className="text-xs text-muted-foreground truncate block">
                        {token.name || 'Unknown Token'}
                      </span>
                    </div>
                  </div>
                </td>

                {/* 24H Change */}
                <td className="py-4 px-3 text-left">
                  <span
                    className={`inline-flex items-center gap-1 text-sm font-medium ${isPositive ? 'text-primary' : 'text-[#eb002f]'}`}
                  >
                    <Triangle size={10} direction={isPositive ? 'up' : 'down'} className="flex-shrink-0" />
                    {formatPercentage(priceChange)}
                  </span>
                </td>

                {/* Market Cap */}
                <td className="py-4 px-3 text-left">
                  <MarketCapCell marketCap={token.market_cap} />
                </td>

                {/* 24H Volume */}
                <td className="py-4 px-3 text-left">
                  <span className="text-sm text-foreground">
                    {formatVolume(token.volume_24h)}
                  </span>
                </td>

                {/* Twitter/X */}
                <td className="py-4 px-3">
                  <div className="flex justify-center">
                    {twitter ? (
                      <a
                        href={twitter.startsWith('http') ? twitter : `https://twitter.com/${twitter.replace('@', '')}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {(() => {
                          const isCommunity = twitter.includes('/communities/') || twitter.includes('community');
                          if (isCommunity) {
                            const name = token.symbol || token.name || '';
                            return name.length > 12 ? `${name.slice(0, 12)}...` : name;
                          }
                          const username = twitter.startsWith('http')
                            ? twitter.split('/').pop() || ''
                            : twitter.replace('@', '');
                          return username.length > 12 ? `${username.slice(0, 12)}...` : username;
                        })()}
                        <XIcon className="w-3.5 h-3.5 flex-shrink-0 text-white" />
                      </a>
                    ) : (
                      <span className="text-muted-foreground/50">-</span>
                    )}
                  </div>
                </td>

                {/* Website */}
                <td className="py-4 px-3">
                  <div className="flex justify-center">
                    {website ? (
                      <a
                        href={website.startsWith('http') ? website : `https://${website}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex items-center justify-center w-8 h-8 rounded-full hover:bg-muted transition-colors"
                      >
                        <GlobeIcon className="w-4 h-4 text-foreground" />
                      </a>
                    ) : (
                      <span className="text-muted-foreground/50">-</span>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
